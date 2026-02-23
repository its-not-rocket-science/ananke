/**
 * Phase 2C: Weapon Dynamics Expansion
 *
 * Pure functions for:
 *   - Reach dominance: short weapon penalised vs longer weapon
 *   - Two-handed leverage bonus: N·m advantage on attack energy
 *   - Miss recovery: extra cooldown ticks from weapon angular momentum
 *   - Weapon bind: opposing weapons locked on parry; requires contest to clear
 */
import { SCALE, q, clampQ, qMul, mulDiv, type Q, type I32 } from "../units.js";
import type { Weapon } from "../equipment.js";

// ---- Reach dominance ----

/**
 * Attack skill multiplier when attacker has shorter reach than target.
 *
 * The penalty ramps linearly with the reach deficit fraction:
 *   penalty_frac = (targetReach - attackerReach) / targetReach × 0.40
 *   multiplier   = clamp(1.0 - penalty_frac, 0.60, 1.0)
 *
 * Examples (at 20 Hz):
 *   knife (0.20 m) vs sword (0.80 m) → deficit 75 % → penalty 30 % → ×0.70
 *   club  (0.70 m) vs club  (0.70 m) → no penalty                   → ×1.00
 *   sword (0.80 m) vs knife (0.20 m) → no penalty (attacker longer)  → ×1.00
 */
export function reachDomPenaltyQ(
  attackerReach_m: I32,
  targetReach_m: I32,
): Q {
  if (attackerReach_m >= targetReach_m) return q(1.0) as Q;
  const deficit = targetReach_m - attackerReach_m;
  const deficitFrac = clampQ(
    mulDiv(deficit, SCALE.Q, Math.max(1, targetReach_m)) as Q,
    q(0),
    q(1.0),
  );
  return clampQ(
    (q(1.0) - qMul(deficitFrac, q(0.40))) as Q,
    q(0.60),
    q(1.0),
  );
}

// ---- Two-handed leverage bonus ----

/**
 * Attack energy multiplier for two-handed weapons.
 * Two-handed grip extends effective moment arm → more torque → higher energy transfer.
 * Calibrated to the 1.10× parry leverage bonus: attack gets 1.12× (slightly higher, as
 * a powered swing benefits more than a static parry).
 *
 * The bonus only applies when both arms are functional and no off-hand item is present.
 *
 * @param leftArmDisabled  from FunctionalState.leftArmDisabled
 * @param rightArmDisabled from FunctionalState.rightArmDisabled
 * @param hasOffHand       true if entity carries a shield or second weapon
 */
export function twoHandedAttackBonusQ(
  wpn: Weapon,
  leftArmDisabled: boolean,
  rightArmDisabled: boolean,
  hasOffHand: boolean,
): Q {
  if ((wpn.handedness ?? "oneHand") !== "twoHand") return q(1.0) as Q;
  if (leftArmDisabled || rightArmDisabled || hasOffHand) return q(1.0) as Q;
  return q(1.12) as Q;
}

// ---- Miss recovery ----

/**
 * Extra attack cooldown ticks after a missed strike.
 * Derived from angular momentum proxy: mass × reach.
 *
 * Formula: floor(mass_kg_real × reach_m_real × 2)
 *   where *_real means the value in SI units (not fixed-point).
 *
 * Calibration (at 20 Hz = 50 ms per tick):
 *   knife  (0.30 kg, 0.20 m) → 0 ticks   (0 ms extra)
 *   club   (1.20 kg, 0.70 m) → 1 tick    (50 ms extra)
 *   sword  (1.20 kg, 0.80 m) → 1 tick    (50 ms extra)
 *   halberd(2.00 kg, 1.50 m) → 6 ticks   (300 ms extra)
 */
export function missRecoveryTicks(wpn: Weapon): number {
  const reach_m = wpn.reach_m ?? Math.trunc(0.7 * SCALE.m);
  const num = BigInt(wpn.mass_kg) * BigInt(reach_m) * 2n;
  const den = BigInt(SCALE.kg) * BigInt(SCALE.m);
  return Math.max(0, Number(num / den));
}

