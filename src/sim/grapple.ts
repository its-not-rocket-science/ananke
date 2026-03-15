/**
 * Phase 2A: Grapple resolution — deterministic close-combat control.
 *
 * Design rules:
 *  - All randomness via eventSeed() + salt, never Math.random()
 *  - Pair-based ordering: idLo = Math.min(a, b), idHi = Math.max(a, b)
 *  - No mutation of entities mid-resolution across independent pairs
 *  - All physical quantities in SI fixed-point (SCALE.*)
 */

import { SCALE, q, qMul, clampQ, mulDiv, to, type Q, type I32 } from "../units.js";
import { getSkill } from "./skills.js";
import { eventSeed } from "./seeds.js";
import type { Entity } from "./entity.js";
import type { WorldState } from "./world.js";
import type { WorldIndex } from "./indexing.js";
import type { FunctionalState } from "./impairment.js";
import { deriveFunctionalState } from "./impairment.js";
import type { TraceSink } from "./trace.js";
import { TraceKinds } from "./kinds.js";
import { effectiveLimbForceMul } from "./limb.js";
import type { SimulationTuning } from "./tuning.js";
import type { ImpactEvent } from "./events.js";
import type { Weapon } from "../equipment.js";
import type { BodyRegion } from "./body.js";
import { TICK_HZ } from "./tick.js";

// ---------- Deterministic salts ----------
const SALT_ATTEMPT   = 0x4A41B1;
const SALT_BREAK     = 0xB4EA44;
const SALT_THROW     = 0xF177C0;
const SALT_JOINTLOCK = 0x6B1D44;

// ---------- Reference values (human baseline for normalisation) ----------
const REF_FORCE: I32 = to.N(1840);   // 184_000 fixed-point units
const REF_MASS:  I32 = to.kg(75);    //  75_000 fixed-point units
const REF_H:     I32 = to.m(1.75);   //  17_500 fixed-point units

// ---------- Grip decay per tick ----------
// 0.5% per tick → released after ~200 ticks (10 s) without maintenance
export const GRIP_DECAY_PER_TICK: Q = 50;  // = q(0.005)

// ============================================================
//  Physics-derived cost helpers
// ============================================================

/**
 * Effective grapple reach for an entity (m, fixed-point).
 * Derived from stature × reachScale — arm-span is approximately equal
 * to body height, scaled by individual proportions.
 * Clamped to [1.0 m, 3.0 m].
 */
function grappleReach_m(e: Entity): I32 {
  const reach = mulDiv(e.attributes.morphology.stature_m, e.attributes.morphology.reachScale, SCALE.Q);
  return Math.max(to.m(1.0), Math.min(to.m(3.0), reach));
}

/**
 * Energy cost (J) of a single grapple/break attempt.
 * Modelled as ~70 ms burst at peak power:
 *   cost ≈ peakPower_W × 0.07 s
 * Calibration: 1200 W peak → 84 J ≈ 80 J reference.
 * Minimum 20 J to avoid zero cost on very weak entities.
 */
function attemptCost_J(e: Entity): I32 {
  return Math.max(20, mulDiv(e.attributes.performance.peakPower_W, 7, 100));
}

/**
 * Energy cost (J) of a throw attempt.
 * ~100 ms burst at peak power: cost ≈ peakPower_W × 0.10 s
 * Calibration: 1200 W → 120 J reference. Minimum 40 J.
 */
function throwCost_J(e: Entity): I32 {
  return Math.max(40, mulDiv(e.attributes.performance.peakPower_W, 10, 100));
}

/**
 * Energy cost (J) of a joint-lock application.
 * ~50 ms burst at peak power: cost ≈ peakPower_W × 0.05 s
 * Calibration: 1200 W → 60 J reference. Minimum 20 J.
 */
function lockCost_J(e: Entity): I32 {
  return Math.max(20, mulDiv(e.attributes.performance.peakPower_W, 5, 100));
}

/**
 * Energy cost (J) per tick of maintaining a grapple hold.
 * Modelled as isometric hold work at continuous aerobic power:
 *   cost = continuousPower_W / TICK_HZ
 * Calibration: 200 W / 20 Hz = 10 J/tick reference. Minimum 5 J.
 */
function tickCost_J(e: Entity): I32 {
  return Math.max(5, Math.trunc(e.attributes.performance.continuousPower_W / TICK_HZ));
}

