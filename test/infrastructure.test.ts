// test/infrastructure.test.ts — Phase 89: Infrastructure & Development

import { describe, it, expect } from "vitest";
import {
  MAX_INFRA_LEVEL,
  INFRA_BASE_COST,
  INFRA_BONUS_PER_LEVEL_Q,
  createInfraProject,
  createInfraStructure,
  investInProject,
  isProjectComplete,
  completeProject,
  computeInfraBonus,
  computeRoadTradeBonus,
  computeWallSiegeBonus,
  computeGranaryCapacityBonus,
  computeMarketplaceIncome,
  computeApothecaryHealthBonus,
} from "../src/infrastructure.js";
import { createPolity } from "../src/polity.js";
import { q, SCALE, mulDiv } from "../src/units.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePolity(treasury = 500_000) {
  const p = createPolity("p1", "Test", "f1", [], 10_000, treasury, "Medieval");
  return p;
}

function makeStructure(type: Parameters<typeof createInfraStructure>[2], level = 1) {
  return createInfraStructure("s1", "p1", type, level, 0);
}

// ── Constants ──────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("MAX_INFRA_LEVEL is 5", () => {
    expect(MAX_INFRA_LEVEL).toBe(5);
  });

  it("wall base cost is more expensive than road", () => {
    expect(INFRA_BASE_COST["wall"]).toBeGreaterThan(INFRA_BASE_COST["road"]);
  });

  it("road bonus per level is q(0.05)", () => {
    expect(INFRA_BONUS_PER_LEVEL_Q["road"]).toBe(q(0.05));
  });

  it("wall bonus per level is q(0.08)", () => {
    expect(INFRA_BONUS_PER_LEVEL_Q["wall"]).toBe(q(0.08));
  });
});

// ── createInfraProject ─────────────────────────────────────────────────────────

describe("createInfraProject", () => {
  it("initialises project with zero invested cost", () => {
    const p = createInfraProject("proj1", "p1", "road", 2);
    expect(p.investedCost).toBe(0);
    expect(p.completedTick).toBeUndefined();
  });

  it("total cost = BASE_COST × level", () => {
    const p = createInfraProject("proj1", "p1", "road", 3);
    expect(p.totalCost).toBe(INFRA_BASE_COST["road"] * 3);
  });

  it("clamps target level to [1, MAX_INFRA_LEVEL]", () => {
    const lo = createInfraProject("p1", "x", "wall", 0);
    const hi = createInfraProject("p2", "x", "wall", 99);
    expect(lo.targetLevel).toBe(1);
    expect(hi.targetLevel).toBe(MAX_INFRA_LEVEL);
  });

  it("stores polityId and type", () => {
    const p = createInfraProject("proj1", "myPolity", "granary", 2);
    expect(p.polityId).toBe("myPolity");
    expect(p.type).toBe("granary");
  });
});

// ── createInfraStructure ───────────────────────────────────────────────────────

describe("createInfraStructure", () => {
  it("creates structure with correct fields", () => {
    const s = createInfraStructure("s1", "p1", "marketplace", 3, 100);
    expect(s.structureId).toBe("s1");
    expect(s.polityId).toBe("p1");
    expect(s.type).toBe("marketplace");
    expect(s.level).toBe(3);
    expect(s.builtTick).toBe(100);
  });

  it("clamps level to [1, MAX_INFRA_LEVEL]", () => {
    const lo = createInfraStructure("s", "p", "road", 0, 0);
    const hi = createInfraStructure("s", "p", "road", 10, 0);
    expect(lo.level).toBe(1);
    expect(hi.level).toBe(MAX_INFRA_LEVEL);
  });
});

// ── investInProject ────────────────────────────────────────────────────────────

