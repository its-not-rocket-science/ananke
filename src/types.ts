import type { I32, Q } from "./units";

export interface Morphology {
  stature_m: I32;
  mass_kg: I32;
  actuatorMass_kg: I32;
  actuatorScale: Q;
  structureScale: Q;
  reachScale: Q;
}

export interface Performance {
  peakForce_N: I32;
  peakPower_W: I32;
  continuousPower_W: I32;
  reserveEnergy_J: I32;
  conversionEfficiency: Q;
}

export interface Control {
  controlQuality: Q;     // 0..1
  reactionTime_s: I32;
  stability: Q;          // 0..1
  fineControl: Q;        // 0..1
}

export interface Resilience {
  surfaceIntegrity: Q;
  bulkIntegrity: Q;
  structureIntegrity: Q;

  distressTolerance: Q;     // 0..1
  shockTolerance: Q;        // 0..1
  concussionTolerance: Q;   // 0..1

  heatTolerance: Q;         // 0..1
  coldTolerance: Q;         // 0..1

  fatigueRate: Q;           // 1.0 baseline
  recoveryRate: Q;          // 1.0 baseline
}

export interface IndividualAttributes {
  morphology: Morphology;
  performance: Performance;
  control: Control;
  resilience: Resilience;
}

export interface EnergyState {
  reserveEnergy_J: I32;
  fatigue: Q; // 0..1
}
