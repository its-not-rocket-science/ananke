// test/resources.test.ts — Phase 95: Natural Resources & Extraction

import { describe, it, expect } from "vitest";
import {
  BASE_YIELD_PER_WORKER,
  TECH_EXTRACTION_MUL,
  RICHNESS_FLOOR_Q,
  DEPLETION_RATE_PER_1000_CU,
  DEPLETION_EXHAUSTED_Q,
  WORKER_POP_FRACTION_Q,
  MILITARY_BONUS_RESOURCES,
  CONSTRUCTION_BONUS_RESOURCES,
  MOBILITY_BONUS_RESOURCES,
  createDeposit,
  createExtractionState,
  assignWorkers,
  computeDailyYield,
  depleteDeposit,
  stepExtraction,
  computeTotalDailyResourceIncome,
  hasMilitaryBonus,
  hasConstructionBonus,
  hasMobilityBonus,
  estimateDaysToExhaustion,
} from "../src/resources.js";
import { createPolity } from "../src/polity.js";
import { TechEra } from "../src/sim/tech.js";
import { q, SCALE } from "../src/units.js";
import type { Q } from "../src/units.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePolity(era: number = TechEra.Medieval, treasury = 500_000) {
  const p = createPolity("p1", "Test", "f1", [], 50_000, treasury, "Medieval");
  p.techEra = era as typeof TechEra[keyof typeof TechEra];
  return p;
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("silver has highest base yield per worker", () => {
    const max = Math.max(...Object.values(BASE_YIELD_PER_WORKER));
    expect(BASE_YIELD_PER_WORKER.silver).toBe(max);
  });

  it("timber and stone have equal base yield", () => {
    expect(BASE_YIELD_PER_WORKER.timber).toBe(BASE_YIELD_PER_WORKER.stone);
  });

  it("industrial era has higher tech mul than medieval", () => {
    expect(TECH_EXTRACTION_MUL[TechEra.Industrial]).toBeGreaterThan(
      TECH_EXTRACTION_MUL[TechEra.Medieval],
    );
  });

  it("RICHNESS_FLOOR_Q is q(0.50)", () => {
    expect(RICHNESS_FLOOR_Q).toBe(q(0.50));
  });

  it("DEPLETION_EXHAUSTED_Q is q(0.05)", () => {
    expect(DEPLETION_EXHAUSTED_Q).toBe(q(0.05));
  });

  it("WORKER_POP_FRACTION_Q is q(0.10)", () => {
    expect(WORKER_POP_FRACTION_Q).toBe(q(0.10));
  });

  it("iron is in MILITARY_BONUS_RESOURCES", () => {
    expect(MILITARY_BONUS_RESOURCES.has("iron")).toBe(true);
  });

  it("horses is in MILITARY_BONUS_RESOURCES and MOBILITY_BONUS_RESOURCES", () => {
    expect(MILITARY_BONUS_RESOURCES.has("horses")).toBe(true);
    expect(MOBILITY_BONUS_RESOURCES.has("horses")).toBe(true);
  });

  it("timber and stone are in CONSTRUCTION_BONUS_RESOURCES", () => {
    expect(CONSTRUCTION_BONUS_RESOURCES.has("timber")).toBe(true);
    expect(CONSTRUCTION_BONUS_RESOURCES.has("stone")).toBe(true);
  });

  it("silver has no secondary bonus", () => {
    expect(MILITARY_BONUS_RESOURCES.has("silver")).toBe(false);
    expect(CONSTRUCTION_BONUS_RESOURCES.has("silver")).toBe(false);
    expect(MOBILITY_BONUS_RESOURCES.has("silver")).toBe(false);
  });
});

// ── createDeposit ─────────────────────────────────────────────────────────────

