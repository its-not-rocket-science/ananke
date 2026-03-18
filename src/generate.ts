/*
Morphology scaling philosophy:

We intentionally damp size → strength scaling.

Real biology:
- strength ∝ cross-section (~mass^(2/3))
- mass ∝ volume
- energy cost grows faster than usable force

Gameplay:
- prevents giants from dominating
- keeps small entities viable
- allows cross-species balance

Therefore:
Most morphology scaling uses PARTIAL influence
(~20–35% of raw geometric scaling)
*/

import type { IndividualAttributes } from "./types.js";
import type { Archetype } from "./archetypes.js";
import { makeRng } from "./rng.js";
import { Q, SCALE, clampQ, q, qMul, mulDiv } from "./units.js";
import { triSym, biasedTriSym, mulFromVariation, skewUp } from "./dist.js";

/**
 * Signed bias applied to a character-generation axis, range [−1, 1].
 *
 * `+1` strongly skews toward the high end of the archetype's natural spread;
 * `−1` toward the low end.  Values outside [−1, 1] are clamped internally.
 * A biased character is still drawn from the population — just from a
 * different part of the tail — so physical plausibility is preserved.
 *
 * Fields map to these generation axes:
 *   `strength`   peakForce_N, peakPower_W, continuousPower_W, actuatorScale
 *   `speed`      reactionTime_s  (positive bias → faster; i.e. lower time)
 *   `resilience` distressTolerance, shockTolerance, concussionTolerance,
 *                surface/bulk/structureIntegrity, recoveryRate
 *                (positive bias also reduces fatigueRate)
 *   `agility`    controlQuality, fineControl, stability
 *   `size`       stature_m, mass_kg  (also influences reach)
 *
 * Note: per-individual cognitive variance (`intellect` bias) is reserved for
 * a future phase once `Archetype.cognition` gains per-individual draws.
 */
export interface NarrativeBias {
  /** Biases physical force and power output. */
  strength?: number;
  /** Biases reaction speed. Positive = faster (lower reactionTime_s). */
  speed?: number;
  /** Biases damage tolerance and recovery. Positive = tougher. */
  resilience?: number;
  /** Biases motor control precision and stability. */
  agility?: number;
  /** Biases body size (stature and mass). */
  size?: number;
}

// Math.cos is allowed here: generation path, not simulation path.
function halfArcCosQ(arcDeg: number): Q {
  const halfRad = (arcDeg / 2) * (Math.PI / 180);
  return Math.round(Math.cos(halfRad) * SCALE.Q) as Q;
}

function applyMultI32(base: number, multQ: Q): number {
  return mulDiv(base, multQ, SCALE.Q);
}

