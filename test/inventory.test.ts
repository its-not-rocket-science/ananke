// test/inventory.test.ts — Phase 43: Deep Inventory & Encumbrance tests

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import type { IndividualAttributes } from "../src/types.js";
import {
  createInventory,
  createContainer,
  addContainer,
  removeContainer,
  setContainerEquipped,
  findContainer,
  addItemToContainer,
  removeItemFromContainer,
  findItem,
  moveItem,
  equipItem,
  unequipItem,
  calculateTotalEncumbrance,
  calculateMaxEncumbrance_Kg,
  getEncumbranceCategory,
  getEffectiveEncumbrancePenalties,
  applyItemMod,
  getItemStatMultiplier,
  serializeInventory,
  deserializeInventory,
} from "../src/inventory.js";
import type { ItemInstance } from "../src/inventory.js";

// ── Test Helpers ───────────────────────────────────────────────────────────────

function mkTestAttributes(peakForce_N = 1800): IndividualAttributes {
  return {
    morphology: {
      mass_kg: 75000,
      stature_m: 17500,
      reach_m: 8000,
    },
    performance: {
      peakForce_N: peakForce_N * 100, // SCALE.N = 100
      peakPower_W: 1200,
      continuousPower_W: 200,
      reserveEnergy_J: 20000,
    },
    resilience: {
      distressTolerance: q(0.70),
      fatigueRate: q(1.0),
      recoveryRate: q(1.0),
      thermalResilience: q(0.5),
    },
    motor: {
      reactionTime_s: 220000, // 220ms
      fineControl: q(0.60),
      stability: q(0.60),
    },
    cognition: {
      logicalMathematical: q(0.60),
      spatial: q(0.60),
      bodilyKinesthetic: q(0.60),
      naturalist: q(0.50),
      linguistic: q(0.65),
      interpersonal: q(0.55),
      intrapersonal: q(0.55),
      musical: q(0.50),
      existential: q(0.40),
      interSpecies: q(0.50),
    },
    languages: [],
  };
}

function mkTestItem(instanceId: string, templateId = "test_item", quantity = 1): ItemInstance {
  return {
    instanceId,
    templateId,
    quantity,
    durability_Q: SCALE.Q,
    containerPath: [],
  };
}

// ── Inventory Creation ─────────────────────────────────────────────────────────

describe("Inventory Creation", () => {
  it("creates empty inventory", () => {
    const inv = createInventory(1);
    expect(inv.ownerId).toBe(1);
    expect(inv.containers.length).toBe(0);
    expect(inv.encumbrance_Kg).toBe(0);
    expect(inv.currency).toBe(0);
  });

  it("creates container with correct properties", () => {
    const bag = createContainer("bag_1", "Leather Backpack", 20000, 2000, 50);
    expect(bag.containerId).toBe("bag_1");
    expect(bag.name).toBe("Leather Backpack");
    expect(bag.capacity_Kg).toBe(20000);
    expect(bag.emptyMass_kg).toBe(2000);
    expect(bag.volume_L).toBe(50);
    expect(bag.items.length).toBe(0);
    expect(bag.isEquipped).toBe(false);
  });
});

// ── Container Operations ───────────────────────────────────────────────────────

describe("Container Operations", () => {
  it("adds container to inventory", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);
    expect(inv.containers.length).toBe(1);
    expect(inv.containers[0]!.containerId).toBe("bag_1");
  });

  it("removes container from inventory", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);
    expect(removeContainer(inv, "bag_1")).toBe(true);
    expect(inv.containers.length).toBe(0);
  });

  it("returns false when removing non-existent container", () => {
    const inv = createInventory(1);
    expect(removeContainer(inv, "missing")).toBe(false);
  });

  it("equips and unequips container", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);

    expect(setContainerEquipped(inv, "bag_1", true)).toBe(true);
    expect(bag.isEquipped).toBe(true);

    expect(setContainerEquipped(inv, "bag_1", false)).toBe(true);
    expect(bag.isEquipped).toBe(false);
  });

  it("finds container by ID", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);

    const found = findContainer(inv, "bag_1");
    expect(found).toBeDefined();
    expect(found!.name).toBe("Backpack");

    expect(findContainer(inv, "missing")).toBeUndefined();
  });
});

// ── Item Operations ────────────────────────────────────────────────────────────

