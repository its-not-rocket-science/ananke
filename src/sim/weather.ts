// src/sim/weather.ts — Phase 51: Weather & Atmospheric Environment
//
// Pure computation module — no entity mutation.  Defines weather state types
// and derives per-tick modifiers that the kernel applies to traction, sensory
// environment, ambient temperature, and ranged-combat aim error.
//
// Data flow:
//   KernelContext.weather (WeatherState) → deriveWeatherModifiers → WeatherModifiers
//   WeatherModifiers → kernel stepWorld → tractionCoeff, sensoryEnv, thermalAmbient_Q
//   WeatherState.wind + resolveShoot → computeWindAimError → extra gRadius_m

import type { Q } from "../units.js";
import { SCALE, q, clampQ } from "../units.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Precipitation category. */
export type PrecipitationType =
  | "none"
  | "rain"
  | "heavy_rain"
  | "snow"
  | "blizzard"
  | "hail";

/**
 * 2D wind vector.
 * `dx_m` and `dy_m` form a unit vector in SCALE.m space: |(dx_m, dy_m)| = SCALE.m.
 * `speed_mps` is the wind speed in SCALE.mps units.
 */
export interface WindField {
  /** X component of wind direction (SCALE.m = 1000; unit vector). */
  dx_m: number;
  /** Y component of wind direction (SCALE.m = 1000; unit vector). */
  dy_m: number;
  /** Wind speed [SCALE.mps]. 1000 = 10 m/s. */
  speed_mps: number;
}

/** Weather conditions passed into a simulation tick via KernelContext.weather. */
export interface WeatherState {
  wind?:           WindField;
  precipitation?:  PrecipitationType;
  /**
   * Fog density (Q 0..SCALE.Q).
   * q(0) = clear; q(1.0) = pea-soup fog → vision capped to q(0.10) of normal.
   */
  fogDensity_Q?:   Q;
}

/** Derived modifiers ready for the kernel to apply each tick. */
export interface WeatherModifiers {
  /**
   * Multiply KernelContext.tractionCoeff.
   * q(1.0) = unchanged; q(0.70) = 30% slipperier surface.
   */
  tractionMul_Q:      Q;
  /**
   * Multiply SensoryEnvironment.lightMul (fog + precipitation combined).
   * q(1.0) = clear; q(0.30) = dense blizzard / fog.
   */
  lightMul_Q:         Q;
  /**
   * Multiply SensoryEnvironment.smokeMul (precipitation visual masking only).
   * Heavy rain / blizzard partially obscures vision like smoke.
   */
  precipVisionMul_Q:  Q;
  /**
   * Additive offset to KernelContext.thermalAmbient_Q (Phase-29 Q encoding).
   * Negative = cooling effect.  1 °C ≈ WEATHER_Q_PER_DEG_C Q units.
   */
  thermalOffset_Q:    number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Approximate Q units per degree Celsius in the Phase-29 thermal encoding.
 * (SCALE.Q / 54) where 54 = 64°C − 10°C temperature range).
 */
export const WEATHER_Q_PER_DEG_C = 185;

/** Reference cone-weapon travel speed [SCALE.mps] for adjustConeRange. 20 m/s. */
const CONE_REF_SPEED_mps = 2_000;

// ── Precipitation lookup table ────────────────────────────────────────────────

/** Physical parameters indexed by PrecipitationType. */
const PRECIP_TABLE: Record<PrecipitationType, {
  tractionMul:     Q;
  lightMul:        Q;
  precipVisionMul: Q;
  thermalDegC:     number;   // how many °C this precipitation drops ambient temp
}> = {
  none:       { tractionMul: q(1.00) as Q, lightMul: q(1.00) as Q, precipVisionMul: q(1.00) as Q, thermalDegC:  0 },
  rain:       { tractionMul: q(0.85) as Q, lightMul: q(0.90) as Q, precipVisionMul: q(0.85) as Q, thermalDegC:  1 },
  heavy_rain: { tractionMul: q(0.70) as Q, lightMul: q(0.70) as Q, precipVisionMul: q(0.60) as Q, thermalDegC:  2 },
  snow:       { tractionMul: q(0.60) as Q, lightMul: q(0.75) as Q, precipVisionMul: q(0.75) as Q, thermalDegC:  5 },
  blizzard:   { tractionMul: q(0.40) as Q, lightMul: q(0.30) as Q, precipVisionMul: q(0.30) as Q, thermalDegC: 12 },
  hail:       { tractionMul: q(0.75) as Q, lightMul: q(0.85) as Q, precipVisionMul: q(0.85) as Q, thermalDegC:  1 },
};

// ── deriveWeatherModifiers ─────────────────────────────────────────────────────

/**
 * Compute all derived modifiers for a WeatherState.
 * Pure function — no side effects.
 */
