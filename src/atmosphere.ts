// src/atmosphere.ts — PA-6: Unified Atmosphere Model
//
// Provides a single `AtmosphericState` struct that derives from WeatherState
// (Phase 51) and BiomeContext (Phase 68) and exposes a unified query API.
//
// `queryAtmosphericModifiers(from, to, state)` returns all atmospheric effects
// relevant to a position pair in one call — projectile drift, hazard cone
// distortion, acoustic masking, visibility, traction, and scent propagation —
// so hosts no longer need per-system wind configuration.
//
// Integration:
//   1. Build once per tick: state = deriveAtmosphericState(weather, biome)
//   2. Query per-pair:     mods  = queryAtmosphericModifiers(from, to, state)
//   3. Apply mods to:
//      - resolveShoot: gRadius_m += crossWindSpeed_mps × range / proj_speed
//      - adjustConeRange: multiply result by hazardConeMul_Q / SCALE.Q
//      - sensoryEnv.hearingRange_m: multiply by acousticMaskMul_Q / SCALE.Q
//      - KernelContext.tractionCoeff: multiply by mods.tractionMod_Q / SCALE.Q
//      - PA-7 senses: use scentStrength_Q for olfactory detection

import { SCALE, q, clampQ, type Q } from "./units.js";
import {
  type WeatherState,
  type WindField,
  deriveWeatherModifiers,
} from "./sim/weather.js";
import type { BiomeContext } from "./sim/biome.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Wind speed [WindField mps units, 100 per m/s] that produces maximum acoustic
 * masking (q(1.0)).  Calibrated at 40 m/s (gale / violent storm).
 */
export const ATMO_ACOUSTIC_FULL_MASK_MPS = 4_000;

/**
 * Wind speed [WindField mps units] that produces maximum turbulence (q(1.0)).
 * Calibrated at 50 m/s (hurricane-force).
 */
export const ATMO_TURBULENCE_FULL_MPS = 5_000;

/**
 * Clear-sky baseline visibility range [SCALE.m].  1 000 m = 10 000 000 SCALE.m.
 */
export const ATMO_BASE_VISIBILITY_Sm = 10_000_000;

/**
 * Maximum hazard-cone range multiplier from a strong tailwind (1.5× base range).
 * Stored as a raw multiplier where SCALE.Q = 1.0.
 */
export const ATMO_HAZARD_TAILWIND_MUL_MAX = 15_000;   // 1.5 × SCALE.Q

/**
 * Minimum hazard-cone range multiplier from a strong headwind (0.5× base range).
 */
export const ATMO_HAZARD_HEADWIND_MUL_MIN = 5_000;    // 0.5 × SCALE.Q

/**
 * Acoustic hearing range bonus when the sound source is directly upwind
 * (sound carries toward the listener): +20% of SCALE.Q.
 */
export const ATMO_HEARING_UPWIND_BONUS = 2_000;       // 0.2 × SCALE.Q

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * 3-D wind field with vertical component and turbulence.
 *
 * Extends `WeatherState.WindField` (2-D) — `deriveAtmosphericState` maps the
 * existing 2-D wind field and adds a zero vertical component when the source
 * has no vertical wind data.
 *
 * Speed units: 100 units = 1 m/s (same convention as WeatherState.WindField).
 */
export interface AtmosphericWind {
  /** X component of wind direction — unit vector in SCALE.m space. */
  dx_m: number;
  /** Y component of wind direction — unit vector in SCALE.m space. */
  dy_m: number;
  /**
   * Vertical (Z) component — positive = rising (updraft).
   * Unit vector in SCALE.m space.  `0` for standard horizontal wind.
   */
  dz_m: number;
  /** Wind speed [100 units = 1 m/s]. */
  speed_mps: number;
  /**
   * Turbulence intensity [Q 0..SCALE.Q].
   * q(0) = laminar flow; q(1.0) = severe gusts (hurricane-force).
   * Added to aim-error grouping radius for ranged attacks; derived from wind
   * speed by `deriveAtmosphericState`.
   */
  turbulence_Q: Q;
}

