




























// src/containment.ts — Phase 98: Plague Containment & Quarantine
//
// Active polity-level response to epidemic outbreaks.  Sits above Phase-88
// (Epidemic) as the policy layer, just as Phase-97 (Famine) sits above Phase-87.
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `ContainmentState` tracks active policy, days enforced, and compliance decay.
//     Store one per polity externally (e.g. `Map<string, ContainmentState>`).
//   - `computeEffectiveTransmissionReduction` factors in compliance decay — strict
//     lockdowns erode over time as populations resist enforcement.
//   - `applyQuarantineToContact` scales the `contactIntensity_Q` parameter passed
//     to Phase-88 `spreadEpidemic` / `computeSpreadToPolity`.
//   - `computeContainmentHealthBonus` stacks with Phase-88 `deriveHealthCapacity`
//     as the `healthCapacity_Q` bonus passed to `stepEpidemic`.
//   - Cost, unrest, and health bonus are all advisory; callers apply them.
//
// Integration:
//   Phase 88 (Epidemic):   applyQuarantineToContact → contactIntensity_Q;
//                          computeContainmentHealthBonus → healthCapacity_Q bonus.
//   Phase 90 (Unrest):     computeContainmentUnrest → unrestPressure_Q.
//   Phase 92 (Taxation):   computeContainmentCost_cu → daily treasury drain.
//   Phase 97 (Famine):     simultaneous famine+plague compounds; host stacks pressures.
//   Phase 96 (Climate):    plague_season epidemicGrowthBonus may prompt policy change.

import { q, SCALE, clampQ, mulDiv } from "./units.js";
import type { Q }                   from "./units.js";
import type { Polity }              from "./polity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Polity-level quarantine policy tier. */
export type QuarantinePolicy =
  | "none"
  | "voluntary"       // public guidance; population complies voluntarily
  | "enforced"        // legal mandate; enforcement personnel required
  | "total_lockdown"; // full movement prohibition; military enforcement

/**
 * Per-polity containment tracking state.
 * Attach one per polity; store externally (e.g. `Map<string, ContainmentState>`).
 */
