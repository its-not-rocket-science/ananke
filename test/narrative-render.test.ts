// test/narrative-render.test.ts — Phase 45: Narrative Rendering

import { describe, it, expect } from "vitest";
import type { ChronicleEntry, StoryArc } from "../src/chronicle.js";
import {
  renderEntry,
  renderChronicle,
  registerTemplate,
  registerTemplates,
  generateNarrative,
} from "../src/narrative-render.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(
  overrides: Partial<ChronicleEntry> & { eventType: ChronicleEntry["eventType"] },
): ChronicleEntry {
  return {
    entryId: overrides.entryId ?? "e1",
    tick: overrides.tick ?? 1,
    significance: overrides.significance ?? 50,
    eventType: overrides.eventType,
    actors: overrides.actors ?? [],
    template: overrides.template ?? "",
    variables: overrides.variables ?? {},
    rendered: overrides.rendered,
    settlementId: overrides.settlementId,
    questId: overrides.questId,
  };
}

function makeArc(overrides: Partial<StoryArc> = {}): StoryArc {
  return {
    arcId: overrides.arcId ?? "arc1",
    arcType: overrides.arcType ?? "rise_of_hero",
    entryIds: overrides.entryIds ?? [],
    primaryActors: overrides.primaryActors ?? [1, 2],
    startTick: overrides.startTick ?? 1,
    endTick: overrides.endTick,
    significance: overrides.significance ?? 80,
    description: overrides.description ?? "A tale of rising.",
  };
}

// ── renderEntry ───────────────────────────────────────────────────────────────

describe("renderEntry", () => {
  it("returns cached rendered string when entry.rendered is set", () => {
    const entry = makeEntry({ eventType: "entity_death", rendered: "pre-rendered text" });
    expect(renderEntry(entry)).toBe("pre-rendered text");
  });

  it("renders entity_death with cause and location", () => {
    const entry = makeEntry({
      eventType: "entity_death",
      variables: { actorName: "Aldric", cause: "a sword wound", location: "the forest" },
    });
    const text = renderEntry(entry);
    expect(text).toContain("Aldric");
    expect(text).toContain("sword wound");
    expect(text).toContain("forest");
  });

  it("falls back to generic text when event type has no template (line 73-75)", () => {
    // Cast an unknown type through the type system to exercise the !templateFn branch
    const entry = makeEntry({
      eventType: "entity_death", // start with valid type to satisfy TS
    });
    // Override eventType with an unknown string at runtime
    (entry as unknown as Record<string, unknown>).eventType = "unknown_event_xyz";
    const text = renderEntry(entry as ChronicleEntry);
    expect(text).toMatch(/Event: unknown_event_xyz/);
    expect(text).toContain("tick");
  });
});

// ── renderChronicle — prose paragraph break ───────────────────────────────────

describe("renderChronicle prose paragraph break (lines 148-150)", () => {
  it("starts a new paragraph when a high-significance entry follows lower-significance entries", () => {
    const lowEntry = makeEntry({
      entryId: "e1",
      tick: 1,
      significance: 30,
      eventType: "combat_victory",
      variables: { victor: "Anna", defeated: "Bob" },
    });
    const highEntry = makeEntry({
      entryId: "e2",
      tick: 2,
      significance: 80, // >= 70 triggers paragraph break
      eventType: "entity_death",
      variables: { actorName: "Bob" },
    });
    const text = renderChronicle([lowEntry, highEntry], { format: "prose" });
    // Two paragraphs separated by double newline
    expect(text).toContain("\n\n");
    const paragraphs = text.split("\n\n");
    expect(paragraphs.length).toBe(2);
  });

  it("does NOT break paragraph when first entry has significance >= 70 (no currentParagraph yet)", () => {
    const highFirst = makeEntry({
      entryId: "e1",
      tick: 1,
      significance: 75,
      eventType: "entity_death",
      variables: { actorName: "Aldric" },
    });
    const text = renderChronicle([highFirst], { format: "prose" });
    // Only one paragraph — no break needed since there was no prior content
    expect(text.split("\n\n").length).toBe(1);
  });

  it("produces multiple paragraphs when several significant entries appear after lower ones", () => {
    const entries: ChronicleEntry[] = [
      makeEntry({ entryId: "e1", tick: 1, significance: 20, eventType: "combat_victory", variables: { victor: "A", defeated: "B" } }),
      makeEntry({ entryId: "e2", tick: 2, significance: 90, eventType: "legendary_deed", variables: { hero: "A", deedDescription: "slew the dragon" } }),
      makeEntry({ entryId: "e3", tick: 3, significance: 20, eventType: "combat_defeat", variables: { defeated: "C", victor: "D" } }),
      makeEntry({ entryId: "e4", tick: 4, significance: 85, eventType: "entity_death", variables: { actorName: "D" } }),
    ];
    const text = renderChronicle(entries, { format: "prose" });
    const paragraphs = text.split("\n\n");
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
  });
});