/**
 * Unified atmospheric state — combines wind, precipitation, visibility,
 * acoustic environment, and thermal offset into a single queryable struct.
 *
 * Build once per tick from `WeatherState` and `BiomeContext` via
 * `deriveAtmosphericState`, then query per entity-pair via
 * `queryAtmosphericModifiers`.
 */
export interface AtmosphericState {
  /** 3-D wind field. */
  wind: AtmosphericWind;

  /**
   * Precipitation intensity [Q 0..SCALE.Q].
   * q(0) = none; q(1.0) = blizzard/torrential rain.
   * Affects traction, visibility, and acoustic masking.
   */
  precipIntensity_Q: Q;

  /**
   * Baseline visibility range [SCALE.m] — clear-sky minus fog and precipitation.
   * `queryAtmosphericModifiers` adjusts this for headwind-driven precipitation.
   */
  baseVisibility_Sm: number;

  /**
   * Surface traction multiplier [Q].
   * Multiply `KernelContext.tractionCoeff` by this value (already derived from
   * `deriveWeatherModifiers().tractionMul_Q`).
   */
  tractionMod_Q: Q;

  /**
   * Ambient acoustic masking from wind noise [Q 0..SCALE.Q].
   * q(0) = still air (no masking); q(1.0) = severe wind noise (hearing near zero).
   * Applied to base hearing range before directional adjustments in
   * `queryAtmosphericModifiers`.
   */
  acousticMask_Q: Q;

  /**
   * Sound propagation multiplier from biome [Q].
   * q(1.0) = normal air propagation (default).
   * q(0.0) = vacuum (no sound).
   * q(4.0) = water (~4× faster propagation).
   * Multiplies the post-masking hearing range in `queryAtmosphericModifiers`.
   */
  soundPropagation_Q: Q;

  /**
   * Thermal offset in Phase-29 Q encoding.
   * Add to `KernelContext.thermalAmbient_Q`.
   */
  thermalOffset_Q: number;
}

/**
 * Per-pair atmospheric modifiers returned by `queryAtmosphericModifiers`.
 *
 * All values are ready to apply:
 * - Multiply Q fields using `Math.round(value × mul / SCALE.Q)`.
 * - Add offset fields directly.
 *
 * @see queryAtmosphericModifiers
 */
export interface AtmosphericModifiers {
  /**
   * Perpendicular wind component relative to the shot/query direction
   * [100 units = 1 m/s].
   *
   * Convert to projectile drift [SCALE.m]:
   * ```
   * drift_Sm = crossWindSpeed_mps × range_Sm / proj_speed_mps
   * ```
   * where `range_Sm` is in SCALE.m and `proj_speed_mps` is in the same
   * 100-per-m/s wind units.  Zero when the query pair is coincident.
   */
  crossWindSpeed_mps: number;

  /**
   * Hazard-cone range multiplier for gas/smoke cones aimed from `from` to `to`
   * [raw factor, SCALE.Q = 1.0].
   *
   * Values > SCALE.Q are valid and intentional:
   * - Tailwind extends range up to `ATMO_HAZARD_TAILWIND_MUL_MAX` (1.5×).
   * - Headwind reduces range down to `ATMO_HAZARD_HEADWIND_MUL_MIN` (0.5×).
   * - Crosswind or calm → SCALE.Q (1.0×, no change).
   *
   * Apply: `adjustedRange_Sm = Math.round(baseRange_Sm × hazardConeMul_Q / SCALE.Q)`.
   */
  hazardConeMul_Q: number;

  /**
   * Effective hearing range multiplier [Q 0..SCALE.Q + ATMO_HEARING_UPWIND_BONUS].
   *
   * Combines wind noise masking and directional propagation:
   * - Values < SCALE.Q: hearing degraded (wind noise or vacuum).
   * - Values up to SCALE.Q + ATMO_HEARING_UPWIND_BONUS: enhanced (sound downwind of listener).
   *
   * Apply: `effectiveRange_Sm = Math.round(baseRange_Sm × acousticMaskMul_Q / SCALE.Q)`.
   */
  acousticMaskMul_Q: number;

