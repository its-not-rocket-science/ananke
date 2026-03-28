// src/inventory.ts — Phase 43: Deep Inventory & Encumbrance
//
// Container-based inventory system with nested storage, weight tracking,
// and encumbrance penalties derived from physical carrying capacity.

import type { Q } from "./units.js";
import { q, qMul, clampQ, SCALE, mulDiv } from "./units.js";
import type { IndividualAttributes } from "./types.js";

// ── Core Types ────────────────────────────────────────────────────────────────

/** An instance of an item in the inventory. */
export interface ItemInstance {
  /** Unique identifier for this specific item instance. */
  instanceId: string;
  /** References the equipment catalogue template. */
  templateId: string;
  /** Stack quantity (for stackable items). */
  quantity: number;
  /** Durability: 1.0 = pristine, 0.0 = broken. Undefined = no durability. */
  durability_Q?: Q | undefined;
  /** Modifications applied to this item. */
  modifications?: ItemMod[] | undefined;
  /** Path to containing container(s), empty if top-level. */
  containerPath: string[];
}

/** A container (bag, pouch, backpack) that holds items. */
export interface Container {
  /** Unique identifier within the inventory. */
  containerId: string;
  /** Display name. */
  name: string;
  /** Maximum weight capacity in kg (scaled by SCALE.kg). */
  capacity_Kg: number;
  /** Optional volume capacity in litres. */
  volume_L?: number | undefined;
  /** Items stored directly in this container. */
  items: ItemInstance[];
  /** Whether this container is currently equipped/accessible. */
  isEquipped: boolean;
  /** Base mass of the empty container itself. */
  emptyMass_kg: number;
}

/** A record of equipped items by slot. */
export interface EquippedItems {
  /** Weapon in main hand. */
  mainHand?: ItemInstance;
  /** Weapon/shield in off hand. */
  offHand?: ItemInstance;
  /** Body armour. */
  body?: ItemInstance;
  /** Head protection. */
  head?: ItemInstance;
  /** Container slots (back, belt, etc.). */
  containers: Map<string, ItemInstance>;
}

/** Complete inventory for an entity. */
export interface Inventory {
  /** Owner entity ID. */
  ownerId: number;
  /** All containers owned (equipped or not). */
  containers: Container[];
  /** Currently equipped items. */
  equipped: EquippedItems;
  /** Total encumbrance in kg (scaled). */
  encumbrance_Kg: number;
  /** Maximum encumbrance based on strength. */
  maxEncumbrance_Kg: number;
  /** Currency/money (if applicable). */
  currency?: number;
}

/** Item modification types. */
export interface ItemMod {
  type: "sharpened" | "reinforced" | "enchanted" | "damaged" | "masterwork";
  /** Display name of the modification. */
  name: string;
  /** Effects on item stats (applied as multipliers). */
  statMultipliers?: {
    damageMul?: Q;
    durabilityMul?: Q;
    weightMul?: Q;
    valueMul?: Q;
  };
}

// ── Encumbrance Categories ────────────────────────────────────────────────────

export type EncumbranceCategory =
  | "unencumbered"
  | "light"
  | "medium"
  | "heavy"
  | "overloaded";

export interface EncumbranceCategoryDef {
  category: EncumbranceCategory;
  maxRatio: number; // Fraction of max encumbrance (0.3 = 30%)
  penalties: InventoryEncumbrancePenalties;
}

export interface InventoryEncumbrancePenalties {
  /** Fine control penalty (affects combat precision). */
  fineControlPenalty_Q: Q;
  /** Dodge/parry latency increase as multiplier. */
  dodgeParryLatencyMul: Q;
  /** Movement speed multiplier. */
  speedMul: Q;
  /** Cannot sprint if true. */
  noSprint: boolean;
  /** Cannot move if true. */
  noMove: boolean;
}

