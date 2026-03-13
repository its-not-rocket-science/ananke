// src/sim/mount.ts — Phase 59: Mounted Combat & Riding
//
// Physics-grounded model for rider/mount pairs.
//
// Charge attack: a fraction of the mount's kinetic energy is delivered to the target.
//   bonusEnergy_J = ½ × (mass_kg × CHARGE_MASS_FRAC / SCALE.Q) × v²
//
// Height advantage: elevated rider gains an aim bonus proportional to mount height.
//   aimBonus_Q = min(riderHeightBonus_m / SCALE.m × HEIGHT_AIM_BONUS_PER_M, HEIGHT_AIM_BONUS_MAX)
//
// Fear contagion: when mount shock exceeds its fearThreshold, excess shock propagates to rider.
//
// Forced dismount: triggered by rider over-shock, mount death, or mount bolting.
//
// Public API:
//   getMountGaitSpeed(profile, gait)           → SCALE.mps
//   computeChargeBonus(profile, speed_Smps)    → ChargeBonus
//   deriveRiderHeightBonus(profile)            → Q
//   deriveRiderStabilityBonus(profile)         → Q
//   computeFallEnergy_J(profile, riderMass_Skg)→ number (joules)
//   deriveMountFearPressure(mountShockQ, fearThreshold_Q) → Q
//   checkMountStep(riderShockQ, mountShockQ, mountDead, profile) → MountStepResult
//   entityIsMounted(entity)                    → boolean
//   entityIsMount(entity)                      → boolean

import { q, clampQ, to, SCALE, type Q } from "../units.js";
import type { Entity } from "./entity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Movement gait of the mounted pair. */
export type MountGait = "walk" | "trot" | "gallop" | "charge";

/** Species-level mount data record. */
export interface MountProfile {
  id:                   string;
  name:                 string;
  /** Body mass of the mount [SCALE.kg]. */
  mass_kg:              number;
  /** Height of rider's seat above ground [SCALE.m]. */
  riderHeightBonus_m:   number;
  /** Maximum load the mount can carry (rider + equipment) [SCALE.kg]. */
  maxCarryCapacity_kg:  number;
  /** Walk speed [SCALE.mps]. */
  walkSpeed_mps:        number;
  /** Trot speed [SCALE.mps]. */
  trotSpeed_mps:        number;
  /** Gallop speed [SCALE.mps]. */
  gallopSpeed_mps:      number;
  /** Charge speed — typically faster than gallop [SCALE.mps]. */
  chargeSpeed_mps:      number;
  /** Mount postural stability [Q]. Partially inherited by rider. */
  stability_Q:          Q;
  /**
   * Fear threshold [Q].
   * When mount shockQ exceeds this value, fear propagates to the rider and
   * the mount risks bolting (forced dismount).
   */
  fearThreshold_Q:      Q;
}

/** Kinetic energy delivered to a target in a charge attack. */
export interface ChargeBonus {
  /** Extra energy delivered to the target [J, SCALE.J = 1]. */
  bonusEnergy_J:  number;
  /** Effective striking mass (the fraction of mount mass in the impact) [SCALE.kg]. */
  strikeMass_kg:  number;
}

/** Why a dismount was triggered. */
export type DismountCause = "none" | "rider_shock" | "mount_dead" | "mount_bolt";

/** Result of evaluating one mount/rider tick. */
export interface MountStepResult {
  /** True when the rider should be dismounted this tick. */
  shouldDismount:  boolean;
  /** Reason for the dismount (or "none" if not dismounting). */
  dismountCause:   DismountCause;
  /** Fall injury energy [J] — non-zero only when shouldDismount is true. */
  fallEnergy_J:    number;
  /** Fear Q to add to the rider's condition from mount panic [Q]. */
  fearPressure_Q:  Q;
}

/**
 * Per-entity mount/rider pair state, stored on `entity.mount`.
 *
 * On the rider entity: `mountId` is set, `riderId` is 0.
 * On the mount entity: `riderId` is set, `mountId` is 0.
 */
