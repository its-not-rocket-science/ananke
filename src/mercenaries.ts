// src/mercenaries.ts — Phase 99: Mercenaries & Hired Forces
//
// Professional soldiers hired from the treasury.  Mercenaries augment polity
// armies with high-quality fighters but demand regular wages; unpaid bands
// lose loyalty and eventually desert.
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `MercenaryBand` is an immutable descriptor (could represent an NPC faction
//     or a persistent world actor).
//   - `MercenaryContract` is the mutable live state; host stores one per hired band.
//   - Loyalty drives both effectiveness and desertion risk.
//   - `stepMercenaryContract` pays wages, accrues arrears, decays/grows loyalty,
//     and rolls desertion via `eventSeed` for full determinism.
//   - `computeMercenaryStrengthContribution` returns an advisory [0, SCALE.Q]
//     bonus stacked on top of Phase-93 `computeBattleStrength`.
//
// Integration:
//   Phase 92 (Taxation):        daily wage drains `polity.treasury_cu`.
//   Phase 93 (Military Campaign): strength contribution stacks with battle strength.
//   Phase 90 (Unrest):          deserted band may leave unrest pressure (caller-driven).
//   Phase 61 (Polity):          polity.treasury_cu mutated by wage payment.

import { eventSeed }                from "./sim/seeds.js";
import { q, SCALE, clampQ, mulDiv } from "./units.js";
import type { Q }                   from "./units.js";
import type { Polity }              from "./polity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Immutable descriptor for a mercenary band.
 * Create via `createMercenaryBand`; share across multiple contracts if needed.
 */
export interface MercenaryBand {
  bandId:        string;
  name:          string;
  /** Number of soldiers in the band. */
  size:          number;
  /** Combat effectiveness [0, SCALE.Q].  q(0.50) = average militia; q(0.90) = elite. */
  quality_Q:     Q;
  /** Base daily wage per soldier in cost-units. */
  dailyWagePerSoldier_cu: number;
}

/**
 * Live contract state for one hired band.
 * Store externally (e.g. `Map<string, MercenaryContract>`); pass to step each tick.
 */
export interface MercenaryContract {
  contractId:    string;
  polityId:      string;
  bandId:        string;
  /** Days the contract has been active. */
  daysActive:    number;
  /**
   * Current loyalty of the band to this polity [0, SCALE.Q].
   * Grows when paid; decays when in arrears; below DESERT_THRESHOLD → desertion risk.
   */
  loyalty_Q:     Q;
  /**
   * Unpaid wages accumulated [cu].
   * Grows when treasury is insufficient; cleared when back-paid.
   */
  arrears_cu:    number;
}

/** Outcome of a single `stepMercenaryContract` call. */
export interface MercenaryStepResult {
  /** Amount actually paid from treasury this step. */
  wagePaid_cu:   number;
  /** Arrears added this step (0 if fully paid). */
  arrearsAdded_cu: number;
  /** Loyalty change this step (negative = decay, positive = growth). */
  loyaltyDelta:  number;
  /** Whether the band deserted this step. */
  deserted:      boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Loyalty below this → desertion roll fires. */
export const DESERT_LOYALTY_THRESHOLD_Q: Q = q(0.25) as Q;

/** Loyalty decay per day when wages are in arrears [out of SCALE.Q]. */
export const LOYALTY_DECAY_PER_DAY_UNPAID: number = 80;   // q(0.008)/day

/** Loyalty growth per day when wages are paid in full [out of SCALE.Q]. */
export const LOYALTY_GROWTH_PER_DAY_PAID: number = 20;    // q(0.002)/day

/**
 * Loyalty bonus on campaign victory — reward for shared triumph.
 * Caller applies via `applyVictoryLoyaltyBonus`.
 */
export const LOYALTY_VICTORY_BONUS_Q: Q = q(0.10) as Q;

/**
 * Maximum military strength contribution from any single mercenary contract [Q].
 * Prevents a single large band from trivially dominating a polity's army.
 */
export const MAX_MERC_STRENGTH_BONUS_Q: Q = q(0.30) as Q;

/**
 * Daily desertion probability roll threshold when loyalty is at zero [out of SCALE.Q].
 * At loyalty = DESERT_THRESHOLD: ~25% chance/day; scales linearly to 0 at threshold.
 */
export const DESERT_ROLL_MAX: number = 2500;   // 2500/10000 = 25% when loyalty = 0

// ── Factory ───────────────────────────────────────────────────────────────────

/** Create a `MercenaryBand` descriptor. */
export function createMercenaryBand(
  bandId:                 string,
  name:                   string,
  size:                   number,
  quality_Q:              Q,
  dailyWagePerSoldier_cu: number,
): MercenaryBand {
  return {
    bandId,
    name,
    size:                   Math.max(1, size),
    quality_Q:              clampQ(quality_Q, 0, SCALE.Q),
    dailyWagePerSoldier_cu: Math.max(0, dailyWagePerSoldier_cu),
  };
}

/**
 * Hire a mercenary band, creating a contract with initial loyalty.
 *
 * Does NOT deduct an advance payment — caller may pay via `computeMercenaryWage`
 * before the first step if an upfront retainer is desired.
 *
 * @param initialLoyalty_Q  Starting loyalty. Defaults to q(0.70) (neutral-positive hire).
 */
export function hireMercenaries(
  contractId:       string,
  polityId:         string,
  band:             MercenaryBand,
  initialLoyalty_Q: Q = q(0.70) as Q,
): MercenaryContract {
  return {
    contractId,
    polityId,
    bandId:     band.bandId,
    daysActive: 0,
    loyalty_Q:  clampQ(initialLoyalty_Q, 0, SCALE.Q),
    arrears_cu: 0,
  };
}

// ── Cost computation ──────────────────────────────────────────────────────────

/**
 * Compute total wages due for `elapsedDays` days.
 *
 * `wage = band.size × band.dailyWagePerSoldier_cu × elapsedDays`
 */
export function computeMercenaryWage(
  band:        MercenaryBand,
  elapsedDays: number,
): number {
  return band.size * band.dailyWagePerSoldier_cu * elapsedDays;
}

// ── Strength contribution ─────────────────────────────────────────────────────

/**
 * Compute the military strength contribution of a hired band [0, SCALE.Q].
 *
 * Formula: `round(size × quality_Q × loyalty_Q / SCALE.Q²)`, clamped to
 * `MAX_MERC_STRENGTH_BONUS_Q`.
 *
 * Add the result to Phase-93 `computeBattleStrength` output.
 * At full quality and full loyalty: ~q(0.05) per 500 soldiers; caps at q(0.30).
 */
export function computeMercenaryStrengthContribution(
  band:     MercenaryBand,
  contract: MercenaryContract,
): Q {
  const step1 = mulDiv(band.size, band.quality_Q, SCALE.Q);        // size × quality / SCALE
  const step2 = mulDiv(step1, contract.loyalty_Q, SCALE.Q);        // × loyalty / SCALE
  return clampQ(step2, 0, MAX_MERC_STRENGTH_BONUS_Q);
}

// ── Loyalty management ────────────────────────────────────────────────────────

/**
 * Apply a loyalty bonus after a campaign victory.
 * Clamps result to SCALE.Q.
 */
export function applyVictoryLoyaltyBonus(contract: MercenaryContract): void {
  contract.loyalty_Q = clampQ(
    contract.loyalty_Q + LOYALTY_VICTORY_BONUS_Q, 0, SCALE.Q,
  ) as Q;
}

// ── Contract step ─────────────────────────────────────────────────────────────

/**
 * Advance a mercenary contract by `elapsedDays`.
 *
 * Each step:
 * 1. Compute wages due = `computeMercenaryWage(band, elapsedDays)`.
 * 2. Pay as much as `polity.treasury_cu` allows; add remainder to `arrears_cu`.
 * 3. If fully paid: grow loyalty, clear any arrears previously owed.
 *    If in arrears: decay loyalty by `LOYALTY_DECAY_PER_DAY_UNPAID × elapsedDays`.
 * 4. If `loyalty_Q < DESERT_LOYALTY_THRESHOLD_Q`: roll for desertion via `eventSeed`.
 *    Desertion probability scales linearly from `DESERT_ROLL_MAX` at loyalty 0
 *    to 0 at `DESERT_LOYALTY_THRESHOLD_Q`.
 * 5. If deserted: set `loyalty_Q = 0` (signal to caller to remove contract).
 *
 * Mutates `polity.treasury_cu`, `contract.loyalty_Q`, `contract.arrears_cu`,
 * and `contract.daysActive`.
 *
 * @param worldSeed  World-level seed for deterministic desertion roll.
 * @param tick       Current simulation tick (day).
 */
export function stepMercenaryContract(
  contract:    MercenaryContract,
  band:        MercenaryBand,
  polity:      Polity,
  elapsedDays: number,
  worldSeed:   number,
  tick:        number,
): MercenaryStepResult {
  contract.daysActive += elapsedDays;

  // ── 1. Wages due ──────────────────────────────────────────────────────────
  const wageDue = computeMercenaryWage(band, elapsedDays);

  // ── 2. Payment ────────────────────────────────────────────────────────────
  const totalOwed  = wageDue + contract.arrears_cu;
  const paid       = Math.min(totalOwed, polity.treasury_cu);
  polity.treasury_cu -= paid;
  const remaining  = totalOwed - paid;

  const wagePaid_cu    = Math.min(wageDue, paid);
  const arrearsAdded   = wageDue - wagePaid_cu;
  contract.arrears_cu  = remaining;

  // ── 3. Loyalty update ─────────────────────────────────────────────────────
  let loyaltyDelta: number;
  if (remaining === 0) {
    // Fully paid — loyalty grows
    loyaltyDelta = LOYALTY_GROWTH_PER_DAY_PAID * elapsedDays;
  } else {
    // In arrears — loyalty decays
    loyaltyDelta = -(LOYALTY_DECAY_PER_DAY_UNPAID * elapsedDays);
  }
  contract.loyalty_Q = clampQ(contract.loyalty_Q + loyaltyDelta, 0, SCALE.Q) as Q;

  // ── 4. Desertion check ────────────────────────────────────────────────────
  let deserted = false;
  if (contract.loyalty_Q < DESERT_LOYALTY_THRESHOLD_Q) {
    // Probability scales: 0 at threshold, DESERT_ROLL_MAX at loyalty=0
    const loyaltyFrac    = contract.loyalty_Q;  // 0 = worst, DESERT_THRESHOLD = boundary
    const deserProbScale = SCALE.Q - Math.round(loyaltyFrac * SCALE.Q / DESERT_LOYALTY_THRESHOLD_Q);
    const deserProb      = Math.round(deserProbScale * DESERT_ROLL_MAX / SCALE.Q);

    const seed = eventSeed(worldSeed, tick, 0, 0, contract.contractId.length + band.size);
    const roll = seed % SCALE.Q;

    if (roll < deserProb) {
      deserted           = true;
      contract.loyalty_Q = 0 as Q;
    }
  }

  return {
    wagePaid_cu,
    arrearsAdded_cu: arrearsAdded,
    loyaltyDelta,
    deserted,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return `true` when the band is loyal enough to remain in service reliably. */
export function isMercenaryReliable(contract: MercenaryContract): boolean {
  return contract.loyalty_Q >= DESERT_LOYALTY_THRESHOLD_Q;
}

/** Return `true` when the contract has active arrears. */
export function hasMercenaryArrears(contract: MercenaryContract): boolean {
  return contract.arrears_cu > 0;
}

// ── Sample bands ─────────────────────────────────────────────────────────────

/** A typical 400-man light cavalry band — mobile, moderate quality. */
export const BAND_LIGHT_CAVALRY = createMercenaryBand(
  "light_cavalry", "Free Riders", 400, q(0.65) as Q, 3,
);

/** A 600-man heavy infantry cohort — expensive, high quality. */
export const BAND_HEAVY_INFANTRY = createMercenaryBand(
  "heavy_infantry", "Iron Shields", 600, q(0.85) as Q, 5,
);

/** A 200-man specialist siege engineers unit. */
export const BAND_SIEGE_ENGINEERS = createMercenaryBand(
  "siege_engineers", "The Sappers", 200, q(0.75) as Q, 8,
);
