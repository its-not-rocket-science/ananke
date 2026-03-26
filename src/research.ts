// src/research.ts — Phase 91: Technology Research
//
// Polities accumulate research points from their population and stability.
// When accumulated points reach the era threshold the polity advances to the
// next TechEra; treasury investment buys additional progress; contact with a
// more advanced polity (via Phase-83 trade routes) grants knowledge diffusion.
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `ResearchState` is separate from Polity; host stores one per polity.
//   - Uses numeric TechEra values (0–8) from Phase-11 tech.ts.
//   - `stepResearch` mutates both `state.progress` and `polity.techEra`.
//   - All arithmetic is integer fixed-point; no floating-point accumulation.
//
// Integration:
//   Phase 11 (Tech):     TechEra numeric enum — advancement increments polity.techEra.
//   Phase 61 (Polity):   population, stabilityQ, treasury_cu are read/mutated.
//   Phase 83 (Trade):    contactIntensity_Q drives knowledge diffusion.
//   Phase 89 (Infra):    hosts may add infrastructure bonuses to daily rate.

import { q, SCALE, clampQ, mulDiv } from "./units.js";
import type { Q }                   from "./units.js";
import type { Polity }              from "./polity.js";
import { deriveMilitaryStrength }   from "./polity.js";
import { TechEra }                  from "./sim/tech.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Per-polity research progress. Store one externally per polity. */
export interface ResearchState {
  polityId: string;
  /** Accumulated research points toward the next era. */
  progress: number;
}

