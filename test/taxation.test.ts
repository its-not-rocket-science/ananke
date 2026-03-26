// test/taxation.test.ts — Phase 92: Taxation & Treasury Revenue

import { describe, it, expect } from "vitest";
import {
  TAX_REVENUE_PER_CAPITA_ANNUAL,
  OPTIMAL_TAX_RATE_Q,
  MAX_TAX_RATE_Q,
  MAX_TAX_UNREST_Q,
  createTaxPolicy,
  computeAnnualTaxRevenue,
  computeDailyTaxRevenue,
  computeTaxUnrestPressure,
  stepTaxCollection,
  estimateDaysToTreasuryTarget,
  computeRequiredTaxRate,
} from "../src/taxation.js";
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
  it("OPTIMAL_TAX_RATE_Q is q(0.15)", () => {
    expect(OPTIMAL_TAX_RATE_Q).toBe(q(0.15));
  });

  it("MAX_TAX_RATE_Q is q(0.50)", () => {
    expect(MAX_TAX_RATE_Q).toBe(q(0.50));
  });

  it("MAX_TAX_UNREST_Q is q(0.30)", () => {
    expect(MAX_TAX_UNREST_Q).toBe(q(0.30));
  });

  it("Prehistoric era has zero per-capita yield", () => {
    expect(TAX_REVENUE_PER_CAPITA_ANNUAL[TechEra.Prehistoric]).toBe(0);
  });

  it("Medieval era has positive per-capita yield", () => {
    expect(TAX_REVENUE_PER_CAPITA_ANNUAL[TechEra.Medieval]).toBeGreaterThan(0);
  });

  it("per-capita yield increases with tech era", () => {
    expect(TAX_REVENUE_PER_CAPITA_ANNUAL[TechEra.Industrial])
      .toBeGreaterThan(TAX_REVENUE_PER_CAPITA_ANNUAL[TechEra.Medieval]);
    expect(TAX_REVENUE_PER_CAPITA_ANNUAL[TechEra.Modern])
      .toBeGreaterThan(TAX_REVENUE_PER_CAPITA_ANNUAL[TechEra.Industrial]);
  });
});

// ── createTaxPolicy ───────────────────────────────────────────────────────────

describe("createTaxPolicy", () => {
  it("stores polityId", () => {
    const p = createTaxPolicy("pol_1");
    expect(p.polityId).toBe("pol_1");
  });

  it("defaults to q(0.15) standard rate", () => {
    const p = createTaxPolicy("pol_1");
    expect(p.taxRate_Q).toBe(q(0.15));
  });

  it("accepts custom tax rate", () => {
    const p = createTaxPolicy("pol_1", q(0.20) as Q);
    expect(p.taxRate_Q).toBe(q(0.20));
  });

  it("exemptFraction_Q is undefined by default", () => {
    const p = createTaxPolicy("pol_1");
    expect(p.exemptFraction_Q).toBeUndefined();
  });
});

// ── computeAnnualTaxRevenue ───────────────────────────────────────────────────

