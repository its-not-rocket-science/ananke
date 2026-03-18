// src/faction.ts — Phase 24: Faction & Reputation System
//
// Tracks faction membership, inter-faction standing, entity reputation, and
// the witness system that propagates reputation deltas from combat events.
//
// No kernel import — pure data-management module.

import type { Q }        from "./units.js";
import { SCALE, q, clampQ } from "./units.js";
import type { Entity }   from "./sim/entity.js";
import type { WorldState } from "./sim/world.js";
import type { TraceEvent } from "./sim/trace.js";
import { TraceKinds }    from "./sim/kinds.js";
import { canDetect, DEFAULT_SENSORY_ENV } from "./sim/sensory.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A named group of entities with defined relationships to other factions. */
export interface Faction {
  id:     string;
  name:   string;
  /** Faction ids with default hostile standing (q(0.20)). */
  rivals: Set<string>;
  /** Faction ids with default friendly standing (q(0.70)). */
  allies: Set<string>;
}

/** A reputation-relevant event witnessed by a faction member. */
export interface WitnessEvent {
  actorId:   number;
  eventType: "kill" | "assault" | "theft" | "aid" | "surrender";
  targetId:  number;
  /** Faction that cares about this event (typically the target's faction). */
  factionId: string;
  /** Signed reputation delta for the actor within `factionId`. */
  delta:     Q;
  tick:      number;
}

/**
 * Persistent faction state for a scenario or campaign.
 *
 * `globalStanding`     — faction-to-faction base standing (initialised from rival/ally sets).
 * `entityReputations`  — entity-level standing within factions; updated by `applyWitnessEvent`.
 */
export interface FactionRegistry {
  factions:          Map<string, Faction>;
  globalStanding:    Map<string, Map<string, Q>>;   // factionId → (factionId → Q)
  entityReputations: Map<number, Map<string, Q>>;   // entityId  → (factionId → Q)
}

// ── Standing constants ────────────────────────────────────────────────────────

export const STANDING_EXALTED:  Q = q(1.0);   // Intra-faction default
export const STANDING_ALLY:     Q = q(0.70);  // Allied faction default
export const STANDING_NEUTRAL:  Q = q(0.50);  // Unknown faction default
export const STANDING_RIVAL:    Q = q(0.20);  // Rival faction default
export const STANDING_KOS:      Q = q(0.0);   // Kill on sight

/** Standing below this → AI treats target as hostile. */
export const STANDING_HOSTILE_THRESHOLD:  Q = q(0.30);
/** Standing above this → AI will not initiate combat. */
export const STANDING_FRIENDLY_THRESHOLD: Q = q(0.70);

/** Minimum detection quality for an entity to witness an event. */
export const WITNESS_DETECTION_THRESHOLD: Q = q(0.60);

// ── Witness event delta magnitudes ────────────────────────────────────────────

const DELTA_KILL:      Q = q(-0.15);
const DELTA_ASSAULT:   Q = q(-0.05);
const DELTA_AID:       Q = q(0.08);

// ── Map-aware serialisation helpers ──────────────────────────────────────────

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

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a FactionRegistry pre-populated with rival/ally default standings.
 *
 * Only direct relations need to be specified; symmetric standings are NOT
 * applied automatically (enemy of A is not necessarily enemy of B).
 */
export function createFactionRegistry(factions: Faction[]): FactionRegistry {
  const factionMap = new Map(factions.map(f => [f.id, f]));

  const globalStanding = new Map<string, Map<string, Q>>();
  for (const f of factions) {
    const row = new Map<string, Q>();
    for (const rival of f.rivals) row.set(rival, STANDING_RIVAL);
    for (const ally  of f.allies) row.set(ally,  STANDING_ALLY);
    globalStanding.set(f.id, row);
  }

  return {
    factions:          factionMap,
    globalStanding,
    entityReputations: new Map(),
  };
}

// ── Standing computation ──────────────────────────────────────────────────────

/**
 * Compute effective standing of entity `a` toward entity `b`.
 *
 * Priority (highest first):
 * 1. Same faction → STANDING_EXALTED
 * 2. Entity-level reputation (`registry.entityReputations.get(a.id)?.get(b.faction)`)
 *    combined with faction default — max of the two is used.
 * 3. Global faction-to-faction standing
 * 4. Rival / ally default from faction definition
 * 5. STANDING_NEUTRAL (q(0.50)) for all unknown combinations
 */
export function effectiveStanding(
  registry: FactionRegistry,
  a:        Entity,
  b:        Entity,
): Q {
  const aFaction = a.faction;
  const bFaction = b.faction;

  // Same faction → exalted
  if (aFaction && bFaction && aFaction === bFaction) return STANDING_EXALTED;

  // Entity-level reputation of a toward b's faction
  const personalQ: Q | undefined = bFaction
    ? registry.entityReputations.get(a.id)?.get(bFaction)
    : undefined;

  // Faction-level standing of a's faction toward b's faction
  let factionQ: Q | undefined;
  if (aFaction && bFaction) {
    factionQ = registry.globalStanding.get(aFaction)?.get(bFaction);
  }

  // Combined: max of personal and faction (most favourable wins)
  if (personalQ !== undefined && factionQ !== undefined) {
    return Math.max(personalQ, factionQ) as Q;
  }
  if (personalQ !== undefined) return personalQ;
  if (factionQ !== undefined) return factionQ;

  return STANDING_NEUTRAL;
}

