// src/world-generation.ts — Phase 46: Procedural World Generation
//
// Deterministic generation of settlements, factions, and starting relationships
// from a single world seed. Integrates with settlement (Phase 44), faction
// (Phase 39), relationships (Phase 42), and chronicle (Phase 45) systems.

import type { Q } from "./units.js";
import { q, SCALE } from "./units.js";
import { makeRng } from "./rng.js";
import { eventSeed } from "./sim/seeds.js";
import type { Settlement } from "./settlement.js";
import { createSettlement, SETTLEMENT_TIER_NAMES } from "./settlement.js";
import type { Faction, FactionRegistry } from "./faction.js";
import { createFactionRegistry, STANDING_NEUTRAL } from "./faction.js";
import type { RelationshipGraph } from "./relationships.js";
import { establishRelationship } from "./relationships.js";
import type { ChronicleRegistry } from "./chronicle.js";
import { createChronicleRegistry, addChronicleEntry } from "./chronicle.js";
import { generateSpeciesIndividual, FANTASY_HUMANOID_SPECIES } from "./species.js";
import type { SpeciesDefinition, SpeciesEntitySpec } from "./species.js";

// ── World Seed & Configuration ────────────────────────────────────────────────

export interface WorldGenConfig {
  /** World seed for deterministic generation */
  worldSeed: number;
  /** Number of settlements to generate */
  settlementCount: number;
  /** Number of factions to generate */
  factionCount: number;
  /** Average entities per settlement */
  entitiesPerSettlement: number;
  /** World bounds in meters */
  worldSize_m: number;
  /** Era/tech level for generation */
  era: "ancient" | "medieval" | "renaissance" | "industrial" | "modern" | "future";
  /** Enable starting conflicts between factions */
  enableStartingConflicts: boolean;
  /** Density of pre-existing relationships (0-1) */
  relationshipDensity: Q;
}

export const DEFAULT_WORLDGEN_CONFIG: WorldGenConfig = {
  worldSeed: 12345,
  settlementCount: 5,
  factionCount: 3,
  entitiesPerSettlement: 10,
  worldSize_m: 10000,
  era: "medieval",
  enableStartingConflicts: true,
  relationshipDensity: q(0.3),
};

// ── Generated World Container ─────────────────────────────────────────────────

export interface WorldInhabitant {
  entityId: number;
  teamId?: string;
  settlementId: string;
  spec: SpeciesEntitySpec;
  name: string;
}

export interface GeneratedWorld {
  worldSeed: number;
  config: WorldGenConfig;
  settlements: Settlement[];
  factions: Faction[];
  factionRegistry: FactionRegistry;
  inhabitants: WorldInhabitant[];
  settlementInhabitants: Map<string, number[]>;
  factionMembers: Map<string, number[]>;
  relationshipGraph: RelationshipGraph;
  chronicleRegistry: ChronicleRegistry;
  createdAtTick: number;
}

// ── Name Generators ───────────────────────────────────────────────────────────

const SETTLEMENT_PREFIXES = [
  "North", "South", "East", "West", "High", "Low", "Deep", "Bright", "Shadow",
  "Stone", "Iron", "Gold", "Silver", "Oak", "Pine", "River", "Lake", "Frost",
  "Ember", "Dusk", "Dawn", "Storm", "Wind", "Thorn", "Ash", "Mist",
];

const SETTLEMENT_SUFFIXES = [
  "haven", "ford", "burg", "heim", "ton", "ville", "port", "stead",
  "wich", "by", "minster", "borough", "ham", "field", "crest", "fall",
  "watch", "keep", "spire", "glen", "moor", "holm", "strand",
];

const FACTION_ADJECTIVES = [
  "Iron", "Golden", "Crimson", "Azure", "Shadow", "Radiant", "Silent",
  "Valiant", "Mercantile", "Ancient", "Noble", "Common", "Sovereign",
  "Mystic", "Stalwart", "Wandering", "Bold", "Cunning", "Honorable",
];

const FACTION_NOUNS = [
  "Legion", "Guild", "Order", "League", "Covenant", "Compact", "Alliance",
  "Company", "Clan", "House", "Crown", "Council", "Circle", "Brotherhood",
  "Sisterhood", "Fellowship", "Union", "Coalition", "Society", "Congregation",
];

