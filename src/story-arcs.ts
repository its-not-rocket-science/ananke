// src/story-arcs.ts — Phase 45: Emergent Story Generation — Story Arc Detection
//
// Pattern detection across chronicle entries to identify emergent narratives.

import type { Chronicle, ChronicleEntry, StoryArc, StoryArcType } from "./chronicle.js";
import { getEntriesForEntity, getEntriesByType } from "./chronicle.js";

// ── Arc Detection Entry Points ─────────────────────────────────────────────────

/** Detect all story arcs in a chronicle. */
export function detectStoryArcs(chronicle: Chronicle): StoryArc[] {
  const arcs: StoryArc[] = [];

  // Detect each arc type
  const riseOfHeroArcs = detectRiseOfHeroArcs(chronicle);
  arcs.push(...riseOfHeroArcs);

  const tragicFallArcs = detectTragicFallArcs(chronicle);
  arcs.push(...tragicFallArcs);

  const rivalryArcs = detectRivalryArcs(chronicle);
  arcs.push(...rivalryArcs);

  const settlementGrowthArcs = detectSettlementGrowthArcs(chronicle);
  arcs.push(...settlementGrowthArcs);

  const legendaryCraftsmanArcs = detectLegendaryCraftsmanArcs(chronicle);
  arcs.push(...legendaryCraftsmanArcs);

  // Sort arcs by start tick
  arcs.sort((a, b) => a.startTick - b.startTick);

  return arcs;
}

/** Re-detect arcs and update chronicle. */
export function updateDetectedArcs(chronicle: Chronicle): void {
  chronicle.detectedArcs = detectStoryArcs(chronicle);
}

// ── Rise of a Hero ────────────────────────────────────────────────────────────

/**
 * Detect "Rise of a Hero" arcs.
 * Pattern: Entity survives multiple combats, gains positive reputation,
 * completes difficult quests, doesn't die.
 */
function detectRiseOfHeroArcs(chronicle: Chronicle): StoryArc[] {
  const arcs: StoryArc[] = [];
  const entityCompletions = new Map<number, ChronicleEntry[]>();

  // Find quest completions and combat victories by entity
  for (const entry of chronicle.entries) {
    if (entry.eventType === "quest_completed" || entry.eventType === "combat_victory") {
      for (const actor of entry.actors) {
        if (!entityCompletions.has(actor)) {
          entityCompletions.set(actor, []);
        }
        entityCompletions.get(actor)!.push(entry);
      }
    }
  }

  // Check for entities with multiple successes
  for (const [entityId, entries] of entityCompletions) {
    if (entries.length >= 3) {
      // Check if entity has a death entry (arc would be cut short)
      const deathEntry = getEntriesForEntity(chronicle, entityId).find(
        e => e.eventType === "entity_death"
      );

      if (!deathEntry) {
        // Living hero - check for legendary deed
        const legendaryEntry = entries.find(e => e.eventType === "legendary_deed");
        const significance = 60 + entries.length * 5 + (legendaryEntry ? 20 : 0);

        arcs.push({
          arcId: `rise_hero_${entityId}_${entries[0]!.tick}`,
          arcType: "rise_of_hero",
          entryIds: entries.map(e => e.entryId),
          primaryActors: [entityId],
          startTick: entries[0]!.tick,
          endTick: entries[entries.length - 1]!.tick,
          significance: Math.min(100, significance),
          description: `The rise of a hero through ${entries.length} notable victories`,
        });
      }
    }
  }

  return arcs;
}

// ── Tragic Fall ───────────────────────────────────────────────────────────────

/**
 * Detect "Tragic Fall" arcs.
 * Pattern: Entity with high reputation commits betrayal, becomes villain,
 * or falls from grace in some other way.
 */
