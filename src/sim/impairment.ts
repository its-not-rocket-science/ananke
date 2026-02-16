import type { Q } from "../units";
import { q, clampQ, SCALE, qMul } from "../units";
import type { Entity } from "./entity";
import type { SimulationTuning } from "./tuning";
import { TUNING } from "./tuning";

export interface FunctionalState {
  mobilityMul: Q;
  manipulationMul: Q;
  coordinationMul: Q;
  staminaMul: Q;

  // Capability flags
  leftArmDisabled: boolean;
  rightArmDisabled: boolean;
  leftLegDisabled: boolean;
  rightLegDisabled: boolean;

  canStand: boolean;
  canAct: boolean;
}

const mean2 = (a: Q, b: Q): Q => (Math.trunc((a + b) / 2) as Q);

function applyImpairmentsClamped(
  base: Q,
  minOut: Q,
  maxOut: Q,
  ...terms: readonly [Q, Q][]
): Q {
  let out = base;
  for (const [value, weight] of terms) out = (out - qMul(value, weight)) as Q;
  return clampQ(out, minOut, maxOut);
}

export function deriveFunctionalState(e: Entity, tuning: SimulationTuning = TUNING.tactical): FunctionalState {
  const inj = e.injury;

  const leftArmStr = inj.byRegion.leftArm.structuralDamage;
  const rightArmStr = inj.byRegion.rightArm.structuralDamage;
  const leftLegStr = inj.byRegion.leftLeg.structuralDamage;
  const rightLegStr = inj.byRegion.rightLeg.structuralDamage;

  const leftLegInt = inj.byRegion.leftLeg.internalDamage;
  const rightLegInt = inj.byRegion.rightLeg.internalDamage;

  const leftArmInt = inj.byRegion.leftArm.internalDamage;
  const rightArmInt = inj.byRegion.rightArm.internalDamage;

  const legStr = mean2(leftLegStr, rightLegStr);
  const legInt = mean2(leftLegInt, rightLegInt);

  const armStr = mean2(leftArmStr, rightArmStr);
  const armInt = mean2(leftArmInt, rightArmInt);
  
  const headInt = inj.byRegion.head.internalDamage;
  const headStr = inj.byRegion.head.structuralDamage;

  const shock = inj.shock;
  const fatigue = e.energy.fatigue;
  const stun = e.condition.stunned;
  const concLoss = (SCALE.Q - inj.consciousness);
  const fluidLoss = inj.fluidLoss;

  const mobilityMul = applyImpairmentsClamped(
    q(1.0), q(0.05), q(1.0),
    [legStr, q(0.60)],
    [legInt, q(0.25)],
    [shock,  q(0.15)],
    [fatigue, q(0.25)],
    [stun, q(0.35)],
    [concLoss, q(0.10)],
  );

  const manipulationMul = applyImpairmentsClamped(
    q(1.0), q(0.05), q(1.0),
    [armStr, q(0.55)],
    [armInt, q(0.20)],
    [shock,  q(0.10)],
    [fatigue, q(0.20)],
    [stun, q(0.25)],
    [concLoss, q(0.20)],
  );

  const coordinationMul = applyImpairmentsClamped(
    q(1.0), q(0.05), q(1.0),
    [headInt, q(0.45)],
    [headStr, q(0.15)],
    [shock,   q(0.20)],
    [fatigue, q(0.20)],
    [stun, q(0.40)],
    [concLoss, q(0.35)],
  );

  const staminaMul = applyImpairmentsClamped(
    q(1.0), q(0.00), q(1.0),
    [fatigue, q(0.65)],
    [shock,    q(0.15)],
    [fluidLoss, q(0.35)],
  );

  const leftArmDisabled = leftArmStr >= tuning.armDisableThreshold;
  const rightArmDisabled = rightArmStr >= tuning.armDisableThreshold;
  const leftLegDisabled = leftLegStr >= tuning.legDisableThreshold;
  const rightLegDisabled = rightLegStr >= tuning.legDisableThreshold;

  const canAct = inj.consciousness >= tuning.unconsciousThreshold && !inj.dead;

  // "cannot stand" if mobility is very low or both legs are functionally disabled
  const legsOut = leftLegDisabled && rightLegDisabled;
  const canStand = canAct && !legsOut && mobilityMul >= tuning.standFailThreshold;

  return {
    mobilityMul,
    manipulationMul,
    coordinationMul,
    staminaMul,

    leftArmDisabled,
    rightArmDisabled,
    leftLegDisabled,
    rightLegDisabled,

    canStand,
    canAct,
  };
}
