// test/demography.test.ts — Phase 86: Population Dynamics & Demographics

import { describe, it, expect } from "vitest";
import {
  BASELINE_BIRTH_RATE_ANNUAL_Q,
  BASELINE_DEATH_RATE_ANNUAL_Q,
  BIRTH_RATE_MORALE_FLOOR_Q,
  INSTABILITY_DEATH_ANNUAL_Q,
  FAMINE_THRESHOLD_Q,
  FAMINE_DEATH_ANNUAL_Q,
  FAMINE_MIGRATION_PUSH_Q,
  TECH_ERA_DEATH_MUL,
  CARRYING_CAPACITY_BY_ERA,
  computeBirthRate,
  computeDeathRate,
  computeNetGrowthRate,
  stepPolityPopulation,
  computeFamineMigrationPush,
  computeCarryingCapacity,
  isOverCapacity,
  estimateAnnualBirths,
  estimateAnnualDeaths,
} from "../src/demography.js";
import { createPolity } from "../src/polity.js";
import { q, SCALE } from "../src/units.js";
import type { Q } from "../src/units.js";
import type { TechEra } from "../src/sim/tech.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Create a Medieval polity with 100 000 people and controllable morale/stability. */
function makePolity(
  morale   = q(0.50) as Q,
  stability = q(0.80) as Q,
  techEra  = "Medieval",
  pop      = 100_000,
) {
  const p = createPolity("p1", "Test", "f1", [], pop, 500_000, techEra as TechEra);
  p.moraleQ    = morale;
  p.stabilityQ = stability;
  return p;
}

// ── Constants sanity ───────────────────────────────────────────────────────────

describe("constants", () => {
  it("BASELINE_BIRTH_RATE_ANNUAL_Q encodes ~3.5%/year", () => {
    expect(BASELINE_BIRTH_RATE_ANNUAL_Q).toBe(q(0.035));
  });

  it("BASELINE_DEATH_RATE_ANNUAL_Q encodes ~3.0%/year", () => {
    expect(BASELINE_DEATH_RATE_ANNUAL_Q).toBe(q(0.030));
  });

  it("FAMINE_THRESHOLD_Q is q(0.20)", () => {
    expect(FAMINE_THRESHOLD_Q).toBe(q(0.20));
  });

  it("FAMINE_MIGRATION_PUSH_Q is q(0.30)", () => {
    expect(FAMINE_MIGRATION_PUSH_Q).toBe(q(0.30));
  });

  it("Medieval tech death multiplier is 15% below baseline", () => {
    const medieval = TECH_ERA_DEATH_MUL["Medieval"];
    expect(medieval).toBe(Math.round(SCALE.Q * 0.85));
  });

  it("Modern tech death multiplier is 50% below baseline", () => {
    expect(TECH_ERA_DEATH_MUL["Modern"]).toBe(Math.round(SCALE.Q * 0.50));
  });

  it("Stone tech death multiplier is full baseline", () => {
    expect(TECH_ERA_DEATH_MUL["Stone"]).toBe(SCALE.Q);
  });

  it("CARRYING_CAPACITY_BY_ERA Medieval is 2_000_000", () => {
    expect(CARRYING_CAPACITY_BY_ERA["Medieval"]).toBe(2_000_000);
  });
});

// ── computeBirthRate ──────────────────────────────────────────────────────────

describe("computeBirthRate", () => {
  it("at morale=0 yields half baseline (~1.75%/year)", () => {
    const p = makePolity(0 as Q);
    const rate = computeBirthRate(p);
    // factor = q(0.50) + 0 = 5000; rate = 350 * 5000 / 10000 = 175
    expect(rate).toBe(Math.round(BASELINE_BIRTH_RATE_ANNUAL_Q * (BIRTH_RATE_MORALE_FLOOR_Q) / SCALE.Q));
    expect(rate).toBeLessThan(BASELINE_BIRTH_RATE_ANNUAL_Q);
  });

  it("at morale=SCALE.Q yields 1.5× baseline (~5.25%/year)", () => {
    const p = makePolity(SCALE.Q as Q);
    const rate = computeBirthRate(p);
    // factor = q(0.50) + SCALE.Q = 15000; rate = 350 * 15000 / 10000 = 525
    expect(rate).toBeGreaterThan(BASELINE_BIRTH_RATE_ANNUAL_Q);
    expect(rate).toBe(Math.round(BASELINE_BIRTH_RATE_ANNUAL_Q * 15000 / SCALE.Q));
  });

  it("at morale=q(0.50) yields baseline rate", () => {
    const p = makePolity(q(0.50) as Q);
    const rate = computeBirthRate(p);
    // factor = 5000 + 5000 = 10000 = SCALE.Q; rate = baseline × 1.0
    expect(rate).toBe(BASELINE_BIRTH_RATE_ANNUAL_Q);
  });

  it("birth rate monotonically increases with morale", () => {
    const low  = computeBirthRate(makePolity(q(0.20) as Q));
    const mid  = computeBirthRate(makePolity(q(0.50) as Q));
    const high = computeBirthRate(makePolity(q(0.90) as Q));
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });

  it("birth rate is clamped to [0, SCALE.Q]", () => {
    const p = makePolity(SCALE.Q as Q);
    expect(computeBirthRate(p)).toBeLessThanOrEqual(SCALE.Q);
    expect(computeBirthRate(p)).toBeGreaterThanOrEqual(0);
  });
});

