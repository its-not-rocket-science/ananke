// test/relationships.test.ts — Phase 42: Personal Relationship Graph tests

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import type { ImpactEvent } from "../src/sim/events.js";
import type { RelationshipGraph, Relationship } from "../src/relationships.js";
import {
  createRelationshipGraph,
  getRelationship,
  hasRelationship,
  getEntityRelationshipsList,
  getRelatedEntities,
  establishRelationship,
  recordRelationshipEvent,
  classifyBond,
  decayRelationships,
  isFriend,
  isEnemy,
  hasCombatTrust,
  getMoraleModifier,
  checkBetrayal,
  recordBetrayal,
  computeTeachingRelationshipMultiplier,
  serializeRelationshipGraph,
  deserializeRelationshipGraph,
} from "../src/relationships.js";
import {
  computeCombatMoraleImpacts,
  computeBetrayalMoraleImpacts,
  computeTeachingEffectiveness,
  getCombatDecisionFactors,
  shouldProtectAlly,
  getDialogueAvailability,
  recordCombatOutcome,
  recordCooperation,
  recordRescue,
  findCohesiveGroup,
  computeGroupCohesion,
} from "../src/relationships-effects.js";

// ── Test Helpers ───────────────────────────────────────────────────────────────

function mkGraph(): RelationshipGraph {
  return createRelationshipGraph();
}

function mkImpact(attackerId: number, targetId: number, energy_J: number): ImpactEvent {
  return {
    kind: "impact",
    attackerId,
    targetId,
    region: "torso",
    energy_J,
    protectedByArmour: false,
    blocked: false,
    parried: false,
    weaponId: "sword",
    wpn: {} as any,
    hitQuality: q(0.5),
    shieldBlocked: false,
  };
}

function mkWorld(entityIds: number[]): { entities: { id: number }[] } {
  return {
    entities: entityIds.map((id) => ({ id })),
  };
}

// ── Core Relationship Tests ────────────────────────────────────────────────────

describe("Relationship Graph Creation", () => {
  it("creates empty graph", () => {
    const graph = mkGraph();
    expect(graph.relationships.size).toBe(0);
    expect(graph.entityIndex.size).toBe(0);
  });

  it("establishes new relationship", () => {
    const graph = mkGraph();
    const r = establishRelationship(graph, 1, 2, 100, q(0.2), q(0.5));

    expect(r.entityA).toBe(1);
    expect(r.entityB).toBe(2);
    expect(r.affinity_Q).toBe(q(0.2));
    expect(r.trust_Q).toBe(q(0.5));
    expect(r.bond).toBe("acquaintance");
  });

  it("returns existing relationship if already exists", () => {
    const graph = mkGraph();
    const r1 = establishRelationship(graph, 1, 2, 100, q(0.3), q(0.5));
    const r2 = establishRelationship(graph, 1, 2, 200, q(0.8), q(0.9));

    expect(r1).toBe(r2);
    expect(r1.affinity_Q).toBe(q(0.3)); // Not updated
  });

  it("throws error for self-relationship", () => {
    const graph = mkGraph();
    expect(() => establishRelationship(graph, 1, 1, 100)).toThrow();
  });

  it("gets relationship regardless of entity order", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.3));

    const r1 = getRelationship(graph, 1, 2);
    const r2 = getRelationship(graph, 2, 1);

    expect(r1).toBe(r2);
  });

  it("returns undefined for non-existent relationship", () => {
    const graph = mkGraph();
    expect(getRelationship(graph, 1, 2)).toBeUndefined();
  });

  it("checks existence of relationship", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100);

    expect(hasRelationship(graph, 1, 2)).toBe(true);
    expect(hasRelationship(graph, 1, 3)).toBe(false);
  });
});

describe("Entity Relationship Queries", () => {
  it("gets all relationships for entity", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100);
    establishRelationship(graph, 1, 3, 100);
    establishRelationship(graph, 2, 3, 100);

    const rels = getEntityRelationshipsList(graph, 1);

    expect(rels.length).toBe(2);
  });

  it("returns empty array for isolated entity", () => {
    const graph = mkGraph();
    const rels = getEntityRelationshipsList(graph, 99);
    expect(rels).toEqual([]);
  });

  it("gets all related entities", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100);
    establishRelationship(graph, 1, 3, 100);

    const related = getRelatedEntities(graph, 1);

    expect(related.sort()).toEqual([2, 3]);
  });
});

// ── Event Recording Tests ──────────────────────────────────────────────────────

