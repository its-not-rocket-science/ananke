// test/legend.test.ts — Phase 50: Mythology & Legend

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import type { Q } from "../src/units.js";
import type { Chronicle, ChronicleEntry } from "../src/chronicle.ts";
import { createChronicle } from "../src/chronicle.ts";
import {
  createLegendFromChronicle,
  createLegendRegistry,
  registerLegend,
  getLegendsBySubject,
  getLegendEffect,
  npcKnowsLegend,
  applyLegendToDialogueContext,
  stepLegendFame,
  serializeLegendRegistry,
  deserializeLegendRegistry,
  type Legend,
} from "../src/legend.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkChronicle(): Chronicle {
  return createChronicle("world", "world", 0);
}

function mkEntry(
  override: Partial<ChronicleEntry> & { entryId: string },
): ChronicleEntry {
  return {
    tick: 100,
    significance: 80,
    eventType: "combat_victory",
    actors: [1],
    template: "t",
    variables: {},
    ...override,
  };
}

function mkLegend(override: Partial<Legend> = {}): Legend {
  return {
    legendId: "legend_1_100",
    subjectId: 1,
    subjectName: "Arath",
    reputation: "heroic",
    fame_Q: q(0.70),
    tags: ["warrior"],
    sourceEntryIds: ["e1"],
    sourceArcTypes: [],
    createdAtTick: 100,
    ...override,
  };
}

// ── createLegendFromChronicle ──────────────────────────────────────────────────

describe("createLegendFromChronicle", () => {
  it("returns undefined when no entries qualify", () => {
    const c = mkChronicle();
    c.entries.push(mkEntry({ entryId: "e1", significance: 30, actors: [1] }));

    expect(createLegendFromChronicle(c, 1, "Arath")).toBeUndefined();
  });

  it("returns a legend when qualifying entries exist", () => {
    const c = mkChronicle();
    c.entries.push(mkEntry({ entryId: "e1", significance: 80, actors: [1] }));

    const legend = createLegendFromChronicle(c, 1, "Arath");
    expect(legend).toBeDefined();
    expect(legend!.subjectId).toBe(1);
    expect(legend!.subjectName).toBe("Arath");
  });

  it("returns undefined when qualifying entries exist but not for this subject", () => {
    const c = mkChronicle();
    c.entries.push(mkEntry({ entryId: "e1", significance: 80, actors: [2] }));

    expect(createLegendFromChronicle(c, 1, "Arath")).toBeUndefined();
  });

  it("fame_Q scales with total significance", () => {
    const cLow = mkChronicle();
    cLow.entries.push(mkEntry({ entryId: "e1", significance: 65, actors: [1] }));

    const cHigh = mkChronicle();
    for (let i = 0; i < 5; i++) {
      cHigh.entries.push(mkEntry({ entryId: `e${i}`, significance: 90, actors: [1] }));
    }

    const low = createLegendFromChronicle(cLow, 1, "Arath")!;
    const high = createLegendFromChronicle(cHigh, 1, "Arath")!;
    expect(high.fame_Q).toBeGreaterThan(low.fame_Q);
  });

  it("tags include 'warrior' for combat_victory entries", () => {
    const c = mkChronicle();
    c.entries.push(mkEntry({ entryId: "e1", significance: 80, eventType: "combat_victory", actors: [1] }));

    const legend = createLegendFromChronicle(c, 1, "Arath")!;
    expect(legend.tags).toContain("warrior");
  });

  it("tags include 'legendary_deed' for legendary_deed entries", () => {
    const c = mkChronicle();
    c.entries.push(mkEntry({ entryId: "e1", significance: 85, eventType: "legendary_deed", actors: [1] }));

    const legend = createLegendFromChronicle(c, 1, "Arath")!;
    expect(legend.tags).toContain("legendary_deed");
  });

  it("reputation is 'heroic' with rise_of_hero arc", () => {
    const c = mkChronicle();
    c.entries.push(mkEntry({ entryId: "e1", significance: 80, actors: [1] }));
    c.detectedArcs.push({
      arcId: "arc1",
      arcType: "rise_of_hero",
      entryIds: ["e1"],
      primaryActors: [1],
      startTick: 100,
      significance: 80,
      description: "A hero rises",
    });

    const legend = createLegendFromChronicle(c, 1, "Arath")!;
    expect(legend.reputation).toBe("heroic");
    expect(legend.tags).toContain("hero");
  });

  it("reputation is 'notorious' with notorious_villain arc", () => {
    const c = mkChronicle();
    c.entries.push(mkEntry({ entryId: "e1", significance: 80, actors: [1] }));
    c.detectedArcs.push({
      arcId: "arc1",
      arcType: "notorious_villain",
      entryIds: ["e1"],
      primaryActors: [1],
      startTick: 100,
      significance: 80,
      description: "A villain emerges",
    });

    const legend = createLegendFromChronicle(c, 1, "Arath")!;
    expect(legend.reputation).toBe("notorious");
    expect(legend.tags).toContain("villain");
  });

  it("reputation is 'legendary' with legendary_deed + high fame", () => {
    const c = mkChronicle();
    for (let i = 0; i < 6; i++) {
      c.entries.push(mkEntry({ entryId: `e${i}`, significance: 95, eventType: "legendary_deed", actors: [1] }));
    }

    const legend = createLegendFromChronicle(c, 1, "Arath")!;
    expect(legend.reputation).toBe("legendary");
  });

  it("custom minSignificance filters entries", () => {
    const c = mkChronicle();
    c.entries.push(mkEntry({ entryId: "e1", significance: 50, actors: [1] }));

    // Default threshold 60 → no legend
    expect(createLegendFromChronicle(c, 1, "Arath")).toBeUndefined();
    // Custom threshold 45 → legend exists
    expect(createLegendFromChronicle(c, 1, "Arath", 45)).toBeDefined();
  });
});

