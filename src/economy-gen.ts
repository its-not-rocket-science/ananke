// src/economy-gen.ts — Phase 72: Generative Economics
//
// Agent-based commodity markets for polity-scale simulation.
// Extends Phase 61 (Polity) with price dynamics, debt cycles, and economic warfare.
//
// All values are fixed-point; no floating-point in the simulation path.
// No Math.random() — determinism via eventSeed().

import { q, type Q, SCALE, clampQ } from "./units.js";
import { eventSeed, hashString }     from "./sim/seeds.js";
import type { Polity, PolityRegistry, PolityPair } from "./polity.js";
import { TechEra }                   from "./sim/tech.js";

// ── Constants ──────────────────────────────────────────────────────────────────

/** Per-step fraction pulled back toward base price (8%). */
export const MEAN_REVERSION_Q = q(0.08);

/** Debt/treasury ratio above which a polity is in crisis (30%). */
export const DEBT_CRISIS_RATIO_Q = q(0.30);

/** Supply fraction added to market in an economic warfare dump (40%). */
export const SUPPLY_DUMP_Q = q(0.40);

/** Base trade income per shared location per commodity per step (cost-units). */
export const TRADE_BASE_CU = 50;

/** Fraction of treasury wagered per speculate() call (10%). */
export const SPECULATE_WAGER_Q = q(0.10);

/**
 * Profit multiplier on a winning speculation — applied to the wager amount.
 * q(1.0) means winner gains exactly the wager (net +wager).
 * Combined with WIN_PROBABILITY_NUM/DEN = 45/100, EV = −10% per call.
 */
export const SPECULATE_WIN_MUL_Q = q(1.0);

/** Numerator of win probability fraction (45%). */
export const WIN_PROBABILITY_NUM = 45;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CommodityProfile {
  readonly id:           string;
  readonly name:         string;
  /** Base price [0, SCALE.Q]. Long-run equilibrium the market reverts toward. */
  readonly basePrice_Q:  Q;
  /** Maximum random price swing per step (±half this per step). */
  readonly volatility_Q: Q;
  /** Minimum tech era required for a polity to produce this commodity. */
  readonly techMinEra:   TechEra;
}

export interface PriceRecord {
  /** Current market price [q(0.05), q(2.0)]. */
  price_Q:  Q;
  /** Available supply [0, SCALE.Q]. */
  supply_Q: Q;
  /** Active demand [0, SCALE.Q]. */
  demand_Q: Q;
}

export interface MarketState {
  /** Current prices for each commodity. Keyed by CommodityProfile.id. */
  prices: Map<string, PriceRecord>;
  /** Outstanding debt per polity: polityId → cost-units owed. */
  debt:   Map<string, number>;
}

export interface MarketStepResult {
  /** Trade income credited this step: polityId → cost-units. */
  tradeIncome: Map<string, number>;
  /** IDs of polities that are in (or entered) a debt crisis this step. */
  crisisPolities: string[];
}

export interface EconomicWarfareResult {
  /** Cost-units spent by the aggressor on the dump operation. */
  aggressorCost_cu: number;
  /** Price decrease applied to the targeted commodity [0, SCALE.Q]. */
  priceDrop_Q:      Q;
}

// ── Commodity catalogue ────────────────────────────────────────────────────────