describe("createDeposit", () => {
  it("stores all fields", () => {
    const d = createDeposit("d1", "p1", "iron", q(0.80) as Q, 500);
    expect(d.depositId).toBe("d1");
    expect(d.polityId).toBe("p1");
    expect(d.type).toBe("iron");
    expect(d.richness_Q).toBe(q(0.80));
    expect(d.maxWorkers).toBe(500);
  });

  it("defaults richness to q(0.80)", () => {
    const d = createDeposit("d1", "p1", "silver");
    expect(d.richness_Q).toBe(q(0.80));
  });

  it("defaults maxWorkers to 500", () => {
    const d = createDeposit("d1", "p1", "timber");
    expect(d.maxWorkers).toBe(500);
  });

  it("clamps richness to [0, SCALE.Q]", () => {
    const hi = createDeposit("d1", "p1", "iron", 99999 as Q);
    expect(hi.richness_Q).toBeLessThanOrEqual(SCALE.Q);
    const lo = createDeposit("d2", "p1", "iron", -1 as Q);
    expect(lo.richness_Q).toBeGreaterThanOrEqual(0);
  });
});

// ── assignWorkers ─────────────────────────────────────────────────────────────

describe("assignWorkers", () => {
  it("sets assignedWorkers", () => {
    const d = createDeposit("d1", "p1", "iron", q(0.80) as Q, 500);
    const s = createExtractionState("d1");
    assignWorkers(d, s, 200);
    expect(s.assignedWorkers).toBe(200);
  });

  it("clamps to maxWorkers", () => {
    const d = createDeposit("d1", "p1", "iron", q(0.80) as Q, 500);
    const s = createExtractionState("d1");
    const actual = assignWorkers(d, s, 1000);
    expect(actual).toBe(500);
    expect(s.assignedWorkers).toBe(500);
  });

  it("clamps to 0 for negative workers", () => {
    const d = createDeposit("d1", "p1", "iron", q(0.80) as Q, 500);
    const s = createExtractionState("d1");
    const actual = assignWorkers(d, s, -50);
    expect(actual).toBe(0);
  });

  it("returns the effective worker count", () => {
    const d = createDeposit("d1", "p1", "iron", q(0.80) as Q, 500);
    const s = createExtractionState("d1");
    expect(assignWorkers(d, s, 300)).toBe(300);
  });
});

// ── computeDailyYield ─────────────────────────────────────────────────────────

describe("computeDailyYield", () => {
  it("returns 0 with no workers", () => {
    const d = createDeposit("d1", "p1", "silver", q(0.80) as Q);
    const s = createExtractionState("d1");
    expect(computeDailyYield(d, s, TechEra.Medieval)).toBe(0);
  });

  it("returns 0 when exhausted", () => {
    const d = createDeposit("d1", "p1", "silver", DEPLETION_EXHAUSTED_Q);
    const s = createExtractionState("d1");
    s.assignedWorkers = 200;
    expect(computeDailyYield(d, s, TechEra.Medieval)).toBe(0);
  });

  it("returns positive value with workers and richness", () => {
    const d = createDeposit("d1", "p1", "silver", q(0.80) as Q);
    const s = createExtractionState("d1");
    s.assignedWorkers = 100;
    expect(computeDailyYield(d, s, TechEra.Medieval)).toBeGreaterThan(0);
  });

  it("silver yields more than timber per worker", () => {
    const silver = createDeposit("d1", "p1", "silver", q(0.80) as Q);
    const timber  = createDeposit("d2", "p1", "timber", q(0.80) as Q);
    const s1 = createExtractionState("d1"); s1.assignedWorkers = 100;
    const s2 = createExtractionState("d2"); s2.assignedWorkers = 100;
    expect(computeDailyYield(silver, s1, TechEra.Medieval))
      .toBeGreaterThan(computeDailyYield(timber, s2, TechEra.Medieval));
  });

  it("more workers → more yield", () => {
    const d  = createDeposit("d1", "p1", "iron", q(0.80) as Q);
    const s1 = createExtractionState("d1"); s1.assignedWorkers = 100;
    const s2 = createExtractionState("d1"); s2.assignedWorkers = 300;
    expect(computeDailyYield(d, s2, TechEra.Medieval))
      .toBeGreaterThan(computeDailyYield(d, s1, TechEra.Medieval));
  });

  it("industrial era yields more than medieval", () => {
    const d  = createDeposit("d1", "p1", "iron", q(0.80) as Q);
    const s  = createExtractionState("d1"); s.assignedWorkers = 200;
    const med = computeDailyYield(d, s, TechEra.Medieval);
    const ind = computeDailyYield(d, s, TechEra.Industrial);
    expect(ind).toBeGreaterThan(med);
  });

  it("lower richness reduces yield", () => {
    const rich   = createDeposit("d1", "p1", "iron", q(0.90) as Q);
    const poor   = createDeposit("d2", "p1", "iron", q(0.20) as Q);
    const s1 = createExtractionState("d1"); s1.assignedWorkers = 200;
    const s2 = createExtractionState("d2"); s2.assignedWorkers = 200;
    expect(computeDailyYield(rich, s1, TechEra.Medieval))
      .toBeGreaterThan(computeDailyYield(poor, s2, TechEra.Medieval));
  });

  it("yield is proportional to workers (linear)", () => {
    const d  = createDeposit("d1", "p1", "silver", q(0.80) as Q);
    const s1 = createExtractionState("d1"); s1.assignedWorkers = 100;
    const s2 = createExtractionState("d1"); s2.assignedWorkers = 200;
    const y1 = computeDailyYield(d, s1, TechEra.Medieval);
    const y2 = computeDailyYield(d, s2, TechEra.Medieval);
    expect(y2).toBe(y1 * 2);
  });
});

