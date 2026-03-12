// src/collective-activities.ts — Phase 55: Collective Non-Combat Activities
//
// Three systems for formation/group-scale non-combat coordination:
//
//   1. Siege Engineering — field construction projects (fortifications, ramps, bridges)
//      Progress = Σ(competence_Q × hoursWorked) / requiredWorkHours
//      Competence derived from logicalMathematical + bodilyKinesthetic cognition.
//
//   2. Ritual & Ceremony — collective morale amplification via intrapersonal/musical pool
//      moraleBonus_Q scales with average cognition and sqrt(N) for diminishing returns.
//      Returns morale bonus and fear reduction applicable to all participants.
//
//   3. Trade Caravan Logistics — route planning with supply sufficiency and route quality
//      routeQuality_Q from logicalMathematical (best navigator leads);
//      negotiationBonus_Q from best interpersonal score;
//      supplySufficiency_Q from inventory vs. estimated ration needs.

import { q, clampQ, SCALE, type Q } from "./units.js";
import type { Entity } from "./sim/entity.js";
import type { Vec3 } from "./sim/vec3.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Kind of collective engineering project. */
export type CollectiveProjectKind =
  | "field_fortification"  // earthworks, barricades, ditches
  | "siege_ramp"           // assault infrastructure
  | "field_bridge"         // temporary crossing
  | "ritual_circle"        // ceremony ground preparation
  | "trade_post";          // temporary trading infrastructure

/** One contributor's recorded work on a collective project. */
export interface CollectiveContributor {
  entityId:     number;
  hoursWorked:  number;
  /** Effective competence at contribution time [Q]. */
  competence_Q: Q;
}

/** A shared construction project that multiple entities contribute toward. */
export interface CollectiveProject {
  projectId:             string;
  kind:                  CollectiveProjectKind;
  label:                 string;
  /** Current completion [Q 0..completionThreshold_Q]. */
  progress_Q:            Q;
  /** Q threshold at which project is considered complete (usually SCALE.Q). */
  completionThreshold_Q: Q;
  /** Person-hours at q(1.0) competence required to reach completionThreshold_Q. */
  requiredWorkHours:     number;
  contributors:          CollectiveContributor[];
  /** Tick at which progress first reached completionThreshold_Q; undefined if incomplete. */
  completedAtTick?:      number | undefined;
}

/** Result returned by `stepRitual`. */
export interface RitualResult {
  /** Morale bonus applicable to all participants [Q 0..RITUAL_MAX_BONUS]. */
  moraleBonus_Q:    Q;
  /** Fear threshold reduction for all participants [Q]. */
  fearReduction_Q:  Q;
  /** Number of participants in this session. */
  participantCount: number;
}

/** One waypoint in a caravan route. */
export interface CaravanWaypoint {
  /** Identifier for the location (settlement ID, etc.). */
  positionId: string;
  position_m: Vec3;
  /** Planned rest time at this waypoint [hours]. */
  restHours:  number;
}

