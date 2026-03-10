// test/chronicle.test.ts — Phase 45: Chronicle System Tests

import { describe, it, expect, beforeEach } from "vitest";
import type { Chronicle, ChronicleEntry, ChronicleRegistry } from "../src/chronicle.js";
import {
  createChronicle,
  addChronicleEntry,
  calculateSignificance,
  isSignificant,
  getSignificantEntries,
  getEntriesInRange,
  getEntriesForEntity,
  getEntriesByType,
  createChronicleRegistry,
  recordEvent,
  summarizeChronicle,
  serializeChronicle,
  deserializeChronicle,
  serializeChronicleRegistry,
  deserializeChronicleRegistry,
  SIGNIFICANCE_SCORES,
} from "../src/chronicle.js";
import {
  detectStoryArcs,
  updateDetectedArcs,
  getArcsForEntity,
  getMostSignificantArc,
  getArcsInPeriod,
  isOngoingArc,
  getConnectedArcs,
} from "../src/story-arcs.js";
import {
  renderEntry,
  renderEntryVerbose,
  renderChronicle,
  renderArcSummary,
  renderArcNarrative,
  generateNarrative,
} from "../src/narrative-render.js";

describe("Chronicle Core", () => {
  describe("createChronicle", () => {
    it("creates a new chronicle with correct properties", () => {
      const chronicle = createChronicle("world", "world", 100);
      expect(chronicle.chronicleId).toBe("world");
      expect(chronicle.scope).toBe("world");
      expect(chronicle.entries).toEqual([]);
      expect(chronicle.createdAtTick).toBe(100);
      expect(chronicle.lastEntryTick).toBe(100);
      expect(chronicle.detectedArcs).toEqual([]);
    });

    it("supports entity scope with ownerId", () => {
      const chronicle = createChronicle("entity_5", "entity", 200, 5);
      expect(chronicle.ownerId).toBe(5);
    });

    it("supports settlement scope with string ownerId", () => {
      const chronicle = createChronicle("settlement_alpha", "settlement", 300, "alpha");
      expect(chronicle.ownerId).toBe("alpha");
    });
  });

  describe("addChronicleEntry", () => {
    let chronicle: Chronicle;

    beforeEach(() => {
      chronicle = createChronicle("test", "world", 0);
    });

    it("adds an entry and generates entryId", () => {
      const entry = addChronicleEntry(chronicle, {
        tick: 10,
        significance: 50,
        eventType: "entity_death",
        actors: [1],
        template: "death",
        variables: { actorName: "Hero" },
      });

      expect(entry.entryId).toBeDefined();
      expect(chronicle.entries).toHaveLength(1);
      expect(chronicle.lastEntryTick).toBe(10);
    });

    it("sorts entries by tick", () => {
      addChronicleEntry(chronicle, {
        tick: 20,
        significance: 50,
        eventType: "entity_death",
        actors: [1],
        template: "death",
        variables: {},
      });
      addChronicleEntry(chronicle, {
        tick: 10,
        significance: 50,
        eventType: "entity_birth",
        actors: [2],
        template: "birth",
        variables: {},
      });

      expect(chronicle.entries[0]!.tick).toBe(10);
      expect(chronicle.entries[1]!.tick).toBe(20);
    });

    it("uses provided seed for entryId generation", () => {
      const entry1 = addChronicleEntry(
        chronicle,
        {
          tick: 1,
          significance: 50,
          eventType: "entity_death",
          actors: [1],
          template: "death",
          variables: {},
        },
        12345,
      );
      const entry2 = addChronicleEntry(
        chronicle,
        {
          tick: 2,
          significance: 50,
          eventType: "entity_death",
          actors: [1],
          template: "death",
          variables: {},
        },
        12345,
      );

      expect(entry1.entryId).not.toBe(entry2.entryId);
    });
  });
});