// Category thresholds and penalties
export const ENCUMBRANCE_CATEGORIES: EncumbranceCategoryDef[] = [
  {
    category: "unencumbered",
    maxRatio: 0.30,
    penalties: {
      fineControlPenalty_Q: q(0),
      dodgeParryLatencyMul: q(1.0),
      speedMul: q(1.0),
      noSprint: false,
      noMove: false,
    },
  },
  {
    category: "light",
    maxRatio: 0.50,
    penalties: {
      fineControlPenalty_Q: q(0.05),
      dodgeParryLatencyMul: q(1.0),
      speedMul: q(0.95),
      noSprint: false,
      noMove: false,
    },
  },
  {
    category: "medium",
    maxRatio: 0.75,
    penalties: {
      fineControlPenalty_Q: q(0.10),
      dodgeParryLatencyMul: q(1.20),
      speedMul: q(0.90),
      noSprint: false,
      noMove: false,
    },
  },
  {
    category: "heavy",
    maxRatio: 1.00,
    penalties: {
      fineControlPenalty_Q: q(0.15),
      dodgeParryLatencyMul: q(1.30),
      speedMul: q(0.75),
      noSprint: true,
      noMove: false,
    },
  },
  {
    category: "overloaded",
    maxRatio: Infinity,
    penalties: {
      fineControlPenalty_Q: q(0.30),
      dodgeParryLatencyMul: q(1.50),
      speedMul: q(0),
      noSprint: true,
      noMove: true,
    },
  },
];

// ── Inventory Creation ────────────────────────────────────────────────────────

/** Create an empty inventory for an entity. */
export function createInventory(ownerId: number): Inventory {
  return {
    ownerId,
    containers: [],
    equipped: {
      containers: new Map(),
    },
    encumbrance_Kg: 0,
    maxEncumbrance_Kg: 0,
    currency: 0,
  };
}

/** Create a new container. */
export function createContainer(
  containerId: string,
  name: string,
  capacity_Kg: number,
  emptyMass_kg: number,
  volume_L?: number,
): Container {
  return {
    containerId,
    name,
    capacity_Kg,
    volume_L,
    items: [],
    isEquipped: false,
    emptyMass_kg,
  };
}

// ── Max Encumbrance Calculation ───────────────────────────────────────────────

/**
 * Calculate maximum encumbrance based on physical strength.
 * Stronger characters can carry more absolute weight.
 */
export function calculateMaxEncumbrance_Kg(
  attributes: IndividualAttributes,
  capacityFactor: Q = q(0.5),
): number {
  // Base: peakForce_N relates to lifting/carrying capacity
  // A typical human (1800N peak force) can carry ~50kg at 50% factor
  const peakForce_N = attributes.performance.peakForce_N;

  // Convert force to mass: F = mg → m = F/g
  // Using BigInt for precision: result in kg (scaled by SCALE.kg)
  const numerator = BigInt(peakForce_N) * BigInt(capacityFactor) * BigInt(SCALE.kg);
  const denom = BigInt(SCALE.N) * BigInt(SCALE.Q) * 9810n; // g ≈ 9.81 m/s²

  const maxKg = Number(numerator / denom);
  return Math.max(1, maxKg); // At least 1kg capacity
}

// ── Weight Calculations ───────────────────────────────────────────────────────

/** Calculate total weight of items in a container (including container itself). */
export function calculateContainerWeight(container: Container): number {
  let total = container.emptyMass_kg;

  for (const item of container.items) {
    total += getItemInstanceMass(item);
  }

  return total;
}

/** Get mass of a single item instance (including modifications). */
export function getItemInstanceMass(item: ItemInstance): number {
  // Base mass would come from template lookup; here we use a placeholder
  // In practice, this would reference the equipment catalogue
  let mass = item.quantity; // Simplified: assume 1kg per quantity unit

  // Apply weight modifications
  if (item.modifications) {
    for (const mod of item.modifications) {
      if (mod.statMultipliers?.weightMul) {
        mass = mulDiv(mass * SCALE.Q, mod.statMultipliers.weightMul, SCALE.Q);
      }
    }
  }

  return mass;
}

/** Calculate total encumbrance for an inventory. */
export function calculateTotalEncumbrance(inventory: Inventory): number {
  let total = 0;

  // Add equipped items weight
  if (inventory.equipped.mainHand) {
    total += getItemInstanceMass(inventory.equipped.mainHand);
  }
  if (inventory.equipped.offHand) {
    total += getItemInstanceMass(inventory.equipped.offHand);
  }
  if (inventory.equipped.body) {
    total += getItemInstanceMass(inventory.equipped.body);
  }
  if (inventory.equipped.head) {
    total += getItemInstanceMass(inventory.equipped.head);
  }

  // Add equipped containers and their contents
  for (const container of inventory.containers) {
    if (container.isEquipped) {
      total += calculateContainerWeight(container);
    }
  }

  return total;
}

