// test/granary.test.ts — Phase 87: Granary & Food Supply

import { describe, it, expect } from "vitest";
import {
  GRANARY_CAPACITY_DAYS,
  HARVEST_BASE_SU_PER_CAPITA,
  HARVEST_YIELD_BASE_Q,
  HARVEST_STABILITY_BONUS_Q,
  RAID_FRACTION_Q,
  createGranary,
  computeCapacity,
  computeFoodSupply_Q,
  deriveHarvestYieldFactor,
  computeHarvestYield,
  triggerHarvest,
  stepGranaryConsumption,
  tradeFoodSupply,
  raidGranary,
} from "../src/granary.js";
import { FAMINE_THRESHOLD_Q } from "../src/demography.js";
import { createPolity } from "../src/polity.js";
import { q, SCALE, mulDiv } from "../src/units.js";
import type { Q } from "../src/units.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePolity(pop = 10_000, stability = q(0.80) as Q, techEra = "Medieval") {
  const p = createPolity("p1", "Test", "f1", [], pop, 500_000, techEra as any);
  p.stabilityQ = stability;
  p.moraleQ    = q(0.60) as Q;
  return p;
}

// ── Constants ──────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("GRANARY_CAPACITY_DAYS is 730", () => {
    expect(GRANARY_CAPACITY_DAYS).toBe(730);
  });

  it("HARVEST_BASE_SU_PER_CAPITA is 250", () => {
    expect(HARVEST_BASE_SU_PER_CAPITA).toBe(250);
  });

  it("HARVEST_YIELD_BASE_Q is q(0.70)", () => {
    expect(HARVEST_YIELD_BASE_Q).toBe(q(0.70));
  });

  it("HARVEST_STABILITY_BONUS_Q is q(0.30)", () => {
    expect(HARVEST_STABILITY_BONUS_Q).toBe(q(0.30));
  });

  it("RAID_FRACTION_Q is q(0.40)", () => {
    expect(RAID_FRACTION_Q).toBe(q(0.40));
  });
});

// ── createGranary ──────────────────────────────────────────────────────────────

describe("createGranary", () => {
  it("sets polityId correctly", () => {
    const p = makePolity();
    const g = createGranary(p);
    expect(g.polityId).toBe("p1");
  });

  it("initial grain equals one year of consumption", () => {
    const p = makePolity(10_000);
    const g = createGranary(p);
    expect(g.grain_su).toBe(10_000 * 365);
  });

  it("initial grain scales with population", () => {
    const g1 = createGranary(makePolity(5_000));
    const g2 = createGranary(makePolity(20_000));
    expect(g2.grain_su).toBe(g1.grain_su * 4);
  });
});

// ── computeCapacity ────────────────────────────────────────────────────────────

describe("computeCapacity", () => {
  it("capacity = population × GRANARY_CAPACITY_DAYS", () => {
    const p = makePolity(10_000);
    expect(computeCapacity(p)).toBe(10_000 * GRANARY_CAPACITY_DAYS);
  });

  it("zero population yields zero capacity", () => {
    const p = makePolity(0);
    expect(computeCapacity(p)).toBe(0);
  });
});

// ── computeFoodSupply_Q ────────────────────────────────────────────────────────

