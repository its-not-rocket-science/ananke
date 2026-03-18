// test/mythology.test.ts — Phase 66: Generative Mythology

import { describe, it, expect, beforeEach } from "vitest";
import { q, SCALE, type Q }                  from "../src/units.js";
import {
  MYTH_MIN_ENTRIES,
  PLAGUE_MIN_DEATHS,
  GOLDEN_AGE_MIN_EVENTS,
  BELIEF_FLOOR_Q,
  BELIEF_DECAY_PER_YEAR_Q,
  createMythRegistry,
  registerMyth,
  getMythsByFaction,
  compressMythsFromHistory,
  stepMythologyYear,
  scaledMythEffect,
  aggregateFactionMythEffect,
  type Myth,
  type MythRegistry,
} from "../src/mythology.js";
import {
  createLegendRegistry, registerLegend, type LegendRegistry,
} from "../src/legend.js";
import type { ChronicleEntry } from "../src/chronicle.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function mkLegendRegistry(): LegendRegistry {
  return createLegendRegistry();
}

function addLegend(
  reg:        LegendRegistry,
  legendId:   string,
  name:       string,
  reputation: "heroic" | "legendary" | "notorious" | "forgotten",
  fame_Q:     Q,
): void {
  registerLegend(reg, {
    legendId,
    subjectId:    1,
    subjectName:  name,
    reputation,
    fame_Q,
    tags:           [],
    sourceEntryIds: [],
    sourceArcTypes: [],
    createdAtTick:  0,
  });
}

function mkEntry(
  entryId:   string,
  eventType: ChronicleEntry["eventType"],
  tick:      number,
): ChronicleEntry {
  return {
    entryId,
    tick,
    significance: 80,
    eventType,
    actors: [],
    template: "test",
    variables: {},
  };
}

// ── Registry helpers ──────────────────────────────────────────────────────────

describe("MythRegistry helpers", () => {
  it("createMythRegistry returns empty registry", () => {
    const reg = createMythRegistry();
    expect(reg.myths.size).toBe(0);
  });

  it("registerMyth adds myth", () => {
    const reg = createMythRegistry();
    const myth: Myth = {
      id: "m1", archetype: "hero", name: "Test Hero", description: "desc",
      sourceIds: [], believingFactionIds: ["f1"], ageInDays: 0,
      belief_Q: q(0.80) as Q, effects: {
        fearThresholdMod_Q: q(0.08) as Q, diplomacyMod_Q: q(0.05) as Q,
        moraleBonus_Q: q(0.10) as Q, techMod_Q: q(0) as Q,
      },
    };
    registerMyth(reg, myth);
    expect(reg.myths.size).toBe(1);
  });

  it("getMythsByFaction filters by factionId", () => {
    const reg = createMythRegistry();
    const m1: Myth = {
      id: "m1", archetype: "hero", name: "Hero", description: "d",
      sourceIds: [], believingFactionIds: ["f1", "f2"], ageInDays: 0,
      belief_Q: q(0.80) as Q, effects: {
        fearThresholdMod_Q: q(0) as Q, diplomacyMod_Q: q(0) as Q,
        moraleBonus_Q: q(0) as Q, techMod_Q: q(0) as Q,
      },
    };
    const m2: Myth = { ...m1, id: "m2", believingFactionIds: ["f3"] };
    registerMyth(reg, m1);
    registerMyth(reg, m2);
    expect(getMythsByFaction(reg, "f1")).toHaveLength(1);
    expect(getMythsByFaction(reg, "f3")).toHaveLength(1);
    expect(getMythsByFaction(reg, "f99")).toHaveLength(0);
  });
});

// ── Hero myth detection ───────────────────────────────────────────────────────