describe("computeAnnualTaxRevenue", () => {
  it("Prehistoric era always returns 0", () => {
    const pol = makePolity(TechEra.Prehistoric);
    const policy = createTaxPolicy("p1");
    expect(computeAnnualTaxRevenue(pol, policy)).toBe(0);
  });

  it("returns positive revenue at Medieval era", () => {
    const pol    = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const policy = createTaxPolicy("p1", q(0.15) as Q);
    expect(computeAnnualTaxRevenue(pol, policy)).toBeGreaterThan(0);
  });

  it("scales linearly with population", () => {
    const pol1   = makePolity(TechEra.Medieval, 50_000,  q(0.80) as Q);
    const pol2   = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const policy = createTaxPolicy("p1", q(0.15) as Q);
    // Should be roughly 2× — within rounding
    const r1 = computeAnnualTaxRevenue(pol1, policy);
    const r2 = computeAnnualTaxRevenue(pol2, policy);
    expect(r2).toBeCloseTo(r1 * 2, -1);
  });

  it("scales with tax rate", () => {
    const pol    = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const low    = createTaxPolicy("p1", q(0.10) as Q);
    const high   = createTaxPolicy("p1", q(0.30) as Q);
    expect(computeAnnualTaxRevenue(pol, high)).toBeGreaterThan(computeAnnualTaxRevenue(pol, low));
  });

  it("lower stability reduces revenue", () => {
    const stable   = makePolity(TechEra.Medieval, 100_000, q(0.90) as Q);
    const unstable = makePolity(TechEra.Medieval, 100_000, q(0.20) as Q);
    const policy   = createTaxPolicy("p1", q(0.15) as Q);
    expect(computeAnnualTaxRevenue(stable, policy)).toBeGreaterThan(computeAnnualTaxRevenue(unstable, policy));
  });

  it("zero stability gives roughly half revenue vs full stability", () => {
    const lo = makePolity(TechEra.Medieval, 100_000, 0 as Q);
    const hi = makePolity(TechEra.Medieval, 100_000, SCALE.Q as Q);
    const policy = createTaxPolicy("p1", q(0.15) as Q);
    const rLo = computeAnnualTaxRevenue(lo, policy);
    const rHi = computeAnnualTaxRevenue(hi, policy);
    // stabilityMul: 5000 vs 10000 — exactly 2×
    expect(rHi).toBe(rLo * 2);
  });

  it("exempt fraction reduces taxable base", () => {
    const pol     = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const full    = createTaxPolicy("p1", q(0.15) as Q);
    const exempt  = { ...createTaxPolicy("p1", q(0.15) as Q), exemptFraction_Q: q(0.50) as Q };
    const rFull   = computeAnnualTaxRevenue(pol, full);
    const rExempt = computeAnnualTaxRevenue(pol, exempt);
    expect(rExempt).toBeCloseTo(rFull / 2, -1);
  });

  it("full exemption gives zero revenue", () => {
    const pol    = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const policy = { ...createTaxPolicy("p1", q(0.15) as Q), exemptFraction_Q: SCALE.Q as Q };
    expect(computeAnnualTaxRevenue(pol, policy)).toBe(0);
  });

  it("modern era returns substantially more than medieval", () => {
    const med = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const mod = makePolity(TechEra.Modern,   100_000, q(0.80) as Q);
    const policy = createTaxPolicy("p1", q(0.15) as Q);
    expect(computeAnnualTaxRevenue(mod, policy)).toBeGreaterThan(computeAnnualTaxRevenue(med, policy) * 10);
  });
});

// ── computeDailyTaxRevenue ────────────────────────────────────────────────────

describe("computeDailyTaxRevenue", () => {
  it("Prehistoric returns 0", () => {
    const pol    = makePolity(TechEra.Prehistoric);
    const policy = createTaxPolicy("p1");
    expect(computeDailyTaxRevenue(pol, policy)).toBe(0);
  });

  it("daily ≈ annual / 365 (within 1 cu)", () => {
    const pol    = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const policy = createTaxPolicy("p1", q(0.15) as Q);
    const annual = computeAnnualTaxRevenue(pol, policy);
    const daily  = computeDailyTaxRevenue(pol, policy);
    expect(daily).toBeCloseTo(annual / 365, 0);
  });

  it("returns non-negative value", () => {
    const pol    = makePolity(TechEra.Medieval, 100_000, 0 as Q);
    const policy = createTaxPolicy("p1", q(0.15) as Q);
    expect(computeDailyTaxRevenue(pol, policy)).toBeGreaterThanOrEqual(0);
  });
});

// ── computeTaxUnrestPressure ──────────────────────────────────────────────────

describe("computeTaxUnrestPressure", () => {
  it("no pressure at or below OPTIMAL_TAX_RATE_Q", () => {
    const policy = createTaxPolicy("p1", OPTIMAL_TAX_RATE_Q);
    expect(computeTaxUnrestPressure(policy)).toBe(0);
  });

  it("no pressure below optimal rate", () => {
    const policy = createTaxPolicy("p1", q(0.05) as Q);
    expect(computeTaxUnrestPressure(policy)).toBe(0);
  });

  it("maximum pressure at MAX_TAX_RATE_Q", () => {
    const policy = createTaxPolicy("p1", MAX_TAX_RATE_Q);
    expect(computeTaxUnrestPressure(policy)).toBe(MAX_TAX_UNREST_Q);
  });

  it("maximum pressure above MAX_TAX_RATE_Q (clamped)", () => {
    const policy = createTaxPolicy("p1", SCALE.Q as Q);
    expect(computeTaxUnrestPressure(policy)).toBe(MAX_TAX_UNREST_Q);
  });

  it("pressure increases with tax rate", () => {
    const lo = createTaxPolicy("p1", q(0.20) as Q);
    const hi = createTaxPolicy("p1", q(0.35) as Q);
    expect(computeTaxUnrestPressure(hi)).toBeGreaterThan(computeTaxUnrestPressure(lo));
  });

  it("midpoint rate gives approximately half max pressure", () => {
    // midpoint between OPTIMAL(1500) and MAX(5000) = 3250
    const mid    = Math.round((OPTIMAL_TAX_RATE_Q + MAX_TAX_RATE_Q) / 2);
    const policy = createTaxPolicy("p1", mid as Q);
    const p      = computeTaxUnrestPressure(policy);
    expect(p).toBeGreaterThan(MAX_TAX_UNREST_Q * 0.40);
    expect(p).toBeLessThan(MAX_TAX_UNREST_Q * 0.65);
  });

  it("result is non-negative", () => {
    const policy = createTaxPolicy("p1", q(0.10) as Q);
    expect(computeTaxUnrestPressure(policy)).toBeGreaterThanOrEqual(0);
  });
});

