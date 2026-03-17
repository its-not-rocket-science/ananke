// src/sim/hazard.ts — Phase 60: Environmental Hazard Zones
//
// Persistent 2-D circular hazard zones that inflict per-second effects on entities
// within their radius. Five hazard types cover the main environmental threats:
//
//   fire         — fatigue drain, thermal heating, surface damage
//   radiation    — cumulative dose accumulation (see Phase 53 radiation_dose toxin)
//   toxic_gas    — fatigue drain + disease exposure (marsh_fever by default)
//   acid         — surface damage, minor fatigue
//   extreme_cold — thermal cooling, fatigue from shivering
//
// Exposure model: linear falloff from full intensity at the hazard centre to zero
// at the edge. Effects are per-second rates; the host multiplies by dt.
//
//   exposureQ = max(0, (radius − dist) × intensity / radius)   [0..intensity_Q]
//
// Temperature offsets (thermalDelta_Q) use the same Q-per-degree encoding as
// Phase 29/51 (WEATHER_Q_PER_DEG_C ≈ 185; so 1 000 Q ≈ +5.4 °C, −2 000 Q ≈ −10.8 °C).
//
// Public API:
//   computeDistToHazard(x_Sm, y_Sm, hazard)          → SCALE.m
//   isInsideHazard(x_Sm, y_Sm, hazard)                → boolean
//   computeHazardExposure(dist_Sm, hazard)             → Q [0..intensity_Q]
//   deriveHazardEffect(hazard, exposureQ)              → HazardEffect (per-second rates)
//   stepHazardZone(hazard, elapsedSeconds)             → mutates hazard.durationSeconds
//   isHazardExpired(hazard)                            → boolean

import { q, clampQ, to, SCALE, type Q } from "../units.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** The five environmental threat categories. */
export type HazardType = "fire" | "radiation" | "toxic_gas" | "acid" | "extreme_cold";

/** All hazard type identifiers (useful for validation and iteration). */
export const ALL_HAZARD_TYPES: HazardType[] = [
  "fire", "radiation", "toxic_gas", "acid", "extreme_cold",
];

/** A persistent circular hazard zone in world-space. */
export interface HazardZone {
  id:              string;
  type:            HazardType;
  /** Centre x-coordinate [SCALE.m]. */
  x_Sm:            number;
  /** Centre y-coordinate [SCALE.m]. */
  y_Sm:            number;
  /** Radius beyond which exposure is zero [SCALE.m]. */
  radius_Sm:       number;
  /** Peak intensity at the hazard centre [Q]. */
  intensity_Q:     Q;
  /**
   * Remaining lifetime in seconds.
   * `-1` = permanent (never expires; stepHazardZone is a no-op).
   * Decremented by `stepHazardZone`. Clamped to 0 at expiry.
   */
  durationSeconds: number;
}

/**
 * Per-second hazard effect rates.
 *
 * All Q fields are non-negative except `thermalDelta_Q` (negative = cooling).
 * The host multiplies by `dt` before applying, except `thermalDelta_Q` which
 * is a continuous ambient offset (applied as-is each tick).
 */
export interface HazardEffect {
  /** Fatigue added per second of exposure [Q/s]. */
  fatigueInc_Q:       Q;
  /**
   * Thermal bias while inside the hazard [Q].
   * Positive = heating (fire), negative = cooling (extreme_cold).
   * Uses Phase 29/51 Q encoding: 185 Q ≈ 1 °C.
   */
  thermalDelta_Q:     Q;
  /** Cumulative radiation dose per second [Q/s]. Maps to Phase 53 radiation_dose. */
  radiationDose_Q:    Q;
  /** Surface integrity damage per second [Q/s]. */
  surfaceDamageInc_Q: Q;
  /** Disease profile ID to test for exposure this tick (or undefined). */
  diseaseExposureId?: string;
}

// ── Base effect profiles (at full exposure / full intensity) ──────────────────

interface BaseEffect {
  fatigueInc_Q:       Q;
  thermalDelta_Q:     Q;
  radiationDose_Q:    Q;
  surfaceDamageInc_Q: Q;
  diseaseExposureId?: string;
}

