// src/relationships-effects.ts — Phase 42: Relationship Effects Integration
//
// Integration of relationship graph with morale, teaching, and combat systems.

import type { Q } from "./units.js";
import { q, mulDiv, SCALE } from "./units.js";
import type { Entity } from "./sim/entity.js";
import type { WorldState } from "./sim/world.js";
import type { ImpactEvent } from "./sim/events.js";
import type { RelationshipGraph } from "./relationships.js";
import {
  getRelationship,
  isFriend,
  isEnemy,
  recordRelationshipEvent,
  recordBetrayal,
  computeTeachingRelationshipMultiplier,
} from "./relationships.js";

// ── Morale Integration ────────────────────────────────────────────────────────

/** Morale impact when witnessing an event involving someone you know. */
export interface MoraleImpact {
  observerId: number;
  targetId: number;
  event: "friend_injured" | "friend_killed" | "enemy_defeated" | "enemy_injured" | "betrayal";
  delta_Q: Q;
}

/**
 * Compute morale impacts for all observers of a combat event.
 */
export function computeCombatMoraleImpacts(
  graph: RelationshipGraph,
  world: WorldState,
  impact: ImpactEvent,
): MoraleImpact[] {
  const impacts: MoraleImpact[] = [];

  // Get all potential observers (simplified: all entities in world)
  // In practice, this would use spatial queries for entities within perception range
  const observers = world.entities;

  for (const observer of observers) {
    if (observer.id === impact.attackerId || observer.id === impact.targetId) continue;

    // Check relationship with victim
    const rVictim = getRelationship(graph, observer.id, impact.targetId);
    if (rVictim && rVictim.affinity_Q > q(0.3)) {
      // Friend was hit
      const severity = impact.energy_J > 500 ? "friend_killed" : "friend_injured";
      impacts.push({
        observerId: observer.id,
        targetId: impact.targetId,
        event: severity,
        delta_Q: Math.round(-rVictim.affinity_Q * (severity === "friend_killed" ? 0.5 : 0.2)) as Q,
      });
    }

    // Check relationship with attacker
    const rAttacker = getRelationship(graph, observer.id, impact.attackerId);
    if (rAttacker && rAttacker.affinity_Q < -q(0.3)) {
      // Enemy succeeded in hitting someone
      impacts.push({
        observerId: observer.id,
        targetId: impact.attackerId,
        event: "enemy_defeated",
        delta_Q: Math.round(rAttacker.affinity_Q * 0.1) as Q, // Negative = bad for morale
      });
    }
  }

  return impacts;
}

/**
 * Compute morale impact from betrayal detection.
 */
export function computeBetrayalMoraleImpacts(
  graph: RelationshipGraph,
  world: WorldState,
  attackerId: number,
  victimId: number,
  tick: number,
): MoraleImpact[] {
  const impacts: MoraleImpact[] = [];

  // Record betrayal in relationship graph
  const betrayalResult = recordBetrayal(graph, attackerId, victimId, tick);

  if (!betrayalResult.isBetrayal) return impacts;

  // Find all witnesses who care about the victim
  const witnesses = world.entities.filter(
    (e) => e.id !== attackerId && e.id !== victimId
  );

  for (const witness of witnesses) {
    const r = getRelationship(graph, witness.id, victimId);
    if (r && r.affinity_Q > q(0.2)) {
      impacts.push({
        observerId: witness.id,
        targetId: victimId,
        event: "betrayal",
        delta_Q: betrayalResult.witnessMoralePenalty_Q,
      });
    }
  }

  return impacts;
}

// ── Teaching Integration ──────────────────────────────────────────────────────

/**
 * Compute total teaching effectiveness multiplier.
 * Combines base skill with relationship factors.
 */
export function computeTeachingEffectiveness(
  graph: RelationshipGraph,
  teacherId: number,
  learnerId: number,
  baseEffectiveness: number,
): number {
  const relationshipMul = computeTeachingRelationshipMultiplier(
    graph,
    teacherId,
    learnerId,
  );

  return baseEffectiveness * relationshipMul;
}

// ── Combat Decision Integration ───────────────────────────────────────────────

/** Factors affecting combat AI decisions. */
export interface CombatDecisionFactors {
  /** Whether entity will protect the target */
  willProtect: boolean;
  /** Whether entity will avoid harming the target */
  willAvoidHarm: boolean;
  /** Aggression modifier toward target */
  aggressionModifier: number;
  /** Coordination bonus when fighting alongside */
  coordinationBonus: number;
}

/**
 * Compute combat decision factors based on relationship.
 */
export function getCombatDecisionFactors(
  graph: RelationshipGraph,
  entityId: number,
  targetId: number,
): CombatDecisionFactors {
  const r = getRelationship(graph, entityId, targetId);

  if (!r) {
    return {
      willProtect: false,
      willAvoidHarm: false,
      aggressionModifier: 0,
      coordinationBonus: 0,
    };
  }

  const affinityNorm = r.affinity_Q / SCALE.Q; // -1 to 1
  const trustNorm = r.trust_Q / SCALE.Q;       // 0 to 1

  return {
    willProtect: r.affinity_Q > q(0.5) && r.trust_Q > q(0.3),
    willAvoidHarm: r.affinity_Q > q(0.2),
    aggressionModifier: -affinityNorm * 0.5, // Negative affinity = more aggressive
    coordinationBonus: r.bond === "mentor" || r.bond === "student"
      ? 0.2
      : trustNorm * 0.1,
  };
}