// ── stepTaxCollection ─────────────────────────────────────────────────────────

describe("stepTaxCollection", () => {
  it("adds revenue to polity treasury", () => {
    const pol    = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 0);
    const policy = createTaxPolicy("p1", q(0.15) as Q);
    const before = pol.treasury_cu;
    const r      = stepTaxCollection(pol, policy, 30);
    expect(pol.treasury_cu).toBeGreaterThan(before);
    expect(pol.treasury_cu).toBe(before + r.revenue_cu);
  });

  it("revenue scales with elapsed days", () => {
    const pol1   = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 0);
    const pol2   = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 0);
    const policy = createTaxPolicy("p1", q(0.15) as Q);
    const r7     = stepTaxCollection(pol1, policy, 7);
    const r30    = stepTaxCollection(pol2, policy, 30);
    expect(r30.revenue_cu).toBeGreaterThan(r7.revenue_cu);
  });

  it("Prehistoric era adds zero revenue", () => {
    const pol    = makePolity(TechEra.Prehistoric, 100_000, q(0.80) as Q, 0);
    const policy = createTaxPolicy("p1", q(0.15) as Q);
    const r      = stepTaxCollection(pol, policy, 30);
    expect(r.revenue_cu).toBe(0);
    expect(pol.treasury_cu).toBe(0);
  });

  it("returns unrestPressure_Q from current tax rate", () => {
    const pol    = makePolity(TechEra.Medieval);
    const policy = createTaxPolicy("p1", q(0.40) as Q);  // above optimal
    const r      = stepTaxCollection(pol, policy, 1);
    expect(r.unrestPressure_Q).toBeGreaterThan(0);
  });

  it("low tax rate gives zero unrest pressure", () => {
    const pol    = makePolity(TechEra.Medieval);
    const policy = createTaxPolicy("p1", q(0.10) as Q);
    const r      = stepTaxCollection(pol, policy, 1);
    expect(r.unrestPressure_Q).toBe(0);
  });

  it("1-year collection approximates annual revenue", () => {
    const pol    = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 0);
    const policy = createTaxPolicy("p1", q(0.15) as Q);
    const annual = computeAnnualTaxRevenue(pol, policy);
    const r      = stepTaxCollection(pol, policy, 365);
    // rounding may cause ±1 difference
    expect(Math.abs(r.revenue_cu - annual)).toBeLessThanOrEqual(1);
  });
});

// ── estimateDaysToTreasuryTarget ──────────────────────────────────────────────

describe("estimateDaysToTreasuryTarget", () => {
  it("returns 0 when treasury already meets target", () => {
    const pol    = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 500_000);
    const policy = createTaxPolicy("p1", q(0.15) as Q);
    expect(estimateDaysToTreasuryTarget(pol, policy, 100_000)).toBe(0);
  });

  it("returns Infinity at Prehistoric era (zero revenue)", () => {
    const pol    = makePolity(TechEra.Prehistoric);
    const policy = createTaxPolicy("p1", q(0.15) as Q);
    expect(estimateDaysToTreasuryTarget(pol, policy, 1_000)).toBe(Infinity);
  });

  it("returns positive days when treasury is below target", () => {
    const pol    = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 0);
    const policy = createTaxPolicy("p1", q(0.15) as Q);
    const days   = estimateDaysToTreasuryTarget(pol, policy, 10_000);
    expect(days).toBeGreaterThan(0);
    expect(isFinite(days)).toBe(true);
  });

  it("higher tax rate gives fewer days to target", () => {
    const pol  = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 0);
    const lo   = createTaxPolicy("p1", q(0.10) as Q);
    const hi   = createTaxPolicy("p1", q(0.30) as Q);
    const dLo  = estimateDaysToTreasuryTarget(pol, lo, 50_000);
    const dHi  = estimateDaysToTreasuryTarget(pol, hi, 50_000);
    expect(dHi).toBeLessThan(dLo);
  });

  it("returns ceil(needed / daily)", () => {
    const pol    = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 0);
    const policy = createTaxPolicy("p1", q(0.15) as Q);
    const daily  = computeDailyTaxRevenue(pol, policy);
    const target = daily * 10 + 1;  // needs just over 10 days
    const days   = estimateDaysToTreasuryTarget(pol, policy, target);
    expect(days).toBe(11);
  });
});

