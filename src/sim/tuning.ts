import type { Q } from "../units";
import { q } from "../units";

export type RealismLevel = "arcade" | "tactical" | "sim";

export interface SimulationTuning {
  realism: RealismLevel;

  // Hard disable thresholds (regional structural damage)
  armDisableThreshold: Q;
  legDisableThreshold: Q;

  // Capability thresholds
  standFailThreshold: Q;      // mobility below this -> cannot stand
  unconsciousThreshold: Q;    // consciousness below this -> cannot act

  // Deterministic probabilistic events (sim level only)
  stumbleBaseChance: Q;       // per tick
  fallBaseChance: Q;          // per tick

  // weapon-drop + stand/KO timing
  dropWeaponsOnUnconscious: boolean;
  standUpBaseTicks: number;        // NEW
  standUpMaxExtraTicks: number;    // NEW
  unconsciousBaseTicks: number;    // NEW
}

export const TUNING: Record<RealismLevel, SimulationTuning> = {
  arcade: {
    realism: "arcade",
    armDisableThreshold: q(0.98),
    legDisableThreshold: q(0.98),
    standFailThreshold: q(0.05),
    unconsciousThreshold: q(0.03),
    stumbleBaseChance: q(0.0),
    fallBaseChance: q(0.0),
    dropWeaponsOnUnconscious: false,
    standUpBaseTicks: 0,
    standUpMaxExtraTicks: 0,
    unconsciousBaseTicks: 5,
  },
  tactical: {
    realism: "tactical",
    armDisableThreshold: q(0.85),
    legDisableThreshold: q(0.90),
    standFailThreshold: q(0.20),
    unconsciousThreshold: q(0.10),
    stumbleBaseChance: q(0.002),
    fallBaseChance: q(0.001),
    dropWeaponsOnUnconscious: false,
    standUpBaseTicks: 15,
    standUpMaxExtraTicks: 45,
    unconsciousBaseTicks: 30,
  },
  sim: {
    realism: "sim",
    armDisableThreshold: q(0.75),
    legDisableThreshold: q(0.80),
    standFailThreshold: q(0.30),
    unconsciousThreshold: q(0.15),
    stumbleBaseChance: q(0.010),
    fallBaseChance: q(0.005),
    dropWeaponsOnUnconscious: true,
    standUpBaseTicks: 25,
    standUpMaxExtraTicks: 80,
    unconsciousBaseTicks: 60,
  },
};
