import type { WorldState } from "./world.js";
import { ensureAnatomyRuntime, type Entity } from "./entity.js";
import type { CommandMap, AttackCommand, GrappleCommand, BreakGrappleCommand, BreakBindCommand, ShootCommand, TreatCommand, ActivateCommand } from "./commands.js";
import type { CapabilityEffect, EffectPayload, FieldEffect } from "./capability.js";
import type { KernelContext } from "./context.js";

import { SCALE, q, clampQ, qMul, mulDiv, to, type Q, type I32 } from "../units.js";
import { DamageChannel } from "../channels.js";
import { deriveArmourProfile, findWeapon, findShield, findRangedWeapon, findExoskeleton, findSensor, type Weapon, type Shield } from "../equipment.js";

import { isCapabilityAvailable } from "./tech.js";
import { deriveFunctionalState } from "./impairment.js";
import { TUNING, type SimulationTuning } from "./tuning.js";
import { type Vec3, vSub, vAdd } from "./vec3.js";
import { resolveHit, shieldCovers, chooseArea, type HitArea } from "./combat.js";
import { normaliseDirCheapQ, dotDirQ } from "./vec3.js";
import { eventSeed } from "./seeds.js";
import { regionFromHit } from "./body.js";
import { resolveHitSegment } from "./bodyplan.js";
import { FRACTURE_THRESHOLD } from "./injury.js";
import { TIER_RANK, TIER_MUL, ACTION_MIN_TIER, TIER_TECH_REQ } from "./medical.js";
import { type BlastSpec, blastEnergyFracQ, fragmentsExpected, fragmentKineticEnergy } from "./explosion.js";

import { makeRng } from "../rng.js";
import { WorldIndex } from "./indexing.js";
import { buildSpatialIndex, type SpatialIndex } from "./spatial.js";
import { type ImpactEvent, sortEventsDeterministic } from "./events.js";

import { parryLeverageQ } from "./combat.js";

import { pickNearestEnemyInReach } from "./formation.js";
import { isMeleeLaneOccludedByFriendly } from "./occlusion.js";
import { applyFrontageCap } from "./frontage.js";

import { coverFractionAtPosition, elevationAtPosition } from "./terrain.js";

import { type TraceSink, nullTrace } from "./trace.js";
import { TraceKinds } from "./kinds.js";
import { type SensoryEnvironment, DEFAULT_SENSORY_ENV, canDetect } from "./sensory.js";
import { runPreparePhase } from "./step/phases/prepare-phase.js";
import { runCooldownsPhase } from "./step/phases/cooldowns-phase.js";
import { runCapabilityPhase } from "./step/phases/capability-phase.js";
import { FEAR_SURPRISE, isRouting, painBlocksAction } from "./morale.js";
import { applyCommands, applyFunctionalGating, applyStandAndKO } from "./step/apply/intents.js";
import { applyResolvedImpacts } from "./step/resolvers/impact-resolver.js";
import { STEP_PHASE_ORDER } from "./step/pipeline.js";

import { stepPushAndRepulsion } from "./step/push.js";
import { stepMoraleForEntity } from "./step/morale.js";
import { stepSubstances } from "./step/substances.js";
import { stepEnergy } from "./step/energy.js";
import { entityInCone, type ConeSpec } from "./cone.js";
import { stepConditionsToInjury, stepInjuryProgression } from "./step/injury.js";
import { stepCoreTemp, deriveTempModifiers, CORE_TEMP_NORMAL_Q } from "./thermoregulation.js";
import { stepNutrition } from "./nutrition.js";
import { stepToxicology } from "./toxicology.js";
import { stepIngestedToxicology } from "./systemic-toxicology.js";
import { stepLimbFatigue } from "./limb.js";
import { stepCapabilitySources } from "./step/capability.js";
import { stepMovement } from "./step/movement.js";
import { stepChainEffects, stepFieldEffects, stepHazardEffects } from "./step/effects.js";
import { computeWindAimError } from "./weather.js";

import {
  resolveGrappleAttempt,
  resolveGrappleThrow,
  resolveGrappleChoke,
  resolveGrappleJointLock,
  resolveBreakGrapple,
  stepGrappleTick,
} from "./grapple.js";

import {
  reachDomPenaltyQ,
  twoHandedAttackBonusQ,
  missRecoveryTicks,
  bindChanceQ,
  bindDurationTicks,
  breakBindContestQ,
} from "./weapon_dynamics.js";

import {
  energyAtRange_J,
  adjustedDispersionQ,
  groupingRadius_m,
  thrownLaunchEnergy_J,
  recycleTicks,
  shootCost_J,
} from "./ranged.js";

import { getSkill } from "./skills.js";

import { TICK_HZ } from "./tick.js";
import { assertDeterministicWorldLike, assertNoFloatUsageInProduction } from "../determinism.js";
import { resolveAttack as resolveAttackFromResolver } from "./resolvers/attack-resolver.js";
import { resolveShoot as resolveShootFromResolver } from "./resolvers/shoot-resolver.js";
import { resolveGrappleCommand as resolveGrappleCommandFromResolver, resolveBreakBind as resolveBreakBindFromResolver } from "./resolvers/grapple-resolver.js";
import { resolveTreat as resolveTreatFromResolver } from "./resolvers/treat-resolver.js";
import { resolveActivation as resolveActivationFromResolver, applyPayload as applyPayloadFromResolver, applyCapabilityEffect as applyCapabilityEffectFromResolver } from "./resolvers/capability-resolver.js";

// Phase 2 extension: swing momentum carry
const SWING_MOMENTUM_MAX   = q(0.12) as Q;  // max +12% energy bonus at full momentum

