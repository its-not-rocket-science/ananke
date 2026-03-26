// test/renown.test.ts — Phase 75: Entity Renown & Legend Registry

import { describe, it, expect } from "vitest";
import type { ChronicleEntry, Chronicle } from "../src/chronicle.js";
import { q, SCALE } from "../src/units.js";
import {
  RENOWN_SCALE_Q,
  createRenownRegistry,
  getRenownRecord,
  updateRenownFromChronicle,
  getRenownLabel,
  getInfamyLabel,
  deriveFactionStandingAdjustment,
  getTopLegendEntries,
  renderLegendWithTone,
} from "../src/renown.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

let _nextId = 1;

function makeEntry(
  eventType: ChronicleEntry["eventType"],
  actorId: number,
  overrides: Partial<ChronicleEntry> = {},
): ChronicleEntry {
  return {
    entryId:     `e${_nextId++}`,
    tick:        100,
    significance: 70,
    eventType,
    actors:      [actorId],
    template:    "",
    variables:   {},
    ...overrides,
  };
}

function makeChronicle(entries: ChronicleEntry[]): Chronicle {
  return { chronicleId: "c1", scope: "world", entries, createdAtTick: 0 };
}

// ── createRenownRegistry ──────────────────────────────────────────────────────

describe("createRenownRegistry", () => {
  it("returns registry with empty records map", () => {
    const registry = createRenownRegistry();
    expect(registry.records.size).toBe(0);
  });

  it("returns a different object on each call", () => {
    const a = createRenownRegistry();
    const b = createRenownRegistry();
    expect(a).not.toBe(b);
  });
});

// ── getRenownRecord ───────────────────────────────────────────────────────────

describe("getRenownRecord", () => {
  it("creates a zero record for new entity", () => {
    const registry = createRenownRegistry();
    const record   = getRenownRecord(registry, 1);
    expect(record.entityId).toBe(1);
    expect(record.renown_Q).toBe(0);
    expect(record.infamy_Q).toBe(0);
    expect(record.entries).toHaveLength(0);
  });

  it("returns the same record on repeated calls", () => {
    const registry = createRenownRegistry();
    const a = getRenownRecord(registry, 1);
    const b = getRenownRecord(registry, 1);
    expect(a).toBe(b);
  });

  it("creates separate records for different entity ids", () => {
    const registry = createRenownRegistry();
    const r1 = getRenownRecord(registry, 1);
    const r2 = getRenownRecord(registry, 2);
    expect(r1).not.toBe(r2);
    expect(registry.records.size).toBe(2);
  });

  it("stores the new record in registry.records", () => {
    const registry = createRenownRegistry();
    getRenownRecord(registry, 42);
    expect(registry.records.has(42)).toBe(true);
  });
});

// ── getRenownLabel ────────────────────────────────────────────────────────────

describe("getRenownLabel", () => {
  it("q(0) → unknown", () => expect(getRenownLabel(q(0))).toBe("unknown"));
  it("q(0.09) → unknown", () => expect(getRenownLabel(q(0.09))).toBe("unknown"));
  it("q(0.10) → noted", () => expect(getRenownLabel(q(0.10))).toBe("noted"));
  it("q(0.30) → known", () => expect(getRenownLabel(q(0.30))).toBe("known"));
  it("q(0.50) → renowned", () => expect(getRenownLabel(q(0.50))).toBe("renowned"));
  it("q(0.70) → legendary", () => expect(getRenownLabel(q(0.70))).toBe("legendary"));
  it("q(0.90) → mythic", () => expect(getRenownLabel(q(0.90))).toBe("mythic"));
  it("q(1.0) → mythic", () => expect(getRenownLabel(q(1.0))).toBe("mythic"));
});

// ── getInfamyLabel ────────────────────────────────────────────────────────────

describe("getInfamyLabel", () => {
  it("q(0) → innocent", () => expect(getInfamyLabel(q(0))).toBe("innocent"));
  it("q(0.10) → suspect", () => expect(getInfamyLabel(q(0.10))).toBe("suspect"));
  it("q(0.30) → notorious", () => expect(getInfamyLabel(q(0.30))).toBe("notorious"));
  it("q(0.50) → infamous", () => expect(getInfamyLabel(q(0.50))).toBe("infamous"));
  it("q(0.70) → reviled", () => expect(getInfamyLabel(q(0.70))).toBe("reviled"));
  it("q(0.90) → condemned", () => expect(getInfamyLabel(q(0.90))).toBe("condemned"));
});

// ── updateRenownFromChronicle ─────────────────────────────────────────────────

