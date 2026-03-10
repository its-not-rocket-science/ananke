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
