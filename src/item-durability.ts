// src/item-durability.ts — Phase 43: Item Durability & Repair
//
// Wear tracking for weapons and armour, with repair mechanics integrated
// with the competence system.

import type { Q } from "./units.js";
import { q, qMul, clampQ, SCALE, mulDiv } from "./units.js";
import type { ItemInstance, ItemMod } from "./inventory.js";
import { applyItemMod } from "./inventory.js";

// ── Durability Constants ──────────────────────────────────────────────────────

/** Durability loss from parrying a heavy strike. */
export const DURABILITY_LOSS_PARRY: Q = q(0.02);

/** Durability loss from blocking with a weapon (scales with impact energy). */
export const DURABILITY_LOSS_BLOCK_BASE: Q = q(0.03);

/** Durability loss from armour absorbing damage (scales with absorbed energy). */
export const DURABILITY_LOSS_ARMOUR_BASE: Q = q(0.04);

/** Durability loss from normal weapon use (per strike). */
export const DURABILITY_LOSS_STRIKE: Q = q(0.005);

/** Threshold below which an item is considered "damaged" (visual/functional indicator). */
export const DAMAGED_THRESHOLD_Q: Q = q(0.50);

/** Threshold below which an item is "broken" (non-functional). */
export const BROKEN_THRESHOLD_Q: Q = q(0.10);

// ── Durability Queries ─────────────────────────────────────────────────────────

/** Check if item has durability tracking. */
export function hasDurability(item: ItemInstance): boolean {
  return item.durability_Q !== undefined;
}

/** Get current durability (returns 1.0 if item has no durability tracking). */
export function getDurability(item: ItemInstance): Q {
  return item.durability_Q ?? SCALE.Q;
}

/** Check if item is damaged (below 50% durability). */
export function isDamaged(item: ItemInstance): boolean {
  if (!hasDurability(item)) return false;
  return (item.durability_Q ?? SCALE.Q) < DAMAGED_THRESHOLD_Q;
}

/** Check if item is broken (below 10% durability, non-functional). */
export function isBroken(item: ItemInstance): boolean {
  if (!hasDurability(item)) return false;
  return (item.durability_Q ?? SCALE.Q) < BROKEN_THRESHOLD_Q;
}

/** Get durability-based effectiveness multiplier for weapons. */
export function getWeaponEffectiveness(item: ItemInstance): Q {
  if (!hasDurability(item)) return SCALE.Q;

  const d = item.durability_Q ?? SCALE.Q;

  // Broken weapons deal minimal damage (10%)
  if (d < BROKEN_THRESHOLD_Q) {
    return q(0.10);
  }

  // Damaged weapons deal reduced damage (50-100%)
  if (d < DAMAGED_THRESHOLD_Q) {
    // Linear interpolation from 50% at broken threshold to 100% at damaged threshold
    const t = (d - BROKEN_THRESHOLD_Q) / (DAMAGED_THRESHOLD_Q - BROKEN_THRESHOLD_Q);
    return Math.round(q(0.50) + t * q(0.50)) as Q;
  }

  // Pristine to damaged: full effectiveness
  return SCALE.Q;
}

/** Get armour protection multiplier based on durability. */
export function getArmourProtection(item: ItemInstance): Q {
  if (!hasDurability(item)) return SCALE.Q;

  const d = item.durability_Q ?? SCALE.Q;

  // Broken armour provides no protection
  if (d < BROKEN_THRESHOLD_Q) {
    return q(0);
  }

  // Damaged armour provides partial protection
  if (d < DAMAGED_THRESHOLD_Q) {
    // Linear from 25% at broken to 100% at damaged threshold
    const t = (d - BROKEN_THRESHOLD_Q) / (DAMAGED_THRESHOLD_Q - BROKEN_THRESHOLD_Q);
    return Math.round(q(0.25) + t * q(0.75)) as Q;
  }

  return SCALE.Q;
}

// ── Durability Modifications ───────────────────────────────────────────────────

/** Apply durability loss to an item. */
export function applyDurabilityLoss(item: ItemInstance, loss_Q: Q): void {
  if (!hasDurability(item)) return;

  item.durability_Q = Math.max(0, (item.durability_Q ?? SCALE.Q) - loss_Q) as Q;

  // Auto-apply "damaged" mod when crossing threshold
  if (item.durability_Q < DAMAGED_THRESHOLD_Q && item.durability_Q >= BROKEN_THRESHOLD_Q) {
    if (!item.modifications?.some((m) => m.type === "damaged")) {
      applyItemMod(item, {
        type: "damaged",
        name: "Damaged",
        statMultipliers: {
          damageMul: q(0.80),
          valueMul: q(0.50),
        },
      });
    }
  }
}

