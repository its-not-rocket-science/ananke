// src/crafting/recipes.ts — Phase 61: Recipe System
//
// Recipe definitions with ingredient requirements, skill checks, and crafting resolution.
// Deterministic via eventSeed/makeRng, fixed-point arithmetic only.

import type { Q } from "../units.js";
import { SCALE, q, clampQ, qMul, mulDiv } from "../units.js";
import type { Entity } from "../sim/entity.js";
import type { Inventory } from "../inventory.js";
import { getItemCountByTemplateId } from "../inventory.js";
import { makeRng } from "../rng.js";
import { eventSeed, hashString } from "../sim/seeds.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Skill requirement for a recipe. */
export interface SkillRequirement {
  skillType: "bodilyKinesthetic" | "logicalMathematical" | "spatial" | "musical";
  minLevel_Q: Q;
}

/** Tool requirement for a recipe. */
export interface ToolRequirement {
  toolCategory: "forge" | "precision" | "bladed" | "blunt" | "needlework";
  minQuality_Q?: Q;
}

/** Ingredient requirement for a recipe. */
export interface Ingredient {
  itemId: string;
  quantity: number;
  materialType?: string; // If specific material type required
  minQuality_Q?: Q;     // Minimum material quality
}

/** Recipe definition. */
export interface Recipe {
  id: string;
  name: string;
  outputItemId: string;
  outputQuantity: number;
  skillRequirements: SkillRequirement[];
  toolRequirements: ToolRequirement[];
  ingredients: Ingredient[];
  baseTime_s: number;
  complexity_Q: Q; // Affects success chance and quality variance
}

/** Result of recipe feasibility check. */
export interface FeasibilityResult {
  feasible: boolean;
  missingIngredients: string[]; // itemId of missing ingredients
  missingSkills: SkillRequirement[];
  missingTools: ToolRequirement[];
}

