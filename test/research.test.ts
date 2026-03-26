// test/research.test.ts — Phase 91: Technology Research

import { describe, it, expect } from "vitest";
import {
  RESEARCH_POP_DIVISOR,
  RESEARCH_COST_PER_POINT,
  KNOWLEDGE_DIFFUSION_RATE_Q,
  RESEARCH_POINTS_REQUIRED,
  createResearchState,
  pointsRequiredForNextEra,
  computeDailyResearchPoints,
  stepResearch,
  investInResearch,
  computeKnowledgeDiffusion,
  computeResearchProgress_Q,
  estimateDaysToNextEra,
} from "../src/research.js";
import { createPolity } from "../src/polity.js";
import { TechEra } from "../src/sim/tech.js";
import { q, SCALE } from "../src/units.js";
import type { Q } from "../src/units.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePolity(
  era: number = TechEra.Medieval,
  population = 100_000,
  stabilityQ: Q = q(0.80) as Q,
  treasury = 500_000,
) {
  const p = createPolity("p1", "Test", "f1", [], 50_000, treasury, "Medieval");
  p.techEra    = era as typeof TechEra[keyof typeof TechEra];
  p.population = population;
  p.stabilityQ = stabilityQ;
  return p;
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("RESEARCH_POP_DIVISOR is 5000", () => {
    expect(RESEARCH_POP_DIVISOR).toBe(5_000);
  });

  it("RESEARCH_COST_PER_POINT is 10", () => {
    expect(RESEARCH_COST_PER_POINT).toBe(10);
  });

  it("KNOWLEDGE_DIFFUSION_RATE_Q is q(0.10)", () => {
    expect(KNOWLEDGE_DIFFUSION_RATE_Q).toBe(q(0.10));
  });

  it("RESEARCH_POINTS_REQUIRED has correct Prehistoric threshold", () => {
    expect(RESEARCH_POINTS_REQUIRED[TechEra.Prehistoric]).toBe(2_000);
  });

  it("RESEARCH_POINTS_REQUIRED has correct Ancient threshold", () => {
    expect(RESEARCH_POINTS_REQUIRED[TechEra.Ancient]).toBe(8_000);
  });

  it("RESEARCH_POINTS_REQUIRED has correct Medieval threshold", () => {
    expect(RESEARCH_POINTS_REQUIRED[TechEra.Medieval]).toBe(30_000);
  });

  it("RESEARCH_POINTS_REQUIRED has correct EarlyModern threshold", () => {
    expect(RESEARCH_POINTS_REQUIRED[TechEra.EarlyModern]).toBe(80_000);
  });

  it("RESEARCH_POINTS_REQUIRED has correct Industrial threshold", () => {
    expect(RESEARCH_POINTS_REQUIRED[TechEra.Industrial]).toBe(200_000);
  });

  it("RESEARCH_POINTS_REQUIRED has correct Modern threshold", () => {
    expect(RESEARCH_POINTS_REQUIRED[TechEra.Modern]).toBe(500_000);
  });

  it("RESEARCH_POINTS_REQUIRED has correct NearFuture threshold", () => {
    expect(RESEARCH_POINTS_REQUIRED[TechEra.NearFuture]).toBe(1_500_000);
  });

  it("RESEARCH_POINTS_REQUIRED has correct FarFuture threshold", () => {
    expect(RESEARCH_POINTS_REQUIRED[TechEra.FarFuture]).toBe(5_000_000);
  });

  it("RESEARCH_POINTS_REQUIRED has no entry for DeepSpace", () => {
    expect(RESEARCH_POINTS_REQUIRED[TechEra.DeepSpace]).toBeUndefined();
  });
});

// ── createResearchState ───────────────────────────────────────────────────────

describe("createResearchState", () => {
  it("returns zero progress", () => {
    const s = createResearchState("pol_1");
    expect(s.progress).toBe(0);
  });

  it("stores polityId", () => {
    const s = createResearchState("pol_42");
    expect(s.polityId).toBe("pol_42");
  });
});

// ── pointsRequiredForNextEra ──────────────────────────────────────────────────

describe("pointsRequiredForNextEra", () => {
  it("returns correct value at Medieval era", () => {
    const p = makePolity(TechEra.Medieval);
    expect(pointsRequiredForNextEra(p)).toBe(30_000);
  });

  it("returns correct value at Prehistoric era", () => {
    const p = makePolity(TechEra.Prehistoric);
    expect(pointsRequiredForNextEra(p)).toBe(2_000);
  });

  it("returns Infinity at DeepSpace (max era)", () => {
    const p = makePolity(TechEra.DeepSpace);
    expect(pointsRequiredForNextEra(p)).toBe(Infinity);
  });
});

