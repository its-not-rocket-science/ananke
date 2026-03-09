import type { Q, I32 } from "../units.js";
import { q, clampQ, SCALE, qMul, mulDiv } from "../units.js";
import { ensureAnatomyRuntime, type Entity } from "./entity.js";
import type { SimulationTuning } from "./tuning.js";
import { TUNING } from "./tuning.js";

export interface FunctionalState {
  mobilityMul: Q;
  manipulationMul: Q;
  coordinationMul: Q;
  staminaMul: Q;

  leftArmDisabled: boolean;
  rightArmDisabled: boolean;
  leftLegDisabled: boolean;
  rightLegDisabled: boolean;

  canStand: boolean;
  canAct: boolean;

  disabledFunctions: ReadonlySet<string>;
}

const mean2 = (a: Q, b: Q): Q => Math.trunc((a + b) / 2) as Q;

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

export function deriveFunctionalState(
  e: Entity,
  tuning: SimulationTuning = TUNING.tactical,
): FunctionalState {
  const inj = e.injury;
  const disabledFunctions = computeDisabledFunctions(e, tuning);

  // Derive legacy booleans from the single source of truth.
  const leftArmDisabled  = disabledFunctions.has("leftManipulation");
  const rightArmDisabled = disabledFunctions.has("rightManipulation");
  const leftLegDisabled  = disabledFunctions.has("leftLocomotion");
  const rightLegDisabled = disabledFunctions.has("rightLocomotion");

  let legStr: Q;
  let legInt: Q;
  let armStr: Q;
  let armInt: Q;
  let headInt: Q;
  let headStr: Q;
  let fractureLegQ: Q = q(0);
  let fractureArmQ: Q = q(0);

  const { helpers } = ensureAnatomyRuntime(e);

  if (helpers?.functionalDamage) {
    const summary = helpers.functionalDamage.summarize(inj);
    legStr = summary.mobility.structural;
    legInt = summary.mobility.internal;
    armStr = summary.manipulation.structural;
    armInt = summary.manipulation.internal;
    headInt = summary.coordination.internal;
    headStr = summary.coordination.structural;
    fractureLegQ = summary.mobility.fracture;
    fractureArmQ = summary.manipulation.fracture;
  } else {
    // Backward compat: humanoid hardcoded regions
    const leftArmStr = inj.byRegion.leftArm?.structuralDamage ?? q(0);
    const rightArmStr = inj.byRegion.rightArm?.structuralDamage ?? q(0);
    const leftLegStr = inj.byRegion.leftLeg?.structuralDamage ?? q(0);
    const rightLegStr = inj.byRegion.rightLeg?.structuralDamage ?? q(0);

    const leftLegIntVal = inj.byRegion.leftLeg?.internalDamage ?? q(0);
    const rightLegIntVal = inj.byRegion.rightLeg?.internalDamage ?? q(0);
    const leftArmIntVal = inj.byRegion.leftArm?.internalDamage ?? q(0);
    const rightArmIntVal = inj.byRegion.rightArm?.internalDamage ?? q(0);

    legStr = mean2(leftLegStr, rightLegStr);
    legInt = mean2(leftLegIntVal, rightLegIntVal);
    armStr = mean2(leftArmStr, rightArmStr);
    armInt = mean2(leftArmIntVal, rightArmIntVal);
    headInt = inj.byRegion.head?.internalDamage ?? q(0);
    headStr = inj.byRegion.head?.structuralDamage ?? q(0);

    const leftLegFrac = inj.byRegion.leftLeg?.fractured ?? false;
    const rightLegFrac = inj.byRegion.rightLeg?.fractured ?? false;
    const leftArmFrac = inj.byRegion.leftArm?.fractured ?? false;
    const rightArmFrac = inj.byRegion.rightArm?.fractured ?? false;

    fractureLegQ = Math.trunc(
      ((leftLegFrac ? 1 : 0) + (rightLegFrac ? 1 : 0)) * SCALE.Q / 2,
    ) as Q;

    fractureArmQ = Math.trunc(
      ((leftArmFrac ? 1 : 0) + (rightArmFrac ? 1 : 0)) * SCALE.Q / 2,
    ) as Q;
  }

  const shock = inj.shock;
  const fatigue = e.energy.fatigue;
  const stun = e.condition.stunned;
  const concLoss = (SCALE.Q - inj.consciousness) as Q;
  const fluidLoss = inj.fluidLoss;

  const pinnedQ: Q = (e.condition?.pinned ?? false) ? SCALE.Q : 0;
  const heldQ: Q = (e.grapple?.heldByIds?.length ?? 0) > 0 ? SCALE.Q : 0;
  const suppressedQ: Q = (e.condition.suppressedTicks ?? 0) > 0 ? SCALE.Q : 0;
  const fearQ: Q = e.condition.fearQ ?? q(0);

  const EXHAUSTION_THRESHOLD: I32 = q(0.15);
  const baselineReserve: I32 = Math.max(1, e.attributes.performance.reserveEnergy_J);
  const currentReserve: I32 = Math.max(0, e.energy.reserveEnergy_J);

  const reserveRatioQ: Q = clampQ(
    mulDiv(currentReserve, SCALE.Q, baselineReserve) as Q,
    q(0),
    q(1.0),
  );

  const exhaustionQ: Q =
    reserveRatioQ >= EXHAUSTION_THRESHOLD
      ? q(0)
      : clampQ(
        mulDiv(
          (EXHAUSTION_THRESHOLD - reserveRatioQ) as I32,
          SCALE.Q,
          EXHAUSTION_THRESHOLD,
        ) as Q,
        q(0),
        q(1.0),
      );

  const mobilityMul = applyImpairmentsClamped(
    q(1.0), q(0.05), q(1.0),
    [legStr, q(0.60)],
    [legInt, q(0.25)],
    [shock, q(0.15)],
    [fatigue, q(0.25)],
    [stun, q(0.35)],
    [concLoss, q(0.10)],
    [pinnedQ, q(0.80)],
    [heldQ, q(0.30)],
    [exhaustionQ, q(0.30)],
    [fractureLegQ, q(0.30)],
  );

  const manipulationMul = applyImpairmentsClamped(
    q(1.0), q(0.05), q(1.0),
    [armStr, q(0.55)],
    [armInt, q(0.20)],
    [shock, q(0.10)],
    [fatigue, q(0.20)],
    [stun, q(0.25)],
    [concLoss, q(0.20)],
    [pinnedQ, q(0.60)],
    [heldQ, q(0.20)],
    [exhaustionQ, q(0.25)],
    [fearQ, q(0.15)],
    [fractureArmQ, q(0.25)],
  );

  const coordinationMul = applyImpairmentsClamped(
    q(1.0), q(0.05), q(1.0),
    [headInt, q(0.45)],
    [headStr, q(0.15)],
    [shock, q(0.20)],
    [fatigue, q(0.20)],
    [stun, q(0.40)],
    [concLoss, q(0.35)],
    [exhaustionQ, q(0.20)],
    [suppressedQ, q(0.10)],
    [fearQ, q(0.15)],
  );

  const staminaMul = applyImpairmentsClamped(
    q(1.0), q(0.00), q(1.0),
    [fatigue, q(0.65)],
    [shock, q(0.15)],
    [fluidLoss, q(0.35)],
    [exhaustionQ, q(0.50)],
  );

  const canAct = inj.consciousness >= tuning.unconsciousThreshold && !inj.dead;
  const legsOut = disabledFunctions.has("leftLocomotion") && disabledFunctions.has("rightLocomotion");

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
    disabledFunctions,
  }
}
export function hasDisabledFunction(
  func: FunctionalState,
  functionId: string,
): boolean {
  return func.disabledFunctions.has(functionId);
}

