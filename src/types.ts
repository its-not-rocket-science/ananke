import type { I32, Q } from "./units.js";

// Phase 37: Language capacity for multilingual communication
export interface LanguageCapacity {
  /** Language identifier (e.g., "common", "elvish", "klingonese"). */
  languageId: string;
  /** Fluency level: q(1.0) = native, q(0.50) = conversational, q(0.20) = survival. */
  fluency_Q: Q;
}

// Phase 33: Gardner's Multiple Intelligences + inter-species (all Q-coded 0..1)
export interface CognitiveProfile {
  /** Language, argument complexity, written/spoken command clarity. */
  linguistic:          Q;
  /** Deductive reasoning, planning horizon, pattern abstraction. */
  logicalMathematical: Q;
  /** 3-D world modelling, navigation, cover identification, targeting lead. */
  spatial:             Q;
  /** Proprioception, fine motor precision, tool mastery. */
  bodilyKinesthetic:   Q;
  /** Rhythm, acoustic pattern recognition, sound cue detection. */
  musical:             Q;
  /** Social reading, empathy, leadership radius, teaching quality. */
  interpersonal:       Q;
  /** Self-regulation, focus, willpower, fear resistance. */
  intrapersonal:       Q;
  /** Pattern recognition in living systems, tracking, herbalism, taming. */
  naturalist:          Q;
  /** Empathy across species boundaries; reading non-human intent. */
  interSpecies:        Q;
  /** Phase 36: species IDs with which the entity has deep familiarity. */
  speciesAffinity?:    string[];
  /** Phase 36: map of species ID → comprehension quality for signaling. */
  signalVocab?:        Map<string, Q>;
}

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

// Phase 47: individual AI personality traits
export type PersonalityId = "berserker" | "coward" | "guardian" | "schemer" | "soldier";

/**
 * Four orthogonal behavioural axes that modulate decisions on top of the base AIPolicy.
 * All fields are Q-coded [0, SCALE.Q]; q(0.50) is neutral (no change from baseline).
 */
export interface PersonalityTraits {
  /** 0 = passive/retreat-prone; q(1.0) = fights to the end, ignores hesitation. */
  aggression: Q;
  /** 0 = reckless; q(1.0) = maximises defensive intensity and cover-seeking. */
  caution: Q;
  /** 0 = pure self-preservation; q(1.0) = overrides focus target to shield allies. */
  loyalty: Q;
  /** 0 = locks onto first target; q(1.0) = hunts the most wounded enemy. */
  opportunism: Q;
}

export interface IndividualAttributes {
  morphology: Morphology;
  performance: Performance;
  control: Control;
  resilience: Resilience;
  perception?: Perception;
  /** Phase 32A: declared locomotion modes (absent = ground-only). */
  locomotionModes?: LocomotionCapacity[];
  /** Phase 33: Gardner's multiple intelligences + inter-species. */
  cognition?: CognitiveProfile;
  /** Phase 37: Language capacities for multilingual communication. */
  languages?: LanguageCapacity[];
}

export interface EnergyState {
  reserveEnergy_J: I32;
  fatigue: Q; // 0..1
}
