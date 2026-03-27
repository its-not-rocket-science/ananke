// test/wonders.test.ts — Phase 100: Wonders & Monuments

import { describe, it, expect } from "vitest";
import {
  WONDER_BASE_COST_CU,
  WONDER_TYPICAL_DAYS,
  WONDER_BASE_EFFECTS,
  WONDER_DAMAGED_EFFECT_MUL,
  WONDER_REPAIR_COST_FRAC,
  createWonderProject,
  contributeToWonder,
  isWonderProjectComplete,
  completeWonder,
  damageWonder,
  repairWonder,
  computeWonderEffects,
  aggregateWonderEffects,
  isWonderIntact,
  computeRepairCost,
  type WonderType,
} from "../src/wonders.js";
import { q, SCALE } from "../src/units.js";
import type { Q } from "../src/units.js";
import type { Polity } from "../src/polity.js";
import type { TechEra } from "../src/sim/tech.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePolity(treasury_cu = 10_000_000): Polity {
  return {
    id: "p1", name: "Test",
    factionId: "f1", locationIds: [],
    population: 50_000, treasury_cu,
    techEra: 2 as TechEra,
    militaryStrength_Q: q(0.60) as Q,
    stabilityQ: q(0.70) as Q,
    moraleQ: q(0.60) as Q,
  } as Polity;
}

function makeCompletedWonder(type: Parameters<typeof createWonderProject>[2] = "grand_library") {
  const project = createWonderProject("w1", "p1", type, 0);
  const polity  = makePolity(WONDER_BASE_COST_CU[type] * 2);
  contributeToWonder(project, polity, WONDER_BASE_COST_CU[type]);
  return completeWonder(project, 100);
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("all seven wonder types have base costs", () => {
    const types = ["great_pyramid","colosseum","grand_library","great_wall",
                   "grand_harbour","aqueduct_system","grand_temple"] as const;
    for (const t of types) {
      expect(WONDER_BASE_COST_CU[t]).toBeGreaterThan(0);
    }
  });

  it("great_pyramid is the most expensive wonder", () => {
    const max = Math.max(...Object.values(WONDER_BASE_COST_CU));
    expect(WONDER_BASE_COST_CU.great_pyramid).toBe(max);
  });

  it("grand_library is the least expensive wonder", () => {
    const min = Math.min(...Object.values(WONDER_BASE_COST_CU));
    expect(WONDER_BASE_COST_CU.grand_library).toBe(min);
  });

  it("great_pyramid has the longest typical build time", () => {
    const max = Math.max(...Object.values(WONDER_TYPICAL_DAYS));
    expect(WONDER_TYPICAL_DAYS.great_pyramid).toBe(max);
  });

  it("grand_library has the highest research bonus", () => {
    const max = Math.max(...Object.values(WONDER_BASE_EFFECTS).map(e => e.researchPointBonus));
    expect(WONDER_BASE_EFFECTS.grand_library.researchPointBonus).toBe(max);
  });

  it("great_wall has the highest defense bonus", () => {
    const max = Math.max(...Object.values(WONDER_BASE_EFFECTS).map(e => e.defenseBonus_Q));
    expect(WONDER_BASE_EFFECTS.great_wall.defenseBonus_Q).toBe(max);
  });

  it("grand_harbour has the highest trade income bonus", () => {
    const max = Math.max(...Object.values(WONDER_BASE_EFFECTS).map(e => e.tradeIncomeBonus_Q));
    expect(WONDER_BASE_EFFECTS.grand_harbour.tradeIncomeBonus_Q).toBe(max);
  });

  it("aqueduct_system has the highest epidemic resistance", () => {
    const max = Math.max(...Object.values(WONDER_BASE_EFFECTS).map(e => e.epidemicResistance_Q));
    expect(WONDER_BASE_EFFECTS.aqueduct_system.epidemicResistance_Q).toBe(max);
  });

  it("colosseum has the highest unrest reduction", () => {
    const max = Math.max(...Object.values(WONDER_BASE_EFFECTS).map(e => e.unrestReduction_Q));
    expect(WONDER_BASE_EFFECTS.colosseum.unrestReduction_Q).toBe(max);
  });

  it("WONDER_DAMAGED_EFFECT_MUL is q(0.50)", () => {
    expect(WONDER_DAMAGED_EFFECT_MUL).toBe(q(0.50));
  });

  it("WONDER_REPAIR_COST_FRAC < q(0.50)", () => {
    expect(WONDER_REPAIR_COST_FRAC).toBeLessThan(q(0.50));
  });
});