function clampI32(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function sqrtNear1Q(mult: Q): Q {
  return (mult + SCALE.Q) >>> 1;
}

export function generateIndividual(
  seedU32: number,
  arch: Archetype,
  bias?: NarrativeBias,
): IndividualAttributes {
  const rng = makeRng(seedU32 >>> 0, SCALE.Q);

  // Convenience: biasedTriSym(rng, 0) === triSym(rng), so unbiased calls
  // are identical to the previous behaviour when bias is undefined.
  const sz  = bias?.size       ?? 0;
  const str = bias?.strength   ?? 0;
  const spd = bias?.speed      ?? 0;
  const res = bias?.resilience ?? 0;
  const agi = bias?.agility    ?? 0;

  const statureMult       = mulFromVariation(biasedTriSym(rng, sz),  arch.statureVar);
  const massMult          = mulFromVariation(biasedTriSym(rng, sz),  arch.massVar);

  const reachMult         = mulFromVariation(biasedTriSym(rng, sz),  arch.reachVar);

  const actuatorScaleBase = mulFromVariation(biasedTriSym(rng, str), arch.actuatorScaleVar);
  
  // Combine stature + mass into a single “size composite”.
// We use sqrt scaling to avoid extreme linear growth:
//  - doubling mass should NOT double strength directly
//  - tall + heavy should scale sub-linearly
const sizeComposite = qMul(
  sqrtNear1Q(statureMult),
  sqrtNear1Q(massMult)
);

/*
Actuator scaling rule:

We do NOT apply full sizeComposite directly to force/power.
Instead we apply only ~25% of size deviation from baseline.

Why:
- Prevent giant entities becoming absurdly strong
- Prevent small entities becoming unusably weak
- Maintain cross-species balance
- Keep simulation numerically stable

Formula:
effectiveScale = 1 + (sizeComposite - 1) * 1.34

51% geometric scaling (damped).
*/
const actuatorScale = clampQ(
  qMul(
    actuatorScaleBase,
    (SCALE.Q + mulDiv(sizeComposite - SCALE.Q, q(1.34), SCALE.Q)) as Q
  ),
  q(0.6),  // lower bound: still functional
  q(1.8)   // upper bound: avoid runaway strength
);

  const structureScaleBase = mulFromVariation(biasedTriSym(rng, res), arch.structureScaleVar);
  const structureScale = clampQ(qMul(structureScaleBase, (SCALE.Q + ((sizeComposite - SCALE.Q) >>> 3)) as Q), q(0.7), q(2.0));

  const stature_m = applyMultI32(arch.stature_m, statureMult);
  const mass_kg = applyMultI32(arch.mass_kg, massMult);

  const actuatorFracVar = mulFromVariation(biasedTriSym(rng, str), arch.actuatorMassVar);
  const actuatorFrac = clampQ(qMul(arch.actuatorMassFrac, actuatorFracVar), q(0.15), q(0.70));

  const actuatorMass_kg_raw = mulDiv(mass_kg, actuatorFrac, SCALE.Q);
  const actuatorMass_kg = clampI32(
    actuatorMass_kg_raw,
    mulDiv(mass_kg, q(0.15), SCALE.Q),
    mulDiv(mass_kg, q(0.70), SCALE.Q),
  );

  const forceRand = mulFromVariation(biasedTriSym(rng, str), arch.peakForceVar);
  const forceCouple = clampQ(qMul(actuatorScale, (SCALE.Q + ((actuatorFrac - arch.actuatorMassFrac) >> 1)) as Q), q(0.6), q(2.2));
  const peakForceMult = clampQ(qMul(forceRand, forceCouple), q(0.5), q(2.5));

  const powerRand = mulFromVariation(biasedTriSym(rng, str), arch.peakPowerVar);
  const powerMult = clampQ(skewUp(qMul(powerRand, actuatorScale), 1), q(0.5), q(3.0));

  const contRand = mulFromVariation(biasedTriSym(rng, str), arch.continuousPowerVar);
  const contMult = clampQ(qMul(contRand, sqrtNear1Q(actuatorFrac)), q(0.4), q(3.0));

  const reserveRand = mulFromVariation(biasedTriSym(rng, res), arch.reserveEnergyVar);
  const reserveMult = clampQ(qMul(reserveRand, sqrtNear1Q(actuatorFrac)), q(0.3), q(4.0));

  const effMult = mulFromVariation(biasedTriSym(rng, str), arch.efficiencyVar);
  const conversionEfficiency = clampQ(qMul(arch.conversionEfficiency, effMult), q(0.45), q(0.98));

  const peakForce_N = applyMultI32(arch.peakForce_N, peakForceMult);
  const peakPower_W = applyMultI32(arch.peakPower_W, powerMult);
  const continuousPower_W = applyMultI32(arch.continuousPower_W, contMult);
  const reserveEnergy_J = applyMultI32(arch.reserveEnergy_J, reserveMult);

  const controlMult = mulFromVariation(biasedTriSym(rng, agi), arch.controlVar);
  const controlQuality = clampQ(qMul(arch.controlQuality, controlMult), q(0.15), q(0.98));

  // speed bias is negated: +speed → shorter (faster) reactionTime
  const reactMult = mulFromVariation(biasedTriSym(rng, -spd), arch.reactionTimeVar);
  const reactCouple = clampQ((SCALE.Q + ((SCALE.Q - controlQuality) >>> 2)) as Q, q(0.75), q(1.30));
  const reactionTime_s = applyMultI32(arch.reactionTime_s, qMul(reactMult, reactCouple));

  const stability = clampQ(qMul(arch.stability, mulFromVariation(biasedTriSym(rng, agi), arch.stabilityVar)), q(0.05), q(0.99));
  const rawFineControl = clampQ(qMul(arch.fineControl, mulFromVariation(biasedTriSym(rng, agi), arch.fineControlVar)), q(0.05), q(0.99));
  // Phase 33: bodilyKinesthetic sets a floor on fine motor precision
  const bkFloor: Q = arch.cognition ? qMul(arch.cognition.bodilyKinesthetic, q(0.80)) : q(0) as Q;
  const fineControl = clampQ(Math.max(rawFineControl, bkFloor) as Q, q(0.05), q(0.99));

  const surfaceIntegrity = clampQ(qMul(arch.surfaceIntegrity, mulFromVariation(biasedTriSym(rng, res), arch.surfaceVar)), q(0.4), q(3.0));
  const bulkIntegrity = clampQ(qMul(arch.bulkIntegrity, mulFromVariation(biasedTriSym(rng, res), arch.bulkVar)), q(0.4), q(3.0));
  const structureIntegrity = clampQ(qMul(arch.structureIntegrity, mulFromVariation(biasedTriSym(rng, res), arch.structVar)), q(0.4), q(3.0));

  const distressTolerance = clampQ(qMul(arch.distressTolerance, mulFromVariation(biasedTriSym(rng, res), arch.distressVar)), q(0.01), q(0.98));
  const shockTolerance = clampQ(qMul(arch.shockTolerance, mulFromVariation(biasedTriSym(rng, res), arch.shockVar)), q(0.01), q(0.98));
  const concussionTolerance = clampQ(qMul(arch.concussionTolerance, mulFromVariation(biasedTriSym(rng, res), arch.concVar)), q(0.01), q(0.98));

  const heatTolerance = clampQ(qMul(arch.heatTolerance, mulFromVariation(triSym(rng), arch.heatVar)), q(0.01), q(0.98));
  const coldTolerance = clampQ(qMul(arch.coldTolerance, mulFromVariation(triSym(rng), arch.coldVar)), q(0.01), q(0.98));

  // positive resilience bias → lower fatigue rate (better endurance), so bias is negated
  const fatigueRate = clampQ(qMul(arch.fatigueRate, mulFromVariation(biasedTriSym(rng, -res), arch.fatigueVar)), q(0.4), q(2.5));
  const recoveryRate = clampQ(qMul(arch.recoveryRate, mulFromVariation(biasedTriSym(rng, res), arch.recoveryVar)), q(0.4), q(2.5));

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
    perception: {
      visionRange_m: arch.visionRange_m,
      visionArcDeg: arch.visionArcDeg,
      halfArcCosQ: halfArcCosQ(arch.visionArcDeg),
      hearingRange_m: arch.hearingRange_m,
      decisionLatency_s: arch.decisionLatency_s,
      attentionDepth: arch.attentionDepth,
      threatHorizon_m: arch.threatHorizon_m,
    },
    // Phase 33: pass through species-typical cognition (no per-individual variance)
    ...(arch.cognition ? { cognition: arch.cognition } : {}),
  };
}
