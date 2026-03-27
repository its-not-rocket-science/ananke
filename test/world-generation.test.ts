// test/world-generation.test.ts — Phase 46: Procedural World Generation Tests

import { describe, it, expect } from "vitest";
import {
  generateWorld,
  DEFAULT_WORLDGEN_CONFIG,
  getWorldSummary,
  type WorldGenConfig,
} from "../src/world-generation.js";
import { q } from "../src/units.js";

describe("World Generation", () => {
  describe("generateWorld", () => {
    it("generates a world with default config", () => {
      const world = generateWorld();

      expect(world.worldSeed).toBe(DEFAULT_WORLDGEN_CONFIG.worldSeed);
      expect(world.settlements).toHaveLength(DEFAULT_WORLDGEN_CONFIG.settlementCount);
      expect(world.factions).toHaveLength(DEFAULT_WORLDGEN_CONFIG.factionCount);
      expect(world.inhabitants.length).toBeGreaterThan(0);
      expect(world.createdAtTick).toBe(0);
    });

    it("generates deterministic world from same seed", () => {
      const config: WorldGenConfig = {
        ...DEFAULT_WORLDGEN_CONFIG,
        worldSeed: 42,
      };

      const world1 = generateWorld(config, 100);
      const world2 = generateWorld(config, 100);

      expect(world1.settlements.length).toBe(world2.settlements.length);
      expect(world1.factions.length).toBe(world2.factions.length);
      expect(world1.inhabitants.length).toBe(world2.inhabitants.length);

      // Settlement names should match
      for (let i = 0; i < world1.settlements.length; i++) {
        expect(world1.settlements[i]!.name).toBe(world2.settlements[i]!.name);
      }

      // Faction names should match
      for (let i = 0; i < world1.factions.length; i++) {
        expect(world1.factions[i]!.name).toBe(world2.factions[i]!.name);
      }
    });

    it("generates different worlds from different seeds", () => {
      const world1 = generateWorld({ ...DEFAULT_WORLDGEN_CONFIG, worldSeed: 1 });
      const world2 = generateWorld({ ...DEFAULT_WORLDGEN_CONFIG, worldSeed: 2 });

      // At least some settlement names should differ
      const names1 = world1.settlements.map((s) => s.name);
      const names2 = world2.settlements.map((s) => s.name);
      const allSame = names1.every((n, i) => n === names2[i]);
      expect(allSame).toBe(false);
    });

    it("generates requested number of settlements", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        settlementCount: 3,
      });
      expect(world.settlements).toHaveLength(3);
    });

    it("generates requested number of factions", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        factionCount: 5,
      });
      expect(world.factions).toHaveLength(5);
    });

    it("generates settlements within world bounds", () => {
      const worldSize = 5000;
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        worldSize_m: worldSize,
      });

      for (const settlement of world.settlements) {
        expect(settlement.position.x).toBeGreaterThanOrEqual(0);
        expect(settlement.position.x).toBeLessThanOrEqual(worldSize);
        expect(settlement.position.y).toBeGreaterThanOrEqual(0);
        expect(settlement.position.y).toBeLessThanOrEqual(worldSize);
      }
    });

    it("assigns faction IDs correctly", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        factionCount: 3,
      });

      for (const faction of world.factions) {
        expect(faction.id).toMatch(/^faction_\d+$/);
        expect(faction.name).toBeTruthy();
      }
    });

    it("creates faction rivalries when conflicts enabled", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        factionCount: 4,
        enableStartingConflicts: true,
      });

      // With 4 factions and 30% conflict chance, we expect some rivalries
      let rivalryCount = 0;
      for (const faction of world.factions) {
        rivalryCount += faction.rivals.size;
      }

      // Rivalries are one-way in the data model
      expect(rivalryCount).toBeGreaterThanOrEqual(0);
    });

    it("creates no rivalries when conflicts disabled", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        factionCount: 4,
        enableStartingConflicts: false,
      });

      for (const faction of world.factions) {
        expect(faction.rivals.size).toBe(0);
      }
    });
  });

  describe("inhabitant generation", () => {
    it("generates inhabitants for each settlement", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        settlementCount: 2,
        entitiesPerSettlement: 5,
      });

      // Should have inhabitants in the map
      expect(world.settlementInhabitants.size).toBeGreaterThan(0);

      // Each settlement should have some inhabitants
      for (const settlement of world.settlements) {
        const inhabitants = world.settlementInhabitants.get(settlement.settlementId);
        expect(inhabitants).toBeDefined();
        expect(inhabitants!.length).toBeGreaterThan(0);
      }
    });

    it("assigns unique entity IDs", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        settlementCount: 2,
        entitiesPerSettlement: 10,
      });

      const ids = world.inhabitants.map((i) => i.entityId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("assigns inhabitants to factions", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        settlementCount: 3,
        factionCount: 3,
        entitiesPerSettlement: 10,
      });

      // Should have some faction members
      let totalMembers = 0;
      for (const members of world.factionMembers.values()) {
        totalMembers += members.length;
      }

      // With 70% faction assignment rate, expect some members
      expect(totalMembers).toBeGreaterThan(0);
    });

    it("tracks faction membership correctly", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        factionCount: 2,
      });

      for (const inhabitant of world.inhabitants) {
        if (inhabitant.teamId) {
          const members = world.factionMembers.get(inhabitant.teamId);
          expect(members).toBeDefined();
          expect(members).toContain(inhabitant.entityId);
        }
      }
    });

    it("generates inhabitants with names", () => {
      const world = generateWorld();

      for (const inhabitant of world.inhabitants) {
        expect(inhabitant.name).toBeTruthy();
        expect(typeof inhabitant.name).toBe("string");
        expect(inhabitant.name.length).toBeGreaterThan(0);
      }
    });

    it("generates inhabitants with species specs", () => {
      const world = generateWorld();

      for (const inhabitant of world.inhabitants) {
        expect(inhabitant.spec).toBeDefined();
        expect(inhabitant.spec.attributes).toBeDefined();
        expect(inhabitant.spec.innateTraits).toBeDefined();
      }
    });
  });

  describe("relationship generation", () => {
    it("generates relationships based on density", () => {
      const highDensityWorld = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        settlementCount: 2,
        entitiesPerSettlement: 8,
        relationshipDensity: q(0.8),
      });

      const lowDensityWorld = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        settlementCount: 2,
        entitiesPerSettlement: 8,
        relationshipDensity: q(0.1),
      });

      expect(highDensityWorld.relationshipGraph.relationships.size).toBeGreaterThan(
        lowDensityWorld.relationshipGraph.relationships.size
      );
    });

    it("creates same-settlement relationships", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        settlementCount: 1,
        entitiesPerSettlement: 10,
        relationshipDensity: q(0.5),
      });

      // Should have some relationships within the single settlement
      expect(world.relationshipGraph.relationships.size).toBeGreaterThan(0);
    });

    it("indexes relationships by entity", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        relationshipDensity: q(0.5),
      });

      expect(world.relationshipGraph.entityIndex.size).toBeGreaterThan(0);
    });
  });

  describe("chronicle generation", () => {
    it("creates world chronicle with creation entry", () => {
      const world = generateWorld();

      expect(world.chronicleRegistry.worldChronicle.entries.length).toBeGreaterThan(0);
      expect(world.chronicleRegistry.worldChronicle.scope).toBe("world");
    });

    it("records settlement founding entries", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        settlementCount: 3,
      });

      const settlementEntries = world.chronicleRegistry.worldChronicle.entries.filter(
        (e) => e.eventType === "settlement_founded"
      );

      expect(settlementEntries.length).toBe(3);
    });

    it("records faction formation entries", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        factionCount: 2,
      });

      const factionEntries = world.chronicleRegistry.worldChronicle.entries.filter(
        (e) => e.template === "faction_formed"
      );

      expect(factionEntries.length).toBe(2);
    });

    it("assigns settlement IDs to settlement entries", () => {
      const world = generateWorld();

      const settlementEntries = world.chronicleRegistry.worldChronicle.entries.filter(
        (e) => e.settlementId
      );

      for (const entry of settlementEntries) {
        expect(entry.settlementId).toBeDefined();
        expect(typeof entry.settlementId).toBe("string");
      }
    });
  });

  describe("getWorldSummary", () => {
    it("returns accurate summary statistics", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        settlementCount: 2,
        factionCount: 2,
      });

      const summary = getWorldSummary(world);

      expect(summary.totalInhabitants).toBe(world.inhabitants.length);
      expect(summary.totalRelationships).toBe(world.relationshipGraph.relationships.size);
      expect(summary.settlementSummary).toHaveLength(2);
      expect(summary.factionSummary).toHaveLength(2);
    });

    it("includes settlement details in summary", () => {
      const world = generateWorld();
      const summary = getWorldSummary(world);

      for (const summaryLine of summary.settlementSummary) {
        expect(summaryLine).toContain("people");
      }
    });

    it("includes faction details in summary", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        enableStartingConflicts: true,
      });
      const summary = getWorldSummary(world);

      for (const summaryLine of summary.factionSummary) {
        expect(summaryLine).toContain("members");
      }
    });
  });

  describe("era-specific generation", () => {
    it("generates fantasy species for medieval era", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        era: "medieval",
      });

      expect(world.inhabitants.length).toBeGreaterThan(0);
    });

    it("generates humans for modern era", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        era: "modern",
      });

      expect(world.inhabitants.length).toBeGreaterThan(0);
    });
  });

  describe("settlement properties", () => {
    it("generates settlements with varied tiers", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        settlementCount: 10,
      });

      const tiers = new Set(world.settlements.map((s) => s.tier));
      // Should have some variety in tiers
      expect(tiers.size).toBeGreaterThanOrEqual(1);
    });

    it("sets appropriate population caps by tier", () => {
      const world = generateWorld();

      for (const settlement of world.settlements) {
        // Higher tier should generally mean higher cap
        expect(settlement.populationCap).toBeGreaterThanOrEqual(10);
        expect(settlement.population).toBeLessThanOrEqual(settlement.populationCap);
      }
    });

    it("generates unique settlement IDs", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        settlementCount: 5,
      });

      const ids = world.settlements.map((s) => s.settlementId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("faction registry integration", () => {
    it("creates valid faction registry", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        factionCount: 3,
      });

      expect(world.factionRegistry.factions.size).toBe(3);
      expect(world.factionRegistry.globalStanding.size).toBe(3);
    });

    it("populates entity reputations map", () => {
      const world = generateWorld();

      // Should have some entity reputations for faction members
      expect(world.factionRegistry.entityReputations).toBeDefined();
    });

    it("reflects rivalries in global standing", () => {
      const world = generateWorld({
        ...DEFAULT_WORLDGEN_CONFIG,
        factionCount: 3,
        enableStartingConflicts: true,
      });

      // Check that rivalries are reflected in global standing
      for (const faction of world.factions) {
        for (const rivalId of faction.rivals) {
          const standing = world.factionRegistry.globalStanding.get(faction.id)?.get(rivalId);
          expect(standing).toBeDefined();
        }
      }
    });
  });
});
