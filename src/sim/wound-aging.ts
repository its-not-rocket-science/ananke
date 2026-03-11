// src/sim/wound-aging.ts — Phase 54: Wound Aging & Long-Term Sequelae
//
// Extends Phase 21 (injury resolution) and Phase 9 (infection) with time-based
// wound progression relevant to multi-day / multi-week campaign simulation.
//
// Four long-term processes:
//   1. Healing    — uninfected regions slowly recover surface and internal damage
//                   (clamped to permanentDamage floor; structural never recovers).
//   2. Infection  — infected regions worsen; severe infection → sepsis flag.
//   3. Chronic fatigue — sustained permanent damage creates a baseline fatigue drain.
//   4. Phantom pain    — fractured regions with significant permanent damage inject
//                        periodic shock increments during rest/downtime.
//
// Plus two PTSD-like trauma utilities:
//   recordTraumaEvent(entity, shockQ)          — accumulate trauma severity
//   deriveFearThresholdMul(entity) → Q         — fear multiplier from trauma
//   deriveSepsisRisk(entity)       → Q         — aggregate infection severity
//
// Call stepWoundAging during downtime (long rests, between scenes) with the number
// of real elapsed seconds. At 1 real second this does nothing useful; at 86 400 s
// (one day) the full daily rates apply.

import { q, clampQ, SCALE, type Q } from "../units.js";
import type { Entity } from "./entity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * PTSD-like trauma state accumulating from severe shock events.
 * Stored on `entity.traumaState`.
 * Reduces effective fear threshold via `deriveFearThresholdMul`.
 */
export interface TraumaState {
  /** Cumulative severity (Q 0..SCALE.Q). Grows with shock events; decays over time. */
  severity_Q: Q;
}

