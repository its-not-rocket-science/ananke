// src/epidemic.ts — Phase 88: Epidemic Spread at Polity Scale
//
// Models disease prevalence in polity populations as a Q fraction of population
// [0, SCALE.Q].  Uses Phase-56 DiseaseProfile for disease properties.
// A discrete logistic model governs growth and recovery each step.
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `PolityEpidemicState` tracks prevalence per (polity, disease) pair.
//   - `computeEpidemicDeathPressure` produces the `deathPressure_Q` annual rate
//     consumed by Phase-86 `stepPolityPopulation`.
//   - `spreadEpidemic` models contact-driven inter-polity transmission via
//     Phase-83 trade route volume or Phase-81 migration flow intensity.
//   - `computeEpidemicMigrationPush` adds flight pressure to Phase-81.
//
// Integration:
//   Phase 56 (Disease):     reuses `DiseaseProfile` (transmissionRoute, mortalityRate_Q, etc.).
//   Phase 61 (Polity):      techEra drives `deriveHealthCapacity`.
//   Phase 81 (Migration):   `computeEpidemicMigrationPush` as additive push bonus.
//   Phase 83 (Trade Routes): trade contact intensity drives inter-polity spread.
//   Phase 86 (Demography):  `computeEpidemicDeathPressure` → `deathPressure_Q` param.

import { q, SCALE, clampQ, mulDiv } from "./units.js";
import type { Q }                   from "./units.js";
import type { Polity }              from "./polity.js";
import type { DiseaseProfile }      from "./sim/disease.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Epidemic state for one disease in one polity.
 * Attach one record per active disease; store externally (e.g. `Map<string, PolityEpidemicState[]>`).
 */
export interface PolityEpidemicState {
  polityId:     string;
  diseaseId:    string;
  /** Infected fraction of population [0, SCALE.Q]. */
  prevalence_Q: Q;
}

