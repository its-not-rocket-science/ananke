// src/bridge/interpolation.ts — Deterministic fixed‑point interpolation utilities

import type { Q, I32 } from "../units.js";
import type { Vec3 } from "../sim/vec3.js";
import type { PoseModifier } from "../model3d.js";
import { SCALE, mulDiv, clampQ } from "../units.js";
import { vAdd, vSub, vScaleQ } from "../sim/vec3.js";
import { normaliseDirCheapQ } from "../sim/vec3.js";

// ─── Scalar interpolation ──────────────────────────────────────────────────────

/**
 * Linear interpolation between two fixed‑point scalars.
 * @param prev Value at t = 0
 * @param curr Value at t = SCALE.Q
 * @param t Interpolation factor Q ∈ [0, SCALE.Q]
 * @returns Interpolated value (deterministic, using mulDiv)
 */
export function lerpQ(prev: Q, curr: Q, t: Q): Q {
  // t ∈ [0, SCALE.Q]; compute (prev * (SCALE.Q - t) + curr * t) / SCALE.Q
  const tInv = SCALE.Q - t;
  const a = mulDiv(prev, tInv, SCALE.Q);
  const b = mulDiv(curr, t, SCALE.Q);
  return a + b;
}

/**
 * Clamped linear interpolation; result stays within [prev, curr] (or [curr, prev]).
 */
export function lerpQClamped(prev: Q, curr: Q, t: Q): Q {
  const r = lerpQ(prev, curr, t);
  return prev <= curr
    ? clampQ(r, prev, curr)
    : clampQ(r, curr, prev);
}

// ─── Vector interpolation ──────────────────────────────────────────────────────

/**
 * Linear interpolation between two fixed‑point vectors.
 * @param prev Vec3 at t = 0
 * @param curr Vec3 at t = SCALE.Q
 * @param t Interpolation factor Q ∈ [0, SCALE.Q]
 * @returns Interpolated Vec3 (component‑wise lerp)
 */
export function lerpVec3(prev: Vec3, curr: Vec3, t: Q): Vec3 {
  const dx = curr.x - prev.x;
  const dy = curr.y - prev.y;
  const dz = curr.z - prev.z;
  return {
    x: prev.x + mulDiv(dx, t, SCALE.Q),
    y: prev.y + mulDiv(dy, t, SCALE.Q),
    z: prev.z + mulDiv(dz, t, SCALE.Q),
  };
}

/**
 * Cheap spherical interpolation for facing directions (unit vectors in Q‑space).
 * Uses normaliseDirCheapQ on the linearly interpolated vector.
 * Not truly slerp but good enough for facing interpolation over small angles.
 */
export function slerpFacing(prev: Vec3, curr: Vec3, t: Q): Vec3 {
  const interp = lerpVec3(prev, curr, t);
  return normaliseDirCheapQ(interp);
}

// ─── Pose modifier interpolation ───────────────────────────────────────────────

/**
 * Interpolates two pose modifier arrays by matching segmentId.
 * If a segment appears only in one snapshot, its weights are held constant
 * (no cross‑fade). Returns a new array with all segmentIds from both inputs.
 */
export function interpolatePoseModifiers(
  prev: PoseModifier[],
  curr: PoseModifier[],
  t: Q,
): PoseModifier[] {
  const prevMap = new Map<string, PoseModifier>();
  const currMap = new Map<string, PoseModifier>();
  for (const p of prev) prevMap.set(p.segmentId, p);
  for (const c of curr) currMap.set(c.segmentId, c);

  const result: PoseModifier[] = [];
  const allIds = new Set([...prevMap.keys(), ...currMap.keys()]);

  for (const id of allIds) {
    const p = prevMap.get(id);
    const c = currMap.get(id);
    if (p && c) {
      // Both present: interpolate each component
      result.push({
        segmentId: id,
        structuralQ: lerpQ(p.structuralQ, c.structuralQ, t),
        surfaceQ:    lerpQ(p.surfaceQ,    c.surfaceQ,    t),
        impairmentQ: lerpQ(p.impairmentQ, c.impairmentQ, t),
      });
    } else if (p) {
      // Only in previous snapshot: hold constant
      result.push(p);
    } else {
      // Only in current snapshot: hold constant (should not happen if t ∈ [0, SCALE.Q])
      result.push(c!);
    }
  }

  return result;
}

// ─── Animation hints interpolation ─────────────────────────────────────────────

/**
 * Interpolates between two AnimationHints.
 * Boolean flags (prone, unconscious, dead) snap at t >= SCALE.Q/2.
 * Scalar weights are lerpQ.
 */
export function interpolateAnimationHints(
  prev: import("../model3d.js").AnimationHints,
  curr: import("../model3d.js").AnimationHints,
  t: Q,
): import("../model3d.js").AnimationHints {
  const tMid = SCALE.Q / 2;
  return {
    idle:   lerpQ(prev.idle,   curr.idle,   t),
    walk:   lerpQ(prev.walk,   curr.walk,   t),
    run:    lerpQ(prev.run,    curr.run,    t),
    sprint: lerpQ(prev.sprint, curr.sprint, t),
    crawl:  lerpQ(prev.crawl,  curr.crawl,  t),
    guardingQ:  lerpQ(prev.guardingQ,  curr.guardingQ,  t),
    attackingQ: lerpQ(prev.attackingQ, curr.attackingQ, t),
    shockQ: lerpQ(prev.shockQ, curr.shockQ, t),
    fearQ:  lerpQ(prev.fearQ,  curr.fearQ,  t),
    prone:        t < tMid ? prev.prone        : curr.prone,
    unconscious:  t < tMid ? prev.unconscious  : curr.unconscious,
    dead:         t < tMid ? prev.dead         : curr.dead,
  };
}

// ─── Condition interpolation ───────────────────────────────────────────────────

/**
 * Interpolates condition fields (shock, fear, consciousness, fluidLoss).
 * Dead flag snaps at t >= SCALE.Q/2.
 */
export function interpolateCondition(
  prev: { shockQ: Q; fearQ: Q; consciousness: Q; fluidLoss: Q; dead: boolean },
  curr: { shockQ: Q; fearQ: Q; consciousness: Q; fluidLoss: Q; dead: boolean },
  t: Q,
) {
  const tMid = SCALE.Q / 2;
  return {
    shockQ:        lerpQ(prev.shockQ,        curr.shockQ,        t),
    fearQ:         lerpQ(prev.fearQ,         curr.fearQ,         t),
    consciousness: lerpQ(prev.consciousness, curr.consciousness, t),
    fluidLoss:     lerpQ(prev.fluidLoss,     curr.fluidLoss,     t),
    dead:          t < tMid ? prev.dead : curr.dead,
  };
}