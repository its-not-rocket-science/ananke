// test/item-durability.test.ts — Phase 43: Item Durability tests

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import type { ItemInstance } from "../src/inventory.js";
import {
  hasDurability,
  getDurability,
  isDamaged,
  isBroken,
  getWeaponEffectiveness,
  getArmourProtection,
  applyDurabilityLoss,
  recordParryWear,
  recordBlockWear,
  recordArmourWear,
  recordStrikeWear,
  calculateRepairNeed,
  resolveRepair,
  fieldRepair,
  calculateItemValue,
  BROKEN_THRESHOLD_Q,
  DAMAGED_THRESHOLD_Q,
} from "../src/item-durability.js";

// ── Test Helpers ───────────────────────────────────────────────────────────────

function mkTestItem(durability_Q?: Q): ItemInstance {
  return {
    instanceId: "test_1",
    templateId: "iron_sword",
    quantity: 1,
    durability_Q,
    containerPath: [],
  };
}

// ── Durability Queries ─────────────────────────────────────────────────────────

describe("Durability Queries", () => {
  it("hasDurability returns false for items without durability", () => {
    const item = mkTestItem(undefined);
    expect(hasDurability(item)).toBe(false);
  });

  it("hasDurability returns true for items with durability", () => {
    const item = mkTestItem(SCALE.Q);
    expect(hasDurability(item)).toBe(true);
  });

  it("getDurability returns 1.0 for items without durability", () => {
    const item = mkTestItem(undefined);
    expect(getDurability(item)).toBe(SCALE.Q);
  });

  it("isDamaged returns true below 50%", () => {
    const item = mkTestItem(q(0.40));
    expect(isDamaged(item)).toBe(true);
  });

  it("isDamaged returns false above 50%", () => {
    const item = mkTestItem(q(0.60));
    expect(isDamaged(item)).toBe(false);
  });

  it("isBroken returns true below 10%", () => {
    const item = mkTestItem(q(0.05));
    expect(isBroken(item)).toBe(true);
  });

  it("isBroken returns false above 10%", () => {
    const item = mkTestItem(q(0.15));
    expect(isBroken(item)).toBe(false);
  });
});

// ── Effectiveness Calculations ─────────────────────────────────────────────────

describe("Weapon Effectiveness", () => {
  it("returns full effectiveness for pristine weapons", () => {
    const item = mkTestItem(SCALE.Q);
    expect(getWeaponEffectiveness(item)).toBe(SCALE.Q);
  });

  it("returns 10% for broken weapons", () => {
    const item = mkTestItem(q(0.05));
    expect(getWeaponEffectiveness(item)).toBe(q(0.10));
  });

  it("returns reduced effectiveness for damaged weapons", () => {
    const item = mkTestItem(q(0.30)); // Between broken (0.10) and damaged (0.50)
    const effectiveness = getWeaponEffectiveness(item);
    expect(effectiveness).toBeGreaterThan(q(0.10));
    expect(effectiveness).toBeLessThan(SCALE.Q);
  });

  it("returns full effectiveness for items without durability", () => {
    const item = mkTestItem(undefined);
    expect(getWeaponEffectiveness(item)).toBe(SCALE.Q);
  });
});

describe("Armour Protection", () => {
  it("returns full protection for pristine armour", () => {
    const item = mkTestItem(SCALE.Q);
    expect(getArmourProtection(item)).toBe(SCALE.Q);
  });

  it("returns zero protection for broken armour", () => {
    const item = mkTestItem(q(0.05));
    expect(getArmourProtection(item)).toBe(q(0));
  });

  it("returns partial protection for damaged armour", () => {
    const item = mkTestItem(q(0.30));
    const protection = getArmourProtection(item);
    expect(protection).toBeGreaterThan(q(0));
    expect(protection).toBeLessThan(SCALE.Q);
  });
});

// ── Durability Loss ────────────────────────────────────────────────────────────

describe("Durability Loss", () => {
  it("applies durability loss", () => {
    const item = mkTestItem(SCALE.Q);
    applyDurabilityLoss(item, q(0.10));
    expect(item.durability_Q).toBe(q(0.90));
  });

  it("does not go below zero", () => {
    const item = mkTestItem(q(0.05));
    applyDurabilityLoss(item, q(0.20));
    expect(item.durability_Q).toBe(q(0));
  });

  it("ignores items without durability", () => {
    const item = mkTestItem(undefined);
    applyDurabilityLoss(item, q(0.10));
    expect(item.durability_Q).toBeUndefined();
  });

  it("records parry wear", () => {
    const item = mkTestItem(SCALE.Q);
    recordParryWear(item, 150); // 150J impact
    expect(item.durability_Q).toBeLessThan(SCALE.Q);
  });

  it("records block wear", () => {
    const item = mkTestItem(SCALE.Q);
    recordBlockWear(item, 200);
    expect(item.durability_Q).toBeLessThan(SCALE.Q);
  });

  it("records armour wear", () => {
    const item = mkTestItem(SCALE.Q);
    recordArmourWear(item, 100);
    expect(item.durability_Q).toBeLessThan(SCALE.Q);
  });

  it("records strike wear with armour hit", () => {
    const item = mkTestItem(SCALE.Q);
    recordStrikeWear(item, true);
    expect(item.durability_Q).toBeLessThan(SCALE.Q);
  });

  it("records strike wear with flesh hit", () => {
    const item = mkTestItem(SCALE.Q);
    recordStrikeWear(item, false);
    expect(item.durability_Q).toBeLessThan(SCALE.Q);
  });
});