/** Logistics plan produced by `planCaravanRoute`. */
export interface CaravanPlan {
  /** Deterministic identifier derived from waypoint IDs. */
  planId:                  string;
  waypoints:               CaravanWaypoint[];
  /** Entity IDs of caravan participants. */
  participantIds:          number[];
  /** Pure travel time excluding rest stops [seconds]. */
  estimatedTravelSeconds:  number;
  /** Total journey time including rest stops [seconds]. */
  estimatedTotalSeconds:   number;
  /** Food sufficiency for the journey [Q]: q(1.0) = fully provisioned. */
  supplySufficiency_Q:     Q;
  /** Route quality from best navigator's logicalMathematical [Q]. */
  routeQuality_Q:          Q;
  /** Trade bonus from best negotiator's interpersonal [Q]. */
  negotiationBonus_Q:      Q;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Seconds for a full-duration ritual to achieve maximum bonus.
 * Shorter sessions scale linearly; longer sessions are capped at this duration.
 */
export const RITUAL_DURATION_s = 3_600; // 1 hour

/**
 * Maximum morale bonus a ritual can produce [Q].
 * Even a perfect ensemble cannot exceed this per session.
 */
export const RITUAL_MAX_BONUS: Q = q(0.30) as Q;   // 3000

/**
 * Fraction of the morale bonus that converts to fear reduction [Q].
 * fearReduction_Q = moraleBonus_Q × RITUAL_FEAR_REDUCTION_FRAC / SCALE.Q.
 */
export const RITUAL_FEAR_REDUCTION_FRAC: Q = q(0.60) as Q;  // 6000

/**
 * Walking-pace caravan speed [SCALE.mps].
 * 1.2 m/s = 12 000 SCALE.mps.
 */
export const CARAVAN_BASE_SPEED_Smps = 12_000;

/**
 * Food rations required per person per day of caravan travel.
 * Caller supplies all items in their food inventory; every item counts as one ration.
 */
export const CARAVAN_RATIONS_PER_PERSON_PER_DAY = 3;

/**
 * Default engineering competence for entities without a cognition profile.
 * Represents an average untrained labourer.
 */
export const DEFAULT_ENGINEERING_COMPETENCE: Q = q(0.50) as Q;  // 5000

// ── Siege Engineering ─────────────────────────────────────────────────────────

/**
 * Derive an entity's engineering competence from their cognitive profile.
 *
 * Uses the average of logicalMathematical (planning) and bodilyKinesthetic
 * (manual precision). Entities without a cognition profile return
 * DEFAULT_ENGINEERING_COMPETENCE.
 */
export function deriveEngineeringCompetence(entity: Entity): Q {
  const cog = entity.attributes.cognition;
  if (!cog) return DEFAULT_ENGINEERING_COMPETENCE;
  return Math.round((cog.logicalMathematical + cog.bodilyKinesthetic) / 2) as Q;
}

/**
 * Create a new collective project with zero progress.
 */
export function createCollectiveProject(
  projectId:         string,
  kind:              CollectiveProjectKind,
  label:             string,
  requiredWorkHours: number,
): CollectiveProject {
  return {
    projectId,
    kind,
    label,
    progress_Q:            q(0) as Q,
    completionThreshold_Q: SCALE.Q as Q,
    requiredWorkHours,
    contributors:          [],
    completedAtTick:       undefined,
  };
}

/**
 * Add a contribution to a collective project from one entity.
 *
 * Mutates `project.progress_Q` and appends to `project.contributors`.
 * Progress delta = competence_Q × hoursWorked / requiredWorkHours (Q-scaled).
 * Progress is clamped to [0, completionThreshold_Q].
 *
 * @param project      The shared project to advance.
 * @param entity       The contributing entity.
 * @param hoursWorked  Hours of work this entity is contributing (must be > 0).
 * @param tick         Current world tick (used for completion timestamp).
 * @returns            The actual progress delta applied (Q units).
 */
export function contributeToCollectiveProject(
  project:     CollectiveProject,
  entity:      Entity,
  hoursWorked: number,
  tick:        number,
): Q {
  if (hoursWorked <= 0) return q(0) as Q;

  const competence_Q = deriveEngineeringCompetence(entity);
  // delta = (competence_Q / SCALE.Q) × (hoursWorked / requiredWorkHours) × SCALE.Q
  //       = competence_Q × hoursWorked / requiredWorkHours
  const delta = Math.round(competence_Q * hoursWorked / project.requiredWorkHours) as Q;

  const prevProgress = project.progress_Q;
  project.progress_Q = clampQ(
    (project.progress_Q + delta) as Q,
    q(0) as Q,
    project.completionThreshold_Q,
  );

  project.contributors.push({ entityId: entity.id, hoursWorked, competence_Q });

  // Record completion tick the first time the threshold is crossed.
  if (
    project.completedAtTick === undefined &&
    project.progress_Q >= project.completionThreshold_Q &&
    prevProgress < project.completionThreshold_Q
  ) {
    project.completedAtTick = tick;
  }

  return (project.progress_Q - prevProgress) as Q;
}

/**
 * Return true if a project has reached its completion threshold.
 */
export function isProjectComplete(project: CollectiveProject): boolean {
  return project.progress_Q >= project.completionThreshold_Q;
}

// ── Ritual & Ceremony ─────────────────────────────────────────────────────────

/**
 * Compute the morale and fear-reduction effects of a communal ritual.
 *
 * Each participant contributes their average (intrapersonal + musical) / 2
 * to a shared cognitive pool. The collective effect scales with sqrt(N)
 * (diminishing returns for large groups). The time factor scales linearly
 * from 0 at 0 s to 1 at RITUAL_DURATION_s; durations beyond that are capped.
 *
 * moraleBonus_Q is capped at RITUAL_MAX_BONUS regardless of group size.
 * fearReduction_Q = moraleBonus_Q × RITUAL_FEAR_REDUCTION_FRAC / SCALE.Q.
 *
 * @param participants   All entities taking part (pass only alive entities).
 * @param elapsedSeconds Duration of the ritual session in seconds.
 * @returns RitualResult to apply to all participants.
 */
export function stepRitual(participants: Entity[], elapsedSeconds: number): RitualResult {
  const n = participants.length;
  if (n === 0) {
    return { moraleBonus_Q: q(0) as Q, fearReduction_Q: q(0) as Q, participantCount: 0 };
  }

  // Pool each participant's ritual cognitive capacity.
  let sumPool = 0;
  for (const p of participants) {
    const intrap  = p.attributes.cognition?.intrapersonal ?? 0;
    const musical = p.attributes.cognition?.musical       ?? 0;
    sumPool += Math.trunc((intrap + musical) / 2);
  }

  const avgPool = Math.trunc(sumPool / n);

  // sqrt(N) collective scaling in fixed-point.
  // sqrtN_Q = floor(sqrt(N) × SCALE.Q)  e.g. N=4 → sqrtN_Q = 20 000
  const sqrtN_Q = Math.trunc(Math.sqrt(n) * SCALE.Q);

  // Time factor [0..SCALE.Q]: fraction of full ritual duration completed.
  const timeFrac = Math.min(
    SCALE.Q,
    Math.round(elapsedSeconds * SCALE.Q / RITUAL_DURATION_s),
  );

  // effectivePool = avgPool × sqrt(N)   [Q-scaled]
  const effectivePool = Math.round(avgPool * sqrtN_Q / SCALE.Q);
  // rawBonus = effectivePool × timeFrac / SCALE.Q
  const rawBonus = Math.round(effectivePool * timeFrac / SCALE.Q);

  const moraleBonus_Q: Q = clampQ(rawBonus as Q, q(0) as Q, RITUAL_MAX_BONUS);
  const fearReduction_Q: Q = clampQ(
    Math.round(moraleBonus_Q * RITUAL_FEAR_REDUCTION_FRAC / SCALE.Q) as Q,
    q(0) as Q,
    moraleBonus_Q,
  );

  return { moraleBonus_Q, fearReduction_Q, participantCount: n };
}

// ── Trade Caravan Logistics ────────────────────────────────────────────────────

/** Compute total route distance (SCALE.m) from ordered waypoints. */
function routeTotalDistance(waypoints: CaravanWaypoint[]): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1]!.position_m;
    const b = waypoints[i]!.position_m;
    const dx = Number(a.x) - Number(b.x);
    const dy = Number(a.y) - Number(b.y);
    const dz = Number(a.z) - Number(b.z);
    total += Math.trunc(Math.sqrt(dx * dx + dy * dy + dz * dz));
  }
  return total;
}

