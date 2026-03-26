// src/demography.ts — Phase 86: Population Dynamics & Demographics
//
// Models natural population growth, mortality, and famine at polity level.
// All rates are annual Q fractions (fraction of population per year) so that
// SCALE.Q = 10000 gives sufficient precision (0.01%/year resolution).
//
// Step formula:
//   popDelta = round(population × netAnnualRate_Q × elapsedDays / (365 × SCALE.Q))
//
// For small polities (< ~10 000) single-day steps yield zero delta;
// call with 7- or 30-day intervals for visible change.
//
// Integration:
//   - Phase 61 (Polity):   reads/mutates polity.population; uses morale/stability/techEra.
//   - Phase 56 (Disease):  caller passes epidemic annual mortality as deathPressure_Q.
//   - Phase 81 (Migration): computeFamineMigrationPush() is an additive push bonus.
//   - Phase 78 (Calendar): caller may pass seasonal birth/death multipliers.

import { q, SCALE, clampQ, mulDiv } from "./units.js";
import type { Q }                   from "./units.js";
import type { Polity }              from "./polity.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Baseline annual birth rate [Q = fraction of population per year]. ≈ 3.5%/year. */
export const BASELINE_BIRTH_RATE_ANNUAL_Q: Q = q(0.035);

/** Baseline annual death rate [Q = fraction of population per year]. ≈ 3.0%/year. */
export const BASELINE_DEATH_RATE_ANNUAL_Q: Q = q(0.030);

/**
 * Morale floor multiplier on birth rate.
 *
 * Birth rate factor = `BIRTH_RATE_MORALE_FLOOR_Q + moraleQ`, yielding:
 *   moraleQ = 0        → factor = q(0.50) → birth rate × 0.50
 *   moraleQ = SCALE.Q  → factor = q(1.50) → birth rate × 1.50
 */
export const BIRTH_RATE_MORALE_FLOOR_Q: Q = q(0.50);

/**
 * Additional annual death rate at zero stability.
 * Linearly scaled by `(SCALE.Q − stabilityQ) / SCALE.Q`.
 * Full bonus at stability = 0; zero at stability = SCALE.Q.
 */
export const INSTABILITY_DEATH_ANNUAL_Q: Q = q(0.015);

/** Food supply fraction below which famine is active [0, SCALE.Q]. */
export const FAMINE_THRESHOLD_Q: Q = q(0.20);

/** Additional annual death rate during famine (+3%/year on top of baseline). */
export const FAMINE_DEATH_ANNUAL_Q: Q = q(0.030);

/**
 * Peak famine-driven migration push pressure (at food = 0).
 * Integrates with Phase-81 `computePushPressure` as an additive bonus.
 */
export const FAMINE_MIGRATION_PUSH_Q: Q = q(0.30);

/**
 * Tech-era multiplier applied to the baseline death rate.
 * Better technology → lower mortality from disease and malnutrition.
 * Expressed as a Q fraction of SCALE.Q.
 */
export const TECH_ERA_DEATH_MUL: Record<string, number> = {
  "Stone":        SCALE.Q,                         // no reduction
  "Bronze":       Math.round(SCALE.Q * 0.95),      // −5%
  "Iron":         Math.round(SCALE.Q * 0.90),      // −10%
  "Medieval":     Math.round(SCALE.Q * 0.85),      // −15%
  "Renaissance":  Math.round(SCALE.Q * 0.80),      // −20%
  "Industrial":   Math.round(SCALE.Q * 0.65),      // −35%
  "Modern":       Math.round(SCALE.Q * 0.50),      // −50%
};

/**
 * Soft carrying capacity by tech era.
 * `stepPolityPopulation` does not enforce it — host checks `isOverCapacity`
 * and applies extra emigration pressure via Phase-81 if desired.
 */
export const CARRYING_CAPACITY_BY_ERA: Record<string, number> = {
  "Stone":           50_000,
  "Bronze":         200_000,
  "Iron":           500_000,
  "Medieval":     2_000_000,
  "Renaissance":  5_000_000,
  "Industrial":  20_000_000,
  "Modern":     200_000_000,
};

// ── Result types ──────────────────────────────────────────────────────────────

/** Outcome of a single `stepPolityPopulation` call. */
export interface DemographicsStepResult {
  /** Signed population change (positive = growth, negative = decline). */
  popDelta:             number;
  /** New population after applying delta (clamped to ≥ 0). */
  newPopulation:        number;
  /** Effective annual birth rate used this step. */
  effectiveBirthRate_Q: Q;
  /** Effective annual death rate used this step (all pressures included). */
  effectiveDeathRate_Q: Q;
  /** Whether famine was active this step. */
  famine:               boolean;
}

// ── Rate computation ──────────────────────────────────────────────────────────

/**
 * Compute the effective annual birth rate for a polity [Q = fraction/year].
 *
 * Morale scales birth rate linearly between 50% and 150% of baseline:
 *   moraleQ = 0        → BASELINE × 0.50  (≈ 1.75%/year)
 *   moraleQ = SCALE.Q  → BASELINE × 1.50  (≈ 5.25%/year)
 */
export function computeBirthRate(polity: Polity): Q {
  // factor ∈ [q(0.50), q(1.50)] = [5000, 15000]
  const factor = BIRTH_RATE_MORALE_FLOOR_Q + polity.moraleQ;
  return clampQ(mulDiv(BASELINE_BIRTH_RATE_ANNUAL_Q, factor, SCALE.Q), 0, SCALE.Q);
}

