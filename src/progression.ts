// src/progression.ts — Phase 21: Character Progression
//
// Pure bookkeeping module: no kernel imports, no RNG needed.
// All functions are deterministic given the same inputs.
// Host persists ProgressionState alongside Entity between sessions.
//
// Three subsystems:
//   1. XP / milestones  — skill domains accumulate XP from contested use;
//                         geometric thresholds trigger discrete skill deltas.
//   2. Physical training — attribute drift bounded by genetic ceiling,
//                         modulated by intensity and overtraining penalty.
//   3. Ageing           — slow per-year decline after peak age (35 for
//                         performance, 45 for cognition), reversible only
//                         by pharmacological or magical intervention.
//
// Injury sequelae (permanent damage from wounds) are also derived here,
// as they feed back into IndividualAttributes like ageing does.

import { q, clampQ, SCALE, type Q, type I32 } from "./units.js";
import type { SkillId, SkillLevel, SkillMap } from "./sim/skills.js";
import { defaultSkillLevel } from "./sim/skills.js";
import type { RegionInjury } from "./sim/injury.js";
import type { BodyPlan } from "./sim/bodyplan.js";
import type { IndividualAttributes } from "./types.js";

// ── Milestone constants ───────────────────────────────────────────────────────

/** First milestone threshold (novice → competent is earned quickly). */
export const BASE_XP = 20;

/**
 * Each subsequent milestone requires GROWTH_FACTOR × more XP than the last.
 * This produces a logarithmic mastery curve: early gains are fast, late gains
 * require massive accumulated experience.
 */
export const GROWTH_FACTOR = 1.80;

// ── Training constant ─────────────────────────────────────────────────────────

/**
 * Base attribute gain per training session in fixed-point attribute units,
 * evaluated at max intensity (q(1.0)) starting from zero proximity to ceiling.
 *
 * Calibration:
 *   At moderate intensity (q(0.50)) with 50% proximity to ceiling,
 *   δ = 2400 × 0.5 × 0.5 = 600 fp = 6 N for peakForce_N.
 *   Over 36 moderate sessions (12-week programme, 3×/week):
 *   ≈ 150–300 N total gain (ceiling effects reduce later sessions). ✓
 */
const BASE_GAIN_RATE = 2400;

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Partial adjustment to a SkillLevel applied when a milestone fires.
 * All fields are additive increments to the existing skill level.
 *
 *   hitTimingOffset_s:  negative → faster action (reduce in SCALE.s units)
 *   energyTransferMul:  positive → better efficiency (add to current Q value)
 *   dispersionMul:      negative → tighter grouping (subtract from current Q value)
 *   treatmentRateMul:   positive → faster healing
 *   fatigueRateMul:     negative → less fatigue per tick
 */
export type SkillDelta = Partial<SkillLevel>;

export interface XPLedger {
  entries: Map<SkillId, number>;
}

export interface MilestoneRecord {
  domain:    SkillId;
  /** 0-indexed milestone index (milestone 0 = first, requires BASE_XP). */
  milestone: number;
  tick:      number;
  delta:     SkillDelta;
}

export interface ProgressionState {
  xp:          XPLedger;
  milestones:  MilestoneRecord[];
  trainingLog: Array<{ tick: number; attribute: string; delta: number }>;
  sequelae:    Array<{ region: string; type: string; penalty: number }>;
}

export interface TrainingSession {
  attribute:   "peakForce_N" | "peakPower_W" | "reserveEnergy_J" | "continuousPower_W";
  intensity_Q: Q;          // q(0.50) = moderate; q(1.0) = near-maximal
  duration_s:  number;     // session length (not used for gain calculation; reserved for stamina drain)
}

export interface TrainingPlan {
  sessions:    TrainingSession[];
  frequency_d: number;     // sessions per day (may be fractional, e.g. 0.43 = 3×/week)
  /**
   * Genetic/pharmacological ceiling for the trained attribute,
   * in the same fixed-point units as the attribute.
   * For peakForce_N: use to.N(3500) for a human elite athlete ceiling.
   * Gain approaches zero as currentValue approaches this ceiling.
   */
  ceiling:     number;
}

