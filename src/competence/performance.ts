// src/competence/performance.ts — Phase 39: Musical Performance as Morale Vector
//
// Performance generates sustained morale effects scaled by musical intelligence,
// draining willpower (Phase 38) to maintain.
//
// No kernel import — pure resolution module.

import type { Q } from "../units.js";
import { SCALE, q, clampQ } from "../units.js";
import type { Entity } from "../sim/entity.js";
import type { WillpowerState } from "./willpower.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Performance type affecting the style of morale bonus. */
export type PerformanceType =
  | "march"      // military cadence, drums — reduces fatigue
  | "rally"      // inspiring battle songs — fear reduction
  | "dirge"      // solemn remembrance — grief processing
  | "celebration" // victory/campfire songs — cohesion building
  | "lament";    // emotional release — individual fear processing

/** Specification for a performance. */
export interface PerformanceSpec {
  /** Type of performance. */
  performanceType: PerformanceType;
  /** Duration in seconds. */
  duration_s: number;
  /** Number of allies in range (affects total willpower drain). */
  audienceCount: number;
  /** Base range of the performance in metres. */
  range_m: number;
}

/** Outcome of a performance. */
export interface PerformanceOutcome {
  /** Fear decay bonus per tick (adds to normal fear decay). */
  fearDecayBonus_Q: Q;
  /** Cohesion bonus for the group (0–1). */
  cohesionBonus_Q: Q;
  /** Total willpower drained during performance. */
  willpowerDrained_J: number;
  /** Performance quality descriptor. */
  descriptor: "exceptional" | "good" | "adequate" | "poor";
  /** Whether performance was maintained for full duration. */
  completed: boolean;
}

