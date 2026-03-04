// src/sim/hydrostatic.ts — Phase 27: Hydrostatic Shock & Cavitation
//
// High-velocity projectiles (> 600 m/s) produce a temporary radial stretch wave
// that amplifies internal damage in inelastic tissue. Above 900 m/s, momentary
// vacuum cavitation further increases haemorrhage in fluid-saturated tissue.
//
// This module is pure computation — no entity mutation, no RNG.

import type { Q } from "../units.js";
import { SCALE, q, clampQ, mulDiv } from "../units.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum projectile velocity for temporary cavity effect (600 m/s in SCALE.mps). */
export const HYDROSTATIC_THRESHOLD_mps = Math.trunc(600 * SCALE.mps);

/** Minimum projectile velocity for cavitation bleed bonus (900 m/s in SCALE.mps). */
export const CAVITATION_THRESHOLD_mps  = Math.trunc(900 * SCALE.mps);

// ── Tissue compliance ─────────────────────────────────────────────────────────

/**
 * Tissue compliance by region: lower = less elastic = more temporary cavity damage.
 * Look up by region id; fall back to DEFAULT_COMPLIANCE for unknown regions.
 *
 * Reference values (lower bound = bone q(0.05), upper = elastic muscle q(0.60)):
 *   bone/skull — q(0.05): extremely brittle; cavitation causes shattering
 *   brain/liver/spleen — q(0.10): very inelastic fluid organs
 *   lung — q(0.30): intermediate; partially elastic air-filled tissue
 *   muscle/torso — q(0.60): moderately elastic
 */
export const TISSUE_COMPLIANCE: Record<string, Q> = {
  // Organ segments (advanced body plans)
  brain:    q(0.10),
  liver:    q(0.10),
  spleen:   q(0.10),
  lung:     q(0.30),
  // Humanoid string-literal regions
  head:     q(0.10),   // brain-dominated
  torso:    q(0.40),   // mixed thoracic/abdominal
  leftArm:  q(0.60),
  rightArm: q(0.60),
  leftLeg:  q(0.60),
  rightLeg: q(0.60),
  // Bone segment ids
  bone:     q(0.05),
  skull:    q(0.05),
  femur:    q(0.05),
  tibia:    q(0.05),
};

/** Compliance used when a region is not in the table (muscle-level). */
export const DEFAULT_COMPLIANCE: Q = q(0.60);

/**
 * Region ids susceptible to cavitation bubble formation.
 * Excludes bone (non-fluid) and brain (inelastic but not vascular enough for macroscopic bubbles).
 */
const CAVITATION_TISSUE = new Set([
  "lung", "liver", "spleen",
  "torso", "leftLeg", "rightLeg",
]);

// ── computeTemporaryCavityMul ─────────────────────────────────────────────────

/**
 * Compute the temporary-cavity multiplier on internal-fraction damage.
 *
 * Returns a Q-scaled integer multiplier: `q(1.0)` = no extra damage, `q(3.0)` = maximum.
 * Only activates when `v_impact > HYDROSTATIC_THRESHOLD_mps`.
 *
 * Formula (fixed-point):
 *   v_ratio_Q = (v / 600)² × SCALE.Q
 *   tissue_factor_Q = v_ratio_Q × (SCALE.Q − compliance_Q) / SCALE.Q
 *   result = clamp(q(1.0) + tissue_factor_Q, q(1.0), q(3.0))
 *
 * Calibration:
 *   9mm (370 m/s)    → q(1.0)  (below gate) ✓
 *   5.56mm (960 m/s) → q(3.0)  for liver; q(2.0) for muscle ✓
 *   subsonic .45 ACP (270 m/s) → q(1.0) ✓
 *
 * @param v_impact   Projectile velocity at impact point (SCALE.mps units).
 * @param region     Hit region id.
 */
export function computeTemporaryCavityMul(v_impact: number, region: string): Q {
  if (v_impact <= HYDROSTATIC_THRESHOLD_mps) return q(1.0);

  const compliance_Q = TISSUE_COMPLIANCE[region] ?? DEFAULT_COMPLIANCE;

  // (v / threshold)² in Q-units — BigInt prevents integer overflow
  // Max practical v: ~2000 m/s = 2×10^7; v² = 4×10^14 → safe in BigInt
  const vB = BigInt(v_impact);
  const tB = BigInt(HYDROSTATIC_THRESHOLD_mps);
  const v_ratio_Q = Number((vB * vB * BigInt(SCALE.Q)) / (tB * tB));

  // tissue_factor_Q = v_ratio_Q × (1 − compliance) — both in Q-space
  const tissue_factor_Q = mulDiv(v_ratio_Q, SCALE.Q - compliance_Q, SCALE.Q);

  // result = q(1.0) + tissue_factor_Q, clamped to [q(1.0), q(3.0)]
  return clampQ(SCALE.Q + tissue_factor_Q, SCALE.Q, 3 * SCALE.Q) as Q;
}

// ── computeCavitationBleed ────────────────────────────────────────────────────

/**
 * Apply cavitation-induced haemorrhage boost to a region's bleedingRate.
 *
 * Only active when:
 *   - `v_impact > CAVITATION_THRESHOLD_mps` (900 m/s)
 *   - `region` is fluid-saturated tissue (lung, liver, spleen, torso, legs)
 *
 * Formula:
 *   cavMul = q(1.0) + (v − 900) / 300  [in Q-space]
 *   newBleed = clamp(currentBleed × cavMul, 0, q(1.0))
 *
 * @param v_impact     Projectile velocity at impact (SCALE.mps units).
 * @param currentBleed Existing bleedingRate after primary wound application (Q integer).
 * @param region       Hit region id (bone and non-fluid regions return unchanged bleed).
 * @returns            Updated bleedingRate (Q integer, clamped to q(1.0) max).
 */
export function computeCavitationBleed(
  v_impact:     number,
  currentBleed: number,
  region:       string,
): number {
  if (v_impact <= CAVITATION_THRESHOLD_mps) return currentBleed;
  if (!CAVITATION_TISSUE.has(region)) return currentBleed;
  if (currentBleed <= 0) return currentBleed;

  const CAVITATION_RANGE_mps = Math.trunc(300 * SCALE.mps);

  const v_excess    = v_impact - CAVITATION_THRESHOLD_mps;
  const bleedBonus_Q = mulDiv(v_excess, SCALE.Q, CAVITATION_RANGE_mps);
  const cavMul_Q    = SCALE.Q + bleedBonus_Q;  // q(1.0) + proportional bonus

  return Math.min(SCALE.Q, mulDiv(currentBleed, cavMul_Q, SCALE.Q));
}
