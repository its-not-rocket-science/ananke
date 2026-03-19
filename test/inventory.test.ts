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
  removeItemMod,
  getItemStatMultiplier,
  serializeInventory,
  deserializeInventory,
  getItemCountByTemplateId,
  findMaterialsByType,
  consumeItemsByTemplateId,
  addItemToInventory,
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

// ── unequipItem extended coverage ─────────────────────────────────────────────

describe("unequipItem extended", () => {
  it("returns nothing_equipped when slot is empty", () => {
    const inv = createInventory(1);
    const result = unequipItem(inv, "mainHand");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("nothing_equipped");
  });

  it("returns no_container when no equipped container exists and no targetContainerId", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);
    // bag is NOT equipped

    const sword = mkTestItem("sword_1", "iron_sword");
    addItemToContainer(bag, sword);
    // manually place sword into equipped slot without going through equipItem
    removeItemFromContainer(bag, "sword_1");
    inv.equipped.mainHand = sword;

    const result = unequipItem(inv, "mainHand");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("no_container");
    // item should still be equipped
    expect(inv.equipped.mainHand).toBeDefined();
  });

  it("unequips to specified target container by ID", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    const pouch = createContainer("pouch_1", "Pouch", 5000, 500);
    addContainer(inv, bag);
    addContainer(inv, pouch);
    setContainerEquipped(inv, "bag_1", true);

    const sword = mkTestItem("sword_1", "iron_sword");
    addItemToContainer(bag, sword);
    equipItem(inv, "sword_1", "mainHand");

    const result = unequipItem(inv, "mainHand", "pouch_1");
    expect(result.success).toBe(true);
    expect(inv.equipped.mainHand).toBeUndefined();
    expect(pouch.items.some((i) => i.instanceId === "sword_1")).toBe(true);
  });

  it("returns no_container when targetContainerId does not exist", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);
    setContainerEquipped(inv, "bag_1", true);

    const sword = mkTestItem("sword_1", "iron_sword");
    addItemToContainer(bag, sword);
    equipItem(inv, "sword_1", "mainHand");

    const result = unequipItem(inv, "mainHand", "nonexistent_container");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("no_container");
    expect(inv.equipped.mainHand).toBeDefined();
  });

  it("returns exceeds_capacity when container is full", () => {
    const inv = createInventory(1);
    const tinyBag = createContainer("tiny_1", "Tiny Pouch", 10, 10); // 10g capacity
    addContainer(inv, tinyBag);
    setContainerEquipped(inv, "tiny_1", true);

    // Equip a heavy item manually
    const heavySword: ItemInstance = {
      instanceId: "heavy_sword",
      templateId: "iron_sword",
      quantity: 5000, // 5kg — exceeds tiny bag
      durability_Q: SCALE.Q,
      containerPath: [],
    };
    inv.equipped.mainHand = heavySword;

    const result = unequipItem(inv, "mainHand");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("exceeds_capacity");
    // Item should remain equipped
    expect(inv.equipped.mainHand).toBeDefined();
  });
});

// ── getItemCountByTemplateId ───────────────────────────────────────────────────

describe("getItemCountByTemplateId", () => {
  it("counts items across all containers", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);

    const arrow1 = mkTestItem("arrow_1", "arrow", 20);
    const arrow2 = mkTestItem("arrow_2", "arrow", 15);
    addItemToContainer(bag, arrow1);
    addItemToContainer(bag, arrow2);

    expect(getItemCountByTemplateId(inv, "arrow")).toBe(35);
  });

  it("counts equipped mainHand, offHand, body, head slots", () => {
    const inv = createInventory(1);

    inv.equipped.mainHand = mkTestItem("mh_1", "potion", 3);
    inv.equipped.offHand = mkTestItem("oh_1", "potion", 2);
    inv.equipped.body = mkTestItem("bd_1", "potion", 1);
    inv.equipped.head = mkTestItem("hd_1", "potion", 4);

    expect(getItemCountByTemplateId(inv, "potion")).toBe(10);
  });

  it("counts items in equipped.containers Map", () => {
    const inv = createInventory(1);
    const containerItem = mkTestItem("belt_pouch", "gold_coin", 50);
    inv.equipped.containers.set("belt", containerItem);

    expect(getItemCountByTemplateId(inv, "gold_coin")).toBe(50);
  });

  it("returns 0 when templateId not found", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);
    addItemToContainer(bag, mkTestItem("sword_1", "iron_sword", 1));

    expect(getItemCountByTemplateId(inv, "nonexistent")).toBe(0);
  });
});