/**
 * Leverage differential threshold above which an immediate trip occurs on a
 * successful grapple attempt.
 *
 * Higher (harder to trip) when the target is:
 *   - heavier relative to the attacker
 *   - more stable (higher stability coefficient)
 *
 * Formula: base 0.20 + 0.30 × (massRatio × targetStability)
 * Clamped to [0.10, 0.70].
 *
 * Average vs average: ≈ 0.20 + 0.30 × (1.0 × 0.70) = 0.41
 * Light/unstable target: ≈ 0.10 (easier to trip)
 * Heavy/stable target: ≈ 0.60–0.70 (hard to trip immediately)
 */
function tripThreshold(attacker: Entity, target: Entity): Q {
  const massRatioQ: Q = clampQ(
    mulDiv(target.attributes.morphology.mass_kg, SCALE.Q, Math.max(1, attacker.attributes.morphology.mass_kg)) as Q,
    q(0.20), q(2.0)
  );
  const stability = target.attributes.control.stability;
  return clampQ(
    q(0.20) + qMul(q(0.30), qMul(massRatioQ, stability)) as Q,
    q(0.10), q(0.70)
  );
}

// ---------- Synthetic Weapon objects for grapple impacts ----------
// These are used only as damage-profile carriers; they never appear in a Loadout.

export const GRAPPLE_THROW_WPN: Weapon = {
  id: "__grapple_throw__",
  name: "Grapple Throw",
  mass_kg: 0,
  bulk: q(0),
  kind: "weapon",
  damage: {
    surfaceFrac:    q(0.05),
    internalFrac:   q(0.35),
    structuralFrac: q(0.60),
    bleedFactor:    q(0.10),
    penetrationBias: q(0.0),
  },
};

export const GRAPPLE_JOINTLOCK_WPN: Weapon = {
  id: "__grapple_jointlock__",
  name: "Joint Lock",
  mass_kg: 0,
  bulk: q(0),
  kind: "weapon",
  damage: {
    surfaceFrac:    q(0.02),
    internalFrac:   q(0.20),
    structuralFrac: q(0.78),
    bleedFactor:    q(0.05),
    penetrationBias: q(0.0),
  },
};

// ============================================================
//  Score computation
// ============================================================

/**
 * Compute an entity's grapple contest score in Q [0.05, 0.95].
 *
 * Combines:
 *   50% peak force (normalised to human baseline)
 *   30% technique  (controlQuality × stability)
 *   20% body mass  (normalised to human baseline)
 *
 * The result is modulated by the entity's current functional state
 * (injury, fatigue) via manipulationMul.
 *
 * A healthy average human scores ≈ q(0.47).
 */
export function grappleContestScore(e: Entity, func: FunctionalState): Q {
  const f    = e.attributes.performance.peakForce_N;
  const m    = e.attributes.morphology.mass_kg;
  const ctrl = e.attributes.control.controlQuality;
  const stab = e.attributes.control.stability;

  // Normalise to Q (q(1.0) = human baseline)
  const forceQ: Q = clampQ(mulDiv(f, SCALE.Q, REF_FORCE) as Q, q(0.10), q(2.50));
  const massQ:  Q = clampQ(mulDiv(m, SCALE.Q, REF_MASS)  as Q, q(0.20), q(2.50));
  const tech:   Q = qMul(ctrl, stab);

  // Weighted sum — result is Q-scaled
  const raw: I32 =
    mulDiv(forceQ, 5, 10) +
    mulDiv(tech,   3, 10) +
    mulDiv(massQ,  2, 10);

  // Apply functional impairment; clamp to [q(0.02), q(1.80)]
  const impaired: Q = clampQ(qMul(raw as Q, func.manipulationMul), q(0.02), q(1.80));

  // Phase 7: grappling.energyTransferMul applies a leverage bonus to the contest score
  const grapSkill = getSkill(e.skills, "grappling");
  const adjusted: Q = clampQ(qMul(impaired, grapSkill.energyTransferMul), q(0.02), q(1.80));

  // Linear map [q(0.02), q(1.80)] → [q(0.05), q(0.95)]
  const range: I32 = q(1.80) - q(0.02); // 17 800
  return clampQ(
    q(0.05) + mulDiv(Math.max(0, adjusted - q(0.02)) as I32, q(0.90), range) as Q,
    q(0.05), q(0.95)
  );
}

