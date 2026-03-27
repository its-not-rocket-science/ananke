// test/trade-routes.test.ts — Phase 83: Trade Routes & Inter-Polity Commerce

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import type { Q } from "../src/units.js";
import {
  ROUTE_VIABLE_THRESHOLD,
  ROUTE_DECAY_PER_DAY,
  TREATY_TRADE_BONUS_Q,
  TRADE_DAYS_PER_YEAR,
  createTradeRegistry,
  routeKey,
  establishRoute,
  getRoute,
  getRoutesForPolity,
  abandonRoute,
  isRouteViable,
  computeDailyTradeIncome,
  applyDailyTrade,
  stepRouteEfficiency,
  reinforceRoute,
  disruptRoute,
  computeAnnualTradeVolume,
} from "../src/trade-routes.js";
import { createPolity } from "../src/polity.js";

// ── helpers ────────────────────────────────────────────────────────────────────

function makePolity(id: string, treasury: number) {
  return createPolity(id, id, "f1", [], 1000, treasury, "Medieval");
}

// ── createTradeRegistry ────────────────────────────────────────────────────────

describe("createTradeRegistry", () => {
  it("creates empty routes map", () => {
    expect(createTradeRegistry().routes.size).toBe(0);
  });
});

// ── routeKey ───────────────────────────────────────────────────────────────────

describe("routeKey", () => {
  it("is symmetric", () => {
    expect(routeKey("A", "B")).toBe(routeKey("B", "A"));
  });

  it("differs for different pairs", () => {
    expect(routeKey("A", "B")).not.toBe(routeKey("A", "C"));
  });
});

// ── establishRoute ─────────────────────────────────────────────────────────────

describe("establishRoute", () => {
  it("creates route at full efficiency", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 365_000);
    expect(route.efficiency_Q).toBe(SCALE.Q);
    expect(route.baseVolume_cu).toBe(365_000);
    expect(route.polityAId).toBe("A");
    expect(route.polityBId).toBe("B");
    expect(route.establishedTick).toBe(0);
  });

  it("stores route in registry", () => {
    const r = createTradeRegistry();
    establishRoute(r, "A", "B", 100_000);
    expect(r.routes.size).toBe(1);
  });

  it("replaces existing route on re-establish", () => {
    const r = createTradeRegistry();
    establishRoute(r, "A", "B", 100_000, 0);
    establishRoute(r, "A", "B", 200_000, 10);
    expect(r.routes.size).toBe(1);
    expect(getRoute(r, "A", "B")!.baseVolume_cu).toBe(200_000);
  });

  it("sets tick", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 50_000, 99);
    expect(route.establishedTick).toBe(99);
  });
});

// ── getRoute ───────────────────────────────────────────────────────────────────

describe("getRoute", () => {
  it("returns route for known pair", () => {
    const r = createTradeRegistry();
    establishRoute(r, "A", "B", 100_000);
    expect(getRoute(r, "A", "B")).toBeDefined();
  });

  it("is symmetric", () => {
    const r = createTradeRegistry();
    establishRoute(r, "A", "B", 100_000);
    expect(getRoute(r, "B", "A")).toBeDefined();
  });

  it("returns undefined for unknown pair", () => {
    const r = createTradeRegistry();
    expect(getRoute(r, "A", "B")).toBeUndefined();
  });
});

// ── getRoutesForPolity ─────────────────────────────────────────────────────────

describe("getRoutesForPolity", () => {
  it("returns all routes for polity", () => {
    const r = createTradeRegistry();
    establishRoute(r, "A", "B", 100_000);
    establishRoute(r, "A", "C", 200_000);
    establishRoute(r, "B", "C", 150_000);
    expect(getRoutesForPolity(r, "A")).toHaveLength(2);
    expect(getRoutesForPolity(r, "B")).toHaveLength(2);
    expect(getRoutesForPolity(r, "C")).toHaveLength(2);
  });

  it("returns empty for polity with no routes", () => {
    const r = createTradeRegistry();
    expect(getRoutesForPolity(r, "X")).toHaveLength(0);
  });
});

// ── abandonRoute ──────────────────────────────────────────────────────────────

describe("abandonRoute", () => {
  it("removes route and returns true", () => {
    const r = createTradeRegistry();
    establishRoute(r, "A", "B", 100_000);
    expect(abandonRoute(r, "A", "B")).toBe(true);
    expect(r.routes.size).toBe(0);
  });

  it("returns false for unknown route", () => {
    const r = createTradeRegistry();
    expect(abandonRoute(r, "A", "B")).toBe(false);
  });

  it("is symmetric", () => {
    const r = createTradeRegistry();
    establishRoute(r, "A", "B", 100_000);
    expect(abandonRoute(r, "B", "A")).toBe(true);
  });
});

// ── isRouteViable ──────────────────────────────────────────────────────────────

