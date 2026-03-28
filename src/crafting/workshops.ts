// src/crafting/workshops.ts — Phase 61: Workshop System
//
// Workshop types with tiered bonuses, facility levels, and tool requirements.
// Deterministic bonuses applied to crafting resolution.

import type { Q } from "../units.js";
import { SCALE, q, clampQ } from "../units.js";
import type { Recipe } from "./recipes.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Facility level tiers with associated bonuses. */
export type FacilityLevel = "crude" | "basic" | "advanced" | "master";

/** Workshop type definition. */
export interface WorkshopType {
  id: string;
  name: string;
  requiredFacilityLevel: FacilityLevel;
  toolBonus_Q: Q;           // Base tool quality bonus (additive)
  timeReduction_Q: Q;       // Time reduction multiplier (e.g., q(0.90) = 10% faster)
  qualityBonus_Q: Q;        // Quality bonus multiplier (e.g., q(1.10) = +10% quality)
}

/** Workshop instance at a specific location. */
export interface WorkshopInstance {
  typeId: string;
  locationId: string;       // Identifier for the location (settlement, camp, etc.)
  facilityLevel: FacilityLevel;
  availableTools: Map<string, Q>; // toolCategory -> quality_Q
}

/** Combined workshop bonuses for a specific recipe. */
export interface WorkshopBonus {
  toolBonus_Q: Q;           // Effective tool quality bonus
  timeReduction_Q: Q;       // Effective time reduction
  qualityBonus_Q: Q;        // Effective quality bonus
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Facility level definitions with numeric tier. */
export const FACILITY_LEVELS: Record<FacilityLevel, { tier: number; name: string }> = {
  crude:    { tier: 1, name: "Crude" },
  basic:    { tier: 2, name: "Basic" },
  advanced: { tier: 3, name: "Advanced" },
  master:   { tier: 4, name: "Master" },
};

/** Default tool quality for missing tools. */
const DEFAULT_TOOL_QUALITY_Q: Q = q(0.30) as Q;

// ── Workshop Type Catalogue ───────────────────────────────────────────────────

export const WORKSHOP_TYPES: WorkshopType[] = [
  {
    id: "forge",
    name: "Forge",
    requiredFacilityLevel: "crude",
    toolBonus_Q: q(0.20),
    timeReduction_Q: q(0.95),
    qualityBonus_Q: q(1.05),
  },
  {
    id: "carpentry",
    name: "Carpentry Workshop",
    requiredFacilityLevel: "basic",
    toolBonus_Q: q(0.15),
    timeReduction_Q: q(0.90),
    qualityBonus_Q: q(1.03),
  },
  {
    id: "tailor",
    name: "Tailor's Workshop",
    requiredFacilityLevel: "basic",
    toolBonus_Q: q(0.10),
    timeReduction_Q: q(0.92),
    qualityBonus_Q: q(1.02),
  },
  {
    id: "smithy",
    name: "Smithy",
    requiredFacilityLevel: "advanced",
    toolBonus_Q: q(0.30),
    timeReduction_Q: q(0.85),
    qualityBonus_Q: q(1.10),
  },
  {
    id: "alchemist",
    name: "Alchemist's Laboratory",
    requiredFacilityLevel: "advanced",
    toolBonus_Q: q(0.25),
    timeReduction_Q: q(0.88),
    qualityBonus_Q: q(1.08),
  },
  {
    id: "artificer",
    name: "Artificer's Workshop",
    requiredFacilityLevel: "master",
    toolBonus_Q: q(0.40),
    timeReduction_Q: q(0.80),
    qualityBonus_Q: q(1.20),
  },
];

// ── Workshop Operations ───────────────────────────────────────────────────────

/**
 * Get combined workshop bonuses for a specific recipe.
 * Takes into account workshop type, facility level, and available tools.
 */
export function getWorkshopBonus(
  workshop: WorkshopInstance,
  recipe: Recipe,
): WorkshopBonus {
  const workshopType = WORKSHOP_TYPES.find(wt => wt.id === workshop.typeId);
  if (!workshopType) {
    // No bonus if workshop type unknown
    return { toolBonus_Q: q(0), timeReduction_Q: q(1.0), qualityBonus_Q: q(1.0) };
  }

  // Facility level multiplier: higher tier amplifies bonuses
  const tier = FACILITY_LEVELS[workshop.facilityLevel].tier;
  const facilityMul = 1.0 + (tier - 1) * 0.1; // 10% per tier

  // Tool bonus: average quality of tools required by recipe
  let totalToolQuality = 0;
  let toolCount = 0;
  for (const toolReq of recipe.toolRequirements) {
    const toolQ = workshop.availableTools.get(toolReq.toolCategory) ?? DEFAULT_TOOL_QUALITY_Q;
    totalToolQuality += toolQ;
    toolCount++;
  }
  const avgToolQuality = toolCount > 0 ? totalToolQuality / toolCount : DEFAULT_TOOL_QUALITY_Q;
  const toolBonus_Q = clampQ(
    Math.round(workshopType.toolBonus_Q * avgToolQuality / SCALE.Q * facilityMul) as Q,
    q(0),
    q(0.50),
  );

  // Time reduction: facility level reduces time further
  const timeReduction_Q = clampQ(
    Math.round(workshopType.timeReduction_Q * SCALE.Q / facilityMul) as Q,
    q(0.50),
    q(1.0),
  );

  // Quality bonus: facility level increases quality
  const qualityBonus_Q = clampQ(
    Math.round(workshopType.qualityBonus_Q * facilityMul) as Q,
    q(1.0),
    q(1.30),
  );

  return { toolBonus_Q, timeReduction_Q, qualityBonus_Q };
}

/**
 * Validate workshop requirements for a recipe.
 * Returns list of missing tool categories and facility level insufficiency.
 */
export function validateWorkshopRequirements(
  workshop: WorkshopInstance,
  recipe: Recipe,
): { missingTools: string[]; facilityLevelInsufficient: boolean } {
  const workshopType = WORKSHOP_TYPES.find(wt => wt.id === workshop.typeId);
  const missingTools: string[] = [];
  const facilityLevelInsufficient = workshopType
    ? FACILITY_LEVELS[workshop.facilityLevel].tier < FACILITY_LEVELS[workshopType.requiredFacilityLevel].tier
    : true;

  // Check each required tool category exists in workshop with sufficient quality
  for (const toolReq of recipe.toolRequirements) {
    const toolQ = workshop.availableTools.get(toolReq.toolCategory) ?? q(0);
    const requiredQ = toolReq.minQuality_Q ?? DEFAULT_TOOL_QUALITY_Q;
    if (toolQ < requiredQ) {
      missingTools.push(toolReq.toolCategory);
    }
  }

  return { missingTools, facilityLevelInsufficient };
}

/**
 * Upgrade workshop facility level if resources are available.
 * Returns success and new workshop instance (or same if failed).
 */
export function upgradeWorkshop(
  workshop: WorkshopInstance,
  resources: Map<string, number>, // resource itemId -> quantity consumed
  targetLevel: FacilityLevel,
): { success: boolean; upgradedWorkshop: WorkshopInstance; consumedResources: Map<string, number> } {
  const currentTier = FACILITY_LEVELS[workshop.facilityLevel].tier;
  const targetTier = FACILITY_LEVELS[targetLevel].tier;
  if (targetTier <= currentTier) {
    return { success: false, upgradedWorkshop: workshop, consumedResources: new Map() };
  }

  // Check resource requirements: 10 units of "material_wood" per tier step
  const tierSteps = targetTier - currentTier;
  const woodRequired = 10 * tierSteps;
  const woodAvailable = resources.get("material_wood") ?? 0;
  if (woodAvailable < woodRequired) {
    return { success: false, upgradedWorkshop: workshop, consumedResources: new Map() };
  }

  const upgradedWorkshop: WorkshopInstance = {
    ...workshop,
    facilityLevel: targetLevel,
  };

  const consumedResources = new Map<string, number>();
  consumedResources.set("material_wood", woodRequired);

  return { success: true, upgradedWorkshop, consumedResources };
}

// ── Workshop Creation ─────────────────────────────────────────────────────────

/** Create a new workshop instance with default tools. */
export function createWorkshop(
  typeId: string,
  locationId: string,
  facilityLevel: FacilityLevel = "crude",
  initialTools?: Map<string, Q>,
): WorkshopInstance | undefined {
  const workshopType = WORKSHOP_TYPES.find(wt => wt.id === typeId);
  if (!workshopType) return undefined;

  // Ensure facility level meets minimum requirement
  const requiredTier = FACILITY_LEVELS[workshopType.requiredFacilityLevel].tier;
  const actualTier = FACILITY_LEVELS[facilityLevel].tier;
  if (actualTier < requiredTier) {
    // Downgrade to required level
    facilityLevel = workshopType.requiredFacilityLevel;
  }

  return {
    typeId,
    locationId,
    facilityLevel,
    availableTools: initialTools ?? new Map(),
  };
}

// ── Utility Functions ────────────────────────────────────────────────────────

/** Get workshop type by ID. */
export function getWorkshopTypeById(id: string): WorkshopType | undefined {
  return WORKSHOP_TYPES.find(wt => wt.id === id);
}

/** Get all workshop types that can be used at a given facility level. */
export function getWorkshopTypesForLevel(facilityLevel: FacilityLevel): WorkshopType[] {
  const tier = FACILITY_LEVELS[facilityLevel].tier;
  return WORKSHOP_TYPES.filter(wt => FACILITY_LEVELS[wt.requiredFacilityLevel].tier <= tier);
}