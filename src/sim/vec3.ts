import { SCALE, type I32 } from "../units";
import { mulDiv } from "../units";
import type { Q } from "../units";

export interface Vec3 {
  x: I32; // fixed metres (SCALE.m)
  y: I32;
  z: I32;
}

export const v3 = (x: I32 = 0, y: I32 = 0, z: I32 = 0): Vec3 => ({ x, y, z });

export const vAdd = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const vSub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const vScaleQ = (a: Vec3, q: Q): Vec3 => ({
  x: Math.trunc((a.x * q) / SCALE.Q),
  y: Math.trunc((a.y * q) / SCALE.Q),
  z: Math.trunc((a.z * q) / SCALE.Q),
});

// Normalise direction into "Q-space": components scaled so max(|x|,|y|,|z|) becomes SCALE.Q.
// Deterministic, no sqrt. Good enough for movement intents and facing.
export function normaliseDirCheapQ(d: Vec3): Vec3 {
  const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
  const m = Math.max(1, ax, ay, az);
  return {
    x: Math.trunc((d.x * SCALE.Q) / m),
    y: Math.trunc((d.y * SCALE.Q) / m),
    z: Math.trunc((d.z * SCALE.Q) / m),
  };
}

// velocity is fixed m/s (SCALE.mps), dt is fixed seconds (SCALE.s)
export const integratePos = (pos: Vec3, vel_mps: Vec3, dt_s: I32): Vec3 => ({
  x: pos.x + Math.trunc((vel_mps.x * dt_s) / SCALE.s),
  y: pos.y + Math.trunc((vel_mps.y * dt_s) / SCALE.s),
  z: pos.z + Math.trunc((vel_mps.z * dt_s) / SCALE.s),
});

export function dotDirQ(a: Vec3, b: Vec3): Q {
  const d = mulDiv(a.x, b.x, SCALE.Q) + mulDiv(a.y, b.y, SCALE.Q) + mulDiv(a.z, b.z, SCALE.Q);
  return Math.max(-SCALE.Q, Math.min(SCALE.Q, d)) as Q;
}