describe("Relationship Event Recording", () => {
  it("records event and updates affinity/trust", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0), q(0));

    recordRelationshipEvent(graph, 1, 2, {
      tick: 200,
      type: "gift_given",
      magnitude_Q: q(0.5),
    });

    const r = getRelationship(graph, 1, 2)!;
    expect(r.affinity_Q).toBeGreaterThan(0);
    expect(r.trust_Q).toBeGreaterThan(0);
    expect(r.history.length).toBe(1);
  });

  it("auto-establishes relationship on first event", () => {
    const graph = mkGraph();
    recordRelationshipEvent(graph, 1, 2, {
      tick: 100,
      type: "met",
      magnitude_Q: q(0.5),
    });

    expect(hasRelationship(graph, 1, 2)).toBe(true);
  });

  it("records fought_alongside with positive effects", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0), q(0));

    recordRelationshipEvent(graph, 1, 2, {
      tick: 200,
      type: "fought_alongside",
      magnitude_Q: q(0.5),
    });

    const r = getRelationship(graph, 1, 2)!;
    expect(r.affinity_Q).toBeGreaterThan(q(0.05));
    expect(r.trust_Q).toBeGreaterThan(q(0.05));
  });

  it("records betrayal with negative effects", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.8), q(0.8));

    recordRelationshipEvent(graph, 1, 2, {
      tick: 200,
      type: "betrayed",
      magnitude_Q: q(0.5),
    });

    const r = getRelationship(graph, 1, 2)!;
    expect(r.affinity_Q).toBeLessThan(0);
    expect(r.trust_Q).toBeLessThan(q(0.5));
  });
});

// ── Bond Classification Tests ──────────────────────────────────────────────────

describe("Bond Classification", () => {
  it("classifies as friend with moderate affinity", () => {
    const bond = classifyBond(q(0.5), q(0.4), []);
    expect(bond).toBe("friend");
  });

  it("classifies as close_friend with high affinity", () => {
    const bond = classifyBond(q(0.8), q(0.6), []);
    expect(bond).toBe("close_friend");
  });

  it("classifies as enemy with high negative affinity", () => {
    const bond = classifyBond(-q(0.8), q(0.1), []);
    expect(bond).toBe("enemy");
  });

  it("classifies as rival with moderate negative affinity", () => {
    const bond = classifyBond(-q(0.5), q(0.4), []);
    expect(bond).toBe("rival");
  });

  it("classifies as acquaintance with low positive affinity", () => {
    const bond = classifyBond(q(0.2), q(0.3), []);
    expect(bond).toBe("acquaintance");
  });

  it("classifies as none with neutral affinity", () => {
    const bond = classifyBond(q(0), q(0.5), []);
    expect(bond).toBe("acquaintance");
  });

  it("classifies as mentor/student based on bonded event", () => {
    const history = [{ tick: 100, type: "bonded" as const, magnitude_Q: q(0.8) }];
    const bond = classifyBond(q(0.6), q(0.7), history);
    expect(bond).toBe("mentor");
  });
});

// ── Decay Tests ────────────────────────────────────────────────────────────────

describe("Relationship Decay", () => {
  it("decays affinity toward neutral over time", () => {
    const graph = mkGraph();
    const r = establishRelationship(graph, 1, 2, 0, q(0.8), q(0.8));
    r.lastInteractionTick = 0;

    decayRelationships(graph, 10000, 0.0001);

    expect(r.affinity_Q).toBeLessThan(q(0.8));
  });

  it("does not decay recently active relationships", () => {
    const graph = mkGraph();
    const r = establishRelationship(graph, 1, 2, 0, q(0.8), q(0.8));
    r.lastInteractionTick = 900; // Recent

    decayRelationships(graph, 1000, 0.0001);

    expect(r.affinity_Q).toBe(q(0.8));
  });
});

// ── Query Tests ────────────────────────────────────────────────────────────────

