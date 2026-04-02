import { expect, test } from "vitest";
import { createPartyRegistry, createParty, addPartyMember, removePartyMember, setPartyLeader, getPartyForEntity, getPartyIdForEntity, getPartyStanding, setPartyStanding, setMutualPartyStanding, arePartiesHostile, arePartiesFriendly, areEntitiesHostileByParty, areEntitiesFriendlyByParty, getPartyStandingBetweenEntities, computeCompanionLoyalty, getPartySharedInventory, ensurePartySharedInventory, serializePartyRegistry, deserializePartyRegistry } from "../src/party.js";
import { createRelationshipGraph, recordRelationshipEvent } from "../src/relationships.js";
import type { Entity } from "../src/sim/entity.js";
import { areEntitiesHostile } from "../src/sim/team.js";

function mockEntity(id: number, teamId: number, faction?: string, party?: string): Entity {
  return {
    id,
    teamId,
    faction,
    party,
    attributes: {
      morphology: { stature_m: 1700, mass_kg: 70000, actuatorMass_kg: 20000, actuatorScale: 10000, structureScale: 10000, reachScale: 10000 },
      performance: { peakForce_N: 10000, peakPower_W: 10000, continuousPower_W: 5000, reserveEnergy_J: 10000, conversionEfficiency: 10000 },
      control: { controlQuality: 10000, reactionTime_s: 200, stability: 10000, fineControl: 10000 },
      resilience: { surfaceIntegrity: 10000, bulkIntegrity: 10000, structureIntegrity: 10000, distressTolerance: 10000, shockTolerance: 10000, concussionTolerance: 10000, heatTolerance: 10000, coldTolerance: 10000, fatigueRate: 10000, recoveryRate: 10000 },
    },
    energy: { reserveEnergy_J: 10000, fatigue: 0 },
    loadout: { equipped: new Map(), containers: [] },
    traits: [],
    position_m: { x: 0, y: 0, z: 0 },
    velocity_mps: { x: 0, y: 0, z: 0 },
    intent: { facingDirQ: { x: 0, y: 0, z: 0 } },
    action: { facingDirQ: { x: 0, y: 0, z: 0 } },
    condition: {},
    injury: { dead: false, shock: 0, fluidLoss: 0, structuralDamage: 0 },
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: 0, position: "standing" },
  } as Entity;
}

test("createPartyRegistry", () => {
  const registry = createPartyRegistry();
  expect(registry.parties.size).toBe(0);
  expect(registry.relationships.size).toBe(0);
});

test("createParty", () => {
  const registry = createPartyRegistry();
  const party = createParty(registry, "party1", "Adventurers", 1);
  expect(party.id).toBe("party1");
  expect(party.name).toBe("Adventurers");
  expect(party.leaderId).toBe(1);
  expect(party.memberIds.has(1)).toBe(true);
  expect(registry.parties.get("party1")).toBe(party);
  // self-standing
  expect(getPartyStanding(registry, "party1", "party1")).toBe(/* ALLIED */ 10000);
});

test("addPartyMember", () => {
  const registry = createPartyRegistry();
  createParty(registry, "party1", "Adventurers", 1);
  const entity = mockEntity(2, 1);
  addPartyMember(registry, "party1", 2, entity);
  const party = registry.parties.get("party1")!;
  expect(party.memberIds.has(2)).toBe(true);
  expect(entity.party).toBe("party1");
});

test("removePartyMember", () => {
  const registry = createPartyRegistry();
  createParty(registry, "party1", "Adventurers", 1);
  const entity = mockEntity(2, 1, undefined, "party1");
  addPartyMember(registry, "party1", 2, entity);
  removePartyMember(registry, "party1", 2, entity);
  const party = registry.parties.get("party1")!;
  expect(party.memberIds.has(2)).toBe(false);
  expect(entity.party).toBeUndefined();
});

test("setPartyLeader", () => {
  const registry = createPartyRegistry();
  createParty(registry, "party1", "Adventurers", 1);
  addPartyMember(registry, "party1", 2);
  setPartyLeader(registry, "party1", 2);
  const party = registry.parties.get("party1")!;
  expect(party.leaderId).toBe(2);
});