// ── findMaterialsByType ────────────────────────────────────────────────────────

describe("findMaterialsByType", () => {
  it("finds material_ prefixed items matching the type", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);

    const ironOre = mkTestItem("ore_1", "material_iron", 5);
    const wood = mkTestItem("wood_1", "material_wood", 3);
    addItemToContainer(bag, ironOre);
    addItemToContainer(bag, wood);

    const results = findMaterialsByType(inv, "iron");
    expect(results.length).toBe(1);
    expect(results[0]!.instanceId).toBe("ore_1");
  });

  it("finds materials in equipped slots", () => {
    const inv = createInventory(1);
    inv.equipped.mainHand = mkTestItem("stone_1", "material_stone", 10);
    inv.equipped.offHand = mkTestItem("coal_1", "material_coal", 5);

    const stoneResults = findMaterialsByType(inv, "stone");
    expect(stoneResults.length).toBe(1);
    expect(stoneResults[0]!.instanceId).toBe("stone_1");
  });

  it("finds materials in equipped.containers Map", () => {
    const inv = createInventory(1);
    const matItem = mkTestItem("silk_1", "material_silk", 8);
    inv.equipped.containers.set("satchel", matItem);

    const results = findMaterialsByType(inv, "silk");
    expect(results.length).toBe(1);
    expect(results[0]!.instanceId).toBe("silk_1");
  });

  it("returns empty array when no materials match", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);
    addItemToContainer(bag, mkTestItem("sword_1", "iron_sword", 1));

    expect(findMaterialsByType(inv, "gold")).toHaveLength(0);
  });

  it("does not match non-material_ prefixed items", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);
    addItemToContainer(bag, mkTestItem("item_1", "iron_bar", 1)); // no material_ prefix

    expect(findMaterialsByType(inv, "iron")).toHaveLength(0);
  });
});

// ── consumeItemsByTemplateId ───────────────────────────────────────────────────

describe("consumeItemsByTemplateId", () => {
  it("returns true for quantity 0 without consuming anything", () => {
    const inv = createInventory(1);
    expect(consumeItemsByTemplateId(inv, "potion", 0)).toBe(true);
  });

  it("consumes items from an equipped container", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);
    setContainerEquipped(inv, "bag_1", true);

    addItemToContainer(bag, mkTestItem("potion_1", "potion", 5));

    const ok = consumeItemsByTemplateId(inv, "potion", 3);
    expect(ok).toBe(true);
    expect(bag.items[0]!.quantity).toBe(2);
  });

  it("removes item from container when quantity reaches zero", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);
    setContainerEquipped(inv, "bag_1", true);

    addItemToContainer(bag, mkTestItem("potion_1", "potion", 2));

    const ok = consumeItemsByTemplateId(inv, "potion", 2);
    expect(ok).toBe(true);
    expect(bag.items.length).toBe(0);
  });

  it("consumes from non-equipped container when equipped container lacks the item", () => {
    const inv = createInventory(1);
    const equippedBag = createContainer("bag_eq", "Equipped Bag", 20000, 2000);
    const storageBag = createContainer("bag_st", "Storage Bag", 20000, 2000);
    addContainer(inv, equippedBag);
    addContainer(inv, storageBag);
    setContainerEquipped(inv, "bag_eq", true);

    // Only storage bag has potions
    addItemToContainer(storageBag, mkTestItem("potion_1", "potion", 5));

    const ok = consumeItemsByTemplateId(inv, "potion", 3);
    expect(ok).toBe(true);
    expect(storageBag.items[0]!.quantity).toBe(2);
  });

  it("consumes from equipped item slot (mainHand) as last resort", () => {
    const inv = createInventory(1);
    // No containers — just an equipped item
    const potion = mkTestItem("potion_eq", "potion", 4);
    inv.equipped.mainHand = potion;

    const ok = consumeItemsByTemplateId(inv, "potion", 2);
    expect(ok).toBe(true);
    expect(inv.equipped.mainHand.quantity).toBe(2);
  });

  it("returns false when there are insufficient items", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);
    setContainerEquipped(inv, "bag_1", true);

    addItemToContainer(bag, mkTestItem("potion_1", "potion", 1));

    const ok = consumeItemsByTemplateId(inv, "potion", 5);
    expect(ok).toBe(false);
  });

  it("returns false when no items of that template exist", () => {
    const inv = createInventory(1);
    expect(consumeItemsByTemplateId(inv, "potion", 1)).toBe(false);
  });

  it("consumes across multiple stacks in one equipped container", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);
    setContainerEquipped(inv, "bag_1", true);

    addItemToContainer(bag, mkTestItem("potion_1", "potion", 2));
    addItemToContainer(bag, mkTestItem("potion_2", "potion", 3));

    const ok = consumeItemsByTemplateId(inv, "potion", 4);
    expect(ok).toBe(true);
    // first stack fully consumed, second partially consumed
    const remaining = bag.items.reduce((s, i) => s + i.quantity, 0);
    expect(remaining).toBe(1);
  });
});

