import type { IndividualAttributes } from "./types";
import type { Archetype } from "./archetypes";
import { makeRng } from "./rng";
import { Q, SCALE, clampQ, q, qMul, mulDiv } from "./units";
import { triSym, mulFromVariation, skewUp } from "./dist";

function applyMultI32(base: number, multQ: Q): number {
  return mulDiv(base, multQ as number, SCALE.Q);
}

function clampI32(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function sqrtNear1Q(mult: Q): Q {
  return (mult + SCALE.Q) >>> 1;
}

export function generateIndividual(seedU32: number, arch: Archetype): IndividualAttributes {
  const rng = makeRng(seedU32 >>> 0, SCALE.Q);

  const statureMult = mulFromVariation(triSym(rng), arch.statureVar);
  const massMult = mulFromVariation(triSym(rng), arch.massVar);

  const reachMult = mulFromVariation(triSym(rng), arch.reachVar);

  const sizeComposite = qMul(sqrtNear1Q(statureMult), sqrtNear1Q(massMult));

  const actuatorScaleBase = mulFromVariation(triSym(rng), arch.actuatorScaleVar);
  const actuatorScale = clampQ(qMul(actuatorScaleBase, (SCALE.Q + ((sizeComposite - SCALE.Q) >>> 2)) as Q), q(0.6), q(1.8));

  const structureScaleBase = mulFromVariation(triSym(rng), arch.structureScaleVar);
  const structureScale = clampQ(qMul(structureScaleBase, (SCALE.Q + ((sizeComposite - SCALE.Q) >>> 3)) as Q), q(0.7), q(2.0));

  const stature_m = applyMultI32(arch.stature_m, statureMult);
  const mass_kg = applyMultI32(arch.mass_kg, massMult);

  const actuatorFracVar = mulFromVariation(triSym(rng), arch.actuatorMassVar);
  const actuatorFrac = clampQ(qMul(arch.actuatorMassFrac, actuatorFracVar), q(0.15), q(0.70));

  const actuatorMass_kg_raw = mulDiv(mass_kg, actuatorFrac as number, SCALE.Q);
  const actuatorMass_kg = clampI32(
    actuatorMass_kg_raw,
    mulDiv(mass_kg, q(0.15) as number, SCALE.Q),
    mulDiv(mass_kg, q(0.70) as number, SCALE.Q),
  );

  const forceRand = mulFromVariation(triSym(rng), arch.peakForceVar);
  const forceCouple = clampQ(qMul(actuatorScale, (SCALE.Q + ((actuatorFrac - arch.actuatorMassFrac) >>> 1)) as Q), q(0.6), q(2.2));
  const peakForceMult = clampQ(qMul(forceRand, forceCouple), q(0.5), q(2.5));

  const powerRand = mulFromVariation(triSym(rng), arch.peakPowerVar);
  const powerMult = clampQ(skewUp(qMul(powerRand, actuatorScale), 1), q(0.5), q(3.0));

  const contRand = mulFromVariation(triSym(rng), arch.continuousPowerVar);
  const contMult = clampQ(qMul(contRand, sqrtNear1Q(actuatorFrac)), q(0.4), q(3.0));

  const reserveRand = mulFromVariation(triSym(rng), arch.reserveEnergyVar);
  const reserveMult = clampQ(qMul(reserveRand, sqrtNear1Q(actuatorFrac)), q(0.3), q(4.0));

  const effMult = mulFromVariation(triSym(rng), arch.efficiencyVar);
  const conversionEfficiency = clampQ(qMul(arch.conversionEfficiency, effMult), q(0.45), q(0.98));

  const peakForce_N = applyMultI32(arch.peakForce_N, peakForceMult);
  const peakPower_W = applyMultI32(arch.peakPower_W, powerMult);
  const continuousPower_W = applyMultI32(arch.continuousPower_W, contMult);
  const reserveEnergy_J = applyMultI32(arch.reserveEnergy_J, reserveMult);

  const controlMult = mulFromVariation(triSym(rng), arch.controlVar);
  const controlQuality = clampQ(qMul(arch.controlQuality, controlMult), q(0.15), q(0.98));

  const reactMult = mulFromVariation(triSym(rng), arch.reactionTimeVar);
  const reactCouple = clampQ((SCALE.Q + ((SCALE.Q - controlQuality) >>> 2)) as Q, q(0.75), q(1.30));
  const reactionTime_s = applyMultI32(arch.reactionTime_s, qMul(reactMult, reactCouple));

  const stability = clampQ(qMul(arch.stability, mulFromVariation(triSym(rng), arch.stabilityVar)), q(0.05), q(0.99));
  const fineControl = clampQ(qMul(arch.fineControl, mulFromVariation(triSym(rng), arch.fineControlVar)), q(0.05), q(0.99));

  const surfaceIntegrity = clampQ(qMul(arch.surfaceIntegrity, mulFromVariation(triSym(rng), arch.surfaceVar)), q(0.4), q(3.0));
  const bulkIntegrity = clampQ(qMul(arch.bulkIntegrity, mulFromVariation(triSym(rng), arch.bulkVar)), q(0.4), q(3.0));
  const structureIntegrity = clampQ(qMul(arch.structureIntegrity, mulFromVariation(triSym(rng), arch.structVar)), q(0.4), q(3.0));

  const distressTolerance = clampQ(qMul(arch.distressTolerance, mulFromVariation(triSym(rng), arch.distressVar)), q(0.01), q(0.98));
  const shockTolerance = clampQ(qMul(arch.shockTolerance, mulFromVariation(triSym(rng), arch.shockVar)), q(0.01), q(0.98));
  const concussionTolerance = clampQ(qMul(arch.concussionTolerance, mulFromVariation(triSym(rng), arch.concVar)), q(0.01), q(0.98));

  const heatTolerance = clampQ(qMul(arch.heatTolerance, mulFromVariation(triSym(rng), arch.heatVar)), q(0.01), q(0.98));
  const coldTolerance = clampQ(qMul(arch.coldTolerance, mulFromVariation(triSym(rng), arch.coldVar)), q(0.01), q(0.98));

  const fatigueRate = clampQ(qMul(arch.fatigueRate, mulFromVariation(triSym(rng), arch.fatigueVar)), q(0.4), q(2.5));
  const recoveryRate = clampQ(qMul(arch.recoveryRate, mulFromVariation(triSym(rng), arch.recoveryVar)), q(0.4), q(2.5));

  return {
    morphology: {
      stature_m,
      mass_kg,
      actuatorMass_kg,
      actuatorScale,
      structureScale,
      reachScale: reachMult,
    },
    performance: {
      peakForce_N,
      peakPower_W,
      continuousPower_W,
      reserveEnergy_J,
      conversionEfficiency,
    },
    control: {
      controlQuality,
      reactionTime_s,
      stability,
      fineControl,
    },
    resilience: {
      surfaceIntegrity,
      bulkIntegrity,
      structureIntegrity,
      distressTolerance,
      shockTolerance,
      concussionTolerance,
      heatTolerance,
      coldTolerance,
      fatigueRate,
      recoveryRate,
    },
  };
}
