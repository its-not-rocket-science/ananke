// src/sim/substance.ts — Phase 10: pharmacokinetics model
//
// One-compartment model:
//   d[concentration]/dt = absorptionRate × pendingDose − eliminationRate × concentration
//
// Effects activate when concentration exceeds effectThreshold.
// The engine consumes substance definitions; the host application manages which
// substances an entity has ingested/injected (by populating entity.substances).

import type { Q } from "../units.js";
import { q } from "../units.js";
import type { Entity } from "./entity.js";

export type SubstanceEffectType =
  | "stimulant"      // reduces fear and slows fatigue accumulation
  | "anaesthetic"    // erodes consciousness
  | "poison"         // internal damage (systemic toxin to torso)
  | "haemostatic";   // reduces bleeding rate across all regions

export interface Substance {
  id: string;
  name: string;
  /** Fraction of pendingDose absorbed into concentration per tick (0..1 Q). */
  absorptionRate: Q;
  /** Fraction of current concentration cleared per tick (0..1 Q). */
  eliminationRate: Q;
  /** Minimum concentration for effects to activate (0..1 Q). */
  effectThreshold: Q;
  /** Nature of biological effect. */
  effectType: SubstanceEffectType;
  /**
   * Strength multiplier applied to the above-threshold concentration delta.
   * A value of q(1.0) produces the standard effect magnitude.
   */
  effectStrength: Q;
}

/**
 * An active dose of a substance present in an entity's system.
 * Add to `entity.substances` when a substance is ingested or injected.
 */
export interface ActiveSubstance {
  substance: Substance;
  /** Remaining unabsorbed dose (Q 0..1); decreases each tick as absorption occurs. */
  pendingDose: Q;
  /** Current systemic concentration (Q 0..1); rises with absorption, falls with elimination. */
  concentration: Q;
}

/**
 * Phase 10C: returns true if the entity has an active substance of the given type
 * with concentration above its effectThreshold.
 */
export function hasSubstanceType(e: Entity, type: SubstanceEffectType): boolean {
  if (!e.substances) return false;
  return e.substances.some(
    a => a.substance.effectType === type && a.concentration > a.substance.effectThreshold,
  );
}

/** Ready-made substance catalogue for common game scenarios. */
export const STARTER_SUBSTANCES: Record<string, Substance> = {
  stimulant: {
    id: "stimulant",
    name: "Combat Stimulant",
    absorptionRate:   q(0.15),  // 15%/tick — fast-acting injection
    eliminationRate:  q(0.02),  // 2%/tick  — clears in ~50 ticks (2.5 s)
    effectThreshold:  q(0.10),
    effectType:       "stimulant",
    effectStrength:   q(0.80),
  },
  anaesthetic: {
    id: "anaesthetic",
    name: "Anaesthetic",
    absorptionRate:   q(0.08),  // slower onset
    eliminationRate:  q(0.008), // slow clearance — lasts many ticks
    effectThreshold:  q(0.05),
    effectType:       "anaesthetic",
    effectStrength:   q(1.00),
  },
  poison: {
    id: "poison",
    name: "Contact Poison",
    absorptionRate:   q(0.06),  // slow skin absorption
    eliminationRate:  q(0.004), // very slow clearance
    effectThreshold:  q(0.05),
    effectType:       "poison",
    effectStrength:   q(0.80),
  },
  haemostatic: {
    id: "haemostatic",
    name: "Haemostatic Agent",
    absorptionRate:   q(0.20),  // rapid absorption (injected/applied)
    eliminationRate:  q(0.03),  // clears in ~33 ticks (1.6 s)
    effectThreshold:  q(0.10),
    effectType:       "haemostatic",
    effectStrength:   q(0.60),
  },
};
