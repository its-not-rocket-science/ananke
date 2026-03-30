// src/extended-senses.ts — PA-7: Advanced Non-Visual Sensory Systems
//
// Extends Phase 52 (sensory-extended.ts) with:
//   - Thermal (infrared) detection — 4th modality alongside echolocation,
//     electroreception, and olfaction.
//   - stepExtendedSenses(entity, world, atmospheric, env) — batch per-tick
//     detection accumulator returning structured results per modality.
//   - AtmosphericState integration — olfaction uses scentStrength_Q from
//     queryAtmosphericModifiers (PA-6) rather than re-computing wind alignment.
//   - Body-plan predicates: hasEcholocation, hasElectroreception,
//     hasThermalVision, hasOlfaction, dominantSense.
//
// Compatibility: fully additive — does not modify the Phase 52 API.  Hosts
// can replace calls to canDetectExtended with canDetectExtendedAtmospheric
// for unified atmospheric integration, or continue using Phase 52 directly.

import { SCALE, q, clampQ, mulDiv, type Q } from "./units.js";
import type { Entity } from "./sim/entity.js";
import type { WorldState } from "./sim/world.js";
import type { SensoryEnvironment } from "./sim/sensory.js";
import { canDetect } from "./sim/sensory.js";
import {
  canDetectByEcholocation,
  canDetectByElectroreception,
  deriveScentDetection,
  DETECT_ECHOLOCATION,
  DETECT_ELECTRORECEPTION,
} from "./sim/sensory-extended.js";
import {
  type AtmosphericState,
  queryAtmosphericModifiers,
} from "./atmosphere.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Sensory modality used for a detection. */
export type SenseModality =
  | "vision"
  | "echolocation"
  | "electroreception"
  | "olfaction"
  | "thermal";

/**
 * A single detected entity and the sense used to detect it.
 *
 * Multiple detections for the same `entityId` are possible (e.g. a close
 * target may be detected by both olfaction and echolocation).  Callers should
 * take the maximum `quality_Q` per entity for targeting decisions.
 */
export interface SensoryDetection {
  /** Id of the detected entity. */
  entityId: number;
  /** Modality that produced this detection. */
  modality: SenseModality;
  /**
   * Detection quality [Q 0..SCALE.Q].
   * Higher = more precise positional information.
   * q(0.80) = electroreception; q(0.70) = echolocation; q(0.40) = olfaction/thermal.
   */
  quality_Q: Q;
  /** Distance from observer to detected entity [SCALE.m]. */
  dist_Sm: number;
}