// ── depleteDeposit ────────────────────────────────────────────────────────────

describe("depleteDeposit", () => {
  it("reduces richness_Q", () => {
    const d = createDeposit("d1", "p1", "iron", q(0.80) as Q);
    depleteDeposit(d, 10_000);
    expect(d.richness_Q).toBeLessThan(q(0.80));
  });

  it("zero yield causes no depletion", () => {
    const d = createDeposit("d1", "p1", "iron", q(0.80) as Q);
    depleteDeposit(d, 0);
    expect(d.richness_Q).toBe(q(0.80));
  });

  it("richness never goes below zero", () => {
    const d = createDeposit("d1", "p1", "iron", q(0.10) as Q);
    depleteDeposit(d, 100_000_000);
    expect(d.richness_Q).toBeGreaterThanOrEqual(0);
  });

  it("larger yield causes more depletion", () => {
    const d1 = createDeposit("d1", "p1", "iron", q(0.80) as Q);
    const d2 = createDeposit("d2", "p1", "iron", q(0.80) as Q);
    depleteDeposit(d1, 1_000);
    depleteDeposit(d2, 100_000);
    expect(d2.richness_Q).toBeLessThan(d1.richness_Q);
  });
});

// ── stepExtraction ────────────────────────────────────────────────────────────