describe("isRouteViable", () => {
  it("full efficiency → viable", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 100_000);
    expect(isRouteViable(route)).toBe(true);
  });

  it("at ROUTE_VIABLE_THRESHOLD → viable", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 100_000);
    route.efficiency_Q = ROUTE_VIABLE_THRESHOLD;
    expect(isRouteViable(route)).toBe(true);
  });

  it("below ROUTE_VIABLE_THRESHOLD → not viable", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 100_000);
    route.efficiency_Q = (ROUTE_VIABLE_THRESHOLD - 1) as Q;
    expect(isRouteViable(route)).toBe(false);
  });

  it("zero efficiency → not viable", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 100_000);
    route.efficiency_Q = 0 as Q;
    expect(isRouteViable(route)).toBe(false);
  });
});

// ── computeDailyTradeIncome ────────────────────────────────────────────────────

describe("computeDailyTradeIncome", () => {
  it("at full efficiency, income ≈ baseVolume / 365", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 365_000);
    const { incomeA_cu, incomeB_cu } = computeDailyTradeIncome(route);
    expect(incomeA_cu).toBe(1000);
    expect(incomeB_cu).toBe(1000);
  });

  it("both parties earn the same amount", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 730_000);
    const { incomeA_cu, incomeB_cu } = computeDailyTradeIncome(route);
    expect(incomeA_cu).toBe(incomeB_cu);
  });

  it("trade pact bonus increases income", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 365_000);
    const noPact  = computeDailyTradeIncome(route, false);
    const withPact = computeDailyTradeIncome(route, true);
    expect(withPact.incomeA_cu).toBeGreaterThan(noPact.incomeA_cu);
  });

  it("seasonal multiplier scales income", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 365_000);
    const full    = computeDailyTradeIncome(route, false, SCALE.Q as Q);
    const halved  = computeDailyTradeIncome(route, false, q(0.50));
    expect(halved.incomeA_cu).toBeLessThan(full.incomeA_cu);
  });

  it("zero seasonal multiplier → zero income", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 365_000);
    const { incomeA_cu } = computeDailyTradeIncome(route, false, 0 as Q);
    expect(incomeA_cu).toBe(0);
  });

  it("returns zeros for non-viable route", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 365_000);
    route.efficiency_Q = 0 as Q;
    const { incomeA_cu, incomeB_cu } = computeDailyTradeIncome(route);
    expect(incomeA_cu).toBe(0);
    expect(incomeB_cu).toBe(0);
  });

  it("lower efficiency → lower income", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 365_000);
    const full = computeDailyTradeIncome(route);
    route.efficiency_Q = q(0.50);
    const half = computeDailyTradeIncome(route);
    expect(half.incomeA_cu).toBeLessThan(full.incomeA_cu);
  });
});

// ── applyDailyTrade ────────────────────────────────────────────────────────────

describe("applyDailyTrade", () => {
  it("increases both polity treasuries", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 365_000);
    const a = makePolity("A", 0);
    const b = makePolity("B", 0);
    const income = applyDailyTrade(a, b, route);
    expect(income.incomeA_cu).toBe(1000);
    expect(a.treasury_cu).toBe(1000);
    expect(b.treasury_cu).toBe(1000);
  });

  it("no-op if route not viable", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 365_000);
    route.efficiency_Q = 0 as Q;
    const a = makePolity("A", 500);
    const b = makePolity("B", 500);
    applyDailyTrade(a, b, route);
    expect(a.treasury_cu).toBe(500);
    expect(b.treasury_cu).toBe(500);
  });

  it("trade pact increases treasury gain", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 365_000);
    const a1 = makePolity("A", 0); const b1 = makePolity("B", 0);
    const a2 = makePolity("C", 0); const b2 = makePolity("D", 0);
    applyDailyTrade(a1, b1, route, false);
    applyDailyTrade(a2, b2, route, true);
    expect(a2.treasury_cu).toBeGreaterThan(a1.treasury_cu);
  });
});

// ── stepRouteEfficiency ────────────────────────────────────────────────────────

describe("stepRouteEfficiency", () => {
  it("decays efficiency each day", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 100_000);
    const before = route.efficiency_Q;
    stepRouteEfficiency(route);
    expect(route.efficiency_Q).toBe(before - ROUTE_DECAY_PER_DAY);
  });

  it("boost reduces net decay", () => {
    const r = createTradeRegistry();
    const r1 = establishRoute(r, "A", "B", 100_000);
    const r2 = { ...r1 };
    stepRouteEfficiency(r1, 0 as Q);
    stepRouteEfficiency(r2, q(0.005));
    expect(r2.efficiency_Q).toBeGreaterThan(r1.efficiency_Q);
  });

  it("cannot go below 0", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 100_000);
    route.efficiency_Q = 0 as Q;
    stepRouteEfficiency(route);
    expect(route.efficiency_Q).toBe(0);
  });

  it("cannot exceed SCALE.Q", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 100_000);
    route.efficiency_Q = q(0.999);
    stepRouteEfficiency(route, q(0.10));
    expect(route.efficiency_Q).toBeLessThanOrEqual(SCALE.Q);
  });
});