function detectTragicFallArcs(chronicle: Chronicle): StoryArc[] {
  const arcs: StoryArc[] = [];
  const entityEntries = new Map<number, ChronicleEntry[]>();

  // Group entries by actor
  for (const entry of chronicle.entries) {
    for (const actor of entry.actors) {
      if (!entityEntries.has(actor)) {
        entityEntries.set(actor, []);
      }
      entityEntries.get(actor)!.push(entry);
    }
  }

  // Look for betrayal after positive events
  for (const [entityId, entries] of entityEntries) {
    const betrayalIndex = entries.findIndex(e => e.eventType === "relationship_betrayal");
    if (betrayalIndex > 0) {
      // Check for prior positive events
      const priorEntries = entries.slice(0, betrayalIndex);
      const positiveEvents = priorEntries.filter(
        e => e.eventType === "quest_completed" || e.eventType === "relationship_formed"
      );

      if (positiveEvents.length >= 2) {
        const relevantEntries = [...positiveEvents, entries[betrayalIndex]!];

        arcs.push({
          arcId: `tragic_fall_${entityId}_${entries[0]!.tick}`,
          arcType: "tragic_fall",
          entryIds: relevantEntries.map(e => e.entryId),
          primaryActors: [entityId],
          startTick: relevantEntries[0]!.tick,
          endTick: entries[entries.length - 1]?.tick,
          significance: 75,
          description: `A tragic fall from grace after betrayal of former allies`,
        });
      }
    }
  }

  return arcs;
}

// ── Rivalry ───────────────────────────────────────────────────────────────────

/**
 * Detect "Rivalry" arcs.
 * Pattern: Two entities repeatedly fight/combat, neither dies,
 * relationship remains negative or hostile.
 */
function detectRivalryArcs(chronicle: Chronicle): StoryArc[] {
  const arcs: StoryArc[] = [];
  const combatPairs = new Map<string, ChronicleEntry[]>();

  // Find combats with exactly 2 actors
  for (const entry of chronicle.entries) {
    if ((entry.eventType === "combat_victory" || entry.eventType === "combat_defeat") &&
        entry.actors.length === 2) {
      const pairKey = entry.actors.sort().join("_");
      if (!combatPairs.has(pairKey)) {
        combatPairs.set(pairKey, []);
      }
      combatPairs.get(pairKey)!.push(entry);
    }
  }

  // Check for repeated combats between same pair
  for (const [pairKey, entries] of combatPairs) {
    if (entries.length >= 2) {
      const ids = pairKey.split("_").map(Number);
      const entityA = ids[0]!;
      const entityB = ids[1]!;

      // Check neither has died
      const deathA = getEntriesForEntity(chronicle, entityA).find(e => e.eventType === "entity_death");
      const deathB = getEntriesForEntity(chronicle, entityB).find(e => e.eventType === "entity_death");

      if (!deathA && !deathB) {
        arcs.push({
          arcId: `rivalry_${pairKey}_${entries[0]!.tick}`,
          arcType: "rivalry",
          entryIds: entries.map(e => e.entryId),
          primaryActors: [entityA, entityB],
          startTick: entries[0]!.tick,
          endTick: entries[entries.length - 1]!.tick,
          significance: 50 + entries.length * 5,
          description: `An ongoing rivalry with ${entries.length} recorded confrontations`,
        });
      }
    }
  }

  return arcs;
}

// ── Settlement Growth ─────────────────────────────────────────────────────────

/**
 * Detect "Settlement Growth" arcs.
 * Pattern: Settlement founded → upgraded multiple times → population growth.
 */
function detectSettlementGrowthArcs(chronicle: Chronicle): StoryArc[] {
  const arcs: StoryArc[] = [];
  const settlementEvents = new Map<string, ChronicleEntry[]>();

  // Group settlement-related entries
  for (const entry of chronicle.entries) {
    if (entry.settlementId && (
      entry.eventType === "settlement_founded" ||
      entry.eventType === "settlement_upgraded" ||
      entry.eventType === "facility_completed"
    )) {
      if (!settlementEvents.has(entry.settlementId)) {
        settlementEvents.set(entry.settlementId, []);
      }
      settlementEvents.get(entry.settlementId)!.push(entry);
    }
  }

  // Check for settlements with growth trajectory
  for (const [settlementId, entries] of settlementEvents) {
    const hasFoundation = entries.some(e => e.eventType === "settlement_founded");
    const upgrades = entries.filter(e => e.eventType === "settlement_upgraded").length;

    if (hasFoundation && upgrades >= 1) {
      arcs.push({
        arcId: `settlement_growth_${settlementId}_${entries[0]!.tick}`,
        arcType: "settlement_growth",
        entryIds: entries.map(e => e.entryId),
        primaryActors: [], // Settlement itself is the subject
        startTick: entries[0]!.tick,
        endTick: entries[entries.length - 1]!.tick,
        significance: 55 + upgrades * 10,
        description: `The growth of a settlement from founding through ${upgrades} upgrades`,
      });
    }
  }

  return arcs;
}