/** Result returned by `stepResearch`. */
export interface ResearchStepResult {
  /** Raw points added this step. */
  pointsGained: number;
  /** Whether the polity advanced to a new era this step. */
  advanced:     boolean;
  /** New era if `advanced === true`, otherwise `undefined`. */
  newEra?:      number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Population divisor for base daily research units.
 * `baseUnits = floor(population / RESEARCH_POP_DIVISOR)` — minimum 1.
 */
export const RESEARCH_POP_DIVISOR = 5_000;

/**
 * Research points required to advance FROM each TechEra to the next.
 * Keyed by numeric TechEra value.  `Infinity` (absent) = max era, no advancement.
 */
export const RESEARCH_POINTS_REQUIRED: Record<number, number> = {
  [TechEra.Prehistoric]:  2_000,
  [TechEra.Ancient]:      8_000,
  [TechEra.Medieval]:    30_000,
  [TechEra.EarlyModern]: 80_000,
  [TechEra.Industrial]: 200_000,
  [TechEra.Modern]:     500_000,
  [TechEra.NearFuture]: 1_500_000,
  [TechEra.FarFuture]:  5_000_000,
  // TechEra.DeepSpace (8): no entry → no advancement
};

/**
 * Treasury cost per research point when using `investInResearch`.
 * 10 cost-units = 1 research point.
 */
export const RESEARCH_COST_PER_POINT = 10;

/**
 * Fraction of the source polity's daily research rate that diffuses to a
 * less-advanced trade partner per era of difference.
 */
export const KNOWLEDGE_DIFFUSION_RATE_Q: Q = q(0.10);

// ── Factory ───────────────────────────────────────────────────────────────────

/** Create a fresh `ResearchState` with zero progress. */
export function createResearchState(polityId: string): ResearchState {
  return { polityId, progress: 0 };
}

// ── Rate computation ──────────────────────────────────────────────────────────

/**
 * Points required to advance from the polity's current era.
 * Returns `Infinity` at max era (no advancement possible).
 */
export function pointsRequiredForNextEra(polity: Polity): number {
  return RESEARCH_POINTS_REQUIRED[polity.techEra] ?? Infinity;
}

/**
 * Compute the daily research rate for a polity [integer points/day].
 *
 * Formula:
 *   baseUnits = max(1, floor(population / RESEARCH_POP_DIVISOR))
 *   stabilityFactor = SCALE.Q/2 + mulDiv(SCALE.Q/2, stabilityQ, SCALE.Q)
 *                   ∈ [q(0.50), q(1.00)] = [5000, 10000]
 *   dailyPoints = max(1, round(baseUnits × stabilityFactor / SCALE.Q))
 *
 * @param bonusPoints  Additional flat bonus points per day (e.g., from
 *                     knowledge diffusion or Phase-89 infrastructure).
 */
export function computeDailyResearchPoints(polity: Polity, bonusPoints = 0): number {
  const baseUnits       = Math.max(1, Math.floor(polity.population / RESEARCH_POP_DIVISOR));
  const stabilityFactor = SCALE.Q / 2 + mulDiv(SCALE.Q / 2, polity.stabilityQ, SCALE.Q);
  const base            = Math.max(1, Math.round(baseUnits * stabilityFactor / SCALE.Q));
  return base + bonusPoints;
}

// ── Research step ─────────────────────────────────────────────────────────────

/**
 * Advance research for `elapsedDays` days.
 *
 * Adds `computeDailyResearchPoints(polity) × elapsedDays` to `state.progress`.
 * When progress meets or exceeds `pointsRequiredForNextEra`:
 * - Excess progress carries over.
 * - `polity.techEra` is incremented.
 * - `deriveMilitaryStrength` is refreshed.
 *
 * Only one era advancement occurs per call regardless of elapsed days.
 * At DeepSpace (max era) the call is a no-op.
 *
 * @param bonusPoints  Flat daily bonus from knowledge diffusion or infrastructure.
 */
export function stepResearch(
  polity:      Polity,
  state:       ResearchState,
  elapsedDays: number,
  bonusPoints  = 0,
): ResearchStepResult {
  const daily    = computeDailyResearchPoints(polity, bonusPoints);
  const gained   = daily * elapsedDays;
  state.progress += gained;

  const required  = pointsRequiredForNextEra(polity);
  const maxEra    = TechEra.DeepSpace;
  const canAdvance = polity.techEra < maxEra && isFinite(required) && state.progress >= required;

  if (canAdvance) {
    state.progress -= required;           // carry over surplus
    polity.techEra  = (polity.techEra + 1) as typeof TechEra[keyof typeof TechEra];
    deriveMilitaryStrength(polity);
    return { pointsGained: gained, advanced: true, newEra: polity.techEra };
  }

  return { pointsGained: gained, advanced: false };
}

// ── Treasury investment ───────────────────────────────────────────────────────

/**
 * Invest treasury into research, immediately adding points.
 *
 * Rate: `RESEARCH_COST_PER_POINT` cost-units = 1 point.
 * Drains `min(amount, polity.treasury_cu)`.  No-ops if treasury is empty.
 *
 * Returns the actual number of research points added.
 */
export function investInResearch(
  polity: Polity,
  state:  ResearchState,
  amount: number,
): number {
  const actual = Math.min(amount, polity.treasury_cu);
  const points = Math.floor(actual / RESEARCH_COST_PER_POINT);
  polity.treasury_cu -= actual;
  state.progress     += points;
  return points;
}

// ── Knowledge diffusion ───────────────────────────────────────────────────────

/**
 * Compute daily knowledge diffusion bonus that a source polity grants to a
 * less-advanced target polity through trade or diplomatic contact.
 *
 * Diffusion fires only when `sourcePolity.techEra > targetPolity.techEra`.
 *
 * Formula: `round(sourceDaily × eraDiff × DIFFUSION_RATE × contactIntensity / SCALE.Q²)`
 *
 * @param contactIntensity_Q  Trade or diplomatic contact [0, SCALE.Q].
 *                            Derive from Phase-83 route efficiency or Phase-80 treaty strength.
 */
export function computeKnowledgeDiffusion(
  sourcePolity:       Polity,
  targetPolity:       Polity,
  contactIntensity_Q: Q,
): number {
  if (sourcePolity.techEra <= targetPolity.techEra) return 0;
  const eraDiff    = sourcePolity.techEra - targetPolity.techEra;
  const sourceRate = computeDailyResearchPoints(sourcePolity);
  const step1      = mulDiv(sourceRate * eraDiff, KNOWLEDGE_DIFFUSION_RATE_Q, SCALE.Q);
  return Math.max(0, Math.round(step1 * contactIntensity_Q / SCALE.Q));
}

// ── Progress reporting ────────────────────────────────────────────────────────

/**
 * Return current research progress as a Q fraction [0, SCALE.Q] toward the next era.
 * Returns `SCALE.Q` at max era (DeepSpace).
 */
export function computeResearchProgress_Q(polity: Polity, state: ResearchState): Q {
  const required = pointsRequiredForNextEra(polity);
  if (!isFinite(required)) return SCALE.Q as Q;
  return clampQ(Math.round(state.progress * SCALE.Q / required), 0, SCALE.Q);
}

/**
 * Estimate days until the next era advance at the current daily research rate.
 * Returns `Infinity` at max era or when rate is zero.
 */
export function estimateDaysToNextEra(polity: Polity, state: ResearchState, bonusPoints = 0): number {
  const required  = pointsRequiredForNextEra(polity);
  if (!isFinite(required)) return Infinity;
  const remaining = Math.max(0, required - state.progress);
  const daily     = computeDailyResearchPoints(polity, bonusPoints);
  if (daily <= 0) return Infinity;
  return Math.ceil(remaining / daily);
}