describe("Item Operations", () => {
  it("adds item to container", () => {
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    const sword = mkTestItem("sword_1", "iron_sword");

    const result = addItemToContainer(bag, sword);
    expect(result.success).toBe(true);
    expect(bag.items.length).toBe(1);
    expect(bag.items[0]!.instanceId).toBe("sword_1");
  });

  it("rejects item that exceeds capacity", () => {
    const bag = createContainer("bag_1", "Small Pouch", 1000, 100); // 1kg capacity
    const heavyItem: ItemInstance = {
      instanceId: "heavy_1",
      templateId: "anvil",
      quantity: 5000, // 5kg worth
      containerPath: [],
    };

    const result = addItemToContainer(bag, heavyItem);
    expect(result.success).toBe(false);
    expect(result.reason).toBe("exceeds_capacity");
  });

  it("removes item from container", () => {
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    const sword = mkTestItem("sword_1", "iron_sword");
    addItemToContainer(bag, sword);

    const removed = removeItemFromContainer(bag, "sword_1");
    expect(removed).toBeDefined();
    expect(removed!.instanceId).toBe("sword_1");
    expect(bag.items.length).toBe(0);
  });

  it("returns undefined when removing non-existent item", () => {
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    expect(removeItemFromContainer(bag, "missing")).toBeUndefined();
  });

  it("finds item in inventory", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);

    const sword = mkTestItem("sword_1", "iron_sword");
    addItemToContainer(bag, sword);

    const found = findItem(inv, "sword_1");
    expect(found).toBeDefined();
    expect(found!.item.instanceId).toBe("sword_1");
    expect(found!.container).toBe(bag);
  });

  it("moves item between containers", () => {
    const inv = createInventory(1);
    const bag1 = createContainer("bag_1", "Backpack", 20000, 2000);
    const bag2 = createContainer("bag_2", "Pouch", 10000, 500);
    addContainer(inv, bag1);
    addContainer(inv, bag2);

    const sword = mkTestItem("sword_1", "iron_sword");
    addItemToContainer(bag1, sword);

    const result = moveItem(inv, "sword_1", "bag_1", "bag_2");
    expect(result.success).toBe(true);
    expect(bag1.items.length).toBe(0);
    expect(bag2.items.length).toBe(1);
  });
});

// ── Equipment Operations ───────────────────────────────────────────────────────

describe("Equipment Operations", () => {
  it("equips item to slot", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);
    setContainerEquipped(inv, "bag_1", true);

    const sword = mkTestItem("sword_1", "iron_sword");
    addItemToContainer(bag, sword);

    const result = equipItem(inv, "sword_1", "mainHand");
    expect(result.success).toBe(true);
    expect(inv.equipped.mainHand).toBeDefined();
    expect(inv.equipped.mainHand!.instanceId).toBe("sword_1");
    expect(bag.items.length).toBe(0);
  });

  it("stores previous item when equipping new one", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);
    setContainerEquipped(inv, "bag_1", true);

    const sword1 = mkTestItem("sword_1", "iron_sword");
    const sword2 = mkTestItem("sword_2", "steel_sword");
    addItemToContainer(bag, sword1);
    addItemToContainer(bag, sword2);

    equipItem(inv, "sword_1", "mainHand");
    equipItem(inv, "sword_2", "mainHand");

    expect(inv.equipped.mainHand!.instanceId).toBe("sword_2");
    // Previous item should be in container
    expect(bag.items.some(i => i.instanceId === "sword_1")).toBe(true);
  });

  it("unequips item to container", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);
    setContainerEquipped(inv, "bag_1", true);

    const sword = mkTestItem("sword_1", "iron_sword");
    addItemToContainer(bag, sword);
    equipItem(inv, "sword_1", "mainHand");

    const result = unequipItem(inv, "mainHand");
    expect(result.success).toBe(true);
    expect(inv.equipped.mainHand).toBeUndefined();
    expect(bag.items.length).toBe(1);
  });
});

// ── Encumbrance Calculations ───────────────────────────────────────────────────