export function deriveWeatherModifiers(weather: WeatherState): WeatherModifiers {
  const pt = PRECIP_TABLE[weather.precipitation ?? "none"];

  // Fog multiplier: q(0) fog = q(1.0) light; q(1.0) fog = q(0.10) minimum light.
  const fogMul: Q = weather.fogDensity_Q !== undefined
    ? clampQ((SCALE.Q - weather.fogDensity_Q) as Q, q(0.10) as Q, SCALE.Q as Q)
    : SCALE.Q as Q;

  // Combined light reduction from precipitation and fog (multiplicative).
  const lightMul_Q = clampQ(
    Math.trunc(pt.lightMul * fogMul / SCALE.Q) as Q,
    q(0.10) as Q,
    SCALE.Q as Q,
  );

  return {
    tractionMul_Q:    pt.tractionMul,
    lightMul_Q,
    precipVisionMul_Q: pt.precipVisionMul,
    thermalOffset_Q:  pt.thermalDegC ? -(pt.thermalDegC * WEATHER_Q_PER_DEG_C) : 0,
  };
}

// ── computeWindAimError ───────────────────────────────────────────────────────

/**
 * Additional aim grouping radius from wind drift [SCALE.m].
 *
 * Physics: drift = v_wind_perp × (range / v_proj)
 *
 * The perpendicular wind component is the 2D cross product of shot direction
 * and wind direction.  Algebraic simplification yields:
 *
 *   drift_scaled_m = wind.speed_mps × |shot × wind| / (SCALE.m × v_proj_mps)
 *
 * where |shot × wind| is the cross-product magnitude in SCALE.m² units with
 * shot direction of magnitude `dist_m` and wind direction of magnitude SCALE.m.
 * The `dist_m` factors cancel, leaving a formula independent of scale choice.
 *
 * @param wind        Wind field (direction + speed).
 * @param shotDx_m    Shot direction x [SCALE.m] (raw, not normalised).
 * @param shotDy_m    Shot direction y [SCALE.m] (raw, not normalised).
 * @param dist_m      Range to target [SCALE.m].
 * @param v_proj_mps  Projectile speed [SCALE.mps].
 * @returns Additional grouping radius [SCALE.m] (≥ 0).
 */
export function computeWindAimError(
  wind:        WindField,
  shotDx_m:    number,
  shotDy_m:    number,
  dist_m:      number,
  v_proj_mps:  number,
): number {
  if (wind.speed_mps <= 0 || v_proj_mps <= 0 || dist_m <= 0) return 0;

  // 2D cross product magnitude: |shot × wind| in SCALE.m² units.
  const crossRaw = Math.abs(shotDx_m * wind.dy_m - shotDy_m * wind.dx_m);

  // drift_scaled_m = wind.speed_mps × crossRaw / (SCALE.m × v_proj_mps)
  return Math.trunc(wind.speed_mps * crossRaw / (SCALE.m * v_proj_mps));
}

// ── adjustConeRange ───────────────────────────────────────────────────────────

/**
 * Adjust cone range for wind effects (breath weapons, gas clouds, flamethrowers).
 *
 * - Headwind (wind opposes cone direction) reduces range up to −20%.
 * - Tailwind extends range up to +10%.
 * - Crosswind (perpendicular) has no effect on range.
 *
 * @param wind      Wind field.
 * @param coneDx_m  Cone facing direction x (SCALE.m unit vector).
 * @param coneDy_m  Cone facing direction y (SCALE.m unit vector).
 * @param range_m   Base cone range [SCALE.m].
 * @returns Adjusted range [SCALE.m] (≥ 0).
 */
export function adjustConeRange(
  wind:     WindField,
  coneDx_m: number,
  coneDy_m: number,
  range_m:  number,
): number {
  if (wind.speed_mps <= 0 || range_m <= 0) return range_m;

  // Dot product of cone dir (SCALE.m unit vector) and wind dir (SCALE.m unit vector).
  // Result is in SCALE.m²; divide by SCALE.m to get aligned component in SCALE.m.
  const dot_m = Math.trunc((coneDx_m * wind.dx_m + coneDy_m * wind.dy_m) / SCALE.m);

  // Effect = aligned_speed / CONE_REF_SPEED as a Q fraction, clamped to ±20% / +10%.
  // At CONE_REF_SPEED full-headwind (dot = −SCALE.m): effect_Q = −q(0.20).
  const effect_Q = clampQ(
    Math.trunc(wind.speed_mps * dot_m * 2_000 / (SCALE.m * CONE_REF_SPEED_mps)) as Q,
    -2_000 as Q,   // max −20% headwind reduction
     1_000 as Q,   // max +10% tailwind extension
  );

  return Math.max(0, range_m + Math.trunc(range_m * effect_Q / SCALE.Q));
}
