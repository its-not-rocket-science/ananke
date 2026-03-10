// src/chronicle.ts — Phase 45: Emergent Story Generation — Chronicle System
//
// Transforms simulation events into coherent narratives through significance
// scoring and narrative templates.

import type { Q } from "./units.js";
import { SCALE } from "./units.js";

// ── Core Types ────────────────────────────────────────────────────────────────

/** A single entry in a chronicle. */
export interface ChronicleEntry {
  entryId: string;
  tick: number;
  /** Significance score 0-100 for filtering/summarizing. */
  significance: number;
  eventType: ChronicleEventType;
  /** Entity IDs involved in the event. */
  actors: number[];
  /** Template key for rendering. */
  template: string;
  /** Variables for template substitution. */
  variables: Record<string, string | number>;
  /** Rendered prose (generated on demand or at creation). */
  rendered?: string | undefined;
  /** Settlement ID if event occurred at a settlement. */
  settlementId?: string | undefined;
  /** Quest ID if event relates to a quest. */
  questId?: string | undefined;
}

/** Types of events that can be recorded in a chronicle. */
export type ChronicleEventType =
  | "entity_death"
  | "entity_birth"
  | "relationship_formed"
  | "relationship_broken"
  | "relationship_betrayal"
  | "quest_completed"
  | "quest_failed"
  | "quest_accepted"
  | "settlement_founded"
  | "settlement_upgraded"
  | "settlement_raided"
  | "settlement_destroyed"
  | "facility_completed"
  | "masterwork_crafted"
  | "first_contact"
  | "combat_victory"
  | "combat_defeat"
  | "rank_promotion"
  | "legendary_deed"
  | "tragic_event";

/** Chronicle scope determines visibility and ownership. */
export type ChronicleScope = "world" | "faction" | "settlement" | "entity";

/** A collection of chronicle entries forming a narrative history. */
export interface Chronicle {
  chronicleId: string;
  scope: ChronicleScope;
  /** Owner ID for entity/faction/settlement-specific chronicles. */
  ownerId?: number | string | undefined;
  entries: ChronicleEntry[];
  /** When the chronicle was created. */
  createdAtTick: number;
  /** Last entry tick. */
  lastEntryTick: number;
  /** Detected story arcs in this chronicle. */
  detectedArcs: StoryArc[];
}

/** A detected story arc (pattern across multiple events). */
export interface StoryArc {
  arcId: string;
  arcType: StoryArcType;
  /** Entry IDs that form this arc. */
  entryIds: string[];
  /** Primary actors in the arc. */
  primaryActors: number[];
  /** When the arc began. */
  startTick: number;
  /** When the arc ended (undefined if ongoing). */
  endTick?: number | undefined;
  /** Arc significance score. */
  significance: number;
  /** Human-readable arc description. */
  description: string;
}

export type StoryArcType =
  | "rise_of_hero"
  | "tragic_fall"
  | "rivalry"
  | "great_migration"
  | "settlement_growth"
  | "fallen_settlement"
  | "legendary_craftsman"
  | "notorious_villain"
  | "unlikely_friendship"
  | "betrayal_and_redemption";

// ── Significance Scoring ───────────────────────────────────────────────────────

/** Base significance scores by event type. */
export const SIGNIFICANCE_SCORES: Record<ChronicleEventType, number> = {
  entity_death: 80,
  entity_birth: 30,
  relationship_formed: 40,
  relationship_broken: 50,
  relationship_betrayal: 75,
  quest_completed: 45,
  quest_failed: 40,
  quest_accepted: 20,
  settlement_founded: 60,
  settlement_upgraded: 50,
  settlement_raided: 55,
  settlement_destroyed: 90,
  facility_completed: 35,
  masterwork_crafted: 50,
  first_contact: 70,
  combat_victory: 25,
  combat_defeat: 30,
  rank_promotion: 35,
  legendary_deed: 85,
  tragic_event: 70,
};

/** Modifiers for significance calculation. */
export interface SignificanceContext {
  /** Entity was of high reputation/fame. */
  actorWasFamous?: boolean;
  /** Event was a first (first death in world, etc.). */
  wasFirst?: boolean;
  /** Multiple entities involved. */
  involvedMultipleParties?: boolean;
  /** Outcome was unexpected (underdog victory). */
  unexpectedOutcome?: boolean;
  /** Event had lasting consequences. */
  lastingConsequences?: boolean;
}

/** Calculate significance score for an event. */
export function calculateSignificance(
  eventType: ChronicleEventType,
  context?: SignificanceContext,
): number {
  let score = SIGNIFICANCE_SCORES[eventType] ?? 20;

  if (context) {
    if (context.actorWasFamous) score += 15;
    if (context.wasFirst) score += 20;
    if (context.involvedMultipleParties) score += 10;
    if (context.unexpectedOutcome) score += 15;
    if (context.lastingConsequences) score += 10;
  }

  return Math.min(100, score);
}

