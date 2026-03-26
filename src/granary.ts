// src/granary.ts — Phase 87: Granary & Food Supply
//
// Tracks grain reserves per polity.  Grain is measured in "supply units" (su)
// where 1 su feeds one person for one day.  The granary fills at each harvest
// and drains with daily consumption; when reserves fall below a fraction of
// capacity, Phase-86 famine mechanics activate.
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `GranaryState` stores only grain_su; capacity is derived from polity.population.
//   - `computeFoodSupply_Q` produces the [0, SCALE.Q] value consumed by Phase-86
//     `stepPolityPopulation(deathPressure_Q, foodSupply_Q)`.
//   - Harvest yield is modulated by stability and an optional Phase-78 season multiplier.
//   - `tradeFoodSupply` integrates with Phase-83 trade routes (caller-driven).
//   - `raidGranary` integrates with Phase-84 siege warfare (plunder).
//
// Integration:
//   Phase 61 (Polity):    population drives capacity and harvest yield.
//   Phase 78 (Calendar):  season_Q passed to deriveHarvestYieldFactor.
//   Phase 83 (Trade):     tradeFoodSupply called when host resolves a food route.
//   Phase 84 (Siege):     raidGranary called on attacker victory.
//   Phase 86 (Demography): computeFoodSupply_Q → foodSupply_Q parameter.

import { q, SCALE, clampQ, mulDiv } from "./units.js";
import type { Q }                   from "./units.js";
import type { Polity }              from "./polity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Grain reserves for one polity.
 *
 * Capacity is derived (not stored): `population × GRANARY_CAPACITY_DAYS`.
 * Attach one `GranaryState` per polity; store externally (e.g., `Map<string, GranaryState>`).
 */