/**
 * Determine if entity should switch targets to protect an ally.
 */
export function shouldProtectAlly(
  graph: RelationshipGraph,
  protectorId: number,
  allyId: number,
  threatId: number,
): boolean {
  const rAlly = getRelationship(graph, protectorId, allyId);
  const rThreat = getRelationship(graph, protectorId, threatId);

  if (!rAlly) return false;

  // Will protect if ally is friend and threat is not a closer friend
  const allyValue = rAlly.affinity_Q + rAlly.trust_Q;
  const threatValue = rThreat
    ? rThreat.affinity_Q + rThreat.trust_Q
    : -SCALE.Q; // Unknown = neutral/negative

  return allyValue > q(0.5) && allyValue > threatValue;
}

// ── Dialogue Integration ──────────────────────────────────────────────────────

/** Dialogue availability based on relationship. */
export interface DialogueAvailability {
  canAskFavors: boolean;
  canNegotiate: boolean;
  canIntimidate: boolean;
  persuasionBonus: number;
}

/**
 * Compute what dialogue options are available.
 */
export function getDialogueAvailability(
  graph: RelationshipGraph,
  speakerId: number,
  listenerId: number,
): DialogueAvailability {
  const r = getRelationship(graph, speakerId, listenerId);

  if (!r) {
    return {
      canAskFavors: false,
      canNegotiate: true,
      canIntimidate: false,
      persuasionBonus: 0,
    };
  }

  const affinityNorm = r.affinity_Q / SCALE.Q;
  const trustNorm = r.trust_Q / SCALE.Q;

  return {
    canAskFavors: r.affinity_Q > q(0.4) && r.trust_Q > q(0.3),
    canNegotiate: r.affinity_Q > -q(0.3), // Can negotiate unless enemies
    canIntimidate: r.trust_Q < q(0.3) || r.affinity_Q < -q(0.2),
    persuasionBonus: affinityNorm * 0.2 + trustNorm * 0.1,
  };
}

// ── Event Recording ───────────────────────────────────────────────────────────

/**
 * Record events from combat resolution.
 */
export function recordCombatOutcome(
  graph: RelationshipGraph,
  impact: ImpactEvent,
  outcome: "hit" | "blocked" | "parried" | "missed",
  tick: number,
): void {
  if (outcome === "hit") {
    // If significant damage, record as negative event for relationship
    if (impact.energy_J > 100) {
      recordRelationshipEvent(graph, impact.attackerId, impact.targetId, {
        tick,
        type: "insult", // Attacking is insulting
        magnitude_Q: Math.min(q(0.1), Math.round(impact.energy_J / 1000) as Q),
        description: `Attacked in combat (${outcome})`,
      });
    }
  }
}

/**
 * Record cooperation between entities.
 */
export function recordCooperation(
  graph: RelationshipGraph,
  entityA: number,
  entityB: number,
  success: boolean,
  tick: number,
): void {
  recordRelationshipEvent(graph, entityA, entityB, {
    tick,
    type: "fought_alongside",
    magnitude_Q: success ? q(0.15) : q(0.05),
    description: success ? "Successful cooperation" : "Attempted cooperation",
  });
}

/**
 * Record that one entity saved another.
 */
export function recordRescue(
  graph: RelationshipGraph,
  rescuerId: number,
  rescuedId: number,
  tick: number,
): void {
  recordRelationshipEvent(graph, rescuerId, rescuedId, {
    tick,
    type: "saved",
    magnitude_Q: q(0.4),
    description: "Saved from danger",
  });
}

// ── Group Formation ────────────────────────────────────────────────────────────

/** Find entities that form a cohesive group based on relationships. */
export function findCohesiveGroup(
  graph: RelationshipGraph,
  seedEntityId: number,
  minAffinity_Q: Q = q(0.2),
): number[] {
  const group = new Set<number>([seedEntityId]);
  const toCheck = [seedEntityId];

  while (toCheck.length > 0) {
    const current = toCheck.pop()!;
    const relationships = Array.from(graph.relationships.values()).filter(
      (r) => (r.entityA === current || r.entityB === current) && r.affinity_Q >= minAffinity_Q,
    );

    for (const r of relationships) {
      const other = r.entityA === current ? r.entityB : r.entityA;
      if (!group.has(other)) {
        group.add(other);
        toCheck.push(other);
      }
    }
  }

  return Array.from(group);
}

/**
 * Check if a group of entities can work together effectively.
 */
export function computeGroupCohesion(
  graph: RelationshipGraph,
  groupIds: number[],
): { cohesion_Q: Q; trust_Q: Q } {
  if (groupIds.length < 2) return { cohesion_Q: q(0.5), trust_Q: q(0.5) };

  let totalAffinity: number = 0;
  let totalTrust: number = 0;
  let pairCount = 0;

  for (let i = 0; i < groupIds.length; i++) {
    for (let j = i + 1; j < groupIds.length; j++) {
      const rel = getRelationship(graph, groupIds[i]!, groupIds[j]!);
      if (rel) {
        totalAffinity += rel.affinity_Q;
        totalTrust += rel.trust_Q;
        pairCount++;
      }
    }
  }

  if (pairCount === 0) return { cohesion_Q: q(0.5), trust_Q: q(0.5) };

  return {
    cohesion_Q: Math.round(totalAffinity / pairCount) as Q,
    trust_Q: Math.round(totalTrust / pairCount) as Q,
  };
}