// ============================================================
//  Internal helpers
// ============================================================

/**
 * Signed leverage differential (Q) for throw/trip outcome.
 * Positive = attacker has the advantage.
 * Based on F × stature × 0.35 (approximate effective arm in standing grapple).
 */
function leverageDiff(
  attacker: Entity, target: Entity,
  funcA: FunctionalState, funcB: FunctionalState,
): Q {
  const fA = attacker.attributes.performance.peakForce_N;
  const fB = target.attributes.performance.peakForce_N;
  const hA = attacker.attributes.morphology.stature_m;
  const hB = target.attributes.morphology.stature_m;

  // Raw leverage ∝ F × h × 0.35 (keep BigInt-safe via mulDiv)
  const levA: I32 = mulDiv(mulDiv(fA, hA, SCALE.m), 35, 100);
  const levB: I32 = mulDiv(mulDiv(fB, hB, SCALE.m), 35, 100);
  const refLev: I32 = mulDiv(mulDiv(REF_FORCE, REF_H, SCALE.m), 35, 100);

  // Normalise and apply functional multipliers
  const sA: Q = clampQ(
    qMul(clampQ(mulDiv(levA, SCALE.Q, refLev) as Q, q(0.10), q(2.0)), funcA.manipulationMul),
    q(0.05), q(2.0)
  );
  const sB: Q = clampQ(
    qMul(clampQ(mulDiv(levB, SCALE.Q, refLev) as Q, q(0.10), q(2.0)), funcB.manipulationMul),
    q(0.05), q(2.0)
  );

  return clampQ((sA - sB) as Q, q(-0.90), q(0.90));
}

function pushImpact(
  impacts: ImpactEvent[],
  attackerId: number,
  targetId: number,
  region: BodyRegion,
  energy_J: number,
  wpn: Weapon,
  hitQuality: Q,
): void {
  if (energy_J <= 0) return;
  impacts.push({
    kind: "impact",
    attackerId,
    targetId,
    region,
    energy_J,
    protectedByArmour: false,
    blocked: false,
    parried: false,
    shieldBlocked: false,
    hitQuality,
    weaponId: wpn.id,
    wpn,
  });
}

// ============================================================
//  Public API
// ============================================================

/**
 * Attempt to initiate a grapple on the target.
 *
 * Contest: scoreA × intensity vs scoreB. Success probability centred at 0.50
 * with ±40% swing per unit score difference (mirrors melee hit formula).
 *
 * On success:
 *   - Attacker's grapple.holdingTargetId and gripQ are set
 *   - Target's grapple.heldByIds is updated (sorted, deduplicated)
 *   - Overwhelming leverage differential causes immediate trip (prone + small impact)
 *
 * On failure: grappleCooldownTicks set, energy still drained.
 */