export function hasAllDisabledFunctions(
  func: FunctionalState,
  ...functionIds: readonly string[]
): boolean {
  return functionIds.every((id) => func.disabledFunctions.has(id));
}

export function hasAnyDisabledFunction(
  func: FunctionalState,
  ...functionIds: readonly string[]
): boolean {
  return functionIds.some((id) => func.disabledFunctions.has(id));
}

function computeDisabledFunctions(
  e: Entity,
  tuning: SimulationTuning,
): Set<string> {
  const out = new Set<string>();
  const { helpers } = ensureAnatomyRuntime(e);

  if (helpers?.functionalDamage) {
    // General aggregate functions from anatomy model (no positional IDs here)
    const fd = helpers.functionalDamage;
    const candidates = [
      "mobility", "locomotion", "manipulation", "coordination", "cognition",
      "cns", "respiration", "circulation", "sensor", "vision", "balance",
      "stancePosture",
    ];
    for (const id of candidates) {
      if (fd.isFunctionDisabled(e.injury, id)) out.add(id);
    }
  }

  // Positional left/right flags: always derived from body plan structure or hardcoded
  // humanoid region names.  These are not indexed as anatomy-model function IDs.
  addPositionalFlags(out, e, tuning);
  return out;
}

/**
 * Populates "leftManipulation", "rightManipulation", "leftLocomotion", "rightLocomotion"
 * in `out` by inspecting injury thresholds on the primary body-plan segments.
 *
 * When a body plan is present the primary segment ordering is used ([0] = left, [1] = right).
 * When absent the legacy humanoid region names ("leftArm", "rightArm", …) are used.
 */
function addPositionalFlags(
  out: Set<string>,
  e: Entity,
  tuning: SimulationTuning,
): void {
  const byRegion = e.injury.byRegion;
  const plan = e.bodyPlan;

  if (plan) {
    const primaryManip = plan.segments.filter(s => s.manipulationRole === "primary");
    const primaryLoco  = plan.segments.filter(s => s.locomotionRole  === "primary");
    if ((byRegion[primaryManip[0]?.id ?? ""]?.structuralDamage ?? q(0)) >= tuning.armDisableThreshold) out.add("leftManipulation");
    if ((byRegion[primaryManip[1]?.id ?? ""]?.structuralDamage ?? q(0)) >= tuning.armDisableThreshold) out.add("rightManipulation");
    if ((byRegion[primaryLoco[0]?.id  ?? ""]?.structuralDamage ?? q(0)) >= tuning.legDisableThreshold) out.add("leftLocomotion");
    if ((byRegion[primaryLoco[1]?.id  ?? ""]?.structuralDamage ?? q(0)) >= tuning.legDisableThreshold) out.add("rightLocomotion");
  } else {
    // Humanoid fallback
    if ((byRegion.leftArm?.structuralDamage  ?? q(0)) >= tuning.armDisableThreshold) out.add("leftManipulation");
    if ((byRegion.rightArm?.structuralDamage ?? q(0)) >= tuning.armDisableThreshold) out.add("rightManipulation");
    if ((byRegion.leftLeg?.structuralDamage  ?? q(0)) >= tuning.legDisableThreshold) out.add("leftLocomotion");
    if ((byRegion.rightLeg?.structuralDamage ?? q(0)) >= tuning.legDisableThreshold) out.add("rightLocomotion");
  }
}