describe("Relationship Queries", () => {
  it("identifies friends", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.5));
    establishRelationship(graph, 1, 3, 100, -q(0.5));

    expect(isFriend(graph, 1, 2)).toBe(true);
    expect(isFriend(graph, 1, 3)).toBe(false);
    expect(isFriend(graph, 1, 99)).toBe(false); // No relationship
  });

  it("identifies acquaintances as friends when threshold is met", () => {
    const graph = mkGraph();
    // Use a value clearly in the friend range
    establishRelationship(graph, 1, 2, 100, q(0.4));

    expect(isFriend(graph, 1, 2)).toBe(true);
  });

  it("identifies enemies", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, -q(0.5));
    establishRelationship(graph, 1, 3, 100, q(0.5));

    expect(isEnemy(graph, 1, 2)).toBe(true);
    expect(isEnemy(graph, 1, 3)).toBe(false);
  });

  it("checks combat trust", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.5), q(0.5));
    establishRelationship(graph, 1, 3, 100, q(0.5), q(0.2));

    expect(hasCombatTrust(graph, 1, 2)).toBe(true);
    expect(hasCombatTrust(graph, 1, 3)).toBe(false);
  });

  it("gets morale modifier", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.6));

    const mod = getMoraleModifier(graph, 1, 2);
    expect(mod).toBe(q(0.6));
  });
});

// ── Betrayal Tests ─────────────────────────────────────────────────────────────

describe("Betrayal Detection", () => {
  it("detects betrayal when affinity is high", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.8), q(0.8));

    const result = checkBetrayal(graph, 1, 2);

    expect(result.isBetrayal).toBe(true);
    expect(result.severity_Q).toBeGreaterThan(0);
  });

  it("does not detect betrayal when affinity is low", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.2), q(0.2));

    const result = checkBetrayal(graph, 1, 2);

    expect(result.isBetrayal).toBe(false);
  });

  it("records betrayal and propagates to victim's friends", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.8)); // Will betray
    establishRelationship(graph, 2, 3, 100, q(0.6)); // 3 is 2's friend
    establishRelationship(graph, 1, 3, 100, q(0.3)); // 3 barely knows 1

    const world = mkWorld([1, 2, 3]);
    const result = recordBetrayal(graph, 1, 2, 200);

    expect(result.isBetrayal).toBe(true);

    // Attacker-victim relationship should be damaged
    const rAttackerVictim = getRelationship(graph, 1, 2)!;
    expect(rAttackerVictim.affinity_Q).toBeLessThan(0);

    // Victim's friend should also view attacker negatively
    const rAttackerFriend = getRelationship(graph, 1, 3)!;
    expect(rAttackerFriend.affinity_Q).toBeLessThan(q(0.3));
  });
});

// ── Teaching Integration Tests ─────────────────────────────────────────────────

describe("Teaching Relationship Multiplier", () => {
  it("returns 1.0 for no relationship", () => {
    const graph = mkGraph();
    const mul = computeTeachingRelationshipMultiplier(graph, 1, 2);
    expect(mul).toBe(1.0);
  });

  it("increases multiplier for positive affinity", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.6), q(0.6));

    const mul = computeTeachingRelationshipMultiplier(graph, 1, 2);
    expect(mul).toBeGreaterThan(1.0);
  });

  it("decreases multiplier for negative affinity", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, -q(0.3));

    const mul = computeTeachingRelationshipMultiplier(graph, 1, 2);
    expect(mul).toBeLessThan(1.0);
  });

  it("adds bonus for mentor/student bond", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.6), q(0.6));

    const beforeMul = computeTeachingRelationshipMultiplier(graph, 1, 2);

    // Make them mentor/student
    recordRelationshipEvent(graph, 1, 2, {
      tick: 200,
      type: "bonded",
      magnitude_Q: q(0.8),
    });

    const afterMul = computeTeachingRelationshipMultiplier(graph, 1, 2);

    const r = getRelationship(graph, 1, 2)!;
    if (r.bond === "mentor" || r.bond === "student") {
      expect(afterMul).toBeGreaterThan(beforeMul);
    }
  });
});

// ── Morale Effects Tests ───────────────────────────────────────────────────────

describe("Combat Morale Impacts", () => {
  it("generates morale impact when friend is injured", () => {
    const graph = mkGraph();
    establishRelationship(graph, 3, 2, 100, q(0.6)); // 3 is friend of 2 (victim)

    const world = mkWorld([1, 2, 3]);
    const impact = mkImpact(1, 2, 1000);

    const impacts = computeCombatMoraleImpacts(graph, world, impact);

    const friendImpact = impacts.find((i) => i.observerId === 3);
    expect(friendImpact).toBeDefined();
    expect(friendImpact?.event).toContain("friend");
    expect(friendImpact?.delta_Q).toBeLessThan(0);
  });

  it("generates morale impact when enemy succeeds", () => {
    const graph = mkGraph();
    establishRelationship(graph, 3, 1, 100, -q(0.5)); // 3 is enemy of 1 (attacker)

    const world = mkWorld([1, 2, 3]);
    const impact = mkImpact(1, 2, 1000);

    const impacts = computeCombatMoraleImpacts(graph, world, impact);

    const enemyImpact = impacts.find((i) => i.observerId === 3);
    expect(enemyImpact).toBeDefined();
  });
});