/** Recalculate encumbrance and update inventory. */
export function recalculateEncumbrance(
  inventory: Inventory,
  attributes: IndividualAttributes,
): void {
  inventory.encumbrance_Kg = calculateTotalEncumbrance(inventory);
  inventory.maxEncumbrance_Kg = calculateMaxEncumbrance_Kg(attributes);
}

// ── Encumbrance Category ──────────────────────────────────────────────────────

/** Get the encumbrance category and penalties for current load. */
export function getEncumbranceCategory(
  inventory: Inventory,
): EncumbranceCategoryDef {
  if (inventory.maxEncumbrance_Kg <= 0) {
    return ENCUMBRANCE_CATEGORIES[4]!; // Overloaded if no capacity
  }

  const ratio = inventory.encumbrance_Kg / inventory.maxEncumbrance_Kg;

  for (const category of ENCUMBRANCE_CATEGORIES) {
    if (ratio < category.maxRatio) {
      return category;
    }
  }

  return ENCUMBRANCE_CATEGORIES[ENCUMBRANCE_CATEGORIES.length - 1]!;
}

/** Get effective encumbrance penalties (combines with any existing penalties). */
export function getEffectiveEncumbrancePenalties(
  inventory: Inventory,
  baseFineControl: Q,
): { category: EncumbranceCategory; penalties: InventoryEncumbrancePenalties; effectiveFineControl: Q } {
  const categoryDef = getEncumbranceCategory(inventory);

  // Calculate effective fine control after penalty
  const effectiveFineControl = clampQ(
    (baseFineControl - categoryDef.penalties.fineControlPenalty_Q) as Q,
    q(0.01),
    SCALE.Q as Q,
  );

  return {
    category: categoryDef.category,
    penalties: categoryDef.penalties,
    effectiveFineControl,
  };
}

// ── Container Operations ───────────────────────────────────────────────────────

/** Add a container to inventory. */
export function addContainer(inventory: Inventory, container: Container): void {
  inventory.containers.push(container);
}

/** Remove a container from inventory. */
export function removeContainer(inventory: Inventory, containerId: string): boolean {
  const idx = inventory.containers.findIndex((c) => c.containerId === containerId);
  if (idx >= 0) {
    inventory.containers.splice(idx, 1);
    return true;
  }
  return false;
}

/** Equip/unequip a container. */
export function setContainerEquipped(
  inventory: Inventory,
  containerId: string,
  equipped: boolean,
): boolean {
  const container = inventory.containers.find((c) => c.containerId === containerId);
  if (!container) return false;

  container.isEquipped = equipped;
  return true;
}

/** Find a container by ID. */
export function findContainer(inventory: Inventory, containerId: string): Container | undefined {
  return inventory.containers.find((c) => c.containerId === containerId);
}

// ── Item Operations ────────────────────────────────────────────────────────────

/** Add an item to a specific container. */
export function addItemToContainer(
  container: Container,
  item: ItemInstance,
): { success: boolean; reason?: string } {
  // Check weight capacity
  const itemWeight = getItemInstanceMass(item);
  const currentWeight = calculateContainerWeight(container) - container.emptyMass_kg;

  if (currentWeight + itemWeight > container.capacity_Kg) {
    return { success: false, reason: "exceeds_capacity" };
  }

  container.items.push(item);
  return { success: true };
}

/** Remove an item from a container by instance ID. */
export function removeItemFromContainer(
  container: Container,
  instanceId: string,
): ItemInstance | undefined {
  const idx = container.items.findIndex((i) => i.instanceId === instanceId);
  if (idx >= 0) {
    return container.items.splice(idx, 1)[0];
  }
  return undefined;
}

/** Find an item anywhere in the inventory. */
export function findItem(
  inventory: Inventory,
  instanceId: string,
): { item: ItemInstance; container: Container | null } | undefined {
  // Check equipped items
  const checkEquipped = (item?: ItemInstance) => {
    if (item?.instanceId === instanceId) {
      return { item, container: null as Container | null };
    }
    return undefined;
  };

  let result = checkEquipped(inventory.equipped.mainHand);
  if (result) return result;

  result = checkEquipped(inventory.equipped.offHand);
  if (result) return result;

  result = checkEquipped(inventory.equipped.body);
  if (result) return result;

  result = checkEquipped(inventory.equipped.head);
  if (result) return result;

  // Check containers
  for (const container of inventory.containers) {
    const item = container.items.find((i) => i.instanceId === instanceId);
    if (item) {
      return { item, container };
    }
  }

  return undefined;
}

