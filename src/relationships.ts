// src/relationships.ts — Phase 42: Personal Relationship Graph
//
// Individual-to-individual relationships — the social fabric that makes RPGs feel alive.
// Affects morale, teaching effectiveness, betrayal probability, and dialogue options.

import type { Q } from "./units.js";
import { SCALE, q, clampQ } from "./units.js";

// ── Core Types ────────────────────────────────────────────────────────────────

/** Types of events that can affect relationships. */
export type RelationshipEventType =
  | "met"
  | "fought_alongside"
  | "betrayed"
  | "saved"
  | "deceived"
  | "gift_given"
  | "insult"
  | "bonded"
  | "separated";

/** A single event in the relationship history. */
export interface RelationshipEvent {
  tick: number;
  type: RelationshipEventType;
  magnitude_Q: Q;
  description?: string;
}

/** The nature of the social bond between two entities. */
export type SocialBond =
  | "none"
  | "acquaintance"
  | "friend"
  | "close_friend"
  | "rival"
  | "enemy"
  | "mentor"
  | "student"
  | "family"
  | "romantic_partner";

/** Relationship between two entities. */
export interface Relationship {
  entityA: number;
  entityB: number;
  /** Affinity: -1.0 (hatred) to +1.0 (love) */
  affinity_Q: Q;
  /** Trust: 0.0 (none) to 1.0 (absolute) */
  trust_Q: Q;
  /** Current social bond classification */
  bond: SocialBond;
  /** Chronicle of interactions */
  history: RelationshipEvent[];
  /** Tick when relationship was established */
  establishedAtTick: number;
  /** Last interaction tick */
  lastInteractionTick: number;
}

/** Key for storing relationships (ordered pair). */
function relationshipKey(entityA: number, entityB: number): string {
  // Always store with smaller ID first for consistency
  return entityA < entityB ? `${entityA}:${entityB}` : `${entityB}:${entityA}`;
}

// ── Relationship Registry ─────────────────────────────────────────────────────

/** Global relationship graph storage. */
export interface RelationshipGraph {
  relationships: Map<string, Relationship>;
  /** Entity-specific indices for quick lookup */
  entityIndex: Map<number, Set<string>>;
}

/** Create a new empty relationship graph. */
export function createRelationshipGraph(): RelationshipGraph {
  return {
    relationships: new Map(),
    entityIndex: new Map(),
  };
}

/** Get or create entity index entry. */
function getEntityRelationships(graph: RelationshipGraph, entityId: number): Set<string> {
  let set = graph.entityIndex.get(entityId);
  if (!set) {
    set = new Set();
    graph.entityIndex.set(entityId, set);
  }
  return set;
}

/**
 * Get relationship between two entities.
 * Returns undefined if no relationship exists.
 */
export function getRelationship(
  graph: RelationshipGraph,
  entityA: number,
  entityB: number,
): Relationship | undefined {
  if (entityA === entityB) return undefined;
  const key = relationshipKey(entityA, entityB);
  return graph.relationships.get(key);
}

/**
 * Check if two entities have an existing relationship.
 */
export function hasRelationship(
  graph: RelationshipGraph,
  entityA: number,
  entityB: number,
): boolean {
  return getRelationship(graph, entityA, entityB) !== undefined;
}

/**
 * Get all relationships for an entity.
 */
export function getEntityRelationshipsList(
  graph: RelationshipGraph,
  entityId: number,
): Relationship[] {
  const keys = graph.entityIndex.get(entityId);
  if (!keys) return [];

  return Array.from(keys)
    .map((key) => graph.relationships.get(key))
    .filter((r): r is Relationship => r !== undefined);
}

/**
 * Get all entities related to a given entity.
 */
export function getRelatedEntities(graph: RelationshipGraph, entityId: number): number[] {
  const relationships = getEntityRelationshipsList(graph, entityId);
  return relationships.map((r) => (r.entityA === entityId ? r.entityB : r.entityA));
}

// ── Relationship Creation & Modification ──────────────────────────────────────

/**
 * Establish a new relationship between two entities.
 */