describe("updateRenownFromChronicle — basic", () => {
  it("legendary_deed adds to renown_Q", () => {
    const registry  = createRenownRegistry();
    const chronicle = makeChronicle([
      makeEntry("legendary_deed", 1, { significance: 85 }),
    ]);
    updateRenownFromChronicle(registry, chronicle, 1);
    const record = getRenownRecord(registry, 1);
    expect(record.renown_Q).toBeGreaterThan(0);
    expect(record.infamy_Q).toBe(0);
  });

  it("relationship_betrayal adds to infamy_Q", () => {
    const registry  = createRenownRegistry();
    const chronicle = makeChronicle([
      makeEntry("relationship_betrayal", 1, { significance: 75 }),
    ]);
    updateRenownFromChronicle(registry, chronicle, 1);
    const record = getRenownRecord(registry, 1);
    expect(record.infamy_Q).toBeGreaterThan(0);
    expect(record.renown_Q).toBe(0);
  });

  it("entity_birth is neutral (adds entry but no renown/infamy)", () => {
    const registry  = createRenownRegistry();
    const chronicle = makeChronicle([
      makeEntry("entity_birth", 1, { significance: 30, actors: [1] }),
    ]);
    // lower threshold so birth (sig 30) passes
    updateRenownFromChronicle(registry, chronicle, 1, 25);
    const record = getRenownRecord(registry, 1);
    expect(record.renown_Q).toBe(0);
    expect(record.infamy_Q).toBe(0);
    expect(record.entries).toHaveLength(1);
  });

  it("entry below minSignificance is ignored", () => {
    const registry  = createRenownRegistry();
    const chronicle = makeChronicle([
      makeEntry("legendary_deed", 1, { significance: 30 }),
    ]);
    updateRenownFromChronicle(registry, chronicle, 1, 50);
    const record = getRenownRecord(registry, 1);
    expect(record.renown_Q).toBe(0);
    expect(record.entries).toHaveLength(0);
  });

  it("entry for a different actor is ignored", () => {
    const registry  = createRenownRegistry();
    const chronicle = makeChronicle([
      makeEntry("legendary_deed", 2, { significance: 85 }),
    ]);
    updateRenownFromChronicle(registry, chronicle, 1);
    const record = getRenownRecord(registry, 1);
    expect(record.renown_Q).toBe(0);
  });

  it("idempotent — same entry not double-counted", () => {
    const registry  = createRenownRegistry();
    const entry     = makeEntry("legendary_deed", 1, { significance: 85 });
    const chronicle = makeChronicle([entry]);
    updateRenownFromChronicle(registry, chronicle, 1);
    const renownAfterFirst = getRenownRecord(registry, 1).renown_Q;
    updateRenownFromChronicle(registry, chronicle, 1);
    const renownAfterSecond = getRenownRecord(registry, 1).renown_Q;
    expect(renownAfterFirst).toBe(renownAfterSecond);
    expect(getRenownRecord(registry, 1).entries).toHaveLength(1);
  });

  it("renown contribution scales with significance", () => {
    const r1 = createRenownRegistry();
    const r2 = createRenownRegistry();
    updateRenownFromChronicle(r1, makeChronicle([
      makeEntry("legendary_deed", 1, { significance: 50 }),
    ]), 1, 0);
    updateRenownFromChronicle(r2, makeChronicle([
      makeEntry("legendary_deed", 1, { significance: 100 }),
    ]), 1, 0);
    const low  = getRenownRecord(r1, 1).renown_Q;
    const high = getRenownRecord(r2, 1).renown_Q;
    expect(high).toBe(low * 2);
    expect(high).toBe(RENOWN_SCALE_Q);
  });

  it("multiple events accumulate", () => {
    const registry = createRenownRegistry();
    const chronicle = makeChronicle([
      makeEntry("legendary_deed",  1, { significance: 85 }),
      makeEntry("combat_victory",  1, { significance: 60 }),
    ]);
    updateRenownFromChronicle(registry, chronicle, 1, 0);
    const record = getRenownRecord(registry, 1);
    expect(record.entries).toHaveLength(2);
    expect(record.renown_Q).toBeGreaterThan(0);
  });

  it("renown capped at SCALE.Q", () => {
    const registry  = createRenownRegistry();
    const entries: ChronicleEntry[] = Array.from({ length: 200 }, (_, i) =>
      makeEntry("legendary_deed", 1, { significance: 100, entryId: `cap${i}` }),
    );
    updateRenownFromChronicle(registry, makeChronicle(entries), 1, 0);
    expect(getRenownRecord(registry, 1).renown_Q).toBeLessThanOrEqual(SCALE.Q);
  });
});

// ── deriveFactionStandingAdjustment ───────────────────────────────────────────

