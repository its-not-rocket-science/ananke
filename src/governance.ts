// src/governance.ts — Phase 94: Laws & Governance Codes
//
// The governance type of a polity shapes how effectively it taxes, mobilises
// armies, maintains stability, and advances research.  Law codes are discrete
// enacted policies that provide targeted bonuses and penalties on top of the
// governance baseline.
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `GovernanceState` is stored externally per polity by the host.
//   - `computeGovernanceModifiers` returns a single struct; callers apply each
//     field to the appropriate Phase (92 tax, 91 research, 93 mobilisation, 90 unrest).
//   - Governance changes trigger a stability hit and a cooldown before the
//     next change is allowed.
//   - All arithmetic is integer fixed-point; no floating-point accumulation.
//
// Integration:
//   Phase 61 (Polity):   stabilityQ mutated on governance change.
//   Phase 90 (Unrest):   unrestMitigation_Q reduces effective unrest.
//   Phase 91 (Research): researchBonus added as flat bonus points/day.
//   Phase 92 (Taxation): taxEfficiencyMul scales annual revenue.
//   Phase 93 (Campaign): mobilizationMax_Q overrides default mobilisation cap.

import { q, SCALE, clampQ } from "./units.js";
import type { Q }           from "./units.js";
import type { Polity }      from "./polity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Governance form of a polity. */
export type GovernanceType =
  | "tribal"
  | "monarchy"
  | "oligarchy"
  | "republic"
  | "empire"
  | "theocracy";

/**
 * Modifier bundle derived from a polity's governance type and enacted laws.
 * Each field is a Q multiplier or bonus that callers pass to downstream phases.
 */
export interface GovernanceModifiers {
  /** Multiplier on Phase-92 annual tax revenue [Q]. */
  taxEfficiencyMul_Q:   Q;
  /** Maximum mobilisation fraction override for Phase-93 [Q]. */
  mobilizationMax_Q:    Q;
  /** Flat daily research point bonus for Phase-91 [integer]. */
  researchBonus:        number;
  /**
   * Passive unrest mitigation [Q].
   * Subtract from raw unrest level before Phase-90 thresholds.
   */
  unrestMitigation_Q:   Q;
  /** Passive daily stability increment [Q/day × 100 to avoid sub-unit loss]. */
  stabilityIncrement_Q: Q;
}

/** A discrete enacted law providing targeted modifiers. */
export interface LawCode {
  lawId:                string;
  name:                 string;
  /** Additive bonus to `taxEfficiencyMul_Q` [Q]. */
  taxBonus_Q:           Q;
  /** Additive bonus to `researchBonus` [integer]. */
  researchBonus:        number;
  /** Additive bonus to `mobilizationMax_Q` [Q]. */
  mobilizationBonus_Q:  Q;
  /** Additive bonus to `unrestMitigation_Q` [Q]. */
  unrestBonus_Q:        Q;
  /** Stability cost per day while this law is active [Q]. */
  stabilityCostPerDay_Q: Q;
}