/**
 * Plan a trade caravan route, deriving logistics quality from participants'
 * cognitive attributes and food sufficiency from the supplied inventory.
 *
 * Route quality (best logicalMathematical) shortens travel time:
 *   speedFactor = q(0.80) + routeQuality_Q × q(0.20) / SCALE.Q  ∈ [q(0.80), q(1.00)]
 *   adjustedTravelSeconds = baseSeconds × SCALE.Q / speedFactor
 *
 * Supply sufficiency = totalRations / (adjustedTravelDays × participants × RATIONS/DAY).
 *
 * @param waypoints     Ordered stops (position + rest hours).
 * @param participants  Entities travelling with the caravan.
 * @param inventory     Map<itemId, quantity> of food items available (all entries count).
 * @returns             CaravanPlan with derived logistics values.
 */
export function planCaravanRoute(
  waypoints:    CaravanWaypoint[],
  participants: Entity[],
  inventory:    Map<string, number>,
): CaravanPlan {
  const participantIds = participants.map(p => p.id);

  // ── Route quality: best navigator's logicalMathematical leads the route ─────
  let bestLogical = 0;
  for (const p of participants) {
    const lm = p.attributes.cognition?.logicalMathematical ?? 0;
    if (lm > bestLogical) bestLogical = lm;
  }
  const routeQuality_Q: Q = participants.length > 0
    ? clampQ(bestLogical as Q, q(0) as Q, SCALE.Q as Q)
    : q(0) as Q;

  // ── Negotiation bonus: best interpersonal score ───────────────────────────
  let bestInterpersonal = 0;
  for (const p of participants) {
    const ip = p.attributes.cognition?.interpersonal ?? 0;
    if (ip > bestInterpersonal) bestInterpersonal = ip;
  }
  const negotiationBonus_Q: Q = clampQ(bestInterpersonal as Q, q(0) as Q, SCALE.Q as Q);

  // ── Distance and base travel time ─────────────────────────────────────────
  const totalDistance_Sm = routeTotalDistance(waypoints);
  const baseTravelSeconds = CARAVAN_BASE_SPEED_Smps > 0
    ? Math.trunc(totalDistance_Sm / CARAVAN_BASE_SPEED_Smps)
    : 0;

  // speedFactor ∈ [q(0.80), q(1.00)]: higher quality → closer to q(1.00)
  // At routeQuality_Q = 0      → speedFactor = q(0.80) → 25 % slower than optimal
  // At routeQuality_Q = SCALE.Q → speedFactor = q(1.00) → full base speed
  const speedFactor = (q(0.80) + Math.round(routeQuality_Q * q(0.20) / SCALE.Q)) as Q;
  const adjustedTravelSeconds = speedFactor > 0
    ? Math.round(baseTravelSeconds * SCALE.Q / speedFactor)
    : baseTravelSeconds;

  // ── Rest stops ────────────────────────────────────────────────────────────
  const totalRestSeconds = waypoints.reduce((sum, w) => sum + Math.round(w.restHours * 3600), 0);
  const estimatedTotalSeconds = adjustedTravelSeconds + totalRestSeconds;

  // ── Supply sufficiency ────────────────────────────────────────────────────
  let totalRations = 0;
  for (const qty of inventory.values()) {
    totalRations += Math.max(0, qty);
  }

  const travelDays   = adjustedTravelSeconds / 86_400;
  const rationsNeeded = travelDays * participants.length * CARAVAN_RATIONS_PER_PERSON_PER_DAY;

  let supplySufficiency_Q: Q;
  if (rationsNeeded <= 0) {
    supplySufficiency_Q = SCALE.Q as Q;
  } else {
    supplySufficiency_Q = clampQ(
      Math.round(totalRations * SCALE.Q / rationsNeeded) as Q,
      q(0) as Q,
      SCALE.Q as Q,
    );
  }

  // ── Deterministic plan ID ─────────────────────────────────────────────────
  const planId = `caravan_${waypoints.map(w => w.positionId).join("_")}`;

  return {
    planId,
    waypoints,
    participantIds,
    estimatedTravelSeconds:  adjustedTravelSeconds,
    estimatedTotalSeconds,
    supplySufficiency_Q,
    routeQuality_Q,
    negotiationBonus_Q,
  };
}
