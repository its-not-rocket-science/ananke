// src/sim/systemic-toxicology.ts — Phase 53: Systemic Toxicology (Ingested / Cumulative)
//
// Extends Phase 32C (injection venom) and Phase 10 (pharmacokinetics) with:
//   - Ingested toxins with long onset times (minutes) and metabolic half-lives (hours)
//   - Cumulative exposure: heavy metals, radiation — irreversible dose accumulation
//   - Withdrawal states after sustained addictive toxin use
//
// Follows the 1 Hz accumulator pattern; called from the kernel's runtimeState.nutritionAccum gate.
//
// Data flow:
//   ingestToxin(entity, id) → entity.activeIngestedToxins[]
//   stepIngestedToxicology(entity, delta_s) → mutates condition/injury/energy; manages withdrawal
//   deriveCumulativeToxicity(entity) → Q summary for AI / combat layer queries

import { q, clampQ, SCALE, type Q } from "../units.js";
import type { Entity } from "./entity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToxinCategory = "alcohol" | "sedative" | "alkaloid" | "heavy_metal" | "radiation";

export interface IngestedToxinProfile {
  id:           string;
  name:         string;
  category:     ToxinCategory;

  /** Seconds from ingestion to first symptomatic effect. */
  onsetDelay_s: number;

  /**
   * Metabolic half-life [seconds].
   * Per-second decay fraction ≈ ln(2) / halfLife_s.
   * Effective decayQ = max(1, round(6931 / halfLife_s)) [Q units/s from SCALE.Q].
   */
  halfLife_s:   number;

  /** Per-second internal damage to torso (Q) while symptomatic. */
  damageRate_Q?: Q;

  /**
   * Motor impairment at full concentration.
   * Applied as per-second fatigue increase proportional to (SCALE.Q − motorMul_Q) × concentration.
   * q(0.60) → 40% impairment; q(1.0) → no impairment.
   */
  motorMul_Q?: Q;

  /**
   * Cognitive impairment at full concentration.
   * Applied as per-second consciousness erosion.
   * q(0.50) → severe impairment; q(1.0) → no impairment.
   */
  cognitiveMul_Q?: Q;

  /**
   * Signed per-second fear delta [Q units] while symptomatic.
   * Positive → fear increase (alkaloid panic); negative → fear decrease (alcohol disinhibition).
   */
  fearMod_perS?: number;

  /** True = this toxin accumulates irreversibly in tissue (heavy metals, radiation). */
  cumulative?: boolean;

  /**
   * Per-second irreversible dose accumulation while symptomatic [Q/s].
   * Adds to CumulativeExposureRecord.totalDose_Q at rate: conc_Q × irreversibleRate_Q / SCALE.Q / s.
   */
  irreversibleRate_Q?: Q;

  /** True = sustained use triggers a withdrawal state when concentration clears. */
  addictive?: boolean;

  /** Duration of withdrawal period [seconds] (default: halfLife_s × 2). */
  withdrawalDuration_s?: number;
}

export interface ActiveIngestedToxin {
  profile:          IngestedToxinProfile;
  /** Total seconds elapsed since ingestion. */
  elapsedSeconds:   number;
  /**
   * Current systemic concentration (Q 0..SCALE.Q).
   * Initialized to SCALE.Q on ingestion; decays exponentially via halfLife_s.
   */
  concentration_Q:  Q;
  /**
   * Seconds spent in the symptomatic phase (elapsed ≥ onsetDelay_s).
   * Drives withdrawal eligibility for addictive toxins.
   */
  sustainedSeconds: number;
}

/** Irreversible lifetime dose accumulation for heavy metals and radiation. */
export interface CumulativeExposureRecord {
  toxinId:     string;
  /** Accumulated irreversible dose (Q 0..SCALE.Q). Increases with each symptomatic exposure. */
  totalDose_Q: Q;
}