// ── computeRequiredTaxRate ────────────────────────────────────────────────────

describe("computeRequiredTaxRate", () => {
  it("returns MAX_TAX_RATE_Q at Prehistoric era", () => {
    const pol = makePolity(TechEra.Prehistoric);
    expect(computeRequiredTaxRate(pol, 1_000)).toBe(MAX_TAX_RATE_Q);
  });

  it("returns a positive rate for achievable target", () => {
    const pol  = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const rate = computeRequiredTaxRate(pol, 10_000);
    expect(rate).toBeGreaterThan(0);
  });

  it("higher desired revenue → higher rate", () => {
    const pol  = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const r1   = computeRequiredTaxRate(pol, 5_000);
    const r2   = computeRequiredTaxRate(pol, 50_000);
    expect(r2).toBeGreaterThan(r1);
  });

  it("result is clamped to [0, MAX_TAX_RATE_Q]", () => {
    const pol  = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const rate = computeRequiredTaxRate(pol, 999_999_999);
    expect(rate).toBe(MAX_TAX_RATE_Q);
  });

  it("applying computed rate produces at least the desired annual revenue", () => {
    const pol     = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q);
    const desired = 5_000;
    const rate    = computeRequiredTaxRate(pol, desired);
    const policy  = createTaxPolicy("p1", rate);
    const actual  = computeAnnualTaxRevenue(pol, policy);
    // rate was ceil'd so actual should be >= desired (unless capped at MAX)
    if (rate < MAX_TAX_RATE_Q) {
      expect(actual).toBeGreaterThanOrEqual(desired);
    }
  });
});

// ── Integration ───────────────────────────────────────────────────────────────

describe("integration", () => {
  it("treasury grows over 1 year at standard rate", () => {
    const pol    = makePolity(TechEra.Medieval, 200_000, q(0.80) as Q, 0);
    const policy = createTaxPolicy("p1", q(0.15) as Q);
    stepTaxCollection(pol, policy, 365);
    expect(pol.treasury_cu).toBeGreaterThan(0);
  });

  it("high-tech polity earns far more than low-tech at same population", () => {
    const med = makePolity(TechEra.Medieval, 1_000_000, q(0.80) as Q, 0);
    const mod = makePolity(TechEra.Modern,   1_000_000, q(0.80) as Q, 0);
    const policy = createTaxPolicy("p1", q(0.15) as Q);
    const rMed = stepTaxCollection(med, policy, 365);
    const rMod = stepTaxCollection(mod, policy, 365);
    expect(rMod.revenue_cu).toBeGreaterThan(rMed.revenue_cu * 10);
  });

  it("unstable polity collects less than stable polity of same size", () => {
    const stable   = makePolity(TechEra.Medieval, 100_000, q(0.90) as Q, 0);
    const unstable = makePolity(TechEra.Medieval, 100_000, q(0.10) as Q, 0);
    const policy   = createTaxPolicy("p1", q(0.15) as Q);
    const rStable   = stepTaxCollection(stable,   policy, 30);
    const rUnstable = stepTaxCollection(unstable, policy, 30);
    expect(rStable.revenue_cu).toBeGreaterThan(rUnstable.revenue_cu);
  });

  it("heavy taxation produces unrest pressure but funds treasury faster", () => {
    const pol1   = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 0);
    const pol2   = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 0);
    const normal = createTaxPolicy("p1", q(0.15) as Q);
    const heavy  = createTaxPolicy("p1", q(0.40) as Q);
    const rN = stepTaxCollection(pol1, normal, 30);
    const rH = stepTaxCollection(pol2, heavy,  30);
    expect(rH.revenue_cu).toBeGreaterThan(rN.revenue_cu);
    expect(rH.unrestPressure_Q).toBeGreaterThan(rN.unrestPressure_Q);
  });
});
