// src/competence/navigation.ts — Phase 34: Spatial Intelligence Non-Combat Applications
//
// Navigation and pathfinding model:
//   routeEfficiency = clamp(spatial × terrainQ × mapBonus × visibilityQ, q(0.50), q(1.0))
//   timeLost_s      = baseTime_s × (1 / routeEfficiency − 1)
//     where baseTime_s = distance_m / BASE_TRAVEL_SPEED_mps
//
// No kernel import — pure resolution module.

import type { Q }            from "../units.js";
import { SCALE, q, clampQ, qMul, mulDiv } from "../units.js";
import type { Entity }       from "../sim/entity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NavigationSpec {
  /** Journey distance in metres (real number). */
  distance_m:  number;
  terrain:     "road" | "forest" | "mountain" | "urban" | "sea";
  /** True = navigator has a map or chart of the area. */
  hasMap:      boolean;
  visibility:  "clear" | "fog" | "night";
}

export interface NavigationOutcome {
  /** 1.0 = optimal route; lower = detours taken. Clamped to [q(0.50), q(1.0)]. */
  routeEfficiency: Q;
  /** Additional seconds lost to detours vs the optimal route. */
  timeLost_s:      number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TERRAIN_Q: Record<NavigationSpec["terrain"], Q> = {
  road:     q(1.00) as Q,
  urban:    q(0.95) as Q,
  forest:   q(0.85) as Q,
  mountain: q(0.75) as Q,
  sea:      q(0.70) as Q,
};

const VIS_Q: Record<NavigationSpec["visibility"], Q> = {
  clear: q(1.00) as Q,
  fog:   q(0.85) as Q,
  night: q(0.75) as Q,
};

/** Default foot-travel speed [m/s] used to derive base journey time. */
const BASE_TRAVEL_SPEED_mps = 1.4;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve a navigation attempt.
 *
 * @param entity - The navigator; uses `cognition.spatial`.
 * @param spec   - Navigation specification.
 * @param seed   - Reserved for future variance; currently unused.
 */
export function resolveNavigation(
  entity: Entity,
  spec:   NavigationSpec,
  _seed:  number,
): NavigationOutcome {
  const spatial: Q = (entity.attributes.cognition?.spatial ?? q(0.50)) as Q;
  const terrainQ   = TERRAIN_Q[spec.terrain];
  const visQ       = VIS_Q[spec.visibility];
  const mapBonus: Q = spec.hasMap ? q(1.10) as Q : q(0.90) as Q;

  // Compose all modifiers: spatial × mapBonus × terrainQ × visibilityQ
  const rawEfficiency = qMul(qMul(qMul(spatial, mapBonus), terrainQ), visQ);
  const routeEfficiency = clampQ(rawEfficiency, q(0.50), q(1.0));

  // timeLost = baseTravelTime × (1/efficiency − 1)
  //          = baseTravelTime × (SCALE.Q − efficiency) / efficiency
  const baseTime_s    = spec.distance_m / BASE_TRAVEL_SPEED_mps;
  const timeLost_s    = spec.distance_m > 0
    ? Math.round(baseTime_s * mulDiv(SCALE.Q - routeEfficiency, SCALE.Q, routeEfficiency) / SCALE.Q)
    : 0;

  return { routeEfficiency, timeLost_s };
}