export interface ContainmentState {
  polityId: string;
  policy: QuarantinePolicy;
  /** Days the current policy has been continuously active. */
  daysActive: number;
  /**
   * Accumulated non-compliance [0, SCALE.Q].
   * Rises each day a strict policy is maintained; resets when policy changes.
   * Reduces effective transmission reduction as populations resist enforcement.
   */
  complianceDecay_Q: Q;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Base transmission reduction fraction per policy tier [0, SCALE.Q].
 * Applied to `contactIntensity_Q` in Phase-88 spread calculations.
 * Actual effect is scaled down by `(SCALE.Q − complianceDecay_Q) / SCALE.Q`.
 */
export const QUARANTINE_TRANSMISSION_REDUCTION_Q: Record<QuarantinePolicy, Q> = {
  none:           0 as Q,
  voluntary:      q(0.20) as Q,
  enforced:       q(0.55) as Q,
  total_lockdown: q(0.85) as Q,
};

/**
 * Health capacity bonus per policy tier [0, SCALE.Q].
 * Stack with Phase-88 `deriveHealthCapacity` as additive bonus to `healthCapacity_Q`.
 * Reflects improved isolation, triage, and care coordination.
 */
export const QUARANTINE_HEALTH_BONUS_Q: Record<QuarantinePolicy, Q> = {
  none:           0 as Q,
  voluntary:      q(0.05) as Q,
  enforced:       q(0.15) as Q,
  total_lockdown: q(0.25) as Q,
};

/** Unrest pressure per policy tier [0, SCALE.Q]. Pass to Phase-90 `computeUnrestLevel`. */
export const QUARANTINE_UNREST_Q: Record<QuarantinePolicy, Q> = {
  none:           0 as Q,
  voluntary:      q(0.02) as Q,
  enforced:       q(0.12) as Q,
  total_lockdown: q(0.28) as Q,
};

/**
 * Daily treasury cost per 1,000 population by policy tier [cu].
 * Scale: `computeContainmentCost_cu = cost × population / 1000 × elapsedDays`.
 */
export const QUARANTINE_DAILY_COST_PER_1000: Record<QuarantinePolicy, number> = {
  none:           0,
  voluntary:      1,   // public messaging, basic clinics
  enforced:       5,   // enforcement personnel, field hospitals
  total_lockdown: 15,  // military deployment, supply distribution
};

/**
 * Compliance decay accrued per day by policy tier [out of SCALE.Q].
 * Voluntary: minimal decay (people accept guidance).
 * Total lockdown: fast erosion (coercion breeds resistance).
 */
export const COMPLIANCE_DECAY_PER_DAY: Record<QuarantinePolicy, number> = {
  none:           0,
  voluntary:      2,
  enforced:       8,
  total_lockdown: 18,
};

// ── Factory ───────────────────────────────────────────────────────────────────

/** Create a `ContainmentState` with no active quarantine policy. */
export function createContainmentState(polityId: string): ContainmentState {
  return {
    polityId,
    policy:           "none",
    daysActive:       0,
    complianceDecay_Q: 0 as Q,
  };
}

// ── Policy management ─────────────────────────────────────────────────────────

/**
 * Change the active quarantine policy.
 *
 * Resets `daysActive` and `complianceDecay_Q` — a policy change resets the
 * population's compliance posture (initial goodwill or fear of the new measure).
 */
export function changeQuarantinePolicy(
  state:     ContainmentState,
  newPolicy: QuarantinePolicy,
): void {
  state.policy           = newPolicy;
  state.daysActive       = 0;
  state.complianceDecay_Q = 0 as Q;
}

// ── Effectiveness computation ─────────────────────────────────────────────────

/**
 * Compute the effective transmission reduction fraction [0, SCALE.Q],
 * factoring in accumulated compliance decay.
 *
 * `effective = baseReduction × (SCALE.Q − complianceDecay_Q) / SCALE.Q`
 */
export function computeEffectiveTransmissionReduction(state: ContainmentState): Q {
  const base    = QUARANTINE_TRANSMISSION_REDUCTION_Q[state.policy];
  const compliance = SCALE.Q - state.complianceDecay_Q;
  return clampQ(mulDiv(base, compliance, SCALE.Q), 0, SCALE.Q);
}

/**
 * Compute the health capacity bonus from active quarantine [0, SCALE.Q].
 * Add to the output of Phase-88 `deriveHealthCapacity(polity)`.
 * The bonus also decays with compliance.
 */
export function computeContainmentHealthBonus(state: ContainmentState): Q {
  const base       = QUARANTINE_HEALTH_BONUS_Q[state.policy];
  const compliance = SCALE.Q - state.complianceDecay_Q;
  return clampQ(mulDiv(base, compliance, SCALE.Q), 0, SCALE.Q);
}

/**
 * Compute the unrest pressure from the current quarantine policy [0, SCALE.Q].
 *
 * Unrest grows as compliance erodes — a partially-enforced lockdown is more
 * resented than a fresh voluntary advisory.
 * `unrest = baseUnrest + decayFraction × baseUnrest / SCALE.Q`
 */
export function computeContainmentUnrest(state: ContainmentState): Q {
  const base = QUARANTINE_UNREST_Q[state.policy];
  if (base === 0) return 0 as Q;
  const decayBonus = mulDiv(base, state.complianceDecay_Q, SCALE.Q);
  return clampQ(base + decayBonus, 0, SCALE.Q);
}

/**
 * Compute the daily treasury cost of the active quarantine policy.
 *
 * `cost = DAILY_COST_PER_1000 × population / 1000 × elapsedDays`
 */
export function computeContainmentCost_cu(
  polity:      Polity,
  state:       ContainmentState,
  elapsedDays: number,
): number {
  const costPer1k = QUARANTINE_DAILY_COST_PER_1000[state.policy];
  return Math.round(costPer1k * polity.population / 1000 * elapsedDays);
}

// ── State step ────────────────────────────────────────────────────────────────

/**
 * Advance containment state by `elapsedDays`.
 *
 * - Increments `daysActive`.
 * - Accrues `complianceDecay_Q` at `COMPLIANCE_DECAY_PER_DAY[policy]`; clamped to SCALE.Q.
 *   Policy "none" does not decay (nothing to comply with).
 */
export function stepContainment(
  state:       ContainmentState,
  elapsedDays: number,
): void {
  state.daysActive += elapsedDays;
  const decay = COMPLIANCE_DECAY_PER_DAY[state.policy] * elapsedDays;
  state.complianceDecay_Q = clampQ(state.complianceDecay_Q + decay, 0, SCALE.Q) as Q;
}

// ── Integration helpers ───────────────────────────────────────────────────────

/**
 * Scale down a Phase-88 `contactIntensity_Q` by the effective quarantine reduction.
 *
 * Pass the returned value to `spreadEpidemic` or `computeSpreadToPolity`:
 * ```ts
 * const adjContact = applyQuarantineToContact(tradeIntensity_Q, containmentState);
 * computeSpreadToPolity(source, profile, adjContact);
 * ```
 */
export function applyQuarantineToContact(
  contactIntensity_Q: Q,
  state:              ContainmentState,
): Q {
  const reduction = computeEffectiveTransmissionReduction(state);
  const reduced   = mulDiv(contactIntensity_Q, reduction, SCALE.Q);
  return clampQ(contactIntensity_Q - reduced, 0, SCALE.Q);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return `true` when any active containment policy is in effect. */
export function isQuarantineActive(state: ContainmentState): boolean {
  return state.policy !== "none";
}

/** Return `true` when the current policy is the most restrictive tier. */
export function isTotalLockdown(state: ContainmentState): boolean {
  return state.policy === "total_lockdown";
}