// Phase 3 extension: aiming time
const AIM_MAX_TICKS        = 20;            // 1 second at 20 ticks/s
const AIM_MIN_MUL          = q(0.50) as Q;  // half dispersion at full aim
const AIM_STILL_THRESHOLD  = 5_000;         // 0.5 m/s in SCALE.mps units

type HitSegmentId = string;

function resolveTargetHitSegment(
  target: Entity,
  roll01: Q,
  sideBit: 0 | 1,
  fallbackArea?: HitArea,
): HitSegmentId {
  if (target.bodyPlan) {
    return resolveHitSegment(target.bodyPlan, roll01);
  }

  const area = fallbackArea ?? chooseArea(roll01);
  return regionFromHit(area, sideBit);
}

function regionCoverageQ(
  coverageByRegion: Record<string, Q>,
  segmentId: HitSegmentId,
): Q {
  return coverageByRegion[segmentId] ?? q(0);
}

function inferHitAreaForSegment(target: Entity, segmentId: HitSegmentId): HitArea | undefined {
  const seg = target.bodyPlan?.segments.find((s) => s.id === segmentId);
  if (!seg) {
    // Legacy humanoid region ids
    if (segmentId === "head") return "head";
    if (segmentId === "torso") return "torso";
    if (segmentId === "leftArm" || segmentId === "rightArm") return "arm";
    if (segmentId === "leftLeg" || segmentId === "rightLeg") return "leg";
    return undefined;
  }

  if (seg.cnsRole === "central") return "head";

  if (seg.manipulationRole === "primary" || seg.manipulationRole === "secondary") {
    return "arm";
  }

  if (seg.locomotionRole === "primary" || seg.locomotionRole === "secondary") {
    return "leg";
  }

  return "torso";
}

function shieldBlocksSegment(
  shield: Shield | undefined,
  target: Entity,
  segmentId: HitSegmentId,
  area: HitArea | undefined,
): boolean {
  if (!shield) return false;

  const { helpers } = ensureAnatomyRuntime(target);

  if (shield.coverageProfileId && helpers?.coverage) {
    return helpers.coverage.coversSegmentId(shield.coverageProfileId, segmentId);
  }

  const effectiveArea = area ?? inferHitAreaForSegment(target, segmentId);
  if (effectiveArea === undefined) return false;

  return shieldCovers(shield, effectiveArea);
}