// ── Witness event application ─────────────────────────────────────────────────

/**
 * Apply a witness event: adjust the actor's standing within the specified faction.
 *
 * Deltas are clamped to [0, SCALE.Q].  A kill of a faction member reduces the
 * actor's standing with that faction; aiding a member increases it.
 */
export function applyWitnessEvent(
  registry: FactionRegistry,
  event:    WitnessEvent,
): void {
  let reps = registry.entityReputations.get(event.actorId);
  if (!reps) {
    reps = new Map<string, Q>();
    registry.entityReputations.set(event.actorId, reps);
  }
  const current = reps.get(event.factionId) ?? STANDING_NEUTRAL;
  reps.set(event.factionId, clampQ(current + event.delta, 0, SCALE.Q) as Q);
}

// ── Witness extraction ────────────────────────────────────────────────────────

/**
 * Scan a TraceEvent stream and produce WitnessEvents for reputation-relevant
 * actions (kills, assaults, aid).
 *
 * Only events where at least one bystander entity (not the actor or target) can
 * detect the actor (`detectionQ ≥ WITNESS_DETECTION_THRESHOLD`) are included.
 *
 * Deduplication: at most one event per (actorId, eventType) per tick.
 *
 * @param factions  Map of entityId → factionId for the current scenario.
 */
export function extractWitnessEvents(
  events:   TraceEvent[],
  world:    WorldState,
  factions: Map<number, string>,
): WitnessEvent[] {
  // First pass: collect which entities die each tick
  const deaths = new Set<string>();
  for (const ev of events) {
    if (ev.kind === TraceKinds.Death) {
      deaths.add(`${ev.entityId}:${ev.tick}`);
    }
  }

  const results: WitnessEvent[] = [];
  const seen    = new Set<string>();   // dedupKey = `${actorId}:${eventType}:${tick}`

  for (const ev of events) {
    let actorId:   number | undefined;
    let targetId:  number | undefined;
    let eventType: WitnessEvent["eventType"] | undefined;
    let delta:     Q | undefined;

    if (ev.kind === TraceKinds.Attack && !ev.blocked && !ev.parried && ev.energy_J > 0) {
      actorId  = ev.attackerId;
      targetId = ev.targetId;
      const isKill = deaths.has(`${ev.targetId}:${ev.tick}`);
      eventType = isKill ? "kill" : "assault";
      delta     = isKill ? DELTA_KILL : DELTA_ASSAULT;
    } else if (ev.kind === TraceKinds.TreatmentApplied) {
      actorId   = ev.treaterId;
      targetId  = ev.targetId;
      eventType = "aid";
      delta     = DELTA_AID;
    }

    if (actorId === undefined || targetId === undefined || !eventType || delta === undefined) {
      continue;
    }

    const dedupKey = `${actorId}:${eventType}:${ev.tick}`;
    if (seen.has(dedupKey)) continue;

    // Faction that cares: the target's faction
    const targetFactionId = factions.get(targetId);
    if (!targetFactionId) continue;

    // Check for at least one bystander witness
    const actor = world.entities.find(e => e.id === actorId);
    if (!actor) continue;

    let hasWitness = false;
    for (const witness of world.entities) {
      if (witness.id === actorId || witness.id === targetId) continue;
      if (witness.injury.dead) continue;
      if (canDetect(witness, actor, DEFAULT_SENSORY_ENV) >= WITNESS_DETECTION_THRESHOLD) {
        hasWitness = true;
        break;
      }
    }
    if (!hasWitness) continue;

    seen.add(dedupKey);
    results.push({
      actorId,
      targetId,
      eventType,
      factionId: targetFactionId,
      delta,
      tick: ev.tick,
    });
  }

  return results;
}

// ── Faction-level standing mutation ──────────────────────────────────────────

/**
 * Adjust the global faction-to-faction standing of `factionAId` toward
 * `factionBId` by `delta`, clamped to [0, SCALE.Q].
 *
 * Used by the Polity diplomacy system (Phase 61) to apply `standingDelta`
 * from `resolveDiplomacy`.  The relation is one-directional; call twice with
 * swapped arguments for a symmetric update.
 */
export function applyFactionStanding(
  registry:   FactionRegistry,
  factionAId: string,
  factionBId: string,
  delta:      Q,
): void {
  let row = registry.globalStanding.get(factionAId);
  if (!row) {
    row = new Map<string, Q>();
    registry.globalStanding.set(factionAId, row);
  }
  const current = row.get(factionBId) ?? STANDING_NEUTRAL;
  row.set(factionBId, clampQ(current + delta, 0, SCALE.Q) as Q);
}

// ── Serialisation ─────────────────────────────────────────────────────────────

/**
 * Serialise a FactionRegistry to a JSON string.
 * Handles all nested Map and Set fields (rivals, allies, globalStanding, entityReputations).
 */
export function serialiseFactionRegistry(registry: FactionRegistry): string {
  return JSON.stringify(registry, replacer);
}

/**
 * Deserialise a FactionRegistry from a JSON string produced by `serialiseFactionRegistry`.
 */
export function deserialiseFactionRegistry(json: string): FactionRegistry {
  return JSON.parse(json, reviver) as FactionRegistry;
}