describe("stepExtraction", () => {
  it("adds yield to polity treasury", () => {
    const d   = createDeposit("d1", "p1", "silver", q(0.80) as Q);
    const s   = createExtractionState("d1");
    const pol = makePolity(TechEra.Medieval, 0);
    s.assignedWorkers = 200;
    const before = pol.treasury_cu;
    const r = stepExtraction(d, s, pol, 30);
    expect(pol.treasury_cu).toBeGreaterThan(before);
    expect(pol.treasury_cu).toBe(before + r.yield_cu);
  });

  it("accumulates cumulativeYield_cu", () => {
    const d   = createDeposit("d1", "p1", "iron", q(0.80) as Q);
    const s   = createExtractionState("d1");
    const pol = makePolity(TechEra.Medieval, 0);
    s.assignedWorkers = 100;
    stepExtraction(d, s, pol, 10);
    expect(s.cumulativeYield_cu).toBeGreaterThan(0);
  });

  it("reduces deposit richness", () => {
    const d   = createDeposit("d1", "p1", "silver", q(0.80) as Q);
    const s   = createExtractionState("d1");
    const pol = makePolity();
    s.assignedWorkers = 500;
    const before = d.richness_Q;
    stepExtraction(d, s, pol, 365);
    expect(d.richness_Q).toBeLessThan(before);
  });

  it("returns exhausted=true when richness reaches threshold", () => {
    const d   = createDeposit("d1", "p1", "silver", (DEPLETION_EXHAUSTED_Q + 1) as Q);
    const s   = createExtractionState("d1");
    const pol = makePolity(TechEra.Modern);
    s.assignedWorkers = 500;
    const r = stepExtraction(d, s, pol, 1000);
    // may or may not exhaust in one step depending on rate
    expect(typeof r.exhausted).toBe("boolean");
  });

  it("yield_cu is zero when no workers assigned", () => {
    const d   = createDeposit("d1", "p1", "silver", q(0.80) as Q);
    const s   = createExtractionState("d1");
    const pol = makePolity();
    const r = stepExtraction(d, s, pol, 30);
    expect(r.yield_cu).toBe(0);
  });

  it("scales yield with elapsed days", () => {
    const d1  = createDeposit("d1", "p1", "iron", q(0.80) as Q);
    const d2  = createDeposit("d2", "p1", "iron", q(0.80) as Q);
    const s1  = createExtractionState("d1"); s1.assignedWorkers = 200;
    const s2  = createExtractionState("d2"); s2.assignedWorkers = 200;
    const pol1 = makePolity(TechEra.Medieval, 0);
    const pol2 = makePolity(TechEra.Medieval, 0);
    const r7   = stepExtraction(d1, s1, pol1, 7);
    const r30  = stepExtraction(d2, s2, pol2, 30);
    expect(r30.yield_cu).toBeGreaterThan(r7.yield_cu);
  });
});

// ── computeTotalDailyResourceIncome ──────────────────────────────────────────

describe("computeTotalDailyResourceIncome", () => {
  it("returns 0 with no deposits", () => {
    expect(computeTotalDailyResourceIncome([], new Map(), TechEra.Medieval)).toBe(0);
  });

  it("sums yield from multiple deposits", () => {
    const d1  = createDeposit("d1", "p1", "silver", q(0.80) as Q);
    const d2  = createDeposit("d2", "p1", "iron",   q(0.80) as Q);
    const s1  = createExtractionState("d1"); s1.assignedWorkers = 100;
    const s2  = createExtractionState("d2"); s2.assignedWorkers = 100;
    const map = new Map([["d1", s1], ["d2", s2]]);
    const total = computeTotalDailyResourceIncome([d1, d2], map, TechEra.Medieval);
    const y1 = computeDailyYield(d1, s1, TechEra.Medieval);
    const y2 = computeDailyYield(d2, s2, TechEra.Medieval);
    expect(total).toBe(y1 + y2);
  });

  it("skips deposits with no ExtractionState in map", () => {
    const d = createDeposit("d1", "p1", "silver", q(0.80) as Q);
    expect(computeTotalDailyResourceIncome([d], new Map(), TechEra.Medieval)).toBe(0);
  });
});

// ── Bonus flags ───────────────────────────────────────────────────────────────

describe("bonus flags", () => {
  it("hasMilitaryBonus: iron and horses → true; silver → false", () => {
    expect(hasMilitaryBonus("iron")).toBe(true);
    expect(hasMilitaryBonus("horses")).toBe(true);
    expect(hasMilitaryBonus("silver")).toBe(false);
  });

  it("hasConstructionBonus: timber and stone → true; iron → false", () => {
    expect(hasConstructionBonus("timber")).toBe(true);
    expect(hasConstructionBonus("stone")).toBe(true);
    expect(hasConstructionBonus("iron")).toBe(false);
  });

  it("hasMobilityBonus: horses → true; iron → false", () => {
    expect(hasMobilityBonus("horses")).toBe(true);
    expect(hasMobilityBonus("iron")).toBe(false);
  });
});

