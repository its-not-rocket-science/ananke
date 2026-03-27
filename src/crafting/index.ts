// src/crafting/index.ts — Phase 61: Crafting Ecosystem Main API
//
// Integration layer for crafting, materials, workshops, and manufacturing.
// Provides high‑level functions for game systems to interact with crafting.

import type { Q } from "../units.js";
import { q, SCALE, qMul } from "../units.js";
import { eventSeed, hashString } from "../sim/seeds.js";
import type { Entity } from "../sim/entity.js";
import type { Inventory, ItemInstance } from "../inventory.js";
import { consumeItemsByTemplateId, addItemToInventory } from "../inventory.js";
import type { ItemBase } from "../equipment.js";
import type { Recipe } from "./recipes.js";
import type { Material } from "./materials.js";
import type { WorkshopInstance } from "./workshops.js";
import type { ProductionLine } from "./manufacturing.js";
import {
  validateRecipeFeasibility,
  resolveRecipe,
  getRecipeById,
  getAllRecipes,
  type FeasibilityResult,
  type RecipeResolutionResult,
} from "./recipes.js";
import {
  getMaterialTypeById,
  calculateMaterialEffect,
  createMaterialItem,
  type MaterialPropertyModifier,
} from "./materials.js";
import {
  getWorkshopBonus,
  validateWorkshopRequirements,
  createWorkshop,
  upgradeWorkshop,
  type WorkshopBonus,
} from "./workshops.js";
import {
  setupProductionLine,
  advanceProduction,
  estimateBatchCompletionTime,
  isProductionLineComplete,
  type ManufacturingOrder,
} from "./manufacturing.js";

// ── Main Crafting API ─────────────────────────────────────────────────────────

/**
 * Craft a single item using a recipe, entity, inventory, and workshop.
 * Returns resolution result with success, quality, time, and consumed ingredients.
 */
export function craftItem(
  recipeId: string,
  entity: Entity,
  inventory: Inventory,
  workshop: WorkshopInstance,
  worldSeed: number,
  tick: number,
  salt: number,
): RecipeResolutionResult {
  const recipe = getRecipeById(recipeId);
  if (!recipe) {
    return {
      success: false,
      outputItemId: recipeId,
      outputQuantity: 0,
      quality_Q: q(0),
      timeTaken_s: 0,
      consumedIngredients: [],
      descriptor: "ruined",
    };
  }

  // Convert workshop tools map to format expected by recipes
  const toolQualities = new Map<string, Q>();
  for (const [category, quality] of workshop.availableTools.entries()) {
    toolQualities.set(category, quality);
  }

  // Validate feasibility
  const feasibility = validateRecipeFeasibility(recipe, inventory, entity, toolQualities);
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

  // Apply workshop bonuses
  const workshopBonus = getWorkshopBonus(workshop, recipe);

  // Resolve recipe (workshop bonuses not yet integrated into resolveRecipe)
  const result = resolveRecipe(recipe, entity, inventory, toolQualities, worldSeed, tick, entity.id, salt);


  // Adjust time with workshop time reduction
  result.timeTaken_s = Math.round(result.timeTaken_s * SCALE.Q / workshopBonus.timeReduction_Q);

  // Adjust quality with workshop quality bonus
  result.quality_Q = clampQ(qMul(result.quality_Q, workshopBonus.qualityBonus_Q), q(0), SCALE.Q);

  // Update descriptor based on new quality
  result.descriptor = qualityToDescriptor(result.quality_Q);

  // If crafting succeeded, integrate into inventory
  if (result.success) {
    const instanceSeed = eventSeed(worldSeed, tick, entity.id, hashString(recipe.id), salt + 0xCAFE);
    const instanceId = `craft_${recipeId}_${instanceSeed}`;
    const integration = integrateCraftingIntoInventory(inventory, result, instanceId);
    if (!integration.success) {
      return {
        success: false,
        outputItemId: recipe.outputItemId,
        outputQuantity: 0,
        quality_Q: q(0),
        timeTaken_s: result.timeTaken_s,
        consumedIngredients: [],
        descriptor: "ruined",
      };
    }
  }

  return result;
}

/**
 * Start batch manufacturing of items.
 * Creates a production line and returns its ID.
 */
export function startManufacturing(
  recipeId: string,
  quantity: number,
  workshop: WorkshopInstance,
  workers: Entity[],
  worldSeed: number,
  tick: number,
  salt: number,
): { success: boolean; lineId?: string; error?: string } {
  const recipe = getRecipeById(recipeId);
  if (!recipe) {
    return { success: false, error: `Recipe ${recipeId} not found` };
  }

  // Validate workshop requirements
  const workshopReq = validateWorkshopRequirements(workshop, recipe);
  if (workshopReq.facilityLevelInsufficient || workshopReq.missingTools.length > 0) {
    return { success: false, error: "Workshop insufficient for recipe" };
  }

  // Validate worker skills (at least one worker meets skill requirements)
  let skilledWorkerExists = false;
  for (const worker of workers) {
    let meetsAll = true;
    for (const skillReq of recipe.skillRequirements) {
      const skill = worker.attributes.cognition?.[skillReq.skillType] ?? q(0);
      if (skill < skillReq.minLevel_Q) {
        meetsAll = false;
        break;
      }
    }
    if (meetsAll) {
      skilledWorkerExists = true;
      break;
    }
  }
  if (!skilledWorkerExists) {
    return { success: false, error: "No worker meets skill requirements" };
  }

  const _primaryWorkerId = workers.length > 0 ? workers[0]!.id : 0;
  const _lineSeed = eventSeed(worldSeed, tick, _primaryWorkerId, hashString(recipe.id), salt);
  const orderId = `order_${worldSeed}_${tick}_${recipe.id}_${salt}`;

  // Create manufacturing order
  const order: ManufacturingOrder = {
    orderId,
    recipeId,
    quantity,
    workshop,
  };

  // Setup production line
  const line = setupProductionLine(order, workers);

  // TODO: store production line in persistent state

  return { success: true, lineId: line.lineId };
}