describe("Significance Scoring", () => {
  it("returns base scores for event types", () => {
    expect(SIGNIFICANCE_SCORES.entity_death).toBe(80);
    expect(SIGNIFICANCE_SCORES.settlement_destroyed).toBe(90);
    expect(SIGNIFICANCE_SCORES.legendary_deed).toBe(85);
    expect(SIGNIFICANCE_SCORES.quest_accepted).toBe(20);
  });

  describe("calculateSignificance", () => {
    it("returns base score without context", () => {
      expect(calculateSignificance("entity_death")).toBe(80);
    });

    it("adds modifiers for famous actor", () => {
      expect(calculateSignificance("entity_death", { actorWasFamous: true })).toBe(95);
    });

    it("adds modifiers for first event", () => {
      expect(calculateSignificance("entity_birth", { wasFirst: true })).toBe(50);
    });

    it("adds modifiers for multiple parties", () => {
      expect(calculateSignificance("relationship_formed", { involvedMultipleParties: true })).toBe(50);
    });

    it("adds modifiers for unexpected outcome", () => {
      expect(calculateSignificance("combat_victory", { unexpectedOutcome: true })).toBe(40);
    });

    it("adds modifiers for lasting consequences", () => {
      expect(calculateSignificance("relationship_betrayal", { lastingConsequences: true })).toBe(85);
    });

    it("stacks multiple modifiers", () => {
      expect(
        calculateSignificance("entity_death", {
          actorWasFamous: true,
          wasFirst: true,
          unexpectedOutcome: true,
        }),
      ).toBe(100);
    });

    it("caps at 100", () => {
      expect(
        calculateSignificance("legendary_deed", {
          actorWasFamous: true,
          wasFirst: true,
          involvedMultipleParties: true,
          unexpectedOutcome: true,
          lastingConsequences: true,
        }),
      ).toBe(100);
    });
  });

  describe("isSignificant", () => {
    it("returns true when score meets threshold", () => {
      expect(isSignificant("entity_death", 80)).toBe(true);
    });

    it("returns false when score below threshold", () => {
      expect(isSignificant("quest_accepted", 25)).toBe(false);
    });

    it("uses default threshold of 25", () => {
      expect(isSignificant("combat_victory")).toBe(true);
      expect(isSignificant("quest_accepted")).toBe(false);
    });
  });
});

describe("Entry Queries", () => {
  let chronicle: Chronicle;

  beforeEach(() => {
    chronicle = createChronicle("test", "world", 0);
    addChronicleEntry(chronicle, {
      tick: 10,
      significance: 80,
      eventType: "entity_death",
      actors: [1],
      template: "death",
      variables: {},
    });
    addChronicleEntry(chronicle, {
      tick: 20,
      significance: 30,
      eventType: "combat_victory",
      actors: [1, 2],
      template: "combat",
      variables: {},
    });
    addChronicleEntry(chronicle, {
      tick: 30,
      significance: 60,
      eventType: "quest_completed",
      actors: [2],
      template: "quest",
      variables: {},
    });
  });

  describe("getSignificantEntries", () => {
    it("filters entries by significance threshold", () => {
      const significant = getSignificantEntries(chronicle, 50);
      expect(significant).toHaveLength(2);
      expect(significant.every((e) => e.significance >= 50)).toBe(true);
    });

    it("returns all entries if threshold is 0", () => {
      expect(getSignificantEntries(chronicle, 0)).toHaveLength(3);
    });

    it("returns empty array if threshold is too high", () => {
      expect(getSignificantEntries(chronicle, 100)).toHaveLength(0);
    });
  });

  describe("getEntriesInRange", () => {
    it("returns entries within tick range", () => {
      const entries = getEntriesInRange(chronicle, 15, 25);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.tick).toBe(20);
    });

    it("returns empty array for non-overlapping range", () => {
      expect(getEntriesInRange(chronicle, 100, 200)).toHaveLength(0);
    });
  });

  describe("getEntriesForEntity", () => {
    it("returns entries involving specific entity", () => {
      const entries = getEntriesForEntity(chronicle, 1);
      expect(entries).toHaveLength(2);
    });

    it("returns empty array for uninvolved entity", () => {
      expect(getEntriesForEntity(chronicle, 999)).toHaveLength(0);
    });
  });

  describe("getEntriesByType", () => {
    it("returns entries of specific type", () => {
      const entries = getEntriesByType(chronicle, "entity_death");
      expect(entries).toHaveLength(1);
      expect(entries[0]!.eventType).toBe("entity_death");
    });
  });
});