export function stepWorld(world: WorldState, cmds: CommandMap, ctx: KernelContext): void {
  assertNoFloatUsageInProduction(world);
  const strictDeterminism =
    ctx.strictDeterminism ??
    (typeof process !== "undefined" && process.env.ANANKE_STRICT_DETERMINISM === "1");
  if (strictDeterminism) assertDeterministicWorldLike(world, "step:start");
  const tuning = ctx.tuning ?? TUNING.tactical;

  const trace = ctx.trace ?? nullTrace;
  void STEP_PHASE_ORDER;

  const { cellSize_m, index, spatial } = runPreparePhase(world, ctx);
  const runtimeState = world.runtimeState!;

  const impacts: ImpactEvent[] = [];

  runCooldownsPhase(world, trace);

  runCapabilityPhase(world, trace, { applyCapabilityEffect });

  for (const e of world.entities) {
    if (e.injury.dead) continue;

    applyCommands(e, cmds.get(e.id) ?? []);
    applyFunctionalGating(e, tuning);
    applyStandAndKO(e, tuning);

    trace.onEvent({ kind: TraceKinds.Intent, tick: world.tick, entityId: e.id, intent: e.intent });
  }

  for (const e of world.entities) {
    const d = e.intent.move.dir;
    if (d.x !== 0 || d.y !== 0 || d.z !== 0) e.action.facingDirQ = normaliseDirCheapQ(d);
  }

  for (const e of world.entities) {
    if (e.injury.dead) continue;

    stepMovement(e, world, ctx, tuning);

    trace.onEvent({ kind: TraceKinds.Move, tick: world.tick, entityId: e.id, pos: e.position_m, vel: e.velocity_mps });
  }
  const spatialAfterMove = buildSpatialIndex(world, cellSize_m);
  if (strictDeterminism) assertDeterministicWorldLike(world, "step:post-movement");

  // Phase 6: hazard damage — applied after movement so entities in hazard cells take damage each tick.
  if (ctx.hazardGrid) {
    stepHazardEffects(world.entities, ctx.hazardGrid, cellSize_m);
  }

  stepPushAndRepulsion(world, index, spatialAfterMove, {
    personalRadius_m: Math.trunc(0.45 * SCALE.m),
    repelAccel_mps2: Math.trunc(1.5 * SCALE.mps2),
    pushTransfer: q(0.35),
    maxNeighbours: 10,
  });


  for (const e of world.entities) {
    if (e.injury.dead) continue;
    const commands = cmds.get(e.id) ?? [];
    for (const c of commands) {
      if (c.kind === "attack") {
        resolveAttack(world, e, c, tuning, index, impacts, spatial, trace, ctx);
      } else if (c.kind === "attackNearest") {
        const wpn = findWeapon(e.loadout, c.weaponId);
        if (!wpn) continue;

        const reach_m = wpn.reach_m ?? Math.trunc(e.attributes.morphology.stature_m * 0.45);
        const target = pickNearestEnemyInReach(
          world,
          e,
          index,
          spatial,
          {
            reach_m,
            buffer_m: Math.trunc(0.8 * SCALE.m),
            maxTargets: 12,
            requireFrontArc: tuning.realism !== "arcade",
            minDotQ: tuning.realism === "sim" ? q(0.20) : q(0.0),
          }
        );
        if (!target) continue;

        // Convert to ordinary attack command
        const attackCmd: AttackCommand = {
          kind: "attack",
          targetId: target.id,
          mode: c.mode,
          ...(c.weaponId !== undefined ? { weaponId: c.weaponId } : {}),
          ...(c.intensity !== undefined ? { intensity: c.intensity } : {}),
        };

        resolveAttack(world, e, attackCmd, tuning, index, impacts, spatialAfterMove, trace, ctx);
      } else if (c.kind === "grapple") {
        resolveGrappleCommand(world, e, c as GrappleCommand, tuning, index, impacts, trace);
      } else if (c.kind === "breakGrapple") {
        resolveBreakGrapple(world, e, (c as BreakGrappleCommand).intensity, tuning, index, trace);
      } else if (c.kind === "breakBind") {
        resolveBreakBind(world, e, (c as BreakBindCommand).intensity, index, trace);
      } else if (c.kind === "shoot") {
        resolveShoot(world, e, c as ShootCommand, tuning, index, impacts, trace, ctx);
      } else if (c.kind === "treat") {
        resolveTreat(world, e, c as TreatCommand, index, trace, ctx);
      } else if (c.kind === "activate") {
        // Don't queue a new activation if one is already pending (cast in progress)
        if (!e.pendingActivation) {
          resolveActivation(world, e, c as ActivateCommand, ctx, trace, world.tick);
        }
      }
    }
  }

  // Phase 2A: per-tick grapple maintenance (stamina drain, grip decay, auto-release)
  for (const e of world.entities) {
    if (e.injury.dead) continue;
    stepGrappleTick(world, e, index);
  }

  let finalImpacts = impacts;

  if (tuning.realism !== "arcade") {
    finalImpacts = applyFrontageCap(impacts, index, { maxEngagersPerTarget: tuning.realism === "sim" ? 2 : 3 });
  }

  sortEventsDeterministic(finalImpacts);

  // Phase 5: snapshot alive set before impacts are applied (used by morale step to detect ally deaths)
  const aliveBeforeTick = new Set(world.entities.filter(e => !e.injury.dead).map(e => e.id));

  applyResolvedImpacts(world, index, finalImpacts, trace, { applyImpactToInjury });
  if (strictDeterminism) assertDeterministicWorldLike(world, "step:post-impacts");

  // Phase 12B: apply chain payloads from active field effects, then expire timed ones
  stepChainEffects(world, trace, world.tick);
  stepFieldEffects(world);

  // Phase 5: precompute routing fraction per team for routing cascade check
  const teamAliveCount = new Map<number, number>();
  const teamRoutingCount = new Map<number, number>();
  for (const e of world.entities) {
    if (e.injury.dead) continue;
    teamAliveCount.set(e.teamId, (teamAliveCount.get(e.teamId) ?? 0) + 1);
    if (isRouting(e.condition.fearQ ?? 0, e.attributes.resilience.distressTolerance)) {
      teamRoutingCount.set(e.teamId, (teamRoutingCount.get(e.teamId) ?? 0) + 1);
    }
  }
  const teamRoutingFrac = new Map<number, number>();
  for (const [teamId, alive] of teamAliveCount) {
    teamRoutingFrac.set(teamId, alive > 0 ? (teamRoutingCount.get(teamId) ?? 0) / alive : 0);
  }

  // Injury progression and energy — must complete for ALL entities before morale runs
  for (const e of world.entities) {
    if (e.injury.dead) continue;
    const wasAboveKOThreshold = e.injury.consciousness > tuning.unconsciousThreshold;
    stepConditionsToInjury(e, world, ctx.ambientTemperature_Q);
    stepInjuryProgression(e, world.tick);
    stepSubstances(e, ctx.ambientTemperature_Q);
    stepEnergy(e, ctx);
    // Phase 29: advance core temperature once per tick (Phase 31: skip ectotherms)
    // Phase 68: pass biome thermal resistance base when a biome is active
    if (ctx.thermalAmbient_Q !== undefined && !e.physiology?.coldBlooded) {
      stepCoreTemp(e, ctx.thermalAmbient_Q, 1 / TICK_HZ, ctx.biome?.thermalResistanceBase);
    }
    // Phase 68: vacuum fatigue — entities in a vacuum accumulate fatigue each tick.
    // Rate: ~3 Q/tick = 60 Q/s = 0.6 %/s → full incapacitation in ~167 s without protection.
    if (ctx.biome?.isVacuum) {
      e.energy.fatigue = clampQ((e.energy.fatigue + 3) as Q, 0, SCALE.Q);
    }
    stepCapabilitySources(e, world, ctx); // Phase 12
    // Phase 13: emit KO and Death events so metrics/replay consumers can track incapacitation
    if (e.injury.dead) {
      trace.onEvent({ kind: TraceKinds.Death, tick: world.tick, entityId: e.id });
      // Phase 12B: kill-triggered regen — credit all living entities with kill triggers
      for (const observer of world.entities) {
        if (observer.id === e.id || observer.injury.dead) continue;
        for (const src of (observer.capabilitySources ?? [])) {
          if (src.regenModel.type !== "event") continue;
          for (const trig of src.regenModel.triggers) {
            if (trig.on === "kill") {
              src.reserve_J = Math.min(src.maxReserve_J, src.reserve_J + trig.amount_J);
            }
          }
        }
      }
    } else if (wasAboveKOThreshold && e.injury.consciousness <= tuning.unconsciousThreshold) {
      trace.onEvent({ kind: TraceKinds.KO, tick: world.tick, entityId: e.id });
    }
    trace.onEvent({
      kind: TraceKinds.Injury,
      tick: world.tick,
      entityId: e.id,
      dead: e.injury.dead,
      shockQ: e.injury.shock,
      fluidLossQ: e.injury.fluidLoss,
      consciousnessQ: e.injury.consciousness,
    });
  }

  // Phase 30: nutrition at 1 Hz (world-level accumulator avoids per-tick BMR calls)
  // Phase 32C: toxicology ticked at same 1 Hz cadence
  {
    if (runtimeState.nutritionAccum === undefined) runtimeState.nutritionAccum = 0;
    runtimeState.nutritionAccum += (1 / TICK_HZ);
    if (runtimeState.nutritionAccum >= 1.0) {
      runtimeState.nutritionAccum -= 1.0;
      for (const e of world.entities) {
        if (!e.injury.dead) {
          const nVMag = Math.sqrt(e.velocity_mps.x ** 2 + e.velocity_mps.y ** 2);
          const nAct: Q = nVMag >= Math.trunc(SCALE.mps) ? q(0.50) as Q : q(0) as Q;
          stepNutrition(e, 1.0, nAct);
          if (e.activeVenoms?.length) stepToxicology(e, 1.0);
          if (e.activeIngestedToxins?.length || e.withdrawal?.length) stepIngestedToxicology(e, 1.0);
        }
      }
    }
  }

  // Phase 32B: limb fatigue tick (per-tick, for entities with limbStates)
  for (const e of world.entities) {
    if (!e.injury.dead && e.limbStates) {
      stepLimbFatigue(e.limbStates, e.attributes.performance.peakForce_N, 1 / TICK_HZ);
    }
  }

  // Phase 5: morale step — runs after all deaths from this tick are determined
  for (const e of world.entities) {
    if (e.injury.dead) continue;
    stepMoraleForEntity(world, e, index, spatialAfterMove, aliveBeforeTick, teamRoutingFrac, trace, ctx);
  }

  trace.onEvent({ kind: TraceKinds.TickEnd, tick: world.tick });
  world.tick += 1;
  if (strictDeterminism) assertDeterministicWorldLike(world, "step:end");
}