describe("hero myth detection", () => {
  it("produces hero myth for heroic legend with sufficient fame", () => {
    const legends = mkLegendRegistry();
    addLegend(legends, "l1", "Aria", "heroic", q(0.60) as Q);
    const myths = compressMythsFromHistory(legends, [], ["f1"]);
    const heroes = myths.filter(m => m.archetype === "hero");
    expect(heroes).toHaveLength(1);
    expect(heroes[0]!.name).toContain("Aria");
  });

  it("skips heroic legend with fame below q(0.30)", () => {
    const legends = mkLegendRegistry();
    addLegend(legends, "l1", "Nobody", "heroic", q(0.20) as Q);
    const myths = compressMythsFromHistory(legends, [], ["f1"]);
    expect(myths.filter(m => m.archetype === "hero")).toHaveLength(0);
  });

  it("produces 'Legend' prefix for legendary reputation", () => {
    const legends = mkLegendRegistry();
    addLegend(legends, "l1", "Kael", "legendary", q(0.80) as Q);
    const myths = compressMythsFromHistory(legends, [], ["f1"]);
    const hero = myths.find(m => m.archetype === "hero");
    expect(hero?.name).toContain("Legend");
  });

  it("skips forgotten legends", () => {
    const legends = mkLegendRegistry();
    addLegend(legends, "l1", "OldOne", "forgotten", q(0.60) as Q);
    const myths = compressMythsFromHistory(legends, [], ["f1"]);
    expect(myths.filter(m => m.archetype === "hero")).toHaveLength(0);
  });

  it("multiple heroic legends produce multiple hero myths", () => {
    const legends = mkLegendRegistry();
    addLegend(legends, "l1", "Aria", "heroic", q(0.60) as Q);
    addLegend(legends, "l2", "Bron", "heroic", q(0.50) as Q);
    const myths = compressMythsFromHistory(legends, [], ["f1"]);
    expect(myths.filter(m => m.archetype === "hero")).toHaveLength(2);
  });
});

// ── Monster myth detection ────────────────────────────────────────────────────

describe("monster myth detection", () => {
  it("produces monster myth for notorious legend with sufficient fame", () => {
    const legends = mkLegendRegistry();
    addLegend(legends, "l1", "The Tyrant", "notorious", q(0.50) as Q);
    const myths = compressMythsFromHistory(legends, [], ["f1"]);
    expect(myths.filter(m => m.archetype === "monster")).toHaveLength(1);
  });

  it("skips notorious legend with fame below q(0.20)", () => {
    const legends = mkLegendRegistry();
    addLegend(legends, "l1", "Minor Thug", "notorious", q(0.15) as Q);
    const myths = compressMythsFromHistory(legends, [], ["f1"]);
    expect(myths.filter(m => m.archetype === "monster")).toHaveLength(0);
  });

  it("monster myth contains subject name", () => {
    const legends = mkLegendRegistry();
    addLegend(legends, "l1", "Malachar", "notorious", q(0.70) as Q);
    const myths = compressMythsFromHistory(legends, [], ["f1"]);
    const monster = myths.find(m => m.archetype === "monster");
    expect(monster?.name).toContain("Malachar");
  });
});

// ── Great plague myth ─────────────────────────────────────────────────────────

describe("great_plague myth detection", () => {
  it("triggers on cluster of PLAGUE_MIN_DEATHS deaths in PLAGUE_WINDOW_DAYS", () => {
    const entries = [
      mkEntry("e1", "entity_death", 0),
      mkEntry("e2", "entity_death", 10),  // day 0.5 at 20 ticks/day
      mkEntry("e3", "entity_death", 20),
      mkEntry("e4", "entity_death", 30),
    ];
    const myths = compressMythsFromHistory(mkLegendRegistry(), entries, ["f1"], 20);
    expect(myths.filter(m => m.archetype === "great_plague")).toHaveLength(1);
  });

  it("does not trigger when deaths are too spread out", () => {
    // 30-day window at 20 ticks/day = 600 ticks; spread deaths 700 ticks apart
    const entries = [
      mkEntry("e1", "entity_death", 0),
      mkEntry("e2", "entity_death", 700),
      mkEntry("e3", "entity_death", 1400),
    ];
    const myths = compressMythsFromHistory(mkLegendRegistry(), entries, ["f1"], 20);
    expect(myths.filter(m => m.archetype === "great_plague")).toHaveLength(0);
  });

  it("tragic_event entries also count toward plague cluster", () => {
    const entries = [
      mkEntry("e1", "entity_death", 0),
      mkEntry("e2", "tragic_event",  5),
      mkEntry("e3", "entity_death", 10),
    ];
    const myths = compressMythsFromHistory(mkLegendRegistry(), entries, ["f1"], 20);
    expect(myths.filter(m => m.archetype === "great_plague")).toHaveLength(1);
  });
});

// ── Divine wrath myth ─────────────────────────────────────────────────────────

