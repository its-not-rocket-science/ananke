// src/sim/cone.ts — Phase 28: Cone geometry for directional AoE effects
//
// A cone is a directional AoE shape: origin, facing direction, half-angle, and range.
// Used for breath weapons, flamethrowers, sonic disorientation blasts, gas dispersal.

import type { Entity } from "./entity.js";
import { SCALE } from "../units.js";

/**
 * A directional cone defined in 2D (x-y plane).
 *
 * `dir` is a unit vector with magnitude SCALE.m (= 10000).
 *   - Facing +x at 0°: { dx: 10000, dy: 0 }
 *   - Facing +y at 90°: { dx: 0, dy: 10000 }
 *
 * `halfAngle_rad` is a config constant (outside fixed-point domain).
 * `range_m` and `origin` use SCALE.m (fixed-point metres).
 */
export interface ConeSpec {
  origin:        { x: number; y: number }; // SCALE.m
  dir:           { dx: number; dy: number }; // unit vector, |dir| = SCALE.m
  halfAngle_rad: number;                   // radians; pre-computed config constant
  range_m:       number;                   // SCALE.m; max reach of cone
}

/**
 * Returns true if the entity's centre is inside the cone.
 *
 * Geometric derivation:
 *   Let vec = entity.pos - cone.origin (SCALE.m units)
 *   dot = vec · dir  = |vec| * SCALE.m * cos(θ)
 *   Entity is in cone iff cos(θ) ≥ cos(halfAngle_rad)
 *   ↔  dot ≥ cos(halfAngle_rad) * |vec| * SCALE.m
 *
 * Integer dot product; float threshold (halfAngle is a config constant).
 */
export function entityInCone(entity: Entity, cone: ConeSpec): boolean {
  const ex = entity.position_m.x - cone.origin.x;
  const ey = entity.position_m.y - cone.origin.y;
  const distSq = ex * ex + ey * ey;
  if (distSq > cone.range_m * cone.range_m) return false;
  if (distSq === 0) return true; // at origin — inside by convention
  const dist = Math.sqrt(distSq); // SCALE.m units (float OK — used in threshold comparison)
  const dot  = ex * cone.dir.dx + ey * cone.dir.dy;
  return dot >= Math.cos(cone.halfAngle_rad) * dist * SCALE.m;
}

/**
 * Build a ConeSpec centred on actor using its current facingDirQ.
 * facingDirQ is SCALE.Q-normalised; we rescale to SCALE.m for geometry.
 */
export function buildEntityFacingCone(
  actor: Entity,
  halfAngle_rad: number,
  range_m: number,
): ConeSpec {
  const fx  = actor.action.facingDirQ.x;
  const fy  = actor.action.facingDirQ.y;
  const mag = Math.sqrt(fx * fx + fy * fy);
  const scale = mag > 0 ? SCALE.m / mag : 1;
  return {
    origin:        { x: actor.position_m.x, y: actor.position_m.y },
    dir:           { dx: Math.round(fx * scale), dy: Math.round(fy * scale) },
    halfAngle_rad,
    range_m,
  };
}