export function establishRelationship(
  graph: RelationshipGraph,
  entityA: number,
  entityB: number,
  tick: number,
  initialAffinity_Q: Q = q(0),
  initialTrust_Q: Q = q(0.1),
): Relationship {
  if (entityA === entityB) {
    throw new Error("Cannot establish relationship with self");
  }

  const key = relationshipKey(entityA, entityB);

  // Check if relationship already exists
  const existing = graph.relationships.get(key);
  if (existing) return existing;

  const affinity_Q = clampQ(initialAffinity_Q, -SCALE.Q as Q, SCALE.Q as Q);
  const trust_Q = clampQ(initialTrust_Q, q(0), SCALE.Q as Q);

  const relationship: Relationship = {
    entityA,
    entityB,
    affinity_Q,
    trust_Q,
    bond: classifyBond(affinity_Q, trust_Q, []),
    history: [],
    establishedAtTick: tick,
    lastInteractionTick: tick,
  };

  graph.relationships.set(key, relationship);
  getEntityRelationships(graph, entityA).add(key);
  getEntityRelationships(graph, entityB).add(key);

  return relationship;
}

/**
 * Record a relationship event and update affinity/trust.
 */
export function recordRelationshipEvent(
  graph: RelationshipGraph,
  entityA: number,
  entityB: number,
  event: Omit<RelationshipEvent, "tick"> & { tick: number },
): Relationship | undefined {
  if (entityA === entityB) return undefined;

  const key = relationshipKey(entityA, entityB);
  let relationship = graph.relationships.get(key);

  // Auto-establish relationship if it doesn't exist
  if (!relationship) {
    relationship = establishRelationship(graph, entityA, entityB, event.tick);
  }

  // Add event to history
  const evt: RelationshipEvent = {
    tick: event.tick,
    type: event.type,
    magnitude_Q: event.magnitude_Q,
  };
  if (event.description !== undefined) evt.description = event.description;
  relationship.history.push(evt);

  // Update affinity and trust based on event type
  const { affinityDelta, trustDelta } = computeDeltasFromEvent(event.type, event.magnitude_Q);

  relationship.affinity_Q = clampQ(
    (relationship.affinity_Q + affinityDelta) as Q,
    -SCALE.Q as Q,
    SCALE.Q as Q,
  );

  relationship.trust_Q = clampQ(
    (relationship.trust_Q + trustDelta) as Q,
    q(0),
    SCALE.Q as Q,
  );

  relationship.lastInteractionTick = event.tick;

  // Reclassify bond
  relationship.bond = classifyBond(relationship.affinity_Q, relationship.trust_Q, relationship.history);

  return relationship;
}

/**
 * Compute affinity and trust deltas from event type.
 */
function computeDeltasFromEvent(
  type: RelationshipEventType,
  magnitude_Q: Q,
): { affinityDelta: Q; trustDelta: Q } {
  // Scale: magnitude_Q (0-10000) * factor -> delta_Q
  // Multipliers are scaled to produce meaningful changes (0.5-1.0 range possible)
  const mul = (n: number) => Math.round(magnitude_Q * n) as Q;

  switch (type) {
    case "met":
      return { affinityDelta: mul(0.1), trustDelta: mul(0.05) };

    case "fought_alongside":
      return { affinityDelta: mul(0.3), trustDelta: mul(0.6) };

    case "saved":
      return { affinityDelta: mul(0.8), trustDelta: mul(0.7) };

    case "betrayed":
      // Severe penalty - can swing positive to negative
      return { affinityDelta: mul(-1.8), trustDelta: mul(-2.0) };

    case "deceived":
      return { affinityDelta: mul(-0.6), trustDelta: mul(-1.0) };

    case "gift_given":
      return { affinityDelta: mul(0.2), trustDelta: mul(0.1) };

    case "insult":
      return { affinityDelta: mul(-0.3), trustDelta: mul(-0.1) };

    case "bonded":
      return { affinityDelta: mul(0.6), trustDelta: mul(0.5) };

    case "separated":
      // Gradual decay - handled by decay function instead
      return { affinityDelta: q(0), trustDelta: q(0) };

    default:
      return { affinityDelta: q(0), trustDelta: q(0) };
  }
}

/**
 * Classify the social bond based on affinity, trust, and history.
 */
