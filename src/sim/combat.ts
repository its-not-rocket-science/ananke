import { SCALE, q, qMul, clampQ, mulDiv, type Q } from "../units";
import { makeRng } from "../rng";
import type { Vec3 } from "./vec3";

export type HitArea = "head" | "torso" | "arm" | "leg";

export interface HitResolution {
  hit: boolean;
  area: HitArea;
  hitQuality: Q; // 0..1
  blocked: boolean;
  parried: boolean;
}

export function eventSeed(worldSeed: number, tick: number, aId: number, bId: number, salt: number): number {
  let x = (worldSeed ^ (tick * 0x9E3779B1) ^ (aId * 0x85EBCA77) ^ (bId * 0xC2B2AE3D) ^ salt) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7FEB352D) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x846CA68B) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

export function chooseArea(r01: Q): HitArea {
  if (r01 < q(0.12)) return "head";
  if (r01 < q(0.62)) return "torso";
  if (r01 < q(0.82)) return "arm";
  return "leg";
}

export function normaliseDirCheapQ(d: Vec3): Vec3 {
  const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
  const m = Math.max(1, ax, ay, az);
  return { x: mulDiv(d.x, SCALE.Q, m), y: mulDiv(d.y, SCALE.Q, m), z: mulDiv(d.z, SCALE.Q, m) };
}

export function dotDirQ(a: Vec3, b: Vec3): Q {
  const d = mulDiv(a.x, b.x, SCALE.Q) + mulDiv(a.y, b.y, SCALE.Q) + mulDiv(a.z, b.z, SCALE.Q);
  return Math.max(-SCALE.Q, Math.min(SCALE.Q, d)) as Q;
}

export function resolveHit(
  seedU32: number,
  attackSkill: Q,
  defenceSkill: Q,
  geometryDotQ: Q,
  defenceMode: "none" | "block" | "parry" | "dodge",
  defenceIntensity: Q
): HitResolution {
  const rng = makeRng(seedU32, SCALE.Q);

  const geom = clampQ(q(1.05) - mulDiv(geometryDotQ as number, q(0.10) as number, SCALE.Q) as any, q(0.85), q(1.20));
  const atk = qMul(attackSkill, geom);

  const diff = (atk - defenceSkill) as Q;
  const p = clampQ(q(0.55) + mulDiv(diff as number, q(0.35) as number, SCALE.Q) as any, q(0.10), q(0.95));

  const roll = rng.q01();
  const hit = roll < p;

  const area = chooseArea(rng.q01());

  const quality = clampQ(qMul(atk, q(0.60) + mulDiv((p - roll) as number, q(0.40) as number, SCALE.Q) as any), q(0.05), q(0.99));

  let blocked = false;
  let parried = false;

  if (hit && defenceMode !== "none" && defenceIntensity > 0) {
    const d = qMul(defenceIntensity, defenceSkill);

    if (defenceMode === "block") {
      const pb = clampQ(q(0.10) + qMul(d, q(0.60)), q(0.05), q(0.85));
      blocked = rng.q01() < pb;
    } else if (defenceMode === "parry") {
      const pp = clampQ(q(0.08) + qMul(d, q(0.55)), q(0.03), q(0.75));
      parried = rng.q01() < pp;
    } else if (defenceMode === "dodge") {
      const pd = clampQ(qMul(d, q(0.65)), q(0.05), q(0.80));
      if (rng.q01() < pd) return { hit: false, area, hitQuality: quality, blocked: false, parried: false };
    }
  }

  return { hit, area, hitQuality: quality, blocked, parried };
}
