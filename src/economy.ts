// src/economy.ts — Phase 25: Loot & Economy
//
// Item value, equipment degradation, drop resolution, and trade evaluation.
// Composes with the equipment, medical, and arena systems without modifying them.
//
// No kernel import — pure data-management module.

import type { Q }                   from "./units.js";
import { SCALE, q, clampQ, qMul }   from "./units.js";
import type { Weapon, Armour, RangedWeapon, Item } from "./equipment.js";
import type { MedicalResource }     from "./downtime.js";
import type { Entity }              from "./sim/entity.js";
import { eventSeed }                from "./sim/seeds.js";
import { makeRng }                  from "./rng.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ItemValue {
  itemId:       string;
  baseValue:    number;   // cost units (same scale as MedicalResource.costUnits)
  condition_Q:  Q;        // q(1.0) = new; q(0) = worthless debris
  sellFraction: number;   // fraction of baseValue a vendor pays (0.0–1.0)
}

export interface DropTable {
  guaranteed:    string[];
  probabilistic: Array<{ itemId: string; chance_Q: Q }>;
}

export interface TradeOffer {
  give:  Array<{ itemId: string; count: number; unitValue: number }>;
  want:  Array<{ itemId: string; count: number; unitValue: number }>;
}

export interface TradeEvaluation {
  /** Positive = advantageous for the accepting party. */
  netValue: number;
  /** True when the accepting party has all "want" items in sufficient quantity. */
  feasible: boolean;
}

export interface DurabilityValuePolicy {
  /**
   * Minimum retained value fraction even at zero condition.
   * Useful for salvage economies.
   */
  salvageFloorFraction?: number;
  /**
   * Curvature applied to condition in [0, 1].
   * - >1 discounts damaged gear harder.
   * - <1 is more forgiving to worn gear.
   */
  conditionExponent?: number;
}

export interface ItemizedCount {
  itemId: string;
  count: number;
}

export interface DropResolution {
  dropped: string[];
  guaranteed: string[];
  probabilistic: string[];
  preventedByState: boolean;
  source: "dead" | "incapacitated" | "none";
}

export interface TradeInventorySnapshot {
  ownedCount: number;
  shortageCount: number;
  entryUnitValue: number;
  offerUnitValue: number;
}

export interface TradeEvaluationDetailed extends TradeEvaluation {
  giveValue: number;
  wantValue: number;
  shortages: Array<{ itemId: string; missingCount: number }>;
  snapshots: Map<string, TradeInventorySnapshot>;
}

export interface EconomyHostReport {
  label: string;
  totals: {
    grossValue: number;
    netValue: number;
    lineCount: number;
  };
  lines: Array<{
    itemId: string;
    count: number;
    unitValue: number;
    totalValue: number;
  }>;
  tags: string[];
}

/**
 * Campaign-level item inventory: maps itemId → { count, unitValue }.
 * `unitValue` is in cost units; used by totalInventoryValue.
 */
export type ItemInventory = Map<string, { count: number; unitValue: number }>;