/**
 * Flat attribute delta returned by stepAgeing.
 * All values are in fixed-point units (same as IndividualAttributes fields).
 * Negative values = decline; positive = improvement.
 */
export interface AgeingDelta {
  peakForce_N?:       number;
  peakPower_W?:       number;
  continuousPower_W?: number;
  reserveEnergy_J?:   number;
  decisionLatency_s?: number;  // positive = slower decisions
}

// ── Default milestone deltas ──────────────────────────────────────────────────

/**
 * Default SkillDelta applied at every milestone, keyed by domain.
 *
 * Calibration check — meleeCombat:
 *   100 combats × 1 XP → crosses thresholds at 20, 36, 65 XP → 3 milestones.
 *   hitTimingOffset_s += 3 × (−270) = −810 SCALE.s = −0.081 s ≈ −80 ms. ✓
 */
export const DEFAULT_MILESTONE_DELTA: Record<SkillId, SkillDelta> = {
  meleeCombat:     { hitTimingOffset_s: -270 as I32 },  // −27 ms per milestone
  meleeDefence:    { energyTransferMul:  400 as Q  },   // +4% parry quality
  grappling:       { energyTransferMul:  300 as Q  },   // +3% leverage
  rangedCombat:    { dispersionMul:     -300 as Q  },   // −3% spread
  throwingWeapons: { energyTransferMul:  300 as Q  },   // +3% throw energy
  shieldCraft:     { energyTransferMul:  400 as Q  },   // +4% block quality
  medical:         { treatmentRateMul:   400 as Q  },   // +4% treatment speed
  athleticism:     { fatigueRateMul:    -300 as Q  },   // −3% fatigue per tick
  tactics:         { hitTimingOffset_s: -200 as I32 },  // −20 ms decision latency
  stealth:         { dispersionMul:     -300 as Q  },   // −3% acoustic signature
};

// ── Milestone arithmetic ──────────────────────────────────────────────────────

/**
 * XP threshold for the nth milestone (0-indexed).
 *
 * threshold(0) = 20, threshold(1) = 36, threshold(2) = 65, threshold(3) = 117 …
 */
export function milestoneThreshold(n: number): number {
  return Math.round(BASE_XP * Math.pow(GROWTH_FACTOR, n));
}

// ── Core progression functions ────────────────────────────────────────────────

/** Create a fresh, empty ProgressionState. */
export function createProgressionState(): ProgressionState {
  return {
    xp:          { entries: new Map() },
    milestones:  [],
    trainingLog: [],
    sequelae:    [],
  };
}

/**
 * Award XP in a skill domain and trigger any newly-reached milestones.
 *
 * Milestones are recorded in `state.milestones` and returned as an array
 * of newly-triggered records (empty if none triggered this call).
 *
 * @param amount  XP to add (may be fractional, e.g. 0.5 for a near-miss).
 */
export function awardXP(
  state:  ProgressionState,
  domain: SkillId,
  amount: number,
  tick:   number,
): MilestoneRecord[] {
  const prev = state.xp.entries.get(domain) ?? 0;
  const next = prev + amount;
  state.xp.entries.set(domain, next);

  // Count milestones already achieved before this award
  let already = 0;
  while (milestoneThreshold(already) <= prev) already++;

  // Count milestones now achieved
  const triggered: MilestoneRecord[] = [];
  let idx = already;
  while (milestoneThreshold(idx) <= next) {
    const record: MilestoneRecord = {
      domain,
      milestone: idx,
      tick,
      delta: DEFAULT_MILESTONE_DELTA[domain],
    };
    triggered.push(record);
    state.milestones.push(record);
    idx++;
  }

  return triggered;
}

/**
 * Apply a SkillDelta additively to the skill entry for `domain` in `skills`.
 * Returns a new SkillMap (the original is not mutated).
 *
 * Field bounds applied:
 *   hitTimingOffset_s  — clamped to [−5000, 5000] SCALE.s
 *   energyTransferMul  — clamped to [0, 30000]
 *   dispersionMul      — clamped to [100, SCALE.Q]  (at most q(1.0); never negative)
 *   treatmentRateMul   — clamped to [100, 30000]
 *   fatigueRateMul     — clamped to [100, SCALE.Q]  (at most q(1.0))
 */