// ── reinforceRoute ─────────────────────────────────────────────────────────────

describe("reinforceRoute", () => {
  it("increases efficiency", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 100_000);
    route.efficiency_Q = q(0.50);
    reinforceRoute(route, q(0.20));
    expect(route.efficiency_Q).toBe(q(0.70));
  });

  it("clamps to SCALE.Q", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 100_000);
    reinforceRoute(route, q(0.50)); // already at SCALE.Q
    expect(route.efficiency_Q).toBe(SCALE.Q);
  });

  it("clamps to 0 for negative delta", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 100_000);
    route.efficiency_Q = q(0.05);
    reinforceRoute(route, -q(0.50));
    expect(route.efficiency_Q).toBe(0);
  });
});

// ── disruptRoute ───────────────────────────────────────────────────────────────

describe("disruptRoute", () => {
  it("reduces efficiency", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 100_000);
    disruptRoute(route, q(0.30));
    expect(route.efficiency_Q).toBe(q(0.70));
  });

  it("can push route below viable threshold (disruption = shutdown)", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 100_000);
    disruptRoute(route, q(0.95));
    expect(isRouteViable(route)).toBe(false);
  });

  it("clamps to 0, not negative", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 100_000);
    disruptRoute(route, (SCALE.Q * 2) as Q);
    expect(route.efficiency_Q).toBe(0);
  });
});

// ── computeAnnualTradeVolume ───────────────────────────────────────────────────

describe("computeAnnualTradeVolume", () => {
  it("returns 0 for polity with no routes", () => {
    const r = createTradeRegistry();
    expect(computeAnnualTradeVolume(r, "A")).toBe(0);
  });

  it("sums viable route volumes", () => {
    const r = createTradeRegistry();
    establishRoute(r, "A", "B", 100_000);
    establishRoute(r, "A", "C", 200_000);
    const vol = computeAnnualTradeVolume(r, "A");
    // Both at full efficiency → 100_000 + 200_000
    expect(vol).toBe(300_000);
  });

  it("excludes non-viable routes", () => {
    const r = createTradeRegistry();
    const r1 = establishRoute(r, "A", "B", 100_000);
    establishRoute(r, "A", "C", 200_000);
    r1.efficiency_Q = 0 as Q;
    const vol = computeAnnualTradeVolume(r, "A");
    expect(vol).toBe(200_000);
  });

  it("polity with more routes has higher volume", () => {
    const r = createTradeRegistry();
    establishRoute(r, "A", "B", 100_000);
    establishRoute(r, "A", "C", 100_000);
    establishRoute(r, "A", "D", 100_000); // A has 3 routes
    establishRoute(r, "B", "C", 100_000); // B has 2 routes
    expect(computeAnnualTradeVolume(r, "A")).toBeGreaterThan(
      computeAnnualTradeVolume(r, "B"),
    );
  });
});

// ── constants sanity ───────────────────────────────────────────────────────────

describe("constants", () => {
  it("ROUTE_VIABLE_THRESHOLD = q(0.10)", () => {
    expect(ROUTE_VIABLE_THRESHOLD).toBe(q(0.10));
  });

  it("TREATY_TRADE_BONUS_Q = q(0.20)", () => {
    expect(TREATY_TRADE_BONUS_Q).toBe(q(0.20));
  });

  it("TRADE_DAYS_PER_YEAR = 365", () => {
    expect(TRADE_DAYS_PER_YEAR).toBe(365);
  });

  it("ROUTE_DECAY_PER_DAY > 0 and < q(0.01)", () => {
    expect(ROUTE_DECAY_PER_DAY).toBeGreaterThan(0);
    expect(ROUTE_DECAY_PER_DAY).toBeLessThan(q(0.01));
  });
});

// ── integration: route lifecycle ───────────────────────────────────────────────

describe("route lifecycle", () => {
  it("365 days of trade at full efficiency = baseVolume (±floors)", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 365_000);
    const a = makePolity("A", 0);
    const b = makePolity("B", 0);
    for (let day = 0; day < 365; day++) {
      applyDailyTrade(a, b, route);
    }
    // 1000/day × 365 = 365_000
    expect(a.treasury_cu).toBe(365_000);
    expect(b.treasury_cu).toBe(365_000);
  });

  it("route decays to non-viable after many days without maintenance", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 100_000);
    // decay q(0.001)/day, viable threshold q(0.10)
    // days = (1.0 - 0.10) / 0.001 = 900 days
    for (let day = 0; day < 901; day++) stepRouteEfficiency(route);
    expect(isRouteViable(route)).toBe(false);
  });

  it("maintenance keeps route viable indefinitely", () => {
    const r = createTradeRegistry();
    const route = establishRoute(r, "A", "B", 100_000);
    // maintenance = ROUTE_DECAY_PER_DAY exactly neutralises decay
    for (let day = 0; day < 1000; day++) {
      stepRouteEfficiency(route, ROUTE_DECAY_PER_DAY);
    }
    expect(isRouteViable(route)).toBe(true);
  });
});