/** Check if an event is significant enough to record. */
export function isSignificant(
  eventType: ChronicleEventType,
  threshold: number = 25,
  context?: SignificanceContext,
): boolean {
  return calculateSignificance(eventType, context) >= threshold;
}

// ── Chronicle Management ───────────────────────────────────────────────────────

/** Create a new chronicle. */
export function createChronicle(
  chronicleId: string,
  scope: ChronicleScope,
  tick: number,
  ownerId?: number | string,
): Chronicle {
  return {
    chronicleId,
    scope,
    ownerId,
    entries: [],
    createdAtTick: tick,
    lastEntryTick: tick,
    detectedArcs: [],
  };
}

/** Add an entry to a chronicle. */
export function addChronicleEntry(
  chronicle: Chronicle,
  entry: Omit<ChronicleEntry, "entryId">,
  seed?: number,
): ChronicleEntry {
  const fullEntry: ChronicleEntry = {
    ...entry,
    entryId: generateEntryId(chronicle.chronicleId, chronicle.entries.length, seed ?? Date.now()),
  };

  chronicle.entries.push(fullEntry);
  chronicle.lastEntryTick = entry.tick;

  // Sort entries by tick
  chronicle.entries.sort((a, b) => a.tick - b.tick);

  return fullEntry;
}

function generateEntryId(chronicleId: string, index: number, seed: number): string {
  return `${chronicleId}_${seed}_${index}`;
}

/** Get entries above a significance threshold. */
export function getSignificantEntries(
  chronicle: Chronicle,
  minSignificance: number = 50,
): ChronicleEntry[] {
  return chronicle.entries.filter(e => e.significance >= minSignificance);
}

/** Get entries within a tick range. */
export function getEntriesInRange(
  chronicle: Chronicle,
  startTick: number,
  endTick: number,
): ChronicleEntry[] {
  return chronicle.entries.filter(e => e.tick >= startTick && e.tick <= endTick);
}

/** Get entries involving a specific entity. */
export function getEntriesForEntity(
  chronicle: Chronicle,
  entityId: number,
): ChronicleEntry[] {
  return chronicle.entries.filter(e => e.actors.includes(entityId));
}

/** Get entries of a specific type. */
export function getEntriesByType(
  chronicle: Chronicle,
  eventType: ChronicleEventType,
): ChronicleEntry[] {
  return chronicle.entries.filter(e => e.eventType === eventType);
}

// ── Chronicle Registry ─────────────────────────────────────────────────────────

/** Global chronicle registry. */
export interface ChronicleRegistry {
  /** World-level chronicle (all significant events). */
  worldChronicle: Chronicle;
  /** Per-entity chronicles. */
  entityChronicles: Map<number, Chronicle>;
  /** Per-faction chronicles. */
  factionChronicles: Map<number, Chronicle>;
  /** Per-settlement chronicles. */
  settlementChronicles: Map<string, Chronicle>;
}

/** Create a new chronicle registry. */
export function createChronicleRegistry(tick: number): ChronicleRegistry {
  return {
    worldChronicle: createChronicle("world", "world", tick),
    entityChronicles: new Map(),
    factionChronicles: new Map(),
    settlementChronicles: new Map(),
  };
}

/** Record an event to appropriate chronicles. */
export function recordEvent(
  registry: ChronicleRegistry,
  entry: Omit<ChronicleEntry, "entryId">,
  options?: {
    entityIds?: number[];
    factionIds?: number[];
    settlementId?: string;
  },
): void {
  // Always record to world chronicle if significant enough
  if (entry.significance >= 30) {
    addChronicleEntry(registry.worldChronicle, entry);
  }

  // Record to entity chronicles
  if (options?.entityIds) {
    for (const entityId of options.entityIds) {
      let chronicle = registry.entityChronicles.get(entityId);
      if (!chronicle) {
        chronicle = createChronicle(`entity_${entityId}`, "entity", entry.tick, entityId);
        registry.entityChronicles.set(entityId, chronicle);
      }
      addChronicleEntry(chronicle, entry);
    }
  }

  // Record to faction chronicles
  if (options?.factionIds) {
    for (const factionId of options.factionIds) {
      let chronicle = registry.factionChronicles.get(factionId);
      if (!chronicle) {
        chronicle = createChronicle(`faction_${factionId}`, "faction", entry.tick, factionId);
        registry.factionChronicles.set(factionId, chronicle);
      }
      addChronicleEntry(chronicle, entry);
    }
  }

  // Record to settlement chronicle
  if (options?.settlementId) {
    let chronicle = registry.settlementChronicles.get(options.settlementId);
    if (!chronicle) {
      chronicle = createChronicle(
        `settlement_${options.settlementId}`,
        "settlement",
        entry.tick,
        options.settlementId,
      );
      registry.settlementChronicles.set(options.settlementId, chronicle);
    }
    addChronicleEntry(chronicle, entry);
  }
}