  /**
   * Effective visibility range [SCALE.m] for the query direction.
   * Already adjusted for headwind-driven precipitation and fog.
   * Use as maximum ranged-detection distance for this query pair.
   */
  visibilityRange_Sm: number;

  /**
   * Surface traction modifier [Q] — same as `AtmosphericState.tractionMod_Q`.
   * Included here for convenience so callers can read all mods from one struct.
   */
  tractionMod_Q: Q;

  /**
   * Scent propagation strength from `to` toward `from` [Q 0..SCALE.Q].
   *
   * Physics: the observer at `from` smells the entity at `to` when the wind
   * blows from `to` toward `from` (i.e., `from` is downwind of `to`).
   *
   * - q(1.0) = `from` is directly downwind of `to` (maximum scent).
   * - q(0)   = `from` is upwind of `to` (no scent reaches observer).
   * - Intermediate values for crosswind/partial alignment.
   *
   * Used by PA-7 olfactory detection.
   */
  scentStrength_Q: Q;

  /**
   * Thermal offset in Phase-29 Q encoding.
   * Same as `AtmosphericState.thermalOffset_Q`.
   */
  thermalOffset_Q: number;
}

// ── Zero-wind sentinel ────────────────────────────────────────────────────────

const ZERO_WIND: AtmosphericWind = {
  dx_m: SCALE.m,  // direction irrelevant at zero speed; default East
  dy_m: 0,
  dz_m: 0,
  speed_mps: 0,
  turbulence_Q: q(0) as Q,
};

// ── deriveAtmosphericState ────────────────────────────────────────────────────

/**
 * Build an `AtmosphericState` from Phase 51 `WeatherState` and Phase 68
 * `BiomeContext`.
 *
 * Both parameters are optional — absent values produce calm, clear-sky,
 * standard-air atmosphere with no modifiers.
 *
 * @example
 * ```ts
 * const atmo = deriveAtmosphericState(ctx.weather, ctx.biome);
 * // Use once per tick, query per entity-pair:
 * const mods = queryAtmosphericModifiers(attacker, target, atmo);
 * ```
 */