// ── computeDeathRate ──────────────────────────────────────────────────────────

describe("computeDeathRate", () => {
  it("Stone era uses full baseline death rate", () => {
    const p = makePolity(q(0.50) as Q, SCALE.Q as Q, "Stone");
    const rate = computeDeathRate(p);
    // tech mul=SCALE.Q; stability=SCALE.Q (no instability bonus); no famine/pressure
    expect(rate).toBe(BASELINE_DEATH_RATE_ANNUAL_Q);
  });

  it("Medieval era death rate is 15% below baseline", () => {
    const p = makePolity(q(0.50) as Q, SCALE.Q as Q, "Medieval");
    const rate = computeDeathRate(p);
    const expected = Math.round(BASELINE_DEATH_RATE_ANNUAL_Q * Math.round(SCALE.Q * 0.85) / SCALE.Q);
    expect(rate).toBe(expected);
  });

  it("Modern era death rate is 50% below baseline", () => {
    const p = makePolity(q(0.50) as Q, SCALE.Q as Q, "Modern");
    const rate = computeDeathRate(p);
    expect(rate).toBe(Math.round(BASELINE_DEATH_RATE_ANNUAL_Q * Math.round(SCALE.Q * 0.50) / SCALE.Q));
  });

  it("zero stability adds full INSTABILITY_DEATH_ANNUAL_Q", () => {
    const stable   = makePolity(q(0.50) as Q, SCALE.Q as Q);
    const unstable = makePolity(q(0.50) as Q, 0 as Q);
    const diff = computeDeathRate(unstable) - computeDeathRate(stable);
    expect(diff).toBe(INSTABILITY_DEATH_ANNUAL_Q);
  });

  it("half stability adds half INSTABILITY_DEATH_ANNUAL_Q", () => {
    const stable  = makePolity(q(0.50) as Q, SCALE.Q as Q);
    const partial = makePolity(q(0.50) as Q, q(0.50) as Q);
    const diff = computeDeathRate(partial) - computeDeathRate(stable);
    expect(diff).toBe(Math.round(INSTABILITY_DEATH_ANNUAL_Q * 0.50));
  });

  it("famine adds FAMINE_DEATH_ANNUAL_Q", () => {
    const p        = makePolity();
    const noFamine = computeDeathRate(p, undefined, q(0.50) as Q);
    const famine   = computeDeathRate(p, undefined, q(0.10) as Q);
    expect(famine - noFamine).toBe(FAMINE_DEATH_ANNUAL_Q);
  });

  it("food supply exactly at FAMINE_THRESHOLD_Q does not trigger famine", () => {
    const p    = makePolity();
    const rate = computeDeathRate(p, undefined, FAMINE_THRESHOLD_Q);
    // at threshold (not below) — no famine bonus
    expect(rate).toBe(computeDeathRate(p, undefined, q(0.50) as Q));
  });

  it("external death pressure is added directly", () => {
    const p        = makePolity();
    const baseline = computeDeathRate(p);
    const pressure = q(0.05) as Q;
    expect(computeDeathRate(p, pressure)).toBe(baseline + pressure);
  });

  it("death rate is clamped to [0, SCALE.Q]", () => {
    const p = makePolity(q(0.50) as Q, 0 as Q);
    const rate = computeDeathRate(p, SCALE.Q as Q, 0 as Q);
    expect(rate).toBeLessThanOrEqual(SCALE.Q);
    expect(rate).toBeGreaterThanOrEqual(0);
  });

  it("unknown tech era falls back to Stone (SCALE.Q multiplier)", () => {
    const p = makePolity(q(0.50) as Q, SCALE.Q as Q, "FuturisticUnknown");
    const rate = computeDeathRate(p);
    expect(rate).toBe(BASELINE_DEATH_RATE_ANNUAL_Q);
  });
});

