/**
 * Phase 32B — Multi-Limb Granularity
 *
 * Per-limb state for entities whose body plan has multiple manipulation segments
 * (octopoids, arachnids, multi-armed creatures). Integrates with grapple resolution
 * by reducing effective contest force when limbs are severed or fatigued.
 *
 * Backward-compatible: entities without a limbStates field behave identically to
 * the existing single-pool grapple model.
 */

import { q, SCALE, type Q, clampQ, qMul, mulDiv, type I32 } from "../units.js";
import type { BodyPlan } from "./bodyplan.js";
import type { InjuryState } from "./injury.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LimbState {
  /** Matches a BodySegment.id in the entity's body plan. */
  segmentId:   string;
  /** Current grip quality on this limb (0 = no grip, q(1.0) = full grip). */
  gripQ:       Q;
  /** Entity id currently held by this limb; 0 = limb is free. */
  engagedWith: number;
  /** Float fatigue accumulator [same unit as energy_J]. Sub-unit precision. */
  fatigueJ:    number;
}

// ── Limb initialisation ───────────────────────────────────────────────────────

/**
 * Build initial LimbState[] from a BodyPlan.
 * Only segments with `manipulationRole === "primary"` are included.
 * Returns an empty array if no such segments exist.
 */
export function buildLimbStates(plan: BodyPlan): LimbState[] {
  return plan.segments
    .filter(s => s.manipulationRole === "primary")
    .map(s => ({
      segmentId:   s.id,
      gripQ:       q(0) as Q,
      engagedWith: 0,
      fatigueJ:    0,
    }));
}

// ── Force contribution ────────────────────────────────────────────────────────

/**
 * Compute the effective force multiplier given current limb states and injury.
 *
 * A limb is excluded when its body segment has structural damage at SCALE.Q
 * (fully destroyed / severed). The result is:
 *   (activeLimbs / totalLimbs) × averageGripQ
 *
 * Returns q(1.0) when limbStates is empty (degenerate case, caller should not
 * invoke this function if limb count is zero).
 */
export function effectiveLimbForceMul(
  limbStates: LimbState[],
  injury:     InjuryState,
): Q {
  const total = limbStates.length;
  if (total === 0) return q(1.0) as Q;

  let activeCount = 0;
  let gripSum = 0;

  for (const ls of limbStates) {
    const region = injury.byRegion?.[ls.segmentId];
    const structDmg = region?.structuralDamage ?? 0;
    if (structDmg >= SCALE.Q) continue;  // severed / destroyed
    activeCount++;
    gripSum += ls.gripQ;
  }

  if (activeCount === 0) return q(0) as Q;

  const activeFrac: Q = mulDiv(activeCount, SCALE.Q, total) as Q;  // e.g. 6/8 = q(0.75)
  const avgGrip:    Q = Math.trunc(gripSum / activeCount) as Q;

  // If all grips are 0 (entity not currently grappling) return activeFrac directly
  if (avgGrip === 0) return activeFrac;

  return clampQ(qMul(activeFrac, avgGrip), q(0), q(1.0));
}

// ── Fatigue accumulation ──────────────────────────────────────────────────────

/**
 * Tick fatigue for engaged limbs. Each active engaged limb drains
 * `peakForce_N / limbCount` energy per second (sub-unit float accumulator).
 *
 * The accumulated fatigueJ is informational for host use; it does not directly
 * reduce gripQ here (that is a host-side policy decision, e.g. after a threshold).
 */
export function stepLimbFatigue(
  limbStates:  LimbState[],
  peakForce_N: I32,
  delta_s:     number,
): void {
  const activeEngaged = limbStates.filter(ls => ls.engagedWith !== 0);
  if (activeEngaged.length === 0) return;

  const drainPerLimb = (peakForce_N / limbStates.length) * delta_s;
  for (const ls of activeEngaged) {
    ls.fatigueJ += drainPerLimb;
  }
}
