import { SCALE, q, qMul, clampQ, mulDiv, type Q } from "../units";
import { makeRng } from "../rng";
import type { Vec3 } from "./vec3";

import type { Entity } from "./entity";
import { Weapon } from "../equipment";

import { eventSeed } from "./seeds";

export type HitArea = "head" | "torso" | "arm" | "leg";

export interface HitResolution {
  hit: boolean;
  area: HitArea;
  hitQuality: Q; // 0..1
  blocked: boolean;
  parried: boolean;
}

function weaponMomentArm_m(wpn: Weapon, attacker: Entity): number {
  const reach = wpn.reach_m ?? Math.trunc(attacker.attributes.morphology.stature_m * 0.45);
  return wpn.momentArm_m ?? Math.trunc(reach * 0.55);
}

export function parryLeverageQ(wpn: Weapon, attacker: Entity): Q {
  const arm = weaponMomentArm_m(wpn, attacker);

  // reference ~0.6m human sword lever
  const ref = Math.trunc(0.6 * SCALE.m);

  const ratio = clampQ(
    mulDiv(arm * SCALE.Q, 1, ref) as any,
    q(0.5),
    q(1.8)
  );

  // compress into sane band
  return clampQ(
    q(0.70) + qMul(ratio, q(0.30)),
    q(0.80),
    q(1.20)
  );
}

export function chooseArea(r01: Q): HitArea {
  if (r01 < q(0.12)) return "head";
  if (r01 < q(0.62)) return "torso";
  if (r01 < q(0.82)) return "arm";
  return "leg";
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

  const geom = clampQ(q(1.05) - mulDiv(geometryDotQ, q(0.10), SCALE.Q) as any, q(0.85), q(1.20));
  const atk = qMul(attackSkill, geom);

  const diff = (atk - defenceSkill) as Q;
  const p = clampQ(q(0.55) + mulDiv(diff, q(0.35), SCALE.Q) as any, q(0.10), q(0.95));

  const roll = rng.q01();
  const hit = roll < p;

  const area = chooseArea(rng.q01());

  const quality = clampQ(qMul(atk, q(0.60) + mulDiv((p - roll), q(0.40), SCALE.Q) as any), q(0.05), q(0.99));

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