// ── computeDailyResearchPoints ────────────────────────────────────────────────

describe("computeDailyResearchPoints", () => {
  it("minimum 1 point even for tiny population", () => {
    const p = makePolity(TechEra.Medieval, 100, q(0.0) as Q);
    expect(computeDailyResearchPoints(p)).toBeGreaterThanOrEqual(1);
  });

  it("scales with population", () => {
    const small = makePolity(TechEra.Medieval, 10_000, q(0.80) as Q);
    const large = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    expect(computeDailyResearchPoints(large)).toBeGreaterThan(computeDailyResearchPoints(small));
  });

  it("scales with stability", () => {
    const low  = makePolity(TechEra.Medieval, 100_000, q(0.20) as Q);
    const high = makePolity(TechEra.Medieval, 100_000, q(0.90) as Q);
    expect(computeDailyResearchPoints(high)).toBeGreaterThan(computeDailyResearchPoints(low));
  });

  it("stability q(1.0) gives double the rate of stability q(0.0) for same population", () => {
    const lo = makePolity(TechEra.Medieval, 50_000, 0 as Q);
    const hi = makePolity(TechEra.Medieval, 50_000, SCALE.Q as Q);
    // stabilityFactor at q(0) = 5000, at q(1.0) = 10000 — exactly 2×
    expect(computeDailyResearchPoints(hi)).toBe(computeDailyResearchPoints(lo) * 2);
  });

  it("bonus points are added directly", () => {
    const p    = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const base = computeDailyResearchPoints(p, 0);
    expect(computeDailyResearchPoints(p, 50)).toBe(base + 50);
  });

  it("100k population at q(0.80) stability gives reasonable daily rate", () => {
    const p = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const d = computeDailyResearchPoints(p);
    // baseUnits = floor(100000/5000) = 20
    // stabilityFactor = 5000 + round(5000 × 8000 / 10000) = 5000 + 4000 = 9000
    // dailyPoints = round(20 × 9000 / 10000) = round(18) = 18
    expect(d).toBe(18);
  });
});

// ── stepResearch ──────────────────────────────────────────────────────────────

describe("stepResearch", () => {
  it("adds correct points over elapsed days", () => {
    const p = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const s = createResearchState("p1");
    const daily = computeDailyResearchPoints(p);
    stepResearch(p, s, 10);
    expect(s.progress).toBe(daily * 10);
  });

  it("returns pointsGained matching daily × elapsedDays", () => {
    const p = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const s = createResearchState("p1");
    const daily = computeDailyResearchPoints(p);
    const r = stepResearch(p, s, 7);
    expect(r.pointsGained).toBe(daily * 7);
  });

  it("no advancement before threshold — advanced=false", () => {
    const p = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const s = createResearchState("p1");
    const r = stepResearch(p, s, 1);
    expect(r.advanced).toBe(false);
    expect(r.newEra).toBeUndefined();
  });

  it("era advances when progress meets threshold", () => {
    const p = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const s = createResearchState("p1");
    s.progress = RESEARCH_POINTS_REQUIRED[TechEra.Medieval] - 1;
    const r = stepResearch(p, s, 1);  // 18 pts added → crosses 30000
    expect(r.advanced).toBe(true);
    expect(r.newEra).toBe(TechEra.EarlyModern);
    expect(p.techEra).toBe(TechEra.EarlyModern);
  });

  it("surplus progress carries over after era advancement", () => {
    const p = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const s = createResearchState("p1");
    const required = RESEARCH_POINTS_REQUIRED[TechEra.Medieval];
    s.progress = required - 5;  // 5 short
    const daily = computeDailyResearchPoints(p);  // 18
    stepResearch(p, s, 1);
    // 18 added → progress = required + 13 → after advancement: progress = 13
    expect(s.progress).toBe(daily - 5);
  });

  it("no advancement at DeepSpace (max era) — no-op", () => {
    const p = makePolity(TechEra.DeepSpace, 100_000, q(0.80) as Q);
    const s = createResearchState("p1");
    s.progress = 999_999_999;
    const eraBefore = p.techEra;
    const r = stepResearch(p, s, 365);
    expect(r.advanced).toBe(false);
    expect(p.techEra).toBe(eraBefore);
  });

  it("DeepSpace: progress still accumulates", () => {
    const p = makePolity(TechEra.DeepSpace, 100_000, q(0.80) as Q);
    const s = createResearchState("p1");
    const before = s.progress;
    const daily  = computeDailyResearchPoints(p);
    stepResearch(p, s, 10);
    expect(s.progress).toBe(before + daily * 10);
  });

  it("bonus points passed through to daily rate", () => {
    const p = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const s1 = createResearchState("p1");
    const s2 = createResearchState("p1");
    stepResearch(p, s1, 5, 0);
    stepResearch(p, s2, 5, 10);
    expect(s2.progress).toBe(s1.progress + 10 * 5);
  });
});