test("party standing", () => {
  const registry = createPartyRegistry();
  createParty(registry, "party1", "A", 1);
  createParty(registry, "party2", "B", 2);
  expect(getPartyStanding(registry, "party1", "party2")).toBe(/* NEUTRAL */ 5000);
  setMutualPartyStanding(registry, "party1", "party2", 8000);
  expect(getPartyStanding(registry, "party1", "party2")).toBe(8000);
  expect(getPartyStanding(registry, "party2", "party1")).toBe(8000);
});

test("arePartiesHostile/Friendly", () => {
  const registry = createPartyRegistry();
  createParty(registry, "party1", "A", 1);
  createParty(registry, "party2", "B", 2);
  // neutral -> not hostile, not friendly
  expect(arePartiesHostile(registry, "party1", "party2")).toBe(false);
  expect(arePartiesFriendly(registry, "party1", "party2")).toBe(false);
  // hostile
  setMutualPartyStanding(registry, "party1", "party2", 2000);
  expect(arePartiesHostile(registry, "party1", "party2")).toBe(true);
  expect(arePartiesFriendly(registry, "party1", "party2")).toBe(false);
  // friendly
  setMutualPartyStanding(registry, "party1", "party2", 8000);
  expect(arePartiesHostile(registry, "party1", "party2")).toBe(false);
  expect(arePartiesFriendly(registry, "party1", "party2")).toBe(true);
});

test("areEntitiesHostileByParty", () => {
  const registry = createPartyRegistry();
  createParty(registry, "party1", "A", 1);
  createParty(registry, "party2", "B", 2);
  const entity1 = mockEntity(1, 1, undefined, "party1");
  const entity2 = mockEntity(2, 2, undefined, "party2");
  // neutral
  expect(areEntitiesHostileByParty(registry, entity1, entity2)).toBe(false);
  expect(areEntitiesFriendlyByParty(registry, entity1, entity2)).toBe(false);
  // hostile
  setMutualPartyStanding(registry, "party1", "party2", 2000);
  expect(areEntitiesHostileByParty(registry, entity1, entity2)).toBe(true);
  expect(areEntitiesFriendlyByParty(registry, entity1, entity2)).toBe(false);
  // friendly
  setMutualPartyStanding(registry, "party1", "party2", 8000);
  expect(areEntitiesHostileByParty(registry, entity1, entity2)).toBe(false);
  expect(areEntitiesFriendlyByParty(registry, entity1, entity2)).toBe(true);
});

test("areEntitiesHostile integration", () => {
  const world: import("../src/sim/world.js").WorldState = {
    tick: 0,
    seed: 0,
    entities: [],
    runtimeState: { partyRegistry: createPartyRegistry() },
  };
  const registry = world.runtimeState.partyRegistry!;
  createParty(registry, "party1", "A", 1);
  createParty(registry, "party2", "B", 2);
  const entity1 = mockEntity(1, 1, undefined, "party1");
  const entity2 = mockEntity(2, 2, undefined, "party2");
  world.entities.push(entity1, entity2);
  // neutral parties, different team -> hostile
  expect(areEntitiesHostile(entity1, entity2, world)).toBe(true);
  // set friendly standing -> not hostile
  setMutualPartyStanding(registry, "party1", "party2", 8000);
  expect(areEntitiesHostile(entity1, entity2, world)).toBe(false);
  // set hostile standing -> hostile
  setMutualPartyStanding(registry, "party1", "party2", 2000);
  expect(areEntitiesHostile(entity1, entity2, world)).toBe(true);
});

test("computeCompanionLoyalty", () => {
  const graph = createRelationshipGraph();
  const companion = mockEntity(2, 1);
  const leaderId = 1;

  // No relationship -> neutral loyalty (0.5)
  expect(computeCompanionLoyalty(companion, leaderId, graph)).toBe(/* NEUTRAL */ 5000);

  // Positive affinity and trust -> high loyalty
  recordRelationshipEvent(graph, 2, 1, {
    tick: 0,
    type: "fought_alongside",
    magnitude_Q: 8000,
  });
  // After positive event, affinity and trust increased
  const loyalty = computeCompanionLoyalty(companion, leaderId, graph);
  expect(loyalty).toBeGreaterThan(5000);
  expect(loyalty).toBeLessThanOrEqual(10000);

  // Negative affinity -> low loyalty
  const graph2 = createRelationshipGraph();
  recordRelationshipEvent(graph2, 2, 1, {
    tick: 0,
    type: "betrayed",
    magnitude_Q: 8000,
  });
  const lowLoyalty = computeCompanionLoyalty(companion, leaderId, graph2);
  expect(lowLoyalty).toBeLessThan(5000);
  expect(lowLoyalty).toBeGreaterThanOrEqual(0);
});