describe("investInProject", () => {
  it("drains treasury and adds to investedCost", () => {
    const pol  = makePolity(100_000);
    const proj = createInfraProject("proj", "p1", "road", 1);
    investInProject(pol, proj, 5_000, 1);
    expect(pol.treasury_cu).toBe(95_000);
    expect(proj.investedCost).toBe(5_000);
  });

  it("completes project when fully funded", () => {
    const pol  = makePolity(500_000);
    const proj = createInfraProject("proj", "p1", "road", 1);
    investInProject(pol, proj, proj.totalCost, 42);
    expect(proj.completedTick).toBe(42);
    expect(isProjectComplete(proj)).toBe(true);
  });

  it("does not overfund — only drains remaining cost", () => {
    const pol  = makePolity(500_000);
    const proj = createInfraProject("proj", "p1", "road", 1);
    const invested = investInProject(pol, proj, proj.totalCost * 10, 1);
    expect(invested).toBe(proj.totalCost);
    expect(proj.investedCost).toBe(proj.totalCost);
  });

  it("cannot invest more than polity has in treasury", () => {
    const pol  = makePolity(1_000);
    const proj = createInfraProject("proj", "p1", "wall", 1);  // costs 20_000
    const invested = investInProject(pol, proj, proj.totalCost, 1);
    expect(invested).toBe(1_000);
    expect(pol.treasury_cu).toBe(0);
  });

  it("no-ops on an already completed project", () => {
    const pol  = makePolity(500_000);
    const proj = createInfraProject("proj", "p1", "road", 1);
    investInProject(pol, proj, proj.totalCost, 1);
    const treasuryBefore = pol.treasury_cu;
    const invested = investInProject(pol, proj, 5_000, 2);
    expect(invested).toBe(0);
    expect(pol.treasury_cu).toBe(treasuryBefore);
  });

  it("multiple partial investments accumulate", () => {
    const pol  = makePolity(500_000);
    const proj = createInfraProject("proj", "p1", "road", 1);
    investInProject(pol, proj, 3_000, 1);
    investInProject(pol, proj, 3_000, 2);
    expect(proj.investedCost).toBe(6_000);
  });

  it("returns the actual amount invested", () => {
    const pol  = makePolity(500_000);
    const proj = createInfraProject("proj", "p1", "road", 1);
    const r    = investInProject(pol, proj, 3_000, 1);
    expect(r).toBe(3_000);
  });
});

// ── isProjectComplete / completeProject ───────────────────────────────────────

describe("isProjectComplete and completeProject", () => {
  it("isProjectComplete returns false for new project", () => {
    const proj = createInfraProject("p", "x", "wall", 1);
    expect(isProjectComplete(proj)).toBe(false);
  });

  it("completeProject returns undefined for incomplete project", () => {
    const proj = createInfraProject("p", "x", "wall", 1);
    expect(completeProject(proj, "s1")).toBeUndefined();
  });

  it("completeProject returns InfraStructure when complete", () => {
    const pol  = makePolity(500_000);
    const proj = createInfraProject("proj", "p1", "wall", 2);
    investInProject(pol, proj, proj.totalCost, 10);
    const s = completeProject(proj, "s_wall");
    expect(s).toBeDefined();
    expect(s?.type).toBe("wall");
    expect(s?.level).toBe(2);
    expect(s?.builtTick).toBe(10);
    expect(s?.structureId).toBe("s_wall");
  });
});

// ── computeInfraBonus ──────────────────────────────────────────────────────────

