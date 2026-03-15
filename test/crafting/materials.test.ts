// test/crafting/materials.test.ts — Phase 61: Material Catalog Tests

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../../src/units";
import {
  MATERIAL_TYPES,
  deriveMaterialQuality,
  calculateMaterialEffect,
  getMaterialTypeById,
  createMaterialItem,
  type Material,
} from "../../src/crafting/materials";
import type { ItemBase } from "../../src/equipment";

describe("Material Catalog", () => {
  it("should have defined material types", () => {
    expect(MATERIAL_TYPES.length).toBeGreaterThan(0);
    const iron = MATERIAL_TYPES.find(m => m.id === "iron");
    expect(iron).toBeDefined();
    expect(iron?.name).toBe("Iron");
    expect(iron?.density_kgPerM3).toBeGreaterThan(0);
    expect(iron?.strength_Q).toBeGreaterThan(0);
    expect(iron?.baseQualityRange.min_Q).toBeLessThanOrEqual(iron?.baseQualityRange.max_Q!);
  });

  it("should retrieve material type by ID", () => {
    const steel = getMaterialTypeById("steel");
    expect(steel).toBeDefined();
    expect(steel?.id).toBe("steel");
    expect(steel?.strength_Q).toBeGreaterThan(q(0.80));
  });

  it("should generate deterministic material quality within range", () => {
    const iron = getMaterialTypeById("iron")!;
    const seed = 12345;
    const quality = deriveMaterialQuality(iron, seed);
    expect(quality).toBeGreaterThanOrEqual(iron.baseQualityRange.min_Q);
    expect(quality).toBeLessThanOrEqual(iron.baseQualityRange.max_Q);
    // Same seed → same quality
    const quality2 = deriveMaterialQuality(iron, seed);
    expect(quality).toBe(quality2);
    // Different seed → likely different (not guaranteed but acceptable)
    const quality3 = deriveMaterialQuality(iron, seed + 1);
    // at least still within range
    expect(quality3).toBeGreaterThanOrEqual(iron.baseQualityRange.min_Q);
    expect(quality3).toBeLessThanOrEqual(iron.baseQualityRange.max_Q);
  });

  it("should create material item", () => {
    const material: Material = createMaterialItem("iron", q(0.75), q(5.0), "iron_ingot_1", "Iron Ingot");
    expect(material.kind).toBe("material");
    expect(material.materialTypeId).toBe("iron");
    expect(material.quality_Q).toBe(q(0.75));
    expect(material.quantity_kg).toBe(q(5.0));
    expect(material.id).toBe("iron_ingot_1");
    expect(material.name).toContain("Iron");
  });

  it("should calculate material effect modifiers", () => {
    const material: Material = {
      id: "test_steel",
      kind: "material",
      name: "Steel Bar",
      mass_kg: Math.round(10 * SCALE.kg),
      bulk: q(1.0),
      materialTypeId: "steel",
      quality_Q: q(0.80),
      quantity_kg: q(10.0),
    };
    const baseItem: ItemBase = {
      id: "test_weapon",
      name: "Test Weapon",
      mass_kg: Math.round(2 * SCALE.kg),
      bulk: q(1.5),
    };
    const modifiers = calculateMaterialEffect(baseItem, material);
    // Should have some modifiers
    expect(modifiers).toHaveProperty("durabilityMul");
    expect(modifiers).toHaveProperty("damageMul");
    expect(modifiers).toHaveProperty("weightMul");
    expect(modifiers).toHaveProperty("valueMul");
    // Modifiers should be within reasonable bounds
    if (modifiers.durabilityMul) {
      expect(modifiers.durabilityMul).toBeGreaterThanOrEqual(q(0.50));
      expect(modifiers.durabilityMul).toBeLessThanOrEqual(q(1.50));
    }
    if (modifiers.damageMul) {
      expect(modifiers.damageMul).toBeGreaterThanOrEqual(q(0.70));
      expect(modifiers.damageMul).toBeLessThanOrEqual(q(1.30));
    }
    if (modifiers.weightMul) {
      expect(modifiers.weightMul).toBeGreaterThanOrEqual(q(0.50));
      expect(modifiers.weightMul).toBeLessThanOrEqual(q(2.00));
    }
    if (modifiers.valueMul) {
      expect(modifiers.valueMul).toBeGreaterThanOrEqual(q(0.80));
      expect(modifiers.valueMul).toBeLessThanOrEqual(q(2.00));
    }
  });

  it("should handle unknown material type gracefully", () => {
    const material: Material = {
      id: "unknown",
      kind: "material",
      name: "Unknown",
      mass_kg: Math.round(1 * SCALE.kg),
      bulk: q(1.0),
      materialTypeId: "nonexistent",
      quality_Q: q(0.50),
      quantity_kg: q(1.0),
    };
    const baseItem: ItemBase = {
      id: "item",
      name: "Item",
      mass_kg: Math.round(1 * SCALE.kg),
      bulk: q(1.0),
    };
    const modifiers = calculateMaterialEffect(baseItem, material);
    // Should return empty modifiers (no effect)
    expect(modifiers).toEqual({});
  });

  it("should respect material quality in value multiplier", () => {
    const steel = getMaterialTypeById("steel")!;
    // High quality
    const highMat: Material = createMaterialItem("steel", q(0.95), q(1), "high", "High Quality Steel");
    const highMod = calculateMaterialEffect({ id: "x", name: "x", mass_kg: 0, bulk: q(0) }, highMat);
    // Low quality
    const lowMat: Material = createMaterialItem("steel", q(0.30), q(1), "low", "Low Quality Steel");
    const lowMod = calculateMaterialEffect({ id: "x", name: "x", mass_kg: 0, bulk: q(0) }, lowMat);
    // High quality should have equal or higher value multiplier
    if (highMod.valueMul && lowMod.valueMul) {
      expect(highMod.valueMul).toBeGreaterThanOrEqual(lowMod.valueMul);
    }
  });
});