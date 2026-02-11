import { SCALE, type I32 } from "../units";

export interface Vec3 {
  x: I32; // fixed metres (SCALE.m)
  y: I32;
  z: I32;
}

export const v3 = (x: I32 = 0, y: I32 = 0, z: I32 = 0): Vec3 => ({ x, y, z });

export const vAdd = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const vSub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const vScaleQ = (a: Vec3, q: number): Vec3 => ({
  x: Math.trunc((a.x * q) / SCALE.Q),
  y: Math.trunc((a.y * q) / SCALE.Q),
  z: Math.trunc((a.z * q) / SCALE.Q),
});

// velocity is fixed m/s (SCALE.mps), dt is fixed seconds (SCALE.s)
export const integratePos = (pos: Vec3, vel_mps: Vec3, dt_s: I32): Vec3 => ({
  x: pos.x + Math.trunc((vel_mps.x * dt_s) / SCALE.s),
  y: pos.y + Math.trunc((vel_mps.y * dt_s) / SCALE.s),
  z: pos.z + Math.trunc((vel_mps.z * dt_s) / SCALE.s),
});