export interface WearResult {
  wear_Q:        Q;       // updated cumulative wear
  broke:         boolean; // true when wear_Q reaches q(1.0)
  fumble:        boolean; // true when a fumble roll triggers at wear ≥ WEAR_FUMBLE_THRESHOLD
  penaltyActive: boolean; // true when wear ≥ WEAR_PENALTY_THRESHOLD (−5% effective mass)
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Base wear increment at full intensity (q(1.0) per strike). */
export const WEAR_BASE: Q                 = q(0.001);
/** Wear threshold at which a −5% effective-mass penalty begins. */
export const WEAR_PENALTY_THRESHOLD: Q    = q(0.30);
/** Wear threshold at which a 20% fumble chance triggers. */
export const WEAR_FUMBLE_THRESHOLD: Q     = q(0.70);

const FUMBLE_CHANCE_Q                     = q(0.20);  // 20%
const DEFAULT_SELL_FRACTION               = 0.40;     // weapons/armour
const MEDICAL_SELL_FRACTION               = 0.50;
const DEFAULT_DURABILITY_VALUE_POLICY: Required<DurabilityValuePolicy> = {
  salvageFloorFraction: 0.05,
  conditionExponent: 1.35,
};

// ── computeItemValue ──────────────────────────────────────────────────────────

/**
 * Derive economic metadata for any item or medical resource.
 *
 * `wear_Q` is the caller's current wear value for the item.
 *   - For melee weapons: use `weapon.wear_Q ?? q(0)`.
 *   - For armour: derive via `armourConditionQ(resist_J, resistRemaining_J)`.
 *   - Omit (defaults to `q(0)`) for consumables or new items.
 *
 * `condition_Q = q(1.0) − wear_Q`, clamped to [0, SCALE.Q].
 */
export function computeItemValue(
  item:   Item | MedicalResource,
  wear_Q: Q = q(0) as Q,
): ItemValue {
  // MedicalResource: identified by `costUnits` presence
  if ("costUnits" in item) {
    const med = item as MedicalResource;
    return {
      itemId:       med.id,
      baseValue:    med.costUnits,
      condition_Q:  q(1.0),           // consumables don't degrade
      sellFraction: MEDICAL_SELL_FRACTION,
    };
  }

  const it = item as Item;
  const condition_Q = clampQ(SCALE.Q - wear_Q, 0, SCALE.Q) as Q;

  if (it.kind === "weapon") {
    const w = it as Weapon;
    // ~10 cost units per kg, plus reach bonus
    const massUnits  = Math.floor((w.mass_kg / SCALE.kg) * 10);
    const reachBonus = w.reach_m ? Math.floor((w.reach_m / SCALE.m) * 5) : 0;
    return { itemId: w.id, baseValue: massUnits + reachBonus, condition_Q, sellFraction: DEFAULT_SELL_FRACTION };
  }

  if (it.kind === "armour") {
    const a = it as Armour;
    // ~0.4 cost units per joule of base resist
    const base = Math.floor(a.resist_J * 0.4);
    return { itemId: a.id, baseValue: base, condition_Q, sellFraction: DEFAULT_SELL_FRACTION };
  }

  if (it.kind === "ranged") {
    const r = it as RangedWeapon;
    const massUnits = Math.floor((r.mass_kg / SCALE.kg) * 10);
    return { itemId: r.id, baseValue: massUnits + 5, condition_Q, sellFraction: DEFAULT_SELL_FRACTION };
  }

  // Shield / Gear / Exoskeleton / Sensor — fallback
  return { itemId: it.id, baseValue: Math.floor(it.mass_kg / SCALE.kg * 8), condition_Q: q(1.0), sellFraction: DEFAULT_SELL_FRACTION };
}

/**
 * Convert armour state to condition fraction.
 *
 * ```
 * condition = resistRemaining_J / resist_J
 * ```
 *
 * The result can be converted to wear via `conditionToWearQ`.
 */
export function armourConditionQ(resist_J: number, resistRemaining_J: number): Q {
  if (resist_J <= 0) return q(0);
  const fraction = Math.trunc((resistRemaining_J * SCALE.Q) / resist_J);
  return clampQ(fraction, 0, SCALE.Q) as Q;
}

/** Convert condition to wear (`wear = 1 - condition`) in fixed-point space. */
export function conditionToWearQ(condition_Q: Q): Q {
  return clampQ(SCALE.Q - condition_Q, 0, SCALE.Q) as Q;
}

/**
 * Convert an ItemValue into market-usable unit values.
 *
 * This keeps `computeItemValue` stable and lets hosts pick stricter/looser
 * durability discounting.
 */
export function toMarketValue(
  itemValue: ItemValue,
  policy: DurabilityValuePolicy = DEFAULT_DURABILITY_VALUE_POLICY,
): { buyValue: number; sellValue: number; conditionMultiplier: number } {
  const configured = {
    salvageFloorFraction: policy.salvageFloorFraction ?? DEFAULT_DURABILITY_VALUE_POLICY.salvageFloorFraction,
    conditionExponent: policy.conditionExponent ?? DEFAULT_DURABILITY_VALUE_POLICY.conditionExponent,
  };

  const condition = Math.max(0, Math.min(1, itemValue.condition_Q / SCALE.Q));
  const curved = Math.pow(condition, Math.max(0.01, configured.conditionExponent));
  const multiplier = configured.salvageFloorFraction + (1 - configured.salvageFloorFraction) * curved;

  const buyValue = Math.max(0, Math.round(itemValue.baseValue * multiplier));
  const sellValue = Math.max(0, Math.round(buyValue * itemValue.sellFraction));
  return { buyValue, sellValue, conditionMultiplier: multiplier };
}

// ── applyWear ─────────────────────────────────────────────────────────────────

/**
 * Apply one strike's worth of use-wear to a melee weapon.
 *
 * @param weapon          - The weapon being used (reads `wear_Q` field if present).
 * @param actionIntensity_Q - Strike intensity (q(0)..q(1.0)); higher = more wear.
 *                           Use q(1.0) for strikes against hard targets (plate armour),
 *                           lower values for soft/unarmoured opponents.
 * @param seed            - Optional entropy seed for the deterministic fumble roll.
 *                          Must be supplied when checking fumble; otherwise fumble = false.
 *
 * The returned `wear_Q` should be written back to `weapon.wear_Q` by the caller.
 */
export function applyWear(weapon: Weapon, actionIntensity_Q: Q, seed?: number): WearResult {
  const current = (weapon.wear_Q ?? q(0)) as Q;

  // Increment proportional to strike intensity (q(0.001) × intensity)
  const increment = Math.max(1, Math.trunc(qMul(WEAR_BASE, actionIntensity_Q)));
  const newWear   = clampQ(current + increment, 0, SCALE.Q) as Q;

  const broke        = newWear >= SCALE.Q;
  const penaltyActive = newWear >= WEAR_PENALTY_THRESHOLD;

  let fumble = false;
  if (!broke && newWear >= WEAR_FUMBLE_THRESHOLD && seed !== undefined) {
    const rng  = makeRng(eventSeed(seed, 0, 0, 0, 0xFADE1), SCALE.Q);
    fumble = rng.q01() < FUMBLE_CHANCE_Q;
  }

  return { wear_Q: newWear, broke, fumble, penaltyActive };
}

// ── resolveDrops ──────────────────────────────────────────────────────────────

function shouldResolveDrops(entity: Entity, config?: { dropOnIncapacitated?: boolean }): { shouldDrop: boolean; source: DropResolution["source"] } {
  if (entity.injury.dead) return { shouldDrop: true, source: "dead" };
  if (config?.dropOnIncapacitated ?? false) return { shouldDrop: true, source: "incapacitated" };
  return { shouldDrop: false, source: "none" };
}

/**
 * Structured drop resolution for host-facing UI and telemetry.
 */
export function resolveDropsDetailed(
  entity: Entity,
  seed:   number,
  extra?: DropTable,
  config?: { dropOnIncapacitated?: boolean },
): DropResolution {
  const dropState = shouldResolveDrops(entity, config);
  if (!dropState.shouldDrop) {
    return {
      dropped: [],
      guaranteed: [],
      probabilistic: [],
      preventedByState: true,
      source: dropState.source,
    };
  }

  const guaranteed: string[] = [];
  const probabilistic: string[] = [];

  for (const item of entity.loadout.items) {
    if (item.kind === "weapon" || item.kind === "armour" || item.kind === "ranged") {
      guaranteed.push(item.id);
    }
  }

  if (extra) {
    guaranteed.push(...extra.guaranteed);
    for (let i = 0; i < extra.probabilistic.length; i++) {
      const entry    = extra.probabilistic[i]!;
      const rollSeed = eventSeed(seed, i, 0, 0, 0xD50A5);
      const rng      = makeRng(rollSeed, SCALE.Q);
      if (rng.q01() < entry.chance_Q) {
        probabilistic.push(entry.itemId);
      }
    }
  }

  return {
    dropped: [...guaranteed, ...probabilistic],
    guaranteed,
    probabilistic,
    preventedByState: false,
    source: dropState.source,
  };
}

/**
 * Compute the list of item IDs dropped by an entity on death or incapacitation.
 *
 * Default behaviour:
 *   - Dead entity → all equipped weapons, ranged weapons, and armour drop (guaranteed).
 *   - Incapacitated but living → nothing drops (use `config.dropOnIncapacitated = true` to override).
 *
 * Additional items from `extra.guaranteed` always drop (when applicable).
 * `extra.probabilistic` items are rolled deterministically from `seed`.
 */
export function resolveDrops(
  entity: Entity,
  seed:   number,
  extra?: DropTable,
  config?: { dropOnIncapacitated?: boolean },
): string[] {
  return resolveDropsDetailed(entity, seed, extra, config).dropped;
}

// ── evaluateTradeOffer ────────────────────────────────────────────────────────

/**
 * Evaluate a trade offer from the accepting party's perspective.
 *
 * - `offer.give`:  items the proposing party puts on the table.
 * - `offer.want`:  items the proposing party asks for in return.
 * - `inventory`:   accepting party's current stock.
 *
 * `netValue` > 0 → advantageous for the accepting party (they receive more than they give).
 * `feasible` — the accepting party has all `want` items in sufficient quantities.
 */
export function evaluateTradeOffer(offer: TradeOffer, inventory: ItemInventory): TradeEvaluation {
  const detailed = evaluateTradeOfferDetailed(offer, inventory);
  return { netValue: detailed.netValue, feasible: detailed.feasible };
}

/**
 * Inventory-aware trade evaluation that surfaces shortages and value breakdown.
 */
export function evaluateTradeOfferDetailed(
  offer: TradeOffer,
  inventory: ItemInventory,
): TradeEvaluationDetailed {
  const snapshots = new Map<string, TradeInventorySnapshot>();

  const giveValue = offer.give.reduce((sum, g) => sum + g.count * g.unitValue, 0);
  const wantValue = offer.want.reduce((sum, w) => sum + w.count * w.unitValue, 0);

  const shortages: Array<{ itemId: string; missingCount: number }> = [];

  for (const w of offer.want) {
    const entry = inventory.get(w.itemId);
    const owned = entry?.count ?? 0;
    const shortage = Math.max(0, w.count - owned);
    if (shortage > 0) shortages.push({ itemId: w.itemId, missingCount: shortage });

    snapshots.set(w.itemId, {
      ownedCount: owned,
      shortageCount: shortage,
      entryUnitValue: entry?.unitValue ?? 0,
      offerUnitValue: w.unitValue,
    });
  }

  for (const g of offer.give) {
    if (!snapshots.has(g.itemId)) {
      snapshots.set(g.itemId, {
        ownedCount: inventory.get(g.itemId)?.count ?? 0,
        shortageCount: 0,
        entryUnitValue: inventory.get(g.itemId)?.unitValue ?? 0,
        offerUnitValue: g.unitValue,
      });
    }
  }

  const feasible = shortages.length === 0;
  const netValue = giveValue - wantValue;

  return { netValue, feasible, giveValue, wantValue, shortages, snapshots };
}

// ── host reporting helpers ────────────────────────────────────────────────────

/** Merge simple itemized counts into an ItemInventory map. */
export function mergeIntoInventory(
  inventory: ItemInventory,
  items: ItemizedCount[],
  resolver: (itemId: string) => number,
): ItemInventory {
  for (const item of items) {
    if (item.count <= 0) continue;
    const existing = inventory.get(item.itemId);
    if (existing) {
      existing.count += item.count;
      continue;
    }
    inventory.set(item.itemId, { count: item.count, unitValue: resolver(item.itemId) });
  }
  return inventory;
}

/** Build a host-facing value report for any itemized list. */
export function createEconomyReport(
  label: string,
  entries: ItemizedCount[],
  resolver: (itemId: string) => number,
  tags: string[] = [],
): EconomyHostReport {
  const lines = entries
    .filter(e => e.count > 0)
    .map((entry) => {
      const unitValue = Math.max(0, resolver(entry.itemId));
      return {
        itemId: entry.itemId,
        count: entry.count,
        unitValue,
        totalValue: unitValue * entry.count,
      };
    });

  const grossValue = lines.reduce((sum, line) => sum + line.totalValue, 0);

  return {
    label,
    totals: {
      grossValue,
      netValue: grossValue,
      lineCount: lines.length,
    },
    lines,
    tags,
  };
}

/**
 * Example flow: post-battle loot screen.
 */
export function examplePostBattleLootFlow(
  entity: Entity,
  seed: number,
  resolver: (itemId: string) => number,
): EconomyHostReport {
  const drops = resolveDropsDetailed(entity, seed);
  const counts = countItems(drops.dropped);
  return createEconomyReport(
    "post_battle_loot",
    counts,
    resolver,
    ["loot", drops.source],
  );
}

/**
 * Example flow: repair/reuse loop that compares pre-repair vs post-repair resale.
 */
export function exampleRepairReuseLoop(item: Item, startingWear_Q: Q, repairedWear_Q: Q): EconomyHostReport {
  const before = toMarketValue(computeItemValue(item, startingWear_Q));
  const after = toMarketValue(computeItemValue(item, repairedWear_Q));
  return {
    label: "repair_reuse_loop",
    totals: {
      grossValue: after.sellValue,
      netValue: after.sellValue - before.sellValue,
      lineCount: 1,
    },
    lines: [{
      itemId: item.id,
      count: 1,
      unitValue: after.sellValue,
      totalValue: after.sellValue,
    }],
    tags: ["repair", "reuse", after.sellValue >= before.sellValue ? "improved" : "degraded"],
  };
}

/**
 * Example flow: settlement/shop interaction, including affordability and shortages.
 */
export function exampleSettlementTradeFlow(
  offer: TradeOffer,
  inventory: ItemInventory,
): TradeEvaluationDetailed {
  return evaluateTradeOfferDetailed(offer, inventory);
}

// ── totalInventoryValue ───────────────────────────────────────────────────────

/**
 * Sum the total value of all items in an inventory (count × unitValue for each entry).
 */
export function totalInventoryValue(inventory: ItemInventory): number {
  let total = 0;
  for (const [, entry] of inventory) total += entry.count * entry.unitValue;
  return total;
}

function countItems(ids: string[]): ItemizedCount[] {
  const counts = new Map<string, number>();
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].map(([itemId, count]) => ({ itemId, count }));
}
