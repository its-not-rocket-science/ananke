// src/sim/knockback.ts — Phase 26: Momentum Transfer & Knockback
//
// Impulse-momentum model for melee and ranged impacts.
// Physics: impulse = sqrt(2 × E × m_eff); Δv = impulse / m_target
// Stability modifier reduces effective knockback before threshold checks.
//
// Math.sqrt is used for impulse calculation — acceptable per project convention
// (already used in kernel.ts for velocity magnitude computations).

import type { Entity } from "./entity.js";
import { SCALE, qMul }  from "../units.js";
import { normaliseDirCheapQ } from "./vec3.js";
import { mulDiv } from "../units.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Effective Δv at which a target begins to stumble (0.5 m/s in SCALE.mps units). */
export const STAGGER_THRESHOLD_mps = Math.trunc(0.5 * SCALE.mps);  // 5 000

/** Effective Δv at which a target is knocked prone (2.0 m/s in SCALE.mps units). */
export const PRONE_THRESHOLD_mps   = Math.trunc(2.0 * SCALE.mps);  // 20 000

/** Ticks of reduced-action window while staggered. */
export const STAGGER_TICKS = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KnockbackResult {
  /** Raw impulse in real Newton-seconds (diagnostic; not used in further simulation math). */
  impulse_Ns:  number;
  /** Effective velocity delta in SCALE.mps units, after stability reduction. Applied to target. */
  knockback_v: number;
  /** True when effective_v ≥ STAGGER_THRESHOLD and entity is not knocked prone. */
  staggered:   boolean;
  /** True when effective_v ≥ PRONE_THRESHOLD. Implies staggered. */
  prone:       boolean;
}

// ── computeKnockback ──────────────────────────────────────────────────────────

/**
 * Derive knockback result from an impact.
 *
 * Physics derivation:
 *   impulse = sqrt(2 × E × m_eff)         [N·s — same as p = m_eff × v_head]
 *   raw_Δv  = impulse / m_target          [m/s]
 *   effective_v = raw_Δv × (1 − stabilityQ)
 *
 * Calibration:
 *   5.56 mm  (4 g, 1760 J, 75 kg target): Δv ≈ 0.05 m/s — negligible ✓
 *   12-gauge slug (28 g, 2100 J, 75 kg):  Δv ≈ 0.25 m/s raw — stagger on low-stability target
 *   Large creature kick (50 kg eff, 400 J, 75 kg): Δv ≈ 2.67 m/s raw — prone on low-stability
 *
 * @param energy_J    Impact energy (raw joules; SCALE.J = 1).
 * @param massEff_kg  Effective striking mass in SCALE.kg units (wpn + body fraction, or projectile).
 * @param target      Target entity (reads mass_kg and stabilityQ).
 */
export function computeKnockback(
  energy_J:   number,
  massEff_kg: number,
  target:     Entity,
): KnockbackResult {
  const zero: KnockbackResult = { impulse_Ns: 0, knockback_v: 0, staggered: false, prone: false };
  if (energy_J <= 0 || massEff_kg <= 0) return zero;

  // Convert to real units for physics calculation
  const massEff_real    = massEff_kg / SCALE.kg;                           // real kg
  const massTarget_real = Math.max(0.001, target.attributes.morphology.mass_kg / SCALE.kg);  // real kg

  // impulse = sqrt(2 × E × m_eff)  [N·s]
  const impulse_Ns = Math.sqrt(2 * energy_J * massEff_real);

  // raw Δv in SCALE.mps units
  const raw_v = Math.trunc((impulse_Ns / massTarget_real) * SCALE.mps);

  // Stability modifier: higher stability → less effective knockback
  const stabilityQ  = target.attributes.control.stability;
  const knockback_v = Math.trunc(qMul(raw_v, SCALE.Q - stabilityQ));

  const prone     = knockback_v >= PRONE_THRESHOLD_mps;
  const staggered = !prone && knockback_v >= STAGGER_THRESHOLD_mps;

  return { impulse_Ns, knockback_v, staggered, prone };
}

// ── applyKnockback ────────────────────────────────────────────────────────────

/**
 * Apply knockback result to an entity.
 *
 * - Adds `result.knockback_v` to the entity's velocity in the hit direction.
 * - Sets `condition.prone = true` when result.prone.
 * - Sets `action.staggerTicks = STAGGER_TICKS` when result.staggered.
 *
 * @param entity  Target entity (mutated in-place).
 * @param result  Result from `computeKnockback`.
 * @param dir     Direction from attacker to target in SCALE.m coordinates (unnormalised).
 */
export function applyKnockback(
  entity: Entity,
  result: KnockbackResult,
  dir:    { dx: number; dy: number },
): void {
  if (result.knockback_v === 0) return;
  if (dir.dx === 0 && dir.dy === 0) return;

  // Cheap Chebyshev normalisation — no float division in the hot path
  const dirQ = normaliseDirCheapQ({ x: dir.dx, y: dir.dy, z: 0 });

  entity.velocity_mps.x += mulDiv(result.knockback_v, dirQ.x, SCALE.Q);
  entity.velocity_mps.y += mulDiv(result.knockback_v, dirQ.y, SCALE.Q);

  if (result.prone) {
    entity.condition.prone = true;
  }

  if (result.staggered) {
    entity.action.staggerTicks = Math.max(entity.action.staggerTicks ?? 0, STAGGER_TICKS);
  }
}
