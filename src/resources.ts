// src/resources.ts — Phase 95: Natural Resources & Extraction
//
// Polity economies are not purely population-driven.  Mines, forests, quarries,
// and pastures provide resource income that is largely independent of population
// size.  This module tracks resource deposits, worker assignment, daily yield,
// and gradual depletion.
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `ResourceDeposit` is the immutable site descriptor; `ExtractionState` is
//     the mutable accumulator stored externally by the host.
//   - Yield scales with workers, tech era, and deposit richness.
//   - Richness slowly declines with cumulative extraction (depletion model).
//   - Resource income is expressed in treasury cost-units for uniform integration
//     with Phase-92 taxation and Phase-89 infrastructure.
//   - Secondary bonus flags (`militaryBonus`, `constructionBonus`, `mobilityBonus`)
//     are advisory — the host applies them to Phase-61/89/93 calls.
//
// Integration:
//   Phase 11 (Tech):    techEra multiplier improves extraction efficiency.
//   Phase 61 (Polity):  treasury_cu receives daily yield; population caps workers.
//   Phase 89 (Infra):   timber/stone → construction discount advisory flag.
//   Phase 93 (Campaign): horses → march-rate advisory flag.
//   Phase 92 (Taxation): resource income is additive to tax revenue.

import { q, SCALE, clampQ, mulDiv } from "./units.js";
import type { Q }                    from "./units.js";
import type { Polity }               from "./polity.js";
import { TechEra }                   from "./sim/tech.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Classification of natural resource. */
export type ResourceType = "iron" | "silver" | "timber" | "stone" | "horses";

/** Immutable descriptor for a natural resource deposit. */
export interface ResourceDeposit {
  depositId:  string;
  polityId:   string;
  type:       ResourceType;
  /**
   * Initial richness [0, SCALE.Q].  Declines with extraction via `depleteDeposit`.
   * A richness of SCALE.Q represents an exceptionally rich find.
   */
  richness_Q: Q;
  /**
   * Maximum workers that can be productively assigned to this deposit.
   * Additional workers beyond this are wasted.
   */
  maxWorkers: number;
}

/** Mutable extraction state — store one externally per deposit per polity. */
export interface ExtractionState {
  depositId:          string;
  /** Current worker count (may not exceed `deposit.maxWorkers`). */
  assignedWorkers:    number;
  /** Cumulative cost-units yielded since deposit was first worked. */
  cumulativeYield_cu: number;
}