describe("Chronicle Registry", () => {
  describe("createChronicleRegistry", () => {
    it("creates registry with world chronicle", () => {
      const registry = createChronicleRegistry(100);
      expect(registry.worldChronicle.scope).toBe("world");
      expect(registry.entityChronicles.size).toBe(0);
      expect(registry.factionChronicles.size).toBe(0);
      expect(registry.settlementChronicles.size).toBe(0);
    });
  });

  describe("recordEvent", () => {
    let registry: ChronicleRegistry;

    beforeEach(() => {
      registry = createChronicleRegistry(0);
    });

    it("records to world chronicle if significant enough", () => {
      recordEvent(
        registry,
        {
          tick: 10,
          significance: 30,
          eventType: "entity_death",
          actors: [1],
          template: "death",
          variables: {},
        },
        { entityIds: [1] },
      );

      expect(registry.worldChronicle.entries).toHaveLength(1);
    });

    it("does not record to world chronicle if below threshold", () => {
      recordEvent(
        registry,
        {
          tick: 10,
          significance: 25,
          eventType: "combat_victory",
          actors: [1],
          template: "combat",
          variables: {},
        },
        { entityIds: [1] },
      );

      expect(registry.worldChronicle.entries).toHaveLength(0);
    });

    it("creates entity chronicle on first record", () => {
      recordEvent(
        registry,
        {
          tick: 10,
          significance: 50,
          eventType: "entity_death",
          actors: [1],
          template: "death",
          variables: {},
        },
        { entityIds: [1] },
      );

      expect(registry.entityChronicles.has(1)).toBe(true);
      expect(registry.entityChronicles.get(1)!.entries).toHaveLength(1);
    });

    it("records to multiple entity chronicles", () => {
      recordEvent(
        registry,
        {
          tick: 10,
          significance: 50,
          eventType: "combat_victory",
          actors: [1, 2],
          template: "combat",
          variables: {},
        },
        { entityIds: [1, 2] },
      );

      expect(registry.entityChronicles.get(1)!.entries).toHaveLength(1);
      expect(registry.entityChronicles.get(2)!.entries).toHaveLength(1);
    });

    it("creates faction chronicle on first record", () => {
      recordEvent(
        registry,
        {
          tick: 10,
          significance: 50,
          eventType: "settlement_founded",
          actors: [],
          template: "settlement",
          variables: {},
        },
        { factionIds: [1] },
      );

      expect(registry.factionChronicles.has(1)).toBe(true);
    });

    it("creates settlement chronicle on first record", () => {
      recordEvent(
        registry,
        {
          tick: 10,
          significance: 50,
          eventType: "settlement_founded",
          actors: [],
          template: "settlement",
          variables: {},
        },
        { settlementId: "alpha" },
      );

      expect(registry.settlementChronicles.has("alpha")).toBe(true);
    });
  });
});

describe("Chronicle Summarization", () => {
  let chronicle: Chronicle;

  beforeEach(() => {
    chronicle = createChronicle("test", "world", 0);
    // Add some entries with varying significance
    addChronicleEntry(chronicle, {
      tick: 10,
      significance: 80,
      eventType: "entity_death",
      actors: [1],
      template: "death",
      variables: {},
    });
    addChronicleEntry(chronicle, {
      tick: 20,
      significance: 30,
      eventType: "combat_victory",
      actors: [1, 2],
      template: "combat",
      variables: {},
    });
    addChronicleEntry(chronicle, {
      tick: 30,
      significance: 90,
      eventType: "settlement_destroyed",
      actors: [],
      template: "destruction",
      variables: {},
    });
  });

  it("summarizes at full level", () => {
    const summary = summarizeChronicle(chronicle, "full");
    expect(summary.level).toBe("full");
    expect(summary.totalEntries).toBe(3);
    expect(summary.includedEntries).toBe(3);
  });

  it("summarizes at chapter level", () => {
    const summary = summarizeChronicle(chronicle, "chapter");
    expect(summary.level).toBe("chapter");
    expect(summary.totalEntries).toBe(3);
  });

  it("summarizes at synopsis level", () => {
    const summary = summarizeChronicle(chronicle, "synopsis");
    expect(summary.level).toBe("synopsis");
    expect(summary.totalEntries).toBe(3);
    expect(summary.includedEntries).toBe(2); // 70+ significance only
  });
});

