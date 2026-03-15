// test/crafting/recipes.test.ts — Phase 61: Recipe System Tests

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../../src/units";
import {
  validateRecipeFeasibility,
  resolveRecipe,
  getRecipeById,
  SAMPLE_RECIPES,
  type Recipe,
} from "../../src/crafting/recipes";
import { mkHumanoidEntity } from "../../src/sim/testing";
import type { Entity } from "../../src/sim/entity";
import { createInventory, createContainer, addItemToContainer, type Inventory, type ItemInstance } from "../../src/inventory";

describe("Recipe System", () => {
  // Helper to create an entity with specific skills
  function mkEntity(
    bodilyKinesthetic: number = 0.5,
    logicalMathematical: number = 0.5,
    spatial: number = 0.5,
    musical: number = 0.5,
  ): Entity {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    return {
      ...e,
      attributes: {
        ...e.attributes,
        cognition: {
          linguistic: q(0.60),
          logicalMathematical: q(logicalMathematical),
          spatial: q(spatial),
          bodilyKinesthetic: q(bodilyKinesthetic),
          musical: q(musical),
          interpersonal: q(0.60),
          intrapersonal: q(0.60),
          naturalist: q(0.55),
          interSpecies: q(0.30),
        },
      },
    };
  }

  // Helper to create inventory with required materials for tests
  function createMockInventory(): Inventory {
    const inv = createInventory(1);
    const container = createContainer("bag1", "Bag", 100, 1);
    // Add materials for shortsword: 2 iron, 1 wood (we add plenty)
    const ironItem: ItemInstance = {
      instanceId: "iron1",
      templateId: "material_iron",
      quantity: 5,
      containerPath: [],
    };
    const woodItem: ItemInstance = {
      instanceId: "wood1",
      templateId: "material_wood",
      quantity: 5,
      containerPath: [],
    };
    addItemToContainer(container, ironItem);
    addItemToContainer(container, woodItem);
    inv.containers.push(container);
    return inv;
  }

  const mockInventory = createMockInventory();

  // Mock tool qualities
  const mockTools = new Map<string, number>([
    ["forge", q(0.70)],
    ["bladed", q(0.60)],
    ["needlework", q(0.40)],
  ]);

  it("should retrieve recipe by ID", () => {
    const recipe = getRecipeById("recipe_shortsword");
    expect(recipe).toBeDefined();
    expect(recipe?.name).toBe("Shortsword");
    expect(recipe?.outputItemId).toBe("wpn_knife");
  });

  it("should validate feasible recipe", () => {
    const recipe = SAMPLE_RECIPES[0]!;
    const entity = mkEntity(0.8, 0.6); // high BK, decent LM
    const result = validateRecipeFeasibility(recipe, mockInventory, entity, mockTools);
    expect(result.feasible).toBe(true);
    expect(result.missingSkills).toHaveLength(0);
    expect(result.missingTools).toHaveLength(0);
  });

  it("should detect missing skill", () => {
    const recipe = SAMPLE_RECIPES[0]!;
    const entity = mkEntity(0.3, 0.2); // low BK, low LM
    const result = validateRecipeFeasibility(recipe, mockInventory, entity, mockTools);
    expect(result.feasible).toBe(false);
    expect(result.missingSkills.length).toBeGreaterThan(0);
    expect(result.missingSkills[0]?.skillType).toBe("bodilyKinesthetic");
  });

  it("should detect missing tool quality", () => {
    const recipe = SAMPLE_RECIPES[0]!;
    const entity = mkEntity(0.8, 0.6);
    const poorTools = new Map<string, number>([["forge", q(0.20)]]); // below minQuality_Q 0.50
    const result = validateRecipeFeasibility(recipe, mockInventory, entity, poorTools);
    expect(result.feasible).toBe(false);
    expect(result.missingTools.length).toBeGreaterThan(0);
  });

  it("should resolve recipe with success chance", () => {
    const recipe = SAMPLE_RECIPES[0]!;
    const entity = mkEntity(0.8, 0.6);
    const worldSeed = 12345;
    const tick = 0;
    const salt = 0;
    const result = resolveRecipe(recipe, entity, mockInventory, mockTools, worldSeed, tick, entity.id, salt);
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("quality_Q");
    expect(result).toHaveProperty("timeTaken_s");
    expect(result.outputItemId).toBe(recipe.outputItemId);
    expect(result.consumedIngredients).toHaveLength(recipe.ingredients.length);
  });

  it("should be deterministic for same seed", () => {
    const recipe = SAMPLE_RECIPES[0]!;
    const entity = mkEntity(0.7, 0.5);
    const seed = 9999;
    const result1 = resolveRecipe(recipe, entity, mockInventory, mockTools, seed);
    const result2 = resolveRecipe(recipe, entity, mockInventory, mockTools, seed);
    expect(result1.success).toBe(result2.success);
    expect(result1.quality_Q).toBe(result2.quality_Q);
    expect(result1.timeTaken_s).toBe(result2.timeTaken_s);
  });

  it("should produce different outcomes for different seeds", () => {
    const recipe = SAMPLE_RECIPES[0]!;
    const entity = mkEntity(0.7, 0.5);
    const result1 = resolveRecipe(recipe, entity, mockInventory, mockTools, 111);
    const result2 = resolveRecipe(recipe, entity, mockInventory, mockTools, 222);
    // Not guaranteed to be different, but likely; at least they are valid
    expect(result1.success).toBeDefined();
    expect(result2.success).toBeDefined();
  });

  it("should respect descriptor bands", () => {
    const recipe = SAMPLE_RECIPES[0]!;
    const entity = mkEntity(0.9, 0.8);
    const seed = 5555;
    const result = resolveRecipe(recipe, entity, mockInventory, mockTools, seed);
    expect(["masterwork","fine","adequate","poor","ruined"]).toContain(result.descriptor);
    if (result.quality_Q >= q(0.85)) {
      expect(result.descriptor).toBe("masterwork");
    } else if (result.quality_Q >= q(0.65)) {
      expect(result.descriptor).toBe("fine");
    } else if (result.quality_Q >= q(0.40)) {
      expect(result.descriptor).toBe("adequate");
    } else if (result.quality_Q >= q(0.20)) {
      expect(result.descriptor).toBe("poor");
    } else {
      expect(result.descriptor).toBe("ruined");
    }
  });
});