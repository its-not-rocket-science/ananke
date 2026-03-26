// src/infrastructure.ts — Phase 89: Infrastructure & Development
//
// Models polity investment in permanent physical structures.  Each structure type
// grants passive bonuses to existing systems (trade, siege, granary, treasury).
// Construction consumes treasury and progresses over multiple ticks.
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `InfraProject` tracks in-progress construction; `InfraStructure` records
//     completed buildings with an integer level (1–MAX_INFRA_LEVEL).
//   - Bonus functions return Q modifiers; the host adds them to the relevant
//     system calls (e.g., route efficiency, siege strength multiplier).
//
// Integration:
//   Phase 61 (Polity):      treasury_cu is drained by construction costs.
//   Phase 83 (Trade Routes): `computeRoadTradeBonus` → route efficiency boost.
//   Phase 84 (Siege):        `computeWallSiegeBonus` → siege strength reduction for attacker.
//   Phase 87 (Granary):      `computeGranaryCapacityBonus` → capacity multiplier.
//   Phase 88 (Epidemic):     `computeApothecaryHealthBonus` → health capacity boost.

import { q, SCALE, clampQ, mulDiv } from "./units.js";
import type { Q }                   from "./units.js";
import type { Polity }              from "./polity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Available infrastructure types. */
export type InfraType =
  | "road"          // Improves trade route efficiency (Phase 83)
  | "wall"          // Reduces attacker siege strength (Phase 84)
  | "granary"       // Increases food storage capacity (Phase 87)
  | "marketplace"   // Generates daily treasury income
  | "apothecary";   // Improves epidemic health capacity (Phase 88)

/** A completed infrastructure structure. */
export interface InfraStructure {
  structureId: string;
  polityId:    string;
  type:        InfraType;
  /** Current upgrade level [1, MAX_INFRA_LEVEL]. */
  level:       number;
  builtTick:   number;
}

