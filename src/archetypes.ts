import { q, to, type Q, type I32 } from "./units";

export interface Archetype {
  stature_m: I32;
  mass_kg: I32;

  statureVar: Q;
  massVar: Q;

  reachVar: Q;
  actuatorScaleVar: Q;
  structureScaleVar: Q;

  actuatorMassFrac: Q;
  actuatorMassVar: Q;

  peakForce_N: I32;
  peakForceVar: Q;

  peakPower_W: I32;
  peakPowerVar: Q;

  continuousPower_W: I32;
  continuousPowerVar: Q;

  reserveEnergy_J: I32;
  reserveEnergyVar: Q;

  conversionEfficiency: Q;
  efficiencyVar: Q;

  reactionTime_s: I32;
  reactionTimeVar: Q;
  controlQuality: Q;
  controlVar: Q;

  stability: Q;
  stabilityVar: Q;
  fineControl: Q;
  fineControlVar: Q;

  surfaceIntegrity: Q; surfaceVar: Q;
  bulkIntegrity: Q; bulkVar: Q;
  structureIntegrity: Q; structVar: Q;

  distressTolerance: Q; distressVar: Q;
  shockTolerance: Q; shockVar: Q;
  concussionTolerance: Q; concVar: Q;

  heatTolerance: Q; heatVar: Q;
  coldTolerance: Q; coldVar: Q;

  fatigueRate: Q; fatigueVar: Q;
  recoveryRate: Q; recoveryVar: Q;
}

export const HUMAN_BASE: Archetype = {
  stature_m: to.m(1.75),
  mass_kg: to.kg(75.0),

  statureVar: q(0.08),
  massVar: q(0.18),

  reachVar: q(0.10),
  actuatorScaleVar: q(0.18),
  structureScaleVar: q(0.14),

  actuatorMassFrac: q(0.40),
  actuatorMassVar: q(0.20),

  peakForce_N: to.N(1840),
  peakForceVar: q(0.22),

  peakPower_W: to.W(1200),
  peakPowerVar: q(0.30),

  continuousPower_W: to.W(200),
  continuousPowerVar: q(0.25),

  reserveEnergy_J: to.J(20_000),
  reserveEnergyVar: q(0.35),

  conversionEfficiency: q(0.85),
  efficiencyVar: q(0.10),

  reactionTime_s: to.s(0.20),
  reactionTimeVar: q(0.25),
  controlQuality: q(0.75),
  controlVar: q(0.20),

  stability: q(0.70),
  stabilityVar: q(0.22),
  fineControl: q(0.70),
  fineControlVar: q(0.25),

  surfaceIntegrity: q(1.0), surfaceVar: q(0.18),
  bulkIntegrity: q(1.0), bulkVar: q(0.18),
  structureIntegrity: q(1.0), structVar: q(0.18),

  distressTolerance: q(0.50), distressVar: q(0.30),
  shockTolerance: q(0.50), shockVar: q(0.30),
  concussionTolerance: q(0.50), concVar: q(0.30),

  heatTolerance: q(0.50), heatVar: q(0.30),
  coldTolerance: q(0.50), coldVar: q(0.30),

  fatigueRate: q(1.0), fatigueVar: q(0.25),
  recoveryRate: q(1.0), recoveryVar: q(0.25),
};

export const SERVICE_ROBOT: Archetype = {
  stature_m: to.m(1.60),
  mass_kg: to.kg(55),

  statureVar: q(0.03),
  massVar: q(0.06),

  reachVar: q(0.05),
  actuatorScaleVar: q(0.12),
  structureScaleVar: q(0.20),

  actuatorMassFrac: q(0.22),
  actuatorMassVar: q(0.12),

  peakForce_N: to.N(2500),
  peakForceVar: q(0.10),

  peakPower_W: to.W(900),
  peakPowerVar: q(0.12),

  continuousPower_W: to.W(350),
  continuousPowerVar: q(0.10),

  reserveEnergy_J: to.J(60_000),
  reserveEnergyVar: q(0.15),

  conversionEfficiency: q(0.92),
  efficiencyVar: q(0.03),

  reactionTime_s: to.s(0.08),
  reactionTimeVar: q(0.10),
  controlQuality: q(0.88),
  controlVar: q(0.08),

  stability: q(0.80),
  stabilityVar: q(0.12),
  fineControl: q(0.85),
  fineControlVar: q(0.10),

  surfaceIntegrity: q(1.6), surfaceVar: q(0.10),
  bulkIntegrity: q(1.2), bulkVar: q(0.10),
  structureIntegrity: q(1.8), structVar: q(0.12),

  distressTolerance: q(0.95), distressVar: q(0.05),
  shockTolerance: q(0.85), shockVar: q(0.08),
  concussionTolerance: q(0.95), concVar: q(0.05),

  heatTolerance: q(0.70), heatVar: q(0.12),
  coldTolerance: q(0.90), coldVar: q(0.08),

  fatigueRate: q(0.70), fatigueVar: q(0.10),
  recoveryRate: q(1.20), recoveryVar: q(0.10),
};