/** Result of recipe resolution. */
export interface RecipeResolutionResult {
  success: boolean;
  outputItemId: string;
  outputQuantity: number;
  quality_Q: Q;
  timeTaken_s: number;
  consumedIngredients: { itemId: string; quantity: number; }[];
  descriptor: "masterwork" | "fine" | "adequate" | "poor" | "ruined";
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default tool quality if not specified. */
const DEFAULT_TOOL_QUALITY_Q: Q = q(0.60) as Q;

/** Complexity penalty scaling factor. */
const COMPLEXITY_PENALTY_FACTOR: Q = q(0.30) as Q;

/** Base success chance modifier for complexity. */
const BASE_SUCCESS_MOD: Q = q(0.80) as Q;

// ── Recipe Catalogue (Example) ────────────────────────────────────────────────

export const SAMPLE_RECIPES: Recipe[] = [
  {
    id: "recipe_shortsword",
    name: "Shortsword",
    outputItemId: "wpn_knife",
    outputQuantity: 1,
    skillRequirements: [
      { skillType: "bodilyKinesthetic", minLevel_Q: q(0.40) },
      { skillType: "logicalMathematical", minLevel_Q: q(0.25) },
    ],
    toolRequirements: [
      { toolCategory: "forge", minQuality_Q: q(0.50) },
      { toolCategory: "bladed", minQuality_Q: q(0.30) },
    ],
    ingredients: [
      { itemId: "material_iron", quantity: 2, materialType: "iron" },
      { itemId: "material_wood", quantity: 1, materialType: "wood" },
    ],
    baseTime_s: 3600, // 1 hour
    complexity_Q: q(0.60),
  },
  {
    id: "recipe_leather_armour",
    name: "Leather armour",
    outputItemId: "arm_leather",
    outputQuantity: 1,
    skillRequirements: [
      { skillType: "bodilyKinesthetic", minLevel_Q: q(0.30) },
    ],
    toolRequirements: [
      { toolCategory: "needlework", minQuality_Q: q(0.20) },
    ],
    ingredients: [
      { itemId: "material_leather", quantity: 5, materialType: "leather" },
      { itemId: "material_sinew", quantity: 2 },
    ],
    baseTime_s: 7200, // 2 hours
    complexity_Q: q(0.45),
  },
];

// ── Feasibility Checking ──────────────────────────────────────────────────────

/**
 * Validate whether a recipe can be crafted given entity skills, inventory, and tools.
 * Tools are assumed to be available in the workshop; tool quality is checked separately.
 */
export function validateRecipeFeasibility(
  recipe: Recipe,
  inventory: Inventory,
  entity: Entity,
  availableToolQualities: Map<string, Q>, // toolCategory -> quality_Q
): FeasibilityResult {
  const missingIngredients: string[] = [];
  const missingSkills: SkillRequirement[] = [];
  const missingTools: ToolRequirement[] = [];

  // Check ingredients
  for (const ing of recipe.ingredients) {
    // Count items with matching templateId (material type ignored for now)
    const total = getItemCountByTemplateId(inventory, ing.itemId);
    if (total < ing.quantity) {
      missingIngredients.push(ing.itemId);
    }
  }

  // Check skills
  for (const skillReq of recipe.skillRequirements) {
    const skillQ = getEntitySkill(entity, skillReq.skillType);
    if (skillQ < skillReq.minLevel_Q) {
      missingSkills.push(skillReq);
    }
  }

  // Check tools
  for (const toolReq of recipe.toolRequirements) {
    const toolQ = availableToolQualities.get(toolReq.toolCategory) ?? q(0);
    const requiredQ = toolReq.minQuality_Q ?? DEFAULT_TOOL_QUALITY_Q;
    if (toolQ < requiredQ) {
      missingTools.push(toolReq);
    }
  }

  return {
    feasible: missingIngredients.length === 0 && missingSkills.length === 0 && missingTools.length === 0,
    missingIngredients,
    missingSkills,
    missingTools,
  };
}

/** Get entity skill level for a given skill type. */
function getEntitySkill(entity: Entity, skillType: SkillRequirement["skillType"]): Q {
  const cognition = entity.attributes.cognition;
  if (!cognition) return q(0.50) as Q;

  switch (skillType) {
    case "bodilyKinesthetic":
      return (cognition.bodilyKinesthetic ?? q(0.50)) as Q;
    case "logicalMathematical":
      return (cognition.logicalMathematical ?? q(0.50)) as Q;
    case "spatial":
      return (cognition.spatial ?? q(0.50)) as Q;
    case "musical":
      return (cognition.musical ?? q(0.50)) as Q;
    default:
      return q(0.50) as Q;
  }
}

// ── Crafting Resolution ───────────────────────────────────────────────────────

/**
 * Calculate crafting cost (time, material consumption) based on recipe, materials, and workshop bonuses.
 */
export function calculateCraftingCost(
  recipe: Recipe,
  materialQualities: Map<string, Q>, // itemId -> quality_Q
  workshopTimeReduction_Q: Q = q(1.0),
): { time_s: number; materialQualityAvg_Q: Q } {
  // Average material quality (default q(0.50))
  let totalQuality = 0;
  let count = 0;
  for (const ing of recipe.ingredients) {
    const qual = materialQualities.get(ing.itemId) ?? q(0.50);
    totalQuality += qual;
    count++;
  }
  const materialQualityAvg_Q = count > 0 ? Math.round(totalQuality / count) as Q : q(0.50);

  // Time reduced by workshop efficiency
  const time_s = Math.round(recipe.baseTime_s * SCALE.Q / workshopTimeReduction_Q);

  return { time_s, materialQualityAvg_Q };
}

/**
 * Resolve a recipe: consume ingredients, produce output with quality based on skills, tools, materials.
 * Deterministic via seed.
 */
export function resolveRecipe(
  recipe: Recipe,
  entity: Entity,
  inventory: Inventory,
  availableToolQualities: Map<string, Q>,
  worldSeed: number,
  tick: number,
  entityId: number,
  salt: number,
): RecipeResolutionResult {
  const seed = eventSeed(worldSeed, tick, entityId, hashString(recipe.id), salt);
  // Feasibility check (should be done before calling, but we double-check)
  const feasibility = validateRecipeFeasibility(recipe, inventory, entity, availableToolQualities);
  if (!feasibility.feasible) {
    return {
      success: false,
      outputItemId: recipe.outputItemId,
      outputQuantity: 0,
      quality_Q: q(0),
      timeTaken_s: recipe.baseTime_s,
      consumedIngredients: [],
      descriptor: "ruined",
    };
  }

  // Determine material qualities (for now assume average q(0.50))
  const materialQualities = new Map<string, Q>();
  for (const ing of recipe.ingredients) {
    materialQualities.set(ing.itemId, q(0.50));
  }

  // Calculate crafting cost (no workshop bonuses yet)
  const { time_s, materialQualityAvg_Q } = calculateCraftingCost(recipe, materialQualities);

  // Compute skill factor: average of required skills weighted by their minimum levels
  let skillFactor = 0;
  let totalWeight = 0;
  for (const skillReq of recipe.skillRequirements) {
    const skillQ = getEntitySkill(entity, skillReq.skillType);
    // How much above minimum? Normalized to [0,1]
    const excess = Math.max(0, skillQ - skillReq.minLevel_Q);
    const weight = skillReq.minLevel_Q; // higher minimum => more important
    skillFactor += excess * weight;
    totalWeight += weight;
  }
  const skillBonus = totalWeight > 0 ? skillFactor / totalWeight : q(0);

  // Compute tool factor: average tool quality relative to requirements
  let toolFactor = 0;
  let toolCount = 0;
  for (const toolReq of recipe.toolRequirements) {
    const toolQ = availableToolQualities.get(toolReq.toolCategory) ?? q(0);
    const requiredQ = toolReq.minQuality_Q ?? DEFAULT_TOOL_QUALITY_Q;
    const excess = Math.max(0, toolQ - requiredQ);
    toolFactor += excess;
    toolCount++;
  }
  const toolBonus = toolCount > 0 ? toolFactor / toolCount : q(0);

  // Complexity penalty: higher complexity reduces success chance
  const complexityPenalty = mulDiv(recipe.complexity_Q, COMPLEXITY_PENALTY_FACTOR, SCALE.Q);

  // Base success chance = skillBonus + toolBonus - complexityPenalty + BASE_SUCCESS_MOD
  const rawSuccess = skillBonus + toolBonus - complexityPenalty + BASE_SUCCESS_MOD;
  const successChance = clampQ(rawSuccess as Q, q(0), SCALE.Q);

  // Deterministic roll
  const rng = makeRng(seed, SCALE.Q);
  const roll = rng.q01();
  const success = roll < successChance;

  // Quality calculation: material quality × skill factor × tool factor ± variance
  const expectedQuality = qMul(materialQualityAvg_Q, qMul(skillBonus, toolBonus));
  const variance = mulDiv(rng.q01() - SCALE.Q / 2, q(0.20), SCALE.Q); // ±20%
  const quality_Q = clampQ((expectedQuality + variance) as Q, q(0), SCALE.Q);

  // Time taken (inverse of skill factor)
  const timeTaken_s = Math.round(time_s * q(0.50) / (skillBonus > 0 ? skillBonus : q(0.50)));

  // Determine descriptor
  const descriptor = qualityToDescriptor(quality_Q);

  // Consume ingredients (placeholder)
  const consumedIngredients = recipe.ingredients.map(ing => ({
    itemId: ing.itemId,
    quantity: ing.quantity,
  }));

  return {
    success,
    outputItemId: recipe.outputItemId,
    outputQuantity: success ? recipe.outputQuantity : 0,
    quality_Q,
    timeTaken_s,
    consumedIngredients,
    descriptor,
  };
}

function qualityToDescriptor(quality_Q: Q): RecipeResolutionResult["descriptor"] {
  if (quality_Q >= q(0.85)) return "masterwork";
  if (quality_Q >= q(0.65)) return "fine";
  if (quality_Q >= q(0.40)) return "adequate";
  if (quality_Q >= q(0.20)) return "poor";
  return "ruined";
}

// ── Utility Functions ─────────────────────────────────────────────────────────

/** Get recipe by ID. */
export function getRecipeById(id: string): Recipe | undefined {
  return SAMPLE_RECIPES.find(r => r.id === id);
}

/** Get all recipes. */
export function getAllRecipes(): Recipe[] {
  return SAMPLE_RECIPES;
}