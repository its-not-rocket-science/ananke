// src/sim/sensory-extended.ts — Phase 52: Extended Sensory Systems
//
// Adds three sensory modalities beyond Phase 4 vision/hearing:
//   - Echolocation: darkness-independent detection (bats, cetaceans, shrews)
//   - Electroreception: bioelectric-field detection (sharks, eels, platypus)
//   - Olfaction: wind-aware scent tracking (wolves, dogs, bears)
//
// Also provides computeDaylightMul() for time-of-day lighting integration
// with SensoryEnvironment.lightMul.
//
// Data flow:
//   canDetect (Phase 4) → canDetectExtended → extended modality checks
//   computeDaylightMul(hourOfDay) → SensoryEnvironment.lightMul multiplier

import type { Q } from "../units.js";
import { SCALE, q, clampQ, mulDiv } from "../units.js";
import type { Entity } from "./entity.js";
import type { SensoryEnvironment } from "./sensory.js";
import { canDetect } from "./sensory.js";
import type { WindField, PrecipitationType } from "./weather.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Extra sensory capabilities attached to an entity.
 * All fields are optional — absent = that modality is not present.
 */
export interface ExtendedSenses {
  /**
   * Echolocation detection range [SCALE.m].
   * Non-zero = entity can detect physical objects via reflected sound.
   * Bypasses lightMul and smokeMul; degraded by high ambient noise (noiseMul).
   */
  echolocationRange_m?: number;

  /**
   * Electroreception detection range [SCALE.m].
   * Non-zero = entity can detect the bioelectric fields of living creatures.
   * Short-range (~1–4 m for real-world species); unaffected by light or noise.
   * Dead entities have no bioelectric field — not detectable.
   */
  electroreceptionRange_m?: number;

