import type { Q, I32 } from "../units.js";
import { q, clampQ, SCALE, qMul, mulDiv } from "../units.js";
import type { Entity } from "./entity.js";
import type { SimulationTuning } from "./tuning.js";
import { TUNING } from "./tuning.js";
import type { BodySegment, BodyPlan } from "./bodyplan.js";
import type { RegionInjury, DamageType } from "./injury.js";

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

/** Average a damage field across a set of body segments. */
function avgSegDamage(
  segs: BodySegment[],
  byRegion: Record<string, RegionInjury>,
  type: DamageType,
): Q {
  if (segs.length === 0) return q(0);
  let sum = 0;
  for (const s of segs) sum += byRegion[s.id]?.[type] ?? 0;
  return Math.trunc(sum / segs.length) as Q;
}

/** Resolve damage-derived inputs using body plan segment roles (Phase 8). */
function resolveDamageSources(
  plan: BodyPlan,
  byRegion: Record<string, RegionInjury>,
  tuning: SimulationTuning,
): {
  legStr: Q; legInt: Q;
  armStr: Q; armInt: Q;
  headInt: Q; headStr: Q;
  leftArmDisabled: boolean; rightArmDisabled: boolean;
  leftLegDisabled: boolean; rightLegDisabled: boolean;
} {
  const primaryLoco  = plan.segments.filter(s => s.locomotionRole  === "primary");
  const primaryManip = plan.segments.filter(s => s.manipulationRole === "primary");
  const centralCNS   = plan.segments.filter(s => s.cnsRole === "central");

  const legStr  = avgSegDamage(primaryLoco,  byRegion, "structuralDamage");
  const legInt  = avgSegDamage(primaryLoco,  byRegion, "internalDamage");
  const armStr  = avgSegDamage(primaryManip, byRegion, "structuralDamage");
  const armInt  = avgSegDamage(primaryManip, byRegion, "internalDamage");
  const headInt = avgSegDamage(centralCNS,   byRegion, "internalDamage");
  const headStr = avgSegDamage(centralCNS,   byRegion, "structuralDamage");

  // Map first two primary manipulation segments to "left/right arm"
  // Map first two primary locomotion segments to "left/right leg"
  const leftManipSeg  = primaryManip[0];
  const rightManipSeg = primaryManip[1];
  const leftLocoSeg   = primaryLoco[0];
  const rightLocoSeg  = primaryLoco[1];

  const leftArmDisabled  = leftManipSeg  ? (byRegion[leftManipSeg.id]?.structuralDamage  ?? q(0)) >= tuning.armDisableThreshold : false;
  const rightArmDisabled = rightManipSeg ? (byRegion[rightManipSeg.id]?.structuralDamage ?? q(0)) >= tuning.armDisableThreshold : false;
  const leftLegDisabled  = leftLocoSeg   ? (byRegion[leftLocoSeg.id]?.structuralDamage   ?? q(0)) >= tuning.legDisableThreshold : false;
  const rightLegDisabled = rightLocoSeg  ? (byRegion[rightLocoSeg.id]?.structuralDamage  ?? q(0)) >= tuning.legDisableThreshold : false;

  return { legStr, legInt, armStr, armInt, headInt, headStr, leftArmDisabled, rightArmDisabled, leftLegDisabled, rightLegDisabled };
}