describe("computeFoodSupply_Q", () => {
  it("full granary returns SCALE.Q", () => {
    const p = makePolity(10_000);
    const g = createGranary(p);
    g.grain_su = computeCapacity(p);
    expect(computeFoodSupply_Q(p, g)).toBe(SCALE.Q);
  });

  it("empty granary returns 0", () => {
    const p = makePolity(10_000);
    const g = createGranary(p);
    g.grain_su = 0;
    expect(computeFoodSupply_Q(p, g)).toBe(0);
  });

  it("half-full granary returns ~q(0.50)", () => {
    const p   = makePolity(10_000);
    const g   = createGranary(p);
    const cap = computeCapacity(p);
    g.grain_su = Math.floor(cap / 2);
    const supply = computeFoodSupply_Q(p, g);
    expect(supply).toBeGreaterThanOrEqual(q(0.49));
    expect(supply).toBeLessThanOrEqual(q(0.51));
  });

  it("initial 1-year reserves yield supply > FAMINE_THRESHOLD_Q", () => {
    const p = makePolity(10_000);
    const g = createGranary(p);
    // 1 year / 2 years capacity = q(0.50) >> q(0.20) famine threshold
    expect(computeFoodSupply_Q(p, g)).toBeGreaterThan(FAMINE_THRESHOLD_Q);
  });

  it("returns 0 when population is zero (avoids division by zero)", () => {
    const p = makePolity(0);
    const g = { polityId: "p1", grain_su: 1000 };
    expect(computeFoodSupply_Q(p, g)).toBe(0);
  });

  it("is clamped to [0, SCALE.Q]", () => {
    const p = makePolity(10_000);
    const g = createGranary(p);
    g.grain_su = computeCapacity(p) * 2;  // overfilled
    expect(computeFoodSupply_Q(p, g)).toBe(SCALE.Q);
  });
});

// ── deriveHarvestYieldFactor ───────────────────────────────────────────────────

describe("deriveHarvestYieldFactor", () => {
  it("zero stability returns HARVEST_YIELD_BASE_Q", () => {
    const p = makePolity(10_000, 0 as Q);
    expect(deriveHarvestYieldFactor(p)).toBe(HARVEST_YIELD_BASE_Q);
  });

  it("full stability returns SCALE.Q (base + full bonus)", () => {
    const p = makePolity(10_000, SCALE.Q as Q);
    expect(deriveHarvestYieldFactor(p)).toBe(SCALE.Q);
  });

  it("half stability yields base + half bonus", () => {
    const p      = makePolity(10_000, q(0.50) as Q);
    const factor = deriveHarvestYieldFactor(p);
    const expected = HARVEST_YIELD_BASE_Q + mulDiv(HARVEST_STABILITY_BONUS_Q, q(0.50), SCALE.Q);
    expect(factor).toBe(expected);
  });

  it("season_Q multiplies the base factor", () => {
    const p       = makePolity(10_000, SCALE.Q as Q);  // full stability → factor=SCALE.Q
    const winter  = deriveHarvestYieldFactor(p, q(0.50) as Q);
    expect(winter).toBe(q(0.50));  // SCALE.Q × q(0.50) / SCALE.Q = q(0.50)
  });

  it("season_Q = SCALE.Q has no effect on full-stability factor", () => {
    const p = makePolity(10_000, SCALE.Q as Q);
    expect(deriveHarvestYieldFactor(p, SCALE.Q as Q)).toBe(SCALE.Q);
  });

  it("yield factor is clamped to [0, SCALE.Q]", () => {
    const p = makePolity(10_000, SCALE.Q as Q);
    expect(deriveHarvestYieldFactor(p)).toBeLessThanOrEqual(SCALE.Q);
    expect(deriveHarvestYieldFactor(p)).toBeGreaterThanOrEqual(0);
  });
});

// ── computeHarvestYield ────────────────────────────────────────────────────────

describe("computeHarvestYield", () => {
  it("at full yield factor (SCALE.Q) returns population × BASE_SU_PER_CAPITA", () => {
    const p = makePolity(10_000);
    expect(computeHarvestYield(p, SCALE.Q as Q)).toBe(10_000 * HARVEST_BASE_SU_PER_CAPITA);
  });

  it("at half yield factor returns half of max", () => {
    const p = makePolity(10_000);
    expect(computeHarvestYield(p, q(0.50) as Q)).toBe(
      Math.round(10_000 * HARVEST_BASE_SU_PER_CAPITA * q(0.50) / SCALE.Q)
    );
  });

  it("zero population yields zero grain", () => {
    const p = makePolity(0);
    expect(computeHarvestYield(p, SCALE.Q as Q)).toBe(0);
  });

  it("uses deriveHarvestYieldFactor when no override supplied", () => {
    const p      = makePolity(10_000, SCALE.Q as Q);
    const auto   = computeHarvestYield(p);
    const manual = computeHarvestYield(p, SCALE.Q as Q);
    expect(auto).toBe(manual);  // full stability → factor=SCALE.Q
  });

  it("two biannual harvests at good yield exceed one year's consumption", () => {
    const p         = makePolity(10_000, q(0.80) as Q);
    const perHarvest = computeHarvestYield(p);
    const annual    = perHarvest * 2;
    expect(annual).toBeGreaterThan(p.population * 365);
  });
});

