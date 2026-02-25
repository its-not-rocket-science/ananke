import type { WorldState } from "./world.js";
import type { Entity } from "./entity.js";
import type { CommandMap, Command, AttackCommand, GrappleCommand, BreakGrappleCommand, BreakBindCommand, ShootCommand, TreatCommand } from "./commands.js";

import { SCALE, q, clampQ, qMul, mulDiv, to, type Q, type I32 } from "../units.js";
import { deriveMovementCaps, stepEnergyAndFatigue } from "../derive.js";
import { DamageChannel } from "../channels.js";
import { deriveArmourProfile, findWeapon, findShield, findRangedWeapon, findExoskeleton, type Weapon, type RangedWeapon } from "../equipment.js";
import type { TechContext } from "./tech.js";
import { deriveFunctionalState } from "./impairment.js";
import { TUNING, type SimulationTuning } from "./tuning.js";
import { buildTraitProfile } from "../traits.js";

import { integratePos, type Vec3, v3, vSub, vAdd } from "./vec3.js";
import { defaultIntent } from "./intent.js";
import { defaultAction } from "./action.js";
import { resolveHit, shieldCovers, chooseArea, type HitArea } from "./combat.js";
import { normaliseDirCheapQ, dotDirQ } from "./vec3.js";
import { eventSeed } from "./seeds.js";
import { type BodyRegion, regionFromHit, ALL_REGIONS, DEFAULT_REGION_WEIGHTS } from "./body.js";
import { resolveHitSegment, getExposureWeight, segmentIds } from "./bodyplan.js";
import { totalBleedingRate, regionKOFactor, FRACTURE_THRESHOLD } from "./injury.js";
import { TIER_RANK, TIER_MUL, ACTION_MIN_TIER, TIER_TECH_REQ, type MedicalAction } from "./medical.js";
import { type BlastSpec, blastEnergyFracQ, fragmentsExpected, fragmentKineticEnergy } from "./explosion.js";
import type { ActiveSubstance } from "./substance.js";
import { makeRng } from "../rng.js";
import { WorldIndex, buildWorldIndex } from "./indexing.js";
import { buildSpatialIndex, queryNearbyIds, type SpatialIndex } from "./spatial.js";
import { type ImpactEvent, sortEventsDeterministic } from "./events.js";

import { parryLeverageQ } from "./combat.js";

import { pickNearestEnemyInReach } from "./formation.js";
import { isMeleeLaneOccludedByFriendly } from "./occlusion.js";
import { applyFrontageCap } from "./frontage.js";

import { type DensityField, computeDensityField } from "./density.js";
import {
  type TerrainGrid, tractionAtPosition, speedMulAtPosition,
  type ObstacleGrid, type ElevationGrid,
  coverFractionAtPosition, elevationAtPosition,
  type SlopeGrid, slopeAtPosition,
  type HazardGrid, type HazardCell, terrainKey,
} from "./terrain.js";
import { stepPushAndRepulsion } from "./push.js";

import { type TraceSink, nullTrace } from "./trace.js";
import { TraceKinds } from "./kinds.js";
import { type SensoryEnvironment, DEFAULT_SENSORY_ENV, DEFAULT_PERCEPTION, canDetect } from "./sensory.js";
import {
  FEAR_PER_SUPPRESSION_TICK,
  FEAR_FOR_ALLY_DEATH,
  FEAR_INJURY_MUL,
  FEAR_OUTNUMBERED,
  FEAR_SURPRISE,
  FEAR_ROUTING_CASCADE,
  fearDecayPerTick,
  isRouting,
  painBlocksAction,
} from "./morale.js";

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

export const TICK_HZ = 20;
export const DT_S: I32 = to.s(1 / TICK_HZ);

export interface KernelContext {
  tractionCoeff: Q;
  tuning?: SimulationTuning;
  cellSize_m?: I32; // fixed-point metres; default 4m
  density?: DensityField;

  trace?: TraceSink;

  /** Phase 4: ambient sensory conditions. Defaults to DEFAULT_SENSORY_ENV (full daylight, clear). */
  sensoryEnv?: SensoryEnvironment;

  /** Phase 6: per-cell terrain grid. When provided, traction is looked up by entity position. */
  terrainGrid?: TerrainGrid;

  /** Phase 6: impassable and partial-cover cells.  q(1.0) = fully impassable; q(0.5) = 50% cover. */
  obstacleGrid?: ObstacleGrid;

  /** Phase 6: height above ground level per cell (SCALE.m units). Affects melee reach and projectile range. */
  elevationGrid?: ElevationGrid;

  /** Phase 6: per-cell slope direction and grade.  Modifies effective sprint speed. */
  slopeGrid?: SlopeGrid;

  /** Phase 6: dynamic hazard cells (fire, radiation, poison_gas). Damage applied per tick. */
  hazardGrid?: HazardGrid;

  /**
   * Phase 10: ambient temperature (Q 0..1).
   * Comfort range: [q(0.35), q(0.65)].
   * Above q(0.65) → heat stress (shock + surface damage); below q(0.35) → cold stress (shock + fatigue).
   * Entity attributes `heatTolerance` and `coldTolerance` scale the dose.
   */
  ambientTemperature_Q?: Q;

  /**
   * Phase 11: technology context.
   * When provided, gates which items are available.
   * Does not directly affect simulation physics — use validateLoadout() before stepWorld
   * to verify that the entity's loadout is era-appropriate.
   */
  techCtx?: TechContext;
}