export function classifyBond(affinity_Q: Q, trust_Q: Q, history: RelationshipEvent[]): SocialBond {
  // Check for negative bonds first
  if (affinity_Q < -q(0.6) && trust_Q < q(0.3)) return "enemy";
  if (affinity_Q < -q(0.3) && affinity_Q >= -q(0.6)) return "rival";

  // Check for special bonds in history
  const hasMentorEvent = history.some((e) => e.type === "bonded" && e.magnitude_Q > q(0.7));
  if (hasMentorEvent) {
    return affinity_Q > q(0.5) ? "mentor" : "student";
  }

  // Check for romantic bond
  const romanticEvent = history.some(
    (e) => e.type === "bonded" && e.description?.includes("romantic"),
  );
  if (romanticEvent && affinity_Q > q(0.7) && trust_Q > q(0.6)) return "romantic_partner";

  // Check for family
  const familyEvent = history.some((e) => e.description?.includes("family"));
  if (familyEvent) return "family";

  // Standard positive bonds
  if (affinity_Q >= q(0.7) && trust_Q >= q(0.5)) return "close_friend";
  if (affinity_Q >= q(0.3)) return "friend";
  // Acquaintance covers neutral to slightly positive, and slightly negative
  if (affinity_Q >= -q(0.3)) return "acquaintance";

  return "none";
}

// ── Relationship Decay ────────────────────────────────────────────────────────

/**
 * Apply time-based decay to relationships.
 * Call periodically (e.g., daily or weekly in simulation time).
 */
export function decayRelationships(
  graph: RelationshipGraph,
  currentTick: number,
  decayRatePerTick: number = 0.0001, // Very slow decay
): void {
  for (const relationship of graph.relationships.values()) {
    const timeSinceInteraction = currentTick - relationship.lastInteractionTick;

    if (timeSinceInteraction > 1000) {
      // Start decay after 1000 ticks of no interaction
      const decayAmount = Math.round(timeSinceInteraction * decayRatePerTick * SCALE.Q) as Q;

      // Decay affinity toward neutral (0)
      if (relationship.affinity_Q > 0) {
        relationship.affinity_Q = Math.max(0, relationship.affinity_Q - decayAmount) as Q;
      } else if (relationship.affinity_Q < 0) {
        relationship.affinity_Q = Math.min(0, relationship.affinity_Q + decayAmount) as Q;
      }

      // Decay trust slightly (people forget trust too)
      relationship.trust_Q = Math.max(0, relationship.trust_Q - decayAmount / 2) as Q;

      // Reclassify bond
      relationship.bond = classifyBond(
        relationship.affinity_Q,
        relationship.trust_Q,
        relationship.history,
      );
    }
  }
}

// ── Relationship Queries ──────────────────────────────────────────────────────

/** Check if entity A would consider entity B a friend. */
export function isFriend(graph: RelationshipGraph, entityA: number, entityB: number): boolean {
  const r = getRelationship(graph, entityA, entityB);
  if (!r) return false;
  return r.affinity_Q >= q(0.3) && ["acquaintance", "friend", "close_friend", "mentor", "student", "romantic_partner", "family"].includes(r.bond);
}

/** Check if entity A would consider entity B an enemy. */
export function isEnemy(graph: RelationshipGraph, entityA: number, entityB: number): boolean {
  const r = getRelationship(graph, entityA, entityB);
  if (!r) return false;
  return r.affinity_Q < -q(0.3) || r.bond === "enemy" || r.bond === "rival";
}

/** Check if entity A trusts entity B enough for combat cooperation. */
export function hasCombatTrust(graph: RelationshipGraph, entityA: number, entityB: number): boolean {
  const r = getRelationship(graph, entityA, entityB);
  if (!r) return false;
  return r.trust_Q >= q(0.4);
}

/** Get the effective relationship modifier for morale effects. */
export function getMoraleModifier(graph: RelationshipGraph, observer: number, target: number): Q {
  const r = getRelationship(graph, observer, target);
  if (!r) return q(0);

  // Positive affinity = morale boost when target succeeds
  // Negative affinity = morale boost when target fails
  return r.affinity_Q;
}

// ── Betrayal Detection ────────────────────────────────────────────────────────

/** Result of betrayal check. */
export interface BetrayalResult {
  isBetrayal: boolean;
  severity_Q: Q;
  /** Morale penalty for witnesses who care about the victim */
  witnessMoralePenalty_Q: Q;
}

/**
 * Check if harming someone constitutes betrayal.
 */