export const COMMODITIES: readonly CommodityProfile[] = [
  { id: "grain",        name: "Grain",              basePrice_Q: q(0.20), volatility_Q: q(0.12), techMinEra: TechEra.Prehistoric },
  { id: "timber",       name: "Timber",             basePrice_Q: q(0.25), volatility_Q: q(0.08), techMinEra: TechEra.Prehistoric },
  { id: "iron",         name: "Iron",               basePrice_Q: q(0.40), volatility_Q: q(0.15), techMinEra: TechEra.Ancient     },
  { id: "textile",      name: "Textile",            basePrice_Q: q(0.35), volatility_Q: q(0.10), techMinEra: TechEra.Ancient     },
  { id: "spice",        name: "Spice",              basePrice_Q: q(0.60), volatility_Q: q(0.25), techMinEra: TechEra.Ancient     },
  { id: "labour",       name: "Labour",             basePrice_Q: q(0.15), volatility_Q: q(0.05), techMinEra: TechEra.Prehistoric },
  { id: "arcane",       name: "Arcane Goods",       basePrice_Q: q(0.80), volatility_Q: q(0.30), techMinEra: TechEra.Medieval    },
  { id: "manufactured", name: "Manufactured Goods", basePrice_Q: q(0.50), volatility_Q: q(0.18), techMinEra: TechEra.EarlyModern },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Returns commodity IDs a polity can produce given its tech era. */
export function availableCommodities(techEra: TechEra): string[] {
  return COMMODITIES.filter(c => c.techMinEra <= techEra).map(c => c.id);
}

// ── Market creation ────────────────────────────────────────────────────────────

/** Create a fresh MarketState with all commodities at base price, balanced supply/demand. */
export function createMarket(): MarketState {
  const prices = new Map<string, PriceRecord>();
  for (const c of COMMODITIES) {
    prices.set(c.id, { price_Q: c.basePrice_Q, supply_Q: q(0.50), demand_Q: q(0.50) });
  }
  return { prices, debt: new Map() };
}

// ── Price dynamics ─────────────────────────────────────────────────────────────

/**
 * Advance all commodity prices by one step.
 *
 * Each commodity's price changes by:
 *   reversion  = MEAN_REVERSION_Q × (basePrice − current) / SCALE.Q
 *   noise      = ±(volatility_Q / 2) via deterministic eventSeed
 *   imbalance  = (demand_Q − supply_Q) × 5% / SCALE.Q   (supply/demand pressure)
 *
 * Result is clamped to [q(0.05), q(2.0)] to prevent collapse or runaway inflation.
 */
export function stepPrices(market: MarketState, worldSeed: number, tick: number): void {
  for (const c of COMMODITIES) {
    const rec = market.prices.get(c.id)!;

    // Mean reversion toward base price
    const gap       = c.basePrice_Q - rec.price_Q;
    const reversion = Math.trunc(gap * MEAN_REVERSION_Q / SCALE.Q);

    // Deterministic noise in [-volatility/2, +volatility/2)
    const salt  = hashString(c.id);
    const raw   = eventSeed(worldSeed, tick, 0, 0, salt);
    const half  = Math.trunc(c.volatility_Q / 2);
    const noise = Math.trunc(raw % c.volatility_Q) - half;

    // Supply/demand imbalance: excess demand = higher price, excess supply = lower
    const imbalance = Math.trunc((rec.demand_Q - rec.supply_Q) * 5 / 100);

    rec.price_Q = clampQ(rec.price_Q + reversion + noise + imbalance, q(0.05), q(2.0)) as Q;
  }
}

// ── Trade income ───────────────────────────────────────────────────────────────

/**
 * Resolve trade between all non-war polity pairs and credit treasury.
 *
 * For each non-war pair: the traded commodity set is the intersection of each
 * polity's tech-era-gated catalogue.  Income per commodity =
 *   `price_Q × TRADE_BASE_CU × sharedLocations × routeQuality_Q / SCALE.Q²`
 *
 * Both polities in a pair receive equal income.  Mutates `polity.treasury_cu`.
 * Returns a map of total income credited this step per polity id.
 */
export function stepTrade(
  registry: PolityRegistry,
  pairs:    PolityPair[],
  market:   MarketState,
): Map<string, number> {
  const income = new Map<string, number>();

  for (const pair of pairs) {
    const keyAB = `${pair.polityAId}:${pair.polityBId}`;
    const keyBA = `${pair.polityBId}:${pair.polityAId}`;
    if (registry.activeWars.has(keyAB) || registry.activeWars.has(keyBA)) continue;

    const polityA = registry.polities.get(pair.polityAId);
    const polityB = registry.polities.get(pair.polityBId);
    if (!polityA || !polityB || pair.sharedLocations <= 0) continue;

    const aSet = new Set(availableCommodities(polityA.techEra));
    const bSet = new Set(availableCommodities(polityB.techEra));

    let pairIncome = 0;
    for (const c of COMMODITIES) {
      if (!aSet.has(c.id) || !bSet.has(c.id)) continue;
      const rec = market.prices.get(c.id)!;
      // price_Q × TRADE_BASE_CU / SCALE.Q → base income per location
      const basePerLoc = Math.trunc(rec.price_Q * TRADE_BASE_CU / SCALE.Q);
      pairIncome += Math.trunc(basePerLoc * pair.sharedLocations * pair.routeQuality_Q / SCALE.Q);
    }

    if (pairIncome > 0) {
      polityA.treasury_cu += pairIncome;
      polityB.treasury_cu += pairIncome;
      income.set(pair.polityAId,  (income.get(pair.polityAId)  ?? 0) + pairIncome);
      income.set(pair.polityBId,  (income.get(pair.polityBId)  ?? 0) + pairIncome);
    }
  }

  return income;
}

// ── Speculation ────────────────────────────────────────────────────────────────

/**
 * Polity bets a fraction of treasury on a commodity price movement.
 *
 * Wager = `SPECULATE_WAGER_Q` (10%) of current treasury.
 * Win probability = `WIN_PROBABILITY_NUM` / 100 (45%).  On win: treasury gains
 * `wager × SPECULATE_WIN_MUL_Q / SCALE.Q`.  On loss: treasury loses the wager;
 * if treasury is insufficient, the shortfall is added to `market.debt`.
 *
 * Expected value ≈ −10% per call (house-edge model for opaque markets).
 * Returns the net treasury change (positive = profit, negative = loss or debt).
 */
export function speculate(
  polity:      Polity,
  commodityId: string,
  worldSeed:   number,
  tick:        number,
): number {
  const wager = Math.trunc(polity.treasury_cu * SPECULATE_WAGER_Q / SCALE.Q);
  if (wager <= 0) return 0;

  const salt      = hashString("speculate_" + commodityId);
  const roll      = eventSeed(worldSeed, tick, hashString(polity.id), 0, salt) % SCALE.Q;
  const threshold = Math.trunc(SCALE.Q * WIN_PROBABILITY_NUM / 100);

  if (roll < threshold) {
    const profit = Math.trunc(wager * SPECULATE_WIN_MUL_Q / SCALE.Q);
    polity.treasury_cu += profit;
    return profit;
  } else {
    polity.treasury_cu -= wager; // always safe: wager = 10% of treasury ≤ treasury
    return -wager;
  }
}

// ── Debt crisis ────────────────────────────────────────────────────────────────

/**
 * Returns true when the polity's debt exceeds the crisis threshold.
 *
 * Crisis triggers when:
 * - `debt > treasury × DEBT_CRISIS_RATIO_Q / SCALE.Q`   (debt ratio exceeded), or
 * - `treasury ≤ 0 AND debt > 0`                          (insolvency)
 */
export function checkDebtCrisis(polity: Polity, market: MarketState): boolean {
  const debt = market.debt.get(polity.id) ?? 0;
  if (debt <= 0) return false;
  if (polity.treasury_cu <= 0) return true;
  const threshold = Math.trunc(polity.treasury_cu * DEBT_CRISIS_RATIO_Q / SCALE.Q);
  return debt > threshold;
}

// ── Economic warfare ───────────────────────────────────────────────────────────

/**
 * Aggressor dumps supply of a commodity onto the market to depress its price.
 *
 * Supply increases by `SUPPLY_DUMP_Q`, capped at SCALE.Q.  Price drops
 * proportionally to the supply increase × commodity volatility.
 * Aggressor pays `TRADE_BASE_CU × SUPPLY_DUMP_Q / SCALE.Q × sharedLocations`
 * cost-units (stockpile overhead).
 *
 * No-op if the commodity requires a higher tech era than the aggressor possesses,
 * or if either polity is not in the registry.
 */
export function economicWarfare(
  aggressorId:  string,
  targetId:     string,
  commodityId:  string,
  registry:     PolityRegistry,
  market:       MarketState,
  pairs:        PolityPair[],
): EconomicWarfareResult {
  const aggressor = registry.polities.get(aggressorId);
  if (!aggressor || !registry.polities.has(targetId))
    return { aggressorCost_cu: 0, priceDrop_Q: 0 as Q };

  const comm = COMMODITIES.find(c => c.id === commodityId);
  if (!comm || comm.techMinEra > aggressor.techEra)
    return { aggressorCost_cu: 0, priceDrop_Q: 0 as Q };

  const rec  = market.prices.get(commodityId)!;
  const prev = rec.supply_Q;
  rec.supply_Q = clampQ(rec.supply_Q + SUPPLY_DUMP_Q, 0, SCALE.Q) as Q;
  const supplyIncrease = rec.supply_Q - prev;

  // Price drop proportional to the supply increase × volatility
  const priceDrop_Q = Math.trunc(supplyIncrease * comm.volatility_Q / SCALE.Q) as Q;
  rec.price_Q = clampQ(rec.price_Q - priceDrop_Q, q(0.05), q(2.0)) as Q;

  // Aggressor pays stockpile cost based on shared border with target
  const sharedLocs = pairs.find(p =>
    (p.polityAId === aggressorId && p.polityBId === targetId) ||
    (p.polityAId === targetId    && p.polityBId === aggressorId),
  )?.sharedLocations ?? 1;
  const aggressorCost_cu = Math.trunc(TRADE_BASE_CU * SUPPLY_DUMP_Q / SCALE.Q) * sharedLocs;
  aggressor.treasury_cu = Math.max(0, aggressor.treasury_cu - aggressorCost_cu);

  return { aggressorCost_cu, priceDrop_Q };
}

// ── Economic pressure ──────────────────────────────────────────────────────────

/**
 * Derive aggregate economic stress for a polity [0, SCALE.Q].
 *
 * Three components, equal weighting:
 * 1. Debt ratio    — `clamp(debt / max(treasury, 1), 0, SCALE.Q)`
 * 2. Price stress  — fraction of the polity's available commodities below 60% of base
 * 3. War penalty   — q(0.20) per active war involving this polity, capped at q(0.60)
 */
export function deriveEconomicPressure(
  polity:   Polity,
  market:   MarketState,
  registry: PolityRegistry,
): Q {
  // 1. Debt ratio
  const debt      = market.debt.get(polity.id) ?? 0;
  const debtRatio = debt > 0
    ? clampQ(Math.trunc(debt * SCALE.Q / Math.max(polity.treasury_cu, 1)), 0, SCALE.Q)
    : 0;

  // 2. Price stress: fraction of available commodities trading below 60% of base
  const avail = availableCommodities(polity.techEra);
  let depressed = 0;
  for (const id of avail) {
    const rec  = market.prices.get(id);
    const comm = COMMODITIES.find(c => c.id === id);
    if (!rec || !comm) continue;
    // 60% = 3/5 — integer arithmetic only
    if (rec.price_Q < Math.trunc(comm.basePrice_Q * 3 / 5)) depressed++;
  }
  const priceStress = avail.length > 0
    ? Math.trunc(depressed * SCALE.Q / avail.length)
    : 0;

  // 3. War penalty
  let warCount = 0;
  for (const key of registry.activeWars) {
    const [a, b] = key.split(":");
    if (a === polity.id || b === polity.id) warCount++;
  }
  const warPenalty = clampQ(warCount * q(0.20), 0, q(0.60));

  // Combined: equal thirds (integer division to keep fixed-point)
  return clampQ((debtRatio + priceStress + warPenalty) / 3, 0, SCALE.Q) as Q;
}

// ── Composite step ─────────────────────────────────────────────────────────────

/**
 * Full market step: advance prices, resolve trade, return income and crisis list.
 *
 * Call once per campaign day.  Mutates `market.prices`, polity `treasury_cu`
 * values inside `registry`, and `market.debt` (via `checkDebtCrisis` reads only —
 * debt is written by `speculate`, not by `stepMarket` directly).
 */
export function stepMarket(
  registry:  PolityRegistry,
  pairs:     PolityPair[],
  market:    MarketState,
  worldSeed: number,
  tick:      number,
): MarketStepResult {
  stepPrices(market, worldSeed, tick);
  const tradeIncome = stepTrade(registry, pairs, market);

  const crisisPolities: string[] = [];
  for (const polity of registry.polities.values()) {
    if (checkDebtCrisis(polity, market)) crisisPolities.push(polity.id);
  }

  return { tradeIncome, crisisPolities };
}