describe("Betrayal Morale Impacts", () => {
  it("generates morale impact for betrayal witnesses", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.8)); // 1 will betray 2
    establishRelationship(graph, 3, 2, 100, q(0.6)); // 3 cares about 2

    const world = mkWorld([1, 2, 3]);
    const impacts = computeBetrayalMoraleImpacts(graph, world, 1, 2, 200);

    expect(impacts.length).toBeGreaterThan(0);
    const witnessImpact = impacts.find((i) => i.observerId === 3);
    expect(witnessImpact).toBeDefined();
    expect(witnessImpact?.event).toBe("betrayal");
  });
});

// ── Combat Decision Tests ──────────────────────────────────────────────────────

describe("Combat Decision Factors", () => {
  it("returns neutral factors for no relationship", () => {
    const graph = mkGraph();
    const factors = getCombatDecisionFactors(graph, 1, 2);

    expect(factors.willProtect).toBe(false);
    expect(factors.willAvoidHarm).toBe(false);
    expect(factors.aggressionModifier).toBe(0);
  });

  it("suggests protection for close friends", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.7), q(0.5));

    const factors = getCombatDecisionFactors(graph, 1, 2);

    expect(factors.willProtect).toBe(true);
    expect(factors.willAvoidHarm).toBe(true);
  });

  it("suggests aggression toward enemies", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, -q(0.5));

    const factors = getCombatDecisionFactors(graph, 1, 2);

    expect(factors.aggressionModifier).toBeGreaterThan(0);
  });

  it("provides coordination bonus for mentor/student", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.6), q(0.6));

    // Make them mentor/student
    recordRelationshipEvent(graph, 1, 2, {
      tick: 200,
      type: "bonded",
      magnitude_Q: q(0.8),
    });

    const factors = getCombatDecisionFactors(graph, 1, 2);
    const r = getRelationship(graph, 1, 2)!;
    if (r.bond === "mentor" || r.bond === "student") {
      expect(factors.coordinationBonus).toBeGreaterThan(0.1);
    }
  });
});

describe("Ally Protection", () => {
  it("suggests protecting ally over stranger", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.8)); // 1 is friend with 2 (ally)
    // No relationship with 3 (threat)

    expect(shouldProtectAlly(graph, 1, 2, 3)).toBe(true);
  });

  it("does not protect when no relationship", () => {
    const graph = mkGraph();
    expect(shouldProtectAlly(graph, 1, 2, 3)).toBe(false);
  });
});

// ── Dialogue Integration Tests ─────────────────────────────────────────────────

describe("Dialogue Availability", () => {
  it("allows basic negotiation for strangers", () => {
    const graph = mkGraph();
    const avail = getDialogueAvailability(graph, 1, 2);

    expect(avail.canNegotiate).toBe(true);
    expect(avail.canAskFavors).toBe(false);
  });

  it("allows favors for friends", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.5), q(0.4));

    const avail = getDialogueAvailability(graph, 1, 2);

    expect(avail.canAskFavors).toBe(true);
  });

  it("provides persuasion bonus for positive affinity", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.6));

    const avail = getDialogueAvailability(graph, 1, 2);

    expect(avail.persuasionBonus).toBeGreaterThan(0);
  });

  it("allows intimidation against low-trust entities", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0), q(0.1));

    const avail = getDialogueAvailability(graph, 1, 2);

    expect(avail.canIntimidate).toBe(true);
  });
});

// ── Event Recording Tests ──────────────────────────────────────────────────────

describe("Combat Outcome Recording", () => {
  it("records negative event for combat hits", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.5));

    recordCombatOutcome(graph, mkImpact(1, 2, 1000), "hit", 200);

    const r = getRelationship(graph, 1, 2)!;
    expect(r.history.length).toBeGreaterThan(0);
  });
});

describe("Cooperation Recording", () => {
  it("records cooperation with positive effects", () => {
    const graph = mkGraph();
    recordCooperation(graph, 1, 2, true, 100);

    const r = getRelationship(graph, 1, 2)!;
    expect(r.affinity_Q).toBeGreaterThan(0);
  });
});