// ── addItemToInventory ─────────────────────────────────────────────────────────

describe("addItemToInventory", () => {
  it("adds item to equipped container first", () => {
    const inv = createInventory(1);
    const equippedBag = createContainer("bag_eq", "Equipped Bag", 20000, 2000);
    const unequippedBag = createContainer("bag_un", "Unequipped Bag", 20000, 2000);
    addContainer(inv, equippedBag);
    addContainer(inv, unequippedBag);
    setContainerEquipped(inv, "bag_eq", true);

    const item = mkTestItem("sword_1", "iron_sword");
    const result = addItemToInventory(inv, item);

    expect(result.success).toBe(true);
    expect(result.container).toBe(equippedBag);
    expect(equippedBag.items.length).toBe(1);
    expect(unequippedBag.items.length).toBe(0);
  });

  it("falls back to unequipped container when equipped is full", () => {
    const inv = createInventory(1);
    const tinyEquipped = createContainer("tiny_eq", "Tiny Equipped", 10, 5); // nearly no capacity
    const largeBag = createContainer("large_un", "Large Unequipped", 50000, 5000);
    addContainer(inv, tinyEquipped);
    addContainer(inv, largeBag);
    setContainerEquipped(inv, "tiny_eq", true);

    const heavyItem: ItemInstance = {
      instanceId: "anvil_1",
      templateId: "anvil",
      quantity: 20000, // 20kg — won't fit in tiny equipped
      durability_Q: SCALE.Q,
      containerPath: [],
    };

    const result = addItemToInventory(inv, heavyItem);
    expect(result.success).toBe(true);
    expect(result.container).toBe(largeBag);
    expect(largeBag.items.length).toBe(1);
  });

  it("returns no_capacity when no container can hold the item", () => {
    const inv = createInventory(1);
    // No containers at all

    const item = mkTestItem("sword_1", "iron_sword");
    const result = addItemToInventory(inv, item);

    expect(result.success).toBe(false);
    expect(result.reason).toBe("no_capacity");
    expect(result.container).toBeNull();
  });
});

// ── removeItemMod ──────────────────────────────────────────────────────────────

describe("removeItemMod", () => {
  it("removes an existing mod and returns true", () => {
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

    expect(removeItemMod(item, "sharpened")).toBe(true);
    expect(item.modifications!.length).toBe(1);
    expect(item.modifications![0]!.type).toBe("masterwork");
  });

  it("returns false when removing a mod that does not exist", () => {
    const item = mkTestItem("sword_1", "iron_sword");
    applyItemMod(item, {
      type: "sharpened",
      name: "Sharpened",
      statMultipliers: { damageMul: q(1.10) },
    });

    expect(removeItemMod(item, "masterwork")).toBe(false);
    expect(item.modifications!.length).toBe(1);
  });

  it("returns false when item has no modifications array", () => {
    const item = mkTestItem("sword_1", "iron_sword");
    // No modifications at all
    expect(removeItemMod(item, "sharpened")).toBe(false);
  });
});