export interface GranaryState {
  polityId: string;
  /** Current grain reserves in supply units (1 su = food for 1 person for 1 day). */
  grain_su: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Granary holds this many person-days of food at full capacity.
 * Default: 730 (≈ 2 years of food per capita).
 */
export const GRANARY_CAPACITY_DAYS = 730;

/**
 * Each harvest at full yield contributes this many person-days per capita.
 * With two harvests/year: 500 annual supply vs. 365 consumption → ~37% surplus headroom.
 */
export const HARVEST_BASE_SU_PER_CAPITA = 250;

/**
 * Minimum harvest yield at zero stability [0, SCALE.Q].
 * Stability linearly scales yield from this floor to `SCALE.Q` (full yield).
 */
export const HARVEST_YIELD_BASE_Q: Q = q(0.70);

/**
 * Maximum additional yield from full stability [0, SCALE.Q].
 * yieldFactor = HARVEST_YIELD_BASE_Q + mulDiv(HARVEST_STABILITY_BONUS_Q, stabilityQ, SCALE.Q).
 */
export const HARVEST_STABILITY_BONUS_Q: Q = q(0.30);

/**
 * Fraction of the granary that a successful siege raid removes.
 * Callers may pass a different fraction to `raidGranary`.
 */
export const RAID_FRACTION_Q: Q = q(0.40);

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a new `GranaryState` for a polity.
 * Initial reserves default to one year of consumption (stable starting point).
 */
export function createGranary(polity: Polity): GranaryState {
  return {
    polityId: polity.id,
    grain_su: polity.population * 365,
  };
}

// ── Capacity & food supply ────────────────────────────────────────────────────

/**
 * Maximum grain the polity can store [supply units].
 * Scales with current population — a growing polity can store more.
 */
export function computeCapacity(polity: Polity): number {
  return polity.population * GRANARY_CAPACITY_DAYS;
}

/**
 * Convert grain reserves to a [0, SCALE.Q] food supply fraction.
 *
 * This is the `foodSupply_Q` input for Phase-86 `stepPolityPopulation`:
 *   - q(1.0) = full granary (no famine)
 *   - below Phase-86 `FAMINE_THRESHOLD_Q = q(0.20)` → famine active
 *
 * Returns 0 when population is zero (prevents division by zero).
 */
export function computeFoodSupply_Q(polity: Polity, granary: GranaryState): Q {
  const cap = computeCapacity(polity);
  if (cap <= 0) return 0 as Q;
  return clampQ(Math.round(granary.grain_su * SCALE.Q / cap), 0, SCALE.Q);
}

// ── Harvest ───────────────────────────────────────────────────────────────────

/**
 * Derive the harvest yield factor [0, SCALE.Q] for a polity.
 *
 * Formula: `HARVEST_YIELD_BASE_Q + mulDiv(HARVEST_STABILITY_BONUS_Q, stabilityQ, SCALE.Q)`
 * then optionally multiplied by a Phase-78 seasonal factor.
 *
 * @param season_Q  Seasonal multiplier [0, SCALE.Q] from Phase-78 Calendar.
 *                  `q(1.0)` = summer peak; `q(0.50)` = winter harvest.
 *                  Omit for an unseasoned annual harvest.
 */
export function deriveHarvestYieldFactor(polity: Polity, season_Q?: Q): Q {
  const stabilityBonus = mulDiv(HARVEST_STABILITY_BONUS_Q, polity.stabilityQ, SCALE.Q);
  const baseFactor     = clampQ(HARVEST_YIELD_BASE_Q + stabilityBonus, 0, SCALE.Q);
  if (season_Q == null) return baseFactor;
  return clampQ(mulDiv(baseFactor, season_Q, SCALE.Q), 0, SCALE.Q);
}

/**
 * Compute the grain added by one harvest [supply units].
 *
 * `yield_su = round(population × HARVEST_BASE_SU_PER_CAPITA × yieldFactor_Q / SCALE.Q)`
 *
 * @param yieldFactor_Q  Override factor; defaults to `deriveHarvestYieldFactor(polity)`.
 */
export function computeHarvestYield(polity: Polity, yieldFactor_Q?: Q): number {
  const factor = yieldFactor_Q ?? deriveHarvestYieldFactor(polity);
  return Math.round(polity.population * HARVEST_BASE_SU_PER_CAPITA * factor / SCALE.Q);
}

/**
 * Add one harvest to the granary.
 *
 * Grain is clamped to `computeCapacity(polity)` — surplus is lost (no overflow).
 * Returns the amount actually added (may be less than yield if near capacity).
 *
 * Call at the end of each harvest season (biannual: spring + autumn).
 */
export function triggerHarvest(
  polity:        Polity,
  granary:       GranaryState,
  yieldFactor_Q?: Q,
): number {
  const cap    = computeCapacity(polity);
  const yield_ = computeHarvestYield(polity, yieldFactor_Q);
  const added  = Math.min(yield_, Math.max(0, cap - granary.grain_su));
  granary.grain_su = Math.min(cap, granary.grain_su + yield_);
  return added;
}

// ── Consumption ───────────────────────────────────────────────────────────────

/**
 * Drain daily grain consumption for `elapsedDays` days.
 *
 * Consumption = `polity.population × elapsedDays` supply units.
 * Grain is clamped to 0 (no negative reserves).
 *
 * Returns the actual amount consumed (may be less than demand if reserves run low).
 */
export function stepGranaryConsumption(
  polity:      Polity,
  granary:     GranaryState,
  elapsedDays: number,
): number {
  const demand   = polity.population * elapsedDays;
  const consumed = Math.min(demand, granary.grain_su);
  granary.grain_su = Math.max(0, granary.grain_su - demand);
  return consumed;
}

// ── Trade food ────────────────────────────────────────────────────────────────

/**
 * Transfer grain from one polity's granary to another.
 *
 * Actual transfer is limited by:
 * - Grain available in the source granary.
 * - Remaining capacity in the destination granary.
 *
 * Returns the amount actually transferred.
 * Integrate with Phase-83 trade routes: host calls this when resolving a food route.
 */
export function tradeFoodSupply(
  fromGranary: GranaryState,
  toGranary:   GranaryState,
  toPolity:    Polity,
  amount_su:   number,
): number {
  const toCap      = computeCapacity(toPolity);
  const toSpace    = Math.max(0, toCap - toGranary.grain_su);
  const available  = fromGranary.grain_su;
  const transferred = Math.min(amount_su, available, toSpace);
  fromGranary.grain_su -= transferred;
  toGranary.grain_su   += transferred;
  return transferred;
}

// ── Siege raid ────────────────────────────────────────────────────────────────

/**
 * Plunder a granary after a successful siege.
 *
 * Removes `raidFraction_Q` of current grain reserves.
 * Returns the amount plundered.
 *
 * Integrates with Phase-84 siege: call on `outcome === "attacker_victory"`.
 *
 * @param raidFraction_Q  Fraction of reserves plundered [0, SCALE.Q].
 *                        Defaults to `RAID_FRACTION_Q = q(0.40)`.
 */
export function raidGranary(
  granary:        GranaryState,
  raidFraction_Q?: Q,
): number {
  const fraction  = raidFraction_Q ?? RAID_FRACTION_Q;
  const plundered = Math.round(mulDiv(granary.grain_su, fraction, SCALE.Q));
  granary.grain_su = Math.max(0, granary.grain_su - plundered);
  return plundered;
}