describe("deriveFactionStandingAdjustment", () => {
  it("zero renown and infamy → zero adjustment", () => {
    expect(deriveFactionStandingAdjustment(q(0), q(0))).toBe(0);
  });

  it("heroic faction (bias=1.0) rewards renown, punishes infamy", () => {
    const adj = deriveFactionStandingAdjustment(q(0.5), q(0), q(1.0));
    expect(adj).toBeGreaterThan(0);
  });

  it("heroic faction (bias=1.0) punishes infamy", () => {
    const adj = deriveFactionStandingAdjustment(q(0), q(0.5), q(1.0));
    expect(adj).toBeLessThan(0);
  });

  it("criminal faction (bias=0.0) rewards infamy", () => {
    const adj = deriveFactionStandingAdjustment(q(0), q(0.5), q(0.0));
    expect(adj).toBeGreaterThan(0);
  });

  it("neutral faction (bias=0.5) returns 0 when renown == infamy", () => {
    const adj = deriveFactionStandingAdjustment(q(0.5), q(0.5), q(0.5));
    expect(adj).toBe(0);
  });

  it("result clamped to [-SCALE.Q, SCALE.Q]", () => {
    const adj = deriveFactionStandingAdjustment(q(1.0), q(0), q(1.0));
    expect(adj).toBeGreaterThanOrEqual(-SCALE.Q);
    expect(adj).toBeLessThanOrEqual(SCALE.Q);
  });
});

// ── getTopLegendEntries ───────────────────────────────────────────────────────

describe("getTopLegendEntries", () => {
  it("returns empty array for record with no entries", () => {
    const registry = createRenownRegistry();
    const record   = getRenownRecord(registry, 1);
    expect(getTopLegendEntries(record, 5)).toHaveLength(0);
  });

  it("returns entries sorted by significance descending", () => {
    const registry  = createRenownRegistry();
    const chronicle = makeChronicle([
      makeEntry("legendary_deed",  1, { significance: 85, tick: 10 }),
      makeEntry("combat_victory",  1, { significance: 50, tick: 20 }),
      makeEntry("quest_completed", 1, { significance: 70, tick: 30 }),
    ]);
    updateRenownFromChronicle(registry, chronicle, 1, 0);
    const top = getTopLegendEntries(getRenownRecord(registry, 1), 3);
    expect(top[0]!.significance).toBe(85);
    expect(top[1]!.significance).toBe(70);
    expect(top[2]!.significance).toBe(50);
  });

  it("limits output to n entries", () => {
    const registry  = createRenownRegistry();
    const chronicle = makeChronicle([
      makeEntry("legendary_deed",  1, { significance: 85 }),
      makeEntry("combat_victory",  1, { significance: 50 }),
      makeEntry("quest_completed", 1, { significance: 70 }),
    ]);
    updateRenownFromChronicle(registry, chronicle, 1, 0);
    expect(getTopLegendEntries(getRenownRecord(registry, 1), 2)).toHaveLength(2);
  });

  it("tie in significance broken by tick descending", () => {
    const registry  = createRenownRegistry();
    const chronicle = makeChronicle([
      makeEntry("legendary_deed", 1, { significance: 80, tick: 10 }),
      makeEntry("combat_victory", 1, { significance: 80, tick: 50 }),
    ]);
    updateRenownFromChronicle(registry, chronicle, 1, 0);
    const top = getTopLegendEntries(getRenownRecord(registry, 1), 2);
    expect(top[0]!.tick).toBe(50); // more recent first on tie
  });
});

// ── renderLegendWithTone ──────────────────────────────────────────────────────

describe("renderLegendWithTone", () => {
  it("renders prose for known chronicle entries", () => {
    const registry  = createRenownRegistry();
    const entry     = makeEntry("legendary_deed", 1, {
      variables: { hero: "Aldric", deedDescription: "holding the bridge alone" },
    });
    const chronicle = makeChronicle([entry]);
    updateRenownFromChronicle(registry, chronicle, 1, 0);

    const entryMap = new Map([[entry.entryId, entry]]);
    const ctx      = { entityNames: new Map([[1, "Aldric"]]), tone: "heroic" as const };
    const lines    = renderLegendWithTone(getRenownRecord(registry, 1), entryMap, ctx);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Aldric");
    expect(lines[0]).toContain("bridge");
  });

  it("returns bracketed placeholder for missing entry", () => {
    const registry  = createRenownRegistry();
    const entry     = makeEntry("legendary_deed", 1, { significance: 85 });
    const chronicle = makeChronicle([entry]);
    updateRenownFromChronicle(registry, chronicle, 1, 0);

    // Empty map — entryId not present
    const ctx = { entityNames: new Map<number, string>(), tone: "neutral" as const };
    const lines = renderLegendWithTone(getRenownRecord(registry, 1), new Map(), ctx);

    expect(lines[0]).toContain("[legendary_deed]");
    expect(lines[0]).toContain("tick");
  });

  it("respects maxEntries", () => {
    const registry  = createRenownRegistry();
    const chronicle = makeChronicle([
      makeEntry("legendary_deed",  1, { significance: 85 }),
      makeEntry("combat_victory",  1, { significance: 60 }),
      makeEntry("quest_completed", 1, { significance: 70 }),
    ]);
    updateRenownFromChronicle(registry, chronicle, 1, 0);
    const ctx   = { entityNames: new Map<number, string>(), tone: "neutral" as const };
    const lines = renderLegendWithTone(getRenownRecord(registry, 1), new Map(), ctx, 2);
    expect(lines).toHaveLength(2);
  });
});