// ── registerTemplate / registerTemplates ──────────────────────────────────────

describe("registerTemplate (lines 213-218)", () => {
  it("registers a custom template that overrides the existing one", () => {
    registerTemplate("combat_victory", (v) => `CUSTOM: ${v.victor} won.`);
    const entry = makeEntry({
      eventType: "combat_victory",
      variables: { victor: "Sir Vance", defeated: "the ogre" },
    });
    const text = renderEntry(entry);
    expect(text).toBe("CUSTOM: Sir Vance won.");
    // Restore the original template so other tests are not affected
    registerTemplate("combat_victory", (v) => `${v.victor} defeated ${v.defeated}${v.method ? ` by ${v.method}` : ""}.`);
  });

  it("new template takes effect immediately for subsequent renderEntry calls", () => {
    registerTemplate("rank_promotion", (v) => `[PROMOTED] ${v.actorName} is now ${v.newRank}.`);
    const entry = makeEntry({
      eventType: "rank_promotion",
      variables: { actorName: "Mira", newRank: "Captain" },
    });
    expect(renderEntry(entry)).toContain("[PROMOTED]");
    // Restore
    registerTemplate("rank_promotion", (v) => `${v.actorName} rose to the rank of ${v.newRank}${v.faction ? ` in ${v.faction}` : ""}.`);
  });
});

describe("registerTemplates (lines 221-229)", () => {
  it("registers multiple templates at once", () => {
    registerTemplates({
      combat_victory: (v) => `BATCH_VICTORY: ${v.victor}.`,
      combat_defeat:  (v) => `BATCH_DEFEAT: ${v.defeated}.`,
    });
    const victoryEntry = makeEntry({
      eventType: "combat_victory",
      variables: { victor: "Knight", defeated: "Goblin" },
    });
    const defeatEntry = makeEntry({
      eventType: "combat_defeat",
      variables: { defeated: "Goblin", victor: "Knight" },
    });
    expect(renderEntry(victoryEntry)).toBe("BATCH_VICTORY: Knight.");
    expect(renderEntry(defeatEntry)).toBe("BATCH_DEFEAT: Goblin.");
    // Restore
    registerTemplates({
      combat_victory: (v) => `${v.victor} defeated ${v.defeated}${v.method ? ` by ${v.method}` : ""}.`,
      combat_defeat:  (v) => `${v.defeated} was overcome by ${v.victor}${v.location ? ` in ${v.location}` : ""}.`,
    });
  });

  it("skips undefined values in the templates map", () => {
    // Passing a map with only one key set; no error should occur
    const before = renderEntry(makeEntry({ eventType: "entity_birth", variables: { entityName: "Baby" } }));
    registerTemplates({ entity_birth: undefined });
    const after = renderEntry(makeEntry({ eventType: "entity_birth", variables: { entityName: "Baby" } }));
    // Undefined value skipped — template unchanged
    expect(after).toBe(before);
  });
});

// ── generateNarrative ─────────────────────────────────────────────────────────