// ── LegendRegistry ────────────────────────────────────────────────────────────

describe("LegendRegistry", () => {
  it("createLegendRegistry returns empty registry", () => {
    const reg = createLegendRegistry();
    expect(reg.legends.size).toBe(0);
    expect(reg.bySubject.size).toBe(0);
  });

  it("registerLegend + getLegendsBySubject round-trip", () => {
    const reg = createLegendRegistry();
    const legend = mkLegend();
    registerLegend(reg, legend);

    const results = getLegendsBySubject(reg, 1);
    expect(results).toHaveLength(1);
    expect(results[0]!.legendId).toBe("legend_1_100");
  });

  it("multiple legends for different subjects", () => {
    const reg = createLegendRegistry();
    registerLegend(reg, mkLegend({ legendId: "legend_1_100", subjectId: 1 }));
    registerLegend(reg, mkLegend({ legendId: "legend_2_200", subjectId: 2 }));

    expect(getLegendsBySubject(reg, 1)).toHaveLength(1);
    expect(getLegendsBySubject(reg, 2)).toHaveLength(1);
  });

  it("getLegendsBySubject returns empty array for unknown subject", () => {
    const reg = createLegendRegistry();
    expect(getLegendsBySubject(reg, 999)).toHaveLength(0);
  });
});

// ── getLegendEffect ───────────────────────────────────────────────────────────