export function deriveAtmosphericState(
  weather?: WeatherState,
  biome?:   BiomeContext,
): AtmosphericState {
  // ── Wind ──────────────────────────────────────────────────────────────────
  const srcWind: WindField | undefined = weather?.wind;
  const turbulence_Q = srcWind
    ? clampQ(
        Math.round(srcWind.speed_mps * SCALE.Q / ATMO_TURBULENCE_FULL_MPS) as Q,
        q(0) as Q,
        SCALE.Q as Q,
      )
    : q(0) as Q;

  const wind: AtmosphericWind = srcWind
    ? { dx_m: srcWind.dx_m, dy_m: srcWind.dy_m, dz_m: 0, speed_mps: srcWind.speed_mps, turbulence_Q }
    : ZERO_WIND;

  // ── Weather-derived modifiers ─────────────────────────────────────────────
  const wmod = weather ? deriveWeatherModifiers(weather) : null;

  const tractionMod_Q = (wmod?.tractionMul_Q ?? SCALE.Q) as Q;
  const thermalOffset_Q = wmod?.thermalOffset_Q ?? 0;

  // ── Precipitation intensity ───────────────────────────────────────────────
  // Map WeatherModifiers.precipVisionMul_Q inversely: q(1.0) = none, q(0.30) = blizzard
  const precipVisionMul = wmod?.precipVisionMul_Q ?? SCALE.Q;
  // precipIntensity = 1.0 - precipVisionMul (inverted, clamped to [0, 1])
  const precipIntensity_Q = clampQ(
    (SCALE.Q - precipVisionMul) as Q,
    q(0) as Q,
    SCALE.Q as Q,
  );

  // ── Visibility ────────────────────────────────────────────────────────────
  // Fog: q(0) → full visibility; q(1.0) → 1% of baseline
  const fogDensity = weather?.fogDensity_Q ?? 0;
  const fogMul = Math.max(100, SCALE.Q - Math.round(fogDensity * 9_900 / SCALE.Q));  // 100..10000
  const precipMul = precipVisionMul;  // already in [q(0.30), q(1.0)]
  // Combined: fog + precip (multiplicative)
  const combinedVisionMul = Math.round(fogMul * precipMul / SCALE.Q);
  const baseVisibility_Sm = Math.max(
    10 * SCALE.m,   // minimum: 10 m visibility
    Math.round(ATMO_BASE_VISIBILITY_Sm * combinedVisionMul / SCALE.Q),
  );

  // ── Acoustic masking (ambient wind noise) ─────────────────────────────────
  const acousticMask_Q = clampQ(
    Math.round(wind.speed_mps * SCALE.Q / ATMO_ACOUSTIC_FULL_MASK_MPS) as Q,
    q(0) as Q,
    SCALE.Q as Q,
  );

  // ── Sound propagation from biome ──────────────────────────────────────────
  const soundPropagation_Q = biome?.soundPropagation !== undefined
    ? biome.soundPropagation as Q
    : SCALE.Q as Q;

  return {
    wind,
    precipIntensity_Q,
    baseVisibility_Sm,
    tractionMod_Q,
    acousticMask_Q,
    soundPropagation_Q,
    thermalOffset_Q,
  };
}

// ── queryAtmosphericModifiers ─────────────────────────────────────────────────

/**
 * Query all atmospheric modifiers for a position pair.
 *
 * Computes wind-relative effects along the `from → to` vector:
 * - Crosswind component for projectile drift.
 * - Tailwind/headwind ratio for hazard-cone range.
 * - Directional acoustic effects.
 * - Headwind-boosted precipitation degrading visibility.
 * - Scent propagation strength (downwind = strong, upwind = none).
 *
 * Pure function — no mutation, safe to call multiple times per tick.
 *
 * @param from  Observer / attacker position [SCALE.m].
 * @param to    Target / source position [SCALE.m].
 * @param state Atmospheric state built by `deriveAtmosphericState`.
 * @returns     All modifiers for this position pair.
 */