// ── triggerHarvest ─────────────────────────────────────────────────────────────

describe("triggerHarvest", () => {
  it("adds grain to the granary", () => {
    const p    = makePolity(10_000);
    const g    = createGranary(p);
    g.grain_su = 0;
    const added = triggerHarvest(p, g, SCALE.Q as Q);
    expect(added).toBe(computeHarvestYield(p, SCALE.Q as Q));
    expect(g.grain_su).toBe(added);
  });

  it("does not exceed capacity", () => {
    const p   = makePolity(10_000);
    const g   = createGranary(p);
    const cap = computeCapacity(p);
    g.grain_su = cap;  // already full
    const added = triggerHarvest(p, g);
    expect(added).toBe(0);
    expect(g.grain_su).toBe(cap);
  });

  it("partial add when near capacity", () => {
    const p   = makePolity(10_000, SCALE.Q as Q);
    const g   = createGranary(p);
    const cap = computeCapacity(p);
    const yield_ = computeHarvestYield(p, SCALE.Q as Q);
    g.grain_su = cap - Math.floor(yield_ / 2);  // half of yield fits
    const added = triggerHarvest(p, g, SCALE.Q as Q);
    expect(added).toBeLessThan(yield_);
    expect(g.grain_su).toBeLessThanOrEqual(cap);
  });

  it("returns the added amount accurately", () => {
    const p     = makePolity(10_000);
    const g     = createGranary(p);
    const before = g.grain_su;
    const added  = triggerHarvest(p, g);
    expect(g.grain_su).toBe(before + added);
  });
});

// ── stepGranaryConsumption ─────────────────────────────────────────────────────

describe("stepGranaryConsumption", () => {
  it("drains population × elapsedDays grain per step", () => {
    const p     = makePolity(1_000);
    const g     = createGranary(p);
    const before = g.grain_su;
    const consumed = stepGranaryConsumption(p, g, 30);
    expect(consumed).toBe(1_000 * 30);
    expect(g.grain_su).toBe(before - 1_000 * 30);
  });

  it("grain never goes below zero", () => {
    const p    = makePolity(10_000);
    const g    = createGranary(p);
    g.grain_su = 100;
    stepGranaryConsumption(p, g, 365);
    expect(g.grain_su).toBe(0);
  });

  it("returns actual consumed (not demand when reserves are insufficient)", () => {
    const p    = makePolity(10_000);
    const g    = createGranary(p);
    g.grain_su = 50;
    const consumed = stepGranaryConsumption(p, g, 365);
    expect(consumed).toBe(50);
  });

  it("consuming on a zero-grain granary returns 0", () => {
    const p    = makePolity(10_000);
    const g    = createGranary(p);
    g.grain_su = 0;
    expect(stepGranaryConsumption(p, g, 1)).toBe(0);
  });
});

// ── tradeFoodSupply ────────────────────────────────────────────────────────────