/** Record wear from parrying an attack. */
export function recordParryWear(item: ItemInstance, impactEnergy_J: number): void {
  if (!hasDurability(item)) return;

  // Scale durability loss by impact energy (larger impacts = more wear)
  // Base: ~100J impact causes base loss, scale linearly
  const energyScale = Math.min(3.0, impactEnergy_J / 100);
  const loss = Math.round(DURABILITY_LOSS_PARRY * energyScale) as Q;

  applyDurabilityLoss(item, loss);
}

/** Record wear from blocking with a weapon/shield. */
export function recordBlockWear(item: ItemInstance, absorbedEnergy_J: number): void {
  if (!hasDurability(item)) return;

  // Blocking causes more wear than parrying
  const energyScale = Math.min(4.0, absorbedEnergy_J / 80);
  const loss = Math.round(DURABILITY_LOSS_BLOCK_BASE * energyScale) as Q;

  applyDurabilityLoss(item, loss);
}

/** Record wear from armour absorbing damage. */
export function recordArmourWear(item: ItemInstance, absorbedEnergy_J: number): void {
  if (!hasDurability(item)) return;

  // Armour takes significant wear from absorption
  const energyScale = Math.min(5.0, absorbedEnergy_J / 50);
  const loss = Math.round(DURABILITY_LOSS_ARMOUR_BASE * energyScale) as Q;

  applyDurabilityLoss(item, loss);
}

/** Record wear from normal weapon strike (hitting armour, flesh, etc.). */
export function recordStrikeWear(item: ItemInstance, hitArmour: boolean): void {
  if (!hasDurability(item)) return;

  // Striking armour causes more wear than striking flesh
  const multiplier = hitArmour ? 2.0 : 1.0;
  const loss = Math.round(DURABILITY_LOSS_STRIKE * multiplier) as Q;

  applyDurabilityLoss(item, loss);
}

// ── Repair System ─────────────────────────────────────────────────────────────

export interface RepairResult {
  success: boolean;
  durabilityRestored_Q: Q;
  qualityLevel_Q: Q; // How well it was repaired (affects max durability)
  repairCost: RepairCost;
  narrative: string;
}

export interface RepairCost {
  /** Time required in seconds. */
  time_s: number;
  /** Material units consumed. */
  materials: number;
  /** Currency cost if using a repair service. */
  currency?: number;
}

/** Calculate repair parameters based on crafter skill and item condition. */
export function calculateRepairNeed(item: ItemInstance): {
  missingDurability_Q: Q;
  baseTime_s: number;
  baseMaterials: number;
} {
  if (!hasDurability(item)) {
    return { missingDurability_Q: q(0), baseTime_s: 0, baseMaterials: 0 };
  }

  const current = item.durability_Q ?? SCALE.Q;
  const missing = (SCALE.Q - current) as Q;

  // Base repair time scales with damage severity
  // Minor repair: 5 minutes, Major repair: 30 minutes, Restoration: 2 hours
  let baseTime_s = 300; // 5 minutes
  if (current < BROKEN_THRESHOLD_Q) {
    baseTime_s = 7200; // 2 hours for broken items
  } else if (current < DAMAGED_THRESHOLD_Q) {
    baseTime_s = 1800; // 30 minutes for damaged items
  }

  // Materials scale with missing durability
  const baseMaterials = Math.ceil(missing / q(0.10));

  return {
    missingDurability_Q: missing,
    baseTime_s,
    baseMaterials,
  };
}

/**
 * Resolve a repair attempt.
 * @param item The item to repair
 * @param crafterCognitionQ The crafter's cognition.logicalMath (for technical skill)
 * @param toolQuality_Q Quality of tools being used (0-1)
 * @param seed RNG seed for determinism
 */