describe("divine_wrath myth detection", () => {
  it("triggers on settlement_destroyed + nearby deaths", () => {
    const entries = [
      mkEntry("d1", "settlement_destroyed", 100),
      mkEntry("e1", "entity_death", 105),
      mkEntry("e2", "entity_death", 110),
    ];
    const myths = compressMythsFromHistory(mkLegendRegistry(), entries, ["f1"], 20);
    expect(myths.filter(m => m.archetype === "divine_wrath")).toHaveLength(1);
  });

  it("does not trigger without nearby deaths", () => {
    const entries = [mkEntry("d1", "settlement_destroyed", 100)];
    const myths = compressMythsFromHistory(mkLegendRegistry(), entries, ["f1"], 20);
    expect(myths.filter(m => m.archetype === "divine_wrath")).toHaveLength(0);
  });

  it("does not trigger when death is outside 14-day window", () => {
    // 14 days × 20 ticks = 280 ticks
    const entries = [
      mkEntry("d1", "settlement_destroyed", 0),
      mkEntry("e1", "entity_death", 400),
      mkEntry("e2", "entity_death", 500),
    ];
    const myths = compressMythsFromHistory(mkLegendRegistry(), entries, ["f1"], 20);
    expect(myths.filter(m => m.archetype === "divine_wrath")).toHaveLength(0);
  });
});

// ── Golden age myth ───────────────────────────────────────────────────────────

describe("golden_age myth detection", () => {
  it("triggers on GOLDEN_AGE_MIN_EVENTS consecutive constructive entries", () => {
    const entries = Array.from({ length: GOLDEN_AGE_MIN_EVENTS }, (_, i) =>
      mkEntry(`e${i}`, "masterwork_crafted", i * 10),
    );
    const myths = compressMythsFromHistory(mkLegendRegistry(), entries, ["f1"]);
    expect(myths.filter(m => m.archetype === "golden_age")).toHaveLength(1);
  });

  it("resets streak on combat_defeat", () => {
    const entries = [
      mkEntry("e1", "masterwork_crafted", 0),
      mkEntry("e2", "settlement_founded", 10),
      mkEntry("e3", "masterwork_crafted", 20),
      mkEntry("e4", "combat_defeat",      30),  // streak reset
      mkEntry("e5", "masterwork_crafted", 40),
      mkEntry("e6", "facility_completed", 50),
    ];
    const myths = compressMythsFromHistory(mkLegendRegistry(), entries, ["f1"]);
    expect(myths.filter(m => m.archetype === "golden_age")).toHaveLength(0);
  });

  it("includes settlement_upgraded and facility_completed in constructive events", () => {
    const entries = [
      mkEntry("e1", "settlement_upgraded", 0),
      mkEntry("e2", "facility_completed",  10),
      mkEntry("e3", "masterwork_crafted",  20),
      mkEntry("e4", "settlement_founded",  30),
      mkEntry("e5", "settlement_upgraded", 40),
    ];
    const myths = compressMythsFromHistory(mkLegendRegistry(), entries, ["f1"]);
    expect(myths.filter(m => m.archetype === "golden_age")).toHaveLength(1);
  });
});

// ── Trickster myth ────────────────────────────────────────────────────────────

describe("trickster myth detection", () => {
  it("triggers on betrayal + quest_failed", () => {
    const entries = [
      mkEntry("b1", "relationship_betrayal", 0),
      mkEntry("q1", "quest_failed", 100),
    ];
    const myths = compressMythsFromHistory(mkLegendRegistry(), entries, ["f1"]);
    expect(myths.filter(m => m.archetype === "trickster")).toHaveLength(1);
  });

  it("does not trigger with betrayal alone", () => {
    const entries = [mkEntry("b1", "relationship_betrayal", 0)];
    const myths = compressMythsFromHistory(mkLegendRegistry(), entries, ["f1"]);
    expect(myths.filter(m => m.archetype === "trickster")).toHaveLength(0);
  });

  it("does not trigger with quest_failed alone", () => {
    const entries = [mkEntry("q1", "quest_failed", 0)];
    const myths = compressMythsFromHistory(mkLegendRegistry(), entries, ["f1"]);
    expect(myths.filter(m => m.archetype === "trickster")).toHaveLength(0);
  });
});

// ── compressMythsFromHistory general ─────────────────────────────────────────