/** Per-polity governance state. Store one externally per polity. */
export interface GovernanceState {
  polityId:       string;
  governanceType: GovernanceType;
  /** IDs of currently enacted laws. Max `MAX_ACTIVE_LAWS`. */
  activeLawIds:   string[];
  /**
   * Cooldown days before governance type can be changed again.
   * `stepGovernanceCooldown` decrements this.
   */
  changeCooldown: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Maximum number of laws that can be active simultaneously.
 */
export const MAX_ACTIVE_LAWS = 5;

/**
 * Stability penalty applied when changing governance type [Q].
 * Represents the upheaval of political transition.
 */
export const GOVERNANCE_CHANGE_STABILITY_HIT_Q: Q = q(0.20);

/**
 * Cooldown days after a governance change before another is allowed.
 */
export const GOVERNANCE_CHANGE_COOLDOWN_DAYS = 365;

/**
 * Baseline governance modifiers for each type.
 * Callers layer law-code bonuses on top.
 */
export const GOVERNANCE_BASE: Record<GovernanceType, GovernanceModifiers> = {
  tribal: {
    taxEfficiencyMul_Q:   q(0.60) as Q,
    mobilizationMax_Q:    q(0.20) as Q,   // can field a larger fraction but untrained
    researchBonus:        0,
    unrestMitigation_Q:   q(0.05) as Q,
    stabilityIncrement_Q: 0 as Q,
  },
  monarchy: {
    taxEfficiencyMul_Q:   q(0.80) as Q,
    mobilizationMax_Q:    q(0.12) as Q,
    researchBonus:        1,
    unrestMitigation_Q:   q(0.08) as Q,
    stabilityIncrement_Q: q(0.001) as Q,
  },
  oligarchy: {
    taxEfficiencyMul_Q:   q(1.00) as Q,   // efficient tax extraction for the elite
    mobilizationMax_Q:    q(0.08) as Q,   // mercenary-reliant, smaller citizen levy
    researchBonus:        2,
    unrestMitigation_Q:   q(0.03) as Q,
    stabilityIncrement_Q: 0 as Q,
  },
  republic: {
    taxEfficiencyMul_Q:   q(0.90) as Q,
    mobilizationMax_Q:    q(0.10) as Q,
    researchBonus:        3,
    unrestMitigation_Q:   q(0.10) as Q,
    stabilityIncrement_Q: q(0.002) as Q,
  },
  empire: {
    taxEfficiencyMul_Q:   q(1.00) as Q,
    mobilizationMax_Q:    q(0.15) as Q,
    researchBonus:        2,
    unrestMitigation_Q:   q(0.12) as Q,
    stabilityIncrement_Q: q(0.001) as Q,
  },
  theocracy: {
    taxEfficiencyMul_Q:   q(0.70) as Q,   // tithes are less efficient than direct tax
    mobilizationMax_Q:    q(0.10) as Q,
    researchBonus:        1,
    unrestMitigation_Q:   q(0.18) as Q,   // religious legitimacy suppresses unrest
    stabilityIncrement_Q: q(0.002) as Q,
  },
};

// ── Preset law codes ──────────────────────────────────────────────────────────

/** Conscription law: larger armies, minor stability cost. */
export const LAW_CONSCRIPTION: LawCode = {
  lawId:                "conscription",
  name:                 "Conscription",
  taxBonus_Q:           0 as Q,
  researchBonus:        0,
  mobilizationBonus_Q:  q(0.03) as Q,
  unrestBonus_Q:        0 as Q,
  stabilityCostPerDay_Q: q(0.001) as Q,
};

/** Tax reform: better tax efficiency, minor unrest from displacing old collectors. */
export const LAW_TAX_REFORM: LawCode = {
  lawId:                "tax_reform",
  name:                 "Tax Reform",
  taxBonus_Q:           q(0.10) as Q,
  researchBonus:        0,
  mobilizationBonus_Q:  0 as Q,
  unrestBonus_Q:        q(0.02) as Q,
  stabilityCostPerDay_Q: 0 as Q,
};

/** Patronage of scholars: research bonus, expensive. */
export const LAW_SCHOLAR_PATRONAGE: LawCode = {
  lawId:                "scholar_patronage",
  name:                 "Scholar Patronage",
  taxBonus_Q:           0 as Q,
  researchBonus:        5,
  mobilizationBonus_Q:  0 as Q,
  unrestBonus_Q:        0 as Q,
  stabilityCostPerDay_Q: 0 as Q,
};

/** Rule of law: stability bonus, research bonus, small unrest mitigation. */
export const LAW_RULE_OF_LAW: LawCode = {
  lawId:                "rule_of_law",
  name:                 "Rule of Law",
  taxBonus_Q:           q(0.05) as Q,
  researchBonus:        1,
  mobilizationBonus_Q:  0 as Q,
  unrestBonus_Q:        q(0.05) as Q,
  stabilityCostPerDay_Q: 0 as Q,
};

/** Martial law: strong unrest mitigation but heavy stability drain. */
export const LAW_MARTIAL_LAW: LawCode = {
  lawId:                "martial_law",
  name:                 "Martial Law",
  taxBonus_Q:           0 as Q,
  researchBonus:        0,
  mobilizationBonus_Q:  q(0.02) as Q,
  unrestBonus_Q:        q(0.12) as Q,
  stabilityCostPerDay_Q: q(0.003) as Q,
};

export const PRESET_LAW_CODES: LawCode[] = [
  LAW_CONSCRIPTION,
  LAW_TAX_REFORM,
  LAW_SCHOLAR_PATRONAGE,
  LAW_RULE_OF_LAW,
  LAW_MARTIAL_LAW,
];

// ── Factory ───────────────────────────────────────────────────────────────────

/** Create a fresh `GovernanceState` with no laws and no cooldown. */
export function createGovernanceState(
  polityId:       string,
  governanceType: GovernanceType = "monarchy",
): GovernanceState {
  return { polityId, governanceType, activeLawIds: [], changeCooldown: 0 };
}

// ── Modifier computation ──────────────────────────────────────────────────────

/**
 * Compute the aggregate `GovernanceModifiers` for the given state plus active laws.
 *
 * Each law's bonuses are added on top of the governance baseline.
 * `taxEfficiencyMul_Q` is clamped to SCALE.Q; others to [0, SCALE.Q].
 *
 * @param lawRegistry  Map of lawId → LawCode.  Pass only enacted laws.
 */
export function computeGovernanceModifiers(
  state:       GovernanceState,
  lawRegistry: Map<string, LawCode> = new Map(),
): GovernanceModifiers {
  const base = GOVERNANCE_BASE[state.governanceType];

  let taxMul       = base.taxEfficiencyMul_Q;
  let mobilMax     = base.mobilizationMax_Q;
  let research     = base.researchBonus;
  let unrestMit    = base.unrestMitigation_Q;
  let stabilityInc = base.stabilityIncrement_Q;

  for (const lawId of state.activeLawIds) {
    const law = lawRegistry.get(lawId);
    if (!law) continue;
    taxMul    = clampQ(taxMul    + law.taxBonus_Q,           0, SCALE.Q) as Q;
    mobilMax  = clampQ(mobilMax  + law.mobilizationBonus_Q,  0, SCALE.Q) as Q;
    research += law.researchBonus;
    unrestMit = clampQ(unrestMit + law.unrestBonus_Q,        0, SCALE.Q) as Q;
    // stability cost from active laws reduces the passive increment
    stabilityInc = clampQ(stabilityInc - law.stabilityCostPerDay_Q, 0, SCALE.Q) as Q;
  }

  return {
    taxEfficiencyMul_Q:   taxMul,
    mobilizationMax_Q:    mobilMax,
    researchBonus:        Math.max(0, research),
    unrestMitigation_Q:   unrestMit,
    stabilityIncrement_Q: stabilityInc,
  };
}

// ── Law management ────────────────────────────────────────────────────────────

/**
 * Enact a new law.  Returns `false` if already enacted or at `MAX_ACTIVE_LAWS`.
 */
export function enactLaw(state: GovernanceState, lawId: string): boolean {
  if (state.activeLawIds.includes(lawId)) return false;
  if (state.activeLawIds.length >= MAX_ACTIVE_LAWS) return false;
  state.activeLawIds.push(lawId);
  return true;
}

/**
 * Repeal an active law.  Returns `false` if the law was not active.
 */
export function repealLaw(state: GovernanceState, lawId: string): boolean {
  const idx = state.activeLawIds.indexOf(lawId);
  if (idx === -1) return false;
  state.activeLawIds.splice(idx, 1);
  return true;
}

// ── Governance change ─────────────────────────────────────────────────────────

/**
 * Change the governance type of a polity.
 *
 * Applies `GOVERNANCE_CHANGE_STABILITY_HIT_Q` to `polity.stabilityQ` and
 * sets `state.changeCooldown = GOVERNANCE_CHANGE_COOLDOWN_DAYS`.
 *
 * Returns `false` (no-op) if:
 * - `newType` is the same as current type.
 * - `state.changeCooldown > 0` (still cooling down).
 */
export function changeGovernance(
  polity:  Polity,
  state:   GovernanceState,
  newType: GovernanceType,
): boolean {
  if (state.governanceType === newType) return false;
  if (state.changeCooldown > 0) return false;

  state.governanceType = newType;
  state.changeCooldown = GOVERNANCE_CHANGE_COOLDOWN_DAYS;
  polity.stabilityQ    = clampQ(
    polity.stabilityQ - GOVERNANCE_CHANGE_STABILITY_HIT_Q,
    0, SCALE.Q,
  ) as Q;
  return true;
}

/**
 * Tick down the governance change cooldown.
 * Mutates `state.changeCooldown`; never goes below 0.
 */
export function stepGovernanceCooldown(state: GovernanceState, elapsedDays: number): void {
  state.changeCooldown = Math.max(0, state.changeCooldown - elapsedDays);
}

// ── Passive stability tick ────────────────────────────────────────────────────

/**
 * Apply the governance passive stability increment per elapsed days.
 *
 * Uses `computeGovernanceModifiers` to get the net `stabilityIncrement_Q`,
 * then adds `increment × elapsedDays` to `polity.stabilityQ`.
 *
 * No-op if net increment is 0 (law costs cancel the baseline bonus).
 *
 * @param lawRegistry  Active law registry.
 */
export function stepGovernanceStability(
  polity:      Polity,
  state:       GovernanceState,
  elapsedDays: number,
  lawRegistry: Map<string, LawCode> = new Map(),
): void {
  const mods = computeGovernanceModifiers(state, lawRegistry);
  if (mods.stabilityIncrement_Q <= 0) return;
  const delta = Math.round(mods.stabilityIncrement_Q * elapsedDays);
  polity.stabilityQ = clampQ(polity.stabilityQ + delta, 0, SCALE.Q) as Q;
}
