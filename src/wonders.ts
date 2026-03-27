// src/wonders.ts — Phase 100: Wonders & Monuments
//
// Unique prestige constructions that define great civilisations — pyramids,
// colosseums, grand libraries, great walls, harbours, aqueducts, temples.
// Unlike Phase-89 functional infrastructure (roads, markets, apothecaries),
// wonders are one-of-a-kind, take years to complete, and give civilisation-
// level bonuses to stability, morale, research, defence, trade, and health.
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `WonderProject` tracks construction progress; `Wonder` is the completed record.
//   - Progress = investedCost_cu / WONDER_BASE_COST_CU; completion when progress_Q = SCALE.Q.
//   - `WonderEffects` is an advisory bundle; callers pass fields into Phases 88–93.
//   - Damaged wonders (Phase-96 earthquake / Phase-93 siege) provide half effects
//     until repaired at half the base cost.
//   - Only one wonder of each type per polity (enforced by naming convention;
//     host is responsible for uniqueness).
//
// Integration:
//   Phase 88 (Epidemic):      epidemicResistance_Q adds to healthCapacity_Q (aqueduct).
//   Phase 90 (Unrest):        unrestReduction_Q reduces computeUnrestLevel (colosseum, temple).
//   Phase 91 (Research):      researchPointBonus adds daily research points (library).
//   Phase 92 (Taxation):      tradeIncomeBonus_Q scales trade income (harbour).
//   Phase 93 (Military Camp): defenseBonus_Q adds to defender strength (great_wall).
//   Phase 96 (Climate):       earthquake → caller calls damageWonder().

import { q, SCALE, clampQ, mulDiv } from "./units.js";
import type { Q }                   from "./units.js";
import type { Polity }              from "./polity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Classification of wonder. */
export type WonderType =
  | "great_pyramid"     // prestige + stability + morale
  | "colosseum"         // morale + unrest reduction
  | "grand_library"     // research bonus
  | "great_wall"        // defence bonus
  | "grand_harbour"     // trade income bonus
  | "aqueduct_system"   // epidemic resistance + population health
  | "grand_temple";     // stability + morale + unrest reduction

/** In-progress wonder construction. */
export interface WonderProject {
  projectId:       string;
  polityId:        string;
  type:            WonderType;
  /** Current build progress [0, SCALE.Q]. Complete at SCALE.Q. */
  progress_Q:      Q;
  /** Cumulative treasury invested so far [cu]. */
  investedCost_cu: number;
  /** Tick at which construction started. */
  startTick:       number;
}

/** A completed wonder. */
export interface Wonder {
  wonderId:        string;
  polityId:        string;
  type:            WonderType;
  /** Tick at which construction finished. */
  completedAtTick: number;
  /**
   * Whether this wonder has been damaged by an earthquake (Phase-96) or
   * siege (Phase-93).  Damaged wonders provide `WONDER_DAMAGED_EFFECT_MUL`
   * fraction of their normal effects until repaired.
   */
  damaged:         boolean;
}

/**
 * Advisory effect bundle from a wonder.
 * Pass individual fields into the relevant downstream phase calls.
 * All Q fields are [0, SCALE.Q]; `researchPointBonus` is raw points/day.
 */