/** Outcome summary returned by `stepWoundAging`. */
export interface WoundAgingResult {
  /** Region ids whose surface or internal damage improved (healed). */
  healedRegions: string[];
  /** Region ids whose damage worsened (infection progression). */
  worsenedRegions: string[];
  /** True if any region crossed the sepsis damage threshold this step. */
  newSepsis: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Seconds per day — base unit for all per-day rates. */
export const SECONDS_PER_DAY = 86_400;

/**
 * Surface-damage healing rate [Q/day].
 * At q(0.01)/day, a fully surface-damaged region takes ~100 days to heal.
 */
export const SURFACE_HEAL_Q_PER_DAY: Q = q(0.01) as Q;   // 100 Q/day

/**
 * Internal-damage healing rate [Q/day].
 * Half the surface rate — internal injuries heal more slowly.
 */
export const INTERNAL_HEAL_Q_PER_DAY: Q = q(0.005) as Q;  // 50 Q/day

/**
 * Infection worsening rate [Q/day] applied to internalDamage while infected.
 * 3× the internal heal rate — untreated infection outpaces natural recovery.
 */
export const INFECTION_WORSEN_Q_PER_DAY: Q = q(0.015) as Q; // 150 Q/day

/**
 * Internal-damage threshold (Q) above which an infected region is considered
 * to pose a sepsis risk (systemically threatening).
 */
export const SEPSIS_THRESHOLD: Q = q(0.85) as Q;

/**
 * Chronic fatigue per-day rate [Q/day] applied when total permanent damage
 * across all regions exceeds CHRONIC_FATIGUE_REGION_THRESHOLD.
 */
export const CHRONIC_FATIGUE_Q_PER_DAY: Q = q(0.02) as Q;  // 200 Q/day

/**
 * Minimum total permanent damage (summed across all regions, relative to
 * SCALE.Q × regionCount) to activate chronic fatigue.
 * Approximately q(0.10) average per region.
 */
export const CHRONIC_FATIGUE_THRESHOLD: Q = q(0.10) as Q;  // per-region average

/**
 * Permanent-damage threshold (per region) above which a fractured region
 * causes phantom pain during rest.
 */
export const PHANTOM_PAIN_THRESHOLD: Q = q(0.30) as Q;

/**
 * Phantom pain shock injection per day per qualifying fractured region [Q/day].
 * Scaled by the region's (permanentDamage / SCALE.Q) ratio.
 */
export const PHANTOM_PAIN_Q_PER_DAY: Q = q(0.02) as Q;    // 200 Q/day at max permanent damage

/**
 * Trauma decay per day [Q/day] — natural recovery rate of traumaState.severity_Q.
 * Slow: severe trauma takes months to fully resolve.
 */
export const TRAUMA_DECAY_Q_PER_DAY: Q = q(0.002) as Q;   // 20 Q/day

/**
 * Minimum shock increment that registers as a traumatic event.
 * Events below this threshold are too minor to compound PTSD-like symptoms.
 */
export const TRAUMA_TRIGGER_THRESHOLD: Q = q(0.20) as Q;

/**
 * Fraction of a shock increment that accumulates as trauma severity.
 * q(0.30) → a q(1.0) shock event contributes q(0.30) to trauma severity.
 */
const TRAUMA_ACCUMULATION_RATE: Q = q(0.30) as Q;

/**
 * Maximum fear-threshold reduction from trauma (q(0.50) → trauma halves
 * the effective fear threshold, making entities fearful at lower stimuli).
 */
const TRAUMA_FEAR_MUL_FLOOR: Q = q(0.50) as Q;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Advance long-term wound state by `elapsedSeconds`.
 *
 * Intended for downtime / long-rest simulation (hours to weeks of elapsed time).
 * At sub-minute resolution this function does nothing observable.
 *
 * Mutates:
 *   entity.injury.byRegion  (surface/internal damage healed or worsened)
 *   entity.injury.shock     (phantom pain)
 *   entity.energy.fatigue   (chronic fatigue drain)
 *   entity.traumaState      (natural severity decay)
 *
 * @param elapsedSeconds  Wall-clock seconds elapsed (use 86400 per game-day).
 * @returns WoundAgingResult summary (healed, worsened, newSepsis).
 */
export function stepWoundAging(entity: Entity, elapsedSeconds: number): WoundAgingResult {
  const days = elapsedSeconds / SECONDS_PER_DAY;
  const result: WoundAgingResult = {
    healedRegions:   [],
    worsenedRegions: [],
    newSepsis:       false,
  };

  const regions = entity.injury.byRegion;
  const regionEntries = Object.entries(regions);
  let totalPermanent = 0;
  let regionCount    = 0;

  for (const [regionId, reg] of regionEntries) {
    regionCount++;
    const prevSurface  = reg.surfaceDamage;
    const prevInternal = reg.internalDamage;
    const perm         = reg.permanentDamage;

    totalPermanent += perm;

    if (reg.infectedTick !== -1) {
      // ── Infection worsening ────────────────────────────────────────────────
      const worsenAmount = Math.round(INFECTION_WORSEN_Q_PER_DAY * days);
      reg.internalDamage = clampQ(
        (reg.internalDamage + worsenAmount) as Q, q(0) as Q, q(1.0) as Q,
      );

      if (reg.internalDamage > prevInternal) {
        result.worsenedRegions.push(regionId);
      }

      // Sepsis: infected region has crossed the critical threshold
      if (!result.newSepsis && reg.internalDamage >= SEPSIS_THRESHOLD && prevInternal < SEPSIS_THRESHOLD) {
        result.newSepsis = true;
      }
    } else {
      // ── Healing ───────────────────────────────────────────────────────────
      const surfaceHeal   = Math.round(SURFACE_HEAL_Q_PER_DAY  * days);
      const internalHeal  = Math.round(INTERNAL_HEAL_Q_PER_DAY * days);

      reg.surfaceDamage = clampQ(
        (reg.surfaceDamage  - surfaceHeal)  as Q, perm, q(1.0) as Q,
      );
      reg.internalDamage = clampQ(
        (reg.internalDamage - internalHeal) as Q, perm, q(1.0) as Q,
      );

      if (reg.surfaceDamage < prevSurface || reg.internalDamage < prevInternal) {
        result.healedRegions.push(regionId);
      }
    }

    // ── Phantom pain ──────────────────────────────────────────────────────────
    if (reg.fractured && reg.permanentDamage >= PHANTOM_PAIN_THRESHOLD) {
      // Shock injection scaled by permanent damage fraction
      const painQ = Math.round(PHANTOM_PAIN_Q_PER_DAY * days * reg.permanentDamage / SCALE.Q);
      if (painQ > 0) {
        entity.injury.shock = clampQ(
          (entity.injury.shock + painQ) as Q, q(0) as Q, SCALE.Q as Q,
        );
      }
    }
  }

  // ── Chronic fatigue ────────────────────────────────────────────────────────
  if (regionCount > 0) {
    const avgPermanent = totalPermanent / regionCount;
    if (avgPermanent >= CHRONIC_FATIGUE_THRESHOLD) {
      const fatigueInc = Math.round(
        CHRONIC_FATIGUE_Q_PER_DAY * days * avgPermanent / SCALE.Q,
      );
      if (fatigueInc > 0) {
        entity.energy.fatigue = clampQ(
          (entity.energy.fatigue + fatigueInc) as Q, q(0) as Q, SCALE.Q as Q,
        );
      }
    }
  }

  // ── Trauma natural decay ───────────────────────────────────────────────────
  if (entity.traumaState && entity.traumaState.severity_Q > 0) {
    const decayAmount = Math.round(TRAUMA_DECAY_Q_PER_DAY * days);
    entity.traumaState.severity_Q = clampQ(
      (entity.traumaState.severity_Q - decayAmount) as Q, q(0) as Q, SCALE.Q as Q,
    );
  }

  return result;
}

// ── Trauma utilities ──────────────────────────────────────────────────────────

/**
 * Record a traumatic shock event, accumulating PTSD-like severity.
 *
 * Only events at or above TRAUMA_TRIGGER_THRESHOLD (q(0.20)) register.
 * A q(1.0) shock event contributes q(0.30) to `traumaState.severity_Q`.
 *
 * Mutates: entity.traumaState (created if absent).
 *
 * @param shockIncrement_Q  The shock delta from the triggering event (Q).
 */
export function recordTraumaEvent(entity: Entity, shockIncrement_Q: Q): void {
  if (shockIncrement_Q < TRAUMA_TRIGGER_THRESHOLD) return;

  if (!entity.traumaState) {
    entity.traumaState = { severity_Q: q(0) as Q };
  }

  const increment = Math.round(shockIncrement_Q * TRAUMA_ACCUMULATION_RATE / SCALE.Q);
  entity.traumaState.severity_Q = clampQ(
    (entity.traumaState.severity_Q + increment) as Q, q(0) as Q, SCALE.Q as Q,
  );
}

/**
 * Derive the effective fear-threshold multiplier from accumulated trauma.
 *
 * Returns Q in [TRAUMA_FEAR_MUL_FLOOR, SCALE.Q]:
 *   q(1.0) → no trauma — fear threshold unchanged.
 *   q(0.50) → maximum trauma — entity triggers fear at half normal threshold.
 *
 * Usage (combat / morale layer):
 *   `effectiveFearThreshold_Q = Math.round(baseFearThreshold_Q × mul / SCALE.Q)`
 */
export function deriveFearThresholdMul(entity: Entity): Q {
  if (!entity.traumaState || entity.traumaState.severity_Q <= 0) {
    return SCALE.Q as Q;
  }
  // severity q(1.0) → reduction q(0.50); linear interpolation
  const reduction = Math.round(
    entity.traumaState.severity_Q * (SCALE.Q - TRAUMA_FEAR_MUL_FLOOR) / SCALE.Q,
  );
  return clampQ(
    (SCALE.Q - reduction) as Q, TRAUMA_FEAR_MUL_FLOOR, SCALE.Q as Q,
  );
}

/**
 * Compute aggregate sepsis risk (Q 0..SCALE.Q) from all infected regions.
 *
 * Risk increases with both the number of infected regions and their
 * internal damage level. Returns q(0) if no infected regions.
 *
 * Usage: AI / medical layer reads this to prioritise treatment.
 */
export function deriveSepsisRisk(entity: Entity): Q {
  let totalRisk = 0;
  for (const reg of Object.values(entity.injury.byRegion)) {
    if (reg.infectedTick !== -1) {
      // Risk contribution: internalDamage fraction of the infected region
      totalRisk += reg.internalDamage;
    }
  }
  return clampQ(totalRisk as Q, q(0) as Q, SCALE.Q as Q);
}