/** Move an item between containers. */
export function moveItem(
  inventory: Inventory,
  itemId: string,
  fromContainerId: string | null, // null = equipped
  toContainerId: string,
): { success: boolean; reason?: string } {
  // Find source
  let item: ItemInstance | undefined;
  let fromContainer: Container | undefined;

  if (fromContainerId === null) {
    // Check equipped items - simplified, would need full equipped item removal
    return { success: false, reason: "unequip_first" };
  } else {
    fromContainer = findContainer(inventory, fromContainerId);
    if (!fromContainer) return { success: false, reason: "source_not_found" };
    item = fromContainer.items.find((i) => i.instanceId === itemId);
  }

  if (!item) return { success: false, reason: "item_not_found" };

  // Find destination
  const toContainer = findContainer(inventory, toContainerId);
  if (!toContainer) return { success: false, reason: "destination_not_found" };

  // Check destination capacity
  const itemWeight = getItemInstanceMass(item);
  const destCurrentWeight = calculateContainerWeight(toContainer) - toContainer.emptyMass_kg;
  if (destCurrentWeight + itemWeight > toContainer.capacity_Kg) {
    return { success: false, reason: "destination_full" };
  }

  // Move
  if (fromContainer) {
    removeItemFromContainer(fromContainer, itemId);
  }
  toContainer.items.push(item);

  return { success: true };
}

/** Equip an item from a container to an equipment slot. */
export function equipItem(
  inventory: Inventory,
  itemId: string,
  slot: "mainHand" | "offHand" | "body" | "head",
): { success: boolean; reason?: string | undefined; previousItem?: ItemInstance | undefined } {
  // Find item
  const found = findItem(inventory, itemId);
  if (!found) return { success: false, reason: "item_not_found" };

  // Remove from container if not already equipped
  if (found.container) {
    removeItemFromContainer(found.container, itemId);
  }

  // Store previous item
  const previousItem = inventory.equipped[slot];

  // Equip new item
  inventory.equipped[slot] = found.item;

  // Put previous item back in first equipped container if possible
  if (previousItem) {
    const equippedContainer = inventory.containers.find((c) => c.isEquipped);
    if (equippedContainer) {
      addItemToContainer(equippedContainer, previousItem);
    }
  }

  return { success: true, previousItem };
}

/** Unequip an item and return it to a container. */
export function unequipItem(
  inventory: Inventory,
  slot: "mainHand" | "offHand" | "body" | "head",
  targetContainerId?: string,
): { success: boolean; reason?: string | undefined; item?: ItemInstance | undefined } {
  const item = inventory.equipped[slot];
  if (!item) return { success: false, reason: "nothing_equipped" };

  // Find destination container
  let container: Container | undefined;
  if (targetContainerId) {
    container = findContainer(inventory, targetContainerId);
  } else {
    container = inventory.containers.find((c) => c.isEquipped);
  }

  if (!container) return { success: false, reason: "no_container" };

  // Check capacity
  const result = addItemToContainer(container, item);
  if (!result.success) {
    return { success: false, reason: result.reason };
  }

  // Remove from equipped
  delete inventory.equipped[slot];

  return { success: true, item };
}

// ── Item Query Functions ─────────────────────────────────────────────────────

/**
 * Count items in inventory by template ID.
 * Searches all containers and equipped items.
 */
export function getItemCountByTemplateId(inventory: Inventory, templateId: string): number {
  let count = 0;

  // Check equipped items
  const checkEquipped = (item?: ItemInstance) => {
    if (item?.templateId === templateId) {
      count += item.quantity;
    }
  };
  checkEquipped(inventory.equipped.mainHand);
  checkEquipped(inventory.equipped.offHand);
  checkEquipped(inventory.equipped.body);
  checkEquipped(inventory.equipped.head);
  for (const item of inventory.equipped.containers.values()) {
    if (item.templateId === templateId) {
      count += item.quantity;
    }
  }

  // Check containers
  for (const container of inventory.containers) {
    for (const item of container.items) {
      if (item.templateId === templateId) {
        count += item.quantity;
      }
    }
  }

  return count;
}

/**
 * Find all material items of a specific material type.
 * Returns an array of Material items (requires kind "material" and materialTypeId).
 * Note: This assumes ItemInstance can be cast to Material if kind === "material".
 * The caller must ensure the item is a material.
 */