// ── createWonderProject ───────────────────────────────────────────────────────

describe("createWonderProject", () => {
  it("stores all fields", () => {
    const p = createWonderProject("w1", "p1", "colosseum", 42);
    expect(p.projectId).toBe("w1");
    expect(p.polityId).toBe("p1");
    expect(p.type).toBe("colosseum");
    expect(p.startTick).toBe(42);
  });

  it("starts at zero progress and zero invested cost", () => {
    const p = createWonderProject("w1", "p1", "great_pyramid", 0);
    expect(p.progress_Q).toBe(0);
    expect(p.investedCost_cu).toBe(0);
  });
});

// ── contributeToWonder ────────────────────────────────────────────────────────

describe("contributeToWonder", () => {
  it("deducts from polity treasury", () => {
    const polity  = makePolity(1_000_000);
    const project = createWonderProject("w1", "p1", "grand_library", 0);
    contributeToWonder(project, polity, 50_000);
    expect(polity.treasury_cu).toBe(950_000);
  });

  it("advances progress proportionally", () => {
    const polity  = makePolity(10_000_000);
    const project = createWonderProject("w1", "p1", "grand_library", 0);
    const cost    = WONDER_BASE_COST_CU.grand_library;  // 150,000
    contributeToWonder(project, polity, cost / 2);
    expect(project.progress_Q).toBe(q(0.50));
  });

  it("capped by treasury — cannot overspend", () => {
    const polity  = makePolity(10_000);
    const project = createWonderProject("w1", "p1", "grand_library", 0);
    contributeToWonder(project, polity, 1_000_000);
    expect(polity.treasury_cu).toBe(0);
    expect(project.investedCost_cu).toBe(10_000);
  });

  it("capped by remaining cost — does not invest beyond total", () => {
    const cost    = WONDER_BASE_COST_CU.grand_library;
    const polity  = makePolity(cost * 10);
    const project = createWonderProject("w1", "p1", "grand_library", 0);
    contributeToWonder(project, polity, cost);   // completes it
    contributeToWonder(project, polity, cost);   // no-op — already done
    expect(project.investedCost_cu).toBe(cost);
    expect(polity.treasury_cu).toBe(cost * 9);   // only deducted once
  });

  it("returns new progress_Q", () => {
    const polity  = makePolity(10_000_000);
    const project = createWonderProject("w1", "p1", "grand_library", 0);
    const cost    = WONDER_BASE_COST_CU.grand_library;
    const progress = contributeToWonder(project, polity, cost);
    expect(progress).toBe(SCALE.Q);
  });

  it("progress reaches SCALE.Q at full cost", () => {
    const cost    = WONDER_BASE_COST_CU.colosseum;
    const polity  = makePolity(cost);
    const project = createWonderProject("w1", "p1", "colosseum", 0);
    contributeToWonder(project, polity, cost);
    expect(project.progress_Q).toBe(SCALE.Q);
  });
});

// ── isWonderProjectComplete ───────────────────────────────────────────────────

describe("isWonderProjectComplete", () => {
  it("false when progress < SCALE.Q", () => {
    const p = createWonderProject("w1", "p1", "grand_library", 0);
    expect(isWonderProjectComplete(p)).toBe(false);
  });

  it("true when progress = SCALE.Q", () => {
    const cost   = WONDER_BASE_COST_CU.grand_library;
    const polity = makePolity(cost);
    const p      = createWonderProject("w1", "p1", "grand_library", 0);
    contributeToWonder(p, polity, cost);
    expect(isWonderProjectComplete(p)).toBe(true);
  });
});

// ── completeWonder ────────────────────────────────────────────────────────────

describe("completeWonder", () => {
  it("creates Wonder with correct fields", () => {
    const project = createWonderProject("w42", "p1", "aqueduct_system", 10);
    const polity  = makePolity(WONDER_BASE_COST_CU.aqueduct_system);
    contributeToWonder(project, polity, WONDER_BASE_COST_CU.aqueduct_system);
    const wonder  = completeWonder(project, 500);
    expect(wonder.wonderId).toBe("w42");
    expect(wonder.polityId).toBe("p1");
    expect(wonder.type).toBe("aqueduct_system");
    expect(wonder.completedAtTick).toBe(500);
    expect(wonder.damaged).toBe(false);
  });
});

// ── damageWonder / repairWonder ───────────────────────────────────────────────