export function stepWorld(world: WorldState, cmds: CommandMap, ctx: KernelContext): void {
  const tuning = ctx.tuning ?? TUNING.tactical;

  const trace = ctx.trace ?? nullTrace;

  // Phase 4: attach sensory environment to world for use in resolveAttack / resolveShoot.
  // WorldState is a plain data object; we use a type-cast side-channel to avoid widening the type.
  (world as any).__sensoryEnv = ctx.sensoryEnv ?? DEFAULT_SENSORY_ENV;

  world.entities.sort((a, b) => a.id - b.id);

  const index = buildWorldIndex(world);

  const cellSize_m = ctx.cellSize_m ?? Math.trunc(4 * SCALE.m);
  const spatial = buildSpatialIndex(world, cellSize_m);

  const density = computeDensityField(world, index, spatial, {
    personalRadius_m: Math.trunc(0.45 * SCALE.m),
    maxNeighbours: 12,
    crowdingAt: 6,
  });
  ctx.density = density;

  const impacts: ImpactEvent[] = [];

  for (const e of world.entities) {
    if (!(e as any).intent) (e as any).intent = defaultIntent();
    if (!(e as any).action) (e as any).action = defaultAction();
    // Phase 2A: default new fields on entities created before this phase
    if (!(e as any).grapple) {
      (e as any).grapple = { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" };
    } else if ((e as any).grapple.position === undefined) {
      (e as any).grapple.position = "standing";
    }
    if ((e as any).action.grappleCooldownTicks === undefined) (e as any).action.grappleCooldownTicks = 0;
    if ((e as any).condition?.pinned === undefined) (e as any).condition.pinned = false;
    // Phase 2C: default weapon bind fields
    if ((e as any).action.weaponBindPartnerId === undefined) (e as any).action.weaponBindPartnerId = 0;
    if ((e as any).action.weaponBindTicks === undefined) (e as any).action.weaponBindTicks = 0;
    // Phase 3: ranged combat fields
    if ((e as any).action.shootCooldownTicks === undefined) (e as any).action.shootCooldownTicks = 0;
    if ((e as any).condition.suppressedTicks === undefined) (e as any).condition.suppressedTicks = 0;
    // Phase 4: perception defaults and decision latency
    if (!(e.attributes as any).perception) (e.attributes as any).perception = DEFAULT_PERCEPTION;
    if (!e.ai) e.ai = { focusTargetId: 0, retargetCooldownTicks: 0, decisionCooldownTicks: 0 };
    else if ((e.ai as any).decisionCooldownTicks === undefined) (e.ai as any).decisionCooldownTicks = 0;
    // Phase 5: fear / morale
    if ((e.condition as any).fearQ === undefined) (e.condition as any).fearQ = q(0);
    // Phase 9: new RegionInjury fields (default for entities created pre-Phase-9)
    if ((e.injury as any).hemolymphLoss === undefined) (e.injury as any).hemolymphLoss = q(0);
    for (const reg of Object.values(e.injury.byRegion)) {
      if ((reg as any).fractured === undefined)         (reg as any).fractured = false;
      if ((reg as any).infectedTick === undefined)      (reg as any).infectedTick = -1;
      if ((reg as any).bleedDuration_ticks === undefined) (reg as any).bleedDuration_ticks = 0;
      if ((reg as any).permanentDamage === undefined)   (reg as any).permanentDamage = q(0);
    }
  }

  for (const e of world.entities) {
    e.action.attackCooldownTicks = Math.max(0, e.action.attackCooldownTicks - 1);
    e.action.defenceCooldownTicks = Math.max(0, e.action.defenceCooldownTicks - 1);
    e.action.grappleCooldownTicks = Math.max(0, e.action.grappleCooldownTicks - 1);
    e.action.shootCooldownTicks = Math.max(0, e.action.shootCooldownTicks - 1);     // Phase 3
    e.condition.standBlockedTicks = Math.max(0, e.condition.standBlockedTicks - 1);
    e.condition.unconsciousTicks = Math.max(0, e.condition.unconsciousTicks - 1);
    e.condition.suppressedTicks = Math.max(0, e.condition.suppressedTicks - 1);    // Phase 3
    // Phase 2C: weapon bind decay — emit trace only from the smaller-ID entity to avoid duplicates
    if (e.action.weaponBindTicks > 0) {
      e.action.weaponBindTicks = Math.max(0, e.action.weaponBindTicks - 1);
      if (e.action.weaponBindTicks === 0) {
        const partnerId = e.action.weaponBindPartnerId;
        e.action.weaponBindPartnerId = 0;
        if (partnerId !== 0 && e.id < partnerId) {
          trace.onEvent({ kind: TraceKinds.WeaponBindBreak, tick: world.tick, entityId: e.id, partnerId, reason: "timeout" });
        }
      }
    }
  }

  for (const e of world.entities) {
    if (e.injury.dead) continue;

    applyCommands(e, cmds.get(e.id) ?? []);
    applyFunctionalGating(world, e, tuning);
    applyStandAndKO(world, e, tuning);

    trace.onEvent({ kind: TraceKinds.Intent, tick: world.tick, entityId: e.id, intent: e.intent });
  }

  for (const e of world.entities) {
    const d = e.intent.move.dir;
    if (d.x !== 0 || d.y !== 0 || d.z !== 0) e.action.facingDirQ = normaliseDirCheapQ(d);
  }

  for (const e of world.entities) {
    if (e.injury.dead) continue;

    stepMovement(world, e, ctx, tuning);

    trace.onEvent({ kind: TraceKinds.Move, tick: world.tick, entityId: e.id, pos: e.position_m, vel: e.velocity_mps });
  }
  const spatialAfterMove = buildSpatialIndex(world, cellSize_m);

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

  for (const ev of finalImpacts) {
    const target = index.byId.get(ev.targetId);
    if (!target || target.injury.dead) continue;

    applyImpactToInjury(target, ev.wpn, ev.energy_J, ev.region, ev.protectedByArmour, trace, world.tick);

    trace.onEvent({
      kind: TraceKinds.Attack,
      tick: world.tick,
      attackerId: ev.attackerId,
      targetId: ev.targetId,
      region: ev.region,
      energy_J: ev.energy_J,
      blocked: ev.blocked,
      parried: ev.parried,
      shieldBlocked: ev.shieldBlocked,
      armoured: ev.protectedByArmour,
      hitQuality: ev.hitQuality,
    });
  }

  // Phase 5: precompute routing fraction per team for routing cascade check
  const teamAliveCount = new Map<number, number>();
  const teamRoutingCount = new Map<number, number>();
  for (const e of world.entities) {
    if (e.injury.dead) continue;
    teamAliveCount.set(e.teamId, (teamAliveCount.get(e.teamId) ?? 0) + 1);
    if (isRouting(e.condition.fearQ, e.attributes.resilience.distressTolerance)) {
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
    stepConditionsToInjury(world, e, ctx.ambientTemperature_Q);
    stepInjuryProgression(e, world.tick);
    stepSubstances(e);
    stepEnergy(e, ctx);
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

  // Phase 5: morale step — runs after all deaths from this tick are determined
  for (const e of world.entities) {
    if (e.injury.dead) continue;
    stepMoraleForEntity(world, e, index, spatialAfterMove, aliveBeforeTick, teamRoutingFrac, trace, ctx);
  }

  trace.onEvent({ kind: TraceKinds.TickEnd, tick: world.tick });
  world.tick += 1;
}

function applyFunctionalGating(world: WorldState, e: Entity, tuning: SimulationTuning): void {
  const func = deriveFunctionalState(e, tuning);

  // incapacity gates voluntary actions
  if (!func.canAct) {
    e.intent.defence = { mode: "none", intensity: q(0) };
    e.intent.move = { dir: { x: 0, y: 0, z: 0 }, intensity: q(0), mode: "walk" };
    // keep prone if already, and prefer prone for non-acting entities in tactical/sim
    if (tuning.realism !== "arcade") e.condition.prone = true;
    return;
  }

  // Phase 2A: pinned entities cannot use normal defence (only breakGrapple applies)
  if (e.condition.pinned && tuning.realism !== "arcade") {
    e.intent.defence = { mode: "none", intensity: q(0) };
    e.condition.prone = true;
  }

  // Phase 2B: exhaustion collapse — when reserve is fully depleted, entity
  // cannot maintain posture or active defence (tactical/sim only).
  if (e.energy.reserveEnergy_J <= 0 && tuning.realism !== "arcade") {
    e.condition.prone = true;
    e.intent.defence = { mode: "none", intensity: q(0) };
  }

  // forced prone if cannot stand (tactical/sim)
  if (!func.canStand && tuning.realism !== "arcade") e.condition.prone = true;

  // hard limb disable hooks (tactical/sim)
  if (tuning.realism !== "arcade") {
    const armsOut = func.leftArmDisabled && func.rightArmDisabled;
    if (armsOut && (e.intent.defence.mode === "block" || e.intent.defence.mode === "parry")) {
      e.intent.defence = { mode: "none", intensity: q(0) };
    }

    const legsOut = func.leftLegDisabled && func.rightLegDisabled;
    if (legsOut && e.intent.move.mode === "sprint") {
      // no sprinting with both legs disabled
      e.intent.move = { ...e.intent.move, mode: "walk" };
    }
  }
}

function applyCommands(e: Entity, commands: readonly Command[]): void {
  e.intent.defence = { mode: "none", intensity: q(0) };

  for (const c of commands) {
    if (c.kind === "setProne") e.condition.prone = c.prone;
    else if (c.kind === "move") e.intent.move = { dir: c.dir, intensity: c.intensity, mode: c.mode };
    else if (c.kind === "defend") e.intent.defence = { mode: c.mode, intensity: clampQ(c.intensity, 0, SCALE.Q) };
  }
}

function applyStandAndKO(world: WorldState, e: Entity, tuning: SimulationTuning): void {
  // KO: if below threshold, go unconscious (but do NOT mark dead)
  const wasUnconscious = e.condition.unconsciousTicks > 0;

  if (e.injury.consciousness <= tuning.unconsciousThreshold) {
    if (!wasUnconscious) {
      e.condition.unconsciousTicks = tuning.unconsciousBaseTicks;
      e.condition.prone = true;
      e.intent.defence = { mode: "none", intensity: q(0) };
      e.intent.move = { dir: { x: 0, y: 0, z: 0 }, intensity: q(0), mode: "walk" };

      // SIM: drop weapons
      if (tuning.dropWeaponsOnUnconscious) {
        e.loadout.items = e.loadout.items.filter(it => it.kind !== "weapon");
      }
    } else {
      // keep them down
      e.condition.prone = true;
    }
  }

  // If unconscious, cannot act/stand
  if (e.condition.unconsciousTicks > 0) {
    e.intent.defence = { mode: "none", intensity: q(0) };
    e.intent.move = { dir: { x: 0, y: 0, z: 0 }, intensity: q(0), mode: "walk" };
    e.condition.prone = true;
    return;
  }

  // Standing rules: if player wants to stand but is blocked, force prone
  if (!e.intent.prone && e.condition.prone) {
    if (tuning.realism === "arcade") {
      e.condition.prone = false;
      return;
    }

    if (e.condition.standBlockedTicks > 0) {
      e.condition.prone = true;
      return;
    }

    // Compute stand-up time based on leg damage + shock + fatigue + encumbrance
    const func = deriveFunctionalState(e, tuning);
    const slow = (SCALE.Q - func.mobilityMul) as any; // 0..1
    const extra = Math.trunc((slow * tuning.standUpMaxExtraTicks) / SCALE.Q);
    const ticks = tuning.standUpBaseTicks + extra;

    e.condition.standBlockedTicks = Math.max(1, ticks);
    e.condition.prone = true;
    e.intent.prone = true; // reflect forced state
  }
}

function stepMovement(world: WorldState, e: Entity, ctx: KernelContext, tuning: SimulationTuning): void {
  const cellSize = ctx.cellSize_m ?? Math.trunc(4 * SCALE.m);
  const traction = tractionAtPosition(ctx.terrainGrid, cellSize, e.position_m.x, e.position_m.y, ctx.tractionCoeff);
  const caps = deriveMovementCaps(e.attributes, e.loadout, { tractionCoeff: traction });
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
  const crowdMul = clampQ(q(1.0) - qMul(q(0.65), crowd as any), q(0.25), q(1.0));

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

  const baseMul = qMul(qMul(qMul(qMul(qMul(qMul(controlMul, mobilityMul), crowdMul), terrainSpeedMul), slopeMul), exoSpeedMul), flightSpeedMul);

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
    const instability = (SCALE.Q - qMul(func.mobilityMul, func.coordinationMul)) as any;
    const chance = clampQ(tuning.stumbleBaseChance + qMul(instability, q(0.05)), q(0), q(0.25));
    if (chance > 0) {
      const seed = eventSeed(world.seed, world.tick, e.id, 0, 0xF411);
      const roll = (seed % SCALE.Q) as any;
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

function scaleDirToSpeed(dirQ: Vec3, speed_mps: I32): Vec3 {
  return {
    x: mulDiv(speed_mps, dirQ.x, SCALE.Q),
    y: mulDiv(speed_mps, dirQ.y, SCALE.Q),
    z: mulDiv(speed_mps, dirQ.z, SCALE.Q),
  };
}

function accelToward(v: Vec3, target: Vec3, amax_mps2: I32): Vec3 {
  const maxDv = Math.trunc((amax_mps2 * DT_S) / SCALE.s);
  return {
    x: v.x + clampI32(target.x - v.x, -maxDv, maxDv),
    y: v.y + clampI32(target.y - v.y, -maxDv, maxDv),
    z: v.z + clampI32(target.z - v.z, -maxDv, maxDv),
  };
}

function clampSpeed(v: Vec3, vmax_mps: I32): Vec3 {
  return { x: clampI32(v.x, -vmax_mps, vmax_mps), y: clampI32(v.y, -vmax_mps, vmax_mps), z: clampI32(v.z, -vmax_mps, vmax_mps) };
}

function clampI32(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
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
  if (attacker.action.attackCooldownTicks > 0) return;
  // Phase 2C: weapon bind gate — cannot attack while weapons are locked
  if (attacker.action.weaponBindPartnerId !== 0) return;

  const target = index.byId.get(cmd.targetId);
  if (!target || target.injury.dead) return;

  const funcA = deriveFunctionalState(attacker, tuning);
  const funcB = deriveFunctionalState(target, tuning);

  if (!funcA.canAct) return;

  // Phase 5: pain-induced action suppression (tactical/sim only)
  if (tuning.realism !== "arcade") {
    const painSeed = eventSeed(world.seed, world.tick, attacker.id, target.id, 0xA77A2);
    if (painBlocksAction(painSeed, attacker.injury.shock, attacker.attributes.resilience.distressTolerance)) return;
  }

  const wpn = findWeapon(attacker.loadout, cmd.weaponId);
  if (!wpn) return;

  const reach_m = wpn.reach_m ?? Math.trunc(attacker.attributes.morphology.stature_m * 0.45);
  const dx = target.position_m.x - attacker.position_m.x;
  const dy = target.position_m.y - attacker.position_m.y;
  const dz = target.position_m.z - attacker.position_m.z;

  // Phase 6: elevation differential adds to vertical separation in the reach check.
  const cellSizeA = ctx.cellSize_m ?? Math.trunc(4 * SCALE.m);
  const elevA = elevationAtPosition(ctx.elevationGrid, cellSizeA, attacker.position_m.x, attacker.position_m.y);
  const elevT = elevationAtPosition(ctx.elevationGrid, cellSizeA, target.position_m.x, target.position_m.y);
  const dzWithElev = dz + (elevT - elevA);

  const dist2 = BigInt(dx) * BigInt(dx) + BigInt(dy) * BigInt(dy) + BigInt(dzWithElev) * BigInt(dzWithElev);
  const reach2 = BigInt(reach_m) * BigInt(reach_m);
  if (dist2 > reach2) return;

  if (tuning.realism !== "arcade") {
    const blocked = isMeleeLaneOccludedByFriendly(
      attacker,
      target,
      index,
      spatial,
      { laneRadius_m: Math.trunc(0.35 * SCALE.m) }
    );
    if (blocked) return;
  }

  const dirToTarget = normaliseDirCheapQ({ x: dx, y: dy, z: dz });

  const readyTime_s = wpn.readyTime_s ?? to.s(0.6);
  // Phase 7: meleeCombat.hitTimingOffset_s shortens attack recovery (max 67% reduction)
  const attackerMeleeSkill = getSkill(attacker.skills, "meleeCombat");
  const effectiveReadyTime = Math.max(
    Math.trunc(readyTime_s / 3),
    readyTime_s + attackerMeleeSkill.hitTimingOffset_s,
  );
  attacker.action.attackCooldownTicks = Math.max(1, Math.trunc((effectiveReadyTime * TICK_HZ) / SCALE.s));

  // Phase 2B: deduct strike stamina cost (always — attacker expends effort whether hit or miss)
  const clampedIntensity = clampQ(cmd.intensity ?? q(1.0), q(0.1), q(1.0));
  attacker.energy.reserveEnergy_J = Math.max(
    0,
    attacker.energy.reserveEnergy_J - strikeCost_J(attacker, clampedIntensity)
  );

  const attackSkillBase = clampQ(qMul(attacker.attributes.control.controlQuality, attacker.attributes.control.fineControl), q(0.05), q(0.99));
  let attackSkill = clampQ(qMul(attackSkillBase, qMul(funcA.coordinationMul, funcA.manipulationMul)), q(0.01), q(0.99));
  const defenceSkillBase = clampQ(qMul(target.attributes.control.controlQuality, target.attributes.control.stability), q(0.05), q(0.99));
  let defenceSkill = clampQ(qMul(defenceSkillBase, qMul(funcB.coordinationMul, funcB.mobilityMul)), q(0.01), q(0.99));
  const geomDot = dotDirQ(attacker.action.facingDirQ, dirToTarget);

  // Phase 2C: reach dominance — short weapon penalised vs longer weapon in open combat.
  // Does not apply when attacker is grappling target (close contact negates reach), or target is prone.
  const grappling = attacker.grapple.holdingTargetId === target.id;
  if (tuning.realism !== "arcade" && !target.condition.prone && !grappling) {
    const tgtWpn = findWeapon(target.loadout);
    if (tgtWpn) {
      const tgtReach_m = tgtWpn.reach_m ?? Math.trunc(target.attributes.morphology.stature_m * 0.45);
      attackSkill = clampQ(qMul(attackSkill, reachDomPenaltyQ(reach_m, tgtReach_m)), q(0.01), q(0.99));
    }
  }

  // Phase 6: elevation advantage — higher ground boosts attack skill (tactical/sim only).
  // Threshold is 0.5 m so the effect is achievable at practical melee ranges.
  if (tuning.realism !== "arcade") {
    const elevDiff = elevA - elevT; // positive = attacker is higher
    if (elevDiff > to.m(0.5)) {
      // +5% per metre above 0.5 m threshold, capped at +10%
      const bonus = clampQ(mulDiv(elevDiff - to.m(0.5), q(0.05), to.m(1)), q(0), q(0.10));
      attackSkill = clampQ(qMul(attackSkill, (SCALE.Q + bonus) as Q), q(0.01), q(0.99));
    }
  }

  // Phase 7: meleeDefence skill boosts effective defence quality (parry/block technique)
  const defMeleeSkill = getSkill(target.skills, "meleeDefence");
  defenceSkill = clampQ(qMul(defenceSkill, defMeleeSkill.energyTransferMul), q(0.01), q(0.99));

  // Phase 2C: weapon bind also prevents the defender from parrying/blocking with their weapon
  const defenceModeEffective = target.action.weaponBindPartnerId !== 0
    ? ("none" as const)
    : target.intent.defence.mode;
  let defenceIntensityEffective = target.action.weaponBindPartnerId !== 0
    ? q(0)
    : target.intent.defence.intensity;

  // Phase 7: shieldCraft boosts effective defence skill when actively blocking with a shield
  if (defenceModeEffective === "block") {
    const tgtShield = findShield(target.loadout);
    if (tgtShield) {
      const shieldSkill = getSkill(target.skills, "shieldCraft");
      defenceSkill = clampQ(qMul(defenceSkill, shieldSkill.energyTransferMul), q(0.01), q(0.99));
    }
  }

  // Phase 4: surprise mechanics — if the defender cannot perceive the attacker,
  // their defensive response is reduced or eliminated.
  if (tuning.realism !== "arcade") {
    const sEnv = (world as any).__sensoryEnv as SensoryEnvironment | undefined ?? DEFAULT_SENSORY_ENV;
    const detectionQ = canDetect(target, attacker, sEnv);
    if (detectionQ <= 0) {
      // Full surprise: defender has no defence
      defenceIntensityEffective = q(0);
      // Phase 5: fear spike from being attacked without warning
      target.condition.fearQ = clampQ(target.condition.fearQ + FEAR_SURPRISE, 0, SCALE.Q);
    } else if (detectionQ < q(0.8)) {
      // Partial surprise: scale defence intensity by detection quality
      defenceIntensityEffective = qMul(defenceIntensityEffective, detectionQ);
    }
  }

  // Phase 2C: reach dominance on defence — parrying with a shorter weapon is harder.
  if (tuning.realism !== "arcade" && defenceModeEffective === "parry" && !grappling) {
    const defWpnReach = findWeapon(target.loadout);
    if (defWpnReach) {
      const defReach = defWpnReach.reach_m ?? Math.trunc(target.attributes.morphology.stature_m * 0.45);
      defenceSkill = clampQ(qMul(defenceSkill, reachDomPenaltyQ(defReach, reach_m)), q(0.01), q(0.99));
    }
  }

  const seed = eventSeed(world.seed, world.tick, attacker.id, target.id, 0xA11AC);
  const res = resolveHit(seed, attackSkill, defenceSkill, geomDot, defenceModeEffective, defenceIntensityEffective);
  const defenderBlocking = (target.intent.defence.mode === "block"); // or cmd-derived if you do that elsewhere
  const shield = findShield(target.loadout);
  const shieldBlocked =
    res.hit &&
    res.blocked &&
    defenderBlocking &&
    !!shield &&
    shieldCovers(shield, res.area);

  trace.onEvent({
    kind: TraceKinds.AttackAttempt,
    tick: world.tick,
    attackerId: attacker.id,
    targetId: target.id,
    hit: res.hit,
    blocked: res.blocked,
    parried: res.parried,
    hitQuality: res.hitQuality,
    area: res.area,
  });

  if (!res.hit) {
    // Phase 2C: miss recovery — extend cooldown by weapon angular momentum, scaled by swing intensity.
    // A full-power swing that misses leaves the attacker more committed than a light probe.
    attacker.action.attackCooldownTicks += Math.trunc(
      mulDiv(missRecoveryTicks(wpn), clampedIntensity, SCALE.Q)
    );
    return;
  }

  const sideBit = (eventSeed(world.seed, world.tick, attacker.id, target.id, 0x51DE) & 1) as 0 | 1;
  // Phase 8: use body plan's kinetic exposure weights when available
  const region: string = target.bodyPlan
    ? resolveHitSegment(target.bodyPlan, ((eventSeed(world.seed, world.tick, attacker.id, target.id, 0x51DE) >>> 8) % SCALE.Q) as Q)
    : regionFromHit(res.area, sideBit);


  const baseIntensity = clampQ(cmd.intensity ?? q(1.0), q(0.1), q(1.0));
  const handling = wpn.handlingMul ?? q(1.0);

  const handlingPenalty = clampQ(
    q(1.0) - qMul(q(0.18), (handling - SCALE.Q) as any),
    q(0.70),
    q(1.0)
  );

  const intensity = clampQ(
    qMul(baseIntensity, qMul(funcA.manipulationMul, handlingPenalty)),
    q(0.1),
    q(1.0)
  );

  const P = attacker.attributes.performance.peakPower_W;
  const base = clampI32(Math.trunc((P * SCALE.mps) / 200), Math.trunc(2 * SCALE.mps), Math.trunc(12 * SCALE.mps));

  const wMul = wpn.strikeSpeedMul ?? q(1.0);
  const cMul = attacker.attributes.control.controlQuality;
  const qualMul = q(0.70) + qMul(res.hitQuality, q(0.30));

  const vStrike = mulDiv(
    mulDiv(
      mulDiv(
        mulDiv(base, wMul, SCALE.Q),
        cMul,
        SCALE.Q
      ),
      intensity,
      SCALE.Q
    ),
    qualMul,
    SCALE.Q
  );

  const vStrikeVec = scaleDirToSpeed(dirToTarget, vStrike);

  // Clamp body-movement contribution to strike energy. Combatants decelerate before a controlled
  // swing; pure sprint-on-sprint kinetic energy should not dominate. Cap at 2 m/s relative.
  const APPROACH_CAP: I32 = Math.trunc(2.0 * SCALE.mps);
  const bodyRelX = clampI32(attacker.velocity_mps.x - target.velocity_mps.x, -APPROACH_CAP, APPROACH_CAP);
  const bodyRelY = clampI32(attacker.velocity_mps.y - target.velocity_mps.y, -APPROACH_CAP, APPROACH_CAP);
  const bodyRelZ = clampI32(attacker.velocity_mps.z - target.velocity_mps.z, -APPROACH_CAP, APPROACH_CAP);

  const rel = {
    x: bodyRelX + vStrikeVec.x,
    y: bodyRelY + vStrikeVec.y,
    z: bodyRelZ + vStrikeVec.z,
  };

  // Phase 2C: two-handed leverage bonus — only when both arms are functional and no off-hand item
  const hasOffHand = attacker.loadout.items.some(it => it.kind === "shield") ||
    attacker.loadout.items.filter(it => it.kind === "weapon").length > 1;
  const twoHandBonus = twoHandedAttackBonusQ(wpn, funcA.leftArmDisabled, funcA.rightArmDisabled, hasOffHand);
  const baseEnergy_J = mulDiv(
    mulDiv((impactEnergy_J(attacker, wpn, rel)) as any, funcA.manipulationMul as any, SCALE.Q),
    twoHandBonus,
    SCALE.Q,
  );
  // Phase 7: meleeCombat.energyTransferMul boosts strike energy delivery (technique bonus)
  // Phase 11: exoskeleton force multiplier amplifies strike energy
  const attackerExo = findExoskeleton(attacker.loadout);
  const exoForceMul: Q = attackerExo ? attackerExo.forceMultiplier : SCALE.Q as Q;
  const energy_J = mulDiv(mulDiv(baseEnergy_J, attackerMeleeSkill.energyTransferMul, SCALE.Q), exoForceMul, SCALE.Q);

  let mitigated = energy_J;

  if (res.blocked || res.parried) {
    // Phase 2B: deduct defence stamina cost from the defender
    target.energy.reserveEnergy_J = Math.max(
      0,
      target.energy.reserveEnergy_J - defenceCost_J(target)
    );

    const leverage = parryLeverageQ(wpn, attacker);
    const handed = (wpn.handedness ?? "oneHand") === "twoHand" ? q(1.10) : q(1.0);
    const defenceMul = qMul(leverage, handed);

    if (res.blocked) {
      const m = clampQ(
        q(0.40) - qMul(q(0.12), (defenceMul - SCALE.Q) as any),
        q(0.25),
        q(0.60)
      );
      mitigated = mulDiv(mitigated, m, SCALE.Q);
    }

    if (res.parried) {
      const m = clampQ(
        q(0.25) - qMul(q(0.15), (defenceMul - SCALE.Q) as any),
        q(0.10),
        q(0.45)
      );
      mitigated = mulDiv(mitigated, m, SCALE.Q);

      // Phase 2C: weapon bind on parry — weapons may lock, requiring both to disengage
      if (tuning.realism !== "arcade"
        && attacker.action.weaponBindPartnerId === 0
        && target.action.weaponBindPartnerId === 0) {
        const defWpn = findWeapon(target.loadout);
        if (defWpn) {
          const bindSeed = eventSeed(world.seed, world.tick, attacker.id, target.id, 0xB1DE);
          const bindRoll = (bindSeed % SCALE.Q) as Q;
          const bChanceBase = bindChanceQ(wpn, defWpn);
          // Phase 2C improvement #4: fatigue increases bind chance — tired fighters lose weapon control
          const avgFatigue = ((attacker.energy.fatigue + target.energy.fatigue) >>> 1) as Q;
          const fatigueMod = (SCALE.Q + qMul(avgFatigue, q(0.20))) as Q;  // 1.0..1.20
          const bChance = clampQ(qMul(bChanceBase, fatigueMod), q(0), q(0.45));
          if (bindRoll < bChance) {
            const dur = bindDurationTicks(wpn, defWpn);
            attacker.action.weaponBindPartnerId = target.id;
            attacker.action.weaponBindTicks = dur;
            target.action.weaponBindPartnerId = attacker.id;
            target.action.weaponBindTicks = dur;
            trace.onEvent({
              kind: TraceKinds.WeaponBind,
              tick: world.tick,
              attackerId: attacker.id,
              targetId: target.id,
              durationTicks: dur,
            });
          }
        }
      }
    }

    if (res.shieldBlocked) {
      const m = clampQ(
        q(0.35) - qMul(q(0.10), (defenceMul - SCALE.Q) as any),
        q(0.20),
        q(0.55)
      );
      mitigated = mulDiv(mitigated, m, SCALE.Q);
    }
  }

  const armour = deriveArmourProfile(target.loadout);
  const KINETIC_MASK = 1 << DamageChannel.Kinetic;
  const armourHit = armourCoversHit(world, (armour.coverageByRegion as any)[region] ?? q(0), attacker.id, target.id);
  const protectedByArmour = armourHit && ((armour.protects & KINETIC_MASK) !== 0);

  const finalEnergy = protectedByArmour
    ? applyKineticArmourPenetration(mitigated, armour.resist_J, armour.protectedDamageMul)
    : mitigated;

  impacts.push({
    kind: "impact",
    attackerId: attacker.id,
    targetId: target.id,
    region,
    energy_J: finalEnergy,
    protectedByArmour,
    weaponId: wpn.id,
    wpn,
    blocked: res.blocked,
    parried: res.parried,
    hitQuality: clampQ(res.hitQuality, q(0.05), q(1.0)),
    shieldBlocked,
  });
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
  const target = index.byId.get(c.targetId);
  if (!target || target.injury.dead) return;

  const mode = c.mode ?? "grapple";

  if (mode === "grapple") {
    if (e.grapple.holdingTargetId === 0 || e.grapple.holdingTargetId !== c.targetId) {
      // Attempt new grapple
      resolveGrappleAttempt(world, e, target, c.intensity, tuning, impacts, trace);
    } else {
      // Already holding — tick trace (stepGrappleTick handles maintenance)
      trace.onEvent({
        kind: TraceKinds.Grapple,
        tick: world.tick, attackerId: e.id, targetId: target.id,
        phase: "tick", strengthQ: e.grapple.gripQ,
      });
    }
  } else if (mode === "throw") {
    resolveGrappleThrow(world, e, target, c.intensity, tuning, impacts, trace);
  } else if (mode === "choke") {
    resolveGrappleChoke(e, target, c.intensity, tuning);
  } else if (mode === "jointLock") {
    resolveGrappleJointLock(world, e, target, c.intensity, tuning, impacts);
  }
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
  if (e.action.weaponBindPartnerId === 0) return;  // not bound

  const partner = index.byId.get(e.action.weaponBindPartnerId);
  if (!partner || partner.injury.dead) {
    // Partner gone — trivially clear
    e.action.weaponBindPartnerId = 0;
    e.action.weaponBindTicks = 0;
    return;
  }

  const breakerWpn = findWeapon(e.loadout);
  const holderWpn  = findWeapon(partner.loadout);
  const breakerArm = breakerWpn?.momentArm_m ?? Math.trunc(0.55 * SCALE.m);
  const holderArm  = holderWpn?.momentArm_m  ?? Math.trunc(0.55 * SCALE.m);

  // Win probability, scaled by command intensity (half-hearted attempt is less likely to succeed)
  const baseWinQ = breakBindContestQ(
    e.attributes.performance.peakForce_N,
    partner.attributes.performance.peakForce_N,
    breakerArm,
    holderArm,
  );
  const winQ = clampQ(qMul(baseWinQ, intensity), q(0.05), q(0.95));

  const breakSeed = eventSeed(world.seed, world.tick, e.id, partner.id, 0xBB1D);
  const breakRoll = (breakSeed % SCALE.Q) as Q;

  if (breakRoll < winQ) {
    // Success: clear bind for both; loser takes a brief stun
    partner.condition.stunned = clampQ(partner.condition.stunned + q(0.05), 0, SCALE.Q);

    e.action.weaponBindPartnerId = 0;
    e.action.weaponBindTicks = 0;
    partner.action.weaponBindPartnerId = 0;
    partner.action.weaponBindTicks = 0;

    trace.onEvent({
      kind: TraceKinds.WeaponBindBreak,
      tick: world.tick,
      entityId: e.id,
      partnerId: partner.id,
      reason: "forced",
    });
  }
  // On failure: bind persists; no trace (silence is the signal)
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
  if (shooter.action.shootCooldownTicks > 0) return;

  const wpn = findRangedWeapon(shooter.loadout, cmd.weaponId);
  if (!wpn) return;

  const target = index.byId.get(cmd.targetId);
  if (!target || target.injury.dead) return;

  const funcA = deriveFunctionalState(shooter, tuning);
  if (!funcA.canAct) return;

  // 3D range (SCALE.m units); Phase 6: elevation differential lengthens the flight path.
  const dx = BigInt(target.position_m.x - shooter.position_m.x);
  const dy = BigInt(target.position_m.y - shooter.position_m.y);
  const cellSizeRS = ctx.cellSize_m ?? Math.trunc(4 * SCALE.m);
  const elevSh = elevationAtPosition(ctx.elevationGrid, cellSizeRS, shooter.position_m.x, shooter.position_m.y);
  const elevTg = elevationAtPosition(ctx.elevationGrid, cellSizeRS, target.position_m.x, target.position_m.y);
  const dz = BigInt(target.position_m.z - shooter.position_m.z + (elevTg - elevSh));
  const dist_m = Number(isqrtBig(dx * dx + dy * dy + dz * dz));

  const intensity = clampQ(cmd.intensity ?? q(1.0), q(0.1), q(1.0));

  // Determine launch energy
  // Phase 7: throwingWeapons.energyTransferMul boosts thrown weapon launch energy
  const launchEnergy = wpn.category === "thrown"
    ? mulDiv(
        thrownLaunchEnergy_J(shooter.attributes.performance.peakPower_W),
        getSkill(shooter.skills, "throwingWeapons").energyTransferMul,
        SCALE.Q,
      )
    : wpn.launchEnergy_J;

  // Energy at impact after drag
  const energy_J = energyAtRange_J(launchEnergy, wpn.dragCoeff_perM, dist_m);

  // Shooter's aim quality
  const ctrl = shooter.attributes.control;
  const adjDisp = adjustedDispersionQ(
    wpn.dispersionQ,
    ctrl.controlQuality,
    ctrl.fineControl,
    shooter.energy.fatigue,
    intensity,
  );
  // Phase 7: rangedCombat.dispersionMul reduces effective dispersion (tighter grouping)
  const rangedSkill = getSkill(shooter.skills, "rangedCombat");
  const skillAdjDisp = qMul(adjDisp, rangedSkill.dispersionMul);
  const gRadius_m = groupingRadius_m(skillAdjDisp, dist_m);

  // Body half-width: ~20% of stature (≈0.35m for 1.75m human).
  // Phase 6: cover fraction reduces effective target width → harder to hit.
  const rawHalfWidth_m = mulDiv(shooter.attributes.morphology.stature_m, 2000, SCALE.Q);
  const cover = ctx.obstacleGrid
    ? coverFractionAtPosition(ctx.obstacleGrid, cellSizeRS, target.position_m.x, target.position_m.y)
    : 0;
  const bodyHalfWidth_m = cover > 0
    ? mulDiv(rawHalfWidth_m, Math.max(0, SCALE.Q - cover), SCALE.Q)
    : rawHalfWidth_m;

  // Deterministic hit roll (salt 0xD15A)
  const dispSeed = eventSeed(world.seed, world.tick, shooter.id, target.id, 0xD15A);
  const errorMag_m = gRadius_m > 0
    ? mulDiv(dispSeed % SCALE.Q, gRadius_m, SCALE.Q)
    : 0;

  const hit = errorMag_m <= bodyHalfWidth_m;
  const suppressed = !hit && errorMag_m <= bodyHalfWidth_m * 3;

  // Deduct stamina and set reload cooldown regardless of hit
  shooter.energy.reserveEnergy_J = Math.max(
    0,
    shooter.energy.reserveEnergy_J - shootCost_J(wpn, intensity, shooter.attributes.performance.peakPower_W),
  );
  shooter.action.shootCooldownTicks = recycleTicks(wpn, TICK_HZ);

  if (suppressed) {
    target.condition.suppressedTicks = Math.max(target.condition.suppressedTicks, 4);
  }

  let hitRegion: string | undefined;

  if (hit && energy_J > 0) {
    // Choose hit region — Phase 8: use body plan when available
    const sideSeed = eventSeed(world.seed, world.tick, shooter.id, target.id, 0xD15B);
    const areaSeed = eventSeed(world.seed, world.tick, shooter.id, target.id, 0xD15C);
    let hitArea: HitArea | undefined;
    if (target.bodyPlan) {
      hitRegion = resolveHitSegment(target.bodyPlan, ((areaSeed >>> 8) % SCALE.Q) as Q);
    } else {
      hitArea = chooseArea((areaSeed % SCALE.Q) as Q);
      const sideBit = (sideSeed & 1) as 0 | 1;
      hitRegion = regionFromHit(hitArea, sideBit);
    }

    // Shield interposition
    const shield = findShield(target.loadout);
    const shieldSeed = eventSeed(world.seed, world.tick, shooter.id, target.id, 0xD15D);
    const shieldHit = shield && hitArea && shieldCovers(shield, hitArea)
      && ((shieldSeed % SCALE.Q) < (shield as any).coverageQ);

    // Armour
    const armour = deriveArmourProfile(target.loadout);
    const KINETIC_MASK = 1 << DamageChannel.Kinetic;
    const armourHit = armourCoversHit(world, (armour.coverageByRegion as any)[hitRegion] ?? q(0), shooter.id, target.id);
    const protectedByArmour = armourHit && ((armour.protects & KINETIC_MASK) !== 0);

    let finalEnergy = energy_J;
    if (shieldHit) {
      const shieldResidual = Math.max(0, energy_J - (shield as any).blockResist_J);
      finalEnergy = mulDiv(shieldResidual, (shield as any).deflectQ ?? q(0.30), SCALE.Q);
    }
    if (protectedByArmour) {
      finalEnergy = applyKineticArmourPenetration(finalEnergy, armour.resist_J, armour.protectedDamageMul);
    }

    // Build a minimal Weapon proxy for applyImpactToInjury
    const wpnProxy: Weapon = {
      id: wpn.id,
      kind: "weapon",
      name: wpn.name,
      mass_kg: wpn.projectileMass_kg,
      bulk: q(0),
      damage: wpn.damage,
    };

    impacts.push({
      kind: "impact",
      attackerId: shooter.id,
      targetId: target.id,
      region: hitRegion,
      energy_J: finalEnergy,
      protectedByArmour,
      weaponId: wpn.id,
      wpn: wpnProxy,
      blocked: shieldHit ?? false,
      parried: false,
      hitQuality: q(0.75),
      shieldBlocked: shieldHit ?? false,
    });
  }

  trace.onEvent({
    kind: TraceKinds.ProjectileHit,
    tick: world.tick,
    shooterId: shooter.id,
    targetId: target.id,
    hit,
    ...(hitRegion !== undefined ? { region: hitRegion } : {}),
    distance_m: dist_m,
    energyAtImpact_J: energy_J,
    suppressed,
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

function armourCoversHit(world: WorldState, coverage: Q, aId: number, bId: number): boolean {
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

function applyImpactToInjury(target: Entity, wpn: Weapon, energy_J: number, region: string, armoured: boolean, trace: TraceSink, tick: number): void {
  if (energy_J <= 0) return;

  // Determine region role: head → CNS-critical; limb → structural-priority; torso → default
  let areaSurf = q(1.0), areaInt = q(1.0), areaStr = q(1.0);
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

  const SURF_J = 100;
  const INT_J = 160;
  const STR_J = 220;

  const energyQ = energy_J * SCALE.Q;
  const bias = wpn.damage.penetrationBias;

  const surfFrac = clampQ(wpn.damage.surfaceFrac - qMul(bias, q(0.12)), q(0.05), q(0.95));
  const intFrac = clampQ(wpn.damage.internalFrac + qMul(bias, q(0.12)), q(0.05), q(0.95));

  const surfInc = Math.min(SCALE.Q, mulDiv(Math.trunc(energyQ), qMul(qMul(surfFrac, areaSurf), armourShift), SURF_J * SCALE.Q));
  const intInc = Math.min(SCALE.Q, mulDiv(Math.trunc(energyQ), qMul(intFrac, areaInt), INT_J * SCALE.Q));
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

  const bleedBase = clampQ(((surfInc + intInc) >>> 1) as any, 0, SCALE.Q);
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

/* ------------------ Conditions -> injury (armour-aware) ------------------ */

function stepConditionsToInjury(world: WorldState, e: Entity, ambientTemperature_Q?: Q): void {
  const traitProfile = buildTraitProfile(e.traits);
  const armour = deriveArmourProfile(e.loadout);

  // Phase 8: use body plan segments when available; fall back to humanoid defaults.
  const planSegments = e.bodyPlan?.segments ?? null;

  // Exposure weights: "what tends to be exposed" for systemic hazards.
  const exposureWeights = (channel: DamageChannel): Record<string, Q> => {
    if (planSegments) {
      // Data-driven: per-segment per-channel weights from body plan
      const out: Record<string, Q> = {};
      for (const seg of planSegments) out[seg.id] = getExposureWeight(seg, channel);
      return out;
    }
    // Humanoid fallback
    switch (channel) {
      case DamageChannel.Thermal:
        // Fire: limbs tend to be exposed and catch/keep burning; torso often partly shielded.
        return {
          head: q(0.18),
          torso: q(0.28),
          leftArm: q(0.14),
          rightArm: q(0.14),
          leftLeg: q(0.13),
          rightLeg: q(0.13),
        };
      case DamageChannel.Chemical:
        // Chemical/corrosive aerosols: more even, but torso still prominent.
        // Note: condition.corrosiveExposure feeds this channel — Chemical and
        // Corrosive are unified here. DamageChannel.Corrosive is reserved for
        // future liquid-contact mechanics with a distinct distribution profile.
        return {
          head: q(0.16),
          torso: q(0.36),
          leftArm: q(0.12),
          rightArm: q(0.12),
          leftLeg: q(0.12),
          rightLeg: q(0.12),
        };
      case DamageChannel.Radiation:
        // Penetrating radiation: roughly proportional to mass (torso dominant).
        return {
          head: q(0.12),
          torso: q(0.52),
          leftArm: q(0.09),
          rightArm: q(0.09),
          leftLeg: q(0.09),
          rightLeg: q(0.09),
        };
      case DamageChannel.Electrical:
        // Conductive contact often through extremities.
        return {
          head: q(0.10),
          torso: q(0.22),
          leftArm: q(0.22),
          rightArm: q(0.22),
          leftLeg: q(0.12),
          rightLeg: q(0.12),
        };
      default:
        // Fallback: assume proportional to area.
        return DEFAULT_REGION_WEIGHTS as any;
    }
  };

  const applyDoseToRegion = (channel: DamageChannel, region: string, dose: Q): Q => {
    if (dose <= 0) return q(0);
    if ((traitProfile.immuneMask & (1 << channel)) !== 0) return q(0);

    let out = dose;
    if ((traitProfile.resistantMask & (1 << channel)) !== 0) out = Math.trunc(out / 2) as any;

    const cov = (armour.coverageByRegion as any)[region] ?? q(0);
    const armCovers = armourCoversHit(world, cov, e.id, (e.id ^ 0xBEEF) + (channel << 8) + regionSalt(region));
    if (armCovers && ((armour.protects & (1 << channel)) !== 0)) {
      const mul = armour.channelResistMul[channel] ?? q(1.0);

      // A simple "resist factor" curve; for non-kinetic we treat resist_J as a generalised protective capacity.
      const resistFactor = clampQ(
        q(1.0) - (mulDiv(Math.min(armour.resist_J, 800) * SCALE.Q, 1, 800) as any),
        q(0.20),
        q(1.0),
      );

      out = qMul(qMul(out, resistFactor), armour.protectedDamageMul);
      out = qMul(out, mul);
    }
    return out;
  };

  const distribute = (channel: DamageChannel, dose: Q): Record<string, Q> => {
    const w = exposureWeights(channel);
    const out: Record<string, Q> = {};
    const regionList = planSegments ? planSegments.map(s => s.id) : ALL_REGIONS as readonly string[];
    for (const r of regionList) out[r] = qMul(dose, w[r] ?? q(0));
    return out;
  };

  const fireBy = distribute(DamageChannel.Thermal, e.condition.onFire);
  const corrBy = distribute(DamageChannel.Chemical, e.condition.corrosiveExposure);
  const elecBy = distribute(DamageChannel.Electrical, e.condition.electricalOverload);
  const radBy = distribute(DamageChannel.Radiation, e.condition.radiation);

  // Suffocation is global rather than surface-localised.
  const suff = (() => {
    if ((traitProfile.immuneMask & (1 << DamageChannel.Suffocation)) !== 0) return q(0);
    let out = e.condition.suffocation;
    if ((traitProfile.resistantMask & (1 << DamageChannel.Suffocation)) !== 0) out = Math.trunc(out / 2) as any;

    // Simple: masks/helmets reduce suffocation slightly if they protect Suffocation.
    const armCovers = armourCoversHit(world, (armour.coverageByRegion as any)["head"] ?? q(0), e.id, e.id ^ 0x5AFF);
    if (armCovers && ((armour.protects & (1 << DamageChannel.Suffocation)) !== 0)) {
      out = qMul(out, armour.protectedDamageMul);
    }
    return out;
  })();

  const FIRE_SURFACE_PER_TICK = q(0.0020);
  const FIRE_SHOCK_PER_TICK = q(0.0010);
  const CORR_SURFACE_PER_TICK = q(0.0015);
  const CORR_INTERNAL_PER_TICK = q(0.0008);
  const SUFF_SHOCK_PER_TICK = q(0.0015);
  const ELEC_INTERNAL_PER_TICK = q(0.0010);
  const ELEC_STUNNED_RISE = q(0.0200);
  // Radiation: primary effect is internal cellular damage accumulating slowly.
  // Rate calibrated so continuous exposure at q(1.0) reaches ~50% internal
  // damage on the torso (highest-weight region) after ~250 ticks (12.5 s).
  const RAD_INTERNAL_PER_TICK = q(0.0008);
  const RAD_SHOCK_PER_TICK = q(0.0003);

  const allRegionIds = planSegments ? planSegments.map(s => s.id) : ALL_REGIONS as readonly string[];
  for (const r of allRegionIds) {
    const fire = applyDoseToRegion(DamageChannel.Thermal,    r, fireBy[r] ?? q(0));
    const corr = applyDoseToRegion(DamageChannel.Chemical,   r, corrBy[r] ?? q(0));
    const elec = applyDoseToRegion(DamageChannel.Electrical, r, elecBy[r] ?? q(0));
    const rad  = applyDoseToRegion(DamageChannel.Radiation,  r, radBy[r]  ?? q(0));

    const reg = e.injury.byRegion[r];
    if (!reg) continue;
    if (fire > 0) {
      reg.surfaceDamage = clampQ(reg.surfaceDamage + qMul(fire, FIRE_SURFACE_PER_TICK), 0, SCALE.Q);
      e.injury.shock = clampQ(e.injury.shock + qMul(fire, FIRE_SHOCK_PER_TICK), 0, SCALE.Q);
    }
    if (corr > 0) {
      reg.surfaceDamage = clampQ(reg.surfaceDamage + qMul(corr, CORR_SURFACE_PER_TICK), 0, SCALE.Q);
      reg.internalDamage = clampQ(reg.internalDamage + qMul(corr, CORR_INTERNAL_PER_TICK), 0, SCALE.Q);
    }
    if (elec > 0) {
      reg.internalDamage = clampQ(reg.internalDamage + qMul(elec, ELEC_INTERNAL_PER_TICK), 0, SCALE.Q);
      e.condition.stunned = clampQ(e.condition.stunned + qMul(elec, ELEC_STUNNED_RISE), 0, SCALE.Q);
    }
    if (rad > 0) {
      reg.internalDamage = clampQ(reg.internalDamage + qMul(rad, RAD_INTERNAL_PER_TICK), 0, SCALE.Q);
      e.injury.shock = clampQ(e.injury.shock + qMul(rad, RAD_SHOCK_PER_TICK), 0, SCALE.Q);
    }
  }

  if (suff > 0) {
    e.injury.shock = clampQ(e.injury.shock + qMul(suff, SUFF_SHOCK_PER_TICK), 0, SCALE.Q);
  }

  // Phase 10: ambient temperature stress
  if (ambientTemperature_Q !== undefined) {
    const COMFORT_HIGH: Q = q(0.65) as Q;
    const COMFORT_LOW:  Q = q(0.35) as Q;

    if (ambientTemperature_Q > COMFORT_HIGH) {
      // Heat stress: shock + mild surface damage; heatTolerance scales dose
      const excess = clampQ((ambientTemperature_Q - COMFORT_HIGH) as Q, q(0), q(1.0));
      const baseDose = qMul(excess, q(0.025));
      const heatTol  = Math.max(1, e.attributes.resilience.heatTolerance);
      const dose     = mulDiv(baseDose, SCALE.Q, heatTol);
      e.injury.shock = clampQ((e.injury.shock + dose) as Q, 0, SCALE.Q);
      const torsoReg = e.injury.byRegion["torso"] ?? Object.values(e.injury.byRegion)[0];
      if (torsoReg) {
        torsoReg.surfaceDamage = clampQ(
          (torsoReg.surfaceDamage + qMul(dose, q(0.20))) as Q, 0, SCALE.Q,
        );
      }
    } else if (ambientTemperature_Q < COMFORT_LOW) {
      // Cold stress: shock + fatigue; coldTolerance scales dose
      const deficit = clampQ((COMFORT_LOW - ambientTemperature_Q) as Q, q(0), q(1.0));
      const baseDose = qMul(deficit, q(0.020));
      const coldTol  = Math.max(1, e.attributes.resilience.coldTolerance);
      const dose     = mulDiv(baseDose, SCALE.Q, coldTol);
      e.injury.shock   = clampQ((e.injury.shock   + dose)                  as Q, 0, SCALE.Q);
      e.energy.fatigue = clampQ((e.energy.fatigue + qMul(dose, q(0.50)))   as Q, 0, SCALE.Q);
    }
  }
}

function regionSalt(region: string): number {
  // Well-known humanoid regions get stable salts; others use a hash of the id string.
  switch (region) {
    case "head":     return 0x11;
    case "torso":    return 0x22;
    case "leftArm":  return 0x33;
    case "rightArm": return 0x44;
    case "leftLeg":  return 0x55;
    case "rightLeg": return 0x66;
    default: {
      // Deterministic hash of the segment id (FNV-1a-like)
      let h = 0x77;
      for (let i = 0; i < region.length; i++) h = ((h ^ region.charCodeAt(i)) * 0x1f) & 0xFF;
      return h || 0x77;
    }
  }
}

function stepInjuryProgression(e: Entity, tick: number): void {
  if (e.injury.dead) return;

  // Phase 9: natural clotting — bleedingRate decays proportional to structural integrity.
  // Heavily damaged tissue clots slowly; intact tissue clots quickly.
  const CLOT_RATE_PER_TICK: Q = q(0.0002) as Q;
  const INFECTION_BLEED_THRESHOLD: Q = q(0.05) as Q;
  const INFECTION_INT_THRESHOLD: Q = q(0.10) as Q;
  const INFECTION_ONSET_TICKS = 100;
  const INFECTION_DAMAGE_PER_TICK: Q = q(0.0003) as Q;
  const PERMANENT_THRESHOLD: Q = q(0.90) as Q;
  const PERMANENT_FLOOR_MUL: Q = q(0.75) as Q;

  for (const reg of Object.values(e.injury.byRegion)) {
    // Clotting
    if (reg.bleedingRate > 0) {
      const structureIntegrity = clampQ((SCALE.Q - reg.structuralDamage) as Q, q(0), q(1.0));
      const clotRate = qMul(structureIntegrity, CLOT_RATE_PER_TICK);
      reg.bleedingRate = clampQ((reg.bleedingRate - clotRate) as Q, q(0), q(1.0));
    }

    // Infection timer — track consecutive ticks of active bleeding
    if (reg.bleedingRate > INFECTION_BLEED_THRESHOLD) {
      reg.bleedDuration_ticks++;
      if (reg.bleedDuration_ticks >= INFECTION_ONSET_TICKS
          && reg.internalDamage > INFECTION_INT_THRESHOLD
          && reg.infectedTick < 0) {
        reg.infectedTick = tick;
      }
    } else {
      reg.bleedDuration_ticks = Math.max(0, reg.bleedDuration_ticks - 1);
    }

    // Infection progression — infected regions accumulate internal damage
    if (reg.infectedTick >= 0) {
      reg.internalDamage = clampQ(reg.internalDamage + INFECTION_DAMAGE_PER_TICK, 0, SCALE.Q);
    }

    // Permanent damage floor update — set when structural damage is very high
    if (reg.structuralDamage >= PERMANENT_THRESHOLD) {
      const newFloor = qMul(reg.structuralDamage, PERMANENT_FLOOR_MUL);
      if (newFloor > reg.permanentDamage) reg.permanentDamage = newFloor as Q;
    }
  }

  // Phase 8B: hemolymph accumulation — breached open-fluid segments leak each tick
  if (e.bodyPlan) {
    for (const seg of e.bodyPlan.segments) {
      if (seg.fluidSystem !== "open" || seg.hemolymphLossRate === undefined) continue;
      const segState = e.injury.byRegion[seg.id];
      if (!segState) continue;
      const breachAt = seg.breachThreshold ?? q(0.8);
      if (segState.structuralDamage >= breachAt) {
        const loss = qMul(seg.hemolymphLossRate, segState.structuralDamage as Q);
        e.injury.hemolymphLoss = clampQ((e.injury.hemolymphLoss ?? 0) + loss, 0, SCALE.Q);
      }
    }
  }

  // Phase 8B: hemolymph fatal threshold — same as fluidLoss
  const FATAL_HEMOLYMPH: Q = q(0.80) as Q;
  if ((e.injury.hemolymphLoss ?? 0) >= FATAL_HEMOLYMPH) {
    e.injury.dead = true;
    e.injury.consciousness = q(0);
    e.velocity_mps = v3(0, 0, 0);
    return;
  }

  // Phase 8B: molting tick countdown and structural repair on completion
  if (e.molting?.active) {
    e.molting.ticksRemaining = Math.max(0, e.molting.ticksRemaining - 1);
    if (e.molting.ticksRemaining === 0) {
      e.molting.active = false;
      // Repair regeneratesViaMolting segments
      if (e.bodyPlan) {
        for (const seg of e.bodyPlan.segments) {
          if (!seg.regeneratesViaMolting) continue;
          const segState = e.injury.byRegion[seg.id];
          if (!segState) continue;
          segState.structuralDamage = clampQ(
            (segState.structuralDamage - q(0.10)) as Q, 0, SCALE.Q,
          );
        }
      }
    }
  }

  // Phase 8B: hemolymph clotting — passive decay of hemolymph loss each tick
  const HEMOLYMPH_CLOT_RATE: Q = q(0.0001) as Q;
  if ((e.injury.hemolymphLoss ?? 0) > 0) {
    e.injury.hemolymphLoss = clampQ(
      ((e.injury.hemolymphLoss ?? 0) - HEMOLYMPH_CLOT_RATE) as Q, 0, SCALE.Q,
    );
  }

  // Phase 8B: auto-molt trigger — fires when average structural damage on
  // regeneratesViaMolting segments reaches MOLT_TRIGGER_THRESHOLD and no molt
  // is already active. Post-molt repair (−q(0.10)) typically drops average below
  // threshold, preventing immediate re-trigger for minor damage; severely damaged
  // entities will re-molt until damage falls below the threshold.
  const MOLT_TRIGGER_THRESHOLD: Q = q(0.40) as Q;
  const MOLT_DURATION_TICKS = TICK_HZ * 60; // 60 seconds at TICK_HZ fps
  if (e.bodyPlan && !e.molting?.active) {
    const regenSegs = e.bodyPlan.segments.filter(s => s.regeneratesViaMolting);
    if (regenSegs.length > 0) {
      let totalDmg = 0;
      for (const seg of regenSegs) {
        totalDmg += e.injury.byRegion[seg.id]?.structuralDamage ?? 0;
      }
      const avgDmg = Math.trunc(totalDmg / regenSegs.length) as Q;
      if (avgDmg >= MOLT_TRIGGER_THRESHOLD) {
        e.molting = {
          active: true,
          ticksRemaining: MOLT_DURATION_TICKS,
          softeningSegments: regenSegs.map(s => s.id),
        };
      }
    }
  }

  // Phase 8B: wing passive regeneration — slow structural repair on wing segments
  // when not actively molting (molting repair is handled above on completion).
  const WING_REGEN_RATE: Q = q(0.0001) as Q;
  if (e.bodyPlan?.locomotion.flight && !e.molting?.active) {
    for (const wid of e.bodyPlan.locomotion.flight.wingSegments) {
      const ws = e.injury.byRegion[wid];
      if (ws && ws.structuralDamage > 0) {
        ws.structuralDamage = clampQ(
          (ws.structuralDamage - WING_REGEN_RATE) as Q, 0, SCALE.Q,
        );
      }
    }
  }

  const bleedRate = totalBleedingRate(e.injury);
  const rawBleedThisTick = Math.trunc((bleedRate * DT_S) / SCALE.s) as any;
  // Phase 7: medical.treatmentRateMul reduces fluid loss (passive wound management)
  const medSkill = getSkill(e.skills, "medical");
  const bleedThisTick = medSkill.treatmentRateMul > SCALE.Q
    ? mulDiv(rawBleedThisTick, SCALE.Q, medSkill.treatmentRateMul)
    : rawBleedThisTick;
  e.injury.fluidLoss = clampQ(e.injury.fluidLoss + bleedThisTick, 0, SCALE.Q);

  const SHOCK_FROM_FLUID = q(0.0040);
  const SHOCK_FROM_INTERNAL = q(0.0020);

  e.injury.shock = clampQ(
    e.injury.shock + qMul(e.injury.fluidLoss, SHOCK_FROM_FLUID) + qMul(e.injury.byRegion["torso"]?.internalDamage ?? q(0), SHOCK_FROM_INTERNAL),
    0,
    SCALE.Q
  );

  const CONSC_LOSS_FROM_SHOCK = q(0.0100);
  const CONSC_LOSS_FROM_SUFF = q(0.0200);

  const loss = clampQ(qMul(e.injury.shock, CONSC_LOSS_FROM_SHOCK) + qMul(e.condition.suffocation, CONSC_LOSS_FROM_SUFF) + qMul(regionKOFactor(e.injury), q(0.0100)), 0, SCALE.Q);
  e.injury.consciousness = clampQ(e.injury.consciousness - loss, 0, SCALE.Q);

  // Phase 9: explicit fatal fluid loss threshold (complements the shock path)
  const FATAL_FLUID_LOSS: Q = q(0.80) as Q;
  if (e.injury.fluidLoss >= FATAL_FLUID_LOSS || e.injury.shock >= SCALE.Q || e.injury.consciousness === 0) {
    e.injury.dead = true;
    e.injury.consciousness = q(0);
    e.velocity_mps = v3(0, 0, 0);
  }
}

/* ── Phase 5: morale step ─────────────────────────────────────────────────── */

/**
 * Per-entity morale update — accumulates fear from all sources and applies decay.
 * Emits a MoraleRoute trace event whenever the entity crosses the routing threshold.
 */
function stepMoraleForEntity(
  world: WorldState,
  e: Entity,
  index: WorldIndex,
  spatial: SpatialIndex,
  aliveBeforeTick: Set<number>,
  teamRoutingFrac: Map<number, number>,
  trace: TraceSink,
  ctx: KernelContext,
): void {
  if (e.injury.dead) return;

  const distressTol = e.attributes.resilience.distressTolerance;
  const MORALE_RADIUS_m = Math.trunc(30 * SCALE.m); // 30 m awareness radius

  const nearbyIds = queryNearbyIds(spatial, e.position_m, MORALE_RADIUS_m);

  let nearbyAllyCount = 0;
  let nearbyEnemyCount = 0;
  let allyDeathsThisTick = 0;

  for (const nId of nearbyIds) {
    if (nId === e.id) continue;
    const neighbor = index.byId.get(nId);
    if (!neighbor) continue;

    if (neighbor.teamId === e.teamId) {
      if (!neighbor.injury.dead) {
        nearbyAllyCount++;
      } else if (aliveBeforeTick.has(nId)) {
        allyDeathsThisTick++;
      }
    } else if (!neighbor.injury.dead) {
      nearbyEnemyCount++;
    }
  }

  const wasRouting = isRouting(e.condition.fearQ, distressTol);
  let fearQ = e.condition.fearQ;

  // 1. Suppression ticks add fear per tick
  if (e.condition.suppressedTicks > 0) {
    fearQ = clampQ(fearQ + FEAR_PER_SUPPRESSION_TICK, 0, SCALE.Q);
  }
  // 2. Ally deaths this tick
  if (allyDeathsThisTick > 0) {
    fearQ = clampQ(fearQ + allyDeathsThisTick * FEAR_FOR_ALLY_DEATH, 0, SCALE.Q);
  }
  // 3. Self-injury (shock accumulation) adds fear per tick
  fearQ = clampQ(fearQ + qMul(e.injury.shock, FEAR_INJURY_MUL), 0, SCALE.Q);
  // 4. Being outnumbered by visible enemies adds fear per tick
  // Include self in friendly count: entity + its allies vs enemies.
  if (nearbyEnemyCount > nearbyAllyCount + 1) {
    fearQ = clampQ(fearQ + FEAR_OUTNUMBERED, 0, SCALE.Q);
  }
  // 5. Routing cascade: more than half the team is already routing
  if ((teamRoutingFrac.get(e.teamId) ?? 0) > 0.50) {
    fearQ = clampQ(fearQ + FEAR_ROUTING_CASCADE, 0, SCALE.Q);
  }

  // Fear decay — faster with high tolerance and nearby allies (cohesion)
  fearQ = clampQ(fearQ - fearDecayPerTick(distressTol, nearbyAllyCount), 0, SCALE.Q);

  // Phase 6: cover provides a psychological safety bonus
  const moraleCellSize = ctx.cellSize_m ?? Math.trunc(4 * SCALE.m);
  const coverForMorale = ctx.obstacleGrid
    ? coverFractionAtPosition(ctx.obstacleGrid, moraleCellSize, e.position_m.x, e.position_m.y)
    : 0;
  if (coverForMorale > q(0.5)) {
    fearQ = clampQ(fearQ - q(0.01), 0, SCALE.Q);
  }

  e.condition.fearQ = fearQ;

  // Emit trace when routing state crosses threshold
  const nowRouting = isRouting(fearQ, distressTol);
  if (nowRouting !== wasRouting) {
    trace.onEvent({ kind: TraceKinds.MoraleRoute, tick: world.tick, entityId: e.id, fearQ });
  }
}

function applyHazardDamage(e: Entity, hazard: HazardCell): void {
  const torso = e.injury.byRegion["torso"];
  if (!torso) return;
  const intensity = hazard.intensity;
  if (hazard.type === "fire") {
    torso.surfaceDamage = clampQ(torso.surfaceDamage + qMul(intensity, q(0.003)), 0, SCALE.Q);
    e.injury.shock = clampQ(e.injury.shock + qMul(intensity, q(0.005)), 0, SCALE.Q);
  } else if (hazard.type === "radiation") {
    torso.internalDamage = clampQ(torso.internalDamage + qMul(intensity, q(0.004)), 0, SCALE.Q);
  } else if (hazard.type === "poison_gas") {
    torso.internalDamage = clampQ(torso.internalDamage + qMul(intensity, q(0.002)), 0, SCALE.Q);
    e.injury.consciousness = clampQ(e.injury.consciousness - qMul(intensity, q(0.003)), 0, SCALE.Q);
  }
}

/* ── Phase 10: pharmacokinetics ──────────────────────────────────────────── */

function stepSubstances(e: Entity): void {
  if (!e.substances || e.substances.length === 0) return;

  for (const active of e.substances) {
    const sub = active.substance;

    // Absorption: pendingDose → concentration
    const absorbed = qMul(active.pendingDose, sub.absorptionRate);
    active.pendingDose    = clampQ(active.pendingDose    - absorbed, q(0), q(1.0));
    active.concentration  = clampQ(active.concentration  + absorbed, q(0), q(1.0));

    // Elimination
    const eliminated = qMul(active.concentration, sub.eliminationRate);
    active.concentration  = clampQ(active.concentration  - eliminated, q(0), q(1.0));

    // Effects — only when above threshold
    if (active.concentration <= sub.effectThreshold) continue;

    const delta      = clampQ(active.concentration - sub.effectThreshold, q(0), q(1.0));
    const effectDose = qMul(delta, sub.effectStrength);

    switch (sub.effectType) {
      case "stimulant":
        // Reduces fear and slows fatigue accumulation
        e.condition.fearQ  = clampQ(e.condition.fearQ  - qMul(effectDose, q(0.005)), q(0), q(1.0));
        e.energy.fatigue   = clampQ(e.energy.fatigue   - qMul(effectDose, q(0.003)), q(0), q(1.0));
        break;
      case "anaesthetic":
        // Erodes consciousness
        e.injury.consciousness = clampQ(e.injury.consciousness - qMul(effectDose, q(0.008)), q(0), q(1.0));
        break;
      case "poison": {
        // Internal damage to torso (or first region)
        const torsoReg = e.injury.byRegion["torso"] ?? Object.values(e.injury.byRegion)[0];
        if (torsoReg) {
          torsoReg.internalDamage = clampQ(torsoReg.internalDamage + qMul(effectDose, q(0.002)), q(0), q(1.0));
        }
        e.injury.shock = clampQ(e.injury.shock + qMul(effectDose, q(0.001)), 0, SCALE.Q);
        break;
      }
      case "haemostatic":
        // Reduces bleeding rate across all regions
        for (const reg of Object.values(e.injury.byRegion)) {
          if (reg.bleedingRate > 0) {
            reg.bleedingRate = clampQ(reg.bleedingRate - qMul(effectDose, q(0.003)), q(0), q(1.0));
          }
        }
        break;
    }
  }

  // Remove exhausted substances (keep only those with meaningful dose or concentration)
  e.substances = e.substances.filter(a => a.pendingDose > 1 || a.concentration > 1);
}

/* ── Phase 10: fall damage ────────────────────────────────────────────────── */

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
    const primIds  = plan.segments.filter(s => s.locomotionRole === "primary").map(s => s.id);
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
        let fragRegion: string;
        if (e.bodyPlan) {
          fragRegion = resolveHitSegment(e.bodyPlan, fragRng.q01());
        } else {
          const area    = chooseArea(fragRng.q01());
          const sideBit = (fragRegSeed & 1) as 0 | 1;
          fragRegion    = regionFromHit(area, sideBit);
        }
        if (e.injury.byRegion[fragRegion]) {
          applyImpactToInjury(e, FRAG_WEAPON, fragKeJ, fragRegion, false, trace, tick);
          fragHits++;
        }
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
  if (treater.injury.dead) return;

  const target = index.byId.get(cmd.targetId);
  if (!target || target.injury.dead) return;

  // Treater must be within 2 m of target (physical contact required)
  const dx = target.position_m.x - treater.position_m.x;
  const dy = target.position_m.y - treater.position_m.y;
  const dist2 = dx * dx + dy * dy;
  const MAX_TREAT_DIST_m = Math.trunc(2 * SCALE.m);
  if (dist2 > MAX_TREAT_DIST_m * MAX_TREAT_DIST_m) return;

  // Check equipment tier meets minimum requirement
  const tierRank = TIER_RANK[cmd.tier];
  const actionMinRank = TIER_RANK[ACTION_MIN_TIER[cmd.action]];
  if (tierRank < actionMinRank) return;

  // Phase 11: technology gate — check if the tier's required capability is available
  const techReq = TIER_TECH_REQ[cmd.tier];
  if (techReq && ctx.techCtx && !ctx.techCtx.available.has(techReq)) return;

  const tierMul = TIER_MUL[cmd.tier];
  const medSkill = getSkill(treater.skills, "medical");
  // effectMul = tierMul × (treatmentRateMul / SCALE.Q)
  // treatmentRateMul at q(1.0) = SCALE.Q baseline gives exactly tierMul
  const effectMul: Q = mulDiv(tierMul, medSkill.treatmentRateMul, SCALE.Q) as Q;

  if (cmd.action === "tourniquet") {
    const reg = cmd.regionId ? target.injury.byRegion[cmd.regionId] : undefined;
    if (!reg) return;
    reg.bleedingRate = q(0);
    reg.bleedDuration_ticks = 0;
    // Slight shock from painful application
    target.injury.shock = clampQ(target.injury.shock + q(0.005), 0, SCALE.Q);

  } else if (cmd.action === "bandage") {
    const reg = cmd.regionId ? target.injury.byRegion[cmd.regionId] : undefined;
    if (!reg) return;
    const BASE_BANDAGE_RATE: Q = q(0.0050) as Q;
    const reduction = mulDiv(BASE_BANDAGE_RATE, effectMul, SCALE.Q);
    reg.bleedingRate = clampQ((reg.bleedingRate - reduction) as Q, q(0), q(1.0));

  } else if (cmd.action === "surgery") {
    const reg = cmd.regionId ? target.injury.byRegion[cmd.regionId] : undefined;
    if (!reg) return;
    const BASE_SURGERY_RATE: Q = q(0.0020) as Q;
    const BASE_BANDAGE_RATE: Q = q(0.0050) as Q;
    const strReduction = mulDiv(BASE_SURGERY_RATE, effectMul, SCALE.Q);
    const newStr = clampQ(
      (reg.structuralDamage - strReduction) as Q,
      reg.permanentDamage,  // cannot heal below permanent floor
      SCALE.Q,
    );
    reg.structuralDamage = newStr as Q;
    // Surgery also stops active bleeding
    const bleedReduction = mulDiv(BASE_BANDAGE_RATE, effectMul, SCALE.Q);
    reg.bleedingRate = clampQ((reg.bleedingRate - bleedReduction) as Q, q(0), q(1.0));
    // Clear fracture if structural drops below threshold
    if (reg.fractured && reg.structuralDamage < FRACTURE_THRESHOLD) {
      reg.fractured = false;
    }
    // Clear infection at surgicalKit tier or above
    if (reg.infectedTick >= 0 && tierRank >= TIER_RANK["surgicalKit"]) {
      reg.infectedTick = -1;
    }

  } else if (cmd.action === "fluidReplacement") {
    const BASE_FLUID_RATE: Q = q(0.0050) as Q;
    const recovery = mulDiv(BASE_FLUID_RATE, effectMul, SCALE.Q);
    target.injury.fluidLoss = clampQ((target.injury.fluidLoss - recovery) as Q, q(0), SCALE.Q);
    // Fluid restoration also reduces shock slightly
    target.injury.shock = clampQ((target.injury.shock - q(0.002)) as Q, q(0), SCALE.Q);
  }

  trace.onEvent({
    kind: TraceKinds.TreatmentApplied,
    tick: world.tick,
    treaterId: treater.id,
    targetId: target.id,
    action: cmd.action,
    ...(cmd.regionId !== undefined ? { regionId: cmd.regionId } : {}),
  });
}

function stepHazardEffects(entities: Entity[], grid: HazardGrid, cellSize_m: I32): void {
  const cs = Math.max(1, cellSize_m);
  for (const e of entities) {
    if (e.injury.dead) continue;
    const cx = Math.trunc(e.position_m.x / cs);
    const cy = Math.trunc(e.position_m.y / cs);
    const key = terrainKey(cx, cy);
    const hazard = grid.get(key);
    if (!hazard) continue;
    if (hazard.intensity > 0) {
      applyHazardDamage(e, hazard);
    }
    if (hazard.duration_ticks > 0) {
      hazard.duration_ticks -= 1;
      if (hazard.duration_ticks === 0) {
        grid.delete(key);
      }
    }
  }
}

function stepEnergy(e: Entity, ctx: KernelContext): void {
  const BASE_IDLE_W = 80;

  const speedAbs = Math.max(Math.abs(e.velocity_mps.x), Math.abs(e.velocity_mps.y), Math.abs(e.velocity_mps.z));
  const moving = speedAbs > Math.trunc(0.05 * SCALE.mps);

  // Phase 11: powered exoskeleton adds continuous power draw to metabolic demand
  const exoForEnergy = findExoskeleton(e.loadout);

  // Phase 8B: flight increases stamina demand when entity is airborne
  const flightSpecE = e.bodyPlan?.locomotion.flight;
  const isFlying = flightSpecE !== undefined && e.attributes.morphology.mass_kg <= flightSpecE.liftCapacity_kg;
  const flightDemandMul: Q = (isFlying && moving) ? flightSpecE!.flightStaminaCost : SCALE.Q as Q;

  const baseDemand = (moving ? 250 : BASE_IDLE_W) + (exoForEnergy ? exoForEnergy.powerDrain_W : 0);
  const demand = mulDiv(baseDemand, flightDemandMul, SCALE.Q);

  const fatigueBefore = e.energy.fatigue;
  stepEnergyAndFatigue(e.attributes, e.energy, e.loadout, demand, DT_S, { tractionCoeff: ctx.tractionCoeff });

  // Phase 7: athleticism.fatigueRateMul reduces fatigue accumulation each tick
  const fatigueDelta = e.energy.fatigue - fatigueBefore;
  if (fatigueDelta > 0) {
    const athSkill = getSkill(e.skills, "athleticism");
    if (athSkill.fatigueRateMul < SCALE.Q) {
      e.energy.fatigue = clampQ(
        (fatigueBefore + qMul(fatigueDelta as Q, athSkill.fatigueRateMul)) as Q,
        0, SCALE.Q,
      );
    }
  }

  if (!moving && e.injury.shock < q(0.4)) {
    e.energy.fatigue = clampQ(e.energy.fatigue - q(0.0020), 0, SCALE.Q);
  }
}