test("party shared inventory", () => {
  const registry = createPartyRegistry();
  createParty(registry, "party1", "Adventurers", 1);
  expect(getPartySharedInventory(registry, "party1")).toBeUndefined();
  const inv = ensurePartySharedInventory(registry, "party1");
  expect(inv).toBeDefined();
  expect(inv.ownerId).toBe(-1);
  expect(inv.containers).toHaveLength(1);
  expect(getPartySharedInventory(registry, "party1")).toBe(inv);
});

test("addPartyMember without entity param", () => {
  const registry = createPartyRegistry();
  createParty(registry, "party1", "Adventurers", 1);
  addPartyMember(registry, "party1", 2);
  const party = registry.parties.get("party1")!;
  expect(party.memberIds.has(2)).toBe(true);
});

test("addPartyMember throws when party not found", () => {
  const registry = createPartyRegistry();
  expect(() => addPartyMember(registry, "nonexistent", 2)).toThrow("Party nonexistent not found");
});

test("removePartyMember without entity param", () => {
  const registry = createPartyRegistry();
  createParty(registry, "party1", "Adventurers", 1);
  addPartyMember(registry, "party1", 2);
  removePartyMember(registry, "party1", 2);
  const party = registry.parties.get("party1")!;
  expect(party.memberIds.has(2)).toBe(false);
});

test("removePartyMember when party not found (no-op)", () => {
  const registry = createPartyRegistry();
  // Should not throw
  removePartyMember(registry, "nonexistent", 2);
});

test("removePartyMember when entity.party mismatch", () => {
  const registry = createPartyRegistry();
  createParty(registry, "party1", "A", 1);
  createParty(registry, "party2", "B", 2);
  const entity = mockEntity(3, 1, undefined, "party2"); // belongs to party2
  addPartyMember(registry, "party1", 3, entity); // adds to party1, entity.party becomes "party1"
  // Now remove from party1 with entity param
  removePartyMember(registry, "party1", 3, entity);
  expect(entity.party).toBeUndefined();
});

test("setPartyLeader throws when party not found", () => {
  const registry = createPartyRegistry();
  expect(() => setPartyLeader(registry, "nonexistent", 2)).toThrow("Party nonexistent not found");
});

test("setPartyLeader throws when new leader not member", () => {
  const registry = createPartyRegistry();
  createParty(registry, "party1", "Adventurers", 1);
  expect(() => setPartyLeader(registry, "party1", 999)).toThrow("New leader 999 is not a member of party party1");
});

test("getPartyStandingBetweenEntities", () => {
  const registry = createPartyRegistry();
  createParty(registry, "party1", "A", 1);
  createParty(registry, "party2", "B", 2);
  const entity1 = mockEntity(1, 1, undefined, "party1");
  const entity2 = mockEntity(2, 2, undefined, "party2");
  // default neutral
  expect(getPartyStandingBetweenEntities(registry, entity1, entity2)).toBe(5000);
  // undefined when missing party
  const entityNoParty = mockEntity(3, 1);
  expect(getPartyStandingBetweenEntities(registry, entity1, entityNoParty)).toBeUndefined();
  // after setting standing
  setMutualPartyStanding(registry, "party1", "party2", 8000);
  expect(getPartyStandingBetweenEntities(registry, entity1, entity2)).toBe(8000);
});

test("setPartyStanding asymmetric", () => {
  const registry = createPartyRegistry();
  createParty(registry, "party1", "A", 1);
  createParty(registry, "party2", "B", 2);
  // Set asymmetric standing
  setPartyStanding(registry, "party1", "party2", 3000);
  setPartyStanding(registry, "party2", "party1", 7000);
  expect(getPartyStanding(registry, "party1", "party2")).toBe(3000);
  expect(getPartyStanding(registry, "party2", "party1")).toBe(7000);
});

