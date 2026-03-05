import type { I32, Q } from "./units.js";

// Phase 32A: locomotion mode types
export type LocomotionMode = "ground" | "flight" | "swim" | "climb";

export interface LocomotionCapacity {
  mode:          LocomotionMode;
  /** Maximum speed in this mode [SCALE.mps]. */
  maxSpeed_mps:  number;
  /** Energy cost multiplier on peakPower_W per unit distance. */
  costMul:       Q;
  /** Target altitude maintained during flight [SCALE.m]; ignored for other modes. */
  cruiseAlt_m?:  number;
}

// Phase 4: sensory and cognitive attributes
export interface Perception {
  visionRange_m: I32;       // maximum reliable visual range (SCALE.m units)
  visionArcDeg: number;     // horizontal FoV in degrees (1–360)
  halfArcCosQ: Q;           // cos(visionArcDeg/2) pre-computed in Q for sim path
  hearingRange_m: I32;      // omnidirectional acoustic detection range (SCALE.m units)
  decisionLatency_s: I32;   // minimum time between plan revisions (SCALE.s units)
  attentionDepth: number;   // max simultaneously tracked entities (integer)
  threatHorizon_m: I32;     // range at which threats are meaningfully processed (SCALE.m units)
}

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

  // Phase 12B: resistance to capability effects (magic / tech)
  magicResist?: Q;          // 0 = fully susceptible; q(1.0) = completely immune

  // Phase 5 extensions: archetype fear response
  fearResponse?: "flight" | "freeze" | "berserk";
}

export interface IndividualAttributes {
  morphology: Morphology;
  performance: Performance;
  control: Control;
  resilience: Resilience;
  perception?: Perception;
  /** Phase 32A: declared locomotion modes (absent = ground-only). */
  locomotionModes?: LocomotionCapacity[];
}

export interface EnergyState {
  reserveEnergy_J: I32;
  fatigue: Q; // 0..1
}