export function queryAtmosphericModifiers(
  from:  { x_Sm: number; y_Sm: number },
  to:    { x_Sm: number; y_Sm: number },
  state: AtmosphericState,
): AtmosphericModifiers {
  const shotDx = to.x_Sm - from.x_Sm;
  const shotDy = to.y_Sm - from.y_Sm;
  const distSq = shotDx * shotDx + shotDy * shotDy;
  const dist_Sm = distSq > 0 ? Math.trunc(Math.sqrt(distSq)) : 0;

  const { wind } = state;

  // ── Wind-direction geometry ────────────────────────────────────────────────
  // Dot and cross products of wind direction (unit vector × SCALE.m) with shot
  // direction (SCALE.m).  Both raw values have units SCALE.m², scaled by dist.
  // We normalise by dividing by dist_Sm to recover SCALE.m-range cosine/sine.

  // dotNorm ∈ [-SCALE.m, SCALE.m]: positive = tailwind, negative = headwind.
  // crossNorm ∈ [0, SCALE.m]: magnitude of perpendicular component.
  let dotNorm  = 0;
  let crossNorm = 0;

  if (dist_Sm > 0 && wind.speed_mps > 0) {
    const dotRaw   = wind.dx_m * shotDx + wind.dy_m * shotDy;
    const crossRaw = wind.dx_m * shotDy - wind.dy_m * shotDx;
    dotNorm   = Math.trunc(dotRaw   / dist_Sm);  // SCALE.m units (cosine component)
    crossNorm = Math.trunc(Math.abs(crossRaw) / dist_Sm);  // SCALE.m units (sine component)
    // Clamp to valid range (floating-point-free but integer rounding can exceed SCALE.m)
    dotNorm   = Math.max(-SCALE.m, Math.min(SCALE.m, dotNorm));
    crossNorm = Math.min(SCALE.m, crossNorm);
  }

  // ── Crosswind speed (projectile drift) ───────────────────────────────────
  // crossWindSpeed_mps = |sin θ| × wind.speed_mps
  const crossWindSpeed_mps = Math.round(crossNorm * wind.speed_mps / SCALE.m);

  // ── Hazard-cone multiplier ────────────────────────────────────────────────
  // At full tailwind (dotNorm = +SCALE.m): 1.5× range.
  // At full headwind (dotNorm = -SCALE.m): 0.5× range.
  // Range: [ATMO_HAZARD_HEADWIND_MUL_MIN, ATMO_HAZARD_TAILWIND_MUL_MAX].
  const HAZARD_HALF_RANGE = Math.round((ATMO_HAZARD_TAILWIND_MUL_MAX - ATMO_HAZARD_HEADWIND_MUL_MIN) / 2);
  const hazardConeMul_Q = Math.max(
    ATMO_HAZARD_HEADWIND_MUL_MIN,
    Math.min(
      ATMO_HAZARD_TAILWIND_MUL_MAX,
      SCALE.Q + Math.round(dotNorm * HAZARD_HALF_RANGE / SCALE.m),
    ),
  );

  // ── Acoustic masking multiplier ───────────────────────────────────────────
  // Base: 1.0 − ambient wind noise masking.
  // Directional bonus: source upwind of listener (negative dotNorm) → sound
  // carries toward the listener → up to +ATMO_HEARING_UPWIND_BONUS.
  const baseHearing = SCALE.Q - state.acousticMask_Q;
  const upwindBonus = Math.max(0, Math.round(-dotNorm * ATMO_HEARING_UPWIND_BONUS / SCALE.m));
  // Apply biome sound propagation (e.g. ×4 in water, ×0 in vacuum)
  const rawAcousticMul = Math.round(
    (baseHearing + upwindBonus) * state.soundPropagation_Q / SCALE.Q,
  );
  const acousticMaskMul_Q = Math.max(0, rawAcousticMul);

  // ── Visibility (directional) ──────────────────────────────────────────────
  // Headwind drives precipitation particles directly at the sensor, increasing
  // effective precipitation density and reducing visibility further.
  const headwindFrac = Math.max(0, -dotNorm);  // 0..SCALE.m for headwind
  // precipBoostPenalty: extra vision reduction from headwind-driven precipitation
  const precipBoostPenalty = Math.round(
    headwindFrac * state.precipIntensity_Q / SCALE.m * q(0.30) / SCALE.Q,
  );
  const visionMul = Math.max(
    100,   // ≥ 1% of base
    SCALE.Q - Math.round(state.precipIntensity_Q * 3_000 / SCALE.Q) - precipBoostPenalty,
  );
  const visibilityRange_Sm = Math.max(
    10 * SCALE.m,
    Math.round(state.baseVisibility_Sm * visionMul / SCALE.Q),
  );

  // ── Scent strength ────────────────────────────────────────────────────────
  // "from" smells "to" when wind blows from to→from (reversed shot direction
  // aligns with wind direction).
  // scentDotNorm = -dotNorm (positive = wind blows from `to` toward `from`).
  const scentDotNorm = -dotNorm;
  const scentStrength_Q = clampQ(
    Math.round(scentDotNorm * SCALE.Q / SCALE.m) as Q,
    q(0) as Q,
    SCALE.Q as Q,
  );

  return {
    crossWindSpeed_mps,
    hazardConeMul_Q,
    acousticMaskMul_Q,
    visibilityRange_Sm,
    tractionMod_Q: state.tractionMod_Q,
    scentStrength_Q,
    thermalOffset_Q: state.thermalOffset_Q,
  };
}
