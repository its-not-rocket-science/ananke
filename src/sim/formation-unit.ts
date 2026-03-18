/**
 * Phase 6 — Formation System
 *
 * Pure computation module for tactical formation mechanics:
 *  - Shield walls: adjacent shield-bearers pool block coverage
 *  - Rank depth: entities sorted by forward projection; front/rear split
 *  - Casualty fill: rear-rank entities promote when front rank is lost
 *  - Push of pike: total formation momentum from mass × velocity
 *  - Formation cohesion: morale bonus / rout-contagion penalty
 *
 * No Entity or WorldState imports — callers extract the needed values and
 * pass plain numbers / maps.  All arithmetic is integer fixed-point.
 */

import { type Q, SCALE, q, clampQ, mulDiv, qMul } from "../../src/units.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FormationShape = "line" | "shield_wall" | "wedge" | "column";

export interface FormationUnit {
  id: string;
  name: string;
  shape: FormationShape;
  entityIds: number[];
}

export interface RankSplit {
  /** Entity IDs nearest the enemy (most-forward projection). */
  frontRank: number[];
  /** Entity IDs behind the front rank. */
  rearRank: number[];
}

export interface FormationMomentum {
  /**
   * Total formation momentum in (SCALE.kg × m/s) units.
   * Divide by SCALE.kg (= 1000) to obtain physical kg·m/s.
   */
  momentum_Skg_mps: number;
  /** Number of entities that contributed (speed > 0). */
  entityCount: number;
}

export interface FormationCohesionState {
  /** True when intact fraction ≥ FORMATION_INTACT_THRESHOLD. */
  intact: boolean;
  /** Fraction of entities still alive and not routed, as a Q value. */
  intactFrac_Q: Q;
  /** Per-tick fear decay bonus when formation is intact. */
  moraleBonus_Q: Q;
  /** Per-tick fear increment when formation integrity has collapsed. */
  moralePenalty_Q: Q;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Efficiency of shield coverage sharing between adjacent bearers.
 * Each additional bearer beyond the first contributes at this fraction.
 */
export const SHIELD_SHARING_FRAC: Q = q(0.60);

/** Hard cap on combined shield wall coverage. */
export const SHIELD_WALL_MAX_COVERAGE: Q = SCALE.Q as Q;

/** Default rank depth used to split front/rear ranks (2 m in SCALE.m). */
export const RANK_DEPTH_DEFAULT_m: number = Math.round(2.0 * SCALE.m);

/**
 * Minimum intact fraction for a formation to be considered cohesive.
 * Below this threshold the rout-contagion penalty applies instead of the
 * morale bonus.
 */
export const FORMATION_INTACT_THRESHOLD: Q = q(0.60);

/** Fear decay bonus per tick granted to entities in an intact formation. */
export const FORMATION_MORALE_BONUS: Q = q(0.008);

/** Fear increment per tick when formation integrity has collapsed. */
export const FORMATION_MORALE_PENALTY: Q = q(0.010);

/** Per-tick fear decay granted per alive formation ally (vs q(0.002) unaffiliated). */
export const FORMATION_ALLY_FEAR_DECAY: Q = q(0.004);

/** Maximum number of formation allies counted for the fear decay bonus. */
export const FORMATION_ALLY_DECAY_CAP = 8;

// ─── Shield wall ──────────────────────────────────────────────────────────────

/**
 * Compute the combined block coverage of a shield wall.
 *
 * The bearer with the highest individual coverage contributes at full strength.
 * Each subsequent bearer (sorted descending by coverage) contributes at
 * SHIELD_SHARING_FRAC efficiency, modelling timing gaps and partial overlap
 * between adjacent shields.
 *
 * Result is capped at SHIELD_WALL_MAX_COVERAGE = q(1.0).
 */
export function computeShieldWallCoverage(coverageFracs: readonly Q[]): Q {
  if (coverageFracs.length === 0) return q(0);

  // Sort descending so the highest coverage bearer contributes fully.
  const sorted = [...coverageFracs].sort((a, b) => b - a);

  let total: number = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    total += mulDiv(sorted[i]!, SHIELD_SHARING_FRAC, SCALE.Q);
  }
  return clampQ(Math.round(total) as Q, 0, SHIELD_WALL_MAX_COVERAGE);
}

// ─── Rank depth ───────────────────────────────────────────────────────────────

/**
 * Split formation entity IDs into front and rear ranks.
 *
 * Each entity position is projected onto the facing direction.  The entity
 * with the greatest projection defines depth = 0.  Entities within
 * `rankDepth_m` of the frontmost entity are placed in the front rank; the
 * rest go to the rear rank.  Both ranks are sorted front-to-back.
 *
 * @param entityIds   IDs to split
 * @param positions   Map: entity ID → {x, y} in SCALE.m
 * @param facingDirQ  Unit vector with components in Q units (SCALE.Q = 1.0)
 * @param rankDepth_m Depth of front rank in SCALE.m (default: RANK_DEPTH_DEFAULT_m)
 */
