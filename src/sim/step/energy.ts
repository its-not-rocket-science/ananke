import { DT_S } from "../tick.js";
import type { KernelContext } from "../context.js";
import type { Entity } from "../entity.js";

import { q, qMul, clampQ, mulDiv, SCALE, type Q } from "../../units.js";
import { stepEnergyAndFatigue } from "../../derive.js";
import { getSkill } from "../skills.js";
import { findExoskeleton } from "../../equipment.js";

export function stepEnergy(e: Entity, ctx: KernelContext): void {
  const BASE_IDLE_W = 80;

  const speedAbs = Math.max(Math.abs(e.velocity_mps.x), Math.abs(e.velocity_mps.y), Math.abs(e.velocity_mps.z));
  const moving = speedAbs > Math.trunc(0.05 * SCALE.mps);

  // Phase 11: powered exoskeleton adds continuous power draw to metabolic demand
  const exoForEnergy = findExoskeleton(e.loadout);

  // Phase 8B: flight increases stamina demand when entity is airborne
  const flightSpecE = e.bodyPlan?.locomotion.flight;
  const isFlying = flightSpecE !== undefined && e.attributes.morphology.mass_kg <= flightSpecE.liftCapacity_kg;
  const flightDemandMul: Q = (isFlying && moving) ? flightSpecE!.flightStaminaCost : SCALE.Q as Q;

  const baseDemand = (moving ? 250 : BASE_IDLE_W) + (exoForEnergy ? exoForEnergy.powerDrain_W : 0);
  const demand = mulDiv(baseDemand, flightDemandMul, SCALE.Q);

  const fatigueBefore = e.energy.fatigue;
  stepEnergyAndFatigue(e.attributes, e.energy, e.loadout, demand, DT_S, { tractionCoeff: ctx.tractionCoeff });

  // Phase 7: athleticism.fatigueRateMul reduces fatigue accumulation each tick
  const fatigueDelta = e.energy.fatigue - fatigueBefore;
  if (fatigueDelta > 0) {
    const athSkill = getSkill(e.skills, "athleticism");
    if (athSkill.fatigueRateMul < SCALE.Q) {
      e.energy.fatigue = clampQ(
        (fatigueBefore + qMul(fatigueDelta as Q, athSkill.fatigueRateMul)) as Q,
        0, SCALE.Q,
      );
    }
  }

  if (!moving && e.injury.shock < q(0.4)) {
    e.energy.fatigue = clampQ(e.energy.fatigue - q(0.0020), 0, SCALE.Q);
  }
}