  /**
   * Olfaction (scent) sensitivity (Q 0..SCALE.Q).
   * q(0) = absent; q(1.0) = wolf-level (detects prey at 50 m downwind).
   * Wind direction enhances (downwind) or suppresses (upwind) detection.
   * Precipitation disperses scent.
   */
  olfactionSensitivity_Q?: Q;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Reference olfaction range [SCALE.m]: q(1.0) sensitivity detects at 50 m downwind. */
const OLFACTION_REF_RANGE_m = 50 * SCALE.m;  // 50_000

/** Minimum scent strength (Q) to count as olfactory detection. */
const OLFACTION_DETECT_THRESHOLD: Q = q(0.20) as Q;

/** Detected via echolocation — returned by canDetectExtended. */
export const DETECT_ECHOLOCATION: Q = q(0.70) as Q;

/** Detected via electroreception — returned by canDetectExtended. */
export const DETECT_ELECTRORECEPTION: Q = q(0.80) as Q;

/** Minimum olfaction detection quality — returned by canDetectExtended. */
const DETECT_OLFACTION_MIN: Q = q(0.20) as Q;
const DETECT_OLFACTION_MAX: Q = q(0.40) as Q;

/** Daylight Q at midnight (minimum). */
const DAYLIGHT_NIGHT_Q: Q = q(0.10) as Q;

/** Precipitation scent dispersal multiplier (Q). */
const PRECIP_SCENT_MUL: Partial<Record<PrecipitationType, Q>> = {
  none:       q(1.00) as Q,
  rain:       q(0.70) as Q,
  heavy_rain: q(0.40) as Q,
  snow:       q(0.80) as Q,
  blizzard:   q(0.20) as Q,
  hail:       q(0.60) as Q,
};

// ── computeDaylightMul ────────────────────────────────────────────────────────

/**
 * Compute ambient light multiplier from time of day.
 *
 * Uses cosine interpolation: noon (12 h) → q(1.0); midnight (0/24 h) → q(0.10).
 * 6 h / 18 h (dawn/dusk) → q(0.55).
 *
 * Intended for use as a multiplier on SensoryEnvironment.lightMul:
 *   `env.lightMul = Math.trunc(env.lightMul * computeDaylightMul(hour) / SCALE.Q)`
 *
 * @param hourOfDay  Real-valued hour, 0–24 (0 and 24 are both midnight).
 * @returns Q multiplier in [q(0.10), q(1.0)].
 */
export function computeDaylightMul(hourOfDay: number): Q {
  // angle: noon (12h) maps to π → cos(π) = −1 → maximum light
  //        midnight (0h) maps to 0 → cos(0) = +1 → minimum light
  const angle = hourOfDay * Math.PI / 12;
  const cosVal = Math.cos(angle);
  // Map cos ∈ [+1, −1] → frac ∈ [0, 1] (0 at midnight, 1 at noon)
  const frac = (1 - cosVal) / 2;
  const result = Math.round(DAYLIGHT_NIGHT_Q + frac * (SCALE.Q - DAYLIGHT_NIGHT_Q));
  return clampQ(result as Q, DAYLIGHT_NIGHT_Q, SCALE.Q as Q);
}

// ── canDetectByEcholocation ───────────────────────────────────────────────────

/**
 * Whether observer can detect subject via echolocation.
 *
 * - Requires `observer.extendedSenses.echolocationRange_m > 0`.
 * - Unaffected by light or smoke — works in total darkness.
 * - Effective range degraded by high ambient noise: `effectiveRange = range / noiseMul × SCALE.Q`.
 *   At default (noiseMul = SCALE.Q): full range. At 2× noise: half range.
 * - Detects physical presence (dead entities still detected).
 *
 * @param dist_m  Distance from observer to subject [SCALE.m].
 * @param noiseMul  Ambient noise multiplier from SensoryEnvironment.
 */
export function canDetectByEcholocation(
  observer: Entity,
  subject:  Entity,
  dist_m:   number,
  noiseMul: Q,
): boolean {
  const range = observer.extendedSenses?.echolocationRange_m;
  if (!range || range <= 0) return false;
  // Echolocation detects physical mass (sound reflection), not life — dead entities ARE detected.

  // Effective range: divided by noiseMul (SCALE.Q base)
  const effectiveRange = mulDiv(range, SCALE.Q, Math.max(noiseMul, 1));
  return dist_m <= effectiveRange;
}

// ── canDetectByElectroreception ───────────────────────────────────────────────

/**
 * Whether observer can detect subject via electroreception.
 *
 * - Requires `observer.extendedSenses.electroreceptionRange_m > 0`.
 * - Detects the bioelectric field of living entities only (dead = no field).
 * - Unaffected by any environmental modifier.
 *
 * @param dist_m  Distance from observer to subject [SCALE.m].
 */
export function canDetectByElectroreception(
  observer: Entity,
  subject:  Entity,
  dist_m:   number,
): boolean {
  const range = observer.extendedSenses?.electroreceptionRange_m;
  if (!range || range <= 0) return false;
  if (subject.injury.dead) return false;  // no bioelectric field after death
  return dist_m <= range;
}

// ── deriveScentDetection ──────────────────────────────────────────────────────

/**
 * Olfactory detection strength (Q 0..SCALE.Q) of subject by observer.
 *
 * Returns q(0) if observer has no olfaction or subject is out of scent range.
 * Returns higher values when:
 *   - Observer is close to subject.
 *   - Observer is downwind of subject (wind carries scent toward observer).
 *   - Precipitation is absent or light.
 *
 * @param dist_m        Distance [SCALE.m].
 * @param wind          Optional wind field from WeatherState.
 * @param precipitation Optional precipitation type from WeatherState.
 */
export function deriveScentDetection(
  observer:      Entity,
  subject:       Entity,
  dist_m:        number,
  wind?:         WindField,
  precipitation?: PrecipitationType,
): Q {
  const sens = observer.extendedSenses?.olfactionSensitivity_Q;
  if (!sens || sens <= 0) return q(0) as Q;
  if (dist_m <= 0) return SCALE.Q as Q;

  // Base scent strength: decays with distance (q(1.0) sensitivity → detection at 50 m downwind).
  const strength_Q = clampQ(
    Math.trunc(sens * OLFACTION_REF_RANGE_m / dist_m) as Q,
    q(0) as Q,
    SCALE.Q as Q,
  );

  // Wind alignment: dot(subject→observer, windDir) / (dist_m × SCALE.m) ∈ [−1, +1].
  // +1 = observer is directly downwind (scent maximally carried to observer).
  // −1 = observer is upwind (scent blows away from observer).
  let windMul_Q: Q = q(0.50) as Q;   // no wind → neutral (q(0.50))
  if (wind && wind.speed_mps > 0 && dist_m > 0) {
    const soX = observer.position_m.x - subject.position_m.x;  // subject→observer
    const soY = observer.position_m.y - subject.position_m.y;
    const dot = soX * wind.dx_m + soY * wind.dy_m;
    // windMul_Q ∈ [0, SCALE.Q]: 0 = full upwind, SCALE.Q = full downwind
    windMul_Q = clampQ(
      (5_000 + Math.trunc(dot * 5_000 / (dist_m * SCALE.m))) as Q,
      q(0) as Q,
      SCALE.Q as Q,
    );
  }

  // Precipitation disperses scent.
  const precipMul_Q: Q = PRECIP_SCENT_MUL[precipitation ?? "none"] ?? (SCALE.Q as Q);

  const combined = Math.trunc(
    Math.trunc(strength_Q * windMul_Q / SCALE.Q) * precipMul_Q / SCALE.Q,
  ) as Q;

  return clampQ(combined, q(0) as Q, SCALE.Q as Q);
}

// ── canDetectExtended ─────────────────────────────────────────────────────────

/**
 * Full detection check including Phase 4 vision/hearing and Phase 52 extended modalities.
 *
 * Detection quality (Q) returned:
 *   q(1.0)  — vision (primary)
 *   q(0.8)  — electroreception (precise position, very short range)
 *   q(0.7)  — echolocation (good spatial, darkness-independent)
 *   q(0.4)  — hearing (Phase 4, omnidirectional)
 *   q(0.20–0.40) — olfaction (approximate, wind/rain dependent)
 *   q(0)    — undetected
 *
 * @param sensorBoost  Phase 11C sensor equipment bonus.
 * @param wind         Optional wind for olfaction wind-alignment calculation.
 * @param precipitation Optional precipitation for scent dispersal.
 */
export function canDetectExtended(
  observer:      Entity,
  subject:       Entity,
  env:           SensoryEnvironment,
  sensorBoost?:  { visionRangeMul: Q; hearingRangeMul: Q },
  wind?:         WindField,
  precipitation?: PrecipitationType,
): Q {
  // Primary senses (vision + hearing, Phase 4).
  const primary = canDetect(observer, subject, env, sensorBoost);
  if (primary > q(0)) return primary;

  // Extended senses require knowing distance.
  const dx = subject.position_m.x - observer.position_m.x;
  const dy = subject.position_m.y - observer.position_m.y;
  const dz = subject.position_m.z - observer.position_m.z;
  const dist_m = Math.trunc(Math.sqrt(dx * dx + dy * dy + dz * dz));

  // Electroreception (highest quality after vision — very precise, very short range).
  if (canDetectByElectroreception(observer, subject, dist_m)) {
    return DETECT_ELECTRORECEPTION;
  }

  // Echolocation (good spatial awareness, works in darkness).
  if (canDetectByEcholocation(observer, subject, dist_m, env.noiseMul)) {
    return DETECT_ECHOLOCATION;
  }

  // Olfaction (approximate, wind-dependent).
  const scent = deriveScentDetection(observer, subject, dist_m, wind, precipitation);
  if (scent >= OLFACTION_DETECT_THRESHOLD) {
    // Map scent strength → detection quality in [DETECT_OLFACTION_MIN, DETECT_OLFACTION_MAX].
    return clampQ(
      Math.trunc(scent * (DETECT_OLFACTION_MAX - DETECT_OLFACTION_MIN) / SCALE.Q + DETECT_OLFACTION_MIN) as Q,
      DETECT_OLFACTION_MIN,
      DETECT_OLFACTION_MAX,
    );
  }

  return q(0) as Q;
}