export function findMaterialsByType(inventory: Inventory, materialTypeId: string): ItemInstance[] {
  const results: ItemInstance[] = [];
  // Helper to check and add
  const checkItem = (item: ItemInstance) => {
    if (item.templateId === `material_${materialTypeId}`) {
      results.push(item);
    }
  };

  // Check equipped items
  if (inventory.equipped.mainHand) checkItem(inventory.equipped.mainHand);
  if (inventory.equipped.offHand) checkItem(inventory.equipped.offHand);
  if (inventory.equipped.body) checkItem(inventory.equipped.body);
  if (inventory.equipped.head) checkItem(inventory.equipped.head);
  for (const item of inventory.equipped.containers.values()) {
    checkItem(item);
  }

  // Check containers
  for (const container of inventory.containers) {
    for (const item of container.items) {
      checkItem(item);
    }
  }

  return results;
}

/**
 * Consume items by template ID, removing them from inventory.
 * Returns true if enough items were found and consumed.
 */
export function consumeItemsByTemplateId(
  inventory: Inventory,
  templateId: string,
  quantity: number,
): boolean {
  if (quantity <= 0) return true;

  let remaining = quantity;

  // Helper to consume from an item instance (mutates item.quantity)
  const consumeFromItem = (item: ItemInstance): boolean => {
    if (item.templateId === templateId) {
      const take = Math.min(item.quantity, remaining);
      item.quantity -= take;
      remaining -= take;
      return remaining === 0;
    }
    return false;
  };

  // First, try equipped containers (they might be material items)
  for (const container of inventory.containers) {
    if (!container.isEquipped) continue;
    for (let i = 0; i < container.items.length; i++) {
      const item = container.items[i]!;
      if (consumeFromItem(item)) {
        // Remove item if quantity zero
        if (item.quantity === 0) {
          container.items.splice(i, 1);
        }
        return true;
      }
      if (item.quantity === 0) {
        container.items.splice(i, 1);
        i--;
      }
    }
  }

  // Then try any container
  for (const container of inventory.containers) {
    for (let i = 0; i < container.items.length; i++) {
      const item = container.items[i]!;
      if (consumeFromItem(item)) {
        if (item.quantity === 0) {
          container.items.splice(i, 1);
        }
        return true;
      }
      if (item.quantity === 0) {
        container.items.splice(i, 1);
        i--;
      }
    }
  }

  // Finally, try equipped items (unlikely for materials)
  const equippedItems = [
    inventory.equipped.mainHand,
    inventory.equipped.offHand,
    inventory.equipped.body,
    inventory.equipped.head,
  ];
  for (const item of equippedItems) {
    if (item && consumeFromItem(item)) {
      // Unequip if quantity zero? Probably not, but we can just leave it equipped with zero quantity.
      // For simplicity, we'll ignore zero quantity equipped items.
      return true;
    }
  }

  return remaining === 0;
}

/**
 * Add an item to inventory, attempting to place it in a suitable container.
 * Prefers equipped containers with sufficient capacity.
 * Returns success and the container it was added to (or null if equipped).
 */
export function addItemToInventory(
  inventory: Inventory,
  item: ItemInstance,
): { success: boolean; container: Container | null; reason?: string } {
  // Try equipped containers first
  for (const container of inventory.containers) {
    if (container.isEquipped) {
      const result = addItemToContainer(container, item);
      if (result.success) {
        return { success: true, container };
      }
    }
  }
  // Try any container
  for (const container of inventory.containers) {
    const result = addItemToContainer(container, item);
    if (result.success) {
      return { success: true, container };
    }
  }
  // No suitable container found
  return { success: false, container: null, reason: "no_capacity" };
}

// ── Item Modifications ────────────────────────────────────────────────────────

/** Apply a modification to an item. */
export function applyItemMod(item: ItemInstance, mod: ItemMod): void {
  if (!item.modifications) {
    item.modifications = [];
  }
  item.modifications.push(mod);
}

/** Remove a modification from an item. */
export function removeItemMod(item: ItemInstance, modType: ItemMod["type"]): boolean {
  if (!item.modifications) return false;

  const idx = item.modifications.findIndex((m) => m.type === modType);
  if (idx >= 0) {
    item.modifications.splice(idx, 1);
    return true;
  }
  return false;
}

/** Get effective stat multiplier from all modifications. */
export function getItemStatMultiplier(
  item: ItemInstance,
  stat: keyof NonNullable<ItemMod["statMultipliers"]>,
): Q {
  if (!item.modifications || item.modifications.length === 0) {
    return SCALE.Q as Q; // 1.0
  }

  let multiplier = SCALE.Q;
  for (const mod of item.modifications) {
    if (mod.statMultipliers?.[stat]) {
      multiplier = qMul(multiplier, mod.statMultipliers[stat]!);
    }
  }

  return multiplier as Q;
}

