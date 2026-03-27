// src/monetary.ts — Phase 101: Currency & Monetary Policy
//
// Models coin purity, inflation, and monetary crises at polity scale.
// Rulers can debase coinage (mint extra coins at lower purity) for short-term
// treasury gain, but sustained debasement causes inflation, trade rejection,
// and civil unrest.
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `MonetaryState` stores coin purity and inflation level separately:
//       coinPurity_Q  — intrinsic metal content; affects trade acceptance.
//       inflationLevel_Q — accumulated price inflation; affects purchasing power and unrest.
//   - `stepMonetary` mints extra coins (treasury gain), degrades purity, and accrues
//     inflation; stable policy slowly restores both.
//   - All derived metrics (`purchasingPower_Q`, `tradeMultiplier_Q`, `unrestPressure_Q`)
//     are advisory; callers pass them to Phases 90/92/93 as needed.
//
// Integration:
//   Phase 90 (Unrest):      computeMonetaryUnrest_Q → unrestPressure_Q.
//   Phase 92 (Taxation):    computePurchasingPower_Q → real value of tax revenue.
//   Phase 93 (Campaign):    computeMonetaryTradeMultiplier_Q → tribute / supply costs.
//   Phase 99 (Mercenaries): high inflation → real wage cost rises; host adjusts.
//   Phase 100 (Wonders):    construction costs inflated; host scales contribution.

import { q, SCALE, clampQ, mulDiv } from "./units.js";
import type { Q }                   from "./units.js";
import type { Polity }              from "./polity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Polity monetary policy tier. */
export type CoinagePolicy =
  | "stable"              // no debasement; slow purity recovery, inflation falls
  | "slight_debasement"   // modest extra minting; moderate degradation
  | "heavy_debasement"    // significant extra minting; fast degradation
  | "emergency_printing"; // maximum minting; severe degradation

/**
 * Per-polity monetary state.
 * Store externally (e.g. `Map<string, MonetaryState>`); pass to step each tick.
 */
