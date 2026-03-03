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
 * Convert armour degradation state to a wear_Q fraction.
 *
 * ```
 * wear = q(1.0) − resistRemaining_J / resist_J
 * ```
 * Used to derive `condition_Q` for ablative armour via `computeItemValue`.
 */
export function armourConditionQ(resist_J: number, resistRemaining_J: number): Q {
  if (resist_J <= 0) return q(1.0);
  const fraction = Math.trunc((resistRemaining_J * SCALE.Q) / resist_J);
  return clampQ(fraction, 0, SCALE.Q) as Q;
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
  const shouldDrop = entity.injury.dead || (config?.dropOnIncapacitated ?? false);
  if (!shouldDrop) return [];

  const result: string[] = [];

  // Guaranteed: all equipped weapons and armour
  for (const item of entity.loadout.items) {
    if (item.kind === "weapon" || item.kind === "armour" || item.kind === "ranged") {
      result.push(item.id);
    }
  }

  if (extra) {
    for (const id of extra.guaranteed) {
      result.push(id);
    }

    // Probabilistic roll — deterministic per item index
    for (let i = 0; i < extra.probabilistic.length; i++) {
      const entry    = extra.probabilistic[i]!;
      const rollSeed = eventSeed(seed, i, 0, 0, 0xD50A5);
      const rng      = makeRng(rollSeed, SCALE.Q);
      if (rng.q01() < entry.chance_Q) {
        result.push(entry.itemId);
      }
    }
  }

  return result;
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
  // Feasibility: does the accepting party have all wanted items?
  let feasible = true;
  for (const w of offer.want) {
    const entry = inventory.get(w.itemId);
    if (!entry || entry.count < w.count) { feasible = false; break; }
  }

  // Net value for accepting party: receive give items, pay want items
  let netValue = 0;
  for (const g of offer.give) netValue += g.count * g.unitValue;
  for (const w of offer.want) netValue -= w.count * w.unitValue;

  return { netValue, feasible };
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
