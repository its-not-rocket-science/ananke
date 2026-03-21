import type { Entity } from "../entity.js";
import type { WorldState } from "../world.js";
import { eventSeed } from "../seeds.js";
import { DT_S } from "../tick.js";
import { SCALE, clampQ, q, qMul, mulDiv, type Q, I32 } from "../../units.js";
import type { KernelContext } from "../context.js";
import { clampSpeed, scaleDirToSpeed, clampI32 } from "../kernel.js";
import { v3, normaliseDirCheapQ, integratePos, type Vec3 } from "../vec3.js";
import {
  coverFractionAtPosition, slopeAtPosition, tractionAtPosition, speedMulAtPosition,
} from "../terrain.js";
import { deriveMovementCaps } from "../../derive.js";
import { deriveFunctionalState } from "../impairment.js";
import { findExoskeleton } from "../../equipment.js";
import type { SimulationTuning } from "../tuning.js";


export function stepMovement(e: Entity, world: WorldState, ctx: KernelContext, tuning: SimulationTuning): void {
  const cellSize = ctx.cellSize_m ?? Math.trunc(4 * SCALE.m);
  const traction = tractionAtPosition(ctx.terrainGrid, cellSize, e.position_m.x, e.position_m.y, ctx.tractionCoeff);
  const caps = deriveMovementCaps(e.attributes, e.loadout, {
    tractionCoeff: traction,
    ...(ctx.biome?.gravity_mps2 !== undefined ? { gravity_mps2: ctx.biome.gravity_mps2 } : {}),
  });
  const func = deriveFunctionalState(e, tuning);

  // Capability gating
  if (!func.canAct) {
    // unconscious/otherwise incapable: no voluntary movement
    e.intent.move = { dir: { x: 0, y: 0, z: 0 }, intensity: q(0), mode: "walk" };
  }
  if (!func.canStand) {
    // force prone if unable to stand (tactical/sim)
    if (tuning.realism !== "arcade") e.condition.prone = true;
  }


  if (e.condition.unconsciousTicks > 0) {
    e.velocity_mps = v3(0, 0, 0);
    return;
  }

  const vmax_mps = caps.maxSprintSpeed_mps;
  const amax_mps2 = caps.maxAcceleration_mps2;

  const controlMulBase = clampQ(q(1.0) - qMul(q(0.7), e.condition.stunned), q(0.1), q(1.0));
  let mobilityMulBase = e.condition.prone ? q(0.25) : q(1.0);

  // crawl tuning
  if (e.condition.prone && e.condition.unconsciousTicks === 0 && tuning.realism !== "arcade") {
    mobilityMulBase = qMul(mobilityMulBase, q(0.20)); // crawling is slow
  }

  // impairment affects control and mobility
  const controlMul = qMul(controlMulBase, func.coordinationMul);
  const mobilityMul = qMul(mobilityMulBase, func.mobilityMul);
  const crowd = ctx.density?.crowdingQ.get(e.id) ?? 0;
  const crowdMul = clampQ(q(1.0) - qMul(q(0.65), crowd), q(0.25), q(1.0));

  const terrainSpeedMul = speedMulAtPosition(ctx.terrainGrid, cellSize, e.position_m.x, e.position_m.y);

  // Phase 6: slope direction adjusts effective speed.
  // uphill: −25% per grade unit, clamped [50%,95%]; downhill: +10% per grade unit, clamped [100%,120%].
  const slope = slopeAtPosition(ctx.slopeGrid, cellSize, e.position_m.x, e.position_m.y);
  const slopeMul: Q = slope
    ? slope.type === "uphill"
      ? clampQ((SCALE.Q - qMul(slope.grade, q(0.25))) as Q, q(0.50), q(0.95))
      : clampQ((SCALE.Q + qMul(slope.grade, q(0.10))) as Q, q(1.0), q(1.20)) as Q
    : SCALE.Q as Q;

  // Phase 11: powered exoskeleton speed boost
  const exo = findExoskeleton(e.loadout);
  const exoSpeedMul: Q = exo ? exo.speedMultiplier : SCALE.Q as Q;

  // Phase 8B: flight locomotion — boost sprint speed when entity can achieve flight
  let flightSpeedMul: Q = SCALE.Q as Q;
  const flightSpec = e.bodyPlan?.locomotion.flight;
  if (flightSpec) {
    const mass = e.attributes.morphology.mass_kg;
    if (mass <= flightSpec.liftCapacity_kg) {
      // Compute average wing damage
      let wingDmgSum = 0;
      let wingCount = 0;
      for (const wid of flightSpec.wingSegments) {
        const ws = e.injury.byRegion[wid];
        if (ws) { wingDmgSum += ws.structuralDamage; wingCount++; }
      }
      const avgWingDmg: Q = wingCount > 0 ? Math.trunc(wingDmgSum / wingCount) as Q : q(0);
      const flightMul: Q = clampQ((SCALE.Q - qMul(avgWingDmg, flightSpec.wingDamagePenalty)) as Q, q(0), q(1.0));
      // 1.5× flight speed boost, scaled by wing condition
      flightSpeedMul = qMul(q(1.50) as Q, flightMul) as Q;
    }
  }

  // Phase 32A: locomotion mode modifiers
  // Validate requested mode against entity's declared locomotion capacities.
  const requestedMode = e.intent.locomotionMode;
  const locomotionModes = e.attributes.locomotionModes;
  const activeCapacity = requestedMode && locomotionModes
    ? locomotionModes.find(c => c.mode === requestedMode)
    : undefined;

  // aquatic depth check: entity without swim capacity and below ground (z < 0) cannot act
  const isSubmerged = e.position_m.z < 0;
  const canSwim = locomotionModes?.some(c => c.mode === "swim") ?? false;
  if (isSubmerged && !canSwim) {
    e.velocity_mps = v3(0, 0, 0);
    return;
  }

  // Locomotion mode speed multipliers
  let locomotionSpeedMul: Q = SCALE.Q as Q;
  let skipTraction = false;

  if (activeCapacity) {
    switch (activeCapacity.mode) {
      case "flight":
        // Flight: bypass ground traction; apply cruiseAlt proportional controller
        skipTraction = true;
        if (activeCapacity.cruiseAlt_m !== undefined) {
          const targetZ = activeCapacity.cruiseAlt_m;
          const dz = targetZ - e.position_m.z;
          const dzStep = clampI32(Math.trunc(dz), -Math.trunc(2 * SCALE.m), Math.trunc(2 * SCALE.m));
          e.position_m = { ...e.position_m, z: e.position_m.z + dzStep };
        }
        // Cap at declared maxSpeed
        if (activeCapacity.maxSpeed_mps < vmax_mps) {
          locomotionSpeedMul = mulDiv(activeCapacity.maxSpeed_mps, SCALE.Q, vmax_mps) as Q;
        }
        break;
      case "swim":
        // Hydrodynamic drag: ~40% of surface sprint speed
        locomotionSpeedMul = q(0.40) as Q;
        skipTraction = true;
        break;
      case "climb":
        locomotionSpeedMul = q(0.30) as Q;
        break;
      default:
        break;
    }
  }

  // If skipping traction, override the traction-derived speed caps
  const effTrackMul: Q = skipTraction ? SCALE.Q as Q : SCALE.Q as Q; // traction already applied above via caps

  const baseMul = qMul(qMul(qMul(qMul(qMul(qMul(qMul(controlMul, mobilityMul), crowdMul),
    skipTraction ? (SCALE.Q as Q) : terrainSpeedMul), slopeMul), exoSpeedMul), flightSpeedMul), locomotionSpeedMul);
  void effTrackMul;

  const effVmax = mulDiv(vmax_mps, baseMul, SCALE.Q);
  const effAmax = mulDiv(amax_mps2, baseMul, SCALE.Q);

  let modeMul =
    e.intent.move.mode === "walk" ? q(0.40) :
      e.intent.move.mode === "run" ? q(0.70) : q(1.0);

  if (e.condition.prone && tuning.realism !== "arcade") {
    // cannot sprint while prone
    if (e.intent.move.mode === "sprint") modeMul = q(0.40);
  }

  const dir = normaliseDirCheapQ(e.intent.move.dir);
  const intensity = clampQ(e.intent.move.intensity, 0, SCALE.Q);

  // Sim-only: stumble/fall risk when sprinting with impaired mobility/coordination
  if (tuning.realism === "sim" && intensity > 0 && e.intent.move.mode === "sprint" && !e.condition.prone) {
    const instability = (SCALE.Q - qMul(func.mobilityMul, func.coordinationMul));
    const chance = clampQ(tuning.stumbleBaseChance + qMul(instability, q(0.05)), q(0), q(0.25));
    if (chance > 0) {
      const seed = eventSeed(world.seed, world.tick, e.id, 0, 0xF411);
      const roll = (seed % SCALE.Q);
      if (roll < chance) {
        e.condition.prone = true;
        // a small deterministic shock spike
        e.injury.shock = clampQ(e.injury.shock + q(0.02), 0, SCALE.Q);
      }
    }
  }


  const vTargetMag = mulDiv(mulDiv(effVmax, intensity, SCALE.Q), modeMul, SCALE.Q);
  const targetVel = scaleDirToSpeed(dir, vTargetMag);

  e.velocity_mps = accelToward(e.velocity_mps, targetVel, effAmax);
  e.velocity_mps = clampSpeed(e.velocity_mps, effVmax);

  // Phase 68: biome drag — attenuate velocity when dragMul < SCALE.Q (e.g. underwater).
  const dragMul = ctx.biome?.dragMul;
  if (dragMul !== undefined && dragMul < SCALE.Q) {
    e.velocity_mps = {
      x: mulDiv(e.velocity_mps.x, dragMul, SCALE.Q),
      y: mulDiv(e.velocity_mps.y, dragMul, SCALE.Q),
      z: mulDiv(e.velocity_mps.z, dragMul, SCALE.Q),
    };
  }

  // Phase 6: obstacle blocking — impassable cells (coverFraction = q(1.0)) prevent entry.
  const nextPos = integratePos(e.position_m, e.velocity_mps, DT_S);
  if (ctx.obstacleGrid) {
    const cov = coverFractionAtPosition(ctx.obstacleGrid, cellSize, nextPos.x, nextPos.y);
    if (cov >= SCALE.Q) {
      e.velocity_mps = v3(0, 0, 0);
      return;
    }
  }
  e.position_m = nextPos;
}


function accelToward(v: Vec3, target: Vec3, amax_mps2: I32): Vec3 {
  const maxDv = Math.trunc((amax_mps2 * DT_S) / SCALE.s);
  return {
    x: v.x + clampI32(target.x - v.x, -maxDv, maxDv),
    y: v.y + clampI32(target.y - v.y, -maxDv, maxDv),
    z: v.z + clampI32(target.z - v.z, -maxDv, maxDv),
  };
}