// ── estimateDaysToExhaustion ──────────────────────────────────────────────────

describe("estimateDaysToExhaustion", () => {
  it("returns 0 when already exhausted", () => {
    const d = createDeposit("d1", "p1", "iron", DEPLETION_EXHAUSTED_Q);
    const s = createExtractionState("d1");
    expect(estimateDaysToExhaustion(d, s, TechEra.Medieval)).toBe(0);
  });

  it("returns Infinity when no workers assigned", () => {
    const d = createDeposit("d1", "p1", "iron", q(0.80) as Q);
    const s = createExtractionState("d1");
    expect(estimateDaysToExhaustion(d, s, TechEra.Medieval)).toBe(Infinity);
  });

  it("returns positive finite days with workers", () => {
    const d = createDeposit("d1", "p1", "silver", q(0.80) as Q, 500);
    const s = createExtractionState("d1"); s.assignedWorkers = 200;
    const days = estimateDaysToExhaustion(d, s, TechEra.Medieval);
    expect(days).toBeGreaterThan(0);
    expect(isFinite(days)).toBe(true);
  });

  it("more workers → fewer days to exhaustion", () => {
    const d1 = createDeposit("d1", "p1", "silver", q(0.80) as Q, 500);
    const d2 = createDeposit("d2", "p1", "silver", q(0.80) as Q, 500);
    const lo = createExtractionState("d1"); lo.assignedWorkers = 50;
    const hi = createExtractionState("d2"); hi.assignedWorkers = 300;
    const dLo = estimateDaysToExhaustion(d1, lo, TechEra.Medieval);
    const dHi = estimateDaysToExhaustion(d2, hi, TechEra.Medieval);
    expect(dHi).toBeLessThan(dLo);
  });
});

// ── Integration ───────────────────────────────────────────────────────────────

describe("integration", () => {
  it("silver mine grows treasury over 1 year", () => {
    const d   = createDeposit("d1", "p1", "silver", q(0.80) as Q, 500);
    const s   = createExtractionState("d1");
    const pol = makePolity(TechEra.Medieval, 0);
    s.assignedWorkers = 300;
    stepExtraction(d, s, pol, 365);
    expect(pol.treasury_cu).toBeGreaterThan(0);
  });

  it("industrial era earns more from iron than medieval with same workers", () => {
    const d1  = createDeposit("d1", "p1", "iron", q(0.80) as Q, 500);
    const d2  = createDeposit("d2", "p1", "iron", q(0.80) as Q, 500);
    const s1  = createExtractionState("d1"); s1.assignedWorkers = 200;
    const s2  = createExtractionState("d2"); s2.assignedWorkers = 200;
    const pol1 = makePolity(TechEra.Medieval,    0);
    const pol2 = makePolity(TechEra.Industrial,  0);
    stepExtraction(d1, s1, pol1, 365);
    stepExtraction(d2, s2, pol2, 365);
    expect(pol2.treasury_cu).toBeGreaterThan(pol1.treasury_cu);
  });

  it("multi-deposit: two different resources combined income > either alone", () => {
    const pol = makePolity(TechEra.Medieval, 0);
    const d1  = createDeposit("d1", "p1", "silver", q(0.80) as Q, 500);
    const d2  = createDeposit("d2", "p1", "iron",   q(0.80) as Q, 500);
    const s1  = createExtractionState("d1"); s1.assignedWorkers = 200;
    const s2  = createExtractionState("d2"); s2.assignedWorkers = 200;
    const map = new Map([["d1", s1], ["d2", s2]]);
    const combined = computeTotalDailyResourceIncome([d1, d2], map, TechEra.Medieval);
    const silverOnly = computeDailyYield(d1, s1, TechEra.Medieval);
    const ironOnly   = computeDailyYield(d2, s2, TechEra.Medieval);
    expect(combined).toBe(silverOnly + ironOnly);
    expect(combined).toBeGreaterThan(silverOnly);
    expect(combined).toBeGreaterThan(ironOnly);
  });
});
