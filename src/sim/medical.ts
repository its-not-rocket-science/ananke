// src/sim/medical.ts — Phase 9: medical treatment types
import { q, type Q } from "../units.js";

/**
 * Capability tier of the equipment used during treatment.
 * Passed on TreatCommand; the kernel scales effectiveness accordingly.
 */
export type MedicalTier = "none" | "bandage" | "surgicalKit" | "autodoc" | "nanomedicine";

/** Ordinal rank used for minimum-tier comparisons. Higher = more capable. */
export const TIER_RANK: Record<MedicalTier, number> = {
  none: 0, bandage: 1, surgicalKit: 2, autodoc: 3, nanomedicine: 4,
};

/**
 * Effectiveness multiplier per tier.
 * Applied as: reduction = BASE_RATE × TIER_MUL × (medSkill.treatmentRateMul / SCALE.Q)
 */
export const TIER_MUL: Record<MedicalTier, Q> = {
  none:         q(0),
  bandage:      q(0.50) as Q,
  surgicalKit:  q(0.80) as Q,
  autodoc:      q(1.00) as Q,
  nanomedicine: q(1.20) as Q,
};

/**
 * Available treatment actions.
 *
 * tourniquet       — zeroes bleedingRate in one region immediately; requires ≥ bandage tier
 * bandage          — reduces bleedingRate per tick; requires ≥ bandage tier
 * surgery          — reduces structuralDamage per tick; clears fracture when healed; requires ≥ surgicalKit
 * fluidReplacement — restores fluidLoss per tick; requires ≥ autodoc
 */
export type MedicalAction = "tourniquet" | "bandage" | "surgery" | "fluidReplacement";

/** Minimum tier required for each action. */
export const ACTION_MIN_TIER: Record<MedicalAction, MedicalTier> = {
  tourniquet:       "bandage",
  bandage:          "bandage",
  surgery:          "surgicalKit",
  fluidReplacement: "autodoc",
};