// ── computeNetGrowthRate ──────────────────────────────────────────────────────

describe("computeNetGrowthRate", () => {
  it("healthy medieval polity has positive net growth", () => {
    const p = makePolity(q(0.60) as Q, q(0.80) as Q);
    expect(computeNetGrowthRate(p)).toBeGreaterThan(0);
  });

  it("high death pressure can push net growth negative", () => {
    const p = makePolity(q(0.20) as Q, 0 as Q);
    const net = computeNetGrowthRate(p, q(0.10) as Q, 0 as Q);
    expect(net).toBeLessThan(0);
  });

  it("net growth = birthRate − deathRate", () => {
    const p       = makePolity();
    const birth   = computeBirthRate(p);
    const death   = computeDeathRate(p);
    expect(computeNetGrowthRate(p)).toBe(birth - death);
  });
});

// ── stepPolityPopulation ──────────────────────────────────────────────────────

describe("stepPolityPopulation", () => {
  it("annual step grows a healthy polity", () => {
    const p = makePolity(q(0.60) as Q, q(0.80) as Q, "Medieval", 100_000);
    const r = stepPolityPopulation(p, 365);
    expect(r.popDelta).toBeGreaterThan(0);
    expect(r.newPopulation).toBeGreaterThan(100_000);
    expect(p.population).toBe(r.newPopulation);
  });

  it("annual step on a distressed polity can shrink population", () => {
    const p = makePolity(q(0.10) as Q, 0 as Q, "Stone", 100_000);
    const r = stepPolityPopulation(p, 365, q(0.10) as Q, 0 as Q);
    expect(r.popDelta).toBeLessThan(0);
  });

  it("population never goes below zero", () => {
    const p = makePolity(0 as Q, 0 as Q, "Stone", 1);
    const r = stepPolityPopulation(p, 365, SCALE.Q as Q, 0 as Q);
    expect(r.newPopulation).toBe(0);
    expect(p.population).toBe(0);
  });

  it("famine flag set when foodSupply below threshold", () => {
    const p = makePolity();
    const r = stepPolityPopulation(p, 30, undefined, q(0.10) as Q);
    expect(r.famine).toBe(true);
  });

  it("famine flag not set when foodSupply at or above threshold", () => {
    const p = makePolity();
    const r = stepPolityPopulation(p, 30, undefined, FAMINE_THRESHOLD_Q);
    expect(r.famine).toBe(false);
  });

  it("famine flag not set when foodSupply omitted", () => {
    const p = makePolity();
    const r = stepPolityPopulation(p, 30);
    expect(r.famine).toBe(false);
  });

  it("larger elapsed days produces proportionally larger delta", () => {
    const p1 = makePolity(q(0.60) as Q, q(0.80) as Q, "Medieval", 100_000);
    const p2 = makePolity(q(0.60) as Q, q(0.80) as Q, "Medieval", 100_000);
    const r30  = stepPolityPopulation(p1, 30);
    const r365 = stepPolityPopulation(p2, 365);
    // ~12× ratio (365/30 ≈ 12.2), allow for rounding
    expect(r365.popDelta).toBeGreaterThan(r30.popDelta * 10);
  });

  it("returns effectiveBirthRate_Q and effectiveDeathRate_Q", () => {
    const p = makePolity();
    const r = stepPolityPopulation(p, 30);
    expect(r.effectiveBirthRate_Q).toBe(computeBirthRate(p));
    // Note: computeBirthRate reads moraleQ which stepPolityPopulation doesn't change
  });

  it("zero-population polity stays at zero", () => {
    const p = makePolity(q(0.80) as Q, q(0.90) as Q, "Medieval", 0);
    const r = stepPolityPopulation(p, 365);
    expect(r.newPopulation).toBe(0);
    expect(r.popDelta).toBe(0);
  });

  it("annual growth matches net-rate calculation within rounding", () => {
    const p   = makePolity(q(0.60) as Q, q(0.80) as Q, "Medieval", 100_000);
    const net = computeNetGrowthRate(p);
    const r   = stepPolityPopulation(p, 365);
    const expected = Math.round(100_000 * net / SCALE.Q);
    expect(r.popDelta).toBe(expected);
  });
});

// ── computeFamineMigrationPush ────────────────────────────────────────────────

