// src/party.ts — Phase 48: Multi-Party Dynamics
//
// Party system for adventuring groups, companion loyalty, and inter-party conflict.
// Parties are sub-groups within factions (or cross-faction) that share goals,
// inventory, and have relationships with other parties.

import type { Q } from "./units.js";
import { SCALE, q, clampQ } from "./units.js";
import type { Entity } from "./sim/entity.js";
import type { WorldState } from "./sim/world.js";
import type { Inventory } from "./inventory.js";
import { createInventory, addContainer, createContainer } from "./inventory.js";

// ── Core Types ────────────────────────────────────────────────────────────────

/** A named adventuring party with a leader and members. */
export interface Party {
  id: string;
  name: string;
  leaderId: number;          // entity ID of the party leader
  memberIds: Set<number>;    // all entity IDs belonging to this party (including leader)
  sharedInventory?: Inventory | undefined; // shared storage accessible to all members
}

/** Party-to-party standing (similar to faction standing). */
export type PartyStanding = Q; // 0..SCALE.Q (0 = hostile, SCALE.Q = allied)

/** Registry of all parties and their relationships. */
export interface PartyRegistry {
  parties: Map<string, Party>;
  /** partyId → (partyId → standing) */
  relationships: Map<string, Map<string, PartyStanding>>;
}

// ── Standing constants ────────────────────────────────────────────────────────

export const PARTY_STANDING_HOSTILE:  Q = q(0.0);
export const PARTY_STANDING_RIVAL:    Q = q(0.20);
export const PARTY_STANDING_NEUTRAL: Q = q(0.50);
export const PARTY_STANDING_ALLY:    Q = q(0.70);
export const PARTY_STANDING_ALLIED:  Q = q(1.0);

/** Standing below this → parties treat each other as hostile. */
export const PARTY_HOSTILE_THRESHOLD:  Q = q(0.30);
/** Standing above this → parties will not initiate combat. */
export const PARTY_FRIENDLY_THRESHOLD: Q = q(0.70);

// ── Factory ───────────────────────────────────────────────────────────────────

/** Create an empty party registry. */
export function createPartyRegistry(): PartyRegistry {
  return {
    parties: new Map(),
    relationships: new Map(),
  };
}

/** Create a new party and add it to the registry. */
export function createParty(
  registry: PartyRegistry,
  partyId: string,
  name: string,
  leaderId: number,
): Party {
  if (registry.parties.has(partyId)) {
    throw new Error(`Party ${partyId} already exists`);
  }
  const memberIds = new Set<number>([leaderId]);
  const party: Party = { id: partyId, name, leaderId, memberIds, sharedInventory: undefined };
  registry.parties.set(partyId, party);
  // Initialize self-standing as allied
  const selfRow = new Map<string, PartyStanding>();
  selfRow.set(partyId, PARTY_STANDING_ALLIED);
  registry.relationships.set(partyId, selfRow);
  return party;
}

/** Add an entity to a party (also sets entity.party if entity is mutable). */
export function addPartyMember(
  registry: PartyRegistry,
  partyId: string,
  entityId: number,
  entity?: Entity, // optional, if provided will set entity.party = partyId
): void {
  const party = registry.parties.get(partyId);
  if (!party) {
    throw new Error(`Party ${partyId} not found`);
  }
  party.memberIds.add(entityId);
  if (entity) {
    entity.party = partyId;
  }
}

/** Remove an entity from a party. */
export function removePartyMember(
  registry: PartyRegistry,
  partyId: string,
  entityId: number,
  entity?: Entity,
): void {
  const party = registry.parties.get(partyId);
  if (!party) return;
  party.memberIds.delete(entityId);
  if (entity && entity.party === partyId) {
    entity.party = undefined;
  }
  // If party becomes empty, remove it? Keep for now.
}

/** Change party leader. */
export function setPartyLeader(
  registry: PartyRegistry,
  partyId: string,
  newLeaderId: number,
): void {
  const party = registry.parties.get(partyId);
  if (!party) {
    throw new Error(`Party ${partyId} not found`);
  }
  if (!party.memberIds.has(newLeaderId)) {
    throw new Error(`New leader ${newLeaderId} is not a member of party ${partyId}`);
  }
  party.leaderId = newLeaderId;
}

/** Get party for an entity, if any. */
export function getPartyForEntity(
  registry: PartyRegistry,
  entityId: number,
): Party | undefined {
  for (const party of registry.parties.values()) {
    if (party.memberIds.has(entityId)) {
      return party;
    }
  }
  return undefined;
}

/** Get party ID for an entity, if any. */
export function getPartyIdForEntity(
  registry: PartyRegistry,
  entityId: number,
): string | undefined {
  for (const [partyId, party] of registry.parties.entries()) {
    if (party.memberIds.has(entityId)) {
      return partyId;
    }
  }
  return undefined;
}

// ── Relationship Management ───────────────────────────────────────────────────

/** Get standing between two parties (default NEUTRAL). */
export function getPartyStanding(
  registry: PartyRegistry,
  partyAId: string,
  partyBId: string,
): PartyStanding {
  if (partyAId === partyBId) return PARTY_STANDING_ALLIED;
  const row = registry.relationships.get(partyAId);
  if (!row) return PARTY_STANDING_NEUTRAL;
  const standing = row.get(partyBId);
  return standing ?? PARTY_STANDING_NEUTRAL;
}