// ── Legendary Craftsman ───────────────────────────────────────────────────────

/**
 * Detect "Legendary Craftsman" arcs.
 * Pattern: Entity produces multiple masterwork items, exceptional competence outcomes.
 */
function detectLegendaryCraftsmanArcs(chronicle: Chronicle): StoryArc[] {
  const arcs: StoryArc[] = [];
  const entityCrafts = new Map<number, ChronicleEntry[]>();

  // Find masterwork crafting events
  for (const entry of chronicle.entries) {
    if (entry.eventType === "masterwork_crafted") {
      for (const actor of entry.actors) {
        if (!entityCrafts.has(actor)) {
          entityCrafts.set(actor, []);
        }
        entityCrafts.get(actor)!.push(entry);
      }
    }
  }

  // Check for craftsmen with multiple masterworks
  for (const [entityId, entries] of entityCrafts) {
    if (entries.length >= 2) {
      arcs.push({
        arcId: `legendary_craftsman_${entityId}_${entries[0]!.tick}`,
        arcType: "legendary_craftsman",
        entryIds: entries.map(e => e.entryId),
        primaryActors: [entityId],
        startTick: entries[0]!.tick,
        endTick: entries[entries.length - 1]!.tick,
        significance: 60 + entries.length * 8,
        description: `A legendary craftsman who created ${entries.length} masterwork items`,
      });
    }
  }

  return arcs;
}

// ── Arc Analysis ──────────────────────────────────────────────────────────────

/** Get all arcs involving a specific entity. */
export function getArcsForEntity(chronicle: Chronicle, entityId: number): StoryArc[] {
  return chronicle.detectedArcs.filter(arc =>
    arc.primaryActors.includes(entityId)
  );
}

/** Get the most significant arc in a chronicle. */
export function getMostSignificantArc(chronicle: Chronicle): StoryArc | undefined {
  if (chronicle.detectedArcs.length === 0) return undefined;
  return chronicle.detectedArcs.reduce((max, arc) =>
    arc.significance > max.significance ? arc : max
  );
}

/** Get arcs within a time period. */
export function getArcsInPeriod(
  chronicle: Chronicle,
  startTick: number,
  endTick: number,
): StoryArc[] {
  return chronicle.detectedArcs.filter(arc =>
    arc.startTick <= endTick && (arc.endTick ?? Infinity) >= startTick
  );
}

/** Check if an arc is ongoing (no end tick). */
export function isOngoingArc(arc: StoryArc, currentTick: number): boolean {
  return arc.endTick === undefined || arc.endTick >= currentTick;
}

// ── Arc Rendering ─────────────────────────────────────────────────────────────

/** Generate a human-readable summary of an arc. */
export function renderArcDescription(arc: StoryArc): string {
  const typeDescriptions: Record<StoryArcType, string> = {
    rise_of_hero: "A hero's rise to prominence",
    tragic_fall: "A tragic fall from grace",
    rivalry: "An ongoing rivalry",
    great_migration: "A great migration",
    settlement_growth: "The growth of a settlement",
    fallen_settlement: "The fall of a settlement",
    legendary_craftsman: "A legendary craftsman's legacy",
    notorious_villain: "The rise of a notorious villain",
    unlikely_friendship: "An unlikely friendship",
    betrayal_and_redemption: "A tale of betrayal and redemption",
  };

  return typeDescriptions[arc.arcType] || arc.description;
}

/** Get arcs that form a connected narrative (shared actors). */
export function getConnectedArcs(chronicle: Chronicle, arcId: string): StoryArc[] {
  const targetArc = chronicle.detectedArcs.find(a => a.arcId === arcId);
  if (!targetArc) return [];

  return chronicle.detectedArcs.filter(arc =>
    arc.arcId !== arcId &&
    arc.primaryActors.some(actor => targetArc.primaryActors.includes(actor))
  );
}