const FIRST_NAMES = [
  "Aldric", "Beorn", "Cedric", "Duncan", "Eadric", "Faramond", "Godric", "Harold",
  "Ivor", "Jareth", "Kendrick", "Leofric", "Merrick", "Nigel", "Oswin", "Percival",
  "Quentin", "Rowan", "Sigeric", "Theobald", "Ulric", "Vortigern", "Wulfric", "Yorick",
  "Aeliana", "Brunhild", "Cassandra", "Daphne", "Elowen", "Freya", "Guinevere", "Hilda",
  "Isolde", "Jocelyn", "Kira", "Linnea", "Morgana", "Nimue", "Ophelia", "Rowena",
];

function randomIndex(rngQ01: Q, arrayLength: number): number {
  return Math.floor((rngQ01 / SCALE.Q) * arrayLength);
}

function generateSettlementName(rng: { q01: () => Q }): string {
  const prefix = SETTLEMENT_PREFIXES[randomIndex(rng.q01(), SETTLEMENT_PREFIXES.length)]!;
  const suffix = SETTLEMENT_SUFFIXES[randomIndex(rng.q01(), SETTLEMENT_SUFFIXES.length)]!;
  return prefix + suffix;
}

function generateFactionName(rng: { q01: () => Q }): string {
  const adj = FACTION_ADJECTIVES[randomIndex(rng.q01(), FACTION_ADJECTIVES.length)]!;
  const noun = FACTION_NOUNS[randomIndex(rng.q01(), FACTION_NOUNS.length)]!;
  return `The ${adj} ${noun}`;
}

function generateIndividualName(rng: { q01: () => Q }): string {
  return FIRST_NAMES[randomIndex(rng.q01(), FIRST_NAMES.length)]!;
}

// ── Settlement Generation ─────────────────────────────────────────────────────

function generateSettlements(config: WorldGenConfig, tick: number): Settlement[] {
  const settlements: Settlement[] = [];

  for (let i = 0; i < config.settlementCount; i++) {
    const seed = eventSeed(config.worldSeed, tick, i, 0, 0x5E771E);
    const rng = makeRng(seed, SCALE.Q);

    const angle = (i / config.settlementCount) * Math.PI * 2 + (rng.q01() / SCALE.Q) * 0.5;
    const dist = (rng.q01() / SCALE.Q) * config.worldSize_m * 0.4;
    const x = Math.trunc(config.worldSize_m / 2 + Math.cos(angle) * dist);
    const y = Math.trunc(config.worldSize_m / 2 + Math.sin(angle) * dist);

    const tierRoll = rng.q01() / SCALE.Q;
    let tier = 0;
    if (tierRoll > 0.7) tier = 1;
    if (tierRoll > 0.85) tier = 2;
    if (tierRoll > 0.95) tier = 3;
    if (tierRoll > 0.99) tier = 4;

    const name = generateSettlementName(rng);
    const settlementId = `settlement_${i}`;

    const settlement = createSettlement(settlementId, name, { x, y }, tick, tier as 0 | 1 | 2 | 3 | 4);
    settlements.push(settlement);
  }

  return settlements;
}

// ── Faction Generation ─────────────────────────────────────────────────────────

function generateFactions(
  config: WorldGenConfig,
  settlements: Settlement[],
  tick: number,
): { factions: Faction[]; registry: FactionRegistry } {
  const factions: Faction[] = [];

  for (let i = 0; i < config.factionCount; i++) {
    const seed = eventSeed(config.worldSeed, tick, i, 0, 0xFAC710);
    const localRng = makeRng(seed, SCALE.Q);

    const name = generateFactionName(localRng);
    const factionId = `faction_${i}`;

    const faction: Faction = {
      id: factionId,
      name,
      rivals: new Set<string>(),
      allies: new Set<string>(),
    };

    factions.push(faction);
  }

  if (config.enableStartingConflicts) {
    for (let i = 0; i < factions.length; i++) {
      for (let j = i + 1; j < factions.length; j++) {
        const seed = eventSeed(config.worldSeed, tick, i, j, 0xFAC7);
        const relRng = makeRng(seed, SCALE.Q);

        const factionA = factions[i]!;
        const factionB = factions[j]!;

        if (relRng.q01() / SCALE.Q < 0.3) {
          factionA.rivals.add(factionB.id);
        } else if (relRng.q01() / SCALE.Q < 0.5) {
          factionA.allies.add(factionB.id);
          factionB.allies.add(factionA.id);
        }
      }
    }
  }

  const registry = createFactionRegistry(factions);
  return { factions, registry };
}