test("arePartiesHostile/Friendly thresholds", () => {
  const registry = createPartyRegistry();
  createParty(registry, "party1", "A", 1);
  createParty(registry, "party2", "B", 2);
  // Exactly at hostile threshold (0.30) -> not hostile (strict <)
  setMutualPartyStanding(registry, "party1", "party2", 3000);
  expect(arePartiesHostile(registry, "party1", "party2")).toBe(false);
  // Below threshold -> hostile
  setMutualPartyStanding(registry, "party1", "party2", 2999);
  expect(arePartiesHostile(registry, "party1", "party2")).toBe(true);
  // Exactly at friendly threshold (0.70) -> friendly (>=)
  setMutualPartyStanding(registry, "party1", "party2", 7000);
  expect(arePartiesFriendly(registry, "party1", "party2")).toBe(true);
  // Above threshold -> friendly
  setMutualPartyStanding(registry, "party1", "party2", 7001);
  expect(arePartiesFriendly(registry, "party1", "party2")).toBe(true);
  // Below threshold -> not friendly
  setMutualPartyStanding(registry, "party1", "party2", 6999);
  expect(arePartiesFriendly(registry, "party1", "party2")).toBe(false);
});

test("serialize and deserialize party registry", () => {
  const registry = createPartyRegistry();
  createParty(registry, "party1", "Adventurers", 1);
  createParty(registry, "party2", "Bandits", 2);
  addPartyMember(registry, "party1", 3);
  setMutualPartyStanding(registry, "party1", "party2", 2000);
  ensurePartySharedInventory(registry, "party1");

  const json = serializePartyRegistry(registry);
  expect(typeof json).toBe("string");

  const restored = deserializePartyRegistry(json);
  expect(restored.parties.size).toBe(2);
  expect(restored.parties.get("party1")?.name).toBe("Adventurers");
  expect(restored.parties.get("party1")?.memberIds.has(3)).toBe(true);
  expect(restored.parties.get("party1")?.sharedInventory).toBeDefined();
  expect(getPartyStanding(restored, "party1", "party2")).toBe(2000);
});

test("getPartyForEntity and getPartyIdForEntity", () => {
  const registry = createPartyRegistry();
  createParty(registry, "party1", "Adventurers", 1);
  addPartyMember(registry, "party1", 2);
  addPartyMember(registry, "party1", 3);
  createParty(registry, "party2", "Bandits", 4);
  addPartyMember(registry, "party2", 5);

  expect(getPartyForEntity(registry, 1)?.id).toBe("party1");
  expect(getPartyForEntity(registry, 2)?.id).toBe("party1");
  expect(getPartyForEntity(registry, 5)?.id).toBe("party2");
  expect(getPartyForEntity(registry, 999)).toBeUndefined();

  expect(getPartyIdForEntity(registry, 1)).toBe("party1");
  expect(getPartyIdForEntity(registry, 2)).toBe("party1");
  expect(getPartyIdForEntity(registry, 5)).toBe("party2");
  expect(getPartyIdForEntity(registry, 999)).toBeUndefined();
});

test("areEntitiesHostileByParty with missing party", () => {
  const registry = createPartyRegistry();
  createParty(registry, "party1", "A", 1);
  const entity1 = mockEntity(1, 1, undefined, "party1");
  const entity2 = mockEntity(2, 2); // no party
  const entity3 = mockEntity(3, 1); // no party, same team
  // Entity with party vs entity without party -> not hostile by party (returns false)
  expect(areEntitiesHostileByParty(registry, entity1, entity2)).toBe(false);
  expect(areEntitiesFriendlyByParty(registry, entity1, entity2)).toBe(false);
  // Both without party -> false
  expect(areEntitiesHostileByParty(registry, entity2, entity3)).toBe(false);
  expect(areEntitiesFriendlyByParty(registry, entity2, entity3)).toBe(false);
});

test("areEntitiesHostileByParty edge cases", () => {
  const registry = createPartyRegistry();
  createParty(registry, "party1", "A", 1);
  createParty(registry, "party2", "B", 2);
  const entity1 = mockEntity(1, 1, undefined, "party1");
  const entity2 = mockEntity(2, 2, undefined, "party2");
  // Set hostile standing
  setMutualPartyStanding(registry, "party1", "party2", 2000);
  expect(areEntitiesHostileByParty(registry, entity1, entity2)).toBe(true);
  expect(areEntitiesFriendlyByParty(registry, entity1, entity2)).toBe(false);
  // Set friendly standing
  setMutualPartyStanding(registry, "party1", "party2", 8000);
  expect(areEntitiesHostileByParty(registry, entity1, entity2)).toBe(false);
  expect(areEntitiesFriendlyByParty(registry, entity1, entity2)).toBe(true);
});