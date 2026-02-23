// src/sim/ranged.ts — Phase 3: pure ranged-combat physics (no Entity import)
import { SCALE, q, clampQ, qMul, mulDiv, type Q, type I32 } from "../units.js";
import type { RangedWeapon } from "../equipment.js";

export const TICK_HZ_RANGED = 20; // must match kernel TICK_HZ

/**
 * Energy remaining after ballistic drag over a given range.
 *
 * Linear approximation: energyFrac = max(0, 1 - range_m × dragCoeff_perM)
 * dragCoeff_perM is a Q value: q(0.007) means 0.7% loss per metre.
 */
export function energyAtRange_J(launchEnergy_J: I32, dragCoeff_perM: Q, range_m: I32): I32 {
  if (launchEnergy_J <= 0) return 0;
  const lossFrac = mulDiv(range_m, dragCoeff_perM, SCALE.m);   // Q-scaled fraction lost
  const energyFrac = Math.max(0, SCALE.Q - lossFrac);
  return mulDiv(launchEnergy_J, energyFrac, SCALE.Q);
}

/**
 * Adjusted dispersion (angular error in Q) accounting for shooter skill, fatigue, and
 * aiming intensity.
 *
 * controlMod: [1.0, 1.5] — poor aim widens spread
 * fatigueMod: [1.0, 1.5] — fatigue widens spread
 * intensityMod: [1.0, 1.9] — low intensity (snap shot) widens spread
 */
export function adjustedDispersionQ(
  baseDispQ: Q,
  controlQuality: Q,
  fineControl: Q,
  fatigue: Q,
  intensity: Q,
): Q {
  const aimSkill = clampQ(((controlQuality + fineControl) >>> 1) as Q, q(0), q(1.0));

  // controlMod in Q: 2.0 - aimSkill, clamped [1.0, 1.5]
  const controlMod = clampQ((2 * SCALE.Q - aimSkill) as Q, SCALE.Q, Math.round(1.5 * SCALE.Q));

  // fatigueMod in Q: 1.0 + fatigue × 0.5, clamped [1.0, 1.5]
  const fatigueMod = clampQ((SCALE.Q + qMul(fatigue, q(0.50))) as Q, SCALE.Q, Math.round(1.5 * SCALE.Q));

  // intensityMod in Q: 2.0 - intensity, clamped [1.0, 1.9]
  const intensityMod = clampQ((2 * SCALE.Q - clampQ(intensity, q(0.1), SCALE.Q)) as Q, SCALE.Q, Math.round(1.9 * SCALE.Q));

  return qMul(qMul(qMul(baseDispQ, controlMod), fatigueMod), intensityMod);
}

/**
 * Grouping radius (m in SCALE.m) at given range.
 * groupingRadius_m = dispersionQ × range_m / SCALE.Q
 */
export function groupingRadius_m(dispersionQ: Q, range_m: I32): I32 {
  return mulDiv(dispersionQ, range_m, SCALE.Q);
}

/**
 * Launch energy (J) for thrown weapons derived from thrower's peak power.
 * Models a ~100ms burst at 10% peak power.
 * Calibration: 1200 W × 0.10 = 120 J for average human.
 */
export function thrownLaunchEnergy_J(peakPower_W: I32): I32 {
  return Math.max(10, Math.trunc(peakPower_W / 10));
}

/**
 * Number of simulation ticks before the next shot can be fired.
 * recycleTime_s is in SCALE.s units.
 */
export function recycleTicks(wpn: RangedWeapon, tickHz: number): number {
  return Math.max(1, Math.trunc((wpn.recycleTime_s * tickHz) / SCALE.s));
}

/**
 * Energy cost (J) of firing a shot at the given intensity.
 * Modelled as ~50 ms draw/snap at 8% peak power for bows/throws;
 * negligible for firearms but still costs something (aim/recoil recovery).
 *
 * For weapons where launchEnergy derives from the shooter (thrown),
 * we use a larger fraction (10%) since the throw itself burns energy.
 */
export function shootCost_J(wpn: RangedWeapon, intensity: Q, peakPower_W: I32): I32 {
  const fracBase = wpn.category === "thrown" ? 10 : wpn.category === "bow" ? 6 : 2;
  const base = Math.max(5, Math.trunc(peakPower_W * fracBase / 100));
  return Math.max(2, mulDiv(base, intensity, SCALE.Q));
}