// ---- Weapon bind ----

/**
 * Probability of weapon bind occurring on a successful parry.
 *
 * Longer moment arms on both weapons → higher contact surface → more likely to lock.
 *
 * Formula:
 *   aFrac = clamp(aArm / ref, 0.1, 2.0)
 *   dFrac = clamp(dArm / ref, 0.1, 2.0)
 *   chance = clamp(arithmetic_mean(aFrac, dFrac) × 0.25, 0, 0.45)
 *
 * Reference arm = 0.60 m (≈ arming sword).
 *
 * Examples:
 *   two knives  (arm 0.18 m each): chance ≈ 7.5 %
 *   two swords  (arm 0.45 m each): chance ≈ 18.8 %
 *   two polearms (arm 1.50 m each, capped at 2.0): chance = 45 %
 */
export function bindChanceQ(attackerWpn: Weapon, defenderWpn: Weapon): Q {
  const refArm = Math.trunc(0.6 * SCALE.m);
  const aArm = attackerWpn.momentArm_m ?? Math.trunc(0.55 * SCALE.m);
  const dArm = defenderWpn.momentArm_m ?? Math.trunc(0.55 * SCALE.m);

  const aFrac = clampQ(
    mulDiv(aArm, SCALE.Q, refArm) as Q,
    q(0.1),
    q(2.0),
  );
  const dFrac = clampQ(
    mulDiv(dArm, SCALE.Q, refArm) as Q,
    q(0.1),
    q(2.0),
  );

  const mean = ((aFrac + dFrac) >>> 1) as Q;
  return clampQ(qMul(mean, q(0.25)), q(0.0), q(0.45));
}

/**
 * Bind duration in ticks (at 20 Hz).
 * Heavier weapons take longer to disengage.
 *
 * Formula: clamp(2 + floor(avgMass_kg_real), 2, 8)
 *
 * Examples:
 *   two knives (0.3 kg each):  2 ticks (100 ms)
 *   two clubs  (1.2 kg each):  3 ticks (150 ms)
 *   heavy axes (3.0 kg each):  5 ticks (250 ms)
 */
export function bindDurationTicks(attackerWpn: Weapon, defenderWpn: Weapon): number {
  const avgMass = (attackerWpn.mass_kg + defenderWpn.mass_kg) >>> 1;
  const massReal = avgMass / SCALE.kg;
  return Math.max(2, Math.min(8, Math.trunc(2 + massReal)));
}

// ---- Bind breaking contest ----

/**
 * Win probability Q for the entity trying to actively break a weapon bind.
 *
 * Contest: torque = peakForce_N × momentArm_m (both fixed-point, units cancel in ratio).
 * P(break) = torque_breaker / (torque_breaker + torque_holder)
 *
 * Uses BigInt to avoid overflow (force ~184000 × arm ~5500 ≈ 1 billion).
 *
 * Returns Q ∈ [q(0.05), q(0.95)].
 *
 * Examples (both average humans with same weapon):
 *   Equal: P = 0.50
 *   Stronger breaker (2× force): P ≈ 0.67
 *   Much longer lever (2× arm):  P ≈ 0.67
 *
 * @param breakerForce_N  attacker's peakForce_N (fixed-point)
 * @param holderForce_N   partner's peakForce_N  (fixed-point)
 * @param breakerArm_m    attacker's weapon momentArm_m (fixed-point)
 * @param holderArm_m     partner's weapon momentArm_m  (fixed-point)
 */
export function breakBindContestQ(
  breakerForce_N: number,
  holderForce_N: number,
  breakerArm_m: number,
  holderArm_m: number,
): Q {
  const tBreaker = BigInt(breakerForce_N) * BigInt(breakerArm_m);
  const tHolder  = BigInt(holderForce_N)  * BigInt(holderArm_m);
  const total = tBreaker + tHolder;
  if (total === 0n) return q(0.5) as Q;
  return clampQ(
    Number(tBreaker * BigInt(SCALE.Q) / total) as Q,
    q(0.05),
    q(0.95),
  );
}