/**
 * Advance manufacturing for a production line.
 * Returns items completed in this step.
 */
export function advanceManufacturing(
  lineId: string,
  deltaTime_s: number,
  workers: Entity[],
  workshop: WorkshopInstance,
  worldSeed: number,
  tick: number,
  salt: number,
): { itemsCompleted: number; totalProduced: number; progress_Q: Q } {
  // Compute deterministic seed from lineId
  let lineIdHash = 0;
  for (let i = 0; i < lineId.length; i++) lineIdHash += lineId.charCodeAt(i);
  const _seed = eventSeed(worldSeed, tick, lineIdHash, 0, salt);

  // TODO: retrieve production line by lineId
  const line: ProductionLine = {
    lineId,
    recipeId: "recipe_shortsword",
    batchSize: 10,
    itemsProduced: 0,
    progress_Q: q(0),
    assignedWorkers: workers.map(w => w.id),
    priority: 1,
    qualityRange: { min_Q: q(0.30), max_Q: q(0.90), avg_Q: q(0.60) },
  };

  const result = advanceProduction(line, deltaTime_s, workers);
  // TODO: update stored line

  return {
    itemsCompleted: result.itemsCompleted,
    totalProduced: result.totalItemsProduced,
    progress_Q: result.progress_Q,
  };
}

// ── Query API ─────────────────────────────────────────────────────────────────

/**
 * Get all recipes that can be crafted by an entity with given inventory and workshop.
 * Returns filtered list of recipes.
 */
export function getAvailableRecipes(
  entity: Entity,
  inventory: Inventory,
  workshop: WorkshopInstance,
): Recipe[] {
  const allRecipes = getAllRecipes();
  const toolQualities = new Map<string, Q>();
  for (const [category, quality] of workshop.availableTools.entries()) {
    toolQualities.set(category, quality);
  }

  return allRecipes.filter(recipe => {
    const feasibility = validateRecipeFeasibility(recipe, inventory, entity, toolQualities);
    return feasibility.feasible;
  });
}

/**
 * Get material properties for a crafted item.
 * Applies material property modifiers to base item stats.
 */
export function applyMaterialProperties(
  baseItem: ItemBase,
  material: Material,
): MaterialPropertyModifier {
  return calculateMaterialEffect(baseItem, material);
}

// ── Integration with Existing Systems ─────────────────────────────────────────

/**
 * Integrate crafting result into inventory.
 * Consumes ingredients and adds crafted item.
 * Returns success and error if any.
 */
export function integrateCraftingIntoInventory(
  inventory: Inventory,
  result: RecipeResolutionResult,
  instanceId: string,
): { success: boolean; error?: string } {
  if (!result.success) {
    return { success: false, error: "Crafting failed" };
  }

  // Consume ingredients
  for (const ing of result.consumedIngredients) {
    const ok = consumeItemsByTemplateId(inventory, ing.itemId, ing.quantity);
    if (!ok) {
      return { success: false, error: `Insufficient ${ing.itemId} after validation` };
    }
  }

  // Create item instance
  const itemInstance: ItemInstance = {
    instanceId,
    templateId: result.outputItemId,
    quantity: result.outputQuantity,
    durability_Q: result.quality_Q, // Use quality as durability placeholder
    modifications: [],
    containerPath: [],
  };

  // Add to inventory
  const addResult = addItemToInventory(inventory, itemInstance);
  if (!addResult.success) {
    return { success: false, error: "No container capacity for crafted item" };
  }

  return { success: true };
}

// ── Utility Functions ─────────────────────────────────────────────────────────

function clampQ(value: Q, min: Q, max: Q): Q {
  return Math.max(min, Math.min(max, value)) as Q;
}

function qualityToDescriptor(quality_Q: Q): RecipeResolutionResult["descriptor"] {
  if (quality_Q >= q(0.85)) return "masterwork";
  if (quality_Q >= q(0.65)) return "fine";
  if (quality_Q >= q(0.40)) return "adequate";
  if (quality_Q >= q(0.20)) return "poor";
  return "ruined";
}

// ── Exports ───────────────────────────────────────────────────────────────────

export {
  // Types
  type Recipe,
  type FeasibilityResult,
  type RecipeResolutionResult,
  type Material,
  type MaterialPropertyModifier,
  type WorkshopInstance,
  type WorkshopBonus,
  type ProductionLine,
  // Functions
  getRecipeById,
  getAllRecipes,
  getMaterialTypeById,
  createMaterialItem,
  getWorkshopBonus,
  validateWorkshopRequirements,
  createWorkshop,
  upgradeWorkshop,
  estimateBatchCompletionTime,
  isProductionLineComplete,
};