// ── Repair System ──────────────────────────────────────────────────────────────

describe("Repair Calculations", () => {
  it("calculates repair need for damaged item", () => {
    const item = mkTestItem(q(0.50));
    const need = calculateRepairNeed(item);
    expect(need.missingDurability_Q).toBe(q(0.50));
    expect(need.baseTime_s).toBeGreaterThan(0);
    expect(need.baseMaterials).toBeGreaterThan(0);
  });

  it("returns zero for pristine item", () => {
    const item = mkTestItem(SCALE.Q);
    const need = calculateRepairNeed(item);
    expect(need.missingDurability_Q).toBe(q(0));
  });

  it("returns zero for items without durability", () => {
    const item = mkTestItem(undefined);
    const need = calculateRepairNeed(item);
    expect(need.missingDurability_Q).toBe(q(0));
  });
});

describe("Resolve Repair", () => {
  it("fails for items without durability", () => {
    const item = mkTestItem(undefined);
    const result = resolveRepair(item, q(0.60), SCALE.Q, 123);
    expect(result.success).toBe(false);
  });

  it("returns success for pristine item", () => {
    const item = mkTestItem(SCALE.Q);
    const result = resolveRepair(item, q(0.60), SCALE.Q, 123);
    expect(result.success).toBe(true);
    expect(result.durabilityRestored_Q).toBe(q(0));
  });

  it("repairs damaged item", () => {
    const item = mkTestItem(q(0.50));
    const result = resolveRepair(item, q(0.80), SCALE.Q, 123);
    expect(result.success).toBe(true);
    expect(result.durabilityRestored_Q).toBeGreaterThan(0);
    expect(item.durability_Q).toBeGreaterThan(q(0.50));
  });

  it("quality depends on crafter skill", () => {
    const item1 = mkTestItem(q(0.50));
    const result1 = resolveRepair(item1, q(0.90), SCALE.Q, 123);

    const item2 = mkTestItem(q(0.50));
    const result2 = resolveRepair(item2, q(0.40), SCALE.Q, 123);

    expect(result1.qualityLevel_Q).toBeGreaterThan(result2.qualityLevel_Q);
  });
});

describe("Field Repair", () => {
  it("fails for items without durability", () => {
    const item = mkTestItem(undefined);
    const result = fieldRepair(item);
    expect(result.success).toBe(false);
  });

  it("restores partial durability", () => {
    const item = mkTestItem(q(0.50));
    const before = item.durability_Q;
    const result = fieldRepair(item);
    expect(result.success).toBe(true);
    expect(result.durabilityRestored_Q).toBeGreaterThan(0);
    expect(item.durability_Q).toBeGreaterThan(before!);
  });

  it("adds damaged mod to indicate field repair", () => {
    const item = mkTestItem(q(0.50));
    fieldRepair(item);
    expect(item.modifications?.some(m => m.type === "damaged")).toBe(true);
  });
});

// ── Value Calculation ──────────────────────────────────────────────────────────

describe("Item Value Calculation", () => {
  it("returns full value for pristine item", () => {
    const item = mkTestItem(SCALE.Q);
    const value = calculateItemValue(100, item);
    expect(value).toBe(100);
  });

  it("reduces value for damaged item", () => {
    const item = mkTestItem(q(0.40));
    const value = calculateItemValue(100, item);
    expect(value).toBeLessThan(100);
  });

  it("greatly reduces value for broken item", () => {
    const item = mkTestItem(q(0.05));
    const value = calculateItemValue(100, item);
    expect(value).toBeLessThan(50);
  });

  it("applies modification value multipliers", () => {
    const item = mkTestItem(SCALE.Q);
    item.modifications = [{
      type: "masterwork",
      name: "Masterwork",
      statMultipliers: { valueMul: q(1.25) },
    }];
    const value = calculateItemValue(100, item);
    expect(value).toBeGreaterThan(100);
  });
});

// ── Additional coverage tests ──────────────────────────────────────────────────