/** Result of a `stepExtendedSenses` call. */
export interface ExtendedSensesResult {
  /** All detections produced this tick. May be empty. */
  detections: SensoryDetection[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Thermal signature of a living entity at rest [Q]. */
export const THERMAL_BASE_SIGNATURE_Q: Q = q(0.30) as Q;

/**
 * Additional thermal signature per bleeding body region [Q].
 * Warm blood on the surface raises infrared contrast.
 */
export const THERMAL_BLEED_BONUS_Q: Q = q(0.10) as Q;

/**
 * Additional thermal signature when entity shock exceeds `THERMAL_SHOCK_THRESHOLD`.
 * Fever and inflammation elevate core temperature.
 */
export const THERMAL_SHOCK_BONUS_Q: Q = q(0.15) as Q;

/** Shock level [Q] above which a fever/inflammatory bonus applies. */
export const THERMAL_SHOCK_THRESHOLD: Q = q(0.40) as Q;

/**
 * Precipitation reduces effective thermal range.
 * At precipIntensity_Q = SCALE.Q: range × (1 - THERMAL_PRECIP_PENALTY).
 */
export const THERMAL_PRECIP_PENALTY: Q = q(0.60) as Q;

/** Detection quality returned for thermal detections. */
export const DETECT_THERMAL: Q = q(0.35) as Q;

/** Minimum olfaction detection quality when atmospheric scentStrength_Q is q(1.0). */
export const DETECT_OLFACTION_ATMO_MIN: Q = q(0.20) as Q;
/** Maximum olfaction detection quality. */
export const DETECT_OLFACTION_ATMO_MAX: Q = q(0.40) as Q;

// ── Body-plan predicates ──────────────────────────────────────────────────────

/** Returns `true` if the entity has echolocation capability. */
export function hasEcholocation(entity: Entity): boolean {
  return (entity.extendedSenses?.echolocationRange_m ?? 0) > 0;
}

/** Returns `true` if the entity has electroreception capability. */
export function hasElectroreception(entity: Entity): boolean {
  return (entity.extendedSenses?.electroreceptionRange_m ?? 0) > 0;
}

/** Returns `true` if the entity has thermal (infrared) vision. */
export function hasThermalVision(entity: Entity): boolean {
  return (entity.extendedSenses?.thermalVisionRange_m ?? 0) > 0;
}

/** Returns `true` if the entity has olfaction (scent) capability. */
export function hasOlfaction(entity: Entity): boolean {
  return (entity.extendedSenses?.olfactionSensitivity_Q ?? 0) > 0;
}

/**
 * Returns the entity's dominant non-visual sense.
 *
 * Priority: electroreception > echolocation > thermal > olfaction > vision.
 *
 * Use this to steer AI targeting logic:
 * - `"echolocation"` → entity can hunt in total darkness.
 * - `"electroreception"` → entity detects living creatures at close range
 *   regardless of light, noise, or scent.
 * - `"thermal"` → entity detects warm-bodied prey by heat signature.
 * - `"olfaction"` → entity tracks prey by scent trail (wind-dependent).
 * - `"vision"` → standard visual detection (default).
 */
export function dominantSense(entity: Entity): SenseModality {
  if (hasElectroreception(entity)) return "electroreception";
  if (hasEcholocation(entity))     return "echolocation";
  if (hasThermalVision(entity))    return "thermal";
  if (hasOlfaction(entity))        return "olfaction";
  return "vision";
}

// ── Thermal detection ─────────────────────────────────────────────────────────

/**
 * Compute the thermal signature of an entity [Q 0..SCALE.Q].
 *
 * Dead entities return q(0) — no remaining metabolic heat.
 * Living entities radiate at least `THERMAL_BASE_SIGNATURE_Q`.
 * Active bleeding and fever raise the signature further.
 */
export function thermalSignature(entity: Entity): Q {
  if (entity.injury?.dead) return q(0) as Q;

  let sig: number = THERMAL_BASE_SIGNATURE_Q;

  // Bleeding: each bleeding region raises infrared contrast (warm blood visible)
  if (entity.injury !== undefined) {
    for (const region of Object.values(entity.injury.byRegion)) {
      if (region.bleedingRate > 0) {
        sig += THERMAL_BLEED_BONUS_Q;
      }
    }
  }

  // Fever / high shock: inflammation raises skin temperature
  if ((entity.injury?.shock ?? 0) >= THERMAL_SHOCK_THRESHOLD) {
    sig += THERMAL_SHOCK_BONUS_Q;
  }

  return clampQ(Math.round(sig) as Q, q(0) as Q, SCALE.Q as Q);
}

/**
 * Whether observer can detect subject via thermal (infrared) vision.
 *
 * - Requires `observer.extendedSenses.thermalVisionRange_m > 0`.
 * - Dead entities have no thermal signature and are not detected.
 * - Effective range: `thermalVisionRange_m × signature_Q / SCALE.Q`,
 *   further reduced by precipitation (`THERMAL_PRECIP_PENALTY`).
 * - Unaffected by ambient light or noise.
 *
 * @param dist_m          Distance from observer to subject [SCALE.m].
 * @param precipIntensity Precipitation intensity [Q 0..SCALE.Q] from AtmosphericState.
 */
export function canDetectByThermalVision(
  observer:         Entity,
  subject:          Entity,
  dist_m:           number,
  precipIntensity?: Q,
): boolean {
  const baseRange = observer.extendedSenses?.thermalVisionRange_m;
  if (!baseRange || baseRange <= 0) return false;
  if (subject.injury?.dead) return false;

  const sig = thermalSignature(subject);
  if (sig <= 0) return false;

  // Signature scales effective range (high-signature targets detectable at greater range)
  const sigRange = mulDiv(baseRange, sig, SCALE.Q);

  // Precipitation attenuates thermal radiation
  const precipPenalty = precipIntensity !== undefined
    ? mulDiv(THERMAL_PRECIP_PENALTY, precipIntensity, SCALE.Q)
    : 0;
  const precipMul = Math.max(0, SCALE.Q - precipPenalty);
  const effectiveRange = mulDiv(sigRange, precipMul, SCALE.Q);

  return dist_m <= effectiveRange;
}

// ── Atmospheric olfaction ─────────────────────────────────────────────────────

/**
 * Compute olfaction detection quality using pre-computed atmospheric context.
 *
 * Replaces calling `deriveScentDetection` when an `AtmosphericState` is
 * available — uses `scentStrength_Q` from `queryAtmosphericModifiers` instead
 * of independently re-computing wind alignment.
 *
 * @returns Q quality ∈ [0, DETECT_OLFACTION_ATMO_MAX].
 */
function _olfactionQualityAtmospheric(
  observer:   Entity,
  subject:    Entity,
  dist_m:     number,
  scentStrength_Q: Q,
  precipIntensity_Q: Q,
): Q {
  const sens = observer.extendedSenses?.olfactionSensitivity_Q;
  if (!sens || sens <= 0) return q(0) as Q;
  if (dist_m <= 0) return DETECT_OLFACTION_ATMO_MAX;

  // Reference range: q(1.0) sensitivity detects at 50 m downwind (500 000 Sm)
  const REF_RANGE_m = 50 * SCALE.m;
  const distStrength = clampQ(
    Math.trunc(sens * REF_RANGE_m / dist_m) as Q,
    q(0) as Q,
    SCALE.Q as Q,
  );

  // Wind alignment from atmospheric (scentStrength_Q from PA-6)
  // Precipitation dispersal (q(0) intensity = no dispersal; q(1.0) = 60% reduction)
  const precipDisperse = Math.max(
    q(0.20) as number,
    SCALE.Q - Math.round(precipIntensity_Q * 8_000 / SCALE.Q),
  );

  const combined = Math.trunc(
    Math.trunc(distStrength * scentStrength_Q / SCALE.Q) * precipDisperse / SCALE.Q,
  ) as Q;

  if (combined < DETECT_OLFACTION_ATMO_MIN) return q(0) as Q;

  return clampQ(combined, DETECT_OLFACTION_ATMO_MIN, DETECT_OLFACTION_ATMO_MAX);
}

// ── canDetectExtendedAtmospheric ──────────────────────────────────────────────

/**
 * Full detection check using all four extended modalities, with `AtmosphericState`
 * integration for olfaction and thermal.
 *
 * Returns best detection quality [Q] across all active senses:
 * - q(1.0):       vision (Phase 4)
 * - q(0.80):      electroreception
 * - q(0.70):      echolocation
 * - q(0.20–0.40): olfaction (atmospheric, wind/precip dependent)
 * - q(0.35):      thermal (heat-signature dependent)
 * - q(0):         undetected
 *
 * Use this as a drop-in replacement for `canDetectExtended` when an
 * `AtmosphericState` is available.
 */
export function canDetectExtendedAtmospheric(
  observer:     Entity,
  subject:      Entity,
  env:          SensoryEnvironment,
  atmospheric:  AtmosphericState,
  sensorBoost?: { visionRangeMul: Q; hearingRangeMul: Q },
): Q {
  // Phase 4 vision + hearing (existing canDetect)
  const primary = canDetect(observer, subject, env, sensorBoost);
  if (primary > q(0)) return primary;

  // Distance (integer sqrt over 3D position)
  const dx = subject.position_m.x - observer.position_m.x;
  const dy = subject.position_m.y - observer.position_m.y;
  const dz = subject.position_m.z - observer.position_m.z;
  const dist_m = Math.trunc(Math.sqrt(dx * dx + dy * dy + dz * dz));

  // Electroreception
  if (canDetectByElectroreception(observer, subject, dist_m)) {
    return DETECT_ELECTRORECEPTION;
  }

  // Echolocation — use atmospheric noiseMul if available
  // acousticMaskMul_Q → inverse of noiseMul: q(1.0) = normal noise, lower = quieter
  // Existing canDetectByEcholocation takes noiseMul directly from env
  if (canDetectByEcholocation(observer, subject, dist_m, env.noiseMul)) {
    return DETECT_ECHOLOCATION;
  }

  // Thermal detection
  if (canDetectByThermalVision(observer, subject, dist_m, atmospheric.precipIntensity_Q)) {
    return DETECT_THERMAL;
  }

  // Olfaction (atmospheric integration)
  const from2d = { x_Sm: observer.position_m.x, y_Sm: observer.position_m.y };
  const to2d   = { x_Sm: subject.position_m.x,  y_Sm: subject.position_m.y };
  const mods = queryAtmosphericModifiers(from2d, to2d, atmospheric);
  const olfactionQ = _olfactionQualityAtmospheric(
    observer, subject, dist_m,
    mods.scentStrength_Q,
    atmospheric.precipIntensity_Q,
  );
  if (olfactionQ > q(0)) return olfactionQ;

  return q(0) as Q;
}

// ── stepExtendedSenses ────────────────────────────────────────────────────────

/**
 * Accumulate all extended-sense detections for one observer entity.
 *
 * Iterates all entities in `world`, skips the observer itself, and for each
 * other entity checks all four extended modalities.  Multiple detections per
 * target are possible and are all returned (callers take the max quality).
 *
 * Visual and hearing detection is **not** included — use `canDetect` (Phase 4)
 * or `canDetectExtendedAtmospheric` for full detection checks.
 *
 * @param observer    The sensing entity.
 * @param world       Current world state (iterated for targets).
 * @param atmospheric Atmospheric state from `deriveAtmosphericState` (PA-6).
 * @param env         Sensory environment for echolocation noise level.
 * @returns           All detections this tick (may be empty).
 *
 * @example
 * ```ts
 * const atmo = deriveAtmosphericState(ctx.weather, ctx.biome);
 * const result = stepExtendedSenses(bat, world, atmo, ctx.sensoryEnv ?? DEFAULT_SENSORY_ENV);
 * for (const det of result.detections) {
 *   // det.entityId, det.modality, det.quality_Q, det.dist_Sm
 * }
 * ```
 */
export function stepExtendedSenses(
  observer:     Entity,
  world:        WorldState,
  atmospheric:  AtmosphericState,
  env:          SensoryEnvironment,
): ExtendedSensesResult {
  const detections: SensoryDetection[] = [];

  const hasEcho  = hasEcholocation(observer);
  const hasElec  = hasElectroreception(observer);
  const hasThermal = hasThermalVision(observer);
  const hasOlf  = hasOlfaction(observer);

  // Early-out if observer has no extended senses
  if (!hasEcho && !hasElec && !hasThermal && !hasOlf) {
    return { detections };
  }

  const obsX = observer.position_m.x;
  const obsY = observer.position_m.y;
  const obsZ = observer.position_m.z;

  for (const subject of world.entities) {
    if (subject.id === observer.id) continue;

    const dx = subject.position_m.x - obsX;
    const dy = subject.position_m.y - obsY;
    const dz = subject.position_m.z - obsZ;
    const dist_m = Math.trunc(Math.sqrt(dx * dx + dy * dy + dz * dz));

    // Electroreception
    if (hasElec && canDetectByElectroreception(observer, subject, dist_m)) {
      detections.push({
        entityId: subject.id,
        modality: "electroreception",
        quality_Q: DETECT_ELECTRORECEPTION,
        dist_Sm: dist_m,
      });
    }

    // Echolocation
    if (hasEcho && canDetectByEcholocation(observer, subject, dist_m, env.noiseMul)) {
      detections.push({
        entityId: subject.id,
        modality: "echolocation",
        quality_Q: DETECT_ECHOLOCATION,
        dist_Sm: dist_m,
      });
    }

    // Thermal
    if (hasThermal && canDetectByThermalVision(observer, subject, dist_m, atmospheric.precipIntensity_Q)) {
      detections.push({
        entityId: subject.id,
        modality: "thermal",
        quality_Q: DETECT_THERMAL,
        dist_Sm: dist_m,
      });
    }

    // Olfaction (atmospheric integration)
    if (hasOlf) {
      const from2d = { x_Sm: obsX,                y_Sm: obsY };
      const to2d   = { x_Sm: subject.position_m.x, y_Sm: subject.position_m.y };
      const mods = queryAtmosphericModifiers(from2d, to2d, atmospheric);
      const q_olf = _olfactionQualityAtmospheric(
        observer, subject, dist_m,
        mods.scentStrength_Q,
        atmospheric.precipIntensity_Q,
      );
      if (q_olf > q(0)) {
        detections.push({
          entityId: subject.id,
          modality: "olfaction",
          quality_Q: q_olf,
          dist_Sm: dist_m,
        });
      }
    }
  }

  return { detections };
}
