/**
 * Phase 4: Sensory environment model.
 *
 * Fixed-point only. No Math.random() — all randomness via eventSeed if needed.
 * Light, smoke, and noise modifiers are Q values (SCALE.Q = full normal conditions).
 */

import type { Q } from "../units.js";
import { SCALE, q, mulDiv } from "../units.js";
import type { Entity } from "./entity.js";
import type { Vec3 } from "./vec3.js";
import type { Perception } from "../types.js";
import { getSkill } from "./skills.js";

// Default perception — used as init guard for entities without Phase 4 attributes.
export const DEFAULT_PERCEPTION: Perception = {
  visionRange_m: Math.trunc(200 * SCALE.m),
  visionArcDeg: 120,
  halfArcCosQ: Math.round(Math.cos((120 / 2) * (Math.PI / 180)) * SCALE.Q) as Q,
  hearingRange_m: Math.trunc(50 * SCALE.m),
  decisionLatency_s: Math.trunc(0.5 * SCALE.s),
  attentionDepth: 4,
  threatHorizon_m: Math.trunc(40 * SCALE.m),
};

export interface SensoryEnvironment {
  /** Multiplier on vision range: q(1.0) = daylight, q(0.1) = near-dark. */
  lightMul: Q;
  /** Multiplier on vision range: q(1.0) = clear, q(0.2) = dense smoke. */
  smokeMul: Q;
  /** Multiplier on hearing range: q(1.0) = quiet, q(2.0) = loud battle noise. */
  noiseMul: Q;
}

export const DEFAULT_SENSORY_ENV: SensoryEnvironment = {
  lightMul: q(1.0),
  smokeMul: q(1.0),
  noiseMul: q(1.0),
};

/**
 * Compute detection quality of `subject` by `observer`.
 *
 * Returns a Q value:
 *   q(1.0) = fully visible (within vision arc and range)
 *   q(0.4) = heard only (within hearing range but not vision)
 *   q(0)   = undetected
 *
 * Vision check: dot-product of facing direction vs observer→subject vector.
 * Hearing: omnidirectional.
 *
 * Pure function — no side effects.
 */
export function canDetect(
  observer: Entity,
  subject: Entity,
  env: SensoryEnvironment,
  /** Phase 11C: optional sensor boost from the observer's loadout. */
  sensorBoost?: { visionRangeMul: Q; hearingRangeMul: Q },
): Q {
  const perc: Perception = (observer.attributes).perception ?? DEFAULT_PERCEPTION;

  // Phase 10C: blinded observer cannot see
  const isBlind = (observer.condition).blindTicks > 0;

  const dx = subject.position_m.x - observer.position_m.x;
  const dy = subject.position_m.y - observer.position_m.y;
  const dz = subject.position_m.z - observer.position_m.z;

  // Squared distance (still in SCALE.m² fixed-point)
  const dist2 = BigInt(dx) * BigInt(dx) + BigInt(dy) * BigInt(dy) + BigInt(dz) * BigInt(dz);

  // ---- Vision ----
  // Phase 10C: blinded observer has zero effective vision range
  let effectiveVision = isBlind ? 0 : mulDiv(
    mulDiv(perc.visionRange_m, env.lightMul, SCALE.Q),
    env.smokeMul,
    SCALE.Q,
  );
  if (!isBlind && sensorBoost) effectiveVision = mulDiv(effectiveVision, sensorBoost.visionRangeMul, SCALE.Q);
  const visionR2 = BigInt(effectiveVision) * BigInt(effectiveVision);

  if (dist2 <= visionR2) {
    // Check if subject is within observer's facing arc.
    // For 360° arc (visionArcDeg >= 360) skip the arc check.
    if (perc.visionArcDeg >= 360) return q(1.0);

    // Dot product of normalized facing vs direction to subject.
    // We compare in fixed-point Q units using the pre-computed halfArcCosQ.
    const facing = observer.action.facingDirQ;
    const dotQ = dotQ3(facing, dx, dy, dz, dist2);

    if (dotQ >= perc.halfArcCosQ) return q(1.0);
  }

  // ---- Hearing ----
  // Phase 7: stealth.dispersionMul reduces subject's acoustic signature
  // (multiplied into observer's effective hearing range for this subject)
  const stealthSkill = getSkill(subject.skills, "stealth");
  let effectiveHearing = mulDiv(
    mulDiv(perc.hearingRange_m, env.noiseMul, SCALE.Q),
    stealthSkill.dispersionMul,
    SCALE.Q,
  );
  if (sensorBoost) effectiveHearing = mulDiv(effectiveHearing, sensorBoost.hearingRangeMul, SCALE.Q);
  const hearingR2 = BigInt(effectiveHearing) * BigInt(effectiveHearing);

  if (dist2 <= hearingR2) return q(0.4) as Q;

  return q(0) as Q;
}

/**
 * Dot product of a normalized facing direction (Q components) against an unnormalized
 * vector (dx, dy, dz) with squared magnitude dist2. Returns a Q value.
 *
 * facing is already in Q units (each component is Q scaled, magnitude ≈ SCALE.Q).
 * dx/dy/dz are in SCALE.m units; we normalise them into Q using dist_m.
 *
 * Result in Q: positive = same direction, negative = opposite.
 */
function dotQ3(
  facing: Vec3,
  dx: number,
  dy: number,
  dz: number,
  dist2: bigint,
): Q {
  if (dist2 === 0n) return q(0);

  // Approximate dist_m via integer sqrt of dist2
  let r = dist2;
  let r1 = (r + 1n) >> 1n;
  while (r1 < r) { r = r1; r1 = (r + dist2 / r) >> 1n; }
  const dist_m = Number(r);

  if (dist_m === 0) return q(0);

  // Normalise dx/dy/dz into Q space
  const ndx = mulDiv(dx, SCALE.Q, dist_m);
  const ndy = mulDiv(dy, SCALE.Q, dist_m);
  const ndz = mulDiv(dz, SCALE.Q, dist_m);

  // Both facing and n* are in Q units; dot product → divide by SCALE.Q
  const raw = mulDiv(facing.x, ndx, SCALE.Q)
    + mulDiv(facing.y, ndy, SCALE.Q)
    + mulDiv(facing.z, ndz, SCALE.Q);

  return Math.max(-SCALE.Q, Math.min(SCALE.Q, raw)) as Q;
}