describe("compressMythsFromHistory general", () => {
  it("returns empty array for empty inputs", () => {
    const myths = compressMythsFromHistory(mkLegendRegistry(), [], []);
    expect(myths).toEqual([]);
  });

  it("believingFactionIds are propagated to all myths", () => {
    const legends = mkLegendRegistry();
    addLegend(legends, "l1", "Aria", "heroic", q(0.60) as Q);
    const myths = compressMythsFromHistory(legends, [], ["f1", "f2"]);
    for (const myth of myths) {
      expect(myth.believingFactionIds).toContain("f1");
      expect(myth.believingFactionIds).toContain("f2");
    }
  });

  it("each myth has a unique id", () => {
    const legends = mkLegendRegistry();
    addLegend(legends, "l1", "Aria",   "heroic",    q(0.60) as Q);
    addLegend(legends, "l2", "Terror", "notorious", q(0.50) as Q);
    const entries = [
      mkEntry("b1", "relationship_betrayal", 0),
      mkEntry("q1", "quest_failed", 100),
    ];
    const myths = compressMythsFromHistory(legends, entries, ["f1"]);
    const ids = myths.map(m => m.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("all myths start at ageInDays = 0", () => {
    const legends = mkLegendRegistry();
    addLegend(legends, "l1", "Aria", "heroic", q(0.60) as Q);
    const myths = compressMythsFromHistory(legends, [], ["f1"]);
    for (const myth of myths) expect(myth.ageInDays).toBe(0);
  });
});

// ── stepMythologyYear ─────────────────────────────────────────────────────────

describe("stepMythologyYear", () => {
  function mkRegWithMyth(belief_Q: Q): MythRegistry {
    const reg = createMythRegistry();
    registerMyth(reg, {
      id: "m1", archetype: "hero", name: "Hero", description: "d",
      sourceIds: [], believingFactionIds: ["f1"], ageInDays: 0,
      belief_Q, effects: {
        fearThresholdMod_Q: q(0) as Q, diplomacyMod_Q: q(0) as Q,
        moraleBonus_Q: q(0) as Q, techMod_Q: q(0) as Q,
      },
    });
    return reg;
  }

  it("increments ageInDays by 365", () => {
    const reg = mkRegWithMyth(q(0.80) as Q);
    stepMythologyYear(reg);
    expect(reg.myths.get("m1")!.ageInDays).toBe(365);
  });

  it("decays belief_Q each year", () => {
    const reg = mkRegWithMyth(q(0.80) as Q);
    const initial = reg.myths.get("m1")!.belief_Q;
    stepMythologyYear(reg);
    expect(reg.myths.get("m1")!.belief_Q).toBeLessThan(initial);
  });

  it("belief_Q never drops below BELIEF_FLOOR_Q", () => {
    const reg = mkRegWithMyth(q(0.11) as Q);
    for (let i = 0; i < 50; i++) stepMythologyYear(reg);
    expect(reg.myths.get("m1")!.belief_Q).toBeGreaterThanOrEqual(BELIEF_FLOOR_Q);
  });

  it("handles empty registry without throwing", () => {
    const reg = createMythRegistry();
    expect(() => stepMythologyYear(reg)).not.toThrow();
  });
});

// ── scaledMythEffect ──────────────────────────────────────────────────────────

describe("scaledMythEffect", () => {
  it("returns full effect at belief_Q = SCALE.Q", () => {
    const myth: Myth = {
      id: "m1", archetype: "hero", name: "H", description: "d",
      sourceIds: [], believingFactionIds: [], ageInDays: 0,
      belief_Q: SCALE.Q as Q,
      effects: {
        fearThresholdMod_Q: q(0.08) as Q, diplomacyMod_Q: q(0.05) as Q,
        moraleBonus_Q: q(0.10) as Q, techMod_Q: q(0) as Q,
      },
    };
    const eff = scaledMythEffect(myth);
    expect(eff.fearThresholdMod_Q).toBe(q(0.08));
    expect(eff.moraleBonus_Q).toBe(q(0.10));
  });

  it("returns half effect at belief_Q = SCALE.Q / 2", () => {
    const myth: Myth = {
      id: "m1", archetype: "hero", name: "H", description: "d",
      sourceIds: [], believingFactionIds: [], ageInDays: 0,
      belief_Q: Math.round(SCALE.Q / 2) as Q,
      effects: {
        fearThresholdMod_Q: q(0.08) as Q, diplomacyMod_Q: q(0) as Q,
        moraleBonus_Q: q(0) as Q, techMod_Q: q(0) as Q,
      },
    };
    const eff = scaledMythEffect(myth);
    // ~half of q(0.08) ≈ q(0.04)
    expect(eff.fearThresholdMod_Q).toBeCloseTo(q(0.04), -1);
  });
});

// ── aggregateFactionMythEffect ────────────────────────────────────────────────

describe("aggregateFactionMythEffect", () => {
  it("returns zero effect for faction with no myths", () => {
    const reg = createMythRegistry();
    const eff = aggregateFactionMythEffect(reg, "f1");
    expect(eff.moraleBonus_Q).toBe(0);
    expect(eff.diplomacyMod_Q).toBe(0);
  });

  it("hero myth produces positive moraleBonus for believing faction", () => {
    const reg = createMythRegistry();
    registerMyth(reg, {
      id: "m1", archetype: "hero", name: "Hero", description: "d",
      sourceIds: [], believingFactionIds: ["f1"], ageInDays: 0,
      belief_Q: SCALE.Q as Q,
      effects: {
        fearThresholdMod_Q: q(0.08) as Q, diplomacyMod_Q: q(0.05) as Q,
        moraleBonus_Q: q(0.10) as Q, techMod_Q: q(0) as Q,
      },
    });
    const eff = aggregateFactionMythEffect(reg, "f1");
    expect(eff.moraleBonus_Q).toBeGreaterThan(0);
  });

  it("great_plague myth produces negative diplomacy for believing faction", () => {
    const reg = createMythRegistry();
    registerMyth(reg, {
      id: "m1", archetype: "great_plague", name: "Pestilence", description: "d",
      sourceIds: [], believingFactionIds: ["f1"], ageInDays: 0,
      belief_Q: SCALE.Q as Q,
      effects: {
        fearThresholdMod_Q: q(-0.05) as Q, diplomacyMod_Q: q(-0.08) as Q,
        moraleBonus_Q: q(0) as Q, techMod_Q: q(-0.05) as Q,
      },
    });
    const eff = aggregateFactionMythEffect(reg, "f1");
    expect(eff.diplomacyMod_Q).toBeLessThan(0);
  });

  it("does not include myths from other factions", () => {
    const reg = createMythRegistry();
    registerMyth(reg, {
      id: "m1", archetype: "hero", name: "Hero", description: "d",
      sourceIds: [], believingFactionIds: ["f2"], ageInDays: 0,
      belief_Q: SCALE.Q as Q,
      effects: {
        fearThresholdMod_Q: q(0.08) as Q, diplomacyMod_Q: q(0.05) as Q,
        moraleBonus_Q: q(0.10) as Q, techMod_Q: q(0) as Q,
      },
    });
    const eff = aggregateFactionMythEffect(reg, "f1");
    expect(eff.moraleBonus_Q).toBe(0);
  });

  it("stacks multiple myths for same faction", () => {
    const reg = createMythRegistry();
    const baseEffect = {
      fearThresholdMod_Q: q(0.05) as Q, diplomacyMod_Q: q(0.03) as Q,
      moraleBonus_Q: q(0.05) as Q, techMod_Q: q(0) as Q,
    };
    registerMyth(reg, { id: "m1", archetype: "hero", name: "H1", description: "d",
      sourceIds: [], believingFactionIds: ["f1"], ageInDays: 0,
      belief_Q: SCALE.Q as Q, effects: baseEffect });
    registerMyth(reg, { id: "m2", archetype: "golden_age", name: "GA", description: "d",
      sourceIds: [], believingFactionIds: ["f1"], ageInDays: 0,
      belief_Q: SCALE.Q as Q, effects: baseEffect });
    const eff = aggregateFactionMythEffect(reg, "f1");
    // Two myths each contributing q(0.05) → combined q(0.10) (ish)
    expect(eff.moraleBonus_Q).toBeGreaterThan(q(0.05));
  });

  it("moraleBonus is clamped to [0, SCALE.Q]", () => {
    const reg = createMythRegistry();
    for (let i = 0; i < 10; i++) {
      registerMyth(reg, {
        id: `m${i}`, archetype: "hero", name: "H", description: "d",
        sourceIds: [], believingFactionIds: ["f1"], ageInDays: 0,
        belief_Q: SCALE.Q as Q,
        effects: {
          fearThresholdMod_Q: q(0) as Q, diplomacyMod_Q: q(0) as Q,
          moraleBonus_Q: q(0.50) as Q, techMod_Q: q(0) as Q,
        },
      });
    }
    const eff = aggregateFactionMythEffect(reg, "f1");
    expect(eff.moraleBonus_Q).toBeLessThanOrEqual(SCALE.Q);
  });
});