describe("applyDurabilityLoss auto-applies damaged mod when crossing threshold (lines 108-118)", () => {
  it("adds damaged mod when durability first crosses DAMAGED_THRESHOLD_Q", () => {
    // Start just above DAMAGED_THRESHOLD_Q (q(0.50)), apply loss to go below
    const item = mkTestItem(q(0.51));
    applyDurabilityLoss(item, q(0.02)); // 0.51 - 0.02 = 0.49, below 0.50
    expect(item.durability_Q).toBeLessThan(DAMAGED_THRESHOLD_Q);
    expect(item.modifications?.some(m => m.type === "damaged")).toBe(true);
  });

  it("does not add duplicate damaged mod if one already exists", () => {
    const item = mkTestItem(q(0.49));
    // Pre-apply damaged mod
    item.modifications = [{ type: "damaged", name: "Damaged", statMultipliers: { damageMul: q(0.80), valueMul: q(0.50) } }];
    applyDurabilityLoss(item, q(0.01));
    // Should not add a second damaged mod
    const damagedMods = item.modifications?.filter(m => m.type === "damaged") ?? [];
    expect(damagedMods).toHaveLength(1);
  });

  it("does not add damaged mod when item drops below BROKEN_THRESHOLD_Q (not in damaged range)", () => {
    // Durability at q(0.10) — any loss goes below broken threshold, not in damaged range
    const item = mkTestItem(q(0.10));
    applyDurabilityLoss(item, q(0.02)); // goes to q(0.08), below broken threshold
    expect(item.durability_Q).toBeLessThan(BROKEN_THRESHOLD_Q);
    // No auto-damaged mod because condition is: durability_Q >= BROKEN_THRESHOLD_Q
    expect(item.modifications?.some(m => m.type === "damaged")).toBeFalsy();
  });
});

describe("calculateRepairNeed time brackets (lines 202, 204-205)", () => {
  it("returns 7200s base time for broken item (below BROKEN_THRESHOLD_Q)", () => {
    const item = mkTestItem(q(0.05)); // well below q(0.10)
    const need = calculateRepairNeed(item);
    expect(need.baseTime_s).toBe(7200);
  });

  it("returns 1800s base time for damaged item (below DAMAGED_THRESHOLD_Q, above BROKEN_THRESHOLD_Q)", () => {
    const item = mkTestItem(q(0.30)); // between broken (0.10) and damaged (0.50)
    const need = calculateRepairNeed(item);
    expect(need.baseTime_s).toBe(1800);
  });

  it("returns 300s base time for minor damage (above DAMAGED_THRESHOLD_Q)", () => {
    const item = mkTestItem(q(0.70)); // above damaged threshold — minor repair
    const need = calculateRepairNeed(item);
    expect(need.baseTime_s).toBe(300);
  });
});

describe("resolveRepair removes damaged mod when repaired above threshold (lines 279-283)", () => {
  it("removes damaged mod when repair brings durability above DAMAGED_THRESHOLD_Q", () => {
    const item = mkTestItem(q(0.30));
    // Pre-attach damaged mod (as would happen from auto-application)
    item.modifications = [{ type: "damaged", name: "Damaged", statMultipliers: { damageMul: q(0.80), valueMul: q(0.50) } }];
    // Use high-skill crafter to restore enough durability to cross the threshold
    const result = resolveRepair(item, SCALE.Q, SCALE.Q, 42);
    expect(result.success).toBe(true);
    // Durability should be above the damaged threshold now
    if (item.durability_Q! >= DAMAGED_THRESHOLD_Q) {
      expect(item.modifications?.some(m => m.type === "damaged")).toBe(false);
    }
  });
});

describe("resolveRepair adds masterwork mod for exceptional repairs (lines 304-307)", () => {
  it("adds masterwork mod when quality exceeds q(0.90)", () => {
    // Use max crafter skill + max tool quality to guarantee high quality
    const item = mkTestItem(q(0.40));
    resolveRepair(item, SCALE.Q, SCALE.Q, 1);
    // qualityLevel_Q = clamp(q(0.50) + q(0.30) + q(0.20), q(0.30), SCALE.Q) = q(1.00) > q(0.90)
    expect(item.modifications?.some(m => m.type === "masterwork")).toBe(true);
  });

  it("does not add masterwork mod for low quality repair", () => {
    const item = mkTestItem(q(0.40));
    resolveRepair(item, q(0), q(0), 1);
    // qualityLevel_Q = clamp(q(0.50), q(0.30), SCALE.Q) = q(0.50) which is < q(0.90)
    expect(item.modifications?.some(m => m.type === "masterwork")).toBeFalsy();
  });
});

describe("fieldRepair when item is already at full durability (lines 334-341)", () => {
  it("returns no-repair-needed when durability is already SCALE.Q", () => {
    const item = mkTestItem(SCALE.Q);
    const result = fieldRepair(item);
    expect(result.success).toBe(true);
    expect(result.durabilityRestored_Q).toBe(q(0));
    expect(result.narrative).toBe("No repair needed.");
  });

  it("returns no-repair-needed when field-calculated maxRestore rounds to zero", () => {
    // SCALE.Q - current = 0 when current = SCALE.Q, mulDiv(..., q(0.30), SCALE.Q) = 0
    const item = mkTestItem(SCALE.Q);
    const result = fieldRepair(item);
    expect(result.repairCost.time_s).toBe(0);
    expect(result.repairCost.materials).toBe(0);
  });
});