/** An in-progress construction project. */
export interface InfraProject {
  projectId:      string;
  polityId:       string;
  type:           InfraType;
  /** Target level upon completion. */
  targetLevel:    number;
  /** Treasury already invested [cost units]. */
  investedCost:   number;
  /** Total treasury cost required [cost units]. */
  totalCost:      number;
  /** Tick on which construction completed, or `undefined` if still in progress. */
  completedTick?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum upgrade level for any structure. */
export const MAX_INFRA_LEVEL = 5;

/**
 * Base treasury cost per level for each structure type [cost units].
 * Each level costs `BASE_COST × level` (level 1 = cheapest, level 5 = 5×).
 */
export const INFRA_BASE_COST: Record<InfraType, number> = {
  road:        10_000,
  wall:        20_000,
  granary:      8_000,
  marketplace: 15_000,
  apothecary:  12_000,
};

/**
 * Bonus Q per level for each infrastructure type.
 * Total bonus = `BONUS_PER_LEVEL × level` (clamped by the calling function).
 */
export const INFRA_BONUS_PER_LEVEL_Q: Record<InfraType, Q> = {
  road:        q(0.05) as Q,   // +5% trade route efficiency per level → +25% at max
  wall:        q(0.08) as Q,   // +8% siege strength reduction per level → −40% at max
  granary:     q(0.10) as Q,   // +10% granary capacity per level → +50% at max
  marketplace: q(0.02) as Q,   // +2% daily treasury income per level → +10% at max
  apothecary:  q(0.06) as Q,   // +6% health capacity per level → +30% at max
};

// ── Factory ───────────────────────────────────────────────────────────────────

/** Start a new construction project. Returns the project record (not yet complete). */
export function createInfraProject(
  projectId:   string,
  polityId:    string,
  type:        InfraType,
  targetLevel: number,
): InfraProject {
  const level      = Math.max(1, Math.min(targetLevel, MAX_INFRA_LEVEL));
  const totalCost  = INFRA_BASE_COST[type] * level;
  return { projectId, polityId, type, targetLevel: level, investedCost: 0, totalCost };
}

/** Create a completed structure directly (e.g., at world initialisation). */
export function createInfraStructure(
  structureId: string,
  polityId:    string,
  type:        InfraType,
  level:       number,
  builtTick:   number,
): InfraStructure {
  return {
    structureId,
    polityId,
    type,
    level: Math.max(1, Math.min(level, MAX_INFRA_LEVEL)),
    builtTick,
  };
}

// ── Construction ──────────────────────────────────────────────────────────────

/**
 * Invest treasury into a project.
 *
 * Drains `Math.min(investAmount, remainingCost)` from `polity.treasury_cu`.
 * Sets `project.completedTick` when fully funded.
 *
 * Returns the amount actually invested this call.
 */
export function investInProject(
  polity:        Polity,
  project:       InfraProject,
  investAmount:  number,
  currentTick:   number,
): number {
  if (project.completedTick != null) return 0;  // already complete
  const remaining = project.totalCost - project.investedCost;
  const actual    = Math.min(investAmount, remaining, polity.treasury_cu);
  project.investedCost    += actual;
  polity.treasury_cu      -= actual;
  if (project.investedCost >= project.totalCost) {
    project.completedTick = currentTick;
  }
  return actual;
}

/** Return `true` if the project is fully funded and complete. */
export function isProjectComplete(project: InfraProject): boolean {
  return project.completedTick != null;
}

/**
 * Convert a completed project into a permanent structure.
 * Returns `undefined` if the project is not yet complete.
 */
export function completeProject(
  project:     InfraProject,
  structureId: string,
): InfraStructure | undefined {
  if (project.completedTick == null) return undefined;
  return createInfraStructure(
    structureId,
    project.polityId,
    project.type,
    project.targetLevel,
    project.completedTick,
  );
}

// ── Bonus computations ────────────────────────────────────────────────────────

/**
 * Compute the total Q bonus from all structures of a given type at a polity.
 * Sums `BONUS_PER_LEVEL × level` across all matching structures.
 * Clamped to [0, SCALE.Q].
 */
export function computeInfraBonus(
  structures: InfraStructure[],
  type:       InfraType,
): Q {
  let total = 0;
  for (const s of structures) {
    if (s.type === type) {
      total += INFRA_BONUS_PER_LEVEL_Q[type] * s.level;
    }
  }
  return clampQ(total, 0, SCALE.Q);
}

/**
 * Trade route efficiency bonus from roads [0, SCALE.Q].
 * Add to route `efficiency_Q` when calling Phase-83 `computeDailyTradeIncome`.
 */
export function computeRoadTradeBonus(structures: InfraStructure[]): Q {
  return computeInfraBonus(structures, "road");
}

/**
 * Siege defence bonus from walls [0, SCALE.Q].
 * Subtract from attacker's effective `siegeStrength_Q` in Phase-84.
 */
export function computeWallSiegeBonus(structures: InfraStructure[]): Q {
  return computeInfraBonus(structures, "wall");
}

/**
 * Granary capacity multiplier bonus [0, SCALE.Q].
 * Effective capacity = `baseCapacity × (SCALE.Q + bonus) / SCALE.Q`.
 */
export function computeGranaryCapacityBonus(structures: InfraStructure[]): Q {
  return computeInfraBonus(structures, "granary");
}

/**
 * Daily treasury income from marketplaces [cost units].
 * `income = treasury_cu × MARKETPLACE_BONUS / SCALE.Q`
 */
export function computeMarketplaceIncome(
  polity:     Polity,
  structures: InfraStructure[],
): number {
  const bonus = computeInfraBonus(structures, "marketplace");
  return Math.floor(mulDiv(polity.treasury_cu, bonus, SCALE.Q));
}

/**
 * Health capacity bonus from apothecaries [0, SCALE.Q].
 * Add to `deriveHealthCapacity(polity)` result in Phase-88.
 */
export function computeApothecaryHealthBonus(structures: InfraStructure[]): Q {
  return computeInfraBonus(structures, "apothecary");
}
