// src/inheritance.ts — Phase 49: Legacy & Inheritance
//
// Character death does not end the campaign.  An heir:
//   • inherits all equipped items from the deceased's loadout
//   • receives a partial transfer of the deceased's relationship graph
//   • takes possession of the deceased's campaign inventory
//   • is registered in the campaign; the deceased is removed
//
// No simulation physics — pure bookkeeping that composes with campaign.ts.

import type { Q } from "./units.js";
import { SCALE, q, clampQ, mulDiv } from "./units.js";
import type { Entity } from "./sim/entity.js";
import type { CampaignState } from "./campaign.js";
import type { RelationshipGraph } from "./relationships.js";
import { establishRelationship } from "./relationships.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InheritanceSpec {
  deceasedId: number;
  heirId: number;
  /**
   * Fraction of relationship trust / affinity that passes to the heir.
   * q(1.0) = full copy; q(0.50) = half strength; q(0) = no inheritance.
   * Default: q(0.50).
   */
  relationshipTransferRate_Q?: Q;
}

export interface InheritanceReport {
  /** Number of loadout items moved from deceased to heir. */
  itemsTransferred: number;
  /** Number of new relationship entries created for the heir. */
  relationshipsTransferred: number;
  /** Inventory items (itemId → count) transferred from deceased to heir. */
  inventoryTransferred: Map<string, number>;
}

// ── Equipment transfer ────────────────────────────────────────────────────────

/**
 * Move all loadout items from deceased to heir.
 * Heir's existing items are preserved (deceased's items are appended).
 * Deceased's loadout is cleared.
 *
 * @returns Number of items transferred.
 */
export function transferEquipment(deceased: Entity, heir: Entity): number {
  const items = deceased.loadout.items;
  const count = items.length;
  heir.loadout.items = [...heir.loadout.items, ...items];
  deceased.loadout.items = [];
  return count;
}

// ── Relationship transfer ─────────────────────────────────────────────────────

/**
 * Partially copy the deceased's relationships to the heir.
 *
 * For each relationship R(deceased, X):
 *   heir's trust_Q    = R.trust_Q    × transferRate_Q
 *   heir's affinity_Q = |R.affinity_Q| × transferRate_Q  (sign preserved)
 *
 * Existing heir–X relationships are not overwritten.
 * The deceased's relationships are left in the graph unmodified.
 *
 * @returns Number of new heir relationships created.
 */
export function transferRelationships(
  graph: RelationshipGraph,
  deceasedId: number,
  heirId: number,
  transferRate_Q: Q,
): number {
  const keys = graph.entityIndex.get(deceasedId);
  if (!keys || keys.size === 0) return 0;

  let created = 0;
  for (const key of keys) {
    const rel = graph.relationships.get(key);
    if (!rel) continue;

    const otherId = rel.entityA === deceasedId ? rel.entityB : rel.entityA;
    if (otherId === heirId) continue;

    // Skip if heir already has a relationship with this entity
    const existingKey = heirId < otherId ? `${heirId}:${otherId}` : `${otherId}:${heirId}`;
    if (graph.relationships.has(existingKey)) continue;

    const newTrust: Q = clampQ(
      mulDiv(rel.trust_Q, transferRate_Q, SCALE.Q) as Q,
      q(0),
      SCALE.Q as Q,
    );

    // Affinity can be negative: scale magnitude, preserve sign
    const rawMag = mulDiv(rel.affinity_Q < 0 ? -rel.affinity_Q : rel.affinity_Q, transferRate_Q, SCALE.Q);
    const newAffinity: Q = clampQ(
      (rel.affinity_Q < 0 ? -rawMag : rawMag) as Q,
      (-SCALE.Q) as Q,
      SCALE.Q as Q,
    );

    establishRelationship(graph, heirId, otherId, 0, newAffinity, newTrust);
    created++;
  }
  return created;
}

// ── Inventory transfer ────────────────────────────────────────────────────────

/**
 * Transfer all campaign inventory items from deceased to heir.
 * Stacks merge: heir's existing counts are summed with deceased's amounts.
 * The deceased's campaign inventory entry is deleted after transfer.
 *
 * @returns Map of transferred items (itemId → count transferred).
 */
export function transferInventory(
  campaign: CampaignState,
  deceasedId: number,
  heirId: number,
): Map<string, number> {
  const deceasedInv = campaign.entityInventories.get(deceasedId);
  if (!deceasedInv || deceasedInv.size === 0) return new Map();

  const transferred = new Map<string, number>(deceasedInv);

  const heirInv = campaign.entityInventories.get(heirId) ?? new Map<string, number>();
  for (const [itemId, count] of deceasedInv) {
    heirInv.set(itemId, (heirInv.get(itemId) ?? 0) + count);
  }
  campaign.entityInventories.set(heirId, heirInv);
  campaign.entityInventories.delete(deceasedId);

  return transferred;
}

// ── Full inheritance orchestration ────────────────────────────────────────────

/**
 * Apply the full inheritance process when a character dies and an heir takes over.
 *
 * Steps performed:
 *  1. Transfers loadout equipment from deceased to heir entity.
 *  2. Transfers campaign inventory (deceased → heir, with stack merging).
 *  3. Partially transfers relationships (if `graph` is provided).
 *  4. Moves the deceased's campaign location to the heir.
 *  5. Registers the heir in the campaign; removes the deceased.
 *  6. Logs the event to `campaign.log`.
 *
 * Both deceased (via `campaign.entities`) and heir (provided directly) must be
 * supplied.  The deceased entity is updated in-place before being removed so
 * that equipment is properly cleared.
 *
 * @returns InheritanceReport with counts of transferred items and relationships.
 */
export function applyInheritance(
  campaign: CampaignState,
  graph: RelationshipGraph | undefined,
  spec: InheritanceSpec,
  heir: Entity,
): InheritanceReport {
  const { deceasedId, heirId } = spec;
  const transferRate_Q: Q = spec.relationshipTransferRate_Q ?? (q(0.50) as Q);

  // 1. Equipment
  const deceased = campaign.entities.get(deceasedId);
  let itemsTransferred = 0;
  if (deceased) {
    itemsTransferred = transferEquipment(deceased, heir);
  }

  // 2. Inventory
  const inventoryTransferred = transferInventory(campaign, deceasedId, heirId);

  // 3. Relationships
  let relationshipsTransferred = 0;
  if (graph) {
    relationshipsTransferred = transferRelationships(graph, deceasedId, heirId, transferRate_Q);
  }

  // 4. Location
  const loc = campaign.entityLocations.get(deceasedId);
  if (loc !== undefined) {
    campaign.entityLocations.set(heirId, loc);
    campaign.entityLocations.delete(deceasedId);
  }

  // 5. Registry update
  campaign.entities.set(heirId, heir);
  if (deceased) campaign.entities.delete(deceasedId);

  // 6. Log
  campaign.log.push({
    worldTime_s: campaign.worldTime_s,
    text: `Entity ${heirId} inherits from deceased entity ${deceasedId} (${itemsTransferred} items, ${relationshipsTransferred} relationships).`,
  });

  return { itemsTransferred, relationshipsTransferred, inventoryTransferred };
}