export function deriveFunctionalState(e: Entity, tuning: SimulationTuning = TUNING.tactical): FunctionalState {
  const inj = e.injury;

  let legStr: Q, legInt: Q, armStr: Q, armInt: Q, headInt: Q, headStr: Q;
  let leftArmDisabled: boolean, rightArmDisabled: boolean, leftLegDisabled: boolean, rightLegDisabled: boolean;

  if (e.bodyPlan) {
    // Phase 8: data-driven path via body plan segment roles
    const d = resolveDamageSources(e.bodyPlan, inj.byRegion, tuning);
    legStr = d.legStr; legInt = d.legInt;
    armStr = d.armStr; armInt = d.armInt;
    headInt = d.headInt; headStr = d.headStr;
    leftArmDisabled  = d.leftArmDisabled;  rightArmDisabled = d.rightArmDisabled;
    leftLegDisabled  = d.leftLegDisabled;  rightLegDisabled = d.rightLegDisabled;
  } else {
    // Backward compat: humanoid hardcoded regions
    const leftArmStr  = inj.byRegion.leftArm?.structuralDamage  ?? q(0);
    const rightArmStr = inj.byRegion.rightArm?.structuralDamage ?? q(0);
    const leftLegStr  = inj.byRegion.leftLeg?.structuralDamage  ?? q(0);
    const rightLegStr = inj.byRegion.rightLeg?.structuralDamage ?? q(0);

    const leftLegInt  = inj.byRegion.leftLeg?.internalDamage  ?? q(0);
    const rightLegInt = inj.byRegion.rightLeg?.internalDamage ?? q(0);
    const leftArmInt  = inj.byRegion.leftArm?.internalDamage  ?? q(0);
    const rightArmInt = inj.byRegion.rightArm?.internalDamage ?? q(0);

    legStr = mean2(leftLegStr, rightLegStr);
    legInt = mean2(leftLegInt, rightLegInt);
    armStr = mean2(leftArmStr, rightArmStr);
    armInt = mean2(leftArmInt, rightArmInt);
    headInt = inj.byRegion.head?.internalDamage  ?? q(0);
    headStr = inj.byRegion.head?.structuralDamage ?? q(0);

    leftArmDisabled  = leftArmStr  >= tuning.armDisableThreshold;
    rightArmDisabled = rightArmStr >= tuning.armDisableThreshold;
    leftLegDisabled  = leftLegStr  >= tuning.legDisableThreshold;
    rightLegDisabled = rightLegStr >= tuning.legDisableThreshold;
  }

  const shock = inj.shock;
  const fatigue = e.energy.fatigue;
  const stun = e.condition.stunned;
  const concLoss = (SCALE.Q - inj.consciousness);
  const fluidLoss = inj.fluidLoss;

  // Phase 2A: grapple state penalties
  const pinnedQ: Q = (e.condition?.pinned ?? false) ? SCALE.Q : 0;
  const heldQ:   Q = (e.grapple?.heldByIds?.length ?? 0) > 0 ? SCALE.Q : 0;

  // Phase 3: suppression from near-miss ranged fire
  const suppressedQ: Q = ((e.condition as any).suppressedTicks ?? 0) > 0 ? SCALE.Q : 0;

  // Phase 5: fear impairs coordination and fine control
  // At routing threshold (~q(0.65) for average human) → ~10% penalty on each multiplier.
  const fearQ: Q = (e.condition as any).fearQ ?? q(0);

  // Phase 2B: exhaustion signal — penalty ramps in below 15 % of baseline reserve.
  // exhaustionQ = 0 when reserve ≥ 15 %, up to 1 when reserve = 0.
  const EXHAUSTION_THRESHOLD: I32 = q(0.15); // 15 % of baseline (2 000 fixed-point = q(0.20) would be 4000/20000)
  const baselineReserve: I32 = Math.max(1, e.attributes.performance.reserveEnergy_J);
  const currentReserve:  I32 = Math.max(0, e.energy.reserveEnergy_J);
  const reserveRatioQ: Q = clampQ(
    mulDiv(currentReserve, SCALE.Q, baselineReserve) as Q,
    q(0), q(1.0)
  );
  const exhaustionQ: Q = reserveRatioQ >= EXHAUSTION_THRESHOLD
    ? q(0) as Q
    : clampQ(
        mulDiv((EXHAUSTION_THRESHOLD - reserveRatioQ) as I32, SCALE.Q, EXHAUSTION_THRESHOLD) as Q,
        q(0), q(1.0)
      );

  const mobilityMul = applyImpairmentsClamped(
    q(1.0), q(0.05), q(1.0),
    [legStr, q(0.60)],
    [legInt, q(0.25)],
    [shock,  q(0.15)],
    [fatigue, q(0.25)],
    [stun, q(0.35)],
    [concLoss, q(0.10)],
    [pinnedQ, q(0.80)],      // pinned: severely restricted movement
    [heldQ,   q(0.30)],      // held:   moderate restriction
    [exhaustionQ, q(0.30)],  // exhaustion: up to -30 % at full depletion
  );

  const manipulationMul = applyImpairmentsClamped(
    q(1.0), q(0.05), q(1.0),
    [armStr, q(0.55)],
    [armInt, q(0.20)],
    [shock,  q(0.10)],
    [fatigue, q(0.20)],
    [stun, q(0.25)],
    [concLoss, q(0.20)],
    [pinnedQ, q(0.60)],      // pinned: severely restricted manipulation
    [heldQ,   q(0.20)],      // held:   moderate restriction
    [exhaustionQ, q(0.25)],  // exhaustion: up to -25 % at full depletion
    [fearQ,   q(0.15)],      // Phase 5: fear tremors: up to -15 % at max fear
  );

  const coordinationMul = applyImpairmentsClamped(
    q(1.0), q(0.05), q(1.0),
    [headInt, q(0.45)],
    [headStr, q(0.15)],
    [shock,   q(0.20)],
    [fatigue, q(0.20)],
    [stun, q(0.40)],
    [concLoss, q(0.35)],
    [exhaustionQ, q(0.20)],  // exhaustion: up to -20 % at full depletion
    [suppressedQ, q(0.10)],  // Phase 3: suppression: -10 % while suppressed
    [fearQ,       q(0.15)],  // Phase 5: fear: up to -15 % at max fear
  );

  const staminaMul = applyImpairmentsClamped(
    q(1.0), q(0.00), q(1.0),
    [fatigue, q(0.65)],
    [shock,    q(0.15)],
    [fluidLoss, q(0.35)],
    [exhaustionQ, q(0.50)],  // exhaustion: up to -50 % (primary fatigue signal)
  );

  const canAct = inj.consciousness >= tuning.unconsciousThreshold && !inj.dead;

  // "cannot stand" if mobility is very low or all primary locomotion segments are disabled
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