describe("Encumbrance Calculations", () => {
  it("calculates max encumbrance from strength", () => {
    const attrs = mkTestAttributes(1800); // 1800N peak force
    const maxKg = calculateMaxEncumbrance_Kg(attrs);
    expect(maxKg).toBeGreaterThan(0);

    // Stronger character should have higher capacity
    const strongAttrs = mkTestAttributes(2500);
    const strongMaxKg = calculateMaxEncumbrance_Kg(strongAttrs);
    expect(strongMaxKg).toBeGreaterThan(maxKg);
  });

  it("calculates total encumbrance from equipped items", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);
    setContainerEquipped(inv, "bag_1", true);

    const sword = mkTestItem("sword_1", "iron_sword");
    sword.quantity = 1000; // 1kg
    addItemToContainer(bag, sword);

    const enc = calculateTotalEncumbrance(inv);
    // Should include container empty mass + item mass
    expect(enc).toBeGreaterThanOrEqual(bag.emptyMass_kg + 1000);
  });

  it("returns unencumbered for light load", () => {
    const inv = createInventory(1);
    inv.encumbrance_Kg = 1000; // 1kg
    inv.maxEncumbrance_Kg = 50000; // 50kg max

    const cat = getEncumbranceCategory(inv);
    expect(cat.category).toBe("unencumbered");
  });

  it("returns overloaded for exceeding max", () => {
    const inv = createInventory(1);
    inv.encumbrance_Kg = 60000; // 60kg
    inv.maxEncumbrance_Kg = 50000; // 50kg max

    const cat = getEncumbranceCategory(inv);
    expect(cat.category).toBe("overloaded");
    expect(cat.penalties.noMove).toBe(true);
  });

  it("returns correct category for medium load", () => {
    const inv = createInventory(1);
    inv.maxEncumbrance_Kg = 50000; // 50kg max
    inv.encumbrance_Kg = 30000; // 30kg (60% of max)

    const cat = getEncumbranceCategory(inv);
    expect(cat.category).toBe("medium");
    expect(cat.penalties.speedMul).toBe(q(0.90));
  });

  it("calculates effective penalties with fine control reduction", () => {
    const inv = createInventory(1);
    inv.maxEncumbrance_Kg = 50000;
    inv.encumbrance_Kg = 30000; // medium load

    const result = getEffectiveEncumbrancePenalties(inv, q(0.60));
    expect(result.category).toBe("medium");
    expect(result.effectiveFineControl).toBeLessThan(q(0.60));
  });
});

// ── Item Modifications ─────────────────────────────────────────────────────────

describe("Item Modifications", () => {
  it("applies modification to item", () => {
    const item = mkTestItem("sword_1", "iron_sword");

    applyItemMod(item, {
      type: "sharpened",
      name: "Sharpened",
      statMultipliers: {
        damageMul: q(1.10),
        valueMul: q(1.15),
      },
    });

    expect(item.modifications).toBeDefined();
    expect(item.modifications!.length).toBe(1);
    expect(item.modifications![0]!.type).toBe("sharpened");
  });

  it("calculates cumulative stat multiplier from mods", () => {
    const item = mkTestItem("sword_1", "iron_sword");

    applyItemMod(item, {
      type: "sharpened",
      name: "Sharpened",
      statMultipliers: { damageMul: q(1.10) },
    });

    applyItemMod(item, {
      type: "masterwork",
      name: "Masterwork",
      statMultipliers: { damageMul: q(1.05) },
    });

    const mult = getItemStatMultiplier(item, "damageMul");
    // 1.10 * 1.05 = 1.155 ≈ 11550 in Q units
    expect(mult).toBeGreaterThan(q(1.15));
  });

  it("returns 1.0 for items without modifications", () => {
    const item = mkTestItem("sword_1", "iron_sword");
    const mult = getItemStatMultiplier(item, "damageMul");
    expect(mult).toBe(SCALE.Q);
  });
});

// ── Serialization ──────────────────────────────────────────────────────────────

describe("Serialization", () => {
  it("serializes and deserializes inventory", () => {
    const inv = createInventory(42);
    inv.currency = 100;

    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);
    setContainerEquipped(inv, "bag_1", true);

    const sword = mkTestItem("sword_1", "iron_sword", 1);
    sword.durability_Q = q(0.85);
    addItemToContainer(bag, sword);

    const serialized = serializeInventory(inv);
    const restored = deserializeInventory(serialized);

    expect(restored.ownerId).toBe(42);
    expect(restored.currency).toBe(100);
    expect(restored.containers.length).toBe(1);
    expect(restored.containers[0]!.containerId).toBe("bag_1");
    expect(restored.containers[0]!.items[0]!.instanceId).toBe("sword_1");
    expect(restored.containers[0]!.items[0]!.durability_Q).toBe(q(0.85));
  });

  it("handles empty inventory serialization", () => {
    const inv = createInventory(1);
    const serialized = serializeInventory(inv);
    const restored = deserializeInventory(serialized);

    expect(restored.ownerId).toBe(1);
    expect(restored.containers.length).toBe(0);
    expect(restored.encumbrance_Kg).toBe(0);
  });
});