describe("getLegendEffect", () => {
  it("heroic legend gives persuasionBonus > 0 and no intimidation/fear", () => {
    const eff = getLegendEffect(mkLegend({ reputation: "heroic", fame_Q: q(0.70) }));
    expect(eff.persuasionBonus_Q).toBeGreaterThan(0);
    expect(eff.intimidationBonus_Q).toBe(0);
    expect(eff.fearBonus_Q).toBe(0);
  });

  it("heroic legend gives moraleBonus > 0", () => {
    const eff = getLegendEffect(mkLegend({ reputation: "heroic", fame_Q: q(0.70) }));
    expect(eff.moraleBonus_Q).toBeGreaterThan(0);
  });

  it("notorious legend gives intimidationBonus > 0 and fearBonus > 0", () => {
    const eff = getLegendEffect(mkLegend({ reputation: "notorious", fame_Q: q(0.80) }));
    expect(eff.intimidationBonus_Q).toBeGreaterThan(0);
    expect(eff.fearBonus_Q).toBeGreaterThan(0);
    expect(eff.persuasionBonus_Q).toBe(0);
  });

  it("legendary gives both persuasion and intimidation bonuses", () => {
    const eff = getLegendEffect(mkLegend({ reputation: "legendary", fame_Q: q(0.90) }));
    expect(eff.persuasionBonus_Q).toBeGreaterThan(0);
    expect(eff.intimidationBonus_Q).toBeGreaterThan(0);
    expect(eff.moraleBonus_Q).toBeGreaterThan(0);
    expect(eff.fearBonus_Q).toBeGreaterThan(0);
  });

  it("forgotten legend returns all zeros", () => {
    const eff = getLegendEffect(mkLegend({ reputation: "forgotten", fame_Q: q(0.05) }));
    expect(eff.persuasionBonus_Q).toBe(0);
    expect(eff.intimidationBonus_Q).toBe(0);
    expect(eff.fearBonus_Q).toBe(0);
    expect(eff.moraleBonus_Q).toBe(0);
  });

  it("higher fame → higher persuasionBonus for heroic", () => {
    const low  = getLegendEffect(mkLegend({ reputation: "heroic", fame_Q: q(0.20) }));
    const high = getLegendEffect(mkLegend({ reputation: "heroic", fame_Q: q(0.90) }));
    expect(high.persuasionBonus_Q).toBeGreaterThan(low.persuasionBonus_Q);
  });
});

// ── npcKnowsLegend ────────────────────────────────────────────────────────────

describe("npcKnowsLegend", () => {
  it("fame_Q = SCALE.Q → always known", () => {
    const legend = mkLegend({ fame_Q: SCALE.Q as Q });
    for (let npcId = 1; npcId <= 20; npcId++) {
      expect(npcKnowsLegend(legend, npcId, 42, 0)).toBe(true);
    }
  });

  it("fame_Q = 0 → never known", () => {
    const legend = mkLegend({ fame_Q: q(0) });
    for (let npcId = 1; npcId <= 20; npcId++) {
      expect(npcKnowsLegend(legend, npcId, 42, 0)).toBe(false);
    }
  });

  it("same inputs produce the same result (deterministic)", () => {
    const legend = mkLegend({ fame_Q: q(0.50) });
    const r1 = npcKnowsLegend(legend, 7, 999, 500);
    const r2 = npcKnowsLegend(legend, 7, 999, 500);
    expect(r1).toBe(r2);
  });

  it("different npcIds produce different results across population", () => {
    const legend = mkLegend({ fame_Q: q(0.50) });
    const results = new Set<boolean>();
    for (let npcId = 1; npcId <= 50; npcId++) {
      results.add(npcKnowsLegend(legend, npcId, 1, 0));
    }
    // With 50% fame, both true and false should appear in 50 samples
    expect(results.has(true)).toBe(true);
    expect(results.has(false)).toBe(true);
  });
});

// ── applyLegendToDialogueContext ───────────────────────────────────────────────

describe("applyLegendToDialogueContext", () => {
  it("no legends → zero bonuses", () => {
    const reg = createLegendRegistry();
    const result = applyLegendToDialogueContext(1, 2, reg, 42, 0);
    expect(result.persuasionBonus_Q).toBe(0);
    expect(result.intimidationBonus_Q).toBe(0);
    expect(result.fearBonus_Q).toBe(0);
  });

  it("heroic legend (fame=SCALE.Q, always known) → persuasionBonus > 0", () => {
    const reg = createLegendRegistry();
    registerLegend(reg, mkLegend({ fame_Q: SCALE.Q as Q, reputation: "heroic" }));

    const result = applyLegendToDialogueContext(1, 2, reg, 42, 0);
    expect(result.persuasionBonus_Q).toBeGreaterThan(0);
  });

  it("notorious legend (fame=SCALE.Q) → intimidationBonus > 0", () => {
    const reg = createLegendRegistry();
    registerLegend(reg, mkLegend({ fame_Q: SCALE.Q as Q, reputation: "notorious" }));

    const result = applyLegendToDialogueContext(1, 2, reg, 42, 0);
    expect(result.intimidationBonus_Q).toBeGreaterThan(0);
    expect(result.fearBonus_Q).toBeGreaterThan(0);
  });

  it("legend not known (fame=0) → no bonus", () => {
    const reg = createLegendRegistry();
    registerLegend(reg, mkLegend({ fame_Q: q(0), reputation: "heroic" }));

    const result = applyLegendToDialogueContext(1, 2, reg, 42, 0);
    expect(result.persuasionBonus_Q).toBe(0);
  });

  it("bonuses are capped at q(0.50)", () => {
    const reg = createLegendRegistry();
    // Register many legendary legends to try to push bonus over q(0.50)
    for (let i = 0; i < 10; i++) {
      registerLegend(reg, mkLegend({
        legendId: `legend_1_${i}`,
        fame_Q: SCALE.Q as Q,
        reputation: "heroic",
      }));
    }

    const result = applyLegendToDialogueContext(1, 2, reg, 42, 0);
    expect(result.persuasionBonus_Q).toBeLessThanOrEqual(q(0.50));
  });
});