export function checkBetrayal(
  graph: RelationshipGraph,
  attackerId: number,
  victimId: number,
): BetrayalResult {
  const r = getRelationship(graph, attackerId, victimId);

  if (!r) {
    return {
      isBetrayal: false,
      severity_Q: q(0),
      witnessMoralePenalty_Q: q(0),
    };
  }

  // Betrayal occurs when affinity is positive but attacker harms victim
  const isBetrayal = r.affinity_Q > q(0.5);

  if (!isBetrayal) {
    return {
      isBetrayal: false,
      severity_Q: q(0),
      witnessMoralePenalty_Q: q(0),
    };
  }

  // Severity based on how positive the relationship was (0.6 to 1.0 range, as Q)
  // Higher affinity = more severe betrayal = larger magnitude
  const severity_Q = Math.round(SCALE.Q * 0.6 + r.affinity_Q * 0.4) as Q;

  // Witnesses who cared about the victim take morale hit (0.3 to 0.7 range, as Q)
  const witnessMoralePenalty_Q = Math.round(SCALE.Q * 0.3 + r.affinity_Q * 0.4) as Q;

  return {
    isBetrayal: true,
    severity_Q,
    witnessMoralePenalty_Q,
  };
}

/**
 * Record a betrayal event and update relationships.
 */
export function recordBetrayal(
  graph: RelationshipGraph,
  attackerId: number,
  victimId: number,
  tick: number,
): BetrayalResult {
  const result = checkBetrayal(graph, attackerId, victimId);

  if (result.isBetrayal) {
    recordRelationshipEvent(graph, attackerId, victimId, {
      tick,
      type: "betrayed",
      magnitude_Q: result.severity_Q,
      description: "Betrayed during combat",
    });

    // Also damage attacker's reputation with victim's friends
    const victimFriends = getEntityRelationshipsList(graph, victimId)
      .filter((r) => r.affinity_Q > q(0.3) && r.entityA !== attackerId && r.entityB !== attackerId);

    for (const friendRel of victimFriends) {
      const friendId = friendRel.entityA === victimId ? friendRel.entityB : friendRel.entityA;
      recordRelationshipEvent(graph, attackerId, friendId, {
        tick,
        type: "betrayed",
        magnitude_Q: Math.round(result.severity_Q * 0.5) as Q,
        description: `Betrayed ${victimId}`,
      });
    }
  }

  return result;
}

// ── Teaching Integration ──────────────────────────────────────────────────────

/**
 * Compute teaching effectiveness multiplier based on relationship.
 */
export function computeTeachingRelationshipMultiplier(
  graph: RelationshipGraph,
  teacherId: number,
  learnerId: number,
): number {
  const r = getRelationship(graph, teacherId, learnerId);
  if (!r) return 1.0;

  // Base multiplier from affinity
  let multiplier = 1.0 + (r.affinity_Q / SCALE.Q) * 0.3;

  // Bonus for mentor/student bond
  if (r.bond === "mentor" || r.bond === "student") {
    multiplier += 0.2;
  }

  // Trust affects how well learner accepts teaching
  multiplier += (r.trust_Q / SCALE.Q) * 0.2;

  return Math.max(0.5, Math.min(1.5, multiplier));
}

// ── Serialization ─────────────────────────────────────────────────────────────

/** Serialize relationship graph to JSON-friendly format. */
export function serializeRelationshipGraph(graph: RelationshipGraph): unknown {
  return {
    relationships: Array.from(graph.relationships.entries()),
    entityIndex: Array.from(graph.entityIndex.entries()).map(([entityId, keys]) => [
      entityId,
      Array.from(keys),
    ]),
  };
}

/** Deserialize relationship graph. */
export function deserializeRelationshipGraph(data: unknown): RelationshipGraph {
  const graph = createRelationshipGraph();

  if (typeof data !== "object" || data === null) {
    return graph;
  }

  const d = data as Record<string, unknown>;

  if (Array.isArray(d.relationships)) {
    for (const [key, rel] of d.relationships) {
      graph.relationships.set(key, rel as Relationship);
    }
  }

  if (Array.isArray(d.entityIndex)) {
    for (const [entityId, keys] of d.entityIndex) {
      graph.entityIndex.set(entityId, new Set(keys as string[]));
    }
  }

  return graph;
}