const BASE_EFFECTS: Readonly<Record<HazardType, BaseEffect>> = {
  fire: {
    fatigueInc_Q:       q(0.0333) as Q,  // 3.33 % fatigue/s at full intensity → fully fatigued in 30 s
    thermalDelta_Q:     1_000   as Q,   // ≈ +5.4 °C ambient bias
    radiationDose_Q:    q(0)    as Q,
    surfaceDamageInc_Q: q(0.005) as Q,  // 0.5 % surface damage/s
  },
  radiation: {
    fatigueInc_Q:       q(0)    as Q,
    thermalDelta_Q:     0       as Q,
    radiationDose_Q:    q(0.010) as Q,  // 1 % cumulative dose/s at full exposure
    surfaceDamageInc_Q: q(0)    as Q,
  },
  toxic_gas: {
    fatigueInc_Q:       q(0.010) as Q,  // 1 % fatigue/s
    thermalDelta_Q:     0        as Q,
    radiationDose_Q:    q(0)     as Q,
    surfaceDamageInc_Q: q(0)     as Q,
    diseaseExposureId: "marsh_fever",
  },
  acid: {
    fatigueInc_Q:       q(0.005) as Q,  // 0.5 % fatigue/s (chemical burns)
    thermalDelta_Q:     0        as Q,
    radiationDose_Q:    q(0)     as Q,
    surfaceDamageInc_Q: q(0.015) as Q,  // 1.5 % surface damage/s
  },
  extreme_cold: {
    fatigueInc_Q:       q(0.008) as Q,  // 0.8 % fatigue/s (shivering)
    thermalDelta_Q:     -2_000   as Q,  // ≈ −10.8 °C ambient bias
    radiationDose_Q:    q(0)     as Q,
    surfaceDamageInc_Q: q(0)     as Q,
  },
};

const ZERO_EFFECT: HazardEffect = {
  fatigueInc_Q:       q(0) as Q,
  thermalDelta_Q:     0    as Q,
  radiationDose_Q:    q(0) as Q,
  surfaceDamageInc_Q: q(0) as Q,
};

// ── Sample hazard zones ───────────────────────────────────────────────────────

/** A modest campfire — 3 m radius, 1-hour duration. */
export const CAMPFIRE: HazardZone = {
  id:              "campfire",
  type:            "fire",
  x_Sm:            0,
  y_Sm:            0,
  radius_Sm:       to.m(3),
  intensity_Q:     q(0.60) as Q,
  durationSeconds: 3_600,
};

/** A contaminated crater — 50 m radius, permanent. */
export const RADIATION_ZONE: HazardZone = {
  id:              "radiation_zone",
  type:            "radiation",
  x_Sm:            0,
  y_Sm:            0,
  radius_Sm:       to.m(50),
  intensity_Q:     q(0.40) as Q,
  durationSeconds: -1,   // permanent
};

/** A drifting toxic-gas cloud — 20 m radius, 30-minute duration. */
export const MUSTARD_GAS: HazardZone = {
  id:              "mustard_gas",
  type:            "toxic_gas",
  x_Sm:            0,
  y_Sm:            0,
  radius_Sm:       to.m(20),
  intensity_Q:     q(0.80) as Q,
  durationSeconds: 1_800,
};

/** A corrosive acid pool — 2 m radius, 2-hour duration. */
export const ACID_POOL: HazardZone = {
  id:              "acid_pool",
  type:            "acid",
  x_Sm:            0,
  y_Sm:            0,
  radius_Sm:       to.m(2),
  intensity_Q:     q(0.90) as Q,
  durationSeconds: 7_200,
};

/** A severe cold zone — 100 m radius, 6-hour duration. */
export const BLIZZARD_ZONE: HazardZone = {
  id:              "blizzard_zone",
  type:            "extreme_cold",
  x_Sm:            0,
  y_Sm:            0,
  radius_Sm:       to.m(100),
  intensity_Q:     q(0.70) as Q,
  durationSeconds: 21_600,
};