describe("damageWonder", () => {
  it("sets damaged to true", () => {
    const w = makeCompletedWonder();
    damageWonder(w);
    expect(w.damaged).toBe(true);
  });
});

describe("repairWonder", () => {
  it("clears damaged and deducts repair cost", () => {
    const w      = makeCompletedWonder("grand_library");
    damageWonder(w);
    const polity = makePolity(1_000_000);
    const result = repairWonder(w, polity);
    expect(result).toBe(true);
    expect(w.damaged).toBe(false);
    expect(polity.treasury_cu).toBeLessThan(1_000_000);
  });

  it("returns false when treasury is insufficient", () => {
    const w      = makeCompletedWonder("great_pyramid");
    damageWonder(w);
    const polity = makePolity(0);
    const result = repairWonder(w, polity);
    expect(result).toBe(false);
    expect(w.damaged).toBe(true);   // still damaged
  });

  it("returns true and is no-op when wonder is not damaged", () => {
    const w      = makeCompletedWonder();
    const polity = makePolity(1_000_000);
    const before = polity.treasury_cu;
    const result = repairWonder(w, polity);
    expect(result).toBe(true);
    expect(polity.treasury_cu).toBe(before);   // no deduction
  });

  it("repair cost = WONDER_BASE_COST_CU × WONDER_REPAIR_COST_FRAC", () => {
    const cost   = computeRepairCost("grand_library");
    const expectedFull = WONDER_BASE_COST_CU.grand_library;
    expect(cost).toBeLessThan(expectedFull);
    expect(cost).toBeGreaterThan(0);
  });
});

// ── computeWonderEffects ──────────────────────────────────────────────────────

describe("computeWonderEffects", () => {
  it("returns full base effects when undamaged", () => {
    const w  = makeCompletedWonder("great_wall");
    const fx = computeWonderEffects(w);
    expect(fx.defenseBonus_Q).toBe(WONDER_BASE_EFFECTS.great_wall.defenseBonus_Q);
  });

  it("returns half effects when damaged", () => {
    const w  = makeCompletedWonder("great_wall");
    damageWonder(w);
    const fx = computeWonderEffects(w);
    const base = WONDER_BASE_EFFECTS.great_wall.defenseBonus_Q;
    expect(fx.defenseBonus_Q).toBeLessThan(base);
    expect(fx.defenseBonus_Q).toBeGreaterThanOrEqual(base / 2 - 1);
  });

  it("damaged wonder has lower effects than undamaged", () => {
    const intact   = makeCompletedWonder("grand_library");
    const damaged  = makeCompletedWonder("grand_library");
    damageWonder(damaged);
    const fxI = computeWonderEffects(intact);
    const fxD = computeWonderEffects(damaged);
    expect(fxD.researchPointBonus).toBeLessThan(fxI.researchPointBonus);
  });

  it("aqueduct_system has non-zero epidemic resistance", () => {
    const w  = makeCompletedWonder("aqueduct_system");
    const fx = computeWonderEffects(w);
    expect(fx.epidemicResistance_Q).toBeGreaterThan(0);
  });

  it("all Q effects are in [0, SCALE.Q]", () => {
    for (const type of Object.keys(WONDER_BASE_EFFECTS) as Array<keyof typeof WONDER_BASE_EFFECTS>) {
      const w  = makeCompletedWonder(type);
      const fx = computeWonderEffects(w);
      expect(fx.stabilityBonus_Q).toBeLessThanOrEqual(SCALE.Q);
      expect(fx.defenseBonus_Q).toBeLessThanOrEqual(SCALE.Q);
      expect(fx.epidemicResistance_Q).toBeLessThanOrEqual(SCALE.Q);
    }
  });
});

// ── aggregateWonderEffects ────────────────────────────────────────────────────