describe("computeFamineMigrationPush", () => {
  it("returns 0 at or above famine threshold", () => {
    expect(computeFamineMigrationPush(FAMINE_THRESHOLD_Q)).toBe(0);
    expect(computeFamineMigrationPush(q(0.50) as Q)).toBe(0);
    expect(computeFamineMigrationPush(SCALE.Q as Q)).toBe(0);
  });

  it("returns FAMINE_MIGRATION_PUSH_Q at food=0", () => {
    expect(computeFamineMigrationPush(0 as Q)).toBe(FAMINE_MIGRATION_PUSH_Q);
  });

  it("returns half of FAMINE_MIGRATION_PUSH_Q at half the threshold", () => {
    const halfThreshold = Math.round(FAMINE_THRESHOLD_Q / 2) as Q;
    const push = computeFamineMigrationPush(halfThreshold);
    // deficit = threshold/2; push = PUSH × (threshold/2) / threshold = PUSH/2
    expect(push).toBe(Math.round(FAMINE_MIGRATION_PUSH_Q / 2));
  });

  it("push increases as food supply falls", () => {
    const p1 = computeFamineMigrationPush(q(0.15) as Q);
    const p2 = computeFamineMigrationPush(q(0.05) as Q);
    const p3 = computeFamineMigrationPush(0 as Q);
    expect(p1).toBeLessThan(p2);
    expect(p2).toBeLessThan(p3);
  });

  it("result is clamped to [0, SCALE.Q]", () => {
    const push = computeFamineMigrationPush(0 as Q);
    expect(push).toBeLessThanOrEqual(SCALE.Q);
    expect(push).toBeGreaterThanOrEqual(0);
  });
});

// ── computeCarryingCapacity & isOverCapacity ──────────────────────────────────

describe("computeCarryingCapacity", () => {
  it("returns correct cap for each era", () => {
    const eras: [string, number][] = [
      ["Stone",       50_000],
      ["Bronze",     200_000],
      ["Iron",       500_000],
      ["Medieval", 2_000_000],
    ];
    for (const [era, cap] of eras) {
      const p = makePolity(q(0.50) as Q, q(0.50) as Q, era);
      expect(computeCarryingCapacity(p)).toBe(cap);
    }
  });

  it("unknown era falls back to Stone capacity", () => {
    const p = makePolity(q(0.50) as Q, q(0.50) as Q, "Futuristic");
    expect(computeCarryingCapacity(p)).toBe(50_000);
  });
});

describe("isOverCapacity", () => {
  it("returns false when population is below cap", () => {
    const p = makePolity(q(0.50) as Q, q(0.50) as Q, "Medieval", 500_000);
    expect(isOverCapacity(p)).toBe(false);
  });

  it("returns false at exactly the cap", () => {
    const p = makePolity(q(0.50) as Q, q(0.50) as Q, "Medieval", 2_000_000);
    expect(isOverCapacity(p)).toBe(false);
  });

  it("returns true when population exceeds cap", () => {
    const p = makePolity(q(0.50) as Q, q(0.50) as Q, "Medieval", 2_000_001);
    expect(isOverCapacity(p)).toBe(true);
  });

  it("Iron era with 600k population is over capacity", () => {
    const p = makePolity(q(0.50) as Q, q(0.50) as Q, "Iron", 600_000);
    expect(isOverCapacity(p)).toBe(true);
  });
});

// ── estimateAnnualBirths / estimateAnnualDeaths ───────────────────────────────

describe("estimateAnnualBirths and estimateAnnualDeaths", () => {
  it("births = population × birthRate / SCALE.Q", () => {
    const rate = q(0.035) as Q;
    expect(estimateAnnualBirths(100_000, rate)).toBe(Math.round(100_000 * 350 / 10_000));
  });

  it("deaths = population × deathRate / SCALE.Q", () => {
    const rate = q(0.030) as Q;
    expect(estimateAnnualDeaths(100_000, rate)).toBe(Math.round(100_000 * 300 / 10_000));
  });

  it("estimates scale linearly with population", () => {
    const rate = q(0.035) as Q;
    const b1   = estimateAnnualBirths(50_000, rate);
    const b2   = estimateAnnualBirths(100_000, rate);
    expect(b2).toBe(b1 * 2);
  });

  it("zero population yields zero estimates", () => {
    expect(estimateAnnualBirths(0, q(0.035) as Q)).toBe(0);
    expect(estimateAnnualDeaths(0, q(0.030) as Q)).toBe(0);
  });
});
