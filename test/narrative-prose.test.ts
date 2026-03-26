// test/narrative-prose.test.ts — Phase 74: Narrative Prose Tests

import { describe, it, expect } from "vitest";
import type { ChronicleEntry, Chronicle } from "../src/chronicle.js";
import type { CultureProfile } from "../src/culture.js";
import type { Myth } from "../src/mythology.js";
import { q, SCALE } from "../src/units.js";
import {
  mythArchetypeFrame,
  deriveNarrativeTone,
  createNarrativeContext,
  renderEntryWithTone,
  renderChronicleWithTone,
} from "../src/narrative-prose.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(
  eventType: ChronicleEntry["eventType"],
  overrides: Partial<ChronicleEntry> = {},
): ChronicleEntry {
  return {
    entryId:     "e1",
    tick:        100,
    significance: 70,
    eventType,
    actors:      [1, 2],
    template:    "",
    variables:   {},
    ...overrides,
  };
}

function makeChronicle(entries: ChronicleEntry[]): Chronicle {
  return {
    chronicleId: "c1",
    scope: "world",
    entries,
    createdAtTick: 0,
  };
}

/** Build a minimal CultureProfile with a single dominant value. */
function makeCulture(dominantValueId: string, strength: number = SCALE.Q): CultureProfile {
  return {
    id:          "culture_test",
    polityId:    "p1",
    forces: {
      environment: q(0.50),
      power:       q(0.50),
      exchange:    q(0.50),
      belief:      q(0.50),
      legacy:      q(0.50),
    },
    values: [
      { id: dominantValueId as any, strength_Q: strength as any, description: "" },
    ],
    contradictions: [],
    cycles:         [],
    driftTendency_Q: q(0.50),
  };
}

const NAMES = new Map<number, string>([[1, "Aldric"], [2, "Sienna"]]);

// ── mythArchetypeFrame ────────────────────────────────────────────────────────

describe("mythArchetypeFrame", () => {
  it("hero returns a non-empty string", () => {
    expect(mythArchetypeFrame("hero")).toBeTruthy();
  });

  it("monster returns a non-empty string", () => {
    expect(mythArchetypeFrame("monster")).toBeTruthy();
  });

  it("trickster returns a non-empty string", () => {
    expect(mythArchetypeFrame("trickster")).toBeTruthy();
  });

  it("great_plague returns a non-empty string", () => {
    expect(mythArchetypeFrame("great_plague")).toBeTruthy();
  });

  it("divine_wrath returns a non-empty string", () => {
    expect(mythArchetypeFrame("divine_wrath")).toBeTruthy();
  });

  it("golden_age returns a non-empty string", () => {
    expect(mythArchetypeFrame("golden_age")).toBeTruthy();
  });

  it("each archetype returns a different string", () => {
    const archetypes = ["hero", "monster", "trickster", "great_plague", "divine_wrath", "golden_age"] as const;
    const frames = archetypes.map(mythArchetypeFrame);
    const unique = new Set(frames);
    expect(unique.size).toBe(archetypes.length);
  });
});

// ── deriveNarrativeTone ───────────────────────────────────────────────────────

describe("deriveNarrativeTone", () => {
  it("martial_virtue culture → martial tone", () => {
    expect(deriveNarrativeTone(makeCulture("martial_virtue"))).toBe("martial");
  });

  it("spiritual_devotion culture → spiritual tone", () => {
    expect(deriveNarrativeTone(makeCulture("spiritual_devotion"))).toBe("spiritual");
  });

  it("commerce culture → mercantile tone", () => {
    expect(deriveNarrativeTone(makeCulture("commerce"))).toBe("mercantile");
  });

  it("honour culture → heroic tone", () => {
    expect(deriveNarrativeTone(makeCulture("honour"))).toBe("heroic");
  });

  it("fatalism culture → tragic tone", () => {
    expect(deriveNarrativeTone(makeCulture("fatalism"))).toBe("tragic");
  });

  it("unmapped value id falls back to neutral", () => {
    expect(deriveNarrativeTone(makeCulture("hospitality"))).toBe("neutral");
  });

  it("empty values list falls back to neutral", () => {
    const culture = makeCulture("honour");
    culture.values = [];
    expect(deriveNarrativeTone(culture)).toBe("neutral");
  });
});

// ── createNarrativeContext ────────────────────────────────────────────────────

describe("createNarrativeContext", () => {
  it("no culture → neutral tone", () => {
    const ctx = createNarrativeContext(NAMES);
    expect(ctx.tone).toBe("neutral");
  });

  it("inherits tone from culture", () => {
    const ctx = createNarrativeContext(NAMES, makeCulture("martial_virtue"));
    expect(ctx.tone).toBe("martial");
  });

  it("myth provided → mythFrame is set", () => {
    const myth: Myth = {
      mythId: "m1",
      name: "Hero Myth",
      description: "test",
      archetype: "hero",
      polityId: "p1",
      adoptedAtTick: 0,
      effects: { fearThreshold_Q: 0 as any, moraleDelta_Q: 0 as any, cohesionDelta_Q: 0 as any, culturalDriftResistance_Q: 0 as any },
    };
    const ctx = createNarrativeContext(NAMES, undefined, myth);
    expect(ctx.mythFrame).toBe(mythArchetypeFrame("hero"));
  });

  it("no myth → mythFrame absent", () => {
    const ctx = createNarrativeContext(NAMES);
    expect(ctx.mythFrame).toBeUndefined();
  });

  it("entity name map is preserved", () => {
    const ctx = createNarrativeContext(NAMES);
    expect(ctx.entityNames.get(1)).toBe("Aldric");
  });
});

