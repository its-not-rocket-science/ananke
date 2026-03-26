// src/famine.ts — Phase 97: Famine Relief & Rationing
//
// Graduated famine severity tracking, rationing policies, and emergency food
// relief for polities.  Sits above Phase-87 (Granary) as the active response layer.
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `FamineState` tracks famine phase, days in phase, and cumulative severity.
//     Store one per polity externally; pass to step functions each tick.
//   - `computeFaminePressures` returns an advisory bundle; callers pass fields into
//     Phase-86 (deathBonus), Phase-81 (migrationPush), and Phase-90 (unrest).
//   - `stepRationedGranary` replaces Phase-87 `stepGranaryConsumption` when a
//     rationing policy is active.
//   - `computeReliefImport` converts `treasury_cu` to grain — treasury and granary
//     are mutated in-place; caller supplies granary capacity.
//
// Integration:
//   Phase 86 (Demography):  deathBonus_Q supplements Phase-86 FAMINE_DEATH_ANNUAL_Q.
//   Phase 87 (Granary):     computeFoodSupply_Q → foodSupply_Q; stepRationedGranary.
//   Phase 81 (Migration):   migrationPush_Q passed to computePushPressure.
//   Phase 90 (Unrest):      unrestPressure_Q passed to computeUnrestLevel.
//   Phase 96 (Climate):     harvestYieldPenalty worsens foodSupply_Q that drives here.

import { q, SCALE, clampQ } from "./units.js";
import type { Q }           from "./units.js";
import type { Polity }      from "./polity.js";
import type { GranaryState } from "./granary.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Graduated severity of a food crisis. */
export type FaminePhase = "none" | "shortage" | "famine" | "catastrophe";

/** Polity policy for reducing per-capita food consumption below normal demand. */
export type RationingPolicy = "none" | "tight" | "emergency" | "starvation_rations";

/**
 * Per-polity famine tracking state.
 * Attach one to each polity; store externally (e.g. `Map<string, FamineState>`).
 */
export interface FamineState {
  polityId: string;
  phase: FaminePhase;
  /** Days spent continuously in the current phase. Resets when phase changes. */
  daysInPhase: number;
  /**
   * Long-term famine damage [0, SCALE.Q].
   * Accrues during famine/catastrophe (depleted seed grain, dead workers, trauma).
   * Decays slowly once food supply recovers to "none".
   */
  cumulativeSeverity_Q: Q;
}

/**
 * Advisory pressure bundle for downstream phases.
 * All fields [0, SCALE.Q] unless noted.
 */