/** Outcome of a single `stepEpidemic` call. */
export interface EpidemicStepResult {
  /** New prevalence after the step. */
  newPrevalence_Q: Q;
  /** Signed change in prevalence. */
  delta_Q:         number;
  /** Whether the epidemic is now contained (prevalence ≤ EPIDEMIC_CONTAINED_Q). */
  contained:       boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Prevalence at or below this value is considered "contained" — epidemic
 * no longer produces meaningful mortality or migration pressure.
 */
export const EPIDEMIC_CONTAINED_Q: Q = q(0.01);

/**
 * Base daily growth rate of prevalence per susceptible unit.
 *
 * Logistic growth: `growthDelta = prevalence × (SCALE.Q − prevalence) × GROWTH_RATE / SCALE.Q²`
 * The actual rate is further scaled by `profile.baseTransmissionRate_Q`.
 */
export const EPIDEMIC_BASE_GROWTH_RATE_Q: Q = q(0.05);

/**
 * Base daily recovery rate (natural immunity + mortality removes infecteds).
 * Scaled by `healthCapacity_Q`: better medicine → faster clearance.
 */
export const EPIDEMIC_BASE_RECOVERY_RATE_Q: Q = q(0.02);

/**
 * Maximum additional daily recovery from maximum `healthCapacity_Q`.
 * At healthCapacity = SCALE.Q: recovery rate += this value.
 */
export const EPIDEMIC_HEALTH_RECOVERY_BONUS_Q: Q = q(0.04);

/**
 * Peak migration push pressure from a severe epidemic (at full prevalence).
 * Integrates with Phase-81 `computePushPressure` as additive bonus.
 */
export const EPIDEMIC_MIGRATION_PUSH_MAX_Q: Q = q(0.20);

/**
 * Minimum symptom severity that generates significant migration push.
 * Below this threshold `computeEpidemicMigrationPush` returns reduced pressure.
 */
export const EPIDEMIC_SEVERITY_THRESHOLD_Q: Q = q(0.30);

/** Health-care capacity by tech era [0, SCALE.Q]. */
export const HEALTH_CAPACITY_BY_ERA: Record<string, Q> = {
  "Stone":        q(0.05),
  "Bronze":       q(0.15),
  "Iron":         q(0.25),
  "Medieval":     q(0.40),
  "Renaissance":  q(0.60),
  "Industrial":   q(0.80),
  "Modern":       q(0.99),
};

// ── Factory ───────────────────────────────────────────────────────────────────

/** Create a new epidemic state for a polity. */
export function createEpidemicState(
  polityId:            string,
  diseaseId:           string,
  initialPrevalence_Q: Q = q(0.01) as Q,
): PolityEpidemicState {
  return {
    polityId,
    diseaseId,
    prevalence_Q: clampQ(initialPrevalence_Q, 0, SCALE.Q),
  };
}

// ── Health capacity ───────────────────────────────────────────────────────────

/**
 * Derive health-care capacity [0, SCALE.Q] for a polity from its tech era.
 *
 * Hosts may blend this with morale or stability for a richer model.
 */
export function deriveHealthCapacity(polity: Polity): Q {
  return (HEALTH_CAPACITY_BY_ERA[polity.techEra] ?? q(0.05)) as Q;
}

// ── Death pressure ────────────────────────────────────────────────────────────

/**
 * Compute annual death pressure [Q = fraction/year] from an active epidemic.
 *
 * Formula: `prevalence_Q × mortalityRate_Q / SCALE.Q`
 *
 * Pass the result as `deathPressure_Q` to Phase-86 `stepPolityPopulation`.
 */
export function computeEpidemicDeathPressure(
  state:   PolityEpidemicState,
  profile: DiseaseProfile,
): Q {
  return clampQ(mulDiv(state.prevalence_Q, profile.mortalityRate_Q, SCALE.Q), 0, SCALE.Q);
}

// ── Epidemic step ─────────────────────────────────────────────────────────────

/**
 * Advance epidemic prevalence for `elapsedDays` days.
 *
 * **Logistic growth model** (daily, applied `elapsedDays` times via single formula):
 *
 * ```
 * susceptible_Q  = SCALE.Q − prevalence_Q
 * growthDelta_Q  = prevalence_Q × susceptible_Q × GROWTH_RATE × transmissionRate
 *                  / SCALE.Q³
 * recoveryDelta_Q = prevalence_Q × (RECOVERY_RATE + healthBonus) / SCALE.Q
 * netDelta_Q     = (growthDelta − recoveryDelta) × elapsedDays
 * ```
 *
 * Prevalence is clamped to [0, SCALE.Q].
 *
 * @param healthCapacity_Q  [0, SCALE.Q] tech-era / infrastructure health bonus.
 *                          Derive via `deriveHealthCapacity(polity)`.
 */
export function stepEpidemic(
  state:             PolityEpidemicState,
  profile:           DiseaseProfile,
  elapsedDays:       number,
  healthCapacity_Q?: Q,
): EpidemicStepResult {
  const prev         = state.prevalence_Q;
  const susceptible  = clampQ(SCALE.Q - prev, 0, SCALE.Q);
  const healthBonus  = healthCapacity_Q != null
    ? mulDiv(EPIDEMIC_HEALTH_RECOVERY_BONUS_Q, healthCapacity_Q, SCALE.Q)
    : 0;
  const recoveryRate = EPIDEMIC_BASE_RECOVERY_RATE_Q + healthBonus;

  // Growth: logistic — fast when few infected; slows as susceptibles run out
  // growthDelta = prev × susceptible × BASE_GROWTH × transmissionRate / SCALE.Q³
  const step1       = mulDiv(prev, susceptible, SCALE.Q);                        // prev × susc / SCALE.Q
  const step2       = mulDiv(step1, EPIDEMIC_BASE_GROWTH_RATE_Q, SCALE.Q);       // × GROWTH / SCALE.Q
  const growthDaily = mulDiv(step2, profile.baseTransmissionRate_Q, SCALE.Q);    // × transmRate / SCALE.Q

  // Recovery: linear proportion of current prevalence
  const recoveryDaily = mulDiv(prev, recoveryRate, SCALE.Q);

  const netDaily = growthDaily - recoveryDaily;
  const delta    = Math.round(netDaily * elapsedDays);

  const newPrev = clampQ(prev + delta, 0, SCALE.Q);
  state.prevalence_Q = newPrev;

  return {
    newPrevalence_Q: newPrev,
    delta_Q:         delta,
    contained:       newPrev <= EPIDEMIC_CONTAINED_Q,
  };
}

// ── Inter-polity spread ───────────────────────────────────────────────────────

/**
 * Compute the prevalence increase introduced into a target polity from a source.
 *
 * The `contactIntensity_Q` captures how connected the polities are:
 * - Trade route efficiency or volume → high contact
 * - Migration flow fraction → moderate contact
 * - No trade/migration → zero
 *
 * Formula: `sourcePrevalence × contactIntensity × transmissionRate / SCALE.Q²`
 *
 * Returns 0 if the source epidemic is contained.
 */
export function computeSpreadToPolity(
  source:            PolityEpidemicState,
  profile:           DiseaseProfile,
  contactIntensity_Q: Q,
): Q {
  if (source.prevalence_Q <= EPIDEMIC_CONTAINED_Q) return 0 as Q;
  const step1 = mulDiv(source.prevalence_Q, contactIntensity_Q, SCALE.Q);
  return clampQ(mulDiv(step1, profile.baseTransmissionRate_Q, SCALE.Q), 0, SCALE.Q);
}

/**
 * Introduce disease from a source polity into a target polity.
 *
 * Creates a new `PolityEpidemicState` for the target if the computed spread
 * exceeds `EPIDEMIC_CONTAINED_Q`.  If the disease is already present in the
 * target the existing state's prevalence is increased.
 *
 * Returns the state that was created or modified, or `undefined` if the
 * spread was below the contained threshold.
 */
export function spreadEpidemic(
  sourceState:        PolityEpidemicState,
  profile:            DiseaseProfile,
  targetPolityId:     string,
  contactIntensity_Q: Q,
  existingState?:     PolityEpidemicState,
): PolityEpidemicState | undefined {
  const added = computeSpreadToPolity(sourceState, profile, contactIntensity_Q);
  if (added <= EPIDEMIC_CONTAINED_Q) return undefined;

  if (existingState) {
    existingState.prevalence_Q = clampQ(existingState.prevalence_Q + added, 0, SCALE.Q);
    return existingState;
  }
  return createEpidemicState(targetPolityId, profile.id, added);
}

// ── Migration push ────────────────────────────────────────────────────────────

/**
 * Compute epidemic-driven migration push pressure [0, SCALE.Q].
 *
 * Pressure scales with both prevalence and symptom severity.
 * Only fires when `profile.symptomSeverity_Q >= EPIDEMIC_SEVERITY_THRESHOLD_Q`.
 *
 * Formula: `prevalence × severity × MIGRATION_PUSH_MAX / SCALE.Q²`
 *
 * Add the result to Phase-81 `computePushPressure` output.
 */
export function computeEpidemicMigrationPush(
  state:   PolityEpidemicState,
  profile: DiseaseProfile,
): Q {
  if (profile.symptomSeverity_Q < EPIDEMIC_SEVERITY_THRESHOLD_Q) return 0 as Q;
  const step1 = mulDiv(state.prevalence_Q, profile.symptomSeverity_Q, SCALE.Q);
  return clampQ(mulDiv(step1, EPIDEMIC_MIGRATION_PUSH_MAX_Q, SCALE.Q), 0, SCALE.Q);
}