export function resolveGrappleAttempt(
  world: WorldState,
  attacker: Entity,
  target: Entity,
  intensity: Q,
  tuning: SimulationTuning,
  impacts: ImpactEvent[],
  trace: TraceSink,
): void {
  if (attacker.action.grappleCooldownTicks > 0) return;

  // Reach check
  const dx = target.position_m.x - attacker.position_m.x;
  const dy = target.position_m.y - attacker.position_m.y;
  const dz = target.position_m.z - attacker.position_m.z;
  const dist2 = BigInt(dx) * BigInt(dx) + BigInt(dy) * BigInt(dy) + BigInt(dz) * BigInt(dz);
  const reach = grappleReach_m(attacker);
  if (dist2 > BigInt(reach) * BigInt(reach)) return;

  const funcA = deriveFunctionalState(attacker, tuning);
  const funcB = deriveFunctionalState(target, tuning);
  if (!funcA.canAct) return;

  const clampedIntensity: Q = clampQ(intensity, q(0.1), q(1.0));
  // Phase 32B: reduce contest score by active limb fraction (severed limbs excluded)
  const limbMul: Q = attacker.limbStates
    ? effectiveLimbForceMul(attacker.limbStates, attacker.injury)
    : q(1.0) as Q;
  const scoreA: Q = clampQ(
    qMul(qMul(grappleContestScore(attacker, funcA), clampedIntensity), limbMul),
    q(0.05), q(0.95)
  );
  const scoreB: Q = grappleContestScore(target, funcB);

  const diff = (scoreA - scoreB) as I32;
  const p: Q = clampQ(q(0.50) + mulDiv(diff, q(0.40), SCALE.Q) as Q, q(0.05), q(0.95));

  const seed = eventSeed(world.seed, world.tick, attacker.id, target.id, SALT_ATTEMPT);
  const success = (seed % SCALE.Q) < p;

  // Energy drain regardless of outcome
  attacker.energy.reserveEnergy_J = Math.max(0, attacker.energy.reserveEnergy_J - attemptCost_J(attacker));

  if (!success) {
    attacker.action.grappleCooldownTicks = tuning.realism === "arcade" ? 2 : 4;
    trace.onEvent({
      kind: TraceKinds.Grapple,
      tick: world.tick, attackerId: attacker.id, targetId: target.id,
      phase: "break", strengthQ: 0,
    });
    return;
  }

  // Grip quality: higher when score differential is larger
  const gripQ: Q = clampQ(
    q(0.20) + mulDiv(Math.max(0, diff) as I32, q(0.60), SCALE.Q) as Q,
    q(0.10), q(0.90)
  );

  attacker.grapple.holdingTargetId = target.id;
  attacker.grapple.gripQ = gripQ;
  attacker.grapple.position = "standing";

  // Add to target's heldByIds (sorted, no duplicates)
  if (!target.grapple.heldByIds.includes(attacker.id)) {
    target.grapple.heldByIds.push(attacker.id);
    target.grapple.heldByIds.sort((a, b) => a - b);
  }

  // Overwhelming leverage → immediate trip in tactical/sim
  if (tuning.realism !== "arcade") {
    const levDiff = leverageDiff(attacker, target, funcA, funcB);
    if (levDiff > tripThreshold(attacker, target)) {
      target.condition.prone = true;
      attacker.grapple.position = "prone";

      // Small kinetic impact from the trip (~1 J/kg of target)
      const tripEnergy_J = mulDiv(target.attributes.morphology.mass_kg, 1, SCALE.kg);
      pushImpact(impacts, attacker.id, target.id, "torso", tripEnergy_J, GRAPPLE_THROW_WPN, q(0.50));
    }
  }

  trace.onEvent({
    kind: TraceKinds.Grapple,
    tick: world.tick, attackerId: attacker.id, targetId: target.id,
    phase: "start", strengthQ: gripQ,
  });
}

/**
 * Attempt to throw or trip the grappled target.
 *
 * Requires: attacker already holds the target (holdingTargetId === target.id).
 * Success probability based on signed leverage differential.
 *
 * On success: target goes prone, kinetic impact queued, grapple released.
 * On failure: cooldown set, energy still drained.
 *
 * Impact energy ∝ target mass × leverage advantage × intensity (see formula in code).
 */
export function resolveGrappleThrow(
  world: WorldState,
  attacker: Entity,
  target: Entity,
  intensity: Q,
  tuning: SimulationTuning,
  impacts: ImpactEvent[],
  trace: TraceSink,
): void {
  if (attacker.grapple.holdingTargetId !== target.id) return;
  if (attacker.action.grappleCooldownTicks > 0) return;

  const funcA = deriveFunctionalState(attacker, tuning);
  const funcB = deriveFunctionalState(target, tuning);
  if (!funcA.canAct) return;

  // Probability centred at 30% base; leverage advantage pushes toward 90%
  const levDiff = leverageDiff(attacker, target, funcA, funcB);
  const levAdv: Q = clampQ((levDiff + q(0.90)) as Q, q(0.20), q(1.80));
  const p: Q = clampQ(
    q(0.30) + mulDiv(levAdv as I32, q(0.35), q(1.80)) as Q,
    q(0.05), q(0.90)
  );

  const seed = eventSeed(world.seed, world.tick, attacker.id, target.id, SALT_THROW);
  const success = (seed % SCALE.Q) < p;

  attacker.energy.reserveEnergy_J = Math.max(0, attacker.energy.reserveEnergy_J - throwCost_J(attacker));
  attacker.action.grappleCooldownTicks = tuning.realism === "arcade" ? 4 : 6;

  if (!success) {
    trace.onEvent({
      kind: TraceKinds.Grapple,
      tick: world.tick, attackerId: attacker.id, targetId: target.id,
      phase: "tick", strengthQ: attacker.grapple.gripQ,
    });
    return;
  }

  target.condition.prone = true;
  attacker.grapple.position = "prone";

  // throwEnergy = targetMass_kg × 2 × levAdv × intensity
  // mulDiv(mB, 2, SCALE.kg) converts fixed-point kg → 2×kg (Joules at ~1 m/s effective)
  const mB = target.attributes.morphology.mass_kg;
  const throwEnergy_J = mulDiv(
    mulDiv(mB, 2, SCALE.kg),
    qMul(levAdv, clampQ(intensity, q(0.1), q(1.0))),
    SCALE.Q
  );
  pushImpact(impacts, attacker.id, target.id, "torso", throwEnergy_J, GRAPPLE_THROW_WPN, q(0.70));

  releaseGrapple(attacker, target);

  trace.onEvent({
    kind: TraceKinds.Grapple,
    tick: world.tick, attackerId: attacker.id, targetId: target.id,
    phase: "break", strengthQ: 0,
  });
}