/** Active withdrawal state — temporary penalty period after an addictive toxin clears. */
export interface WithdrawalState {
  toxinId:        string;
  elapsedSeconds: number;
  duration_s:     number;
  /** Q 0..SCALE.Q — scales all withdrawal symptom magnitudes. Higher = worse symptoms. */
  severity_Q:     Q;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** round(ln(2) × SCALE.Q) — numerator for per-second decay fraction. */
const LN2_Q = 6931;

/** Minimum sustained seconds before withdrawal becomes possible. */
const WITHDRAWAL_MIN_SUSTAINED_s = 120;

/**
 * Fatigue increase per unit of motor impairment × concentration per second.
 * Formula: fatigueInc = (SCALE.Q − motorMul_Q) × conc_Q / SCALE.Q × MOTOR_IMPAIRMENT_RATE / SCALE.Q
 * At full impairment (motorMul = q(0)) and full conc (q(1.0)): adds MOTOR_IMPAIRMENT_RATE Q/s.
 */
const MOTOR_IMPAIRMENT_RATE = 50;   // q(0.005)/s at maximum motor impairment + full concentration

/** Consciousness erosion per unit of cognitive impairment × concentration per second. */
const COGNITIVE_IMPAIRMENT_RATE = 30;  // q(0.003)/s at maximum impairment + full concentration

/** Fatigue added per Q of withdrawal severity per second. */
const WITHDRAWAL_FATIGUE_RATE = 8;   // q(0.0008)/s at severity q(1.0)

/** Fear added per Q of withdrawal severity per second. */
const WITHDRAWAL_FEAR_RATE = 5;      // q(0.0005)/s at severity q(1.0)

// ── Toxin catalogue ───────────────────────────────────────────────────────────

export const INGESTED_TOXIN_PROFILES: readonly IngestedToxinProfile[] = [
  {
    id:            "alcohol",
    name:          "Alcohol (ethanol)",
    category:      "alcohol",
    onsetDelay_s:  900,        // 15 min to first motor effect
    halfLife_s:    3_600,      // 1 h hepatic clearance (decayQ ≈ 2/s)
    motorMul_Q:    q(0.60) as Q,   // 40% motor impairment at peak
    fearMod_perS:  -3,         // slight disinhibition: −3 Q/s (≈ −q(0.0003)/s)
    addictive:     true,
    withdrawalDuration_s: 7_200,   // 2 h withdrawal
  },
  {
    id:            "sedative_plant",
    name:          "Sedative alkaloid (valerian, poppy)",
    category:      "sedative",
    onsetDelay_s:  1_800,      // 30 min
    halfLife_s:    7_200,      // 2 h clearance (decayQ ≈ 1/s)
    cognitiveMul_Q: q(0.50) as Q,  // severe consciousness erosion
    addictive:     true,
    withdrawalDuration_s: 14_400, // 4 h withdrawal
  },
  {
    id:            "alkaloid_poison",
    name:          "Plant alkaloid toxin (nightshade, hemlock)",
    category:      "alkaloid",
    onsetDelay_s:  1_200,      // 20 min
    halfLife_s:    1_800,      // 30 min — clears relatively quickly
    damageRate_Q:  q(0.004) as Q,  // internal damage per second
    fearMod_perS:  8,          // panic response: +8 Q/s (≈ +q(0.0008)/s)
  },
  {
    id:            "heavy_lead",
    name:          "Lead (plumbum) — chronic poisoning",
    category:      "heavy_metal",
    onsetDelay_s:  3_600,      // 1 h onset (slow GI absorption)
    halfLife_s:    86_400,     // nominal 24 h (fixed-point effective: decayQ = max(1, round(0.08)) = 1)
    cognitiveMul_Q: q(0.70) as Q,  // neurological impairment
    damageRate_Q:  q(0.001) as Q,  // slow systemic damage
    cumulative:    true,
    irreversibleRate_Q: q(0.005) as Q,   // 50 Q/s accumulation at full concentration
  },
  {
    id:            "radiation_dose",
    name:          "Ionising radiation dose (acute)",
    category:      "radiation",
    onsetDelay_s:  7_200,      // 2 h (ARS latent period before symptoms manifest)
    halfLife_s:    604_800,    // nominal 7 days (effective decayQ = 1)
    damageRate_Q:  q(0.002) as Q,
    motorMul_Q:    q(0.80) as Q,   // bone marrow suppression → fatigue
    cumulative:    true,
    irreversibleRate_Q: q(0.001) as Q,  // 10 Q/s — DNA damage accumulates slower than lead
  },
] as const;

const TOXIN_BY_ID = new Map(INGESTED_TOXIN_PROFILES.map(t => [t.id, t]));

/** Look up an IngestedToxinProfile by id. Returns undefined if unknown. */
export function getIngestedToxinProfile(id: string): IngestedToxinProfile | undefined {
  return TOXIN_BY_ID.get(id);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Add an ingested toxin to an entity.
 *
 * Initializes concentration at SCALE.Q (full dose). Multiple ingestions of the same
 * toxin create separate entries — this models repeated ingestion (two cups of alcohol, etc.).
 *
 * @returns true if the toxin id is known; false otherwise.
 */
export function ingestToxin(entity: Entity, toxinId: string): boolean {
  const profile = TOXIN_BY_ID.get(toxinId);
  if (!profile) return false;
  if (!entity.activeIngestedToxins) entity.activeIngestedToxins = [];
  entity.activeIngestedToxins.push({
    profile,
    elapsedSeconds:   0,
    concentration_Q:  SCALE.Q as Q,
    sustainedSeconds: 0,
  });
  return true;
}

/**
 * Advance all active ingested toxins on an entity by `delta_s` seconds.
 *
 * Mutates:
 *   entity.activeIngestedToxins (concentration decayed; expired entries removed)
 *   entity.cumulativeExposure   (irreversible dose records updated for cumulative toxins)
 *   entity.withdrawal           (new withdrawal states added; existing states advanced and expired)
 *   entity.energy.fatigue       (motor-impairing toxins and withdrawal)
 *   entity.injury.consciousness (cognitive-impairing toxins)
 *   entity.injury (torso internalDamage or shock for toxins with damageRate_Q)
 *   entity.condition.fearQ      (fearMod_perS and withdrawal)
 */
export function stepIngestedToxicology(entity: Entity, delta_s: number): void {
  const delta_int = Math.round(delta_s);   // integer seconds for accumulation arithmetic

  _stepActiveToxins(entity, delta_s, delta_int);
  _stepWithdrawal(entity, delta_int);
}

function _stepActiveToxins(entity: Entity, delta_s: number, delta_int: number): void {
  const toxins = entity.activeIngestedToxins;
  if (!toxins || toxins.length === 0) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cond = entity.condition as any;
  const torsoRegion = entity.injury.byRegion?.["torso"];

  const toRemove: number[] = [];

  for (let i = 0; i < toxins.length; i++) {
    const at = toxins[i]!;
    at.elapsedSeconds += delta_s;

    // Decay concentration: decayQ = max(1, round(ln(2) × SCALE.Q / halfLife_s))
    // Minimum decrement of 1 per delta_int seconds ensures toxin always eventually clears.
    // (Without this, integer truncation freezes decay for very small concentrations.)
    const decayQ = Math.max(1, Math.round(LN2_Q / at.profile.halfLife_s));
    const rawDecrement = Math.trunc(at.concentration_Q * decayQ / SCALE.Q);
    const decrement = at.concentration_Q > 0 ? Math.max(delta_int, rawDecrement * delta_int) : 0;
    at.concentration_Q = clampQ(
      (at.concentration_Q - decrement) as Q,
      q(0) as Q,
      SCALE.Q as Q,
    );

    if (at.elapsedSeconds < at.profile.onsetDelay_s) continue;  // pre-onset: no effect yet

    // Symptomatic — apply effects
    at.sustainedSeconds += delta_s;
    const conc = at.concentration_Q;
    const p    = at.profile;

    // Internal damage (alkaloids, heavy metals, radiation)
    if (p.damageRate_Q) {
      const dmgInc = Math.trunc(p.damageRate_Q * delta_int);
      if (torsoRegion !== undefined) {
        torsoRegion.internalDamage = clampQ(
          (torsoRegion.internalDamage + dmgInc) as Q, q(0) as Q, q(1.0) as Q,
        );
      } else {
        entity.injury.shock = clampQ(
          (entity.injury.shock + dmgInc) as Q, q(0) as Q, SCALE.Q as Q,
        );
      }
    }

    // Motor impairment → fatigue accumulation
    if (p.motorMul_Q !== undefined) {
      const impairFrac = Math.trunc((SCALE.Q - p.motorMul_Q) * conc / SCALE.Q);
      const fatigueInc = Math.trunc(impairFrac * MOTOR_IMPAIRMENT_RATE / SCALE.Q) * delta_int;
      entity.energy.fatigue = clampQ(
        (entity.energy.fatigue + fatigueInc) as Q, q(0) as Q, SCALE.Q as Q,
      );
    }

    // Cognitive impairment → consciousness erosion
    if (p.cognitiveMul_Q !== undefined) {
      const impairFrac = Math.trunc((SCALE.Q - p.cognitiveMul_Q) * conc / SCALE.Q);
      const consciousLoss = Math.trunc(impairFrac * COGNITIVE_IMPAIRMENT_RATE / SCALE.Q) * delta_int;
      entity.injury.consciousness = clampQ(
        (entity.injury.consciousness - consciousLoss) as Q, q(0) as Q, SCALE.Q as Q,
      );
    }

    // Fear modifier (signed: negative for disinhibition, positive for panic)
    if (p.fearMod_perS !== undefined && p.fearMod_perS !== 0) {
      const fearDelta = Math.trunc(p.fearMod_perS * delta_int);
      cond.fearQ = clampQ(
        (cond.fearQ + fearDelta) as Q, q(0) as Q, SCALE.Q as Q,
      );
    }

    // Cumulative irreversible dose accumulation
    if (p.cumulative && p.irreversibleRate_Q) {
      const irrInc = Math.trunc(conc * p.irreversibleRate_Q / SCALE.Q) * delta_int;
      if (irrInc > 0) {
        _accumulateDose(entity, p.id, irrInc);
      }
    }

    // Schedule for removal if concentration is negligible
    if (at.concentration_Q < 1) {
      // Trigger withdrawal if applicable
      if (p.addictive && at.sustainedSeconds >= WITHDRAWAL_MIN_SUSTAINED_s) {
        _triggerWithdrawal(entity, p, at.sustainedSeconds);
      }
      toRemove.push(i);
    }
  }

  // Remove expired entries in reverse order to preserve indices
  for (let k = toRemove.length - 1; k >= 0; k--) {
    toxins.splice(toRemove[k]!, 1);
  }
}

function _accumulateDose(entity: Entity, toxinId: string, amount: number): void {
  if (!entity.cumulativeExposure) entity.cumulativeExposure = [];
  let rec = entity.cumulativeExposure.find(r => r.toxinId === toxinId);
  if (!rec) {
    rec = { toxinId, totalDose_Q: q(0) as Q };
    entity.cumulativeExposure.push(rec);
  }
  rec.totalDose_Q = clampQ(
    (rec.totalDose_Q + amount) as Q, q(0) as Q, SCALE.Q as Q,
  );
}

function _triggerWithdrawal(entity: Entity, profile: IngestedToxinProfile, sustainedSeconds: number): void {
  const duration_s = profile.withdrawalDuration_s ?? profile.halfLife_s * 2;
  // Severity: capped to SCALE.Q; scales with how long entity was symptomatic
  const severity_Q = clampQ(
    Math.trunc(sustainedSeconds * SCALE.Q / duration_s) as Q,
    q(0.10) as Q,    // minimum severity when withdrawal triggers
    SCALE.Q as Q,
  );
  if (!entity.withdrawal) entity.withdrawal = [];
  entity.withdrawal.push({
    toxinId:        profile.id,
    elapsedSeconds: 0,
    duration_s,
    severity_Q,
  });
}

function _stepWithdrawal(entity: Entity, delta_int: number): void {
  const states = entity.withdrawal;
  if (!states || states.length === 0) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cond = entity.condition as any;

  for (const ws of states) {
    ws.elapsedSeconds += delta_int;

    // Apply withdrawal symptoms scaled by severity
    const fatiguePenalty = Math.trunc(ws.severity_Q * WITHDRAWAL_FATIGUE_RATE / SCALE.Q) * delta_int;
    entity.energy.fatigue = clampQ(
      (entity.energy.fatigue + fatiguePenalty) as Q, q(0) as Q, SCALE.Q as Q,
    );

    const fearPenalty = Math.trunc(ws.severity_Q * WITHDRAWAL_FEAR_RATE / SCALE.Q) * delta_int;
    cond.fearQ = clampQ(
      (cond.fearQ + fearPenalty) as Q, q(0) as Q, SCALE.Q as Q,
    );
  }

  // Remove expired withdrawal states
  entity.withdrawal = states.filter(ws => ws.elapsedSeconds < ws.duration_s);
}

// ── Query functions ───────────────────────────────────────────────────────────

/**
 * Cumulative toxicity score (Q 0..SCALE.Q) from all irreversible dose records.
 *
 * Sums totalDose_Q across all CumulativeExposureRecord entries and clamps to SCALE.Q.
 * Returns q(0) if no records exist.
 *
 * Usage: AI layer reads this to modulate attribute checks for chronically poisoned entities.
 */
export function deriveCumulativeToxicity(entity: Entity): Q {
  if (!entity.cumulativeExposure || entity.cumulativeExposure.length === 0) {
    return q(0) as Q;
  }
  let total = 0;
  for (const rec of entity.cumulativeExposure) {
    total += rec.totalDose_Q;
  }
  return clampQ(total as Q, q(0) as Q, SCALE.Q as Q);
}
