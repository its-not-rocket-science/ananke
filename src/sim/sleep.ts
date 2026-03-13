// src/sim/sleep.ts — Phase 58: Sleep & Circadian Rhythm
//
// Models circadian alertness, sleep-phase cycling, and attribute degradation from
// sleep deprivation. Designed as a companion to Phase 57 (Aging & Lifespan):
// same fixed-point arithmetic, same immutable apply… pattern.
//
// Two-factor impairment model:
//   awakeSeconds — continuous wake duration since last sleep (primary driver)
//   sleepDebt_s  — cumulative shortfall from prior nights (secondary; persists across sleep)
//
// Sleep phase cycle (90 min):  light (45 min) → deep (25 min) → rem (20 min) → light …
//
// Public API:
//   circadianAlertness(hourOfDay)              → Q [0..SCALE.Q]
//   deriveSleepDeprivationMuls(state)          → SleepDeprivationMuls
//   stepSleep(entity, elapsedSeconds, sleeping) → mutates entity.sleep
//   applySleepToAttributes(base, state)        → IndividualAttributes (new object)
//   entitySleepDebt_h(entity)                  → number

import { q, clampQ, SCALE, type Q } from "../units.js";
import type { IndividualAttributes } from "../types.js";
import type { Entity } from "./entity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Current sleep phase. "awake" when the entity is not sleeping. */
export type SleepPhase = "awake" | "light" | "deep" | "rem";

/** Deprivation-driven attribute multipliers (all Q). */
export interface SleepDeprivationMuls {
  /** Fluid cognition multiplier: degrades fastest under sleep loss [Q]. */
  cognitionFluid_Q:    Q;
  /** Reaction time multiplier: > q(1.0) = slower reaction [Q]. */
  reactionTime_Q:      Q;
  /** Balance / postural stability multiplier [Q]. */
  stability_Q:         Q;
  /** Distress tolerance multiplier: emotional dysregulation [Q]. */
  distressTolerance_Q: Q;
}