export function advanceSkill(
  skills: SkillMap,
  domain: SkillId,
  delta:  SkillDelta,
): SkillMap {
  const cur = skills.get(domain) ?? defaultSkillLevel();
  const updated: SkillLevel = {
    hitTimingOffset_s: Math.max(-5000, Math.min(5000,
      cur.hitTimingOffset_s + (delta.hitTimingOffset_s ?? 0))) as I32,
    energyTransferMul: Math.max(0, Math.min(30000,
      cur.energyTransferMul + (delta.energyTransferMul ?? 0))) as Q,
    dispersionMul:     Math.max(100, Math.min(SCALE.Q,
      cur.dispersionMul     + (delta.dispersionMul     ?? 0))) as Q,
    treatmentRateMul:  Math.max(100, Math.min(30000,
      cur.treatmentRateMul  + (delta.treatmentRateMul  ?? 0))) as Q,
    fatigueRateMul:    Math.max(100, Math.min(SCALE.Q,
      cur.fatigueRateMul    + (delta.fatigueRateMul    ?? 0))) as Q,
  };
  const out = new Map(skills);
  out.set(domain, updated);
  return out;
}

/**
 * Apply one training session to a physical attribute.
 *
 * Formula:
 *   δ = BASE_GAIN_RATE × (intensity_Q / SCALE.Q) × (1 − currentValue / ceiling) × (1 − fatiguePenalty)
 *   fatiguePenalty = clamp((sessionsInLast7d − 5) × 0.08, 0, 0.50)
 *
 * @param currentValue    Attribute value in fixed-point (e.g. `to.N(1840)` for peakForce_N).
 * @param plan.ceiling    Ceiling in the same fixed-point units.
 * @param sessionsInLast7d  How many sessions were logged in the last 7 days (incl. this one).
 * @returns New attribute value (clamped to plan.ceiling, never below currentValue).
 */
export function applyTrainingSession(
  currentValue:    number,
  plan:            TrainingPlan,
  session:         TrainingSession,
  sessionsInLast7d: number,
): number {
  if (plan.ceiling <= 0 || currentValue >= plan.ceiling) return currentValue;

  const fatiguePenalty = Math.min(0.50, Math.max(0, (sessionsInLast7d - 5) * 0.08));
  const proximity = (plan.ceiling - currentValue) / plan.ceiling;  // 0 = at ceiling, 1 = far below
  const intensityFrac = session.intensity_Q / SCALE.Q;

  const delta = Math.trunc(BASE_GAIN_RATE * intensityFrac * proximity * (1 - fatiguePenalty));

  return Math.min(plan.ceiling, currentValue + Math.max(0, delta));
}

// ── Ageing ────────────────────────────────────────────────────────────────────

const DECLINE_START_AGE = 35;
const COGNITIVE_DECLINE_START = 45;

/**
 * Compute attribute delta for ONE year of ageing at `ageYears`.
 *
 * Rates (per year):
 *   peakForce_N, peakPower_W, continuousPower_W:  −1% after age 35
 *   reserveEnergy_J:                              −0.5% after age 35
 *   decisionLatency_s:                            +20 SCALE.s (+2 ms) after age 45
 *
 * Caller is responsible for mutating attrs via `applyAgeingDelta`.
 * The returned delta is suitable for integer accumulation (per-year granularity).
 *
 * @param ageYears  Age in years at the START of this year.
 */
export function stepAgeing(
  attrs:    IndividualAttributes,
  ageYears: number,
): AgeingDelta {
  const delta: AgeingDelta = {};

  if (ageYears >= DECLINE_START_AGE) {
    // 1% performance decline per year
    delta.peakForce_N       = -Math.round(attrs.performance.peakForce_N     * 0.01);
    delta.peakPower_W       = -Math.round(attrs.performance.peakPower_W     * 0.01);
    delta.continuousPower_W = -Math.round(attrs.performance.continuousPower_W * 0.01);
    // 0.5% reserve decline per year (energy reserves decline more slowly)
    delta.reserveEnergy_J   = -Math.round(attrs.performance.reserveEnergy_J  * 0.005);
  }

  if (ageYears >= COGNITIVE_DECLINE_START) {
    // +2 ms per year = +20 SCALE.s per year
    delta.decisionLatency_s = Math.round(2 * SCALE.s / 1000);
  }

  return delta;
}

