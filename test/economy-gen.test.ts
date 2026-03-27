/**
 * Phase 72 — Generative Economics
 * Tests for src/economy-gen.ts
 */
import { describe, expect, test } from "vitest";
import { q, SCALE }               from "../src/units";
import { TechEra }                from "../src/sim/tech";
import { createPolity, createPolityRegistry } from "../src/polity";
import type { PolityPair }        from "../src/polity";
import {
  COMMODITIES,
  DEBT_CRISIS_RATIO_Q,
  SPECULATE_WAGER_Q,
  availableCommodities,
  checkDebtCrisis,
  createMarket,
  deriveEconomicPressure,
  economicWarfare,
  speculate,
  stepMarket,
  stepPrices,
  stepTrade,
} from "../src/economy-gen";

// ── Helpers ────────────────────────────────────────────────────────────────────

function mkPolity(id: string, era: TechEra, treasury = 10_000) {
  const p = createPolity(id, id, id, [], 100_000, treasury, era);
  return p;
}

function mkRegistry(...polities: ReturnType<typeof mkPolity>[]) {
  return createPolityRegistry(polities);
}

function mkPair(aId: string, bId: string, locs = 2, quality = q(0.50)): PolityPair {
  return { polityAId: aId, polityBId: bId, sharedLocations: locs, routeQuality_Q: quality };
}

// ── COMMODITIES catalogue ──────────────────────────────────────────────────────

describe("COMMODITIES catalogue", () => {
  test("exports exactly 8 commodities", () => {
    expect(COMMODITIES).toHaveLength(8);
  });

  test("all commodity ids are unique", () => {
    const ids = COMMODITIES.map(c => c.id);
    expect(new Set(ids).size).toBe(8);
  });

  test("all base prices are in (0, SCALE.Q]", () => {
    for (const c of COMMODITIES) {
      expect(c.basePrice_Q).toBeGreaterThan(0);
      expect(c.basePrice_Q).toBeLessThanOrEqual(SCALE.Q);
    }
  });

  test("includes expected commodity ids", () => {
    const ids = new Set(COMMODITIES.map(c => c.id));
    for (const id of ["grain", "timber", "iron", "spice", "arcane", "manufactured"]) {
      expect(ids.has(id)).toBe(true);
    }
  });
});

// ── availableCommodities ───────────────────────────────────────────────────────

describe("availableCommodities", () => {
  test("Prehistoric polity gets grain, timber, labour (3 commodities)", () => {
    const avail = availableCommodities(TechEra.Prehistoric);
    expect(avail.length).toBe(3);
    expect(avail).toContain("grain");
    expect(avail).toContain("timber");
    expect(avail).toContain("labour");
  });

  test("Ancient polity gets 6 commodities (adds iron, textile, spice)", () => {
    const avail = availableCommodities(TechEra.Ancient);
    expect(avail.length).toBe(6);
    expect(avail).toContain("iron");
    expect(avail).toContain("spice");
  });

  test("Medieval polity gets 7 commodities (adds arcane)", () => {
    expect(availableCommodities(TechEra.Medieval).length).toBe(7);
    expect(availableCommodities(TechEra.Medieval)).toContain("arcane");
  });

  test("EarlyModern polity gets all 8 commodities", () => {
    expect(availableCommodities(TechEra.EarlyModern).length).toBe(8);
    expect(availableCommodities(TechEra.EarlyModern)).toContain("manufactured");
  });

  test("higher era is a strict superset of lower era", () => {
    const prehSet = new Set(availableCommodities(TechEra.Prehistoric));
    for (const id of prehSet) {
      expect(availableCommodities(TechEra.Medieval)).toContain(id);
    }
  });
});

// ── createMarket ───────────────────────────────────────────────────────────────

describe("createMarket", () => {
  test("initialises all 8 commodity prices at their base price", () => {
    const market = createMarket();
    for (const c of COMMODITIES) {
      expect(market.prices.get(c.id)?.price_Q).toBe(c.basePrice_Q);
    }
  });

  test("initialises supply and demand at q(0.50)", () => {
    const market = createMarket();
    for (const c of COMMODITIES) {
      expect(market.prices.get(c.id)?.supply_Q).toBe(q(0.50));
      expect(market.prices.get(c.id)?.demand_Q).toBe(q(0.50));
    }
  });

  test("debt map is empty", () => {
    expect(createMarket().debt.size).toBe(0);
  });
});

// ── stepPrices ────────────────────────────────────────────────────────────────