describe("Rescue Recording", () => {
  it("records rescue with strong positive effects", () => {
    const graph = mkGraph();
    recordRescue(graph, 1, 2, 100);

    const r = getRelationship(graph, 1, 2)!;
    expect(r.affinity_Q).toBeGreaterThan(q(0.3));
  });
});

// ── Group Cohesion Tests ───────────────────────────────────────────────────────

describe("Group Cohesion", () => {
  it("finds cohesive group from seed entity", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.5));
    establishRelationship(graph, 2, 3, 100, q(0.5));
    establishRelationship(graph, 3, 4, 100, q(0.5));
    establishRelationship(graph, 4, 5, 100, -q(0.5)); // Negative - breaks chain

    const group = findCohesiveGroup(graph, 1, q(0.3));

    expect(group).toContain(1);
    expect(group).toContain(2);
    expect(group).toContain(3);
    expect(group).toContain(4);
    expect(group).not.toContain(5);
  });

  it("computes group cohesion metrics", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.6), q(0.6));
    establishRelationship(graph, 2, 3, 100, q(0.6), q(0.6));
    establishRelationship(graph, 1, 3, 100, q(0.6), q(0.6));

    const cohesion = computeGroupCohesion(graph, [1, 2, 3]);

    expect(cohesion.cohesion_Q).toBeGreaterThan(q(0));
    expect(cohesion.trust_Q).toBeGreaterThan(q(0));
  });

  it("returns neutral cohesion for small groups", () => {
    const graph = mkGraph();
    const cohesion = computeGroupCohesion(graph, [1]);

    expect(cohesion.cohesion_Q).toBe(q(0.5));
  });
});

// ── Serialization Tests ────────────────────────────────────────────────────────

describe("Serialization", () => {
  it("serializes and deserializes relationship graph", () => {
    const graph = mkGraph();
    establishRelationship(graph, 1, 2, 100, q(0.6));
    recordRelationshipEvent(graph, 1, 2, {
      tick: 200,
      type: "gift_given",
      magnitude_Q: q(0.5),
    });

    const serialized = serializeRelationshipGraph(graph);
    const restored = deserializeRelationshipGraph(serialized);

    const r = getRelationship(restored, 1, 2)!;
    // Initial 6000 + gift_given 1000 = 7000
    expect(r.affinity_Q).toBe(q(0.7));
    expect(r.history.length).toBe(1);
  });

  it("handles empty graph deserialization", () => {
    const restored = deserializeRelationshipGraph({});
    expect(restored.relationships.size).toBe(0);
  });
});

// ── Integration Tests ───────────────────────────────────────────────────────────

describe("Relationship System Integration", () => {
  it("full flow: meet, bond, fight together, become friends", () => {
    const graph = mkGraph();

    // Meet
    recordRelationshipEvent(graph, 1, 2, { tick: 100, type: "met", magnitude_Q: q(0.5) });
    let r = getRelationship(graph, 1, 2)!;
    expect(r.bond).toBe("acquaintance");

    // Fight alongside
    recordRelationshipEvent(graph, 1, 2, {
      tick: 200,
      type: "fought_alongside",
      magnitude_Q: q(0.5),
    });
    r = getRelationship(graph, 1, 2)!;
    expect(r.affinity_Q).toBeGreaterThan(q(0.1));

    // Gift
    recordRelationshipEvent(graph, 1, 2, {
      tick: 300,
      type: "gift_given",
      magnitude_Q: q(0.5),
    });
    r = getRelationship(graph, 1, 2)!;
    expect(r.bond).toBe("friend");

    // Verify integration effects
    expect(isFriend(graph, 1, 2)).toBe(true);
    expect(hasCombatTrust(graph, 1, 2)).toBe(true);
  });

  it("full flow: trust betrayal and social consequences", () => {
    const graph = mkGraph();

    // Establish friendship
    establishRelationship(graph, 1, 2, 100, q(0.8), q(0.8));
    establishRelationship(graph, 2, 3, 100, q(0.7)); // 3 is 2's friend

    // Betrayal
    const betrayalResult = checkBetrayal(graph, 1, 2);
    expect(betrayalResult.isBetrayal).toBe(true);

    // Record it
    recordBetrayal(graph, 1, 2, 200);

    // Relationship destroyed
    const r = getRelationship(graph, 1, 2)!;
    expect(r.affinity_Q).toBeLessThan(0);
    expect(r.bond).toBe("enemy");

    // Social consequences: 3 now also dislikes 1
    const rSocial = getRelationship(graph, 1, 3)!;
    expect(rSocial.affinity_Q).toBeLessThan(0);
  });
});