// ── stepLegendFame ────────────────────────────────────────────────────────────

describe("stepLegendFame", () => {
  it("fame decays over time", () => {
    const reg = createLegendRegistry();
    registerLegend(reg, mkLegend({ fame_Q: q(0.80), reputation: "heroic" }));

    const before = reg.legends.get("legend_1_100")!.fame_Q;
    stepLegendFame(reg, 100_000); // large delta to ensure decay > 0

    const after = reg.legends.get("legend_1_100")!.fame_Q;
    expect(after).toBeLessThan(before);
  });

  it("legendary reputation has a fame floor at q(0.50)", () => {
    const reg = createLegendRegistry();
    registerLegend(reg, mkLegend({ fame_Q: q(0.51), reputation: "legendary" }));

    stepLegendFame(reg, 100_000_000); // enormous delta

    const fame = reg.legends.get("legend_1_100")!.fame_Q;
    expect(fame).toBeGreaterThanOrEqual(q(0.50));
  });

  it("no decay when deltaTicks = 0", () => {
    const reg = createLegendRegistry();
    registerLegend(reg, mkLegend({ fame_Q: q(0.70), reputation: "heroic" }));

    stepLegendFame(reg, 0);

    expect(reg.legends.get("legend_1_100")!.fame_Q).toBe(q(0.70));
  });

  it("reputation becomes forgotten when fame falls below threshold", () => {
    const reg = createLegendRegistry();
    registerLegend(reg, mkLegend({ fame_Q: q(0.11), reputation: "heroic" }));

    stepLegendFame(reg, 100_000_000);

    expect(reg.legends.get("legend_1_100")!.reputation).toBe("forgotten");
  });

  it("fame never goes below 0", () => {
    const reg = createLegendRegistry();
    registerLegend(reg, mkLegend({ fame_Q: q(0.15), reputation: "heroic" }));

    stepLegendFame(reg, 1_000_000_000);

    expect(reg.legends.get("legend_1_100")!.fame_Q).toBeGreaterThanOrEqual(0);
  });
});

// ── Serialization ─────────────────────────────────────────────────────────────

describe("serialization", () => {
  it("serializeLegendRegistry → deserializeLegendRegistry round-trip", () => {
    const reg = createLegendRegistry();
    registerLegend(reg, mkLegend({ fame_Q: q(0.70), reputation: "heroic" }));
    registerLegend(reg, mkLegend({ legendId: "legend_2_200", subjectId: 2, subjectName: "Brak", fame_Q: q(0.50) }));

    const data = serializeLegendRegistry(reg);
    const restored = deserializeLegendRegistry(data);

    expect(restored.legends.size).toBe(2);
    expect(restored.legends.has("legend_1_100")).toBe(true);
    expect(restored.legends.has("legend_2_200")).toBe(true);
  });

  it("bySubject index is rebuilt correctly on deserialize", () => {
    const reg = createLegendRegistry();
    registerLegend(reg, mkLegend({ fame_Q: q(0.70) }));

    const restored = deserializeLegendRegistry(serializeLegendRegistry(reg));

    const legends = getLegendsBySubject(restored, 1);
    expect(legends).toHaveLength(1);
    expect(legends[0]!.subjectName).toBe("Arath");
  });
});