describe("stepPrices", () => {
  test("at least one price changes after one step", () => {
    const market = createMarket();
    const before = new Map([...market.prices].map(([k, v]) => [k, v.price_Q]));
    stepPrices(market, 42, 1);
    let changed = 0;
    for (const [id, rec] of market.prices) {
      if (rec.price_Q !== before.get(id)) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });

  test("is deterministic — same inputs give same result", () => {
    const m1 = createMarket();
    const m2 = createMarket();
    stepPrices(m1, 42, 5);
    stepPrices(m2, 42, 5);
    for (const c of COMMODITIES) {
      expect(m1.prices.get(c.id)!.price_Q).toBe(m2.prices.get(c.id)!.price_Q);
    }
  });

  test("different seeds produce different prices", () => {
    const m1 = createMarket();
    const m2 = createMarket();
    stepPrices(m1, 1, 1);
    stepPrices(m2, 99, 1);
    let different = 0;
    for (const c of COMMODITIES) {
      if (m1.prices.get(c.id)!.price_Q !== m2.prices.get(c.id)!.price_Q) different++;
    }
    expect(different).toBeGreaterThan(0);
  });

  test("mean reversion: price far above base trends downward over 20 steps", () => {
    const market = createMarket();
    // Set grain price to q(1.80) — well above base q(0.20)
    market.prices.get("grain")!.price_Q = q(1.80);
    const start = market.prices.get("grain")!.price_Q;
    for (let t = 0; t < 20; t++) stepPrices(market, 7, t);
    expect(market.prices.get("grain")!.price_Q).toBeLessThan(start);
  });

  test("price never falls below q(0.05)", () => {
    const market = createMarket();
    market.prices.get("grain")!.price_Q = q(0.05);
    // Force excess supply to drive price down
    market.prices.get("grain")!.supply_Q = q(0.90);
    market.prices.get("grain")!.demand_Q = q(0.10);
    for (let t = 0; t < 10; t++) stepPrices(market, 42, t);
    expect(market.prices.get("grain")!.price_Q).toBeGreaterThanOrEqual(q(0.05));
  });

  test("price never exceeds q(2.0)", () => {
    const market = createMarket();
    market.prices.get("spice")!.price_Q = q(1.99);
    market.prices.get("spice")!.demand_Q = q(0.99);
    market.prices.get("spice")!.supply_Q = q(0.01);
    for (let t = 0; t < 5; t++) stepPrices(market, 42, t);
    expect(market.prices.get("spice")!.price_Q).toBeLessThanOrEqual(q(2.0));
  });
});

// ── stepTrade ─────────────────────────────────────────────────────────────────

describe("stepTrade", () => {
  test("non-war pair generates trade income for both polities", () => {
    const pA = mkPolity("alpha", TechEra.Ancient, 5_000);
    const pB = mkPolity("beta",  TechEra.Ancient, 5_000);
    const reg = mkRegistry(pA, pB);
    const market = createMarket();
    const pairs = [mkPair("alpha", "beta", 2, q(0.50))];

    stepTrade(reg, pairs, market);

    expect(pA.treasury_cu).toBeGreaterThan(5_000);
    expect(pB.treasury_cu).toBeGreaterThan(5_000);
    expect(pA.treasury_cu).toBe(pB.treasury_cu);
  });

  test("war pair generates no income", () => {
    const pA = mkPolity("alpha", TechEra.Ancient, 5_000);
    const pB = mkPolity("beta",  TechEra.Ancient, 5_000);
    const reg = mkRegistry(pA, pB);
    reg.activeWars.add("alpha:beta");
    const market = createMarket();

    stepTrade(reg, [mkPair("alpha", "beta")], market);

    expect(pA.treasury_cu).toBe(5_000);
    expect(pB.treasury_cu).toBe(5_000);
  });

  test("more shared locations → more income", () => {
    const pA1 = mkPolity("a1", TechEra.Ancient, 0);
    const pB1 = mkPolity("b1", TechEra.Ancient, 0);
    const pA2 = mkPolity("a2", TechEra.Ancient, 0);
    const pB2 = mkPolity("b2", TechEra.Ancient, 0);
    const reg = mkRegistry(pA1, pB1, pA2, pB2);
    const market = createMarket();

    stepTrade(reg, [mkPair("a1", "b1", 1), mkPair("a2", "b2", 4)], market);

    expect(pA2.treasury_cu).toBeGreaterThan(pA1.treasury_cu);
  });

  test("higher commodity price → more income", () => {
    const pA1 = mkPolity("a1", TechEra.Ancient, 0);
    const pB1 = mkPolity("b1", TechEra.Ancient, 0);
    const pA2 = mkPolity("a2", TechEra.Ancient, 0);
    const pB2 = mkPolity("b2", TechEra.Ancient, 0);
    const reg = mkRegistry(pA1, pB1, pA2, pB2);
    const m1 = createMarket();
    const m2 = createMarket();
    m2.prices.get("grain")!.price_Q = q(1.50); // much higher price

    stepTrade(reg, [mkPair("a1", "b1")], m1);
    stepTrade(reg, [mkPair("a2", "b2")], m2);

    expect(pA2.treasury_cu).toBeGreaterThan(pA1.treasury_cu);
  });

  test("returns income map keyed by polity id", () => {
    const pA = mkPolity("alpha", TechEra.Medieval, 0);
    const pB = mkPolity("beta",  TechEra.Medieval, 0);
    const reg = mkRegistry(pA, pB);
    const income = stepTrade(reg, [mkPair("alpha", "beta")], createMarket());
    expect(income.has("alpha")).toBe(true);
    expect(income.has("beta")).toBe(true);
    expect(income.get("alpha")).toBe(income.get("beta"));
  });

  test("pair with zero shared locations generates no income", () => {
    const pA = mkPolity("a", TechEra.Ancient, 5_000);
    const pB = mkPolity("b", TechEra.Ancient, 5_000);
    const reg = mkRegistry(pA, pB);
    stepTrade(reg, [mkPair("a", "b", 0)], createMarket());
    expect(pA.treasury_cu).toBe(5_000);
  });
});

// ── speculate ─────────────────────────────────────────────────────────────────

describe("speculate", () => {
  // Empirically determined: worldSeed=42, tick=0 → LOSS; tick=1 → WIN
  test("win path: treasury increases by the wager amount", () => {
    const p = mkPolity("test_polity", TechEra.Ancient, 10_000);
    const _market = createMarket();
    const _wager = Math.trunc(10_000 * SPECULATE_WAGER_Q / SCALE.Q); // 100 cu
    const result = speculate(p, "grain", 42, 1); // tick 1 = WIN
    expect(result).toBeGreaterThan(0);
    expect(p.treasury_cu).toBe(10_000 + result);
  });

  test("loss path: treasury decreases by the wager amount", () => {
    const p = mkPolity("test_polity", TechEra.Ancient, 10_000);
    const market = createMarket();
    const result = speculate(p, "grain", 42, 0); // tick 0 = LOSS
    expect(result).toBeLessThan(0);
    expect(p.treasury_cu).toBe(10_000 + result); // treasury reduced
    expect(market.debt.size).toBe(0); // treasury was sufficient, no debt
  });

  test("treasury never goes negative from repeated speculation", () => {
    const p = mkPolity("test_polity", TechEra.Ancient, 10_000);
    for (let tick = 0; tick < 20; tick++) {
      speculate(p, "grain", 42, tick);
    }
    expect(p.treasury_cu).toBeGreaterThanOrEqual(0);
  });

  test("no-op when treasury is zero", () => {
    const p = mkPolity("test_polity", TechEra.Ancient, 0);
    const _market = createMarket();
    const result = speculate(p, "grain", 42, 0);
    expect(result).toBe(0);
    expect(p.treasury_cu).toBe(0);
  });

  test("is deterministic — same polity, market, seed, tick", () => {
    const p1 = mkPolity("test_polity", TechEra.Ancient, 10_000);
    const p2 = mkPolity("test_polity", TechEra.Ancient, 10_000);
    const _m1 = createMarket();
    const _m2 = createMarket();
    const r1 = speculate(p1, "grain", 42, 3);
    const r2 = speculate(p2, "grain", 42, 3);
    expect(r1).toBe(r2);
    expect(p1.treasury_cu).toBe(p2.treasury_cu);
  });

  test("wager is 10% of treasury", () => {
    const treasury = 10_000;
    const p = mkPolity("test_polity", TechEra.Ancient, treasury);
    const _market = createMarket();
    const expectedWager = Math.trunc(treasury * SPECULATE_WAGER_Q / SCALE.Q);
    const result = speculate(p, "grain", 42, 1); // WIN: treasury + wager
    expect(result).toBe(expectedWager);
  });
});

// ── checkDebtCrisis ───────────────────────────────────────────────────────────

describe("checkDebtCrisis", () => {
  test("returns false when there is no debt", () => {
    const p = mkPolity("p", TechEra.Ancient, 10_000);
    expect(checkDebtCrisis(p, createMarket())).toBe(false);
  });

  test("returns false when debt is below threshold", () => {
    const p = mkPolity("p", TechEra.Ancient, 10_000);
    const market = createMarket();
    // threshold = 10_000 × DEBT_CRISIS_RATIO_Q / SCALE.Q = 10_000 × 3000 / 10000 = 3000
    market.debt.set("p", 100); // well below 3000
    expect(checkDebtCrisis(p, market)).toBe(false);
  });

  test("returns true when debt exceeds the ratio threshold", () => {
    const p = mkPolity("p", TechEra.Ancient, 10_000);
    const market = createMarket();
    // threshold = 3000; set debt to 5000
    market.debt.set("p", 5_000);
    expect(checkDebtCrisis(p, market)).toBe(true);
  });

  test("returns true when polity is insolvent (treasury ≤ 0 and any debt)", () => {
    const p = mkPolity("p", TechEra.Ancient, 0);
    const market = createMarket();
    market.debt.set("p", 1);
    expect(checkDebtCrisis(p, market)).toBe(true);
  });

  test("boundary: debt exactly at threshold is not a crisis", () => {
    const p = mkPolity("p", TechEra.Ancient, 10_000);
    const market = createMarket();
    const threshold = Math.trunc(10_000 * DEBT_CRISIS_RATIO_Q / SCALE.Q);
    market.debt.set("p", threshold); // at exactly threshold — not over
    expect(checkDebtCrisis(p, market)).toBe(false);
  });
});

// ── economicWarfare ───────────────────────────────────────────────────────────

describe("economicWarfare", () => {
  test("supply of the targeted commodity increases", () => {
    const pA = mkPolity("aggressor", TechEra.Ancient, 50_000);
    const pB = mkPolity("target",    TechEra.Ancient, 50_000);
    const reg = mkRegistry(pA, pB);
    const market = createMarket();
    const before = market.prices.get("iron")!.supply_Q;
    economicWarfare("aggressor", "target", "iron", reg, market, [mkPair("aggressor", "target")]);
    expect(market.prices.get("iron")!.supply_Q).toBeGreaterThan(before);
  });

  test("price of the targeted commodity decreases", () => {
    const pA = mkPolity("aggressor", TechEra.Ancient, 50_000);
    const pB = mkPolity("target",    TechEra.Ancient, 50_000);
    const reg = mkRegistry(pA, pB);
    const market = createMarket();
    const before = market.prices.get("iron")!.price_Q;
    economicWarfare("aggressor", "target", "iron", reg, market, [mkPair("aggressor", "target")]);
    expect(market.prices.get("iron")!.price_Q).toBeLessThan(before);
  });

  test("aggressor pays a treasury cost", () => {
    const pA = mkPolity("aggressor", TechEra.Ancient, 50_000);
    const pB = mkPolity("target",    TechEra.Ancient, 50_000);
    const reg = mkRegistry(pA, pB);
    const result = economicWarfare("aggressor", "target", "iron", reg, createMarket(), [mkPair("aggressor", "target")]);
    expect(result.aggressorCost_cu).toBeGreaterThan(0);
    expect(pA.treasury_cu).toBeLessThan(50_000);
  });

  test("no-op if commodity requires higher tech era than aggressor", () => {
    const pA = mkPolity("aggressor", TechEra.Prehistoric, 50_000); // can't produce manufactured
    const pB = mkPolity("target",    TechEra.EarlyModern, 50_000);
    const reg = mkRegistry(pA, pB);
    const market = createMarket();
    const before = market.prices.get("manufactured")!.price_Q;
    const result = economicWarfare("aggressor", "target", "manufactured", reg, market, [mkPair("aggressor", "target")]);
    expect(result.aggressorCost_cu).toBe(0);
    expect(result.priceDrop_Q).toBe(0);
    expect(market.prices.get("manufactured")!.price_Q).toBe(before);
  });

  test("no-op if aggressor not in registry", () => {
    const pB = mkPolity("target", TechEra.Ancient, 50_000);
    const reg = mkRegistry(pB);
    const market = createMarket();
    const result = economicWarfare("ghost", "target", "iron", reg, market, []);
    expect(result.aggressorCost_cu).toBe(0);
  });

  test("result contains non-zero priceDrop_Q", () => {
    const pA = mkPolity("a", TechEra.Medieval, 50_000);
    const pB = mkPolity("b", TechEra.Medieval, 50_000);
    const reg = mkRegistry(pA, pB);
    const result = economicWarfare("a", "b", "arcane", reg, createMarket(), [mkPair("a", "b")]);
    expect(result.priceDrop_Q).toBeGreaterThan(0);
  });
});

// ── deriveEconomicPressure ────────────────────────────────────────────────────

describe("deriveEconomicPressure", () => {
  test("healthy polity (no debt, no wars, normal prices) has low pressure", () => {
    const p = mkPolity("p", TechEra.Ancient, 50_000);
    const market = createMarket();
    const reg = mkRegistry(p);
    const pressure = deriveEconomicPressure(p, market, reg);
    expect(pressure).toBe(0);
  });

  test("increases with debt load", () => {
    const pNo = mkPolity("no_debt",  TechEra.Ancient, 10_000);
    const pHi = mkPolity("hi_debt",  TechEra.Ancient, 10_000);
    const market = createMarket();
    const reg = mkRegistry(pNo, pHi);
    market.debt.set("hi_debt", 50_000); // massive debt
    const low  = deriveEconomicPressure(pNo, market, reg);
    const high = deriveEconomicPressure(pHi, market, reg);
    expect(high).toBeGreaterThan(low);
  });

  test("increases with active wars", () => {
    const pPeace = mkPolity("peace", TechEra.Ancient, 10_000);
    const pWar1  = mkPolity("war1",  TechEra.Ancient, 10_000);
    const pWar2  = mkPolity("war2",  TechEra.Ancient, 10_000);
    const market = createMarket();
    const reg = mkRegistry(pPeace, pWar1, pWar2);
    reg.activeWars.add("war1:war2");
    const pressurePeace = deriveEconomicPressure(pPeace, market, reg);
    const pressureWar   = deriveEconomicPressure(pWar1,  market, reg);
    expect(pressureWar).toBeGreaterThan(pressurePeace);
  });

  test("clamped to [0, SCALE.Q]", () => {
    const p = mkPolity("p", TechEra.EarlyModern, 1);
    const market = createMarket();
    market.debt.set("p", 10_000_000);
    const reg = mkRegistry(p);
    reg.activeWars.add("p:enemy");
    const pressure = deriveEconomicPressure(p, market, reg);
    expect(pressure).toBeGreaterThanOrEqual(0);
    expect(pressure).toBeLessThanOrEqual(SCALE.Q);
  });
});

// ── stepMarket ────────────────────────────────────────────────────────────────

describe("stepMarket", () => {
  test("credits trade income to non-war pair", () => {
    const pA = mkPolity("a", TechEra.Medieval, 5_000);
    const pB = mkPolity("b", TechEra.Medieval, 5_000);
    const reg = mkRegistry(pA, pB);
    const market = createMarket();
    const result = stepMarket(reg, [mkPair("a", "b")], market, 42, 1);
    expect(result.tradeIncome.size).toBeGreaterThan(0);
    expect(pA.treasury_cu).toBeGreaterThan(5_000);
  });

  test("detects crisis polities", () => {
    const p = mkPolity("broke", TechEra.Ancient, 0);
    const reg = mkRegistry(p);
    const market = createMarket();
    market.debt.set("broke", 99_999);
    const result = stepMarket(reg, [], market, 42, 1);
    expect(result.crisisPolities).toContain("broke");
  });

  test("non-crisis polity is not in crisis list", () => {
    const p = mkPolity("rich", TechEra.Ancient, 100_000);
    const reg = mkRegistry(p);
    const result = stepMarket(reg, [], createMarket(), 42, 1);
    expect(result.crisisPolities).not.toContain("rich");
  });

  test("is deterministic — same inputs give same result", () => {
    const pA1 = mkPolity("a", TechEra.Medieval, 5_000);
    const pB1 = mkPolity("b", TechEra.Medieval, 5_000);
    const pA2 = mkPolity("a", TechEra.Medieval, 5_000);
    const pB2 = mkPolity("b", TechEra.Medieval, 5_000);
    const reg1 = mkRegistry(pA1, pB1);
    const reg2 = mkRegistry(pA2, pB2);
    const m1 = createMarket();
    const m2 = createMarket();
    stepMarket(reg1, [mkPair("a", "b")], m1, 13, 7);
    stepMarket(reg2, [mkPair("a", "b")], m2, 13, 7);
    expect(pA1.treasury_cu).toBe(pA2.treasury_cu);
    expect(m1.prices.get("grain")!.price_Q).toBe(m2.prices.get("grain")!.price_Q);
  });
});