/** All sample hazard zones. */
export const ALL_SAMPLE_HAZARDS: HazardZone[] = [
  CAMPFIRE, RADIATION_ZONE, MUSTARD_GAS, ACID_POOL, BLIZZARD_ZONE,
];

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Euclidean distance from a world position to the hazard centre [SCALE.m].
 *
 * Uses float sqrt for a one-time calculation; result is truncated to integer.
 */
export function computeDistToHazard(x_Sm: number, y_Sm: number, hazard: HazardZone): number {
  const dx = x_Sm - hazard.x_Sm;
  const dy = y_Sm - hazard.y_Sm;
  return Math.trunc(Math.sqrt(dx * dx + dy * dy));
}

/**
 * True if the given position is within or on the hazard boundary.
 *
 * Uses integer squared-distance comparison to avoid float precision issues.
 */
export function isInsideHazard(x_Sm: number, y_Sm: number, hazard: HazardZone): boolean {
  const dx = x_Sm - hazard.x_Sm;
  const dy = y_Sm - hazard.y_Sm;
  return dx * dx + dy * dy <= hazard.radius_Sm * hazard.radius_Sm;
}

/**
 * Compute the exposure intensity at a given distance from the hazard centre.
 *
 * Linear falloff:  `exposure = (radius − dist) × intensity / radius`
 * Returns `q(0)` when `dist >= radius`.
 *
 * @param dist_Sm  Distance from hazard centre [SCALE.m].
 */
export function computeHazardExposure(dist_Sm: number, hazard: HazardZone): Q {
  if (dist_Sm >= hazard.radius_Sm || hazard.intensity_Q <= 0) return q(0) as Q;
  return clampQ(
    Math.round(
      (hazard.radius_Sm - dist_Sm) * hazard.intensity_Q / hazard.radius_Sm,
    ) as Q,
    q(0) as Q,
    SCALE.Q as Q,
  );
}

/**
 * Derive per-second hazard effect rates from an exposure level.
 *
 * `exposureQ` is the output of `computeHazardExposure` — already in [0, intensity_Q].
 * Each base rate is scaled linearly: `rate = base × exposureQ / SCALE.Q`.
 *
 * `thermalDelta_Q` uses the same scaling so the thermal offset fades toward the
 * hazard boundary.
 *
 * Returns a zero-effect record when `exposureQ <= 0`.
 */
export function deriveHazardEffect(hazard: HazardZone, exposureQ: Q): HazardEffect {
  if (exposureQ <= 0) return { ...ZERO_EFFECT };

  const b = BASE_EFFECTS[hazard.type];
  return {
    fatigueInc_Q:       clampQ(
      Math.round(b.fatigueInc_Q * exposureQ / SCALE.Q) as Q, 0, SCALE.Q,
    ),
    thermalDelta_Q:     Math.round(b.thermalDelta_Q * exposureQ / SCALE.Q) as Q,
    radiationDose_Q:    clampQ(
      Math.round(b.radiationDose_Q * exposureQ / SCALE.Q) as Q, 0, SCALE.Q,
    ),
    surfaceDamageInc_Q: clampQ(
      Math.round(b.surfaceDamageInc_Q * exposureQ / SCALE.Q) as Q, 0, SCALE.Q,
    ),
    ...(b.diseaseExposureId ? { diseaseExposureId: b.diseaseExposureId } : {}),
  };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Advance a hazard zone's lifetime by `elapsedSeconds`.
 *
 * Permanent hazards (`durationSeconds === -1`) are untouched.
 * Mutates: `hazard.durationSeconds`.
 */
export function stepHazardZone(hazard: HazardZone, elapsedSeconds: number): void {
  if (hazard.durationSeconds < 0) return;
  hazard.durationSeconds = Math.max(0, hazard.durationSeconds - elapsedSeconds);
}

/**
 * True when the hazard has run out of duration and should be removed from the world.
 * Always false for permanent hazards.
 */
export function isHazardExpired(hazard: HazardZone): boolean {
  return hazard.durationSeconds >= 0 && hazard.durationSeconds === 0;
}