// ── renderEntryWithTone — name substitution ───────────────────────────────────

describe("renderEntryWithTone — name substitution", () => {
  it("substitutes {name} from entity name map", () => {
    const entry = makeEntry("entity_death", { actors: [1] });
    const ctx   = createNarrativeContext(NAMES);
    const prose = renderEntryWithTone(entry, ctx);
    expect(prose).toContain("Aldric");
  });

  it("falls back to 'entity {id}' for unknown actor", () => {
    const entry = makeEntry("entity_death", { actors: [99] });
    const ctx   = createNarrativeContext(new Map());
    const prose = renderEntryWithTone(entry, ctx);
    expect(prose).toContain("entity 99");
  });

  it("leaves no unresolved {var} placeholders", () => {
    const entry = makeEntry("combat_victory", {
      actors: [1, 2],
      variables: { victor: "Aldric", defeated: "Sienna" },
    });
    const ctx = createNarrativeContext(NAMES);
    const prose = renderEntryWithTone(entry, ctx);
    expect(prose).not.toMatch(/\{[^}]+\}/);
  });
});

// ── renderEntryWithTone — tone variants ──────────────────────────────────────

describe("renderEntryWithTone — tone distinguishability", () => {
  const base = makeEntry("entity_death", { actors: [1] });

  const tones = ["neutral", "heroic", "tragic", "martial", "spiritual", "mercantile"] as const;

  it("each tone produces distinct prose for entity_death", () => {
    const results = tones.map(tone => {
      const ctx = createNarrativeContext(NAMES);
      ctx.tone = tone;
      return renderEntryWithTone(base, { ...ctx, tone });
    });
    const unique = new Set(results);
    expect(unique.size).toBe(tones.length);
  });

  it("martial tone contains battle/combat language for entity_death", () => {
    const ctx = { entityNames: NAMES, tone: "martial" as const };
    const prose = renderEntryWithTone(base, ctx);
    // Martial template: "cut down" / "warrior's end"
    expect(prose.toLowerCase()).toMatch(/warrior|cut|battle|strength|discipline/);
  });

  it("spiritual tone references gods/fate for entity_death", () => {
    const ctx = { entityNames: NAMES, tone: "spiritual" as const };
    const prose = renderEntryWithTone(base, ctx);
    expect(prose.toLowerCase()).toMatch(/god|divine|fate|heaven|ordain|wrath/);
  });

  it("mercantile tone references ledger/accounts for entity_death", () => {
    const ctx = { entityNames: NAMES, tone: "mercantile" as const };
    const prose = renderEntryWithTone(base, ctx);
    expect(prose.toLowerCase()).toMatch(/ledger|account|market|trade|profit|commerce/);
  });

  it("heroic tone references glory/deed/honour for entity_death", () => {
    const ctx = { entityNames: NAMES, tone: "heroic" as const };
    const prose = renderEntryWithTone(base, ctx);
    expect(prose.toLowerCase()).toMatch(/glory|deed|memory|honour|great|legend/);
  });
});

// ── renderEntryWithTone — variable substitution ───────────────────────────────

describe("renderEntryWithTone — variable substitution", () => {
  it("combat_victory includes victor and defeated names", () => {
    const entry = makeEntry("combat_victory", {
      actors: [1, 2],
      variables: { victor: "Aldric", defeated: "Sienna" },
    });
    const ctx = createNarrativeContext(NAMES);
    const prose = renderEntryWithTone(entry, ctx);
    expect(prose).toContain("Aldric");
    expect(prose).toContain("Sienna");
  });

  it("quest_completed includes quest name", () => {
    const entry = makeEntry("quest_completed", {
      actors: [1],
      variables: { actorName: "Aldric", questName: "The Lost Seal" },
    });
    const ctx = createNarrativeContext(NAMES);
    const prose = renderEntryWithTone(entry, ctx);
    expect(prose).toContain("The Lost Seal");
  });

  it("legendary_deed includes hero and deed", () => {
    const entry = makeEntry("legendary_deed", {
      actors: [1],
      variables: { hero: "Aldric", deedDescription: "slaying the dragon alone" },
    });
    const ctx = createNarrativeContext(NAMES);
    const prose = renderEntryWithTone(entry, ctx);
    expect(prose).toContain("Aldric");
    expect(prose).toContain("slaying the dragon alone");
  });
});

// ── renderEntryWithTone — myth frame ─────────────────────────────────────────

