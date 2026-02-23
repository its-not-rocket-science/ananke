/**
 * Phase 5 — Morale and Psychological State
 *
 * Pure fixed-point functions. No Math.random(), no Entity imports.
 * All randomness via eventSeed + caller-supplied seed.
 */

import type { Q } from "../units.js";
import { SCALE, q, clampQ, qMul } from "../units.js";

// ── Fear increment constants ──────────────────────────────────────────────────

/** Fear added per tick of active suppression (incoming near-miss fire). */
export const FEAR_PER_SUPPRESSION_TICK: Q = q(0.020);

/** Fear added when a nearby ally is killed in the same tick. */
export const FEAR_FOR_ALLY_DEATH: Q = q(0.150);

/** Multiplier: fear added per tick = shock × this. */
export const FEAR_INJURY_MUL: Q = q(0.012);

/** Fear added per tick when enemies outnumber allies in awareness radius. */
export const FEAR_OUTNUMBERED: Q = q(0.010);

/** Fear added to a defender per surprise attack (attacker undetected). */
export const FEAR_SURPRISE: Q = q(0.080);

/** Fear added per tick when >50% of own team is already routing. */
export const FEAR_ROUTING_CASCADE: Q = q(0.030);

// ── Fear decay constants ──────────────────────────────────────────────────────

/** Base fear decay per tick, multiplied by distressTolerance. */
const BASE_DECAY: Q = q(0.008);

/** Additional fear decay per nearby living ally (cohesion effect). */
const ALLY_COHESION: Q = q(0.002);

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Fear decay rate per tick.
 * Scales with distressTolerance (stoic entities recover faster)
 * and with nearby living ally count (cohesion effect).
 *
 * Returns a Q value to subtract from fearQ each tick.
 */
export function fearDecayPerTick(distressTolerance: Q, nearbyAllyCount: number): Q {
  const base = qMul(BASE_DECAY, distressTolerance);
  const cohesion = Math.min(nearbyAllyCount * ALLY_COHESION, q(0.020)) as Q; // cap cohesion at q(0.020)
  return clampQ(base + cohesion, 0, q(0.030));
}

/**
 * Routing threshold — minimum fear to trigger retreat behaviour.
 * Higher distressTolerance → bolder → threshold is higher.
 *
 * Range: q(0.50) at tolerance=0 → q(0.80) at tolerance=1.
 */
export function moraleThreshold(distressTolerance: Q): Q {
  return clampQ(q(0.50) + qMul(distressTolerance, q(0.30)), q(0.50), q(0.80));
}

/**
 * Whether an entity is currently routing.
 */
export function isRouting(fearQ: Q, distressTolerance: Q): boolean {
  return fearQ >= moraleThreshold(distressTolerance);
}

/**
 * Effective pain level from shock (0..1), reduced by distress tolerance.
 *
 * painLevel = shock × (1 − distressTolerance)
 *
 * Returns a Q value representing probability that pain blocks voluntary action.
 */
export function painLevel(shock: Q, distressTolerance: Q): Q {
  // shock × (SCALE.Q - distressTolerance) / SCALE.Q
  return clampQ(qMul(shock, (SCALE.Q - distressTolerance) as Q), 0, SCALE.Q);
}

/**
 * Deterministic pain suppression check.
 * Returns true if pain prevents the entity from initiating an attack this tick.
 *
 * @param seed      - Caller supplies eventSeed(..., 0xPA15); value drives the roll.
 * @param shock     - Entity's current shock level.
 * @param distressTolerance - Entity's pain tolerance.
 */
export function painBlocksAction(seed: number, shock: Q, distressTolerance: Q): boolean {
  const pain = painLevel(shock, distressTolerance);
  if (pain <= 0) return false;
  return (seed % SCALE.Q) < pain;
}