// ── getItemStatMultiplier extended ────────────────────────────────────────────

describe("getItemStatMultiplier extended", () => {
  it("returns SCALE.Q when item has empty modifications array", () => {
    const item = mkTestItem("sword_1", "iron_sword");
    item.modifications = []; // empty but defined
    expect(getItemStatMultiplier(item, "damageMul")).toBe(SCALE.Q);
  });

  it("returns SCALE.Q for a stat not present in any mod", () => {
    const item = mkTestItem("sword_1", "iron_sword");
    applyItemMod(item, {
      type: "sharpened",
      name: "Sharpened",
      statMultipliers: { damageMul: q(1.10) },
    });
    // "valueMul" not set in the mod
    expect(getItemStatMultiplier(item, "valueMul")).toBe(SCALE.Q);
  });

  it("returns product of multiple mods for the same stat", () => {
    const item = mkTestItem("sword_1", "iron_sword");
    applyItemMod(item, {
      type: "sharpened",
      name: "Sharpened",
      statMultipliers: { damageMul: q(1.10) },
    });
    applyItemMod(item, {
      type: "enchanted",
      name: "Enchanted",
      statMultipliers: { damageMul: q(1.20) },
    });
    // 1.10 * 1.20 = 1.32
    const mult = getItemStatMultiplier(item, "damageMul");
    expect(mult).toBeGreaterThan(q(1.31));
    expect(mult).toBeLessThan(q(1.33));
  });
});

// ── serializeInventory / deserializeInventory extended ────────────────────────

describe("Serialization extended", () => {
  it("serializes and restores equipped mainHand, offHand, body, head slots", () => {
    const inv = createInventory(7);

    const mainHandItem = mkTestItem("sword_1", "iron_sword");
    const offHandItem = mkTestItem("shield_1", "wooden_shield");
    const bodyItem = mkTestItem("chest_1", "leather_chest");
    const headItem = mkTestItem("helm_1", "iron_helm");

    inv.equipped.mainHand = mainHandItem;
    inv.equipped.offHand = offHandItem;
    inv.equipped.body = bodyItem;
    inv.equipped.head = headItem;

    const serialized = serializeInventory(inv);
    const restored = deserializeInventory(serialized);

    expect(restored.equipped.mainHand?.instanceId).toBe("sword_1");
    expect(restored.equipped.offHand?.instanceId).toBe("shield_1");
    expect(restored.equipped.body?.instanceId).toBe("chest_1");
    expect(restored.equipped.head?.instanceId).toBe("helm_1");
  });

  it("serializes and restores equipped.containers Map entries", () => {
    const inv = createInventory(7);
    const beltItem = mkTestItem("belt_pouch_1", "belt_pouch", 1);
    inv.equipped.containers.set("belt_left", beltItem);

    const serialized = serializeInventory(inv);
    const restored = deserializeInventory(serialized);

    expect(restored.equipped.containers.has("belt_left")).toBe(true);
    expect(restored.equipped.containers.get("belt_left")?.instanceId).toBe("belt_pouch_1");
  });

  it("serializes containers with items and restores them", () => {
    const inv = createInventory(3);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);
    setContainerEquipped(inv, "bag_1", true);

    const arrow = mkTestItem("arrow_1", "arrow", 30);
    addItemToContainer(bag, arrow);

    const serialized = serializeInventory(inv);
    const restored = deserializeInventory(serialized);

    expect(restored.containers.length).toBe(1);
    expect(restored.containers[0]!.isEquipped).toBe(true);
    expect(restored.containers[0]!.items.length).toBe(1);
    expect(restored.containers[0]!.items[0]!.instanceId).toBe("arrow_1");
    expect(restored.containers[0]!.items[0]!.quantity).toBe(30);
  });

  it("serializes item modifications and restores them", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_1", "Backpack", 20000, 2000);
    addContainer(inv, bag);

    const sword = mkTestItem("sword_1", "iron_sword");
    applyItemMod(sword, {
      type: "sharpened",
      name: "Sharpened",
      statMultipliers: { damageMul: q(1.10) },
    });
    addItemToContainer(bag, sword);

    const serialized = serializeInventory(inv);
    const restored = deserializeInventory(serialized);

    const restoredSword = restored.containers[0]!.items[0]!;
    expect(restoredSword.modifications).toBeDefined();
    expect(restoredSword.modifications!.length).toBe(1);
    expect(restoredSword.modifications![0]!.type).toBe("sharpened");
  });

  it("deserializes with missing equipped block gracefully", () => {
    const raw: unknown = {
      ownerId: 5,
      containers: [],
      encumbrance_Kg: 0,
      maxEncumbrance_Kg: 0,
      currency: 0,
      // no "equipped" key
    };
    const restored = deserializeInventory(raw);
    expect(restored.ownerId).toBe(5);
    expect(restored.equipped.mainHand).toBeUndefined();
    expect(restored.equipped.containers.size).toBe(0);
  });

  it("deserializes container whose items field is missing (falls back to [])", () => {
    const raw: unknown = {
      ownerId: 9,
      containers: [
        {
          containerId: "bag_1",
          name: "Backpack",
          capacity_Kg: 20000,
          emptyMass_kg: 2000,
          isEquipped: false,
          // no items field — should fall back to []
        },
      ],
      equipped: {},
      encumbrance_Kg: 0,
      maxEncumbrance_Kg: 0,
      currency: 0,
    };
    const restored = deserializeInventory(raw);
    expect(restored.containers.length).toBe(1);
    expect(restored.containers[0]!.items).toEqual([]);
  });
});

