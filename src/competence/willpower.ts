// src/competence/willpower.ts — Phase 38: Willpower Reserve (Intrapersonal Intelligence)
//
// Intrapersonal intelligence governs internal management: willpower, sustained focus,
// emotional self-regulation, and mental stamina for cognitively demanding tasks.
//
// Analogous to Phase 2B's reserveEnergy_J for physical stamina.
// No kernel import — pure resolution module.

import type { Q } from "../units.js";
import { SCALE, q, clampQ } from "../units.js";
import type { Entity } from "../sim/entity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Willpower state analogous to physical energy reserve.
 */
export interface WillpowerState {
  /** Current willpower in joules (same unit as energy_J). */
  current_J: number;
  /** Maximum willpower capacity based on intrapersonal intelligence. */
  max_J: number;
}

/**
 * Outcome of a willpower operation.
 */
export interface WillpowerOutcome {
  /** True if operation succeeded (sufficient willpower). */
  success: boolean;
  /** Remaining willpower after operation. */
  remaining_J: number;
  /** True if willpower was depleted by this operation. */
  depleted: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Scale factor: max willpower = intrapersonal × SCALE_WILLPOWER_J. */
const SCALE_WILLPOWER_J = 50_000; // 50kJ max at intrapersonal q(1.0)

/** Base replenishment rate: q(0.10) of max per hour of rest. */
const REPLENISH_RATE_PER_HOUR: Q = q(0.10) as Q;

/** Concentration aura drain per tick (from Phase 12B). */
const CONCENTRATION_DRAIN_PER_TICK = 100; // 100 J per tick

/** Minimum willpower required to maintain concentration. */
const MIN_WILLPOWER_FOR_CONCENTRATION = 50;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute maximum willpower for an entity based on intrapersonal intelligence.
 *
 * Formula: max_J = intrapersonal × SCALE_WILLPOWER_J
 *
 * @param entity - The entity to compute willpower for.
 * @returns Maximum willpower capacity in joules.
 */
export function computeMaxWillpower(entity: Entity): number {
  const intrapersonal: Q = (entity.attributes.cognition?.intrapersonal ?? q(0.55)) as Q;
  return Math.round((intrapersonal * SCALE_WILLPOWER_J) / SCALE.Q);
}

/**
 * Initialize willpower state for an entity.
 * Call this when first adding willpower to an entity.
 */
export function initializeWillpower(entity: Entity): WillpowerState {
  const max_J = computeMaxWillpower(entity);
  return {
    current_J: max_J, // Start at full
    max_J,
  };
}

/**
 * Deduct willpower for a cognitive operation.
 *
 * @param willpower - Current willpower state (mutated).
 * @param cost_J - Cost of the operation in joules.
 * @returns Outcome indicating success/failure and depletion status.
 */
export function deductWillpower(
  willpower: WillpowerState,
  cost_J: number,
): WillpowerOutcome {
  if (willpower.current_J < cost_J) {
    // Insufficient willpower - operation fails
    return {
      success: false,
      remaining_J: willpower.current_J,
      depleted: willpower.current_J < MIN_WILLPOWER_FOR_CONCENTRATION,
    };
  }

  willpower.current_J -= cost_J;
  const depleted = willpower.current_J < MIN_WILLPOWER_FOR_CONCENTRATION;

  return {
    success: true,
    remaining_J: willpower.current_J,
    depleted,
  };
}

/**
 * Replenish willpower during rest.
 *
 * Formula: replenish = max_J × REPLENISH_RATE_PER_HOUR × hours
 *
 * @param willpower - Current willpower state (mutated).
 * @param hours - Hours of rest.
 * @returns Amount actually replenished.
 */
export function replenishWillpower(
  willpower: WillpowerState,
  hours: number,
): number {
  const replenishAmount = Math.round(
    (willpower.max_J * REPLENISH_RATE_PER_HOUR * hours) / SCALE.Q,
  );
  const before = willpower.current_J;
  willpower.current_J = Math.min(willpower.max_J, willpower.current_J + replenishAmount);
  return willpower.current_J - before;
}

/**
 * Step willpower for concentration aura (Phase 12B integration).
 * Called per tick when entity has active concentration.
 *
 * @param willpower - Current willpower state (mutated).
 * @returns True if concentration can be maintained.
 */
export function stepConcentrationWillpower(
  willpower: WillpowerState,
): boolean {
  if (willpower.current_J < CONCENTRATION_DRAIN_PER_TICK) {
    // Insufficient willpower - aura collapses
    willpower.current_J = Math.max(0, willpower.current_J);
    return false;
  }

  willpower.current_J -= CONCENTRATION_DRAIN_PER_TICK;
  return willpower.current_J >= MIN_WILLPOWER_FOR_CONCENTRATION;
}

/**
 * Check if entity has sufficient willpower for an operation.
 */
export function hasSufficientWillpower(
  willpower: WillpowerState,
  cost_J: number,
): boolean {
  return willpower.current_J >= cost_J;
}

/**
 * Get willpower ratio (0–1) for UI/AI decisions.
 */
export function getWillpowerRatio(willpower: WillpowerState): Q {
  return clampQ(
    Math.round((willpower.current_J * SCALE.Q) / Math.max(1, willpower.max_J)) as Q,
    q(0),
    SCALE.Q as Q,
  );
}

/**
 * Force willpower state update (for downtime healing, cheats, etc).
 */
export function setWillpower(
  willpower: WillpowerState,
  value_J: number,
): void {
  willpower.current_J = clampQ(value_J as Q, 0, willpower.max_J as Q) as number;
}