describe("renderEntryWithTone — myth frame", () => {
  it("appends myth frame when ctx.mythFrame is set", () => {
    const entry  = makeEntry("combat_victory", {
      variables: { victor: "Aldric", defeated: "Sienna" },
    });
    const frame  = mythArchetypeFrame("hero");
    const ctx    = { entityNames: NAMES, tone: "heroic" as const, mythFrame: frame };
    const prose  = renderEntryWithTone(entry, ctx);
    expect(prose).toContain(frame);
  });

  it("myth frame ends with period", () => {
    const entry  = makeEntry("entity_death", { actors: [1] });
    const frame  = mythArchetypeFrame("monster");
    const ctx    = { entityNames: NAMES, tone: "neutral" as const, mythFrame: frame };
    const prose  = renderEntryWithTone(entry, ctx);
    expect(prose.endsWith(".")).toBe(true);
  });

  it("no myth frame → prose ends with period", () => {
    const entry = makeEntry("entity_death", { actors: [1] });
    const ctx   = createNarrativeContext(NAMES);
    const prose = renderEntryWithTone(entry, ctx);
    expect(prose.endsWith(".")).toBe(true);
  });

  it("no double period when myth frame appended", () => {
    const entry = makeEntry("entity_death", { actors: [1] });
    const ctx   = { entityNames: NAMES, tone: "neutral" as const, mythFrame: "as fated" };
    const prose = renderEntryWithTone(entry, ctx);
    expect(prose).not.toContain("..");
  });
});

// ── renderChronicleWithTone ───────────────────────────────────────────────────

describe("renderChronicleWithTone", () => {
  it("returns entries in chronological tick order", () => {
    const chronicle = makeChronicle([
      makeEntry("combat_victory", { tick: 300, significance: 80, variables: { victor: "A", defeated: "B" } }),
      makeEntry("entity_death",   { tick: 100, significance: 80, actors: [1] }),
      makeEntry("legendary_deed", { tick: 200, significance: 80, variables: { hero: "A", deedDescription: "X" } }),
    ]);
    const ctx    = createNarrativeContext(NAMES);
    const output = renderChronicleWithTone(chronicle, ctx);
    expect(output).toHaveLength(3);
    // First entry should be the death (tick 100), then deed (200), then victory (300)
    expect(output[0]).toContain("Aldric"); // entity_death at tick 100
  });

  it("filters entries below minSignificance", () => {
    const chronicle = makeChronicle([
      makeEntry("entity_death", { tick: 10, significance: 30, actors: [1] }),
      makeEntry("combat_victory", { tick: 20, significance: 80, variables: { victor: "A", defeated: "B" } }),
    ]);
    const ctx    = createNarrativeContext(NAMES);
    const output = renderChronicleWithTone(chronicle, ctx, 50);
    expect(output).toHaveLength(1);
  });

  it("returns empty array for empty chronicle", () => {
    const ctx    = createNarrativeContext(NAMES);
    const output = renderChronicleWithTone(makeChronicle([]), ctx);
    expect(output).toHaveLength(0);
  });

  it("success criterion: martial vs spiritual produce distinguishably different prose", () => {
    const deeds: ChronicleEntry[] = [
      makeEntry("combat_victory", { tick: 10, significance: 80, variables: { victor: "Aldric", defeated: "Sienna" } }),
      makeEntry("entity_death",   { tick: 20, significance: 80, actors: [2] }),
      makeEntry("legendary_deed", { tick: 30, significance: 90, variables: { hero: "Aldric", deedDescription: "slaying the warlord" } }),
    ];
    const chronicle = makeChronicle(deeds);

    const martialCtx    = { entityNames: NAMES, tone: "martial"    as const };
    const spiritualCtx  = { entityNames: NAMES, tone: "spiritual"  as const };
    const mercantileCtx = { entityNames: NAMES, tone: "mercantile" as const };

    const martialLines    = renderChronicleWithTone(chronicle, martialCtx);
    const spiritualLines  = renderChronicleWithTone(chronicle, spiritualCtx);
    const mercantileLines = renderChronicleWithTone(chronicle, mercantileCtx);

    // All three tones produce the same number of entries
    expect(martialLines).toHaveLength(3);
    expect(spiritualLines).toHaveLength(3);
    expect(mercantileLines).toHaveLength(3);

    // Martial ≠ spiritual
    expect(martialLines.join("\n")).not.toBe(spiritualLines.join("\n"));
    // Spiritual ≠ mercantile
    expect(spiritualLines.join("\n")).not.toBe(mercantileLines.join("\n"));
    // Martial ≠ mercantile
    expect(martialLines.join("\n")).not.toBe(mercantileLines.join("\n"));
  });

  it("custom minSignificance=0 includes all entries", () => {
    const chronicle = makeChronicle([
      makeEntry("entity_death", { tick: 1, significance: 5, actors: [1] }),
    ]);
    const ctx    = createNarrativeContext(NAMES);
    const output = renderChronicleWithTone(chronicle, ctx, 0);
    expect(output).toHaveLength(1);
  });
});