describe("generateNarrative (lines 264-265+)", () => {
  it("returns 'Chronicle of Events' title when no arcs provided", () => {
    const result = generateNarrative([], []);
    expect(result.title).toBe("Chronicle of Events");
    expect(result.summary).toBe("A series of unconnected events.");
    expect(result.keyFigures).toEqual([]);
    expect(result.keyEvents).toEqual([]);
  });

  it("titles based on top arc type", () => {
    const arc = makeArc({ arcType: "rise_of_hero", significance: 90 });
    const result = generateNarrative([arc], []);
    expect(result.title).toBe("The Rise Of Hero");
  });

  it("includes secondary arc count in summary when multiple arcs exist (line 263-264)", () => {
    const arc1 = makeArc({ arcId: "a1", arcType: "rise_of_hero", significance: 90, primaryActors: [1] });
    const arc2 = makeArc({ arcId: "a2", arcType: "tragic_fall",  significance: 70, primaryActors: [2] });
    const arc3 = makeArc({ arcId: "a3", arcType: "rivalry",       significance: 60, primaryActors: [3] });
    const result = generateNarrative([arc1, arc2, arc3], []);
    expect(result.summary).toContain("2 other story arcs");
  });

  it("keyFigures collects unique actors from all arcs", () => {
    const arc1 = makeArc({ arcId: "a1", significance: 80, primaryActors: [1, 2] });
    const arc2 = makeArc({ arcId: "a2", significance: 60, primaryActors: [2, 3] });
    const result = generateNarrative([arc1, arc2], []);
    // Set deduplication: [1, 2, 3] (order may vary)
    expect(result.keyFigures.sort()).toEqual([1, 2, 3]);
  });

  it("keyEvents comes from top arc entryIds", () => {
    const arc = makeArc({ significance: 80, entryIds: ["e1", "e2", "e3"] });
    const result = generateNarrative([arc], []);
    expect(result.keyEvents).toEqual(["e1", "e2", "e3"]);
  });

  it("estimatedDrama is bounded between 0 and 100", () => {
    const arcs = Array.from({ length: 5 }, (_, i) =>
      makeArc({ arcId: `a${i}`, significance: 95, primaryActors: [i] }),
    );
    const result = generateNarrative(arcs, []);
    expect(result.estimatedDrama).toBeGreaterThan(0);
    expect(result.estimatedDrama).toBeLessThanOrEqual(100);
  });

  it("fullText comes from renderAllArcs and is non-empty for non-empty arcs", () => {
    const arc = makeArc({ significance: 80, primaryActors: [1] });
    const result = generateNarrative([arc], []);
    expect(result.fullText.length).toBeGreaterThan(0);
    expect(result.fullText).toContain("RISE OF HERO");
  });

  it("entries are wired into the entryMap for fullText rendering", () => {
    const entry = makeEntry({
      entryId: "e1",
      tick: 5,
      significance: 60,
      eventType: "legendary_deed",
      variables: { hero: "Torval", deedDescription: "climbed the impossible peak" },
    });
    const arc = makeArc({
      significance: 85,
      entryIds: ["e1"],
      primaryActors: [1],
    });
    const result = generateNarrative([arc], [entry]);
    expect(result.fullText).toContain("Torval");
  });
});

// ── renderChronicle — other formats ───────────────────────────────────────────

describe("renderChronicle formats", () => {
  const entry = makeEntry({
    eventType: "quest_completed",
    variables: { actorName: "Mira", questName: "The Lost Relic" },
  });

  it("compact format prefixes each entry with tick", () => {
    const text = renderChronicle([entry], { format: "compact" });
    expect(text).toContain("[Tick 1]");
  });

  it("chronological format prefixes with Turn", () => {
    const text = renderChronicle([entry], { format: "chronological" });
    expect(text).toContain("Turn 1:");
  });

  it("chronological format includes significance when showSignificance=true", () => {
    const text = renderChronicle([entry], { format: "chronological", showSignificance: true });
    expect(text).toContain("[50]");
  });

  it("chronological format includes actors when showActors=true", () => {
    const e = makeEntry({ eventType: "quest_completed", actors: [1, 2], variables: { actorName: "Mira", questName: "Q" } });
    const text = renderChronicle([e], { format: "chronological", showActors: true });
    expect(text).toContain("{1,2}");
  });

  it("chronological format includes settlement when showSettlements=true", () => {
    const e = makeEntry({ eventType: "settlement_founded", settlementId: "ironhold", variables: { settlementName: "Ironhold" } });
    const text = renderChronicle([e], { format: "chronological", showSettlements: true });
    expect(text).toContain("@ironhold");
  });

  it("returns 'No events recorded.' when all entries are below minSignificance", () => {
    const text = renderChronicle([entry], { minSignificance: 99 });
    expect(text).toBe("No events recorded.");
  });
});
