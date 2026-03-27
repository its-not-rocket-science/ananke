// src/trade-routes.ts — Phase 83: Trade Routes & Inter-Polity Commerce
//
// World-scale bilateral trade routes between polities. Each route has an
// annual base volume (cost-units), a current efficiency score, and optional
// treaty / seasonal multipliers supplied by the host.
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - Route keys are canonical (sorted polity IDs) — symmetric lookup.
//   - Trade is mutually beneficial: both polities earn income each day.
//   - `disruptRoute` integrates with Phase 82 (espionage) and Phase 61 (war).
//   - `TREATY_TRADE_BONUS_Q` rewards Phase-80 trade pacts without a direct import.

import type { Polity }    from "./polity.js";
import { q, SCALE, clampQ } from "./units.js";
import type { Q }         from "./units.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A bilateral trade route between two polities.
 * Both parties earn income each day a route is active.
 */
export interface TradeRoute {
  /** Canonical key (sorted polity IDs). */
  routeId:         string;
  polityAId:       string;
  polityBId:       string;
  /**
   * Annual trade value in cost-units at full efficiency.
   * Each polity earns `floor(baseVolume_cu × efficiency / 365)` per day.
   */
  baseVolume_cu:   number;
  /**
   * Current route health [0, SCALE.Q].
   * Below `ROUTE_VIABLE_THRESHOLD` the route is considered inactive.
   */
  efficiency_Q:    Q;
  /** Simulation tick (day) when the route was established. */
  establishedTick: number;
}

/** Registry of all active trade routes. */
export interface TradeRegistry {
  routes: Map<string, TradeRoute>;
}

