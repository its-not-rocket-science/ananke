// src/sim/medical.ts — Phase 9: medical treatment types; Phase 11: tech gating
import { q, type Q } from "../units.js";
import type { TechCapability } from "./tech.js";

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

/**
 * Phase 11: TechCapability that must be available in TechContext to use equipment at this tier.
 * When ctx.techCtx is provided and the capability is absent, treatment is blocked.
 *
 * Tiers not listed here have no technology requirement (they work in any era).
 */
export const TIER_TECH_REQ: Partial<Record<MedicalTier, TechCapability>> = {
  nanomedicine: "NanomedicalRepair",
};