// ── Summarization ─────────────────────────────────────────────────────────────

export type SummaryLevel = "full" | "chapter" | "synopsis";

export interface ChronicleSummary {
  level: SummaryLevel;
  totalEntries: number;
  includedEntries: number;
  summaryText: string;
  keyEvents: ChronicleEntry[];
}

/** Summarize a chronicle at different granularities. */
export function summarizeChronicle(
  chronicle: Chronicle,
  level: SummaryLevel = "chapter",
): ChronicleSummary {
  let includedEntries: ChronicleEntry[];
  let summaryText: string;

  switch (level) {
    case "full":
      includedEntries = [...chronicle.entries];
      summaryText = `Complete history: ${includedEntries.length} events recorded.`;
      break;

    case "chapter":
      // Include only significant events and arc starts/ends
      includedEntries = chronicle.entries.filter(
        e => e.significance >= 50 || chronicle.detectedArcs.some(a => a.entryIds.includes(e.entryId)),
      );
      summaryText = `Major events: ${includedEntries.length} significant moments across ${chronicle.detectedArcs.length} story arcs.`;
      break;

    case "synopsis":
      // Just the highest significance events
      includedEntries = getSignificantEntries(chronicle, 70);
      summaryText = `Synopsis: ${includedEntries.length} pivotal events defined this ${chronicle.scope}.`;
      break;
  }

  return {
    level,
    totalEntries: chronicle.entries.length,
    includedEntries: includedEntries.length,
    summaryText,
    keyEvents: includedEntries,
  };
}

// ── Serialization ─────────────────────────────────────────────────────────────

/** Serialize chronicle to JSON-friendly format. */
export function serializeChronicle(chronicle: Chronicle): unknown {
  return {
    chronicleId: chronicle.chronicleId,
    scope: chronicle.scope,
    ownerId: chronicle.ownerId,
    entries: chronicle.entries,
    createdAtTick: chronicle.createdAtTick,
    lastEntryTick: chronicle.lastEntryTick,
    detectedArcs: chronicle.detectedArcs,
  };
}

/** Deserialize chronicle. */
export function deserializeChronicle(data: unknown): Chronicle {
  const d = data as Record<string, unknown>;

  return {
    chronicleId: (d.chronicleId as string) ?? "",
    scope: (d.scope as ChronicleScope) ?? "world",
    ownerId: d.ownerId as number | string | undefined,
    entries: Array.isArray(d.entries) ? (d.entries as ChronicleEntry[]) : [],
    createdAtTick: (d.createdAtTick as number) ?? 0,
    lastEntryTick: (d.lastEntryTick as number) ?? 0,
    detectedArcs: Array.isArray(d.detectedArcs) ? (d.detectedArcs as StoryArc[]) : [],
  };
}

/** Serialize chronicle registry. */
export function serializeChronicleRegistry(registry: ChronicleRegistry): unknown {
  return {
    worldChronicle: serializeChronicle(registry.worldChronicle),
    entityChronicles: Array.from(registry.entityChronicles.entries()).map(([id, c]) => [id, serializeChronicle(c)]),
    factionChronicles: Array.from(registry.factionChronicles.entries()).map(([id, c]) => [id, serializeChronicle(c)]),
    settlementChronicles: Array.from(registry.settlementChronicles.entries()).map(([id, c]) => [id, serializeChronicle(c)]),
  };
}

/** Deserialize chronicle registry. */
export function deserializeChronicleRegistry(data: unknown): ChronicleRegistry {
  const d = data as Record<string, unknown>;

  const registry: ChronicleRegistry = {
    worldChronicle: createChronicle("world", "world", 0),
    entityChronicles: new Map(),
    factionChronicles: new Map(),
    settlementChronicles: new Map(),
  };

  if (d.worldChronicle) {
    registry.worldChronicle = deserializeChronicle(d.worldChronicle);
  }

  if (Array.isArray(d.entityChronicles)) {
    for (const [id, c] of d.entityChronicles as [number, unknown][]) {
      registry.entityChronicles.set(id, deserializeChronicle(c));
    }
  }

  if (Array.isArray(d.factionChronicles)) {
    for (const [id, c] of d.factionChronicles as [number, unknown][]) {
      registry.factionChronicles.set(id, deserializeChronicle(c));
    }
  }

  if (Array.isArray(d.settlementChronicles)) {
    for (const [id, c] of d.settlementChronicles as [string, unknown][]) {
      registry.settlementChronicles.set(id, deserializeChronicle(c));
    }
  }

  return registry;
}