/**
 * Compute the effective annual death rate for a polity [Q = fraction/year].
 *
 * Factors (additive):
 * 1. Baseline reduced by tech era (better medicine / nutrition).
 * 2. Instability bonus: up to `INSTABILITY_DEATH_ANNUAL_Q` at stability = 0.
 * 3. External death pressure (caller: Phase-56 epidemic or Phase-84 siege casualties).
 * 4. Famine bonus: `FAMINE_DEATH_ANNUAL_Q` when `foodSupply_Q < FAMINE_THRESHOLD_Q`.
 *
 * @param deathPressure_Q  Annual mortality fraction from external cause.
 * @param foodSupply_Q     Current food supply [0, SCALE.Q]; omit if unknown.
 */
export function computeDeathRate(
  polity:           Polity,
  deathPressure_Q?: Q,
  foodSupply_Q?:    Q,
): Q {
  const techMul     = TECH_ERA_DEATH_MUL[polity.techEra] ?? SCALE.Q;
  const techBase    = mulDiv(BASELINE_DEATH_RATE_ANNUAL_Q, techMul, SCALE.Q);
  const instFrac    = SCALE.Q - polity.stabilityQ;                   // [0, SCALE.Q]
  const instDeath   = mulDiv(INSTABILITY_DEATH_ANNUAL_Q, instFrac, SCALE.Q);
  const famine      = foodSupply_Q != null && foodSupply_Q < FAMINE_THRESHOLD_Q;
  const famineBonus = famine ? FAMINE_DEATH_ANNUAL_Q : 0;
  const pressure    = deathPressure_Q ?? 0;
  return clampQ(techBase + instDeath + famineBonus + pressure, 0, SCALE.Q);
}

/**
 * Compute the net annual growth rate (birth rate − death rate).
 * Negative values indicate population decline.
 */
export function computeNetGrowthRate(
  polity:           Polity,
  deathPressure_Q?: Q,
  foodSupply_Q?:    Q,
): number {
  return computeBirthRate(polity) - computeDeathRate(polity, deathPressure_Q, foodSupply_Q);
}

// ── Population step ───────────────────────────────────────────────────────────

/**
 * Step polity population forward by `elapsedDays` simulated days.
 *
 * Mutates `polity.population` in place and returns step metadata.
 *
 * Delta formula (fixed-point, single rounding):
 *   `popDelta = round(population × netAnnualRate_Q × elapsedDays / (365 × SCALE.Q))`
 *
 * @param elapsedDays     Number of simulated days to advance (typically 1–30).
 * @param deathPressure_Q Annual mortality fraction from disease or siege casualties.
 * @param foodSupply_Q    Food supply level [0, SCALE.Q]; famine fires below
 *                        `FAMINE_THRESHOLD_Q`.
 */
export function stepPolityPopulation(
  polity:           Polity,
  elapsedDays:      number,
  deathPressure_Q?: Q,
  foodSupply_Q?:    Q,
): DemographicsStepResult {
  const birthRate = computeBirthRate(polity);
  const deathRate = computeDeathRate(polity, deathPressure_Q, foodSupply_Q);
  const netRate   = birthRate - deathRate;
  const famine    = foodSupply_Q != null && foodSupply_Q < FAMINE_THRESHOLD_Q;

  const rawDelta    = Math.round(polity.population * netRate * elapsedDays / (365 * SCALE.Q));
  const newPop      = Math.max(0, polity.population + rawDelta);
  polity.population = newPop;

  return {
    popDelta:             rawDelta,
    newPopulation:        newPop,
    effectiveBirthRate_Q: birthRate,
    effectiveDeathRate_Q: deathRate,
    famine,
  };
}

// ── Famine ────────────────────────────────────────────────────────────────────

/**
 * Compute famine-driven migration push pressure [0, SCALE.Q].
 *
 * Zero at or above `FAMINE_THRESHOLD_Q`.  Scales linearly from zero (at the
 * threshold) to `FAMINE_MIGRATION_PUSH_Q` (at food = 0).
 *
 * Add the result to Phase-81 `computePushPressure` output.
 */
export function computeFamineMigrationPush(foodSupply_Q: Q): Q {
  if (foodSupply_Q >= FAMINE_THRESHOLD_Q) return 0 as Q;
  const deficit = FAMINE_THRESHOLD_Q - foodSupply_Q;   // (0, FAMINE_THRESHOLD_Q]
  return clampQ(mulDiv(FAMINE_MIGRATION_PUSH_Q, deficit, FAMINE_THRESHOLD_Q), 0, SCALE.Q);
}

// ── Carrying capacity ─────────────────────────────────────────────────────────

/**
 * Soft carrying capacity for a polity based on tech era.
 *
 * `stepPolityPopulation` does not enforce this cap.  The host should call
 * `isOverCapacity` after each step and pass additional emigration pressure
 * to Phase-81 when it returns `true`.
 */
export function computeCarryingCapacity(polity: Polity): number {
  return CARRYING_CAPACITY_BY_ERA[polity.techEra] ?? 50_000;
}

/** Return `true` if the polity's population exceeds its tech-era carrying capacity. */
export function isOverCapacity(polity: Polity): boolean {
  return polity.population > computeCarryingCapacity(polity);
}

// ── Reporting utilities ───────────────────────────────────────────────────────

/**
 * Estimate annual births from a birth rate and population.
 * Useful for host display and scenario planning.
 */
export function estimateAnnualBirths(population: number, birthRate_Q: Q): number {
  return Math.round(population * birthRate_Q / SCALE.Q);
}

/**
 * Estimate annual deaths from a death rate and population.
 */
export function estimateAnnualDeaths(population: number, deathRate_Q: Q): number {
  return Math.round(population * deathRate_Q / SCALE.Q);
}
