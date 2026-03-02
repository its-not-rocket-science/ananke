import { q, to, type Q, type I32 } from "./units.js";

export interface Archetype {
  stature_m: I32;
  mass_kg: I32;

  // Phase 4: perception (deterministic, no variance — species characteristic)
  visionRange_m: I32;
  visionArcDeg: number;
  hearingRange_m: I32;
  decisionLatency_s: I32;
  attentionDepth: number;
  threatHorizon_m: I32;

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

  visionRange_m: to.m(200),       // ~200m reliable visual identification
  visionArcDeg: 120,              // ~120° binocular forward arc
  hearingRange_m: to.m(50),       // ~50m reliable sound detection
  decisionLatency_s: to.s(0.5),  // ~500ms to revise tactical plan
  attentionDepth: 4,              // track up to 4 threats simultaneously
  threatHorizon_m: to.m(40),      // process threats within 40m

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

// ─── Phase 15: validated real-world archetypes ────────────────────────────────

/**
 * Amateur boxer — British Journal of Sports Medicine, Walilko et al.
 * Amateur punch force: 2,500–4,000 N (nominal 2,800 N used).
 */
export const AMATEUR_BOXER: Archetype = {
  stature_m: to.m(1.78), mass_kg: to.kg(75),
  visionRange_m: to.m(200), visionArcDeg: 120, hearingRange_m: to.m(50),
  decisionLatency_s: to.s(0.45), attentionDepth: 4, threatHorizon_m: to.m(30),
  statureVar: q(0.06), massVar: q(0.10),
  reachVar: q(0.08), actuatorScaleVar: q(0.15), structureScaleVar: q(0.12),
  actuatorMassFrac: q(0.44), actuatorMassVar: q(0.15),
  peakForce_N: to.N(2800), peakForceVar: q(0.18),
  peakPower_W: to.W(1500), peakPowerVar: q(0.20),
  continuousPower_W: to.W(300), continuousPowerVar: q(0.20),
  reserveEnergy_J: to.J(25_000), reserveEnergyVar: q(0.25),
  conversionEfficiency: q(0.88), efficiencyVar: q(0.08),
  reactionTime_s: to.s(0.18), reactionTimeVar: q(0.18),
  controlQuality: q(0.82), controlVar: q(0.15),
  stability: q(0.75), stabilityVar: q(0.18),
  fineControl: q(0.78), fineControlVar: q(0.18),
  surfaceIntegrity: q(1.0), surfaceVar: q(0.15),
  bulkIntegrity: q(1.0), bulkVar: q(0.15),
  structureIntegrity: q(1.0), structVar: q(0.15),
  distressTolerance: q(0.65), distressVar: q(0.22),
  shockTolerance: q(0.65), shockVar: q(0.22),
  concussionTolerance: q(0.55), concVar: q(0.22),
  heatTolerance: q(0.55), heatVar: q(0.25),
  coldTolerance: q(0.50), coldVar: q(0.25),
  fatigueRate: q(0.85), fatigueVar: q(0.20),
  recoveryRate: q(1.10), recoveryVar: q(0.20),
};

/**
 * Pro boxer — biomechanics studies on elite boxers.
 * Elite punch force: 4,000–7,000 N (nominal 5,000 N, cruiserweight/light-heavy).
 */
export const PRO_BOXER: Archetype = {
  stature_m: to.m(1.82), mass_kg: to.kg(85),
  visionRange_m: to.m(200), visionArcDeg: 120, hearingRange_m: to.m(50),
  decisionLatency_s: to.s(0.40), attentionDepth: 4, threatHorizon_m: to.m(30),
  statureVar: q(0.05), massVar: q(0.08),
  reachVar: q(0.06), actuatorScaleVar: q(0.12), structureScaleVar: q(0.10),
  actuatorMassFrac: q(0.46), actuatorMassVar: q(0.12),
  peakForce_N: to.N(5000), peakForceVar: q(0.15),
  peakPower_W: to.W(2200), peakPowerVar: q(0.18),
  continuousPower_W: to.W(400), continuousPowerVar: q(0.18),
  reserveEnergy_J: to.J(40_000), reserveEnergyVar: q(0.20),
  conversionEfficiency: q(0.90), efficiencyVar: q(0.06),
  reactionTime_s: to.s(0.16), reactionTimeVar: q(0.15),
  controlQuality: q(0.88), controlVar: q(0.12),
  stability: q(0.80), stabilityVar: q(0.15),
  fineControl: q(0.85), fineControlVar: q(0.14),
  surfaceIntegrity: q(1.0), surfaceVar: q(0.12),
  bulkIntegrity: q(1.0), bulkVar: q(0.12),
  structureIntegrity: q(1.0), structVar: q(0.12),
  distressTolerance: q(0.75), distressVar: q(0.18),
  shockTolerance: q(0.75), shockVar: q(0.18),
  concussionTolerance: q(0.70), concVar: q(0.18),
  heatTolerance: q(0.55), heatVar: q(0.22),
  coldTolerance: q(0.50), coldVar: q(0.22),
  fatigueRate: q(0.80), fatigueVar: q(0.18),
  recoveryRate: q(1.20), recoveryVar: q(0.18),
};

/**
 * Greco-Roman wrestler — Olympic grappling literature.
 * Grip ~500 N forearm; whole-body throw ~2,000 N.
 */
export const GRECO_WRESTLER: Archetype = {
  stature_m: to.m(1.76), mass_kg: to.kg(80),
  visionRange_m: to.m(200), visionArcDeg: 120, hearingRange_m: to.m(50),
  decisionLatency_s: to.s(0.45), attentionDepth: 4, threatHorizon_m: to.m(20),
  statureVar: q(0.06), massVar: q(0.10),
  reachVar: q(0.08), actuatorScaleVar: q(0.15), structureScaleVar: q(0.12),
  actuatorMassFrac: q(0.45), actuatorMassVar: q(0.15),
  peakForce_N: to.N(2000), peakForceVar: q(0.18),
  peakPower_W: to.W(1400), peakPowerVar: q(0.22),
  continuousPower_W: to.W(280), continuousPowerVar: q(0.20),
  reserveEnergy_J: to.J(28_000), reserveEnergyVar: q(0.25),
  conversionEfficiency: q(0.88), efficiencyVar: q(0.08),
  reactionTime_s: to.s(0.20), reactionTimeVar: q(0.20),
  controlQuality: q(0.82), controlVar: q(0.15),
  stability: q(0.85), stabilityVar: q(0.14),
  fineControl: q(0.80), fineControlVar: q(0.16),
  surfaceIntegrity: q(1.0), surfaceVar: q(0.15),
  bulkIntegrity: q(1.0), bulkVar: q(0.15),
  structureIntegrity: q(1.0), structVar: q(0.15),
  distressTolerance: q(0.68), distressVar: q(0.22),
  shockTolerance: q(0.70), shockVar: q(0.22),
  concussionTolerance: q(0.55), concVar: q(0.22),
  heatTolerance: q(0.55), heatVar: q(0.25),
  coldTolerance: q(0.50), coldVar: q(0.25),
  fatigueRate: q(0.82), fatigueVar: q(0.20),
  recoveryRate: q(1.15), recoveryVar: q(0.20),
};

/**
 * Medieval knight infantry — trained warrior; armour applied via preset loadout.
 */
export const KNIGHT_INFANTRY: Archetype = {
  stature_m: to.m(1.75), mass_kg: to.kg(80),
  visionRange_m: to.m(200), visionArcDeg: 120, hearingRange_m: to.m(50),
  decisionLatency_s: to.s(0.50), attentionDepth: 4, threatHorizon_m: to.m(40),
  statureVar: q(0.07), massVar: q(0.12),
  reachVar: q(0.10), actuatorScaleVar: q(0.16), structureScaleVar: q(0.14),
  actuatorMassFrac: q(0.43), actuatorMassVar: q(0.16),
  peakForce_N: to.N(2200), peakForceVar: q(0.20),
  peakPower_W: to.W(1300), peakPowerVar: q(0.25),
  continuousPower_W: to.W(220), continuousPowerVar: q(0.22),
  reserveEnergy_J: to.J(22_000), reserveEnergyVar: q(0.28),
  conversionEfficiency: q(0.87), efficiencyVar: q(0.09),
  reactionTime_s: to.s(0.22), reactionTimeVar: q(0.22),
  controlQuality: q(0.78), controlVar: q(0.18),
  stability: q(0.76), stabilityVar: q(0.20),
  fineControl: q(0.75), fineControlVar: q(0.20),
  surfaceIntegrity: q(1.0), surfaceVar: q(0.16),
  bulkIntegrity: q(1.0), bulkVar: q(0.16),
  structureIntegrity: q(1.0), structVar: q(0.16),
  distressTolerance: q(0.72), distressVar: q(0.22),
  shockTolerance: q(0.70), shockVar: q(0.22),
  concussionTolerance: q(0.55), concVar: q(0.25),
  heatTolerance: q(0.55), heatVar: q(0.28),
  coldTolerance: q(0.55), coldVar: q(0.28),
  fatigueRate: q(0.90), fatigueVar: q(0.22),
  recoveryRate: q(1.05), recoveryVar: q(0.22),
};

/**
 * Large Pacific Octopus (Enteroctopus dofleini).
 * Arm muscle force ~150 N × 8 arms ≈ 1,200 N total burst.
 * ~2,000 suckers → extremely high controlQuality + grappling skill in presets.
 * Distributed nervous system → high concussionTolerance, low structureIntegrity (no skeleton).
 */
export const LARGE_PACIFIC_OCTOPUS: Archetype = {
  stature_m: to.m(1.0),       // effective size; mantle ~0.3 m, arms ~2 m
  mass_kg: to.kg(15),
  visionRange_m: to.m(20), visionArcDeg: 300, hearingRange_m: to.m(5),
  decisionLatency_s: to.s(0.30), attentionDepth: 3, threatHorizon_m: to.m(10),
  statureVar: q(0.10), massVar: q(0.20),
  reachVar: q(0.08), actuatorScaleVar: q(0.12), structureScaleVar: q(0.10),
  actuatorMassFrac: q(0.55),   // arms are almost entirely muscle
  actuatorMassVar: q(0.12),
  peakForce_N: to.N(1200), peakForceVar: q(0.15),
  peakPower_W: to.W(400), peakPowerVar: q(0.18),
  continuousPower_W: to.W(80), continuousPowerVar: q(0.20),
  reserveEnergy_J: to.J(6_000), reserveEnergyVar: q(0.25),
  conversionEfficiency: q(0.80), efficiencyVar: q(0.08),
  reactionTime_s: to.s(0.25), reactionTimeVar: q(0.15),
  controlQuality: q(0.95), controlVar: q(0.05),   // 8 independently controlled arms
  stability: q(0.98), stabilityVar: q(0.03),       // distributed on substrate
  fineControl: q(0.92), fineControlVar: q(0.05),
  surfaceIntegrity: q(0.60), surfaceVar: q(0.15),  // soft-bodied
  bulkIntegrity: q(0.70), bulkVar: q(0.15),
  structureIntegrity: q(0.40), structVar: q(0.10), // no skeleton
  distressTolerance: q(0.70), distressVar: q(0.20),
  shockTolerance: q(0.80), shockVar: q(0.15),      // distributed nervous system
  concussionTolerance: q(0.90), concVar: q(0.08),  // no enclosed brain cavity
  heatTolerance: q(0.35), heatVar: q(0.20),
  coldTolerance: q(0.75), coldVar: q(0.15),
  fatigueRate: q(1.20), fatigueVar: q(0.20),
  recoveryRate: q(0.80), recoveryVar: q(0.20),
};

export const SERVICE_ROBOT: Archetype = {
  stature_m: to.m(1.60),
  mass_kg: to.kg(55),

  visionRange_m: to.m(500),       // sensor suite: longer visual range
  visionArcDeg: 360,              // omnidirectional cameras
  hearingRange_m: to.m(100),      // acoustic arrays
  decisionLatency_s: to.s(0.05), // 50ms: near-instant decision cycle
  attentionDepth: 16,             // broad multi-target tracking
  threatHorizon_m: to.m(150),     // process threats within 150m

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