describe("aggregateWonderEffects", () => {
  it("empty list returns all-zero effects", () => {
    const fx = aggregateWonderEffects([]);
    expect(fx.stabilityBonus_Q).toBe(0);
    expect(fx.researchPointBonus).toBe(0);
    expect(fx.defenseBonus_Q).toBe(0);
  });

  it("single wonder matches computeWonderEffects", () => {
    const w   = makeCompletedWonder("great_wall");
    const agg = aggregateWonderEffects([w]);
    const single = computeWonderEffects(w);
    expect(agg.defenseBonus_Q).toBe(single.defenseBonus_Q);
    expect(agg.stabilityBonus_Q).toBe(single.stabilityBonus_Q);
  });

  it("multiple wonders combine effects additively", () => {
    const wall    = makeCompletedWonder("great_wall");
    const pyramid = makeCompletedWonder("great_pyramid");
    const agg     = aggregateWonderEffects([wall, pyramid]);
    expect(agg.stabilityBonus_Q).toBeGreaterThan(
      computeWonderEffects(wall).stabilityBonus_Q,
    );
  });

  it("Q fields clamped to SCALE.Q when stacking many wonders", () => {
    const wonders = Object.keys(WONDER_BASE_EFFECTS).map(t =>
      makeCompletedWonder(t as WonderType)
    );
    const agg = aggregateWonderEffects(wonders);
    for (const key of ["stabilityBonus_Q", "moraleBonus_Q", "defenseBonus_Q",
                       "epidemicResistance_Q", "tradeIncomeBonus_Q",
                       "unrestReduction_Q"] as const) {
      expect(agg[key]).toBeLessThanOrEqual(SCALE.Q);
    }
  });

  it("researchPointBonus sums without capping", () => {
    const lib1 = makeCompletedWonder("grand_library");
    const lib2 = makeCompletedWonder("grand_library");
    const agg  = aggregateWonderEffects([lib1, lib2]);
    expect(agg.researchPointBonus)
      .toBe(WONDER_BASE_EFFECTS.grand_library.researchPointBonus * 2);
  });
});

// ── isWonderIntact / computeRepairCost ────────────────────────────────────────

describe("isWonderIntact", () => {
  it("true when undamaged", () => {
    expect(isWonderIntact(makeCompletedWonder())).toBe(true);
  });

  it("false when damaged", () => {
    const w = makeCompletedWonder();
    damageWonder(w);
    expect(isWonderIntact(w)).toBe(false);
  });
});

describe("computeRepairCost", () => {
  it("is less than base cost", () => {
    for (const type of Object.keys(WONDER_BASE_COST_CU) as Array<keyof typeof WONDER_BASE_COST_CU>) {
      expect(computeRepairCost(type)).toBeLessThan(WONDER_BASE_COST_CU[type]);
    }
  });

  it("is proportional to base cost — expensive wonders cost more to repair", () => {
    expect(computeRepairCost("great_pyramid"))
      .toBeGreaterThan(computeRepairCost("grand_library"));
  });
});

// ── Integration ───────────────────────────────────────────────────────────────

describe("integration", () => {
  it("full lifecycle: fund → build → earthquake damage → repair", () => {
    const polity  = makePolity(2_000_000);
    const project = createWonderProject("w1", "p1", "grand_library", 0);
    const cost    = WONDER_BASE_COST_CU.grand_library;

    // Fund in two steps
    contributeToWonder(project, polity, cost / 2);
    expect(isWonderProjectComplete(project)).toBe(false);
    contributeToWonder(project, polity, cost / 2);
    expect(isWonderProjectComplete(project)).toBe(true);

    // Complete
    const wonder = completeWonder(project, 365);
    expect(wonder.damaged).toBe(false);
    expect(isWonderIntact(wonder)).toBe(true);

    // Full effects
    const fullFx = computeWonderEffects(wonder);
    expect(fullFx.researchPointBonus).toBeGreaterThan(0);

    // Earthquake damages it
    damageWonder(wonder);
    const damagedFx = computeWonderEffects(wonder);
    expect(damagedFx.researchPointBonus).toBeLessThan(fullFx.researchPointBonus);

    // Repair
    const repaired = repairWonder(wonder, polity);
    expect(repaired).toBe(true);
    expect(wonder.damaged).toBe(false);
    const restoredFx = computeWonderEffects(wonder);
    expect(restoredFx.researchPointBonus).toBe(fullFx.researchPointBonus);
  });

  it("civilisation with all seven wonders has dominant combined bonuses", () => {
    const wonders = (Object.keys(WONDER_BASE_EFFECTS) as Array<keyof typeof WONDER_BASE_EFFECTS>)
      .map(t => makeCompletedWonder(t));
    const agg = aggregateWonderEffects(wonders);

    expect(agg.stabilityBonus_Q).toBeGreaterThan(q(0.15));
    expect(agg.researchPointBonus).toBeGreaterThan(0);
    expect(agg.defenseBonus_Q).toBeGreaterThan(0);
    expect(agg.epidemicResistance_Q).toBeGreaterThan(0);
    expect(agg.tradeIncomeBonus_Q).toBeGreaterThan(0);
  });
});