// ── Serialization ─────────────────────────────────────────────────────────────

/** Serialize inventory to JSON-friendly format. */
export function serializeInventory(inventory: Inventory): unknown {
  return {
    ownerId: inventory.ownerId,
    containers: inventory.containers.map((c) => ({
      containerId: c.containerId,
      name: c.name,
      capacity_Kg: c.capacity_Kg,
      volume_L: c.volume_L,
      items: c.items.map(serializeItemInstance),
      isEquipped: c.isEquipped,
      emptyMass_kg: c.emptyMass_kg,
    })),
    equipped: {
      mainHand: inventory.equipped.mainHand
        ? serializeItemInstance(inventory.equipped.mainHand)
        : undefined,
      offHand: inventory.equipped.offHand
        ? serializeItemInstance(inventory.equipped.offHand)
        : undefined,
      body: inventory.equipped.body
        ? serializeItemInstance(inventory.equipped.body)
        : undefined,
      head: inventory.equipped.head
        ? serializeItemInstance(inventory.equipped.head)
        : undefined,
      containers: Array.from(inventory.equipped.containers.entries()).map(
        ([slot, item]) => [slot, serializeItemInstance(item)],
      ),
    },
    encumbrance_Kg: inventory.encumbrance_Kg,
    maxEncumbrance_Kg: inventory.maxEncumbrance_Kg,
    currency: inventory.currency,
  };
}

function serializeItemInstance(item: ItemInstance): unknown {
  return {
    instanceId: item.instanceId,
    templateId: item.templateId,
    quantity: item.quantity,
    durability_Q: item.durability_Q,
    modifications: item.modifications,
    containerPath: item.containerPath,
  };
}

/** Deserialize inventory. */
export function deserializeInventory(data: unknown): Inventory {
  const d = data as Record<string, unknown>;

  const inventory: Inventory = {
    ownerId: (d.ownerId as number) ?? 0,
    containers: [],
    equipped: {
      containers: new Map(),
    },
    encumbrance_Kg: (d.encumbrance_Kg as number) ?? 0,
    maxEncumbrance_Kg: (d.maxEncumbrance_Kg as number) ?? 0,
    currency: (d.currency as number) ?? 0,
  };

  if (Array.isArray(d.containers)) {
    inventory.containers = d.containers.map((c) => ({
      containerId: (c as Record<string, unknown>).containerId as string,
      name: (c as Record<string, unknown>).name as string,
      capacity_Kg: (c as Record<string, unknown>).capacity_Kg as number,
      volume_L: (c as Record<string, unknown>).volume_L as number | undefined,
      items: Array.isArray((c as Record<string, unknown>).items)
        ? ((c as Record<string, unknown>).items as unknown[]).map(deserializeItemInstance)
        : [],
      isEquipped: Boolean((c as Record<string, unknown>).isEquipped),
      emptyMass_kg: ((c as Record<string, unknown>).emptyMass_kg as number) ?? 0,
    }));
  }

  if (d.equipped && typeof d.equipped === "object") {
    const e = d.equipped as Record<string, unknown>;
    if (e.mainHand) inventory.equipped.mainHand = deserializeItemInstance(e.mainHand);
    if (e.offHand) inventory.equipped.offHand = deserializeItemInstance(e.offHand);
    if (e.body) inventory.equipped.body = deserializeItemInstance(e.body);
    if (e.head) inventory.equipped.head = deserializeItemInstance(e.head);

    if (Array.isArray(e.containers)) {
      for (const [slot, item] of e.containers as [string, unknown][]) {
        inventory.equipped.containers.set(slot, deserializeItemInstance(item));
      }
    }
  }

  return inventory;
}

function deserializeItemInstance(data: unknown): ItemInstance {
  const d = data as Record<string, unknown>;
  return {
    instanceId: (d.instanceId as string) ?? "",
    templateId: (d.templateId as string) ?? "",
    quantity: (d.quantity as number) ?? 1,
    durability_Q: d.durability_Q as Q | undefined,
    modifications: Array.isArray(d.modifications) ? (d.modifications as ItemMod[]) : undefined,
    containerPath: Array.isArray(d.containerPath) ? (d.containerPath as string[]) : [],
  };
}