/** Set standing between two parties (clamped). */
export function setPartyStanding(
  registry: PartyRegistry,
  partyAId: string,
  partyBId: string,
  standing: PartyStanding,
): void {
  if (partyAId === partyBId) return;
  let row = registry.relationships.get(partyAId);
  if (!row) {
    row = new Map();
    registry.relationships.set(partyAId, row);
  }
  row.set(partyBId, clampQ(standing, 0, SCALE.Q) as PartyStanding);
  // Ensure symmetric row exists for partyB (but may have different standing? we keep asymmetric)
  let rowB = registry.relationships.get(partyBId);
  if (!rowB) {
    rowB = new Map();
    registry.relationships.set(partyBId, rowB);
  }
}

/** Set mutual standing between two parties (same both ways). */
export function setMutualPartyStanding(
  registry: PartyRegistry,
  partyAId: string,
  partyBId: string,
  standing: PartyStanding,
): void {
  setPartyStanding(registry, partyAId, partyBId, standing);
  setPartyStanding(registry, partyBId, partyAId, standing);
}

/** Determine if two parties are hostile based on standing threshold. */
export function arePartiesHostile(
  registry: PartyRegistry,
  partyAId: string,
  partyBId: string,
): boolean {
  const standing = getPartyStanding(registry, partyAId, partyBId);
  return standing < PARTY_HOSTILE_THRESHOLD;
}

/** Determine if two parties are friendly (won't attack). */
export function arePartiesFriendly(
  registry: PartyRegistry,
  partyAId: string,
  partyBId: string,
): boolean {
  const standing = getPartyStanding(registry, partyAId, partyBId);
  return standing >= PARTY_FRIENDLY_THRESHOLD;
}

// ── Entity‑Level Queries ──────────────────────────────────────────────────────

/** Get standing between two entities based on party membership. */
export function getPartyStandingBetweenEntities(
  registry: PartyRegistry,
  a: Entity,
  b: Entity,
): PartyStanding | undefined {
  const partyAId = a.party;
  const partyBId = b.party;
  if (!partyAId || !partyBId) return undefined;
  return getPartyStanding(registry, partyAId, partyBId);
}

/** Check if two entities are hostile based on party standing. */
export function areEntitiesHostileByParty(
  registry: PartyRegistry,
  a: Entity,
  b: Entity,
): boolean {
  const partyAId = a.party;
  const partyBId = b.party;
  if (!partyAId || !partyBId) return false; // no party relationship
  return arePartiesHostile(registry, partyAId, partyBId);
}

/** Check if two entities are friendly based on party standing. */
export function areEntitiesFriendlyByParty(
  registry: PartyRegistry,
  a: Entity,
  b: Entity,
): boolean {
  const partyAId = a.party;
  const partyBId = b.party;
  if (!partyAId || !partyBId) return false;
  return arePartiesFriendly(registry, partyAId, partyBId);
}

// ── Companion Loyalty ─────────────────────────────────────────────────────────

/**
 * Compute loyalty of a companion (entity) towards its party leader.
 * Loyalty is derived from relationship affinity and trust (if relationship exists).
 * Returns Q in [0, SCALE.Q] where 0 =背叛 (betrayal imminent), SCALE.Q = absolute loyalty.
 */
export function computeCompanionLoyalty(
  companion: Entity,
  leaderId: number,
  relationshipGraph?: import("./relationships.js").RelationshipGraph,
): Q {
  // If no relationship graph, assume neutral loyalty (0.5)
  if (!relationshipGraph) return PARTY_STANDING_NEUTRAL;

  const rel = relationshipGraph.relationships.get(
    `${Math.min(companion.id, leaderId)}:${Math.max(companion.id, leaderId)}`
  );
  if (!rel) return PARTY_STANDING_NEUTRAL;

  // Loyalty = weighted combination of affinity (shifted to 0..1) and trust
  const affinityNormalized = (rel.affinity_Q + SCALE.Q) / (2 * SCALE.Q); // -1..1 → 0..1
  const loyalty = (affinityNormalized * 0.6 + rel.trust_Q / SCALE.Q * 0.4) * SCALE.Q;
  return clampQ(Math.round(loyalty), 0, SCALE.Q) as Q;
}

// ── Shared Inventory ──────────────────────────────────────────────────────

export function getPartySharedInventory(
  registry: PartyRegistry,
  partyId: string,
): Inventory | undefined {
  const party = registry.parties.get(partyId);
  return party?.sharedInventory;
}

export function ensurePartySharedInventory(
  registry: PartyRegistry,
  partyId: string,
): Inventory {
  const party = registry.parties.get(partyId);
  if (!party) throw new Error(`Party ${partyId} not found`);
  if (!party.sharedInventory) {
    party.sharedInventory = createInventory(-1);
    // Add a default container
    const container = createContainer(
      `shared-${partyId}`,
      "Shared Storage",
      100 * SCALE.kg, // 100 kg capacity
      0, // empty mass
    );
    addContainer(party.sharedInventory, container);
  }
  return party.sharedInventory;
}

// ── Serialization ─────────────────────────────────────────────────────────────

const MAP_MARKER  = "__ananke_map__";
const SET_MARKER  = "__ananke_set__";

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return { [MAP_MARKER]: true, entries: [...value.entries()] };
  }
  if (value instanceof Set) {
    return { [SET_MARKER]: true, values: [...value.values()] };
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (v[MAP_MARKER] === true) {
      return new Map(v.entries as Array<[unknown, unknown]>);
    }
    if (v[SET_MARKER] === true) {
      return new Set(v.values as unknown[]);
    }
  }
  return value;
}

/** Serialize party registry to JSON string. */
export function serializePartyRegistry(registry: PartyRegistry): string {
  return JSON.stringify(registry, replacer);
}

/** Deserialize party registry from JSON string. */
export function deserializePartyRegistry(json: string): PartyRegistry {
  return JSON.parse(json, reviver) as PartyRegistry;
}