export interface MonetaryState {
  polityId: string;
  /**
   * Intrinsic coin purity [0, SCALE.Q].
   * Starts at SCALE.Q (pure silver/gold).  Debasement reduces it; stable
   * policy restores it slowly.  Trade partners assess coins by purity.
   */
  coinPurity_Q: Q;
  /**
   * Accumulated price inflation [0, SCALE.Q].
   * Starts at 0 (no inflation).  Rises with debasement; falls slowly under
   * stable policy.  Drives purchasing power loss and unrest.
   */
  inflationLevel_Q: Q;
  /**
   * `true` when `inflationLevel_Q >= MONETARY_CRISIS_THRESHOLD_Q`.
   * In crisis: purchasing power collapses; trade partners sharply discount coins.
   */
  monetaryCrisis: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Inflation level at which monetary crisis activates [Q]. */
export const MONETARY_CRISIS_THRESHOLD_Q: Q = q(0.60) as Q;

/**
 * Maximum unrest pressure from inflation at full inflation level [Q].
 * Scales linearly: 0 at no inflation, `MONETARY_MAX_UNREST_Q` at SCALE.Q.
 */
export const MONETARY_MAX_UNREST_Q: Q = q(0.25) as Q;

/**
 * Minimum trade acceptance multiplier even with near-zero coin purity [Q].
 * Barter / commodity exchange prevents complete trade collapse.
 */
export const MONETARY_TRADE_FLOOR_Q: Q = q(0.40) as Q;

/**
 * Coin purity change per day by policy [out of SCALE.Q].
 * Positive = recovery; negative = degradation.
 */
export const POLICY_PURITY_DELTA_PER_DAY: Record<CoinagePolicy, number> = {
  stable:              +3,
  slight_debasement:   -5,
  heavy_debasement:    -18,
  emergency_printing:  -40,
};

/**
 * Inflation change per day by policy [out of SCALE.Q].
 * Positive = inflation rising; negative = inflation falling.
 */
export const POLICY_INFLATION_DELTA_PER_DAY: Record<CoinagePolicy, number> = {
  stable:              -3,
  slight_debasement:   +6,
  heavy_debasement:    +20,
  emergency_printing:  +50,
};

/**
 * Extra coins minted per day as a fraction of current treasury [out of SCALE.Q].
 * `gain_cu = round(treasury_cu × mintFrac × elapsedDays / SCALE.Q)`
 */
export const POLICY_DAILY_MINT_FRAC_Q: Record<CoinagePolicy, number> = {
  stable:              0,
  slight_debasement:   3,   // +0.03%/day ≈ +11%/year
  heavy_debasement:    10,  // +0.10%/day ≈ +37%/year
  emergency_printing:  30,  // +0.30%/day ≈ +110%/year
};

// ── Factory ───────────────────────────────────────────────────────────────────

/** Create a fresh `MonetaryState` with full purity and zero inflation. */
export function createMonetaryState(polityId: string): MonetaryState {
  return {
    polityId,
    coinPurity_Q:     SCALE.Q as Q,
    inflationLevel_Q: 0 as Q,
    monetaryCrisis:   false,
  };
}

// ── Advisory metrics ──────────────────────────────────────────────────────────

/**
 * Compute the effective purchasing power of treasury coins [0, SCALE.Q].
 *
 * `purchasingPower = coinPurity_Q × (SCALE.Q − inflationLevel_Q) / SCALE.Q`
 *
 * Use to scale the real value of treasury income, mercenary wages, and
 * construction costs.  Returns q(0.05) minimum to avoid zero.
 */
export function computePurchasingPower_Q(state: MonetaryState): Q {
  const deflated = clampQ(SCALE.Q - state.inflationLevel_Q, 0, SCALE.Q);
  const pp       = mulDiv(state.coinPurity_Q, deflated, SCALE.Q);
  return clampQ(pp, q(0.05), SCALE.Q);
}

/**
 * Compute the trade acceptance multiplier [MONETARY_TRADE_FLOOR_Q, SCALE.Q].
 *
 * Foreign trade partners check coin purity:
 * `multiplier = TRADE_FLOOR + mulDiv(SCALE.Q − TRADE_FLOOR, coinPurity_Q, SCALE.Q)`
 *
 * Pass as a multiplier on Phase-92 trade income.
 */
export function computeMonetaryTradeMultiplier_Q(state: MonetaryState): Q {
  const floor = MONETARY_TRADE_FLOOR_Q;
  const range = SCALE.Q - floor;
  return clampQ(floor + mulDiv(range, state.coinPurity_Q, SCALE.Q), floor, SCALE.Q);
}

/**
 * Compute unrest pressure from inflation [0, MONETARY_MAX_UNREST_Q].
 *
 * `unrest = mulDiv(MONETARY_MAX_UNREST_Q, inflationLevel_Q, SCALE.Q)`
 *
 * Pass to Phase-90 `computeUnrestLevel`.
 */
export function computeMonetaryUnrest_Q(state: MonetaryState): Q {
  return clampQ(mulDiv(MONETARY_MAX_UNREST_Q, state.inflationLevel_Q, SCALE.Q), 0, MONETARY_MAX_UNREST_Q);
}

/**
 * Compute the extra treasury that would be minted by a debasement step
 * without mutating state.  Advisory / preview function.
 */
export function computeDebasementGain_cu(
  polity:      Polity,
  policy:      CoinagePolicy,
  elapsedDays: number,
): number {
  const mintFrac = POLICY_DAILY_MINT_FRAC_Q[policy];
  if (mintFrac === 0) return 0;
  return Math.round(polity.treasury_cu * mintFrac * elapsedDays / SCALE.Q);
}

// ── State step ────────────────────────────────────────────────────────────────

/**
 * Advance monetary state by `elapsedDays` under the given policy.
 *
 * 1. Mints extra coins: `treasury += computeDebasementGain_cu(polity, policy, elapsedDays)`.
 * 2. Updates `coinPurity_Q` by `POLICY_PURITY_DELTA_PER_DAY × elapsedDays`; clamped [0, SCALE.Q].
 * 3. Updates `inflationLevel_Q` by `POLICY_INFLATION_DELTA_PER_DAY × elapsedDays`; clamped [0, SCALE.Q].
 * 4. Sets `monetaryCrisis = inflationLevel_Q >= MONETARY_CRISIS_THRESHOLD_Q`.
 *
 * Mutates `polity.treasury_cu`, `state.coinPurity_Q`, `state.inflationLevel_Q`,
 * and `state.monetaryCrisis`.
 */
export function stepMonetary(
  polity:      Polity,
  state:       MonetaryState,
  policy:      CoinagePolicy,
  elapsedDays: number,
): void {
  // Mint gain
  const gain = computeDebasementGain_cu(polity, policy, elapsedDays);
  polity.treasury_cu += gain;

  // Purity update
  const purityDelta = POLICY_PURITY_DELTA_PER_DAY[policy] * elapsedDays;
  state.coinPurity_Q = clampQ(state.coinPurity_Q + purityDelta, 0, SCALE.Q) as Q;

  // Inflation update
  const inflDelta = POLICY_INFLATION_DELTA_PER_DAY[policy] * elapsedDays;
  state.inflationLevel_Q = clampQ(state.inflationLevel_Q + inflDelta, 0, SCALE.Q) as Q;

  // Crisis flag
  state.monetaryCrisis = state.inflationLevel_Q >= MONETARY_CRISIS_THRESHOLD_Q;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return `true` when the polity is in monetary crisis (high inflation). */
export function isMonetaryCrisis(state: MonetaryState): boolean {
  return state.monetaryCrisis;
}

/** Return `true` when coin purity is at or above the given threshold. */
export function isCoinageSound(state: MonetaryState, threshold_Q: Q = q(0.80) as Q): boolean {
  return state.coinPurity_Q >= threshold_Q;
}
