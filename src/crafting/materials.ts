// src/crafting/materials.ts — Phase 61: Material Catalog
//
// Material types with physical properties, and Material item kind.
// Deterministic quality generation, material property modifiers for crafted items.

import type { Q, I32 } from "../units.js";
import { SCALE, q, clampQ, qMul, mulDiv } from "../units.js";
import type { ItemBase } from "../equipment.js";
import { makeRng } from "../rng.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Physical properties of a material type. */
export interface MaterialType {
  id: string;
  name: string;
  density_kgPerM3: I32;      // kg/m³ scaled by SCALE.kg
  strength_Q: Q;             // tensile strength relative to reference
  malleability_Q: Q;         // ease of shaping (0 = brittle, 1 = very malleable)
  conductivity_Q: Q;         // thermal/electrical conductivity (0 = insulator)
  baseQualityRange: { min_Q: Q; max_Q: Q }; // natural quality variation
}

/** Material item kind extending ItemBase. */
export interface Material extends ItemBase {
  kind: "material";
  materialTypeId: string;
  quality_Q: Q;              // Quality within the type's range (0–1)
  quantity_kg: I32;          // Amount in kg (scaled by SCALE.kg)
}

/** Modifier to item stats based on material properties. */
export interface MaterialPropertyModifier {
  durabilityMul?: Q;
  damageMul?: Q;
  weightMul?: Q;
  valueMul?: Q;
  // Additional stat modifiers can be added as needed
}

// ── Material Type Catalogue ───────────────────────────────────────────────────

export const MATERIAL_TYPES: MaterialType[] = [
  {
    id: "iron",
    name: "Iron",
    density_kgPerM3: Math.round(7870 * SCALE.kg),
    strength_Q: q(0.70),
    malleability_Q: q(0.40),
    conductivity_Q: q(0.45),
    baseQualityRange: { min_Q: q(0.30), max_Q: q(0.80) },
  },
  {
    id: "steel",
    name: "Steel",
    density_kgPerM3: Math.round(7850 * SCALE.kg),
    strength_Q: q(0.90),
    malleability_Q: q(0.35),
    conductivity_Q: q(0.40),
    baseQualityRange: { min_Q: q(0.50), max_Q: q(0.95) },
  },
  {
    id: "wood",
    name: "Wood",
    density_kgPerM3: Math.round(600 * SCALE.kg),
    strength_Q: q(0.30),
    malleability_Q: q(0.60),
    conductivity_Q: q(0.10),
    baseQualityRange: { min_Q: q(0.20), max_Q: q(0.70) },
  },
  {
    id: "leather",
    name: "Leather",
    density_kgPerM3: Math.round(860 * SCALE.kg),
    strength_Q: q(0.25),
    malleability_Q: q(0.80),
    conductivity_Q: q(0.15),
    baseQualityRange: { min_Q: q(0.25), max_Q: q(0.75) },
  },
  {
    id: "bronze",
    name: "Bronze",
    density_kgPerM3: Math.round(8800 * SCALE.kg),
    strength_Q: q(0.65),
    malleability_Q: q(0.50),
    conductivity_Q: q(0.55),
    baseQualityRange: { min_Q: q(0.40), max_Q: q(0.85) },
  },
];

// ── Quality Generation ────────────────────────────────────────────────────────

/**
 * Generate deterministic material quality within a material type's range.
 * Uses seed to produce consistent quality for given inputs.
 */
export function deriveMaterialQuality(
  materialType: MaterialType,
  seed: number,
): Q {
  const rng = makeRng(seed, SCALE.Q);
  const roll = rng.q01();
  const range = materialType.baseQualityRange.max_Q - materialType.baseQualityRange.min_Q;
  return clampQ(
    Math.round(materialType.baseQualityRange.min_Q + mulDiv(range, roll, SCALE.Q)) as Q,
    materialType.baseQualityRange.min_Q,
    materialType.baseQualityRange.max_Q,
  );
}

// ── Material Property Effects ────────────────────────────────────────────────

/**
 * Calculate material effect modifiers for an item based on material properties.
 * Returns multipliers for various item stats.
 */
export function calculateMaterialEffect(
  item: ItemBase, // The base item (weapon, armour, etc.)
  material: Material, // The material used
): MaterialPropertyModifier {
  const materialType = MATERIAL_TYPES.find(mt => mt.id === material.materialTypeId);
  if (!materialType) {
    return {}; // No effect for unknown material
  }

  const qualityFactor = material.quality_Q / SCALE.Q; // 0–1
  const modifiers: MaterialPropertyModifier = {};

  // Strength affects durability and damage
  modifiers.durabilityMul = clampQ(
    Math.round(q(0.80) + mulDiv(materialType.strength_Q, q(0.40), SCALE.Q)) as Q,
    q(0.50),
    q(1.50),
  );
  modifiers.damageMul = clampQ(
    Math.round(q(0.90) + mulDiv(materialType.strength_Q, q(0.20), SCALE.Q)) as Q,
    q(0.70),
    q(1.30),
  );

  // Density affects weight
  const baseDensity = 1000; // water reference kg/m³
  const densityFactor = materialType.density_kgPerM3 / (baseDensity * SCALE.kg);
  modifiers.weightMul = clampQ(
    Math.round(densityFactor * SCALE.Q) as Q,
    q(0.50),
    q(2.00),
  );

  // Quality factor influences value
  modifiers.valueMul = clampQ(
    Math.round(q(0.80) + mulDiv(material.quality_Q, q(0.40), SCALE.Q)) as Q,
    q(0.80),
    q(2.00),
  );

  return modifiers;
}

// ── Inventory Helpers ────────────────────────────────────────────────────────

/**
 * Extract materials from inventory items that are of kind "material".
 * Returns map of materialTypeId to total quantity (kg) and average quality.
 */
export function getAvailableMaterials(
  inventory: any, // Placeholder: need proper inventory type
): Map<string, { totalKg: number; avgQuality_Q: Q }> {
  const map = new Map<string, { totalKg: number; avgQuality_Q: Q }>();
  // TODO: iterate through inventory items, filter by kind === "material"
  // For each material item, accumulate quantity and weighted quality.
  return map;
}

// ── Utility Functions ────────────────────────────────────────────────────────

/** Get material type by ID. */
export function getMaterialTypeById(id: string): MaterialType | undefined {
  return MATERIAL_TYPES.find(mt => mt.id === id);
}

/** Create a material item instance. */
export function createMaterialItem(
  materialTypeId: string,
  quality_Q: Q,
  quantity_kg: I32,
  itemId: string,
  name?: string,
): Material {
  const materialType = getMaterialTypeById(materialTypeId);
  const displayName = name ?? `${materialType?.name ?? materialTypeId} (${quality_Q})`;
  return {
    id: itemId,
    kind: "material",
    name: displayName,
    mass_kg: Math.round(quantity_kg * SCALE.kg), // mass = quantity * density? Actually quantity is already mass.
    bulk: q(1.0), // placeholder
    materialTypeId,
    quality_Q,
    quantity_kg,
  };
}