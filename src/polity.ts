// src/polity.ts — Phase 61: Polity & World-State System
//
// Geopolitical simulation layer operating at 1 tick per simulated day.
// Polities (cities, nations, empires) integrate with:
//   Faction (Phase 24) — via factionId → FactionRegistry
//   Economy (Phase 25) — treasury in cost-unit scale
//   Technology (Phase 11C) — TechEra gates trade multipliers and military force
//   Disease (Phase 56) — airborne epidemic spread at population scale
//   Campaign (Phase 22) — locationIds map to Campaign Location graph
//
// No kernel import — pure data-management module, fixed-point arithmetic only.

import type { Q }               from "./units.js";
import { SCALE, q, clampQ, qMul, mulDiv } from "./units.js";
import type { TechEra }         from "./sim/tech.js";
import type { DiseaseProfile }  from "./sim/disease.js";
import type { FactionRegistry } from "./faction.js";
import { STANDING_NEUTRAL }     from "./faction.js";
import { eventSeed, hashString } from "./sim/seeds.js";
import { makeRng }              from "./rng.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A geopolitical entity: city, nation, or empire.
 *
 * Operates at 1 tick per simulated day.  All Q fields are fixed-point
 * fractions in [0, SCALE.Q] unless documented otherwise.
 *
 * @stable CE-14 — fields are frozen from v0.2.0.  New fields require a minor
 * version bump; removals or renames require a major bump and migration guide.
 */
export interface Polity {
  id:                 string;
  name:               string;
  /** Ties into an existing Faction id in the FactionRegistry. */
  factionId:          string;
  /** Location IDs (Campaign layer) this polity controls. */
  locationIds:        string[];
  /** Headcount (integer people). */
  population:         number;
  /** Wealth in cost-units (same scale as src/economy.ts ItemValue.baseValue). */
  treasury_cu:        number;
  /** Current technology era (Phase 11C). */
  techEra:            TechEra;
  /**
   * Derived fighting capacity [0, SCALE.Q].
   * Recomputed by `deriveMilitaryStrength`; do not set directly.
   */
  militaryStrength_Q: Q;
  /** Internal cohesion [0, SCALE.Q]. Below UNREST_THRESHOLD → morale drain. */
  stabilityQ:         Q;
  /** Population morale [0, SCALE.Q]. Low morale → weak military and stability decay. */
  moraleQ:            Q;
}

/**
 * Registry of all active polities and their geopolitical relationships.
 *
 * @stable CE-14 — frozen from v0.2.0.
 */
export interface PolityRegistry {
  polities:   Map<string, Polity>;
  /**
   * Pairs currently at war.  Keys are sorted "a:b" (a < b lexicographically)
   * so each pair appears exactly once.
   */
  activeWars: Set<string>;
  /** Diplomatic alliances: polityId → Set of allied polityIds. */
  alliances:  Map<string, Set<string>>;
}

/**
 * A trade/proximity link between two polities in the Campaign graph.
 *
 * @stable CE-14 — frozen from v0.2.0.
 */
export interface PolityPair {
  polityAId:        string;
  polityBId:        string;
  /** Number of locations shared on the Campaign border. */
  sharedLocations:  number;
  /**
   * Best navigator's `logicalMathematical_Q` among available envoys (Phase 38).
   * Use q(0.50) as a default when no specific navigator is assigned.
   */
  routeQuality_Q:   Q;
}

export interface PolityTradeResult {
  polityAId:     string;
  polityBId:     string;
  /** Cost-units credited to each polity's treasury. */
  incomeEach_cu: number;
}

export interface PolityWarResult {
  attackerId:              string;
  defenderId:              string;
  attackerWins:            boolean;
  stabilityDeltaAttacker:  Q;
  stabilityDeltaDefender:  Q;
  /** Location IDs transferred from defender to attacker on victory (first location only). */
  territoryGained:         string[];
}

export interface PolityDiplomacyResult {
  polityAId:    string;
  polityBId:    string;
  /** Positive standing delta to apply to the FactionRegistry global standing. */
  standingDelta: Q;
}

export interface PolityDiseaseResult {
  polityId:        string;
  /** Estimated new disease exposures in the population for this day. */
  newExposures:    number;
  /** Net population change; negative = deaths from disease mortality. */
  populationDelta: number;
}