// ── investInResearch ──────────────────────────────────────────────────────────

describe("investInResearch", () => {
  it("returns correct number of points", () => {
    const p = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 1_000);
    const s = createResearchState("p1");
    const pts = investInResearch(p, s, 500);
    expect(pts).toBe(50);  // 500 / 10
  });

  it("adds points to state.progress", () => {
    const p = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 1_000);
    const s = createResearchState("p1");
    investInResearch(p, s, 300);
    expect(s.progress).toBe(30);
  });

  it("drains treasury", () => {
    const p = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 1_000);
    const s = createResearchState("p1");
    investInResearch(p, s, 400);
    expect(p.treasury_cu).toBe(600);
  });

  it("caps investment at available treasury", () => {
    const p = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 200);
    const s = createResearchState("p1");
    const pts = investInResearch(p, s, 1_000);
    expect(pts).toBe(20);         // only 200 cu available
    expect(p.treasury_cu).toBe(0);
    expect(s.progress).toBe(20);
  });

  it("no-op when treasury is zero", () => {
    const p = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 0);
    const s = createResearchState("p1");
    const pts = investInResearch(p, s, 500);
    expect(pts).toBe(0);
    expect(s.progress).toBe(0);
  });

  it("floors partial points (10 cu = 1 point; 15 cu = 1 point, not 1.5)", () => {
    const p = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 15);
    const s = createResearchState("p1");
    const pts = investInResearch(p, s, 15);
    expect(pts).toBe(1);
  });
});

// ── computeKnowledgeDiffusion ─────────────────────────────────────────────────

describe("computeKnowledgeDiffusion", () => {
  it("returns 0 when same era", () => {
    const src = makePolity(TechEra.Medieval);
    const tgt = makePolity(TechEra.Medieval);
    expect(computeKnowledgeDiffusion(src, tgt, q(1.0) as Q)).toBe(0);
  });

  it("returns 0 when source is less advanced than target", () => {
    const src = makePolity(TechEra.Ancient);
    const tgt = makePolity(TechEra.Medieval);
    expect(computeKnowledgeDiffusion(src, tgt, q(1.0) as Q)).toBe(0);
  });

  it("returns positive value when source is more advanced", () => {
    const src = makePolity(TechEra.EarlyModern);
    const tgt = makePolity(TechEra.Medieval);
    const d = computeKnowledgeDiffusion(src, tgt, q(0.50) as Q);
    expect(d).toBeGreaterThan(0);
  });

  it("scales with contact intensity — higher contact = more diffusion", () => {
    const src = makePolity(TechEra.EarlyModern);
    const lo  = makePolity(TechEra.Medieval);
    const hi  = makePolity(TechEra.Medieval);
    const dLo = computeKnowledgeDiffusion(src, lo, q(0.20) as Q);
    const dHi = computeKnowledgeDiffusion(src, hi, q(0.80) as Q);
    expect(dHi).toBeGreaterThan(dLo);
  });

  it("scales with era difference — larger gap = more diffusion", () => {
    const src    = makePolity(TechEra.Industrial);
    const tgt1   = makePolity(TechEra.EarlyModern);  // 1 era gap
    const tgt2   = makePolity(TechEra.Medieval);      // 2 era gap
    const d1 = computeKnowledgeDiffusion(src, tgt1, q(0.50) as Q);
    const d2 = computeKnowledgeDiffusion(src, tgt2, q(0.50) as Q);
    expect(d2).toBeGreaterThan(d1);
  });

  it("zero contact intensity gives zero diffusion", () => {
    const src = makePolity(TechEra.EarlyModern);
    const tgt = makePolity(TechEra.Medieval);
    expect(computeKnowledgeDiffusion(src, tgt, 0 as Q)).toBe(0);
  });

  it("returns non-negative result", () => {
    const src = makePolity(TechEra.EarlyModern);
    const tgt = makePolity(TechEra.Medieval);
    expect(computeKnowledgeDiffusion(src, tgt, q(0.50) as Q)).toBeGreaterThanOrEqual(0);
  });
});

// ── computeResearchProgress_Q ─────────────────────────────────────────────────