// ── Entity Generation ─────────────────────────────────────────────────────────

function getSpeciesForEra(_era: WorldGenConfig["era"]): SpeciesDefinition[] {
  return [...FANTASY_HUMANOID_SPECIES];
}

function generateInhabitants(
  config: WorldGenConfig,
  settlements: Settlement[],
  factions: Faction[],
  tick: number,
): {
  inhabitants: WorldInhabitant[];
  settlementInhabitants: Map<string, number[]>;
  factionMembers: Map<string, number[]>;
} {
  const inhabitants: WorldInhabitant[] = [];
  const settlementInhabitants = new Map<string, number[]>();
  const factionMembers = new Map<string, number[]>();

  let entityIdCounter = 1;
  const availableSpecies = getSpeciesForEra(config.era);

  for (let settlementIdx = 0; settlementIdx < settlements.length; settlementIdx++) {
    const settlement = settlements[settlementIdx]!;
    const entityIds: number[] = [];
    const rng = makeRng(eventSeed(config.worldSeed, tick, settlementIdx, 0, 0x5E7720), SCALE.Q);

    const basePop = Math.max(5, Math.floor(config.entitiesPerSettlement * (0.7 + (rng.q01() / SCALE.Q) * 0.6)));
    const population = Math.min(basePop, settlement.populationCap);

    const settlementFaction = factions.find((_, idx) => {
      const factionIndex = settlements.indexOf(settlement) % factions.length;
      return idx === factionIndex;
    });

    for (let i = 0; i < population; i++) {
      const entitySeed = eventSeed(config.worldSeed, tick, i, 0, 0x5E7721);
      const species = availableSpecies[randomIndex(rng.q01(), availableSpecies.length)]!;
      const spec = generateSpeciesIndividual(species, entitySeed);
      const entityId = entityIdCounter++;
      const name = generateIndividualName(makeRng(entitySeed, SCALE.Q));

      const inhabitant: WorldInhabitant = {
        entityId,
        settlementId: settlement.settlementId,
        spec,
        name,
      };

      if (settlementFaction && rng.q01() / SCALE.Q < 0.7) {
        inhabitant.teamId = settlementFaction.id;
        if (!factionMembers.has(settlementFaction.id)) {
          factionMembers.set(settlementFaction.id, []);
        }
        factionMembers.get(settlementFaction.id)!.push(entityId);
      }

      inhabitants.push(inhabitant);
      entityIds.push(entityId);
    }

    settlementInhabitants.set(settlement.settlementId, entityIds);
    settlement.population = population;
  }

  return { inhabitants, settlementInhabitants, factionMembers };
}

// ── Relationship Generation ───────────────────────────────────────────────────

function generateRelationships(
  config: WorldGenConfig,
  inhabitants: WorldInhabitant[],
  factionRegistry: FactionRegistry,
  tick: number,
): RelationshipGraph {
  const graph: RelationshipGraph = {
    relationships: new Map(),
    entityIndex: new Map(),
  };

  const rng = makeRng(eventSeed(config.worldSeed, tick, 0, 0, 0x5EED50), SCALE.Q);

  for (let i = 0; i < inhabitants.length; i++) {
    for (let j = i + 1; j < inhabitants.length; j++) {
      const entityA = inhabitants[i]!;
      const entityB = inhabitants[j]!;

      if (rng.q01() > config.relationshipDensity) continue;

      const seed = eventSeed(config.worldSeed, tick, entityA.entityId, entityB.entityId, 0x5EED51);
      const relRng = makeRng(seed, SCALE.Q);

      let baseAffinity = q(0);
      if (entityA.teamId && entityB.teamId) {
        if (entityA.teamId === entityB.teamId) {
          baseAffinity = q(0.4);
        } else {
          const standing = factionRegistry.globalStanding.get(entityA.teamId)?.get(entityB.teamId);
          if (standing !== undefined) {
            baseAffinity = standing - STANDING_NEUTRAL;
          }
        }
      }

      if (entityA.settlementId === entityB.settlementId) {
        baseAffinity += q(0.1);
      }

      const variance = Math.floor(((relRng.q01() / SCALE.Q) - 0.5) * q(0.4));
      const affinity = Math.max(-SCALE.Q, Math.min(SCALE.Q, baseAffinity + variance));
      const trust = Math.floor(Math.abs(affinity) * q(0.6));

      if (Math.abs(affinity) > q(0.1)) {
        establishRelationship(graph, entityA.entityId, entityB.entityId, tick, affinity, trust);
      }
    }
  }

  return graph;
}