/**
 * Apply a choke hold: accumulates suffocation on the target.
 *
 * Requires position !== "standing" in tactical/sim (must be on the ground).
 * Sufficient grip quality (> 0.60) transitions the position to "pinned" and
 * sets target.condition.pinned.
 */
export function resolveGrappleChoke(
  attacker: Entity,
  target: Entity,
  intensity: Q,
  tuning: SimulationTuning,
): void {
  if (attacker.grapple.holdingTargetId !== target.id) return;
  if (attacker.grapple.position === "standing" && tuning.realism !== "arcade") return;

  const funcA = deriveFunctionalState(attacker, tuning);
  if (!funcA.canAct) return;

  // Choke dose = grip × intensity × technique; builds suffocation at fixed rate
  const CHOKE_RATE: Q = q(0.008);
  const dose: Q = qMul(qMul(attacker.grapple.gripQ, clampQ(intensity, q(0.1), q(1.0))), funcA.manipulationMul);
  target.condition.suffocation = clampQ(
    target.condition.suffocation + qMul(dose, CHOKE_RATE),
    0, SCALE.Q
  );

  // Strong grip → advance to pinned
  if (attacker.grapple.gripQ > q(0.60)) {
    attacker.grapple.position = "pinned";
    target.condition.pinned = true;
  }
}

/**
 * Apply a joint-lock: structural damage to a target limb.
 *
 * Requires position !== "standing" in tactical/sim.
 * Target limb selected deterministically (stable across seeds).
 *
 * Impact energy = peakForce × 0.05 m effective displacement × grip × intensity.
 */
export function resolveGrappleJointLock(
  world: WorldState,
  attacker: Entity,
  target: Entity,
  intensity: Q,
  tuning: SimulationTuning,
  impacts: ImpactEvent[],
): void {
  if (attacker.grapple.holdingTargetId !== target.id) return;
  if (attacker.grapple.position === "standing" && tuning.realism !== "arcade") return;

  const funcA = deriveFunctionalState(attacker, tuning);
  if (!funcA.canAct) return;

  attacker.energy.reserveEnergy_J = Math.max(0, attacker.energy.reserveEnergy_J - lockCost_J(attacker));

  // Energy: (F / SCALE.N) × 0.05 m × grip × intensity
  // mulDiv(f, 5, SCALE.N * 100) = f_N × 0.05 in J (SCALE.N=100; 5/100 = 0.05/SCALE.N→J)
  const f = attacker.attributes.performance.peakForce_N;
  const gripEffect: Q = qMul(
    qMul(attacker.grapple.gripQ, clampQ(intensity, q(0.1), q(1.0))),
    funcA.manipulationMul
  );
  const lockEnergy_J = mulDiv(mulDiv(f, 5, SCALE.N * 100), gripEffect, SCALE.Q);
  if (lockEnergy_J <= 0) return;

  // Deterministic region: 0=leftArm, 1=rightArm, 2=leftLeg, 3=rightLeg
  const seed = eventSeed(world.seed, world.tick, attacker.id, target.id, SALT_JOINTLOCK);
  const regionBit = seed & 3;
  const region: BodyRegion =
    regionBit === 0 ? "leftArm"  :
    regionBit === 1 ? "rightArm" :
    regionBit === 2 ? "leftLeg"  : "rightLeg";

  pushImpact(impacts, attacker.id, target.id, region, lockEnergy_J, GRAPPLE_JOINTLOCK_WPN, q(0.80));
}