export interface MountState {
  /** Entity ID of the mount being ridden. 0 if this entity is not riding. */
  mountId: number;
  /** Entity ID of the rider being carried. 0 if this entity is not a mount. */
  riderId: number;
  /** Current movement gait. */
  gait:    MountGait;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Fraction of mount mass that contributes to charge strike energy [Q]. */
export const CHARGE_MASS_FRAC: Q = q(0.08) as Q;

/** Rider shock level above which a forced dismount occurs [Q]. */
export const DISMOUNT_SHOCK_Q: Q = q(0.65) as Q;

/** Aim / accuracy bonus per real metre of rider elevation [Q]. */
export const HEIGHT_AIM_BONUS_PER_M: Q = q(0.12) as Q;

/** Maximum rider height aim bonus (caps at 2.5 m for war elephant) [Q]. */
export const HEIGHT_AIM_BONUS_MAX: Q = q(0.30) as Q;

/** Fraction of mount stability that transfers to the rider [Q]. */
export const RIDER_STABILITY_INHERIT: Q = q(0.15) as Q;

/** Fraction of excess mount-shock (beyond fearThreshold) that propagates to rider [Q]. */
export const MOUNT_FEAR_CONTAGION: Q = q(0.40) as Q;

// ── Mount profiles ────────────────────────────────────────────────────────────

export const PONY: MountProfile = {
  id:                  "pony",
  name:                "Pony",
  mass_kg:             to.kg(250),
  riderHeightBonus_m:  to.m(0.90),
  maxCarryCapacity_kg: to.kg(100),
  walkSpeed_mps:       to.mps(1.5),
  trotSpeed_mps:       to.mps(4.0),
  gallopSpeed_mps:     to.mps(10.0),
  chargeSpeed_mps:     to.mps(11.0),
  stability_Q:         q(0.82) as Q,
  fearThreshold_Q:     q(0.50) as Q,
};

export const HORSE: MountProfile = {
  id:                  "horse",
  name:                "Horse",
  mass_kg:             to.kg(450),
  riderHeightBonus_m:  to.m(1.20),
  maxCarryCapacity_kg: to.kg(130),
  walkSpeed_mps:       to.mps(1.6),
  trotSpeed_mps:       to.mps(4.5),
  gallopSpeed_mps:     to.mps(14.0),
  chargeSpeed_mps:     to.mps(16.0),
  stability_Q:         q(0.88) as Q,
  fearThreshold_Q:     q(0.58) as Q,
};

export const WARHORSE: MountProfile = {
  id:                  "warhorse",
  name:                "Warhorse",
  mass_kg:             to.kg(550),
  riderHeightBonus_m:  to.m(1.30),
  maxCarryCapacity_kg: to.kg(150),
  walkSpeed_mps:       to.mps(1.5),
  trotSpeed_mps:       to.mps(4.0),
  gallopSpeed_mps:     to.mps(13.0),
  chargeSpeed_mps:     to.mps(17.0),
  stability_Q:         q(0.92) as Q,
  fearThreshold_Q:     q(0.72) as Q,  // battle-trained — much harder to panic
};

export const CAMEL: MountProfile = {
  id:                  "camel",
  name:                "Camel",
  mass_kg:             to.kg(400),
  riderHeightBonus_m:  to.m(1.80),
  maxCarryCapacity_kg: to.kg(160),
  walkSpeed_mps:       to.mps(1.5),
  trotSpeed_mps:       to.mps(3.5),
  gallopSpeed_mps:     to.mps(11.0),
  chargeSpeed_mps:     to.mps(12.0),
  stability_Q:         q(0.80) as Q,
  fearThreshold_Q:     q(0.52) as Q,
};

export const WAR_ELEPHANT: MountProfile = {
  id:                  "war_elephant",
  name:                "War Elephant",
  mass_kg:             to.kg(3_000),
  riderHeightBonus_m:  to.m(2.50),
  maxCarryCapacity_kg: to.kg(300),
  walkSpeed_mps:       to.mps(2.0),
  trotSpeed_mps:       to.mps(4.0),
  gallopSpeed_mps:     to.mps(7.0),
  chargeSpeed_mps:     to.mps(8.0),
  stability_Q:         q(0.92) as Q,
  fearThreshold_Q:     q(0.48) as Q,  // prone to panic but devastating when controlled
};

/** All mount profiles in one array. */
export const ALL_MOUNTS: MountProfile[] = [PONY, HORSE, WARHORSE, CAMEL, WAR_ELEPHANT];

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Return the mount's speed in SCALE.mps for the given gait.
 */
export function getMountGaitSpeed(profile: MountProfile, gait: MountGait): number {
  switch (gait) {
    case "walk":   return profile.walkSpeed_mps;
    case "trot":   return profile.trotSpeed_mps;
    case "gallop": return profile.gallopSpeed_mps;
    case "charge": return profile.chargeSpeed_mps;
  }
}

/**
 * Compute the bonus kinetic energy delivered to a target during a mounted charge.
 *
 * Only `CHARGE_MASS_FRAC` (8%) of the mount's mass participates in the impact;
 * the remainder is absorbed through the mount's body.
 *
 * `bonusEnergy_J = ½ × strikeMass × v²`  (SI, result in joules)
 *
 * @param speed_Smps  Current charge speed [SCALE.mps].
 */
export function computeChargeBonus(profile: MountProfile, speed_Smps: number): ChargeBonus {
  if (speed_Smps <= 0) return { bonusEnergy_J: 0, strikeMass_kg: 0 };

  const strikeMass_kg = Math.round(profile.mass_kg * CHARGE_MASS_FRAC / SCALE.Q);
  // ½ × (strikeMass_kg / SCALE.kg) × (speed_Smps / SCALE.mps)²  — result in J (SCALE.J = 1)
  const bonusEnergy_J = Math.round(
    0.5 * strikeMass_kg * speed_Smps * speed_Smps / (SCALE.kg * SCALE.mps * SCALE.mps),
  );
  return { bonusEnergy_J, strikeMass_kg };
}

/**
 * Derive the aim/accuracy bonus a rider gains from elevation.
 *
 * `aimBonus_Q = (riderHeightBonus_m / SCALE.m) × HEIGHT_AIM_BONUS_PER_M`
 * Capped at HEIGHT_AIM_BONUS_MAX = q(0.30).
 */
export function deriveRiderHeightBonus(profile: MountProfile): Q {
  const heightBonus_Q = Math.round(
    profile.riderHeightBonus_m * HEIGHT_AIM_BONUS_PER_M / SCALE.m,
  );
  return clampQ(heightBonus_Q as Q, q(0) as Q, HEIGHT_AIM_BONUS_MAX as Q);
}

/**
 * Derive the stability bonus a rider inherits from a well-balanced mount.
 *
 * `stabilityBonus_Q = mount.stability_Q × RIDER_STABILITY_INHERIT / SCALE.Q`
 * Capped at q(0.20).
 */
export function deriveRiderStabilityBonus(profile: MountProfile): Q {
  return clampQ(
    Math.round(profile.stability_Q * RIDER_STABILITY_INHERIT / SCALE.Q) as Q,
    q(0) as Q,
    q(0.20) as Q,
  );
}

/**
 * Compute the fall injury energy when a rider is dismounted from height.
 *
 * Models a free-fall from the rider's seat height:
 *   fallEnergy_J = riderMass × g × height
 *
 * @param riderMass_Skg  Rider's mass [SCALE.kg].
 */
export function computeFallEnergy_J(profile: MountProfile, riderMass_Skg: number): number {
  if (profile.riderHeightBonus_m <= 0) return 0;
  // E = m × g × h  (SI: kg × m/s² × m = J)
  // m = riderMass_Skg / SCALE.kg
  // g = 9.807 m/s²
  // h = riderHeightBonus_m / SCALE.m
  return Math.round(
    riderMass_Skg / SCALE.kg * 9.807 * profile.riderHeightBonus_m / SCALE.m,
  );
}

/**
 * Derive the fear pressure transmitted from a panicking mount to its rider.
 *
 * Returns q(0) when the mount's shockQ is at or below its fearThreshold.
 * Above the threshold, 40% of the excess is propagated to the rider.
 *
 * @param mountShockQ       Current shock level of the mount [Q].
 * @param fearThreshold_Q   Mount's panic threshold [Q].
 */
export function deriveMountFearPressure(mountShockQ: Q, fearThreshold_Q: Q): Q {
  if (mountShockQ <= fearThreshold_Q) return q(0) as Q;
  const excess_Q = mountShockQ - fearThreshold_Q;
  return clampQ(
    Math.round(excess_Q * MOUNT_FEAR_CONTAGION / SCALE.Q) as Q,
    q(0) as Q,
    SCALE.Q as Q,
  );
}

/**
 * Evaluate a single mounted-combat tick, returning dismount and fear outcomes.
 *
 * Does NOT mutate any entity — pure computation for the host to apply.
 *
 * Dismount priority: rider_shock > mount_dead > mount_bolt.
 *
 * @param riderShockQ   Rider's current shockQ [Q].
 * @param mountShockQ   Mount's current shockQ [Q].
 * @param mountDead     True if the mount has died this tick.
 * @param profile       Mount species profile.
 * @param riderMass_Skg Rider's mass [SCALE.kg] — used for fall energy.
 */
export function checkMountStep(
  riderShockQ:    Q,
  mountShockQ:    Q,
  mountDead:      boolean,
  profile:        MountProfile,
  riderMass_Skg:  number = to.kg(80),
): MountStepResult {
  const fearPressure_Q = deriveMountFearPressure(mountShockQ, profile.fearThreshold_Q);

  // Evaluate dismount causes in priority order
  let cause: DismountCause = "none";
  if (riderShockQ > DISMOUNT_SHOCK_Q)                 cause = "rider_shock";
  else if (mountDead)                                  cause = "mount_dead";
  else if (mountShockQ > profile.fearThreshold_Q)     cause = "mount_bolt";

  const shouldDismount = cause !== "none";
  const fallEnergy_J   = shouldDismount
    ? computeFallEnergy_J(profile, riderMass_Skg)
    : 0;

  return { shouldDismount, dismountCause: cause, fallEnergy_J, fearPressure_Q };
}

// ── Entity convenience ────────────────────────────────────────────────────────

/** True if this entity is currently riding a mount. */
export function entityIsMounted(entity: Entity): boolean {
  return (entity.mount?.mountId ?? 0) > 0;
}

/** True if this entity is currently carrying a rider. */
export function entityIsMount(entity: Entity): boolean {
  return (entity.mount?.riderId ?? 0) > 0;
}