describe("computeInfraBonus", () => {
  it("returns 0 for empty structure list", () => {
    expect(computeInfraBonus([], "road")).toBe(0);
  });

  it("returns 0 when no matching type", () => {
    const s = makeStructure("wall");
    expect(computeInfraBonus([s], "road")).toBe(0);
  });

  it("level-1 road returns BONUS_PER_LEVEL_Q", () => {
    const s = makeStructure("road", 1);
    expect(computeInfraBonus([s], "road")).toBe(INFRA_BONUS_PER_LEVEL_Q["road"]);
  });

  it("level-3 road returns 3 × BONUS_PER_LEVEL_Q", () => {
    const s = makeStructure("road", 3);
    expect(computeInfraBonus([s], "road")).toBe(INFRA_BONUS_PER_LEVEL_Q["road"] * 3);
  });

  it("two structures of the same type sum their bonuses", () => {
    const s1 = createInfraStructure("s1", "p1", "road", 2, 0);
    const s2 = createInfraStructure("s2", "p1", "road", 3, 0);
    const expected = INFRA_BONUS_PER_LEVEL_Q["road"] * (2 + 3);
    expect(computeInfraBonus([s1, s2], "road")).toBe(expected);
  });

  it("bonus is clamped to SCALE.Q", () => {
    // Many max-level roads
    const many = Array.from({ length: 10 }, (_, i) =>
      createInfraStructure(`s${i}`, "p1", "road", MAX_INFRA_LEVEL, 0)
    );
    expect(computeInfraBonus(many, "road")).toBeLessThanOrEqual(SCALE.Q);
  });
});

// ── Type-specific bonus helpers ────────────────────────────────────────────────

describe("type-specific bonus helpers", () => {
  it("computeRoadTradeBonus delegates to road type", () => {
    const s = makeStructure("road", 2);
    expect(computeRoadTradeBonus([s])).toBe(computeInfraBonus([s], "road"));
  });

  it("computeWallSiegeBonus delegates to wall type", () => {
    const s = makeStructure("wall", 3);
    expect(computeWallSiegeBonus([s])).toBe(computeInfraBonus([s], "wall"));
  });

  it("computeGranaryCapacityBonus delegates to granary type", () => {
    const s = makeStructure("granary", 2);
    expect(computeGranaryCapacityBonus([s])).toBe(computeInfraBonus([s], "granary"));
  });

  it("computeApothecaryHealthBonus delegates to apothecary type", () => {
    const s = makeStructure("apothecary", 1);
    expect(computeApothecaryHealthBonus([s])).toBe(computeInfraBonus([s], "apothecary"));
  });

  it("max-level wall gives q(0.40) siege reduction", () => {
    const s = makeStructure("wall", MAX_INFRA_LEVEL);
    // 5 × q(0.08) = 5 × 800 = 4000 = q(0.40)
    expect(computeWallSiegeBonus([s])).toBe(q(0.40));
  });

  it("max-level granary gives q(0.50) capacity bonus", () => {
    const s = makeStructure("granary", MAX_INFRA_LEVEL);
    // 5 × q(0.10) = 5 × 1000 = 5000 = q(0.50)
    expect(computeGranaryCapacityBonus([s])).toBe(q(0.50));
  });
});

// ── computeMarketplaceIncome ───────────────────────────────────────────────────

describe("computeMarketplaceIncome", () => {
  it("no marketplaces yields zero income", () => {
    const pol = makePolity(100_000);
    expect(computeMarketplaceIncome(pol, [])).toBe(0);
  });

  it("income = floor(treasury × bonus / SCALE.Q)", () => {
    const pol = makePolity(100_000);
    const s   = makeStructure("marketplace", 1);
    const bonus = INFRA_BONUS_PER_LEVEL_Q["marketplace"];
    const expected = Math.floor(mulDiv(100_000, bonus, SCALE.Q));
    expect(computeMarketplaceIncome(pol, [s])).toBe(expected);
  });

  it("higher marketplace level gives proportionally more income", () => {
    const pol = makePolity(100_000);
    const s1  = makeStructure("marketplace", 1);
    const s2  = makeStructure("marketplace", 3);
    expect(computeMarketplaceIncome(pol, [s2])).toBeGreaterThan(
      computeMarketplaceIncome(pol, [s1])
    );
  });

  it("zero treasury yields zero income", () => {
    const pol = makePolity(0);
    const s   = makeStructure("marketplace", MAX_INFRA_LEVEL);
    expect(computeMarketplaceIncome(pol, [s])).toBe(0);
  });
});