export interface PolityDayResult {
  trade:            PolityTradeResult[];
  moraleDeltas:     Map<string, Q>;
  stabilityDeltas:  Map<string, Q>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Population count at which military potential equals q(1.0). */
export const POLITY_POP_SCALE = 100_000;

/**
 * Military force multiplier by TechEra index.
 * Higher eras give a fractional advantage on top of population and morale.
 */
export const TECH_FORCE_MUL: ReadonlyArray<Q> = [
  q(0.40) as Q,  // 0 — Prehistoric
  q(0.55) as Q,  // 1 — Ancient
  q(0.65) as Q,  // 2 — Medieval
  q(0.75) as Q,  // 3 — EarlyModern
  q(0.85) as Q,  // 4 — Industrial
  q(0.95) as Q,  // 5 — Modern
  q(1.10) as Q,  // 6 — NearFuture
  q(1.30) as Q,  // 7 — FarFuture
  q(1.50) as Q,  // 8 — DeepSpace
];

/**
 * Trade output multiplier by the *lower* of the two polities' TechEra.
 * Advanced tech means more valuable tradeable goods.
 */
export const TECH_TRADE_MUL: ReadonlyArray<Q> = [
  q(0.50) as Q,  // 0 — Prehistoric
  q(0.60) as Q,  // 1 — Ancient
  q(0.70) as Q,  // 2 — Medieval
  q(0.80) as Q,  // 3 — EarlyModern
  q(0.90) as Q,  // 4 — Industrial
  q(1.00) as Q,  // 5 — Modern
  q(1.10) as Q,  // 6 — NearFuture
  q(1.20) as Q,  // 7 — FarFuture
  q(1.30) as Q,  // 8 — DeepSpace
];

/** Fraction of min(treasury) exchanged as mutual trade income per day. */
export const TRADE_RATE_PER_DAY_Q: Q = q(0.010);

/**
 * Treasury cost to advance one tech era (indexed by current era).
 * Era 8 (DeepSpace) is the maximum; index 8 cost is unused.
 */
export const TECH_ADVANCE_COST: ReadonlyArray<number> = [
  2_000,    // Prehistoric  → Ancient
  8_000,    // Ancient      → Medieval
  20_000,   // Medieval     → EarlyModern
  50_000,   // EarlyModern  → Industrial
  120_000,  // Industrial   → Modern
  300_000,  // Modern       → NearFuture
  750_000,  // NearFuture   → FarFuture
  2_000_000,// FarFuture    → DeepSpace
  0,        // DeepSpace (max — unused)
];

/** Defender's structural advantage in war resolution (home terrain, fortifications). */
export const DEFENDER_ADVANTAGE_Q: Q = q(1.20);

/** Outcome uncertainty range in war: attacker power is scaled by [q(0.80), q(1.30)]. */
export const WAR_UNCERTAINTY_Q: Q = q(0.50);  // spans +q(0.50) above q(0.80) floor

/** Stability penalty applied to the losing side per war day-tick. */
export const WAR_LOSER_STABILITY_HIT: Q = q(0.05);

/** Stability bonus for the winning side per war day-tick. */
export const WAR_WINNER_STABILITY_GAIN: Q = q(0.02);

/** Daily stability decay absent active governance. */
export const STABILITY_DECAY_PER_DAY: Q = q(0.002);

/** Daily stability recovery when morale > q(0.50). */
export const STABILITY_RECOVERY_PER_DAY: Q = q(0.004);

/** Daily morale gain when stability ≥ UNREST_THRESHOLD. */
export const MORALE_RECOVERY_PER_DAY: Q = q(0.003);

/** Daily morale drain when stability < UNREST_THRESHOLD. */
export const MORALE_DRAIN_PER_DAY: Q = q(0.008);

/** Stability below this value triggers morale drain instead of recovery. */
export const UNREST_THRESHOLD: Q = q(0.30);

/** Maximum standing delta per successful diplomatic negotiation. */
export const DIPLOMACY_MAX_DELTA: Q = q(0.08);

/**
 * Population per controlled location above which airborne disease spreads
 * at polity scale (instead of only entity-to-entity).
 */
export const DENSITY_SPREAD_THRESHOLD = 5_000;

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a Polity with derived `militaryStrength_Q`.
 *
 * Default starting stability and morale represent a stable, reasonably
 * content polity (stability q(0.70), morale q(0.65)).
 */
export function createPolity(
  id:          string,
  name:        string,
  factionId:   string,
  locationIds: string[],
  population:  number,
  treasury_cu: number,
  techEra:     TechEra,
  stabilityQ:  Q = q(0.70) as Q,
  moraleQ:     Q = q(0.65) as Q,
): Polity {
  const polity: Polity = {
    id, name, factionId, locationIds, population, treasury_cu, techEra,
    militaryStrength_Q: q(0) as Q,
    stabilityQ,
    moraleQ,
  };
  polity.militaryStrength_Q = deriveMilitaryStrength(polity);
  return polity;
}

/**
 * Create a PolityRegistry from an array of polities.
 * No wars or alliances are registered by default.
 */
export function createPolityRegistry(polities: Polity[]): PolityRegistry {
  return {
    polities:  new Map(polities.map(p => [p.id, p])),
    activeWars: new Set(),
    alliances:  new Map(),
  };
}

// ── Military ──────────────────────────────────────────────────────────────────

/**
 * Derive and update `polity.militaryStrength_Q` from population, morale, and
 * tech era.
 *
 * Formula: `clamp(popFrac × morale × techMul, 0, SCALE.Q)`
 *
 * - `popFrac` = `population / POLITY_POP_SCALE`, clamped to [0, SCALE.Q]
 *   (100 000 people = q(1.0) military potential)
 * - `morale` and `techMul` are Q multipliers; result is clamped to SCALE.Q.
 *
 * Mutates `polity.militaryStrength_Q` and returns the new value.
 */
export function deriveMilitaryStrength(polity: Polity): Q {
  const popFrac = clampQ(
    Math.round(polity.population * SCALE.Q / POLITY_POP_SCALE),
    0, SCALE.Q,
  ) as Q;
  const techMul = (TECH_FORCE_MUL[polity.techEra] ?? q(0.40)) as Q;
  const withMorale = qMul(popFrac, polity.moraleQ);
  const strength   = clampQ(qMul(withMorale, techMul), 0, SCALE.Q) as Q;
  polity.militaryStrength_Q = strength;
  return strength;
}

// ── Trade ─────────────────────────────────────────────────────────────────────

/**
 * Compute the daily trade income credited to each polity.
 *
 * Both polities receive the same `incomeEach_cu`.  Scales with:
 * - min(treasury): limited by the poorer partner
 * - routeQuality_Q: navigator skill (Phase 38 `logicalMathematical`)
 * - lower tech era of the pair: advanced goods multiply trade value
 * - sharedLocations: more border crossings → more trade routes
 *
 * Returns 0 when either treasury is empty or `sharedLocations <= 0`.
 */
export function computeTradeIncome(
  polityA:          Polity,
  polityB:          Polity,
  sharedLocations:  number,
  routeQuality_Q:   Q,
): number {
  if (sharedLocations <= 0 || polityA.treasury_cu <= 0 || polityB.treasury_cu <= 0) return 0;

  const tradeBase  = Math.min(polityA.treasury_cu, polityB.treasury_cu);
  const techEra    = Math.min(polityA.techEra, polityB.techEra);
  const techMul_Q  = (TECH_TRADE_MUL[techEra] ?? q(0.50)) as Q;
  // Location multiplier: q(0.60) at 1 shared location, capped at q(1.0) at 4+
  const locMul_Q   = clampQ((q(0.50) + sharedLocations * q(0.10)) as Q, q(0.50), q(1.0)) as Q;

  // income = tradeBase × TRADE_RATE × routeQuality × techMul × locMul / SCALE.Q⁴
  const step1 = mulDiv(tradeBase, TRADE_RATE_PER_DAY_Q, SCALE.Q);
  const step2 = mulDiv(step1, routeQuality_Q, SCALE.Q);
  const step3 = mulDiv(step2, techMul_Q, SCALE.Q);
  return Math.max(0, Math.round(mulDiv(step3, locMul_Q, SCALE.Q)));
}

// ── War ───────────────────────────────────────────────────────────────────────

/**
 * Resolve one day of active warfare between two polities.
 *
 * Deterministic given (`worldSeed`, `tick`).  The defender receives a
 * built-in structural advantage (DEFENDER_ADVANTAGE_Q = q(1.20)).
 * Attacker power is modified by a deterministic ±q(0.20) uncertainty roll.
 *
 * On attacker victory the first location of the defender is transferred.
 * Stability consequences are returned as deltas; the caller applies them
 * (or call `stepPolityDay` to handle that automatically for active wars).
 */
export function resolveWarOutcome(
  attacker:   Polity,
  defender:   Polity,
  worldSeed:  number,
  tick:       number,
): PolityWarResult {
  const aSalt = hashString(attacker.id);
  const dSalt = hashString(defender.id);
  const seed  = eventSeed(worldSeed, tick, aSalt, dSalt, 0xFA17);
  const rng   = makeRng(seed, SCALE.Q);

  const roll = rng.q01();   // 0 … SCALE.Q − 1
  // uncertainty_Q ∈ [q(0.80), q(1.20)]
  const uncertainty_Q = (q(0.80) + mulDiv(roll, WAR_UNCERTAINTY_Q, SCALE.Q)) as Q;

  const attackPower = qMul(attacker.militaryStrength_Q, uncertainty_Q);
  const defendPower = qMul(defender.militaryStrength_Q, DEFENDER_ADVANTAGE_Q);
  const attackerWins = attackPower > defendPower;

  const territoryGained: string[] = [];
  if (attackerWins && defender.locationIds.length > 0) {
    territoryGained.push(defender.locationIds[0]!);
  }

  return {
    attackerId:             attacker.id,
    defenderId:             defender.id,
    attackerWins,
    stabilityDeltaAttacker: (attackerWins ? WAR_WINNER_STABILITY_GAIN : -WAR_LOSER_STABILITY_HIT) as Q,
    stabilityDeltaDefender: (attackerWins ? -WAR_LOSER_STABILITY_HIT : WAR_WINNER_STABILITY_GAIN) as Q,
    territoryGained,
  };
}

// ── Diplomacy ─────────────────────────────────────────────────────────────────

/**
 * Resolve a diplomatic negotiation between two polities.
 *
 * Returns a positive `standingDelta` to apply to the FactionRegistry global
 * standing between the two polities' factions via `applyFactionStanding`.
 *
 * Standing improvement scales with:
 * - `diplomatLinguistic_Q`: best envoy's `linguisticIntelligence_Q` (Phase 37)
 * - headroom: how far below ALLY standing (q(0.70)) the current relation is
 *   (no improvement when already at or above ALLY)
 *
 * Maximum delta per negotiation is DIPLOMACY_MAX_DELTA (q(0.08)).
 */
export function resolveDiplomacy(
  polityA:               Polity,
  polityB:               Polity,
  diplomatLinguistic_Q:  Q,
  currentStanding_Q:     Q,
): PolityDiplomacyResult {
  // headroom = how far below ALLY standing the current relation sits
  const headroom      = clampQ(q(0.70) - currentStanding_Q, 0, SCALE.Q) as Q;
  const rawDelta      = mulDiv(qMul(headroom, diplomatLinguistic_Q), DIPLOMACY_MAX_DELTA, SCALE.Q);
  const standingDelta = clampQ(rawDelta, 0, DIPLOMACY_MAX_DELTA) as Q;
  return { polityAId: polityA.id, polityBId: polityB.id, standingDelta };
}

// ── Technology ────────────────────────────────────────────────────────────────

/**
 * Return true if the polity meets the conditions to advance to the next tech era.
 *
 * Requires:
 * 1. A research project has been completed (`projectCompleted = true`).
 * 2. Treasury meets the advancement cost for the current era.
 * 3. Not already at maximum era (DeepSpace, index 8).
 */
export function canAdvanceTech(polity: Polity, projectCompleted: boolean): boolean {
  if (!projectCompleted) return false;
  const maxEra = TECH_ADVANCE_COST.length - 1;
  if (polity.techEra >= maxEra) return false;
  const cost = TECH_ADVANCE_COST[polity.techEra] ?? 0;
  return polity.treasury_cu >= cost;
}

/**
 * Advance polity to the next tech era if eligible.
 *
 * Mutates `polity.techEra` and `polity.treasury_cu`.
 * Refreshes `militaryStrength_Q` after advancement.
 * Returns `true` if advancement occurred.
 */
export function advanceTechEra(polity: Polity, projectCompleted: boolean): boolean {
  if (!canAdvanceTech(polity, projectCompleted)) return false;
  const cost = TECH_ADVANCE_COST[polity.techEra] ?? 0;
  polity.treasury_cu -= cost;
  polity.techEra = (polity.techEra + 1) as TechEra;
  deriveMilitaryStrength(polity);
  return true;
}

// ── Disease ───────────────────────────────────────────────────────────────────

/**
 * Compute population-scale disease spread for one simulated day.
 *
 * Only `"airborne"` diseases spread at polity scale; other routes remain
 * entity-to-entity (handled by Phase 56 `spreadDisease`).
 *
 * Spread activates when population density
 * (`population / locationIds.length`) exceeds DENSITY_SPREAD_THRESHOLD.
 *
 * Mutates `polity.population` by `populationDelta` (negative = deaths).
 * Returns zeros when conditions are not met.
 */
export function computePolityDiseaseSpread(
  polity:    Polity,
  profile:   DiseaseProfile,
  worldSeed: number,
  tick:      number,
): PolityDiseaseResult {
  if (profile.transmissionRoute !== "airborne") {
    return { polityId: polity.id, newExposures: 0, populationDelta: 0 };
  }

  const locCount = Math.max(1, polity.locationIds.length);
  const density  = Math.round(polity.population / locCount);
  if (density < DENSITY_SPREAD_THRESHOLD) {
    return { polityId: polity.id, newExposures: 0, populationDelta: 0 };
  }

  // Density excess fraction drives spread risk
  const excessFrac_Q = clampQ(
    Math.round((density - DENSITY_SPREAD_THRESHOLD) * SCALE.Q / DENSITY_SPREAD_THRESHOLD),
    0, SCALE.Q,
  ) as Q;
  const spreadRisk_Q = clampQ(qMul(excessFrac_Q, profile.baseTransmissionRate_Q), 0, SCALE.Q) as Q;

  // Deterministic daily exposure roll
  const salt    = hashString(profile.id);
  const seed    = eventSeed(worldSeed, tick, salt, 0, 0xD15E);
  const rng     = makeRng(seed, SCALE.Q);
  const roll_Q  = rng.q01();
  const actualRisk_Q = clampQ(mulDiv(spreadRisk_Q, roll_Q, SCALE.Q), 0, SCALE.Q) as Q;

  const newExposures    = Math.max(0, Math.round(polity.population * actualRisk_Q / SCALE.Q));
  const mortalityFrac_Q = clampQ(qMul(profile.mortalityRate_Q, profile.symptomSeverity_Q), 0, SCALE.Q) as Q;
  const populationDelta = -Math.max(0, Math.round(newExposures * mortalityFrac_Q / SCALE.Q));

  polity.population = Math.max(0, polity.population + populationDelta);
  return { polityId: polity.id, newExposures, populationDelta };
}

// ── Day step ──────────────────────────────────────────────────────────────────

/**
 * Advance all polities by one simulated day.
 *
 * Performs three phases in order:
 *
 * **Trade**: For each non-warring pair, compute and credit mutual trade income.
 *
 * **War**: For each active war, resolve one day of combat, apply stability
 * consequences, and transfer territory on attacker victory.
 *
 * **Morale/Stability**: For each polity:
 * - Stability decays daily; recovers when morale > q(0.50).
 * - Morale drains when stability < UNREST_THRESHOLD; recovers otherwise.
 * - `militaryStrength_Q` is refreshed.
 *
 * Disease spread is NOT handled here; call `computePolityDiseaseSpread`
 * per-disease per-polity as the host iterates active outbreaks.
 *
 * Mutates polities in `registry.polities` and registry.activeWars (territory
 * transfers may empty `locationIds`, but war entries are not auto-removed).
 */
export function stepPolityDay(
  registry:  PolityRegistry,
  pairs:     PolityPair[],
  worldSeed: number,
  tick:      number,
): PolityDayResult {
  const tradeResults: PolityTradeResult[] = [];
  const moraleDeltas    = new Map<string, Q>();
  const stabilityDeltas = new Map<string, Q>();

  // ── Trade phase ────────────────────────────────────────────────────────────
  for (const pair of pairs) {
    const polityA = registry.polities.get(pair.polityAId);
    const polityB = registry.polities.get(pair.polityBId);
    if (!polityA || !polityB) continue;

    // No trade during active war
    const warKey = [pair.polityAId, pair.polityBId].sort().join(":");
    if (registry.activeWars.has(warKey)) continue;

    const income = computeTradeIncome(polityA, polityB, pair.sharedLocations, pair.routeQuality_Q);
    if (income > 0) {
      polityA.treasury_cu += income;
      polityB.treasury_cu += income;
      tradeResults.push({ polityAId: pair.polityAId, polityBId: pair.polityBId, incomeEach_cu: income });
    }
  }

  // ── War phase ──────────────────────────────────────────────────────────────
  for (const warKey of registry.activeWars) {
    const [idA, idB] = warKey.split(":") as [string, string];
    const polityA = registry.polities.get(idA);
    const polityB = registry.polities.get(idB);
    if (!polityA || !polityB) continue;

    // Alphabetically-first polity is treated as the aggressor this tick
    const result = resolveWarOutcome(polityA, polityB, worldSeed, tick);
    polityA.stabilityQ = clampQ(polityA.stabilityQ + result.stabilityDeltaAttacker, 0, SCALE.Q) as Q;
    polityB.stabilityQ = clampQ(polityB.stabilityQ + result.stabilityDeltaDefender, 0, SCALE.Q) as Q;

    // Territory transfer on attacker victory
    if (result.attackerWins) {
      for (const locId of result.territoryGained) {
        polityB.locationIds = polityB.locationIds.filter(id => id !== locId);
        polityA.locationIds = [...polityA.locationIds, locId];
      }
    }
  }

  // ── Morale & stability phase ───────────────────────────────────────────────
  for (const [id, polity] of registry.polities) {
    // Stability: decays always; net positive when morale is healthy
    const stabilityDelta = (polity.moraleQ > q(0.50)
      ? STABILITY_RECOVERY_PER_DAY - STABILITY_DECAY_PER_DAY
      : -STABILITY_DECAY_PER_DAY) as Q;
    polity.stabilityQ = clampQ(polity.stabilityQ + stabilityDelta, 0, SCALE.Q) as Q;
    stabilityDeltas.set(id, stabilityDelta);

    // Morale: drains under unrest, recovers when stable
    const moraleDelta = (polity.stabilityQ < UNREST_THRESHOLD
      ? -MORALE_DRAIN_PER_DAY
      : MORALE_RECOVERY_PER_DAY) as Q;
    polity.moraleQ = clampQ(polity.moraleQ + moraleDelta, 0, SCALE.Q) as Q;
    moraleDeltas.set(id, moraleDelta);

    deriveMilitaryStrength(polity);
  }

  return { trade: tradeResults, moraleDeltas, stabilityDeltas };
}

// ── War registry helpers ───────────────────────────────────────────────────────

/** Register a state of war between two polities. Idempotent. */
export function declareWar(registry: PolityRegistry, polityAId: string, polityBId: string): void {
  registry.activeWars.add([polityAId, polityBId].sort().join(":"));
}

/** End the state of war between two polities. Idempotent. */
export function makePeace(registry: PolityRegistry, polityAId: string, polityBId: string): void {
  registry.activeWars.delete([polityAId, polityBId].sort().join(":"));
}

/** Return true if two polities are currently at war. */
export function areAtWar(registry: PolityRegistry, polityAId: string, polityBId: string): boolean {
  return registry.activeWars.has([polityAId, polityBId].sort().join(":"));
}

// ── Faction standing bridge ────────────────────────────────────────────────────

/**
 * Look up the current faction-level standing that polityA's faction holds
 * toward polityB's faction in the FactionRegistry.
 *
 * Returns STANDING_NEUTRAL (q(0.50)) if no relation is registered.
 * Use this as `currentStanding_Q` for `resolveDiplomacy`.
 */
export function polityFactionStanding(
  factionRegistry: FactionRegistry,
  polityA:         Polity,
  polityB:         Polity,
): Q {
  return factionRegistry.globalStanding
    .get(polityA.factionId)?.get(polityB.factionId) ?? STANDING_NEUTRAL;
}

// ── Campaign Layer barrel (CE-14) ──────────────────────────────────────────────
//
// The `ananke/polity` subpath re-exports the full Socio-Economic Campaign Layer
// so that a host can import everything from one entry point:
//
//   import { stepPolityDay, stepTechDiffusion, applyEmotionalContagion }
//     from "ananke/polity";
//
// Both modules are Tier 1 (Stable) from v0.2.0.

export * from "./tech-diffusion.js";
export * from "./emotional-contagion.js";