describe("tradeFoodSupply", () => {
  it("transfers grain from source to destination", () => {
    const pFrom  = makePolity(10_000);
    const pTo    = makePolity(10_000);
    const gFrom  = createGranary(pFrom);
    const gTo    = { polityId: "to", grain_su: 0 };
    const before = gFrom.grain_su;
    const transferred = tradeFoodSupply(gFrom, gTo, pTo, 10_000);
    expect(transferred).toBe(10_000);
    expect(gFrom.grain_su).toBe(before - 10_000);
    expect(gTo.grain_su).toBe(10_000);
  });

  it("cannot transfer more than source has", () => {
    const pFrom = makePolity(10_000);
    const pTo   = makePolity(10_000);
    const gFrom = { polityId: "from", grain_su: 500 };
    const gTo   = { polityId: "to",   grain_su: 0 };
    const t = tradeFoodSupply(gFrom, gTo, pTo, 100_000);
    expect(t).toBe(500);
    expect(gFrom.grain_su).toBe(0);
  });

  it("cannot overflow destination capacity", () => {
    const pFrom = makePolity(10_000);
    const pTo   = makePolity(100);
    const gFrom = createGranary(pFrom);
    const gTo   = { polityId: "to", grain_su: computeCapacity(pTo) };
    const t = tradeFoodSupply(gFrom, gTo, pTo, 1_000_000);
    expect(t).toBe(0);
    expect(gTo.grain_su).toBe(computeCapacity(pTo));
  });

  it("limited by smallest of: amount, source grain, destination space", () => {
    const pFrom = makePolity(10_000);
    const pTo   = makePolity(1_000);
    const cap   = computeCapacity(pTo);
    const gFrom = { polityId: "from", grain_su: 999_999 };
    const gTo   = { polityId: "to",   grain_su: cap - 200 };  // only 200 space
    const t = tradeFoodSupply(gFrom, gTo, pTo, 999_999);
    expect(t).toBe(200);
  });
});

// ── raidGranary ────────────────────────────────────────────────────────────────

describe("raidGranary", () => {
  it("removes RAID_FRACTION_Q of grain by default", () => {
    const g     = { polityId: "p", grain_su: 100_000 };
    const plund = raidGranary(g);
    expect(plund).toBe(Math.round(mulDiv(100_000, RAID_FRACTION_Q, SCALE.Q)));
    expect(g.grain_su).toBe(100_000 - plund);
  });

  it("custom fraction is applied correctly", () => {
    const g = { polityId: "p", grain_su: 200_000 };
    const plund = raidGranary(g, q(0.25) as Q);
    expect(plund).toBe(Math.round(200_000 * q(0.25) / SCALE.Q));
  });

  it("raid at q(1.0) empties the granary", () => {
    const g = { polityId: "p", grain_su: 50_000 };
    const plund = raidGranary(g, SCALE.Q as Q);
    expect(plund).toBe(50_000);
    expect(g.grain_su).toBe(0);
  });

  it("raid at q(0) removes nothing", () => {
    const g = { polityId: "p", grain_su: 50_000 };
    raidGranary(g, 0 as Q);
    expect(g.grain_su).toBe(50_000);
  });

  it("grain never goes below zero after raid", () => {
    const g = { polityId: "p", grain_su: 0 };
    const plund = raidGranary(g);
    expect(plund).toBe(0);
    expect(g.grain_su).toBe(0);
  });
});

// ── Integration: famine threshold ─────────────────────────────────────────────

describe("famine integration", () => {
  it("granary near empty triggers famine condition via computeFoodSupply_Q", () => {
    const p   = makePolity(10_000);
    const g   = createGranary(p);
    const cap = computeCapacity(p);
    // Set grain to 10% of capacity — well below FAMINE_THRESHOLD_Q = q(0.20)
    g.grain_su = Math.floor(cap * 0.10);
    expect(computeFoodSupply_Q(p, g)).toBeLessThan(FAMINE_THRESHOLD_Q);
  });

  it("after one year of consumption with no harvest, famine activates", () => {
    const p = makePolity(10_000);
    const g = createGranary(p);   // starts at 1 year of food (q(0.50) of capacity)
    stepGranaryConsumption(p, g, 365);
    // Now at 0 grain → food supply = 0 < FAMINE_THRESHOLD
    expect(computeFoodSupply_Q(p, g)).toBeLessThan(FAMINE_THRESHOLD_Q);
  });

  it("two good harvests restore food supply above famine threshold", () => {
    const p = makePolity(10_000, SCALE.Q as Q);
    const g = createGranary(p);
    g.grain_su = 0;
    triggerHarvest(p, g);
    triggerHarvest(p, g);
    expect(computeFoodSupply_Q(p, g)).toBeGreaterThan(FAMINE_THRESHOLD_Q);
  });
});