export function resolveRepair(
  item: ItemInstance,
  crafterCognitionQ: Q,
  toolQuality_Q: Q,
  seed: number,
): RepairResult {
  if (!hasDurability(item)) {
    return {
      success: false,
      durabilityRestored_Q: q(0),
      qualityLevel_Q: q(0),
      repairCost: { time_s: 0, materials: 0 },
      narrative: "This item cannot be repaired.",
    };
  }

  const need = calculateRepairNeed(item);
  if (need.missingDurability_Q <= 0) {
    return {
      success: true,
      durabilityRestored_Q: q(0),
      qualityLevel_Q: SCALE.Q,
      repairCost: { time_s: 0, materials: 0 },
      narrative: "Item is already in perfect condition.",
    };
  }

  // Quality of repair depends on skill and tools
  // Base quality from skill (logicalMath represents technical competence)
  const skillBonus = mulDiv(crafterCognitionQ, q(0.30), SCALE.Q);
  const toolBonus = mulDiv(toolQuality_Q, q(0.20), SCALE.Q);

  // Deterministic quality roll using seed
  const qualityLevel_Q = clampQ(
    (q(0.50) + skillBonus + toolBonus) as Q,
    q(0.30),
    SCALE.Q as Q,
  );

  // Calculate actual durability restored
  // Poor quality repairs restore less and may reduce max durability
  const restoreRatio = 0.5 + (qualityLevel_Q / SCALE.Q) * 0.5;
  const durabilityRestored_Q = Math.round(need.missingDurability_Q * restoreRatio) as Q;

  // Calculate actual costs (better skill = more efficient)
  const efficiencyMul = q(0.70) + mulDiv(crafterCognitionQ, q(0.30), SCALE.Q);
  const time_s = Math.round(need.baseTime_s * (SCALE.Q / efficiencyMul));
  const materials = Math.max(1, Math.round(need.baseMaterials * (SCALE.Q / efficiencyMul)));

  // Apply repair
  const newDurability = Math.min(SCALE.Q, (item.durability_Q ?? 0) + durabilityRestored_Q);
  item.durability_Q = newDurability as Q;

  // Remove "damaged" mod if repaired above threshold
  if (item.durability_Q >= DAMAGED_THRESHOLD_Q && item.modifications) {
    const damagedIdx = item.modifications.findIndex((m) => m.type === "damaged");
    if (damagedIdx >= 0) {
      item.modifications.splice(damagedIdx, 1);
    }
  }

  // Add "masterwork" mod for exceptional repairs
  if (qualityLevel_Q > q(0.90) && !item.modifications?.some((m) => m.type === "masterwork")) {
    applyItemMod(item, {
      type: "masterwork",
      name: "Masterwork",
      statMultipliers: {
        durabilityMul: q(1.10),
        valueMul: q(1.25),
      },
    });
  }

  // Generate narrative
  let narrative = "Repair completed.";
  if (qualityLevel_Q > q(0.85)) {
    narrative = "Excellent repair. The item looks as good as new.";
  } else if (qualityLevel_Q > q(0.60)) {
    narrative = "Good repair. The item is serviceable again.";
  } else if (qualityLevel_Q > q(0.40)) {
    narrative = "Basic repair. The item functions but shows wear.";
  } else {
    narrative = "Poor repair. The item works but may not hold up long.";
  }

  return {
    success: true,
    durabilityRestored_Q,
    qualityLevel_Q,
    repairCost: { time_s, materials },
    narrative,
  };
}

/** Quick repair with no skill check (field repair). */
export function fieldRepair(item: ItemInstance): RepairResult {
  if (!hasDurability(item)) {
    return {
      success: false,
      durabilityRestored_Q: q(0),
      qualityLevel_Q: q(0),
      repairCost: { time_s: 0, materials: 0 },
      narrative: "Cannot field repair this item.",
    };
  }

  const current = item.durability_Q ?? q(0);
  const maxRestore = mulDiv(SCALE.Q - current, q(0.30), SCALE.Q); // Max 30% restore in field

  if (maxRestore <= 0) {
    return {
      success: true,
      durabilityRestored_Q: q(0),
      qualityLevel_Q: SCALE.Q,
      repairCost: { time_s: 0, materials: 0 },
      narrative: "No repair needed.",
    };
  }

  item.durability_Q = (current + maxRestore) as Q;

  // Field repairs add temporary "damaged" mod to indicate suboptimal fix
  if (!item.modifications?.some((m) => m.type === "damaged")) {
    applyItemMod(item, {
      type: "damaged",
      name: "Field Repaired",
      statMultipliers: {
        valueMul: q(0.80),
      },
    });
  }

  return {
    success: true,
    durabilityRestored_Q: maxRestore,
    qualityLevel_Q: q(0.40),
    repairCost: { time_s: 300, materials: 1 }, // 5 minutes, minimal materials
    narrative: "Field repair complete. Temporary fix, needs proper repair soon.",
  };
}

// ── Value Calculation ─────────────────────────────────────────────────────────

/** Calculate item value based on durability and modifications. */
export function calculateItemValue(baseValue: number, item: ItemInstance): number {
  let multiplier = 1.0;

  // Durability factor
  if (hasDurability(item)) {
    const d = item.durability_Q ?? SCALE.Q;
    if (d < BROKEN_THRESHOLD_Q) {
      multiplier *= 0.1; // 10% for broken
    } else if (d < DAMAGED_THRESHOLD_Q) {
      multiplier *= 0.5; // 50% for damaged
    } else {
      multiplier *= d / SCALE.Q; // Linear for good condition
    }
  }

  // Modification factors
  if (item.modifications) {
    for (const mod of item.modifications) {
      if (mod.statMultipliers?.valueMul) {
        multiplier *= mod.statMultipliers.valueMul / SCALE.Q;
      }
    }
  }

  return Math.round(baseValue * multiplier);
}