/**
 * Attempt to break free from all current holders.
 *
 * Pair-based: each holder gets an independent contest (lower id owns the seed).
 * On success: releaseGrapple() called for that holder.
 * Energy drained per holder attempt regardless of outcome.
 */
export function resolveBreakGrapple(
  world: WorldState,
  breaker: Entity,
  intensity: Q,
  tuning: SimulationTuning,
  index: WorldIndex,
  trace: TraceSink,
): void {
  if (breaker.grapple.heldByIds.length === 0) return;

  const funcB = deriveFunctionalState(breaker, tuning);
  const toRelease: number[] = [];

  for (const holderId of breaker.grapple.heldByIds) {
    const holder = index.byId.get(holderId);

    // Auto-release stale links
    if (!holder || holder.injury.dead || holder.grapple.holdingTargetId !== breaker.id) {
      toRelease.push(holderId);
      continue;
    }

    const funcA = deriveFunctionalState(holder, tuning);
    const scoreBreaker: Q = clampQ(
      qMul(grappleContestScore(breaker, funcB), clampQ(intensity, q(0.1), q(1.0))),
      q(0.05), q(0.95)
    );
    const scoreHolder: Q = clampQ(
      qMul(grappleContestScore(holder, funcA), holder.grapple.gripQ),
      q(0.05), q(0.95)
    );

    const diff = (scoreBreaker - scoreHolder) as I32;
    const p: Q = clampQ(q(0.40) + mulDiv(diff, q(0.40), SCALE.Q) as Q, q(0.05), q(0.90));

    // Stable pair seed: lower id first
    const idLo = Math.min(breaker.id, holderId);
    const idHi = Math.max(breaker.id, holderId);
    const seed = eventSeed(world.seed, world.tick, idLo, idHi, SALT_BREAK);
    const success = (seed % SCALE.Q) < p;

    breaker.energy.reserveEnergy_J = Math.max(0, breaker.energy.reserveEnergy_J - attemptCost_J(breaker));

    if (success) {
      toRelease.push(holderId);
      trace.onEvent({
        kind: TraceKinds.Grapple,
        tick: world.tick, attackerId: holderId, targetId: breaker.id,
        phase: "break", strengthQ: 0,
      });
    }
  }

  for (const holderId of toRelease) {
    const holder = index.byId.get(holderId);
    if (holder) {
      releaseGrapple(holder, breaker);
    } else {
      breaker.grapple.heldByIds = breaker.grapple.heldByIds.filter(id => id !== holderId);
    }
  }

  if (breaker.grapple.heldByIds.length === 0) {
    breaker.condition.pinned = false;
  }
}

/**
 * Per-tick maintenance for active grapples.
 * Call once per entity per tick (regardless of whether a grapple command was issued).
 *
 *  - Drains stamina from the holder
 *  - Decays gripQ by GRIP_DECAY_PER_TICK
 *  - Releases grapple when grip reaches 0 or target is dead/missing
 */
export function stepGrappleTick(world: WorldState, entity: Entity, index: WorldIndex): void {
  if (!entity.grapple || entity.grapple.holdingTargetId === 0) return;

  const target = index.byId.get(entity.grapple.holdingTargetId);

  if (!target || target.injury.dead) {
    releaseGrapple(entity, target ?? null);
    return;
  }

  entity.energy.reserveEnergy_J = Math.max(0, entity.energy.reserveEnergy_J - tickCost_J(entity));

  entity.grapple.gripQ = clampQ(entity.grapple.gripQ - GRIP_DECAY_PER_TICK, 0, SCALE.Q);

  if (entity.grapple.gripQ <= 0) {
    releaseGrapple(entity, target);
  }
}

/**
 * Release a grapple link, updating both the holder and (optionally) the target.
 * Safe to call with a null target (e.g. when target entity was already removed).
 */
export function releaseGrapple(holder: Entity, target: Entity | null): void {
  holder.grapple.holdingTargetId = 0;
  holder.grapple.gripQ = q(0);
  holder.grapple.position = "standing";

  if (target) {
    target.grapple.heldByIds = target.grapple.heldByIds.filter(id => id !== holder.id);
    if (target.grapple.heldByIds.length === 0) {
      target.condition.pinned = false;
    }
  }
}
