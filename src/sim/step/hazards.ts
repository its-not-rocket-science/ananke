import type { Entity } from "../entity.js";
import type { HazardCell } from "../terrain.js";

import { SCALE, q, clampQ, qMul } from "../../units.js";

/** Apply a single hazard cell's per-tick effect to an entity. */
export function applyHazardDamage(e: Entity, hazard: HazardCell): void {
  const torso = e.injury.byRegion["torso"];
  if (!torso) return;
  const intensity = hazard.intensity;
  if (hazard.type === "fire") {
    torso.surfaceDamage = clampQ(torso.surfaceDamage + qMul(intensity, q(0.003)), 0, SCALE.Q);
    e.injury.shock = clampQ(e.injury.shock + qMul(intensity, q(0.005)), 0, SCALE.Q);
  } else if (hazard.type === "radiation") {
    torso.internalDamage = clampQ(torso.internalDamage + qMul(intensity, q(0.004)), 0, SCALE.Q);
  } else if (hazard.type === "poison_gas") {
    torso.internalDamage = clampQ(torso.internalDamage + qMul(intensity, q(0.002)), 0, SCALE.Q);
    e.injury.consciousness = clampQ(e.injury.consciousness - qMul(intensity, q(0.003)), 0, SCALE.Q);
  }
}