export interface FaminePressures {
  /** Additional annual death rate. Supplement Phase-86 `deathPressure_Q`. */
  deathBonus_Q:     Q;
  /** Migration push. Pass to Phase-81 `computePushPressure`. */
  migrationPush_Q:  Q;
  /** Combined famine + rationing unrest. Pass to Phase-90 `computeUnrestLevel`. */
  unrestPressure_Q: Q;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** `foodSupply_Q` below this → shortage phase. */
export const SHORTAGE_THRESHOLD_Q:     Q = q(0.50) as Q;
/** `foodSupply_Q` below this → famine phase. */
export const FAMINE_THRESHOLD_Q:       Q = q(0.20) as Q;
/** `foodSupply_Q` below this → catastrophe phase. */
export const CATASTROPHE_THRESHOLD_Q:  Q = q(0.05) as Q;

/**
 * Additional annual death rate by famine phase [Q].
 * Phase-86 already applies `FAMINE_DEATH_ANNUAL_Q = q(0.030)` at famine threshold;
 * these bonuses are additive on top for graduated severity.
 */
export const FAMINE_PHASE_DEATH_Q: Record<FaminePhase, Q> = {
  none:        0 as Q,
  shortage:    q(0.010) as Q,   // +1%/year
  famine:      q(0.030) as Q,   // +3%/year (stacks with Ph-86 +3%)
  catastrophe: q(0.070) as Q,   // +7%/year
};

/** Migration push pressure by famine phase [0, SCALE.Q]. */
export const FAMINE_PHASE_MIGRATION_Q: Record<FaminePhase, Q> = {
  none:        0 as Q,
  shortage:    q(0.08) as Q,
  famine:      q(0.25) as Q,
  catastrophe: q(0.50) as Q,
};

/** Base unrest pressure by famine phase [0, SCALE.Q]. */
export const FAMINE_PHASE_UNREST_Q: Record<FaminePhase, Q> = {
  none:        0 as Q,
  shortage:    q(0.05) as Q,
  famine:      q(0.15) as Q,
  catastrophe: q(0.30) as Q,
};

/**
 * Consumption reduction fraction per rationing policy [0, SCALE.Q].
 * Applied to `polity.population × elapsedDays` to give actual su demand.
 */
export const RATIONING_REDUCTION_Q: Record<RationingPolicy, Q> = {
  none:               0 as Q,
  tight:              q(0.20) as Q,
  emergency:          q(0.40) as Q,
  starvation_rations: q(0.60) as Q,
};

/** Unrest pressure added by rationing policy itself [0, SCALE.Q]. */
export const RATIONING_UNREST_Q: Record<RationingPolicy, Q> = {
  none:               0 as Q,
  tight:              q(0.04) as Q,
  emergency:          q(0.12) as Q,
  starvation_rations: q(0.25) as Q,
};

/** Treasury cost in cu per supply unit of emergency food import (1 su = 1 person-day). */
export const RELIEF_IMPORT_COST_CU_PER_SU = 2;

/**
 * Cumulative severity change per day by famine phase [out of SCALE.Q].
 * Negative values → decay; positive values → accrual.
 */
export const SEVERITY_DELTA_PER_DAY: Record<FaminePhase, number> = {
  none:        -5,
  shortage:     2,
  famine:      10,
  catastrophe: 25,
};

// ── Factory ───────────────────────────────────────────────────────────────────

/** Create a fresh `FamineState` for a polity (no active famine, zero severity). */
export function createFamineState(polityId: string): FamineState {
  return {
    polityId,
    phase:                "none",
    daysInPhase:          0,
    cumulativeSeverity_Q: 0 as Q,
  };
}

// ── Phase classification ───────────────────────────────────────────────────────

/**
 * Classify the current famine phase from the granary food supply fraction.
 *
 * Obtain `foodSupply_Q` from Phase-87 `computeFoodSupply_Q(polity, granary)`.
 */
export function computeFaminePhase(foodSupply_Q: Q): FaminePhase {
  if (foodSupply_Q < CATASTROPHE_THRESHOLD_Q) return "catastrophe";
  if (foodSupply_Q < FAMINE_THRESHOLD_Q)      return "famine";
  if (foodSupply_Q < SHORTAGE_THRESHOLD_Q)    return "shortage";
  return "none";
}

// ── Pressure computation ──────────────────────────────────────────────────────

/**
 * Compute the advisory pressure bundle for the current famine state and rationing policy.
 *
 * `unrestPressure_Q` sums famine unrest with rationing unrest, clamped to SCALE.Q.
 */
export function computeFaminePressures(
  state:  FamineState,
  policy: RationingPolicy = "none",
): FaminePressures {
  const phase  = state.phase;
  const unrest = clampQ(FAMINE_PHASE_UNREST_Q[phase] + RATIONING_UNREST_Q[policy], 0, SCALE.Q);
  return {
    deathBonus_Q:     FAMINE_PHASE_DEATH_Q[phase],
    migrationPush_Q:  FAMINE_PHASE_MIGRATION_Q[phase],
    unrestPressure_Q: unrest as Q,
  };
}

// ── State step ────────────────────────────────────────────────────────────────

/**
 * Advance famine state by `elapsedDays`.
 *
 * - Reclassifies `phase` from the current `foodSupply_Q`.
 * - Resets `daysInPhase` to 0 on phase change; otherwise increments.
 * - Accrues or decays `cumulativeSeverity_Q` at `SEVERITY_DELTA_PER_DAY`.
 *
 * Returns `true` if the famine phase changed this step.
 */
export function stepFamine(
  state:        FamineState,
  foodSupply_Q: Q,
  elapsedDays:  number,
): boolean {
  const newPhase     = computeFaminePhase(foodSupply_Q);
  const phaseChanged = newPhase !== state.phase;
  if (phaseChanged) {
    state.phase       = newPhase;
    state.daysInPhase = 0;
  }
  state.daysInPhase += elapsedDays;

  const delta = SEVERITY_DELTA_PER_DAY[state.phase] * elapsedDays;
  state.cumulativeSeverity_Q = clampQ(
    state.cumulativeSeverity_Q + delta, 0, SCALE.Q,
  ) as Q;

  return phaseChanged;
}

// ── Rationing ─────────────────────────────────────────────────────────────────

/**
 * Compute food demand in supply units after applying the rationing reduction.
 *
 * Normal demand = `polity.population × elapsedDays` su.
 * `RATIONING_REDUCTION_Q[policy]` fraction is subtracted before multiplication.
 */
export function computeRationedConsumption(
  polity:      Polity,
  policy:      RationingPolicy,
  elapsedDays: number,
): number {
  const reduction  = RATIONING_REDUCTION_Q[policy];
  const factor     = SCALE.Q - reduction;
  const dailyDemand = Math.round(polity.population * factor / SCALE.Q);
  return dailyDemand * elapsedDays;
}

/**
 * Drain rationed consumption from a granary.
 *
 * Use in place of Phase-87 `stepGranaryConsumption` when a rationing policy is
 * active.  Grain is clamped to 0; returns the actual supply units consumed.
 */
export function stepRationedGranary(
  polity:      Polity,
  granary:     GranaryState,
  policy:      RationingPolicy,
  elapsedDays: number,
): number {
  const demand   = computeRationedConsumption(polity, policy, elapsedDays);
  const consumed = Math.min(demand, granary.grain_su);
  granary.grain_su = Math.max(0, granary.grain_su - demand);
  return consumed;
}

// ── Relief imports ─────────────────────────────────────────────────────────────

/**
 * Spend treasury to import emergency food.
 *
 * Converts up to `budget_cu` of `polity.treasury_cu` into grain at
 * `RELIEF_IMPORT_COST_CU_PER_SU` cu/su, limited by remaining granary space.
 *
 * Mutates `polity.treasury_cu` and `granary.grain_su`.
 * Returns the actual supply units added.
 *
 * @param budget_cu       Max treasury to spend (e.g. pass `polity.treasury_cu` for all-in).
 * @param capacityCap_su  Max granary capacity; derive via Phase-87 `computeCapacity(polity)`.
 */
export function computeReliefImport(
  polity:         Polity,
  granary:        GranaryState,
  budget_cu:      number,
  capacityCap_su: number,
): number {
  const affordable = Math.floor(
    Math.min(budget_cu, polity.treasury_cu) / RELIEF_IMPORT_COST_CU_PER_SU,
  );
  const space = Math.max(0, capacityCap_su - granary.grain_su);
  const added = Math.min(affordable, space);
  granary.grain_su   += added;
  polity.treasury_cu -= added * RELIEF_IMPORT_COST_CU_PER_SU;
  return added;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return `true` when the polity is in any active famine phase. */
export function isFamineActive(state: FamineState): boolean {
  return state.phase !== "none";
}

/** Return `true` when the polity has reached the most severe famine phase. */
export function isCatastrophicFamine(state: FamineState): boolean {
  return state.phase === "catastrophe";
}