function resolveCapabilityHitSegment(
  world: WorldState,
  tick: number,
  actor: Entity,
  target: Entity,
  salt: number,
): HitSegmentId {
  const seed = eventSeed(world.seed, tick, actor.id, target.id, salt);
  const rng = makeRng(seed, SCALE.Q);
  const sideBit = (seed & 1) as 0 | 1;
  return resolveTargetHitSegment(target, rng.q01(), sideBit);
}

/* ------------------ Combat ------------------ */
function resolveAttack(world: WorldState,
  attacker: Entity,
  cmd: AttackCommand,
  tuning: SimulationTuning,
  index: WorldIndex,
  impacts: ImpactEvent[],
  spatial: SpatialIndex,
  trace: TraceSink,
  ctx: KernelContext,
): void {
  resolveAttackFromResolver({
    world,
    attacker,
    cmd,
    tuning,
    index,
    impacts,
    spatial,
    trace,
    ctx,
    resolveTargetHitSegment,
    regionCoverageQ,
    shieldBlocksSegment,
    armourCoversHit,
  });
}


export function clampSpeed(v: Vec3, vmax_mps: I32): Vec3 {
  return { x: clampI32(v.x, -vmax_mps, vmax_mps), y: clampI32(v.y, -vmax_mps, vmax_mps), z: clampI32(v.z, -vmax_mps, vmax_mps) };
}

export function scaleDirToSpeed(dirQ: Vec3, speed_mps: I32): Vec3 {
  return {
    x: mulDiv(speed_mps, dirQ.x, SCALE.Q),
    y: mulDiv(speed_mps, dirQ.y, SCALE.Q),
    z: mulDiv(speed_mps, dirQ.z, SCALE.Q),
  };
}