/** Daily income produced for both polities from a single route resolution. */
export interface TradeIncome {
  incomeA_cu: number;
  incomeB_cu: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Route efficiency below this → `isRouteViable` returns false. */
export const ROUTE_VIABLE_THRESHOLD: Q = q(0.10);

/** Daily efficiency decay (without maintenance). */
export const ROUTE_DECAY_PER_DAY: Q = q(0.001);

/** Multiplier applied to both parties' income when a trade pact is active. */
export const TREATY_TRADE_BONUS_Q: Q = q(0.20);

/** Days per year used in the daily trade fraction calculation. */
export const TRADE_DAYS_PER_YEAR = 365;

// ── Factory ───────────────────────────────────────────────────────────────────

export function createTradeRegistry(): TradeRegistry {
  return { routes: new Map() };
}

// ── Key helper ─────────────────────────────────────────────────────────────────

/**
 * Canonical route key — independent of argument order.
 * Polity IDs are sorted lexicographically so `key(A,B) === key(B,A)`.
 */
export function routeKey(polityAId: string, polityBId: string): string {
  const [lo, hi] = polityAId < polityBId
    ? [polityAId, polityBId]
    : [polityBId, polityAId];
  return `${lo}:${hi}`;
}

// ── Route management ───────────────────────────────────────────────────────────

/**
 * Establish a new trade route (or replace an existing one).
 *
 * @param baseVolume_cu Annual trade value in cost-units at 100% efficiency.
 * @param tick          Current simulation tick.
 */
export function establishRoute(
  registry:      TradeRegistry,
  polityAId:     string,
  polityBId:     string,
  baseVolume_cu: number,
  tick:          number = 0,
): TradeRoute {
  const key   = routeKey(polityAId, polityBId);
  const route: TradeRoute = {
    routeId:         key,
    polityAId,
    polityBId,
    baseVolume_cu,
    efficiency_Q:    SCALE.Q as Q,
    establishedTick: tick,
  };
  registry.routes.set(key, route);
  return route;
}

/** Return the route between two polities, or `undefined` if none. */
export function getRoute(
  registry:  TradeRegistry,
  polityAId: string,
  polityBId: string,
): TradeRoute | undefined {
  return registry.routes.get(routeKey(polityAId, polityBId));
}

/** Return all routes involving `polityId` (as either party). */
export function getRoutesForPolity(
  registry: TradeRegistry,
  polityId: string,
): TradeRoute[] {
  return [...registry.routes.values()].filter(
    r => r.polityAId === polityId || r.polityBId === polityId,
  );
}

/** Remove a route from the registry. Returns `true` if found and removed. */
export function abandonRoute(
  registry:  TradeRegistry,
  polityAId: string,
  polityBId: string,
): boolean {
  return registry.routes.delete(routeKey(polityAId, polityBId));
}

// ── Viability ──────────────────────────────────────────────────────────────────

/** Return `true` if the route is efficient enough to trade. */
export function isRouteViable(route: TradeRoute): boolean {
  return route.efficiency_Q >= ROUTE_VIABLE_THRESHOLD;
}

// ── Income computation ─────────────────────────────────────────────────────────

/**
 * Compute the daily trade income for both polities from one route.
 *
 * Formula:
 *   base = floor(baseVolume_cu × efficiency_Q / SCALE.Q / TRADE_DAYS_PER_YEAR)
 *   bonus multiplier = SCALE.Q + (hasTradePact ? TREATY_TRADE_BONUS_Q : 0)
 *   seasonal multiplier = seasonalMul_Q (default SCALE.Q = no modification)
 *   income = floor(base × bonusMul / SCALE.Q × seasonalMul / SCALE.Q)
 *
 * Returns `{ incomeA_cu: 0, incomeB_cu: 0 }` if the route is not viable.
 *
 * @param hasTradePact  True if a Phase-80 trade_pact treaty is active between the pair.
 * @param seasonalMul_Q Phase-78 seasonal modifier (default SCALE.Q = no change).
 */
export function computeDailyTradeIncome(
  route:         TradeRoute,
  hasTradePact:  boolean = false,
  seasonalMul_Q: Q       = SCALE.Q as Q,
): TradeIncome {
  if (!isRouteViable(route)) return { incomeA_cu: 0, incomeB_cu: 0 };

  const effBase   = Math.floor(route.baseVolume_cu * route.efficiency_Q / SCALE.Q / TRADE_DAYS_PER_YEAR);
  const bonusMul  = SCALE.Q + (hasTradePact ? TREATY_TRADE_BONUS_Q : 0);
  const withBonus = Math.floor(effBase * bonusMul / SCALE.Q);
  const income    = Math.floor(withBonus * seasonalMul_Q / SCALE.Q);

  return { incomeA_cu: income, incomeB_cu: income };
}

/**
 * Apply one day of trade: add computed income to both polity treasuries.
 * Mutates both polity objects.
 * Returns the `TradeIncome` applied (both zero if route not viable).
 */
export function applyDailyTrade(
  polityA:       Polity,
  polityB:       Polity,
  route:         TradeRoute,
  hasTradePact:  boolean = false,
  seasonalMul_Q: Q       = SCALE.Q as Q,
): TradeIncome {
  const income = computeDailyTradeIncome(route, hasTradePact, seasonalMul_Q);
  polityA.treasury_cu += income.incomeA_cu;
  polityB.treasury_cu += income.incomeB_cu;
  return income;
}

// ── Efficiency dynamics ────────────────────────────────────────────────────────

/**
 * Advance route efficiency by one simulated day.
 * Decays at `ROUTE_DECAY_PER_DAY`; `boostDelta_Q` is an optional signed
 * daily bonus (e.g., from road maintenance, diplomatic investment).
 * Mutates `route.efficiency_Q`.
 */
export function stepRouteEfficiency(
  route:        TradeRoute,
  boostDelta_Q: Q = 0 as Q,
): void {
  route.efficiency_Q = clampQ(
    route.efficiency_Q - ROUTE_DECAY_PER_DAY + boostDelta_Q,
    0,
    SCALE.Q,
  );
}

/**
 * Reinforce a route (e.g., road investment, diplomatic summit).
 * Clamps to [0, SCALE.Q].
 */
export function reinforceRoute(route: TradeRoute, deltaQ: Q): void {
  route.efficiency_Q = clampQ(route.efficiency_Q + deltaQ, 0, SCALE.Q);
}

/**
 * Disrupt a route by reducing efficiency by `disruption_Q`.
 * Used by callers applying espionage results (Phase 82), war declarations,
 * or hazard events.
 * Clamps to 0.
 */
export function disruptRoute(route: TradeRoute, disruption_Q: Q): void {
  route.efficiency_Q = clampQ(route.efficiency_Q - disruption_Q, 0, SCALE.Q);
}

// ── Network summary ────────────────────────────────────────────────────────────

/**
 * Compute the total annual trade volume flowing through all viable routes
 * for a given polity (sum of `baseVolume_cu × efficiency_Q / SCALE.Q`).
 * Useful for AI and diplomatic valuation.
 */
export function computeAnnualTradeVolume(
  registry: TradeRegistry,
  polityId: string,
): number {
  return getRoutesForPolity(registry, polityId)
    .filter(isRouteViable)
    .reduce((sum, r) => sum + Math.floor(r.baseVolume_cu * r.efficiency_Q / SCALE.Q), 0);
}