// ── consumeItemsByTemplateId — non-equipped container zero-quantity splice ─────

describe("consumeItemsByTemplateId zero-quantity splice in non-equipped container", () => {
  it("removes exhausted stack in non-equipped container mid-loop and continues", () => {
    const inv = createInventory(1);
    const nonEquipped = createContainer("bag_ne", "Non-Equipped Bag", 20000, 2000);
    addContainer(inv, nonEquipped);
    // Do NOT equip — so the equipped-container pass skips it entirely,
    // and the "any container" pass processes it.

    // Two stacks: first will be fully consumed (quantity → 0), second partially consumed.
    addItemToContainer(nonEquipped, mkTestItem("herb_1", "herb", 2));
    addItemToContainer(nonEquipped, mkTestItem("herb_2", "herb", 5));

    const ok = consumeItemsByTemplateId(inv, "herb", 4);
    expect(ok).toBe(true);
    // herb_1 fully consumed (spliced), herb_2 has 3 left
    expect(nonEquipped.items.length).toBe(1);
    expect(nonEquipped.items[0]!.quantity).toBe(3);
  });

  it("splices item when exact stack quantity equals the requested quantity in non-equipped container", () => {
    const inv = createInventory(1);
    const nonEquipped = createContainer("bag_ne2", "Non-Equipped Bag 2", 20000, 2000);
    addContainer(inv, nonEquipped);
    // Exact match: one stack of 3, consume exactly 3
    addItemToContainer(nonEquipped, mkTestItem("gem_1", "gem", 3));

    const ok = consumeItemsByTemplateId(inv, "gem", 3);
    expect(ok).toBe(true);
    expect(nonEquipped.items.length).toBe(0);
  });

  it("skips non-matching items in equipped container (consumeFromItem returns false path)", () => {
    const inv = createInventory(1);
    const bag = createContainer("bag_mixed", "Mixed Bag", 20000, 2000);
    addContainer(inv, bag);
    setContainerEquipped(inv, "bag_mixed", true);

    // Add a non-matching item first, then the matching item
    addItemToContainer(bag, mkTestItem("sword_1", "iron_sword", 1));
    addItemToContainer(bag, mkTestItem("potion_1", "potion", 5));

    const ok = consumeItemsByTemplateId(inv, "potion", 3);
    expect(ok).toBe(true);
    // sword_1 untouched, potion_1 reduced
    expect(bag.items.find((i) => i.instanceId === "sword_1")?.quantity).toBe(1);
    expect(bag.items.find((i) => i.instanceId === "potion_1")?.quantity).toBe(2);
  });
});