/** Active performance state for ongoing morale effects. */
export interface ActivePerformance {
  /** Performer entity ID. */
  performerId: number;
  /** Performance type. */
  performanceType: PerformanceType;
  /** Remaining duration in seconds. */
  remaining_s: number;
  /** Fear decay bonus per tick. */
  fearDecayBonus_Q: Q;
  /** Range in metres. */
  range_m: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Base fear decay bonus per tick at musical q(1.0). */
const BASE_FEAR_DECAY_BONUS: Q = q(0.020) as Q;

/** Base cohesion bonus per performance. */
const BASE_COHESION_BONUS: Q = q(0.010) as Q;

/** Willpower drain per second of performance (at base quality). */
const BASE_WILLPOWER_DRAIN_PER_SECOND = 50; // 50 J/s

/** Willpower drain per audience member per second. */
const AUDIENCE_DRAIN_PER_SECOND = 10; // 10 J/s per ally

/** Maximum effective range for performance effects. */
const MAX_PERFORMANCE_RANGE_m = 100;

/** Minimum range for any performance effect. */
const MIN_PERFORMANCE_RANGE_m = 10;

// Performance type multipliers
const PERFORMANCE_TYPE_MULTIPLIERS: Record<PerformanceType, { fearMul: number; cohesionMul: number; drainMul: number }> = {
  march: { fearMul: 0.5, cohesionMul: 1.5, drainMul: 0.8 },
  rally: { fearMul: 1.5, cohesionMul: 1.0, drainMul: 1.2 },
  dirge: { fearMul: 0.8, cohesionMul: 0.5, drainMul: 0.6 },
  celebration: { fearMul: 1.0, cohesionMul: 1.5, drainMul: 1.0 },
  lament: { fearMul: 1.2, cohesionMul: 0.3, drainMul: 0.7 },
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve a musical performance.
 *
 * Performance generates sustained morale auras scaled by musical intelligence,
 * draining willpower (Phase 38) from the performer.
 *
 * Formulas:
 *   fearDecayBonus = musical × BASE_FEAR_DECAY_BONUS × typeMul
 *   cohesionBonus = musical × BASE_COHESION_BONUS × typeMul
 *   willpowerDrained = (BASE_DRAIN + audience × AUDIENCE_DRAIN) × duration × typeDrainMul
 *
 * Satyr bard (musical 0.95) → fearDecayBonus ≈ q(0.019), nearly matching a leader aura.
 *
 * @param performer - The entity performing; uses `cognition.musical`.
 * @param spec - Performance specification.
 * @returns Performance outcome with morale bonuses and willpower cost.
 */
export function resolvePerformance(
  performer: Entity,
  spec: PerformanceSpec,
): PerformanceOutcome {
  const musical: Q = (performer.attributes.cognition?.musical ?? q(0.50)) as Q;
  const musicalNorm = musical / SCALE.Q;

  // Type multipliers
  const typeMuls = PERFORMANCE_TYPE_MULTIPLIERS[spec.performanceType];

  // Calculate fear decay bonus
  const rawFearBonus = musicalNorm * (BASE_FEAR_DECAY_BONUS / SCALE.Q) * typeMuls.fearMul;
  const fearDecayBonus_Q = clampQ(
    Math.round(rawFearBonus * SCALE.Q) as Q,
    q(0),
    q(0.050) as Q, // cap at q(0.05) fear decay bonus
  );

  // Calculate cohesion bonus
  const rawCohesionBonus = musicalNorm * (BASE_COHESION_BONUS / SCALE.Q) * typeMuls.cohesionMul;
  const cohesionBonus_Q = clampQ(
    Math.round(rawCohesionBonus * SCALE.Q) as Q,
    q(0),
    SCALE.Q as Q,
  );

  // Calculate willpower drain
  const baseDrain = BASE_WILLPOWER_DRAIN_PER_SECOND + spec.audienceCount * AUDIENCE_DRAIN_PER_SECOND;
  const willpowerDrained_J = Math.round(baseDrain * spec.duration_s * typeMuls.drainMul);

  // Determine descriptor based on musical skill
  let descriptor: PerformanceOutcome["descriptor"];
  if (musical >= q(0.85)) {
    descriptor = "exceptional";
  } else if (musical >= q(0.65)) {
    descriptor = "good";
  } else if (musical >= q(0.45)) {
    descriptor = "adequate";
  } else {
    descriptor = "poor";
  }

  return {
    fearDecayBonus_Q,
    cohesionBonus_Q,
    willpowerDrained_J,
    descriptor,
    completed: true, // assumes full duration completed
  };
}

/**
 * Step an active performance for one tick.
 * Deducts willpower and returns whether performance can continue.
 *
 * @param performance - Active performance state (mutated).
 * @param willpower - Performer's willpower state (mutated).
 * @param delta_s - Time step in seconds.
 * @returns True if performance can continue, false if willpower depleted.
 */
export function stepPerformance(
  performance: ActivePerformance,
  willpower: WillpowerState,
  delta_s: number,
): boolean {
  const typeMuls = PERFORMANCE_TYPE_MULTIPLIERS[performance.performanceType];
  const drainRate = BASE_WILLPOWER_DRAIN_PER_SECOND * typeMuls.drainMul;
  const drainAmount = Math.round(drainRate * delta_s);

  if (willpower.current_J < drainAmount) {
    // Insufficient willpower - performance stops
    willpower.current_J = Math.max(0, willpower.current_J);
    return false;
  }

  willpower.current_J -= drainAmount;
  performance.remaining_s = Math.max(0, performance.remaining_s - delta_s);

  return performance.remaining_s > 0;
}

/**
 * Calculate the effective range of a performance.
 *
 * @param performer - The performing entity.
 * @param baseRange - Base range in metres.
 * @returns Effective range in metres.
 */
export function calculatePerformanceRange(
  performer: Entity,
  baseRange: number = 50,
): number {
  const musical: Q = (performer.attributes.cognition?.musical ?? q(0.50)) as Q;
  const musicalNorm = musical / SCALE.Q;

  // Musical skill increases effective range
  const rangeMultiplier = 0.5 + musicalNorm; // 0.5 to 1.5x range
  const effectiveRange = Math.round(baseRange * rangeMultiplier);

  return clampQ(effectiveRange as Q, MIN_PERFORMANCE_RANGE_m as Q, MAX_PERFORMANCE_RANGE_m as Q) as number;
}

/**
 * Check if an entity is in range of a performance.
 *
 * @param performance - Active performance.
 * @param performerPos - Performer's position.
 * @param listenerPos - Potential listener's position.
 * @returns True if listener is within performance range.
 */
export function isInPerformanceRange(
  performance: ActivePerformance,
  performerPos: { x: number; y: number; z: number },
  listenerPos: { x: number; y: number; z: number },
): boolean {
  const dx = (performerPos.x - listenerPos.x) / SCALE.m;
  const dy = (performerPos.y - listenerPos.y) / SCALE.m;
  const dz = (performerPos.z - listenerPos.z) / SCALE.m;
  const dist_m = Math.sqrt(dx * dx + dy * dy + dz * dz);

  return dist_m <= performance.range_m;
}

/**
 * Create an active performance state.
 *
 * @param performerId - Entity ID of the performer.
 * @param performanceType - Type of performance.
 * @param duration_s - Duration in seconds.
 * @param performer - The performing entity (for musical bonus calculation).
 * @returns Active performance state.
 */
export function createActivePerformance(
  performerId: number,
  performanceType: PerformanceType,
  duration_s: number,
  performer: Entity,
): ActivePerformance {
  const outcome = resolvePerformance(performer, {
    performanceType,
    duration_s,
    audienceCount: 0, // Will be updated dynamically
    range_m: calculatePerformanceRange(performer),
  });

  return {
    performerId,
    performanceType,
    remaining_s: duration_s,
    fearDecayBonus_Q: outcome.fearDecayBonus_Q,
    range_m: calculatePerformanceRange(performer),
  };
}

/**
 * Check if an entity can effectively perform.
 * Requires minimum musical intelligence and available willpower.
 *
 * @param entity - The potential performer.
 * @param willpower - The entity's willpower state.
 * @param minMusical - Minimum musical intelligence required.
 * @returns True if entity can perform.
 */
export function canPerform(
  entity: Entity,
  willpower: WillpowerState,
  minMusical: Q = q(0.35),
): boolean {
  const musical: Q = (entity.attributes.cognition?.musical ?? q(0.50)) as Q;
  return musical >= minMusical && willpower.current_J > BASE_WILLPOWER_DRAIN_PER_SECOND * 10;
}

/**
 * Estimate performance effectiveness without consuming resources.
 *
 * @param performer - The potential performer.
 * @param performanceType - Type of performance.
 * @param duration_s - Expected duration.
 * @param audienceCount - Expected audience size.
 * @returns Estimated outcome values.
 */
export function estimatePerformance(
  performer: Entity,
  performanceType: PerformanceType,
  duration_s: number,
  audienceCount: number,
): Omit<PerformanceOutcome, "completed"> {
  const musical: Q = (performer.attributes.cognition?.musical ?? q(0.50)) as Q;
  const musicalNorm = musical / SCALE.Q;

  const typeMuls = PERFORMANCE_TYPE_MULTIPLIERS[performanceType];

  const rawFearBonus = musicalNorm * (BASE_FEAR_DECAY_BONUS / SCALE.Q) * typeMuls.fearMul;
  const fearDecayBonus_Q = clampQ(
    Math.round(rawFearBonus * SCALE.Q) as Q,
    q(0),
    q(0.050) as Q,
  );

  const rawCohesionBonus = musicalNorm * (BASE_COHESION_BONUS / SCALE.Q) * typeMuls.cohesionMul;
  const cohesionBonus_Q = clampQ(
    Math.round(rawCohesionBonus * SCALE.Q) as Q,
    q(0),
    SCALE.Q as Q,
  );

  const baseDrain = BASE_WILLPOWER_DRAIN_PER_SECOND + audienceCount * AUDIENCE_DRAIN_PER_SECOND;
  const willpowerDrained_J = Math.round(baseDrain * duration_s * typeMuls.drainMul);

  let descriptor: PerformanceOutcome["descriptor"];
  if (musical >= q(0.85)) {
    descriptor = "exceptional";
  } else if (musical >= q(0.65)) {
    descriptor = "good";
  } else if (musical >= q(0.45)) {
    descriptor = "adequate";
  } else {
    descriptor = "poor";
  }

  return {
    fearDecayBonus_Q,
    cohesionBonus_Q,
    willpowerDrained_J,
    descriptor,
  };
}