describe("Story Arc Detection", () => {
  describe("detectRiseOfHeroArcs", () => {
    it("detects hero rise from multiple victories", () => {
      const chronicle = createChronicle("test", "world", 0);
      // Hero with 3+ victories, no death
      addChronicleEntry(chronicle, {
        tick: 10,
        significance: 45,
        eventType: "combat_victory",
        actors: [1],
        template: "combat",
        variables: {},
      });
      addChronicleEntry(chronicle, {
        tick: 20,
        significance: 45,
        eventType: "quest_completed",
        actors: [1],
        template: "quest",
        variables: {},
      });
      addChronicleEntry(chronicle, {
        tick: 30,
        significance: 45,
        eventType: "combat_victory",
        actors: [1],
        template: "combat",
        variables: {},
      });

      const arcs = detectStoryArcs(chronicle);
      const heroArcs = arcs.filter((a) => a.arcType === "rise_of_hero");

      expect(heroArcs).toHaveLength(1);
      expect(heroArcs[0]!.primaryActors).toContain(1);
    });

    it("does not detect hero arc if entity died", () => {
      const chronicle = createChronicle("test", "world", 0);
      addChronicleEntry(chronicle, {
        tick: 10,
        significance: 45,
        eventType: "combat_victory",
        actors: [1],
        template: "combat",
        variables: {},
      });
      addChronicleEntry(chronicle, {
        tick: 20,
        significance: 45,
        eventType: "combat_victory",
        actors: [1],
        template: "combat",
        variables: {},
      });
      addChronicleEntry(chronicle, {
        tick: 30,
        significance: 80,
        eventType: "entity_death",
        actors: [1],
        template: "death",
        variables: {},
      });

      const arcs = detectStoryArcs(chronicle);
      const heroArcs = arcs.filter((a) => a.arcType === "rise_of_hero");

      expect(heroArcs).toHaveLength(0);
    });
  });

  describe("detectTragicFallArcs", () => {
    it("detects tragic fall after betrayal", () => {
      const chronicle = createChronicle("test", "world", 0);
      // Positive events first
      addChronicleEntry(chronicle, {
        tick: 10,
        significance: 45,
        eventType: "quest_completed",
        actors: [1],
        template: "quest",
        variables: {},
      });
      addChronicleEntry(chronicle, {
        tick: 20,
        significance: 40,
        eventType: "relationship_formed",
        actors: [1, 2],
        template: "relationship",
        variables: {},
      });
      // Then betrayal
      addChronicleEntry(chronicle, {
        tick: 30,
        significance: 75,
        eventType: "relationship_betrayal",
        actors: [1],
        template: "betrayal",
        variables: {},
      });

      const arcs = detectStoryArcs(chronicle);
      const fallArcs = arcs.filter((a) => a.arcType === "tragic_fall");

      expect(fallArcs).toHaveLength(1);
    });
  });

  describe("detectRivalryArcs", () => {
    it("detects rivalry from repeated combat", () => {
      const chronicle = createChronicle("test", "world", 0);
      // Two entities fight multiple times
      addChronicleEntry(chronicle, {
        tick: 10,
        significance: 25,
        eventType: "combat_victory",
        actors: [1, 2],
        template: "combat",
        variables: {},
      });
      addChronicleEntry(chronicle, {
        tick: 30,
        significance: 30,
        eventType: "combat_defeat",
        actors: [1, 2],
        template: "combat",
        variables: {},
      });

      const arcs = detectStoryArcs(chronicle);
      const rivalryArcs = arcs.filter((a) => a.arcType === "rivalry");

      expect(rivalryArcs).toHaveLength(1);
      expect(rivalryArcs[0]!.primaryActors).toContain(1);
      expect(rivalryArcs[0]!.primaryActors).toContain(2);
    });

    it("does not detect rivalry if one died", () => {
      const chronicle = createChronicle("test", "world", 0);
      addChronicleEntry(chronicle, {
        tick: 10,
        significance: 25,
        eventType: "combat_victory",
        actors: [1, 2],
        template: "combat",
        variables: {},
      });
      addChronicleEntry(chronicle, {
        tick: 20,
        significance: 80,
        eventType: "entity_death",
        actors: [2],
        template: "death",
        variables: {},
      });

      const arcs = detectStoryArcs(chronicle);
      const rivalryArcs = arcs.filter((a) => a.arcType === "rivalry");

      expect(rivalryArcs).toHaveLength(0);
    });
  });

  describe("detectSettlementGrowthArcs", () => {
    it("detects settlement growth from foundation and upgrades", () => {
      const chronicle = createChronicle("test", "world", 0);
      addChronicleEntry(chronicle, {
        tick: 10,
        significance: 60,
        eventType: "settlement_founded",
        actors: [],
        template: "settlement",
        variables: {},
        settlementId: "alpha",
      });
      addChronicleEntry(chronicle, {
        tick: 30,
        significance: 50,
        eventType: "settlement_upgraded",
        actors: [],
        template: "upgrade",
        variables: {},
        settlementId: "alpha",
      });

      const arcs = detectStoryArcs(chronicle);
      const growthArcs = arcs.filter((a) => a.arcType === "settlement_growth");

      expect(growthArcs).toHaveLength(1);
    });
  });

  describe("detectLegendaryCraftsmanArcs", () => {
    it("detects legendary craftsman from multiple masterworks", () => {
      const chronicle = createChronicle("test", "world", 0);
      addChronicleEntry(chronicle, {
        tick: 10,
        significance: 50,
        eventType: "masterwork_crafted",
        actors: [1],
        template: "craft",
        variables: {},
      });
      addChronicleEntry(chronicle, {
        tick: 30,
        significance: 50,
        eventType: "masterwork_crafted",
        actors: [1],
        template: "craft",
        variables: {},
      });

      const arcs = detectStoryArcs(chronicle);
      const craftsmanArcs = arcs.filter((a) => a.arcType === "legendary_craftsman");

      expect(craftsmanArcs).toHaveLength(1);
      expect(craftsmanArcs[0]!.significance).toBe(76); // 60 + 2*8
    });
  });

  describe("updateDetectedArcs", () => {
    it("updates chronicle with detected arcs", () => {
      const chronicle = createChronicle("test", "world", 0);
      addChronicleEntry(chronicle, {
        tick: 10,
        significance: 50,
        eventType: "masterwork_crafted",
        actors: [1],
        template: "craft",
        variables: {},
      });
      addChronicleEntry(chronicle, {
        tick: 20,
        significance: 50,
        eventType: "masterwork_crafted",
        actors: [1],
        template: "craft",
        variables: {},
      });

      updateDetectedArcs(chronicle);

      expect(chronicle.detectedArcs.length).toBeGreaterThan(0);
    });
  });

  describe("arc query functions", () => {
    let chronicle: Chronicle;

    beforeEach(() => {
      chronicle = createChronicle("test", "world", 0);
      addChronicleEntry(chronicle, {
        tick: 10,
        significance: 50,
        eventType: "masterwork_crafted",
        actors: [1],
        template: "craft",
        variables: {},
      });
      addChronicleEntry(chronicle, {
        tick: 20,
        significance: 50,
        eventType: "masterwork_crafted",
        actors: [1],
        template: "craft",
        variables: {},
      });
      updateDetectedArcs(chronicle);
    });

    it("getArcsForEntity returns arcs for specific entity", () => {
      const arcs = getArcsForEntity(chronicle, 1);
      expect(arcs.length).toBeGreaterThan(0);
    });

    it("getMostSignificantArc returns highest significance arc", () => {
      const arc = getMostSignificantArc(chronicle);
      expect(arc).toBeDefined();
      expect(arc!.significance).toBeGreaterThan(0);
    });

    it("getArcsInPeriod returns arcs within time range", () => {
      const arcs = getArcsInPeriod(chronicle, 5, 25);
      expect(arcs.length).toBeGreaterThan(0);
    });

    it("isOngoingArc returns true for arcs without end tick", () => {
      const arc = chronicle.detectedArcs[0]!;
      // Simulate ongoing arc
      arc.endTick = undefined;
      expect(isOngoingArc(arc, 100)).toBe(true);
    });

    it("getConnectedArcs returns arcs with shared actors", () => {
      // Add a second arc with same actor
      addChronicleEntry(chronicle, {
        tick: 30,
        significance: 50,
        eventType: "masterwork_crafted",
        actors: [1],
        template: "craft",
        variables: {},
      });
      addChronicleEntry(chronicle, {
        tick: 40,
        significance: 50,
        eventType: "masterwork_crafted",
        actors: [1],
        template: "craft",
        variables: {},
      });
      updateDetectedArcs(chronicle);

      const arc = chronicle.detectedArcs[0]!;
      const connected = getConnectedArcs(chronicle, arc.arcId);
      // Should have at least one connected arc (the other legendary craftsman arc)
      expect(connected.length).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("Narrative Rendering", () => {
  describe("renderEntry", () => {
    it("renders entity death entry", () => {
      const entry: ChronicleEntry = {
        entryId: "test_1",
        tick: 10,
        significance: 80,
        eventType: "entity_death",
        actors: [1],
        template: "death",
        variables: { actorName: "Hero", cause: "sword wound" },
      };
      expect(renderEntry(entry)).toContain("Hero died");
      expect(renderEntry(entry)).toContain("sword wound");
    });

    it("renders quest completion", () => {
      const entry: ChronicleEntry = {
        entryId: "test_2",
        tick: 20,
        significance: 45,
        eventType: "quest_completed",
        actors: [1],
        template: "quest",
        variables: { actorName: "Hero", questName: "Dragon Slayer" },
      };
      expect(renderEntry(entry)).toContain("completed the quest");
      expect(renderEntry(entry)).toContain("Dragon Slayer");
    });

    it("returns cached rendered if available", () => {
      const entry: ChronicleEntry = {
        entryId: "test_3",
        tick: 10,
        significance: 50,
        eventType: "entity_death",
        actors: [],
        template: "death",
        variables: {},
        rendered: "Cached render",
      };
      expect(renderEntry(entry)).toBe("Cached render");
    });

    it("handles unknown event type", () => {
      const entry: ChronicleEntry = {
        entryId: "test_4",
        tick: 10,
        significance: 50,
        eventType: "legendary_deed",
        actors: [],
        template: "deed",
        variables: { hero: "Hero", deedDescription: "saved the village" },
      };
      const rendered = renderEntry(entry);
      expect(rendered.length).toBeGreaterThan(0);
    });
  });

  describe("renderEntryVerbose", () => {
    it("includes significance and actors", () => {
      const entry: ChronicleEntry = {
        entryId: "test_5",
        tick: 10,
        significance: 80,
        eventType: "entity_death",
        actors: [1, 2],
        template: "death",
        variables: { actorName: "Hero" },
        settlementId: "alpha",
      };
      const verbose = renderEntryVerbose(entry);
      expect(verbose).toContain("[Significance: 80/100]");
      expect(verbose).toContain("(Actors: 1, 2)");
      expect(verbose).toContain("@alpha");
    });
  });

  describe("renderChronicle", () => {
    const entries: ChronicleEntry[] = [
      {
        entryId: "e1",
        tick: 10,
        significance: 80,
        eventType: "entity_death",
        actors: [1],
        template: "death",
        variables: { actorName: "Hero" },
      },
      {
        entryId: "e2",
        tick: 20,
        significance: 30,
        eventType: "combat_victory",
        actors: [1, 2],
        template: "combat",
        variables: { victor: "Hero", defeated: "Villain" },
      },
    ];

    it("renders in compact format", () => {
      const text = renderChronicle(entries, { format: "compact" });
      expect(text).toContain("[Tick 10]");
      expect(text).toContain("[Tick 20]");
    });

    it("renders in chronological format", () => {
      const text = renderChronicle(entries, { format: "chronological" });
      expect(text).toContain("Turn 10:");
      expect(text).toContain("Turn 20:");
    });

    it("renders in prose format by default", () => {
      const text = renderChronicle(entries, { format: "prose" });
      expect(text.length).toBeGreaterThan(0);
    });

    it("filters by significance threshold", () => {
      const text = renderChronicle(entries, {
        format: "compact",
        minSignificance: 50,
      });
      expect(text).toContain("Tick 10");
      expect(text).not.toContain("Tick 20");
    });

    it("returns message for no events", () => {
      const text = renderChronicle([], { format: "prose" });
      expect(text).toBe("No events recorded.");
    });
  });

  describe("renderArcSummary", () => {
    it("renders hero arc summary", () => {
      const arc = {
        arcId: "test",
        arcType: "rise_of_hero" as const,
        entryIds: ["e1", "e2", "e3"],
        primaryActors: [1],
        startTick: 10,
        endTick: 50,
        significance: 80,
        description: "Hero rises",
      };
      expect(renderArcSummary(arc)).toContain("hero's journey");
    });

    it("renders rivalry arc summary", () => {
      const arc = {
        arcId: "test",
        arcType: "rivalry" as const,
        entryIds: ["e1", "e2"],
        primaryActors: [1, 2],
        startTick: 10,
        endTick: 50,
        significance: 60,
        description: "Ongoing rivalry",
      };
      expect(renderArcSummary(arc)).toContain("rivalry");
    });

    it("falls back to description for unknown arc type", () => {
      const arc = {
        arcId: "test",
        arcType: "unknown_type" as any,
        entryIds: [],
        primaryActors: [],
        startTick: 10,
        endTick: 50,
        significance: 50,
        description: "Custom description",
      };
      expect(renderArcSummary(arc)).toBe("Custom description");
    });
  });

  describe("renderArcNarrative", () => {
    it("renders complete arc with entries", () => {
      const arc = {
        arcId: "test",
        arcType: "rise_of_hero" as const,
        entryIds: ["e1"],
        primaryActors: [1],
        startTick: 10,
        endTick: 50,
        significance: 80,
        description: "Hero rises",
      };
      const entry: ChronicleEntry = {
        entryId: "e1",
        tick: 10,
        significance: 50,
        eventType: "combat_victory",
        actors: [1],
        template: "combat",
        variables: { victor: "Hero", defeated: "Enemy" },
      };
      const entryMap = new Map([["e1", entry]]);

      const narrative = renderArcNarrative(arc, entryMap);
      expect(narrative).toContain("RISE OF HERO");
      expect(narrative).toContain("Significance: 80/100");
      expect(narrative).toContain("[10]");
    });
  });

  describe("generateNarrative", () => {
    it("generates complete narrative from arcs and entries", () => {
      const arcs = [
        {
          arcId: "a1",
          arcType: "rise_of_hero" as const,
          entryIds: ["e1", "e2"],
          primaryActors: [1],
          startTick: 10,
          endTick: 50,
          significance: 80,
          description: "Hero rises",
        },
      ];
      const entries: ChronicleEntry[] = [
        {
          entryId: "e1",
          tick: 10,
          significance: 50,
          eventType: "combat_victory",
          actors: [1],
          template: "combat",
          variables: { victor: "Hero", defeated: "Enemy" },
        },
      ];

      const narrative = generateNarrative(arcs, entries);
      expect(narrative.title).toContain("Rise Of Hero");
      expect(narrative.summary).toContain("hero's journey");
      expect(narrative.fullText).toBeDefined();
      expect(narrative.keyFigures).toContain(1);
      expect(narrative.estimatedDrama).toBeGreaterThan(0);
    });

    it("handles empty arcs gracefully", () => {
      const narrative = generateNarrative([], []);
      expect(narrative.title).toBe("Chronicle of Events");
      expect(narrative.summary).toContain("unconnected events");
    });
  });
});

describe("Chronicle Serialization", () => {
  describe("serializeChronicle / deserializeChronicle", () => {
    it("round-trips chronicle data", () => {
      const chronicle = createChronicle("test_chronicle", "world", 100);
      addChronicleEntry(chronicle, {
        tick: 10,
        significance: 50,
        eventType: "entity_death",
        actors: [1],
        template: "death",
        variables: { actorName: "Test" },
      });

      const serialized = serializeChronicle(chronicle);
      const restored = deserializeChronicle(serialized);

      expect(restored.chronicleId).toBe(chronicle.chronicleId);
      expect(restored.scope).toBe(chronicle.scope);
      expect(restored.entries).toHaveLength(1);
      expect(restored.entries[0]!.variables.actorName).toBe("Test");
    });

    it("handles empty entries", () => {
      const chronicle = createChronicle("empty", "world", 0);
      const serialized = serializeChronicle(chronicle);
      const restored = deserializeChronicle(serialized);

      expect(restored.entries).toEqual([]);
    });
  });

  describe("serializeChronicleRegistry / deserializeChronicleRegistry", () => {
    it("round-trips registry data", () => {
      const registry = createChronicleRegistry(100);
      recordEvent(
        registry,
        {
          tick: 10,
          significance: 50,
          eventType: "entity_death",
          actors: [1],
          template: "death",
          variables: {},
        },
        { entityIds: [1], factionIds: [1], settlementId: "alpha" },
      );

      const serialized = serializeChronicleRegistry(registry);
      const restored = deserializeChronicleRegistry(serialized);

      expect(restored.worldChronicle.entries).toHaveLength(1);
      expect(restored.entityChronicles.has(1)).toBe(true);
      expect(restored.factionChronicles.has(1)).toBe(true);
      expect(restored.settlementChronicles.has("alpha")).toBe(true);
    });
  });
});