export function deriveRankSplit(
  entityIds: readonly number[],
  positions: ReadonlyMap<number, { x: number; y: number }>,
  facingDirQ: { x: number; y: number },
  rankDepth_m: number = RANK_DEPTH_DEFAULT_m,
): RankSplit {
  if (entityIds.length === 0) return { frontRank: [], rearRank: [] };

  // Project each entity onto the facing direction (result in SCALE.m).
  const projections = new Map<number, number>();
  for (const id of entityIds) {
    const pos = positions.get(id);
    if (!pos) {
      projections.set(id, 0);
      continue;
    }
    const proj = Math.trunc(
      (pos.x * facingDirQ.x + pos.y * facingDirQ.y) / SCALE.Q,
    );
    projections.set(id, proj);
  }

  // Frontmost entity has the largest projection.
  let maxProj = -Infinity;
  for (const proj of projections.values()) {
    if (proj > maxProj) maxProj = proj;
  }

  const frontRank: number[] = [];
  const rearRank: number[] = [];
  for (const id of entityIds) {
    const proj = projections.get(id) ?? 0;
    if (proj >= maxProj - rankDepth_m) {
      frontRank.push(id);
    } else {
      rearRank.push(id);
    }
  }

  // Sort front-to-back (highest projection first) for determinism.
  const byProjDesc = (a: number, b: number) =>
    (projections.get(b) ?? 0) - (projections.get(a) ?? 0);
  frontRank.sort(byProjDesc);
  rearRank.sort(byProjDesc);

  return { frontRank, rearRank };
}

// ─── Casualty fill ────────────────────────────────────────────────────────────

/**
 * Promote rear-rank entities to fill vacancies left by front-rank losses.
 *
 * Returns new front and rear rank arrays with dead entities removed and
 * replacements drawn from the front of the (alive) rear rank.
 */
export function stepFormationCasualtyFill(
  rankSplit: RankSplit,
  deadIds: ReadonlySet<number>,
): RankSplit {
  const aliveFront = rankSplit.frontRank.filter(id => !deadIds.has(id));
  const aliveRear  = rankSplit.rearRank.filter(id => !deadIds.has(id));

  const vacancies    = rankSplit.frontRank.length - aliveFront.length;
  const replacements = aliveRear.splice(0, vacancies);

  return { frontRank: [...aliveFront, ...replacements], rearRank: aliveRear };
}

// ─── Push of pike / formation momentum ───────────────────────────────────────

/**
 * Compute the total forward momentum of a formation (push-of-pike model).
 *
 * `momentum_Skg_mps` is in (SCALE.kg × m/s) units — i.e. fixed-point mass
 * multiplied by real-valued speed (speed already divided by SCALE.mps).
 * Divide by SCALE.kg (= 1000) to obtain physical kg·m/s.
 *
 * Only entities with speed > 0 contribute.
 *
 * @param masses_Skg   Entity masses in SCALE.kg units
 * @param speeds_Smps  Entity speeds (magnitude) in SCALE.mps units
 */
export function computeFormationMomentum(
  masses_Skg: readonly number[],
  speeds_Smps: readonly number[],
): FormationMomentum {
  const n = Math.min(masses_Skg.length, speeds_Smps.length);
  let sum   = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const speed = speeds_Smps[i]!;
    if (speed <= 0) continue;
    sum += Math.trunc(masses_Skg[i]! * speed / SCALE.mps);
    count++;
  }
  return { momentum_Skg_mps: sum, entityCount: count };
}

// ─── Formation cohesion / morale ─────────────────────────────────────────────

/**
 * Derive the morale state of a formation from casualty / rout status.
 *
 * An entity is counted as lost if its ID appears in `deadOrRoutedIds`.
 * When intactFrac_Q ≥ FORMATION_INTACT_THRESHOLD the formation grants a fear
 * decay bonus; below it a rout-contagion penalty applies instead.
 *
 * An empty formation is considered vacuously intact but grants no bonus.
 */
export function deriveFormationCohesion(
  entityIds: readonly number[],
  deadOrRoutedIds: ReadonlySet<number>,
): FormationCohesionState {
  const total = entityIds.length;
  if (total === 0) {
    return {
      intact: true,
      intactFrac_Q: SCALE.Q as Q,
      moraleBonus_Q: q(0),
      moralePenalty_Q: q(0),
    };
  }

  let lostCount = 0;
  for (const id of entityIds) {
    if (deadOrRoutedIds.has(id)) lostCount++;
  }

  const intactCount  = total - lostCount;
  const intactFrac_Q = clampQ(
    Math.round((intactCount * SCALE.Q) / total) as Q,
    0,
    SCALE.Q,
  );
  const intact = intactFrac_Q >= FORMATION_INTACT_THRESHOLD;

  return {
    intact,
    intactFrac_Q,
    moraleBonus_Q:   intact ? FORMATION_MORALE_BONUS   : q(0),
    moralePenalty_Q: intact ? q(0) : FORMATION_MORALE_PENALTY,
  };
}

/**
 * Compute the per-tick fear decay bonus from alive formation allies.
 *
 * Returns a larger bonus than the unaffiliated ally coefficient (q(0.002)):
 * formation allies grant q(0.004) each, capped at FORMATION_ALLY_DECAY_CAP
 * allies.  Result is a Q value to be added to the entity's fear decay term.
 */
export function deriveFormationAllyFearDecay(
  aliveFormationAllyCount: number,
): Q {
  const capped = Math.min(aliveFormationAllyCount, FORMATION_ALLY_DECAY_CAP);
  return clampQ(
    (capped * FORMATION_ALLY_FEAR_DECAY) as Q,
    0,
    qMul(FORMATION_ALLY_FEAR_DECAY, q(FORMATION_ALLY_DECAY_CAP)),
  );
}