/** Per-entity sleep state stored on `entity.sleep`. */
export interface SleepState {
  /** Current sleep phase ("awake" when not sleeping). */
  phase:        SleepPhase;
  /** Seconds spent in the current phase. */
  phaseSeconds: number;
  /** Cumulative sleep deficit in seconds (capped at MAX_SLEEP_DEBT_S). */
  sleepDebt_s:  number;
  /** Continuous seconds since last sleep bout. Resets to 0 on sleep onset. */
  awakeSeconds: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Optimal sleep duration per 24-hour period [s]. */
export const OPTIMAL_SLEEP_S = 8 * 3600;       // 28 800

/** Optimal waking duration per 24-hour period [s]. */
export const OPTIMAL_AWAKE_S = 16 * 3600;      // 57 600

/** Continuous wake time above which cognitive/motor impairment begins [s]. */
export const IMPAIR_THRESHOLD_S = 17 * 3600;   // 61 200

/** Maximum sleep debt tracked (3 days of total sleep deprivation) [s]. */
export const MAX_SLEEP_DEBT_S = 72 * 3600;     // 259 200

/** Duration of the light-sleep (NREM-1/2) phase per cycle [s]. */
export const LIGHT_PHASE_S = 45 * 60;   // 2 700

/** Duration of the deep-sleep (slow-wave) phase per cycle [s]. */
export const DEEP_PHASE_S = 25 * 60;    // 1 500

/** Duration of the REM phase per cycle [s]. */
export const REM_PHASE_S = 20 * 60;     // 1 200

// ── Circadian alertness ───────────────────────────────────────────────────────

// Piecewise-linear hourly alertness table [hourOfDay → Q].
// Peaks at ~17:00 (afternoon), nadir at ~03:00 (pre-dawn), secondary dip at 14:00.
const CIRCADIAN_KNOTS: readonly [number, number][] = [
  [0,  q(0.45)],
  [3,  q(0.30)],   // nadir ~03:00
  [6,  q(0.60)],   // morning rise
  [10, q(0.95)],   // morning peak
  [14, q(0.80)],   // post-lunch dip
  [17, q(1.00)],   // afternoon peak
  [21, q(0.70)],   // evening decline
  [24, q(0.45)],   // back to midnight
];

/**
 * Circadian alertness at a given time of day.
 *
 * @param hourOfDay  Float in [0, 24). Values outside this range are normalised.
 * @returns Q in [q(0.30), q(1.0)]: q(1.0) at ~17:00, q(0.30) at ~03:00.
 */
export function circadianAlertness(hourOfDay: number): Q {
  const h = ((hourOfDay % 24) + 24) % 24;
  for (let i = 1; i < CIRCADIAN_KNOTS.length; i++) {
    const [x0, y0] = CIRCADIAN_KNOTS[i - 1]!;
    const [x1, y1] = CIRCADIAN_KNOTS[i]!;
    if (h <= x1) {
      const span = x1 - x0;
      if (span === 0) return y0 as Q;
      const t = Math.round((h - x0) * SCALE.Q / span);
      return (y0 + Math.round((y1 - y0) * t / SCALE.Q)) as Q;
    }
  }
  return CIRCADIAN_KNOTS[CIRCADIAN_KNOTS.length - 1]![1] as Q;
}

// ── Sleep deprivation ─────────────────────────────────────────────────────────

/**
 * Derive sleep-deprivation attribute multipliers from the entity's sleep state.
 *
 * Impairment is driven by the greater of:
 *   - `awakeSeconds`  — continuous wake duration (resets on sleep)
 *   - `sleepDebt_s`   — cumulative shortfall from prior nights
 *
 * Below IMPAIR_THRESHOLD_S (17 h) both drivers produce no impairment.
 * Full impairment is reached at MAX_SLEEP_DEBT_S (72 h).
 *
 * Multiplier ranges at max deprivation:
 *   cognitionFluid_Q:    q(1.0) → q(0.55)   (−45%)
 *   reactionTime_Q:      q(1.0) → q(1.45)   (+45% slower)
 *   stability_Q:         q(1.0) → q(0.75)   (−25%)
 *   distressTolerance_Q: q(1.0) → q(0.65)   (−35%)
 */
export function deriveSleepDeprivationMuls(state: SleepState): SleepDeprivationMuls {
  const effectiveS   = Math.max(state.awakeSeconds, state.sleepDebt_s);
  const raw          = Math.max(0, effectiveS - IMPAIR_THRESHOLD_S);
  const range        = MAX_SLEEP_DEBT_S - IMPAIR_THRESHOLD_S;  // 198 000
  const impairFrac_Q = clampQ(
    Math.round(raw * SCALE.Q / range) as Q,
    q(0) as Q,
    SCALE.Q as Q,
  );

  const cognitionFluid_Q = clampQ(
    (SCALE.Q - Math.round(impairFrac_Q * 0.45)) as Q,
    q(0) as Q, SCALE.Q as Q,
  );

  // > SCALE.Q means slower than baseline (mirrors aging reactionTime_Q convention)
  const reactionTime_Q = (SCALE.Q + Math.round(impairFrac_Q * 0.45)) as Q;

  const stability_Q = clampQ(
    (SCALE.Q - Math.round(impairFrac_Q * 0.25)) as Q,
    q(0) as Q, SCALE.Q as Q,
  );

  const distressTolerance_Q = clampQ(
    (SCALE.Q - Math.round(impairFrac_Q * 0.35)) as Q,
    q(0) as Q, SCALE.Q as Q,
  );

  return { cognitionFluid_Q, reactionTime_Q, stability_Q, distressTolerance_Q };
}

// ── stepSleep ─────────────────────────────────────────────────────────────────

/**
 * Advance an entity's sleep state by `elapsedSeconds`.
 *
 * When `isSleeping = false` (awake):
 *   - `awakeSeconds` accumulates.
 *   - `sleepDebt_s` accrues at ½ s/s for each second spent beyond OPTIMAL_AWAKE_S.
 *     (16 h waking × ½ = 8 h debt — exactly one night's repayment if sleep was ideal.)
 *   - Phase stays or transitions to "awake".
 *
 * When `isSleeping = true`:
 *   - On sleep onset (phase was "awake"): `awakeSeconds` resets to 0; phase enters "light".
 *   - `sleepDebt_s` decrements 1:1 with elapsed sleep time (floored at 0).
 *   - Phase cycles: light → deep → rem → light (90-minute NREM/REM cycle).
 *
 * Mutates: `entity.sleep`.
 */
export function stepSleep(entity: Entity, elapsedSeconds: number, isSleeping: boolean): void {
  if (!entity.sleep) {
    entity.sleep = { phase: "awake", phaseSeconds: 0, sleepDebt_s: 0, awakeSeconds: 0 };
  }
  const s = entity.sleep;

  if (!isSleeping) {
    if (s.phase !== "awake") {
      s.phase = "awake";
      s.phaseSeconds = 0;
    }

    const prevAwake  = s.awakeSeconds;
    s.awakeSeconds  += elapsedSeconds;
    s.phaseSeconds  += elapsedSeconds;

    // Debt accrues only for time spent beyond the optimal waking window
    const debtStart = Math.max(prevAwake, OPTIMAL_AWAKE_S);
    const debtEnd   = s.awakeSeconds;
    if (debtEnd > debtStart) {
      s.sleepDebt_s = Math.min(
        MAX_SLEEP_DEBT_S,
        s.sleepDebt_s + Math.round((debtEnd - debtStart) / 2),
      );
    }
  } else {
    if (s.phase === "awake") {
      // Sleep onset: enter light phase and reset continuous wake timer
      s.phase        = "light";
      s.phaseSeconds = 0;
      s.awakeSeconds = 0;
    }

    // Repay debt 1:1 (cannot go below 0)
    s.sleepDebt_s   = Math.max(0, s.sleepDebt_s - elapsedSeconds);
    s.phaseSeconds += elapsedSeconds;

    // Advance through NREM/REM cycle (phase is "light"|"deep"|"rem" at this point)
    for (;;) {
      const dur = s.phase === "light" ? LIGHT_PHASE_S
                : s.phase === "deep"  ? DEEP_PHASE_S
                :                       REM_PHASE_S;
      if (s.phaseSeconds < dur) break;
      s.phaseSeconds -= dur;
      s.phase = s.phase === "light" ? "deep"
              : s.phase === "deep"  ? "rem"
              :                       "light";  // rem → back to light
    }
  }
}

// ── applySleepToAttributes ────────────────────────────────────────────────────

/**
 * Apply sleep-deprivation multipliers to a base attribute set, returning a new object.
 *
 * Attributes affected:
 *   - control.reactionTime_s, stability
 *   - resilience.distressTolerance
 *   - cognition (if present): fluid dimensions (logical, spatial, kinesthetic, musical)
 *
 * Immutable — does not mutate `base`.
 * Pattern matches `applyAgingToAttributes` (Phase 57).
 */
export function applySleepToAttributes(
  base:  IndividualAttributes,
  state: SleepState,
): IndividualAttributes {
  const m = deriveSleepDeprivationMuls(state);

  return {
    ...base,

    control: {
      ...base.control,
      reactionTime_s: Math.max(1, Math.round(base.control.reactionTime_s * m.reactionTime_Q / SCALE.Q)),
      stability:      clampQ(
        Math.round(base.control.stability * m.stability_Q / SCALE.Q) as Q,
        q(0) as Q, SCALE.Q as Q,
      ),
    },

    resilience: {
      ...base.resilience,
      distressTolerance: clampQ(
        Math.round(base.resilience.distressTolerance * m.distressTolerance_Q / SCALE.Q) as Q,
        q(0) as Q, SCALE.Q as Q,
      ),
    },

    // exactOptionalPropertyTypes: spread present cognition, otherwise omit the key entirely.
    ...(base.cognition
      ? {
          cognition: {
            ...base.cognition,
            logicalMathematical: clampQ(Math.round(base.cognition.logicalMathematical * m.cognitionFluid_Q / SCALE.Q) as Q, q(0) as Q, SCALE.Q as Q),
            spatial:             clampQ(Math.round(base.cognition.spatial             * m.cognitionFluid_Q / SCALE.Q) as Q, q(0) as Q, SCALE.Q as Q),
            bodilyKinesthetic:   clampQ(Math.round(base.cognition.bodilyKinesthetic   * m.cognitionFluid_Q / SCALE.Q) as Q, q(0) as Q, SCALE.Q as Q),
            musical:             clampQ(Math.round(base.cognition.musical             * m.cognitionFluid_Q / SCALE.Q) as Q, q(0) as Q, SCALE.Q as Q),
          },
        }
      : {}),
  };
}

// ── Entity convenience ────────────────────────────────────────────────────────

/**
 * Return the entity's accumulated sleep debt in hours.
 * Returns 0 if `entity.sleep` is absent.
 */
export function entitySleepDebt_h(entity: Entity): number {
  if (!entity.sleep) return 0;
  return entity.sleep.sleepDebt_s / 3600;
}