export function clampI32(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/* ------------------ Grapple command dispatch (Phase 2A) ------------------ */
function resolveGrappleCommand(
  world: WorldState,
  e: Entity,
  c: GrappleCommand,
  tuning: SimulationTuning,
  index: WorldIndex,
  impacts: ImpactEvent[],
  trace: TraceSink,
): void {
  resolveGrappleCommandFromResolver({ world, entity: e, command: c, tuning, index, impacts, trace });
}


/* ------------------ Weapon bind breaking (Phase 2C) ------------------ */

/**
 * Resolve an active breakBind command.
 *
 * The entity attempts to disengage their weapon from the bind.
 * A seeded torque contest (peakForce × momentArm) determines the outcome.
 * On success: bind clears for both; the loser takes a brief stun (q(0.05)).
 * On failure: bind persists; no effect.
 *
 * The bind always clears if the partner entity is dead or no longer present.
 */
function resolveBreakBind(
  world: WorldState,
  e: Entity,
  intensity: Q,
  index: WorldIndex,
  trace: TraceSink,
): void {
  resolveBreakBindFromResolver({ world, entity: e, intensity, index, trace });
}


/* ------------------ Ranged combat (Phase 3) ------------------ */

/** Integer square root of a BigInt (floor). Newton-Raphson. */
function isqrtBig(n: bigint): bigint {
  if (n <= 0n) return 0n;
  let r = n;
  let r1 = (r + 1n) >> 1n;
  while (r1 < r) { r = r1; r1 = (r + n / r) >> 1n; }
  return r;
}

function resolveShoot(
  world: WorldState,
  shooter: Entity,
  cmd: ShootCommand,
  tuning: SimulationTuning,
  index: WorldIndex,
  impacts: ImpactEvent[],
  trace: TraceSink,
  ctx: KernelContext,
): void {
  resolveShootFromResolver({
    world,
    shooter,
    cmd,
    tuning,
    impacts,
    trace,
    ctx,
    target: index.byId.get(cmd.targetId),
    resolveTargetHitSegment,
    shieldBlocksSegment,
    regionCoverageQ,
    armourCoversHit,
  });
}


// ---- Phase 2B: per-action stamina cost helpers ----

/**
 * Energy cost (J) for a melee strike at a given intensity.
 * Modelled as a ~40 ms burst at peak power:
 *   cost = peakPower_W × 0.04 × intensity
 * Calibration: 1200 W × 0.04 = 48 J ≈ 50 J reference.
 * Minimum 5 J to avoid zero cost on very weak entities.
 */
function strikeCost_J(attacker: Entity, intensity: Q): I32 {
  const base = Math.max(20, mulDiv(attacker.attributes.performance.peakPower_W, 4, 100));
  return Math.max(5, mulDiv(base, intensity, SCALE.Q));
}

/**
 * Energy cost (J) of an active melee defence (block or parry).
 * Modelled as a ~25 ms burst at peak power:
 *   cost = peakPower_W × 0.025
 * Calibration: 1200 W × 0.025 = 30 J reference.
 * Minimum 5 J.
 */
function defenceCost_J(defender: Entity): I32 {
  return Math.max(5, mulDiv(defender.attributes.performance.peakPower_W, 25, 1000));
}

export function armourCoversHit(world: WorldState, coverage: Q, aId: number, bId: number): boolean {
  if (coverage <= 0) return false;
  if (coverage >= SCALE.Q) return true;
  const seed = eventSeed(world.seed, world.tick, aId, bId, 0xC0DE);
  const roll = (seed % SCALE.Q) as Q;
  return roll < coverage;
}

function applyKineticArmourPenetration(energy_J: number, resist_J: number, postMul: Q): number {
  const remaining = Math.max(0, energy_J - Math.max(0, resist_J));
  return mulDiv(remaining, postMul, SCALE.Q);
}

function impactEnergy_J(attacker: Entity, wpn: Weapon, relVel_mps: Vec3): number {
  const frac = wpn.strikeEffectiveMassFrac ?? q(0.10);
  const bodyEffMass = mulDiv(attacker.attributes.morphology.mass_kg, frac, SCALE.Q);
  const mEff = wpn.mass_kg + bodyEffMass;

  const vx = BigInt(relVel_mps.x);
  const vy = BigInt(relVel_mps.y);
  const vz = BigInt(relVel_mps.z);
  const v2 = vx * vx + vy * vy + vz * vz;

  const denom = 2n * BigInt(SCALE.kg) * BigInt(SCALE.mps) * BigInt(SCALE.mps);
  const num = BigInt(mEff) * v2;

  return Math.max(0, Number(num / denom));
}

export function applyImpactToInjury(
  target: Entity,
  wpn: Weapon,
  energy_J: number,
  region: string,
  armoured: boolean,
  trace: TraceSink,
  tick: number,
  tempCavityMul_Q?: number,
): void {
  if (energy_J <= 0) return;

  // Determine region role: head → CNS-critical; limb → structural-priority; torso → default
  const areaSurf = q(1.0);
  let areaInt = q(1.0), areaStr = q(1.0);
  const seg = target.bodyPlan?.segments.find(s => s.id === region);
  if (seg) {
    if (seg.cnsRole === "central") { areaInt = q(1.25); areaStr = q(0.85); }
    else if (seg.locomotionRole === "primary" || seg.manipulationRole === "primary") { areaStr = q(1.20); areaInt = q(0.80); }
    else { areaInt = q(1.05); }
  } else {
    // Backward compat: humanoid string literals
    if (region === "head") { areaInt = q(1.25); areaStr = q(0.85); }
    else if (region === "leftArm" || region === "rightArm" || region === "leftLeg" || region === "rightLeg") { areaStr = q(1.20); areaInt = q(0.80); }
    else { areaInt = q(1.05); }
  }

  const armourShift = armoured ? q(0.75) : q(1.0);

  // Phase 8C: intrinsic exoskeleton armour — absorbed before damage channels are allocated
  if (seg?.intrinsicArmor_J !== undefined && seg.intrinsicArmor_J > 0) {
    energy_J = Math.max(0, energy_J - seg.intrinsicArmor_J);
    if (energy_J === 0) return;
  }

  const SURF_J = 6930;
  const INT_J = 1000;
  const STR_J = 220;

  const energyQ = energy_J * SCALE.Q;
  const bias = wpn.damage.penetrationBias;

  const surfFrac = clampQ(wpn.damage.surfaceFrac - qMul(bias, q(0.12)), q(0.05), q(0.95));
  const intFrac = clampQ(wpn.damage.internalFrac + qMul(bias, q(0.12)), q(0.05), q(0.95));

  const surfInc = Math.min(SCALE.Q, mulDiv(Math.trunc(energyQ), qMul(qMul(surfFrac, areaSurf), armourShift), SURF_J * SCALE.Q));
  let intInc = Math.min(SCALE.Q, mulDiv(Math.trunc(energyQ), qMul(intFrac, areaInt), INT_J * SCALE.Q));
  // Phase 27: temporary cavity amplifies internal damage for high-velocity projectiles
  if (tempCavityMul_Q && tempCavityMul_Q > SCALE.Q) {
    intInc = Math.min(SCALE.Q, mulDiv(intInc, tempCavityMul_Q, SCALE.Q));
  }
  let strInc = Math.min(SCALE.Q, mulDiv(Math.trunc(energyQ), qMul(wpn.damage.structuralFrac, areaStr), STR_J * SCALE.Q));

  // Phase 8B: joint vulnerability — joints take extra structural damage from kinetic impacts
  if (seg?.isJoint && seg.jointDamageMultiplier) {
    strInc = Math.trunc(strInc * seg.jointDamageMultiplier / SCALE.Q);
  }

  // Phase 8B: molting softening — segments currently softening take reduced structural damage (×q(0.70))
  if (target.molting?.active && target.molting.softeningSegments.includes(region)) {
    strInc = qMul(strInc as Q, q(0.70));
  }

  const regionState = target.injury.byRegion[region];
  if (!regionState) return;

  // Phase 8B: exoskeleton shell breach — below threshold all damage routes to structural only
  if (seg?.structureType === "exoskeleton" && seg.breachThreshold !== undefined) {
    if (regionState.structuralDamage < seg.breachThreshold) {
      const totalInc = surfInc + intInc + strInc;
      regionState.structuralDamage = clampQ(regionState.structuralDamage + totalInc, 0, SCALE.Q);
      // Phase 9: fracture detection still applies during shell build-up
      if (!regionState.fractured && regionState.structuralDamage >= FRACTURE_THRESHOLD) {
        regionState.fractured = true;
        trace.onEvent({ kind: TraceKinds.Fracture, tick, entityId: target.id, region });
      }
      return; // no bleed / shock until shell is breached
    }
    // shell already breached — fall through to normal three-channel split
  }

  regionState.surfaceDamage = clampQ(regionState.surfaceDamage + surfInc, 0, SCALE.Q);
  regionState.internalDamage = clampQ(regionState.internalDamage + intInc, 0, SCALE.Q);
  regionState.structuralDamage = clampQ(regionState.structuralDamage + strInc, 0, SCALE.Q);

  const bleedBase = clampQ(((surfInc + intInc) >>> 1), 0, SCALE.Q);
  const bleedDelta = qMul(bleedBase, wpn.damage.bleedFactor);

  const BLEED_SCALE = q(0.004);
  regionState.bleedingRate = clampQ(regionState.bleedingRate + qMul(bleedDelta, BLEED_SCALE), 0, q(1.0));

  const SHOCK_SPIKE = q(0.010);
  target.injury.shock = clampQ(target.injury.shock + qMul(bleedBase, SHOCK_SPIKE), 0, SCALE.Q);

  // Phase 9: fracture detection
  if (!regionState.fractured && regionState.structuralDamage >= FRACTURE_THRESHOLD) {
    regionState.fractured = true;
    trace.onEvent({ kind: TraceKinds.Fracture, tick, entityId: target.id, region });
  }

  // Phase 9: permanent damage floor — once structural is very high, a floor is set
  const PERMANENT_THRESHOLD: Q = q(0.90) as Q;
  const PERMANENT_FLOOR_MUL: Q = q(0.75) as Q;
  if (regionState.structuralDamage >= PERMANENT_THRESHOLD) {
    const newFloor = qMul(regionState.structuralDamage, PERMANENT_FLOOR_MUL);
    if (newFloor > regionState.permanentDamage) regionState.permanentDamage = newFloor as Q;
  }
}

// 15% of kinetic energy transmitted after muscle absorption (85% absorbed)
const FALL_MUSCLE_ABSORB: Q = q(0.85);

// Weapon-like damage profiles reused by the injury pipeline
const FALL_WEAPON: Weapon = {
  id: "fall", kind: "weapon", name: "Fall", mass_kg: 0, bulk: q(0),
  damage: { penetrationBias: q(0), surfaceFrac: q(0.10), internalFrac: q(0.20), structuralFrac: q(0.70), bleedFactor: q(0.05) },
};

const BLAST_WEAPON: Weapon = {
  id: "blast", kind: "weapon", name: "Blast Wave", mass_kg: 0, bulk: q(0),
  damage: { penetrationBias: q(0), surfaceFrac: q(0.15), internalFrac: q(0.55), structuralFrac: q(0.30), bleedFactor: q(0.25) },
};

const FRAG_WEAPON: Weapon = {
  id: "frag", kind: "weapon", name: "Fragment", mass_kg: 0, bulk: q(0),
  damage: { penetrationBias: q(0.60), surfaceFrac: q(0.25), internalFrac: q(0.40), structuralFrac: q(0.35), bleedFactor: q(0.60) },
};

/**
 * Apply fall damage to a single entity (Phase 10).
 * KE = mass × g × height; 85% absorbed by controlled landing.
 * Remaining 15% distributed: locomotion-primary regions × 70%, others × 30%.
 * Any fall ≥ 1 m forces prone.
 */
export function applyFallDamage(
  world: WorldState,
  entityId: number,
  height_m: I32,
  tick: number,
  trace: TraceSink,
): void {
  const e = world.entities.find(x => x.id === entityId);
  if (!e || e.injury.dead) return;

  // KE_J = (mass_kg / SCALE.kg) × 9.81 × (height_m / SCALE.m)
  //       = mass_kg × 981 × height_m / (SCALE.kg × 100 × SCALE.m)
  const G_X100 = 981;
  const keFull = Number(
    (BigInt(e.attributes.morphology.mass_kg) * BigInt(G_X100) * BigInt(height_m)) /
    BigInt(SCALE.kg * 100 * SCALE.m),
  );
  if (keFull <= 0) return;

  // 15% transmitted after muscle absorption
  const keEffective = mulDiv(keFull, SCALE.Q - FALL_MUSCLE_ABSORB, SCALE.Q);
  if (keEffective <= 0) return;

  // Any fall ≥ 1 m forces prone
  if (height_m >= SCALE.m) e.condition.prone = true;

  const plan = e.bodyPlan;
  if (plan) {
    // Body-plan-aware: locomotion-primary 70%, remainder 30%
    const primIds = plan.segments.filter(s => s.locomotionRole === "primary").map(s => s.id);
    const otherIds = plan.segments.filter(s => s.locomotionRole !== "primary").map(s => s.id);
    const primShare  = primIds.length  > 0 ? Math.trunc((keEffective * 7) / 10) : 0;
    const otherShare = otherIds.length > 0 ? keEffective - primShare            : 0;
    const perPrim  = primIds.length  > 0 ? Math.trunc(primShare  / primIds.length)  : 0;
    const perOther = otherIds.length > 0 ? Math.trunc(otherShare / otherIds.length) : 0;
    for (const rid of primIds)  if (perPrim  > 0) applyImpactToInjury(e, FALL_WEAPON, perPrim,  rid, false, trace, tick);
    for (const rid of otherIds) if (perOther > 0) applyImpactToInjury(e, FALL_WEAPON, perOther, rid, false, trace, tick);
  } else {
    // Humanoid fallback: legs 35% each, arms 10% each, torso 5%, head 5%
    const regions: [string, number][] = [
      ["leftLeg", 35], ["rightLeg", 35],
      ["leftArm", 10], ["rightArm", 10],
      ["torso",    5], ["head",      5],
    ];
    for (const [region, pct] of regions) {
      const energy = Math.trunc((keEffective * pct) / 100);
      if (energy > 0) applyImpactToInjury(e, FALL_WEAPON, energy, region, false, trace, tick);
    }
  }
}

// Multiplier for blast throw velocity: SCALE.mps × SCALE.kg ÷ 10 (empirical damping).
// Produces ~0.67 m/s per 500 J on a 75 kg entity; capped at 10 m/s.
const BLAST_THROW_MUL = Math.trunc(SCALE.mps * SCALE.kg / 10); // 1_000_000

/**
 * Apply a point-source explosion to all living entities within the blast radius (Phase 10).
 *
 * Features:
 * - Blast wave delivered to torso; entities facing away take −30% blast damage.
 * - Stochastic fragment hits to random regions.
 * - Blast throw: entities are pushed outward; velocity proportional to blast energy / mass.
 * - Emits a BlastHit trace event for each affected entity.
 */
export function applyExplosion(
  world: WorldState,
  origin: Vec3,
  spec: BlastSpec,
  tick: number,
  trace: TraceSink,
): void {
  for (const e of world.entities) {
    if (e.injury.dead) continue;

    const dx     = e.position_m.x - origin.x;
    const dy     = e.position_m.y - origin.y;
    const distSq = dx * dx + dy * dy;

    const blastFracQ   = blastEnergyFracQ(spec, distSq);
    const fragExpected = fragmentsExpected(spec, distSq);

    if (blastFracQ <= 0 && fragExpected <= 0) continue;

    // Direction from epicentre to entity (used for facing check and throw).
    // normaliseDirCheapQ handles zero-vector gracefully (returns all-zero).
    const blastDir = normaliseDirCheapQ(vSub(e.position_m, origin));

    // Blast wave — delivered to torso (or best equivalent region)
    let blastDelivered = 0;
    if (blastFracQ > 0) {
      blastDelivered = mulDiv(spec.blastEnergy_J, blastFracQ, SCALE.Q);

      // Facing check: entity facing away from blast has less frontal exposure → −30%.
      // dot > 0 means facingDir and blastDir roughly align (entity turned away from blast).
      if (blastDelivered > 0) {
        const facingDot = dotDirQ(e.action.facingDirQ, blastDir);
        if (facingDot > 0) {
          blastDelivered = mulDiv(blastDelivered, q(0.70), SCALE.Q);
        }
      }

      const blastRegion = e.bodyPlan
        ? (e.bodyPlan.segments.find(s => s.locomotionRole === "none" && s.cnsRole !== "central")?.id
            ?? e.bodyPlan.segments[0]?.id ?? "torso")
        : "torso";
      if (blastDelivered > 0 && e.injury.byRegion[blastRegion]) {
        applyImpactToInjury(e, BLAST_WEAPON, blastDelivered, blastRegion, false, trace, tick);
      }
    }

    // Fragment hits — stochastic count, fractional part resolved by RNG
    let fragHits = 0;
    if (fragExpected > 0) {
      const countSeed = eventSeed(world.seed, tick, e.id, 0, 0xBEA5);
      const rng       = makeRng(countSeed, SCALE.Q);
      const fragFrac  = fragExpected - Math.trunc(fragExpected);
      const fragCount = Math.trunc(fragExpected) + (rng.q01() < Math.trunc(fragFrac * SCALE.Q) ? 1 : 0);

      const fragKeJ = fragmentKineticEnergy(spec, distSq);
      for (let f = 0; f < fragCount; f++) {
        if (fragKeJ <= 0) break;
        const fragRegSeed = eventSeed(world.seed, tick, e.id, f, 0xF4A6);
        const fragRng     = makeRng(fragRegSeed, SCALE.Q);
        let fragRegion: string | undefined;
        if (e.bodyPlan) {
          fragRegion = resolveHitSegment(e.bodyPlan, fragRng.q01());
        } else {
          const area    = chooseArea(fragRng.q01());
          const sideBit = (fragRegSeed & 1) as 0 | 1;
          fragRegion    = regionFromHit(area, sideBit);
        }
        if (fragRegion && e.injury.byRegion[fragRegion]) {
          applyImpactToInjury(e, FRAG_WEAPON, fragKeJ, fragRegion, false, trace, tick);
          fragHits++;
        }
      }
    }

    // Phase 10C: flash blindness — entities within inner 40% of blast radius are temporarily blinded
    if (blastFracQ > 0) {
      const FLASH_RADIUS_FRAC = q(0.40);
      const flashRadiusSq = mulDiv(spec.radius_m * spec.radius_m, FLASH_RADIUS_FRAC, SCALE.Q);
      if (distSq < flashRadiusSq) {
        const blindDuration = Math.max(10, Math.trunc(20 * (1 - distSq / flashRadiusSq)));
        e.condition.blindTicks = Math.max(e.condition.blindTicks, blindDuration);
      }
    }

    // Blast throw: push entity outward from epicentre.
    // throwVel_units = clamp(blastDelivered × BLAST_THROW_MUL / mass_kg, 0, 10 m/s)
    if (blastDelivered > 0 && distSq > 0) {
      const mass_kg = e.attributes.morphology.mass_kg;
      const throwVel = Math.min(
        to.mps(10),
        Number(BigInt(blastDelivered) * BigInt(BLAST_THROW_MUL) / BigInt(Math.max(1, mass_kg))),
      );
      if (throwVel > 0) {
        const throwVec = {
          x: Math.trunc(blastDir.x * throwVel / SCALE.Q),
          y: Math.trunc(blastDir.y * throwVel / SCALE.Q),
          z: 0,
        };
        e.velocity_mps = vAdd(e.velocity_mps, throwVec);
      }
    }

    trace.onEvent({
      kind: TraceKinds.BlastHit,
      tick,
      entityId: e.id,
      blastEnergy_J: blastDelivered,
      fragHits,
    });
  }
}

/* ── Phase 9: medical treatment ──────────────────────────────────────────── */

function resolveTreat(
  world: WorldState,
  treater: Entity,
  cmd: TreatCommand,
  index: WorldIndex,
  trace: TraceSink,
  ctx: KernelContext,
): void {
  resolveTreatFromResolver({ world, treater, cmd, index, trace, ctx });
}


/* ── Phase 12: capability sources and effects ─────────────────────────────── */

/**
 * Synthetic Weapon objects for capability impact payloads, keyed by DamageChannel.
 * The engine cannot distinguish these from weapon impacts — same applyImpactToInjury path.
 */
const CAPABILITY_CHANNEL_WEAPONS: Partial<Record<number, Weapon>> = {
  [DamageChannel.Kinetic]:    { id: "cap_kinetic",  kind: "weapon", name: "Kinetic Force", mass_kg: 0, bulk: q(0), damage: { penetrationBias: q(0.30), surfaceFrac: q(0.30), internalFrac: q(0.30), structuralFrac: q(0.40), bleedFactor: q(0.30) } },
  [DamageChannel.Thermal]:    { id: "cap_thermal",  kind: "weapon", name: "Thermal",       mass_kg: 0, bulk: q(0), damage: { penetrationBias: q(0),    surfaceFrac: q(0.40), internalFrac: q(0.50), structuralFrac: q(0.10), bleedFactor: q(0.10) } },
  [DamageChannel.Electrical]: { id: "cap_elec",     kind: "weapon", name: "Electrical",    mass_kg: 0, bulk: q(0), damage: { penetrationBias: q(0.20), surfaceFrac: q(0.20), internalFrac: q(0.60), structuralFrac: q(0.20), bleedFactor: q(0.05) } },
  [DamageChannel.Chemical]:   { id: "cap_chem",     kind: "weapon", name: "Chemical",      mass_kg: 0, bulk: q(0), damage: { penetrationBias: q(0),    surfaceFrac: q(0.45), internalFrac: q(0.45), structuralFrac: q(0.10), bleedFactor: q(0.20) } },
  [DamageChannel.Radiation]:  { id: "cap_rad",      kind: "weapon", name: "Radiation",     mass_kg: 0, bulk: q(0), damage: { penetrationBias: q(0),    surfaceFrac: q(0.05), internalFrac: q(0.90), structuralFrac: q(0.05), bleedFactor: q(0.05) } },
};
const CAPABILITY_WEAPON_DEFAULT: Weapon = {
  id: "cap_generic", kind: "weapon", name: "Capability", mass_kg: 0, bulk: q(0),
  damage: { penetrationBias: q(0.10), surfaceFrac: q(0.30), internalFrac: q(0.40), structuralFrac: q(0.30), bleedFactor: q(0.20) },
};

/**
 * Apply a single EffectPayload to target on behalf of actor.
 * All payloads route to existing engine primitives — the engine does not distinguish
 * magical from technological effects at this level.
 */
export function applyPayload(
  world: WorldState,
  actor: Entity,
  target: Entity,
  payload: EffectPayload,
  trace: TraceSink,
  tick: number,
  effectId: string,
): void {
  applyPayloadFromResolver(world, actor, target, payload, trace, tick, effectId, {
    resolveCapabilityHitSegment,
    applyImpactToInjury,
  });
}


/**
 * Resolve all payloads of a capability effect for the appropriate target set.
 * AoE: all living entities within aoeRadius_m of target/actor position.
 * Single-target: targetId entity, or self if absent.
 */
export function applyCapabilityEffect(
  world: WorldState,
  actor: Entity,
  targetId: number | undefined,
  effect: CapabilityEffect,
  trace: TraceSink,
  tick: number,
): void {
  applyCapabilityEffectFromResolver(world, actor, targetId, effect, trace, tick, {
    resolveCapabilityHitSegment,
    applyImpactToInjury,
  });
}


/**
 * Resolve a capability activation command for actor.
 * Validates suppression, range, and cost; handles cast time via pendingActivation.
 */
function resolveActivation(
  world: WorldState,
  actor: Entity,
  cmd: ActivateCommand,
  ctx: KernelContext,
  trace: TraceSink,
  tick: number,
): void {
  resolveActivationFromResolver(world, actor, cmd, ctx, trace, tick, (effect) => {
    applyCapabilityEffect(world, actor, cmd.targetId, effect, trace, tick);
  });
}