// ── Chronicle Generation ───────────────────────────────────────────────────────

function generateWorldChronicles(
  config: WorldGenConfig,
  settlements: Settlement[],
  factions: Faction[],
  inhabitants: WorldInhabitant[],
  tick: number,
): ChronicleRegistry {
  const registry = createChronicleRegistry(tick);

  addChronicleEntry(registry.worldChronicle, {
    tick,
    significance: 100,
    eventType: "first_contact",
    actors: [],
    template: "world_creation",
    variables: {
      settlementCount: settlements.length,
      factionCount: factions.length,
      era: config.era,
    },
  });

  for (const settlement of settlements) {
    const founder = inhabitants.find((i) => i.settlementId === settlement.settlementId);
    addChronicleEntry(registry.worldChronicle, {
      tick: tick + 1,
      significance: 60,
      eventType: "settlement_founded",
      actors: founder ? [founder.entityId] : [],
      template: "settlement_founded",
      variables: {
        settlementName: settlement.name,
        founder: founder?.name ?? "Unknown",
        tier: SETTLEMENT_TIER_NAMES[settlement.tier],
      },
      settlementId: settlement.settlementId,
    });
  }

  for (const faction of factions) {
    addChronicleEntry(registry.worldChronicle, {
      tick: tick + 2,
      significance: 50,
      eventType: "first_contact",
      actors: [],
      template: "faction_formed",
      variables: {
        factionName: faction.name,
        homeSettlement: faction.id,
      },
    });
  }

  return registry;
}

// ── Main Generation Entry Point ────────────────────────────────────────────────

export function generateWorld(
  config: WorldGenConfig = DEFAULT_WORLDGEN_CONFIG,
  tick: number = 0,
): GeneratedWorld {
  const settlements = generateSettlements(config, tick);
  const { factions, registry: factionRegistry } = generateFactions(config, settlements, tick);
  const { inhabitants, settlementInhabitants, factionMembers } = generateInhabitants(
    config, settlements, factions, tick);
  const relationshipGraph = generateRelationships(config, inhabitants, factionRegistry, tick);
  const chronicleRegistry = generateWorldChronicles(config, settlements, factions, inhabitants, tick);

  return {
    worldSeed: config.worldSeed,
    config,
    settlements,
    factions,
    factionRegistry,
    inhabitants,
    settlementInhabitants,
    factionMembers,
    relationshipGraph,
    chronicleRegistry,
    createdAtTick: tick,
  };
}

// ── World Summary ─────────────────────────────────────────────────────────────

export function getWorldSummary(world: GeneratedWorld): {
  totalInhabitants: number;
  totalRelationships: number;
  settlementSummary: string[];
  factionSummary: string[];
} {
  const totalRelationships = world.relationshipGraph.relationships.size;

  const settlementSummary = world.settlements.map(
    (s) => `${s.name} (${SETTLEMENT_TIER_NAMES[s.tier]}): ${s.population} people`
  );

  const factionSummary = world.factions.map((f) => {
    const members = world.factionMembers.get(f.id)?.length ?? 0;
    const rivals = f.rivals.size > 0 ? ` [rivals: ${[...f.rivals].join(", ")}]` : "";
    const allies = f.allies.size > 0 ? ` [allies: ${[...f.allies].join(", ")}]` : "";
    return `${f.name}: ${members} members${rivals}${allies}`;
  });

  return {
    totalInhabitants: world.inhabitants.length,
    totalRelationships,
    settlementSummary,
    factionSummary,
  };
}