/** Output of `stepExtraction`. */
export interface ExtractionStepResult {
  /** Cost-units added to polity treasury this step. */
  yield_cu:            number;
  /** Current richness after any depletion [0, SCALE.Q]. */
  richness_Q:          Q;
  /**
   * Whether the deposit is now exhausted (`richness_Q <= DEPLETION_EXHAUSTED_Q`).
   */
  exhausted:           boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Base daily yield per worker [cost-units/worker/day] at full richness and
 * base tech era (Ancient = 1, the reference point).
 */
export const BASE_YIELD_PER_WORKER: Record<ResourceType, number> = {
  iron:    3,   // ore smelting; military equipment
  silver:  8,   // coinage; highest raw value
  timber:  2,   // construction material
  stone:   2,   // construction material
  horses:  5,   // breeding; cavalry
};

/**
 * Tech era extraction efficiency multiplier [Q].
 * Better tools, techniques, and logistics improve yield per worker.
 */
export const TECH_EXTRACTION_MUL: Record<number, Q> = {
  [TechEra.Prehistoric]:  q(0.40) as Q,
  [TechEra.Ancient]:      q(0.60) as Q,
  [TechEra.Medieval]:     q(0.80) as Q,
  [TechEra.EarlyModern]:  q(1.00) as Q,
  [TechEra.Industrial]:   q(1.50) as Q,
  [TechEra.Modern]:       q(2.00) as Q,
  [TechEra.NearFuture]:   q(2.50) as Q,
  [TechEra.FarFuture]:    q(3.00) as Q,
  [TechEra.DeepSpace]:    q(4.00) as Q,
};

/**
 * Fraction of base yield that richness scales against [Q].
 * At richness q(0.50), yield = base × (0.50 + 0.50×0.50) = base × 0.75
 * — partial depletion still produces meaningful income.
 */
export const RICHNESS_FLOOR_Q: Q = q(0.50);

/**
 * Richness reduction per 1000 cost-units of cumulative yield.
 * Controls the depletion rate.  Lower values mean longer-lived deposits.
 */
export const DEPLETION_RATE_PER_1000_CU: Q = q(0.005);

/**
 * Richness threshold below which the deposit is considered exhausted [Q].
 * Extraction becomes uneconomical below this level.
 */
export const DEPLETION_EXHAUSTED_Q: Q = q(0.05);

/**
 * Maximum fraction of polity population that can be assigned as resource
 * workers without impacting farming/tax base [Q].
 * Hosts should warn if this is exceeded.
 */
export const WORKER_POP_FRACTION_Q: Q = q(0.10);

// ── Secondary bonus flags ─────────────────────────────────────────────────────

/**
 * Resource types that provide a military equipment bonus when worked.
 * Hosts apply this to Phase-61 `deriveMilitaryStrength` or Phase-93 strength.
 */
export const MILITARY_BONUS_RESOURCES: ReadonlySet<ResourceType> = new Set(["iron", "horses"]);

/**
 * Resource types that provide a construction cost discount when worked.
 * Hosts apply this to Phase-89 `investInProject` cost calculations.
 */
export const CONSTRUCTION_BONUS_RESOURCES: ReadonlySet<ResourceType> = new Set(["timber", "stone"]);

/**
 * Resource types that improve march rate when worked.
 * Hosts add a road-equivalent bonus to Phase-93 `stepCampaignMarch`.
 */
export const MOBILITY_BONUS_RESOURCES: ReadonlySet<ResourceType> = new Set(["horses"]);

// ── Factory ───────────────────────────────────────────────────────────────────

/** Create a new `ResourceDeposit`. */
export function createDeposit(
  depositId:  string,
  polityId:   string,
  type:       ResourceType,
  richness_Q: Q = q(0.80) as Q,
  maxWorkers  = 500,
): ResourceDeposit {
  return { depositId, polityId, type, richness_Q: clampQ(richness_Q, 0, SCALE.Q) as Q, maxWorkers };
}

/** Create a fresh `ExtractionState` with no workers assigned. */
export function createExtractionState(depositId: string): ExtractionState {
  return { depositId, assignedWorkers: 0, cumulativeYield_cu: 0 };
}

// ── Worker management ─────────────────────────────────────────────────────────

/**
 * Assign workers to a deposit.
 * Clamps to `[0, deposit.maxWorkers]`.
 * Returns the effective worker count after clamping.
 */
export function assignWorkers(
  deposit: ResourceDeposit,
  state:   ExtractionState,
  workers: number,
): number {
  state.assignedWorkers = Math.max(0, Math.min(workers, deposit.maxWorkers));
  return state.assignedWorkers;
}

// ── Yield computation ─────────────────────────────────────────────────────────

/**
 * Compute the daily extraction yield [cost-units/day].
 *
 * Formula:
 *   techMul       = TECH_EXTRACTION_MUL[techEra]  (default q(0.60))
 *   richnessScale = RICHNESS_FLOOR_Q + mulDiv(SCALE.Q - RICHNESS_FLOOR_Q, richness_Q, SCALE.Q)
 *                 ∈ [q(0.50), q(1.00)]
 *   base          = workers × BASE_YIELD_PER_WORKER[type]
 *   daily         = max(0, round(base × techMul / SCALE.Q × richnessScale / SCALE.Q))
 *
 * Returns 0 if the deposit is exhausted or no workers assigned.
 */
export function computeDailyYield(
  deposit: ResourceDeposit,
  state:   ExtractionState,
  techEra: number,
): number {
  if (deposit.richness_Q <= DEPLETION_EXHAUSTED_Q) return 0;
  if (state.assignedWorkers <= 0) return 0;

  const techMul       = (TECH_EXTRACTION_MUL[techEra] ?? q(0.60)) as Q;
  const richnessMul   = RICHNESS_FLOOR_Q + mulDiv(SCALE.Q - RICHNESS_FLOOR_Q, deposit.richness_Q, SCALE.Q);
  const basePerWorker = BASE_YIELD_PER_WORKER[deposit.type] ?? 0;
  const base          = state.assignedWorkers * basePerWorker;
  const withTech      = Math.round(base * techMul / SCALE.Q);
  return Math.max(0, Math.round(withTech * richnessMul / SCALE.Q));
}

// ── Depletion ─────────────────────────────────────────────────────────────────

/**
 * Reduce deposit richness based on cumulative yield extracted.
 *
 * `richnessDrain = round(yield_cu × DEPLETION_RATE_PER_1000_CU / 1000)`
 *
 * Mutates `deposit.richness_Q`.
 */
export function depleteDeposit(deposit: ResourceDeposit, yieldThisStep_cu: number): void {
  if (yieldThisStep_cu <= 0) return;
  const drain = Math.round(yieldThisStep_cu * DEPLETION_RATE_PER_1000_CU / 1000);
  deposit.richness_Q = clampQ(deposit.richness_Q - drain, 0, SCALE.Q) as Q;
}

// ── Extraction step ───────────────────────────────────────────────────────────

/**
 * Advance extraction for `elapsedDays` days.
 *
 * 1. Computes `computeDailyYield × elapsedDays`.
 * 2. Adds yield to `polity.treasury_cu` and `state.cumulativeYield_cu`.
 * 3. Depletes deposit richness proportional to yield.
 *
 * Mutates `polity.treasury_cu`, `state.cumulativeYield_cu`, and `deposit.richness_Q`.
 */
export function stepExtraction(
  deposit:     ResourceDeposit,
  state:       ExtractionState,
  polity:      Polity,
  elapsedDays: number,
): ExtractionStepResult {
  const daily    = computeDailyYield(deposit, state, polity.techEra);
  const yield_cu = daily * elapsedDays;

  polity.treasury_cu         += yield_cu;
  state.cumulativeYield_cu   += yield_cu;
  depleteDeposit(deposit, yield_cu);

  const exhausted = deposit.richness_Q <= DEPLETION_EXHAUSTED_Q;
  return { yield_cu, richness_Q: deposit.richness_Q, exhausted };
}

// ── Reporting ─────────────────────────────────────────────────────────────────

/**
 * Estimate daily bonus income from resource extraction across multiple deposits.
 * Useful for treasury planning alongside Phase-92 tax revenue.
 */
export function computeTotalDailyResourceIncome(
  deposits: ResourceDeposit[],
  states:   Map<string, ExtractionState>,
  techEra:  number,
): number {
  let total = 0;
  for (const deposit of deposits) {
    const state = states.get(deposit.depositId);
    if (!state) continue;
    total += computeDailyYield(deposit, state, techEra);
  }
  return total;
}

/**
 * Return true if this resource type provides a military bonus.
 */
export function hasMilitaryBonus(type: ResourceType): boolean {
  return MILITARY_BONUS_RESOURCES.has(type);
}

/**
 * Return true if this resource type provides a construction bonus.
 */
export function hasConstructionBonus(type: ResourceType): boolean {
  return CONSTRUCTION_BONUS_RESOURCES.has(type);
}

/**
 * Return true if this resource type provides a mobility bonus.
 */
export function hasMobilityBonus(type: ResourceType): boolean {
  return MOBILITY_BONUS_RESOURCES.has(type);
}

/**
 * Estimate how many days until the deposit is exhausted at the current
 * extraction rate.  Returns `Infinity` if no workers or already exhausted.
 */
export function estimateDaysToExhaustion(
  deposit: ResourceDeposit,
  state:   ExtractionState,
  techEra: number,
): number {
  if (deposit.richness_Q <= DEPLETION_EXHAUSTED_Q) return 0;
  const daily = computeDailyYield(deposit, state, techEra);
  if (daily <= 0) return Infinity;
  // richness that needs to be drained = richness_Q - DEPLETION_EXHAUSTED_Q
  // drain per day = daily × DEPLETION_RATE_PER_1000_CU / 1000
  const drainPerDay = daily * DEPLETION_RATE_PER_1000_CU / 1000;
  if (drainPerDay <= 0) return Infinity;
  const remainingRichness = deposit.richness_Q - DEPLETION_EXHAUSTED_Q;
  return Math.ceil(remainingRichness / drainPerDay);
}