export interface WonderEffects {
  /** Add to `polity.stabilityQ`. */
  stabilityBonus_Q:     Q;
  /** Add to `polity.moraleQ`. */
  moraleBonus_Q:        Q;
  /** Additional research points per day. Pass to Phase-91. */
  researchPointBonus:   number;
  /** Subtract from Phase-90 unrest level. */
  unrestReduction_Q:    Q;
  /** Trade income multiplier bonus. Pass to Phase-92. */
  tradeIncomeBonus_Q:   Q;
  /** Additive defender strength bonus. Pass to Phase-93. */
  defenseBonus_Q:       Q;
  /** Add to `healthCapacity_Q` in Phase-88 `stepEpidemic`. */
  epidemicResistance_Q: Q;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Total treasury cost to construct each wonder type [cu].
 * Grand library is fastest; great pyramid is a generational project.
 */
export const WONDER_BASE_COST_CU: Record<WonderType, number> = {
  grand_library:   150_000,
  aqueduct_system: 200_000,
  grand_temple:    250_000,
  grand_harbour:   300_000,
  colosseum:       500_000,
  great_wall:      600_000,
  great_pyramid: 1_000_000,
};

/**
 * Estimated build time in days at average investment rate.
 * Informational only — actual duration depends on how fast the host invests.
 */
export const WONDER_TYPICAL_DAYS: Record<WonderType, number> = {
  grand_library:    180,
  aqueduct_system:  365,
  grand_temple:     365,
  grand_harbour:    365,
  colosseum:        730,
  great_wall:      1095,
  great_pyramid:   3650,
};

/**
 * Full effects for each wonder type at q(1.0) effectiveness.
 * Damaged wonders multiply each field by `WONDER_DAMAGED_EFFECT_MUL`.
 */
export const WONDER_BASE_EFFECTS: Record<WonderType, WonderEffects> = {
  great_pyramid: {
    stabilityBonus_Q:     q(0.08) as Q,  // generational prestige
    moraleBonus_Q:        q(0.05) as Q,
    researchPointBonus:   0,
    unrestReduction_Q:    0 as Q,
    tradeIncomeBonus_Q:   0 as Q,
    defenseBonus_Q:       0 as Q,
    epidemicResistance_Q: 0 as Q,
  },
  colosseum: {
    stabilityBonus_Q:     q(0.03) as Q,
    moraleBonus_Q:        q(0.10) as Q,  // entertainment
    researchPointBonus:   0,
    unrestReduction_Q:    q(0.12) as Q,  // bread and circuses
    tradeIncomeBonus_Q:   0 as Q,
    defenseBonus_Q:       0 as Q,
    epidemicResistance_Q: 0 as Q,
  },
  grand_library: {
    stabilityBonus_Q:     q(0.03) as Q,
    moraleBonus_Q:        q(0.02) as Q,
    researchPointBonus:   3,             // +3 RP/day
    unrestReduction_Q:    0 as Q,
    tradeIncomeBonus_Q:   0 as Q,
    defenseBonus_Q:       0 as Q,
    epidemicResistance_Q: 0 as Q,
  },
  great_wall: {
    stabilityBonus_Q:     q(0.05) as Q,
    moraleBonus_Q:        0 as Q,
    researchPointBonus:   0,
    unrestReduction_Q:    0 as Q,
    tradeIncomeBonus_Q:   0 as Q,
    defenseBonus_Q:       q(0.20) as Q,  // major defensive advantage
    epidemicResistance_Q: 0 as Q,
  },
  grand_harbour: {
    stabilityBonus_Q:     0 as Q,
    moraleBonus_Q:        q(0.03) as Q,
    researchPointBonus:   0,
    unrestReduction_Q:    0 as Q,
    tradeIncomeBonus_Q:   q(0.25) as Q,  // major trade multiplier
    defenseBonus_Q:       0 as Q,
    epidemicResistance_Q: 0 as Q,
  },
  aqueduct_system: {
    stabilityBonus_Q:     q(0.02) as Q,
    moraleBonus_Q:        q(0.04) as Q,  // quality of life
    researchPointBonus:   0,
    unrestReduction_Q:    0 as Q,
    tradeIncomeBonus_Q:   0 as Q,
    defenseBonus_Q:       0 as Q,
    epidemicResistance_Q: q(0.15) as Q,  // clean water reduces disease
  },
  grand_temple: {
    stabilityBonus_Q:     q(0.06) as Q,  // divine legitimacy
    moraleBonus_Q:        q(0.08) as Q,
    researchPointBonus:   0,
    unrestReduction_Q:    q(0.08) as Q,
    tradeIncomeBonus_Q:   0 as Q,
    defenseBonus_Q:       0 as Q,
    epidemicResistance_Q: 0 as Q,
  },
};

/**
 * Effect multiplier for a damaged wonder [0, SCALE.Q].
 * Damaged wonders still provide partial benefit; repair restores full effects.
 */
export const WONDER_DAMAGED_EFFECT_MUL: Q = q(0.50) as Q;

/**
 * Treasury cost to repair a damaged wonder, as a fraction of `WONDER_BASE_COST_CU`.
 * Repair = `round(baseCost × WONDER_REPAIR_COST_FRAC / SCALE.Q)`.
 */
export const WONDER_REPAIR_COST_FRAC: Q = q(0.25) as Q;

// ── Factory ───────────────────────────────────────────────────────────────────

/** Create a new wonder construction project. */
export function createWonderProject(
  projectId: string,
  polityId:  string,
  type:      WonderType,
  startTick: number,
): WonderProject {
  return {
    projectId,
    polityId,
    type,
    progress_Q:      0 as Q,
    investedCost_cu: 0,
    startTick,
  };
}

// ── Construction ──────────────────────────────────────────────────────────────

/**
 * Invest treasury into a wonder project.
 *
 * Deducts up to `contribution_cu` from `polity.treasury_cu` (capped by available
 * treasury and remaining cost), advances `progress_Q`, and returns the new progress.
 *
 * Does not auto-complete — call `isWonderProjectComplete` then `completeWonder`.
 */
export function contributeToWonder(
  project:         WonderProject,
  polity:          Polity,
  contribution_cu: number,
): Q {
  const totalCost  = WONDER_BASE_COST_CU[project.type];
  const remaining  = Math.max(0, totalCost - project.investedCost_cu);
  const actual     = Math.min(contribution_cu, polity.treasury_cu, remaining);
  polity.treasury_cu      -= actual;
  project.investedCost_cu += actual;
  project.progress_Q = clampQ(
    Math.round(project.investedCost_cu * SCALE.Q / totalCost), 0, SCALE.Q,
  ) as Q;
  return project.progress_Q;
}

/** Return `true` when the project has reached full completion. */
export function isWonderProjectComplete(project: WonderProject): boolean {
  return project.progress_Q >= SCALE.Q;
}

/**
 * Finalise a completed project into a standing `Wonder`.
 *
 * The caller is responsible for checking `isWonderProjectComplete` first.
 */
export function completeWonder(project: WonderProject, tick: number): Wonder {
  return {
    wonderId:        project.projectId,
    polityId:        project.polityId,
    type:            project.type,
    completedAtTick: tick,
    damaged:         false,
  };
}

// ── Damage & repair ───────────────────────────────────────────────────────────

/**
 * Mark a wonder as damaged (earthquake, siege).
 * Damaged wonders yield `WONDER_DAMAGED_EFFECT_MUL` fraction of full effects.
 */
export function damageWonder(wonder: Wonder): void {
  wonder.damaged = true;
}

/**
 * Repair a damaged wonder, spending `WONDER_REPAIR_COST_FRAC` of base cost.
 *
 * Mutates `polity.treasury_cu` and clears `wonder.damaged`.
 * Returns `true` if repaired; `false` if the polity lacked funds.
 * No-op if wonder is not damaged.
 */
export function repairWonder(wonder: Wonder, polity: Polity): boolean {
  if (!wonder.damaged) return true;
  const baseCost    = WONDER_BASE_COST_CU[wonder.type];
  const repairCost  = Math.round(mulDiv(baseCost, WONDER_REPAIR_COST_FRAC, SCALE.Q));
  if (polity.treasury_cu < repairCost) return false;
  polity.treasury_cu -= repairCost;
  wonder.damaged      = false;
  return true;
}

// ── Effect computation ────────────────────────────────────────────────────────

/**
 * Compute the `WonderEffects` advisory bundle for a single wonder.
 *
 * Damaged wonders: each numeric field is scaled by `WONDER_DAMAGED_EFFECT_MUL / SCALE.Q`.
 */
export function computeWonderEffects(wonder: Wonder): WonderEffects {
  const base = WONDER_BASE_EFFECTS[wonder.type];
  if (!wonder.damaged) return { ...base };

  const m = WONDER_DAMAGED_EFFECT_MUL;
  return {
    stabilityBonus_Q:     mulDiv(base.stabilityBonus_Q,     m, SCALE.Q) as Q,
    moraleBonus_Q:        mulDiv(base.moraleBonus_Q,        m, SCALE.Q) as Q,
    researchPointBonus:   Math.round(base.researchPointBonus * m / SCALE.Q),
    unrestReduction_Q:    mulDiv(base.unrestReduction_Q,    m, SCALE.Q) as Q,
    tradeIncomeBonus_Q:   mulDiv(base.tradeIncomeBonus_Q,   m, SCALE.Q) as Q,
    defenseBonus_Q:       mulDiv(base.defenseBonus_Q,       m, SCALE.Q) as Q,
    epidemicResistance_Q: mulDiv(base.epidemicResistance_Q, m, SCALE.Q) as Q,
  };
}

/**
 * Aggregate effects from multiple wonders.
 *
 * Q fields are summed and clamped to SCALE.Q.
 * `researchPointBonus` is summed without capping.
 */
export function aggregateWonderEffects(wonders: Wonder[]): WonderEffects {
  let stab = 0, morale = 0, rp = 0, unrest = 0, trade = 0, def = 0, epi = 0;
  for (const w of wonders) {
    const fx = computeWonderEffects(w);
    stab   += fx.stabilityBonus_Q;
    morale += fx.moraleBonus_Q;
    rp     += fx.researchPointBonus;
    unrest += fx.unrestReduction_Q;
    trade  += fx.tradeIncomeBonus_Q;
    def    += fx.defenseBonus_Q;
    epi    += fx.epidemicResistance_Q;
  }
  return {
    stabilityBonus_Q:     clampQ(stab,   0, SCALE.Q) as Q,
    moraleBonus_Q:        clampQ(morale, 0, SCALE.Q) as Q,
    researchPointBonus:   rp,
    unrestReduction_Q:    clampQ(unrest, 0, SCALE.Q) as Q,
    tradeIncomeBonus_Q:   clampQ(trade,  0, SCALE.Q) as Q,
    defenseBonus_Q:       clampQ(def,    0, SCALE.Q) as Q,
    epidemicResistance_Q: clampQ(epi,    0, SCALE.Q) as Q,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return `true` when the wonder is standing and undamaged. */
export function isWonderIntact(wonder: Wonder): boolean {
  return !wonder.damaged;
}

/** Compute treasury cost to repair a damaged wonder [cu]. */
export function computeRepairCost(type: WonderType): number {
  return Math.round(mulDiv(WONDER_BASE_COST_CU[type], WONDER_REPAIR_COST_FRAC, SCALE.Q));
}