describe("computeResearchProgress_Q", () => {
  it("returns 0 when progress is 0", () => {
    const p = makePolity(TechEra.Medieval);
    const s = createResearchState("p1");
    expect(computeResearchProgress_Q(p, s)).toBe(0);
  });

  it("returns SCALE.Q when progress meets required", () => {
    const p = makePolity(TechEra.Medieval);
    const s = createResearchState("p1");
    s.progress = RESEARCH_POINTS_REQUIRED[TechEra.Medieval];
    expect(computeResearchProgress_Q(p, s)).toBe(SCALE.Q);
  });

  it("returns SCALE.Q at DeepSpace (max era)", () => {
    const p = makePolity(TechEra.DeepSpace);
    const s = createResearchState("p1");
    expect(computeResearchProgress_Q(p, s)).toBe(SCALE.Q);
  });

  it("returns approx half at half progress", () => {
    const p        = makePolity(TechEra.Medieval);
    const s        = createResearchState("p1");
    const required = RESEARCH_POINTS_REQUIRED[TechEra.Medieval];
    s.progress     = Math.floor(required / 2);
    const pct      = computeResearchProgress_Q(p, s);
    expect(pct).toBeGreaterThanOrEqual(q(0.49));
    expect(pct).toBeLessThanOrEqual(q(0.51));
  });

  it("is clamped to [0, SCALE.Q]", () => {
    const p = makePolity(TechEra.Medieval);
    const s = createResearchState("p1");
    s.progress = 9_999_999;
    const pct = computeResearchProgress_Q(p, s);
    expect(pct).toBeLessThanOrEqual(SCALE.Q);
    expect(pct).toBeGreaterThanOrEqual(0);
  });
});

// ── estimateDaysToNextEra ─────────────────────────────────────────────────────

describe("estimateDaysToNextEra", () => {
  it("returns Infinity at DeepSpace", () => {
    const p = makePolity(TechEra.DeepSpace);
    const s = createResearchState("p1");
    expect(estimateDaysToNextEra(p, s)).toBe(Infinity);
  });

  it("returns ceil(remaining / daily)", () => {
    const p        = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const s        = createResearchState("p1");
    const daily    = computeDailyResearchPoints(p);
    const required = RESEARCH_POINTS_REQUIRED[TechEra.Medieval];
    const days     = estimateDaysToNextEra(p, s);
    expect(days).toBe(Math.ceil(required / daily));
  });

  it("accounts for existing progress", () => {
    const p        = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const s        = createResearchState("p1");
    const daily    = computeDailyResearchPoints(p);
    const required = RESEARCH_POINTS_REQUIRED[TechEra.Medieval];
    s.progress     = 10_000;
    const days     = estimateDaysToNextEra(p, s);
    expect(days).toBe(Math.ceil((required - 10_000) / daily));
  });

  it("returns 0 days when already at threshold", () => {
    const p = makePolity(TechEra.Medieval);
    const s = createResearchState("p1");
    s.progress = RESEARCH_POINTS_REQUIRED[TechEra.Medieval];
    expect(estimateDaysToNextEra(p, s)).toBe(0);
  });

  it("bonus points reduce days to next era", () => {
    const p      = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const s      = createResearchState("p1");
    const noBonus = estimateDaysToNextEra(p, s, 0);
    const bonus   = estimateDaysToNextEra(p, s, 50);
    expect(bonus).toBeLessThan(noBonus);
  });
});

// ── Integration ───────────────────────────────────────────────────────────────

describe("integration", () => {
  it("advancing through multiple eras from Prehistoric to Ancient", () => {
    const p    = makePolity(TechEra.Prehistoric, 50_000, SCALE.Q as Q);
    const s    = createResearchState("p1");
    const days = estimateDaysToNextEra(p, s);
    const r    = stepResearch(p, s, days);
    expect(r.advanced).toBe(true);
    expect(p.techEra).toBe(TechEra.Ancient);
  });

  it("treasury investment shortens time to next era", () => {
    const p       = makePolity(TechEra.Medieval, 10_000, q(0.80) as Q, 500_000);
    const s       = createResearchState("p1");
    const daysBefore = estimateDaysToNextEra(p, s);
    investInResearch(p, s, 200_000);  // adds 20000 points
    const daysAfter  = estimateDaysToNextEra(p, s);
    expect(daysAfter).toBeLessThan(daysBefore);
  });

  it("knowledge diffusion bonus reduces days to next era", () => {
    const src    = makePolity(TechEra.Industrial, 200_000, SCALE.Q as Q);
    const tgt    = makePolity(TechEra.Medieval,   50_000,  q(0.80) as Q);
    const s      = createResearchState("p1");
    const bonus  = computeKnowledgeDiffusion(src, tgt, q(0.50) as Q);
    const noBonus = estimateDaysToNextEra(tgt, s, 0);
    const withBonus = estimateDaysToNextEra(tgt, s, bonus);
    expect(withBonus).toBeLessThan(noBonus);
  });
});