/**
 * Merge an AgeingDelta into an IndividualAttributes in-place.
 * All fields are clamped to non-negative values (cannot decline to sub-zero).
 */
export function applyAgeingDelta(
  attrs: IndividualAttributes,
  delta: AgeingDelta,
): void {
  if (delta.peakForce_N !== undefined)
    attrs.performance.peakForce_N = Math.max(0, attrs.performance.peakForce_N + delta.peakForce_N) as I32;
  if (delta.peakPower_W !== undefined)
    attrs.performance.peakPower_W = Math.max(0, attrs.performance.peakPower_W + delta.peakPower_W) as I32;
  if (delta.continuousPower_W !== undefined)
    attrs.performance.continuousPower_W = Math.max(0, attrs.performance.continuousPower_W + delta.continuousPower_W) as I32;
  if (delta.reserveEnergy_J !== undefined)
    attrs.performance.reserveEnergy_J = Math.max(0, attrs.performance.reserveEnergy_J + delta.reserveEnergy_J) as I32;
  if (delta.decisionLatency_s !== undefined)
    attrs.perception.decisionLatency_s = (attrs.perception.decisionLatency_s + delta.decisionLatency_s) as I32;
}

// ── Injury sequelae ───────────────────────────────────────────────────────────

/**
 * Derive permanent injury sequelae from a region's current injury state.
 *
 * Sequelae are one-time permanent modifiers to IndividualAttributes recorded
 * in ProgressionState. They should be derived at the point of injury resolution
 * (e.g. when structural damage crosses FRACTURE_THRESHOLD) or at end-of-combat.
 *
 * Rules:
 *   fracture_malunion  — fractured region with permanentDamage ≥ q(0.20) →
 *                        −15% peak force in the affected limb.
 *   nerve_damage       — internalDamage ≥ q(0.70) → −10% fine control.
 *   scar_tissue        — permanentDamage > 0 AND surfaceDamage > 0 →
 *                        lower surface bleed threshold (penalty 0.05).
 *
 * @param _bodyPlan  Reserved for locomotion role lookups in future phases.
 * @returns Array of sequela descriptors (no mutation; caller records them).
 */
export function deriveSequelae(
  regionInjury: RegionInjury,
  _bodyPlan:    BodyPlan,
): Array<{ type: string; penalty: number }> {
  const result: Array<{ type: string; penalty: number }> = [];

  if (regionInjury.fractured && regionInjury.permanentDamage >= q(0.20)) {
    result.push({ type: "fracture_malunion", penalty: 0.15 });
  }

  if (regionInjury.internalDamage >= q(0.70)) {
    result.push({ type: "nerve_damage", penalty: 0.10 });
  }

  if (regionInjury.permanentDamage > 0 && regionInjury.surfaceDamage > 0) {
    result.push({ type: "scar_tissue", penalty: 0.05 });
  }

  return result;
}

// ── Serialisation ─────────────────────────────────────────────────────────────

/** Serialise a ProgressionState to a JSON string (Map-aware). */
export function serialiseProgression(state: ProgressionState): string {
  return JSON.stringify({
    xp: { entries: Array.from(state.xp.entries.entries()) },
    milestones:  state.milestones,
    trainingLog: state.trainingLog,
    sequelae:    state.sequelae,
  });
}

/** Deserialise a ProgressionState from a JSON string produced by serialiseProgression. */
export function deserialiseProgression(json: string): ProgressionState {
  const raw = JSON.parse(json) as {
    xp: { entries: [SkillId, number][] };
    milestones:  MilestoneRecord[];
    trainingLog: Array<{ tick: number; attribute: string; delta: number }>;
    sequelae:    Array<{ region: string; type: string; penalty: number }>;
  };
  return {
    xp:          { entries: new Map(raw.xp.entries) },
    milestones:  raw.milestones,
    trainingLog: raw.trainingLog,
    sequelae:    raw.sequelae,
  };
}
