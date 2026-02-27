import type { WorldState } from "./world.js";
import type { Entity } from "./entity.js";
import type { CommandMap, Command, AttackCommand, GrappleCommand, BreakGrappleCommand, BreakBindCommand, ShootCommand, TreatCommand, ActivateCommand } from "./commands.js";
import type { CapabilityEffect, EffectPayload, FieldEffect } from "./capability.js";
import type { KernelContext } from "./context.js";

import { SCALE, q, clampQ, qMul, mulDiv, to, type Q, type I32 } from "../units.js";
import { DamageChannel } from "../channels.js";
import { deriveArmourProfile, findWeapon, findShield, findRangedWeapon, findExoskeleton, findSensor, type Weapon, type RangedWeapon } from "../equipment.js";

import { isCapabilityAvailable } from "./tech.js";
import { deriveFunctionalState } from "./impairment.js";
import { TUNING, type SimulationTuning } from "./tuning.js";
import { type Vec3, v3, vSub, vAdd } from "./vec3.js";
import { defaultIntent } from "./intent.js";
import { defaultAction } from "./action.js";
import { resolveHit, shieldCovers, chooseArea, type HitArea } from "./combat.js";
import { normaliseDirCheapQ, dotDirQ } from "./vec3.js";
import { eventSeed } from "./seeds.js";
import { regionFromHit } from "./body.js";
import { resolveHitSegment } from "./bodyplan.js";
import { FRACTURE_THRESHOLD } from "./injury.js";
import { TIER_RANK, TIER_MUL, ACTION_MIN_TIER, TIER_TECH_REQ } from "./medical.js";
import { type BlastSpec, blastEnergyFracQ, fragmentsExpected, fragmentKineticEnergy } from "./explosion.js";

import { makeRng } from "../rng.js";
import { WorldIndex, buildWorldIndex } from "./indexing.js";
import { buildSpatialIndex, type SpatialIndex } from "./spatial.js";
import { type ImpactEvent, sortEventsDeterministic } from "./events.js";

import { parryLeverageQ } from "./combat.js";

import { pickNearestEnemyInReach } from "./formation.js";
import { isMeleeLaneOccludedByFriendly } from "./occlusion.js";
import { applyFrontageCap } from "./frontage.js";

import { computeDensityField } from "./density.js";
import { coverFractionAtPosition, elevationAtPosition } from "./terrain.js";

import { type TraceSink, nullTrace } from "./trace.js";
import { TraceKinds } from "./kinds.js";
import { type SensoryEnvironment, DEFAULT_SENSORY_ENV, DEFAULT_PERCEPTION, canDetect } from "./sensory.js";
import { FEAR_SURPRISE, isRouting, painBlocksAction } from "./morale.js";

import { stepPushAndRepulsion } from "./step/push.js";
import { stepMoraleForEntity } from "./step/morale.js";
import { applyHazardDamage } from "./step/hazards.js";
import { stepSubstances } from "./step/substances.js";
import { stepEnergy } from "./step/energy.js";
import { stepConcentration } from "./step/concentration.js";
import { stepConditionsToInjury, stepInjuryProgression } from "./step/injury.js";
import { stepCapabilitySources } from "./step/capability.js";
import { stepMovement } from "./step/movement.js";
import { stepChainEffects, stepFieldEffects, stepHazardEffects } from "./step/effects.js";

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

// Phase 2 extension: swing momentum carry
const SWING_MOMENTUM_DECAY = q(0.95) as Q;  // 5% decay per tick
const SWING_MOMENTUM_MAX   = q(0.12) as Q;  // max +12% energy bonus at full momentum

// Phase 3 extension: aiming time
const AIM_MAX_TICKS        = 20;            // 1 second at 20 ticks/s
const AIM_MIN_MUL          = q(0.50) as Q;  // half dispersion at full aim
const AIM_STILL_THRESHOLD  = 5_000;         // 0.5 m/s in SCALE.mps units




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
    // Phase 2 extension: swing momentum
    if ((e as any).action.swingMomentumQ === undefined) (e as any).action.swingMomentumQ = 0;
    // Phase 3 extension: aiming time
    if ((e as any).action.aimTicks === undefined) (e as any).action.aimTicks = 0;
    if ((e as any).action.aimTargetId === undefined) (e as any).action.aimTargetId = 0;
    // Phase 4: perception defaults and decision latency
    if (!(e.attributes as any).perception) (e.attributes as any).perception = DEFAULT_PERCEPTION;
    if (!e.ai) e.ai = { focusTargetId: 0, retargetCooldownTicks: 0, decisionCooldownTicks: 0 };
    else if ((e.ai as any).decisionCooldownTicks === undefined) (e.ai as any).decisionCooldownTicks = 0;
    // Phase 5: fear / morale
    if ((e.condition as any).fearQ === undefined) (e.condition as any).fearQ = q(0);
    // Phase 5 extensions: morale features
    if ((e.condition as any).suppressionFearMul === undefined) (e.condition as any).suppressionFearMul = SCALE.Q;
    if ((e.condition as any).recentAllyDeaths === undefined) (e.condition as any).recentAllyDeaths = 0;
    if ((e.condition as any).lastAllyDeathTick === undefined) (e.condition as any).lastAllyDeathTick = -1;
    if ((e.condition as any).surrendered === undefined) (e.condition as any).surrendered = false;
    if ((e.condition as any).rallyCooldownTicks === undefined) (e.condition as any).rallyCooldownTicks = 0;
    // Phase 10C: flash blindness
    if ((e.condition as any).blindTicks === undefined) (e.condition as any).blindTicks = 0;
    // Phase 9: new RegionInjury fields (default for entities created pre-Phase-9)
    if ((e.injury as any).hemolymphLoss === undefined) (e.injury as any).hemolymphLoss = q(0);
    for (const reg of Object.values(e.injury.byRegion)) {
      if ((reg as any).fractured === undefined)         (reg as any).fractured = false;
      if ((reg as any).infectedTick === undefined)      (reg as any).infectedTick = -1;
      if ((reg as any).bleedDuration_ticks === undefined) (reg as any).bleedDuration_ticks = 0;
      if ((reg as any).permanentDamage === undefined)   (reg as any).permanentDamage = q(0);
    }
    // Phase 11C: initialize ablative armour state for entities that don't have it yet
    if (!e.armourState) {
      const ablativeItems = e.loadout.items.filter(it => it.kind === "armour" && !!(it as any).ablative);
      if (ablativeItems.length > 0) {
        e.armourState = new Map(ablativeItems.map(it => [it.id, { resistRemaining_J: (it as any).resist_J as number }]));
      }
    }
  }

  for (const e of world.entities) {
    e.action.attackCooldownTicks = Math.max(0, e.action.attackCooldownTicks - 1);
    e.action.defenceCooldownTicks = Math.max(0, e.action.defenceCooldownTicks - 1);
    e.action.grappleCooldownTicks = Math.max(0, e.action.grappleCooldownTicks - 1);
    e.action.shootCooldownTicks = Math.max(0, e.action.shootCooldownTicks - 1);     // Phase 3
    e.action.swingMomentumQ = qMul(e.action.swingMomentumQ, SWING_MOMENTUM_DECAY) as Q; // Phase 2 ext
    // Phase 12B: per-capability cooldown decay
    if (e.action.capabilityCooldowns) {
      for (const [key, ticks] of e.action.capabilityCooldowns) {
        if (ticks <= 1) e.action.capabilityCooldowns.delete(key);
        else e.action.capabilityCooldowns.set(key, ticks - 1);
      }
    }
    e.condition.standBlockedTicks = Math.max(0, e.condition.standBlockedTicks - 1);
    e.condition.unconsciousTicks = Math.max(0, e.condition.unconsciousTicks - 1);
    e.condition.suppressedTicks = Math.max(0, e.condition.suppressedTicks - 1);    // Phase 3
    e.condition.blindTicks      = Math.max(0, e.condition.blindTicks - 1);         // Phase 10C
    e.condition.rallyCooldownTicks = Math.max(0, e.condition.rallyCooldownTicks - 1); // Phase 5 ext
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

  // Phase 12: resolve or interrupt pending capability activations (cast-time completion)
  const CAST_INTERRUPT_SHOCK: Q = q(0.30) as Q;
  for (const e of world.entities) {
    if (!e.pendingActivation || e.injury.dead) continue;
    if (e.injury.shock >= CAST_INTERRUPT_SHOCK) {
      trace.onEvent({ kind: TraceKinds.CastInterrupted, tick: world.tick, entityId: e.id });
      delete e.pendingActivation;
    } else if (world.tick >= e.pendingActivation.resolveAtTick) {
      const src = e.capabilitySources?.find(s => s.id === e.pendingActivation!.sourceId);
      const eff = src?.effects.find(ef => ef.id === e.pendingActivation!.effectId);
      if (src && eff) {
        applyCapabilityEffect(world, e, e.pendingActivation.targetId, eff, trace, world.tick);
        trace.onEvent({ kind: TraceKinds.CapabilityActivated, tick: world.tick, entityId: e.id, sourceId: src.id, effectId: eff.id });
      }
      delete e.pendingActivation;
    }
  }

  // Phase 12B: step active concentration auras (castTime_ticks = -1 ongoing effects)
  for (const e of world.entities) {
    if (!e.activeConcentration || e.injury.dead) continue;
    stepConcentration (e, world, trace, world.tick);
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

    stepMovement(e, world, ctx, tuning);

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

  for (const ev of finalImpacts) {
    const target = index.byId.get(ev.targetId);
    if (!target || target.injury.dead) continue;

    // Phase 12: temporary shield absorption from armourLayer capability effects
    let effectiveEnergy = ev.energy_J;
    if ((target.condition.shieldReserve_J ?? 0) > 0 &&
        target.condition.shieldExpiry_tick !== undefined &&
        world.tick <= target.condition.shieldExpiry_tick) {
      const absorbed = Math.min(target.condition.shieldReserve_J!, effectiveEnergy);
      target.condition.shieldReserve_J! -= absorbed;
      effectiveEnergy -= absorbed;
    }

    if (effectiveEnergy > 0) {
      applyImpactToInjury(target, ev.wpn, effectiveEnergy, ev.region, ev.protectedByArmour, trace, world.tick);
    }

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

  // Phase 12B: apply chain payloads from active field effects, then expire timed ones
  stepChainEffects(world, trace, world.tick);
  stepFieldEffects(world);

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
    const wasAboveKOThreshold = e.injury.consciousness > tuning.unconsciousThreshold;
    stepConditionsToInjury(e, world, ctx.ambientTemperature_Q);
    stepInjuryProgression(e, world.tick);
    stepSubstances(e, ctx.ambientTemperature_Q);
    stepEnergy(e, ctx);
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
    // Phase 11C: sensor boost from loadout
    const tgtSensor = findSensor(target.loadout);
    const tgtSensorBoost = tgtSensor
      ? { visionRangeMul: tgtSensor.visionRangeMul, hearingRangeMul: tgtSensor.hearingRangeMul }
      : undefined;
    const detectionQ = canDetect(target, attacker, sEnv, tgtSensorBoost);
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
    attacker.action.swingMomentumQ = q(0) as Q;  // Phase 2 ext: miss breaks rhythm
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
  let energy_J = mulDiv(mulDiv(baseEnergy_J, attackerMeleeSkill.energyTransferMul, SCALE.Q), exoForceMul, SCALE.Q);

  // Phase 2 extension: swing momentum carry — bonus energy from rhythmic consecutive strikes
  const momentumBonus_J = Math.trunc(qMul(energy_J, qMul(attacker.action.swingMomentumQ, SWING_MOMENTUM_MAX)));
  energy_J += momentumBonus_J;

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

  const armour = deriveArmourProfile(target.loadout, target.armourState);
  const isEnergyWeapon = !!(wpn as any).energyType;
  const CHANNEL_MASK = isEnergyWeapon ? (1 << DamageChannel.Energy) : (1 << DamageChannel.Kinetic);
  const armourHit = armourCoversHit(world, (armour.coverageByRegion as any)[region] ?? q(0), attacker.id, target.id);
  const protectedByArmour = armourHit && ((armour.protects & CHANNEL_MASK) !== 0);

  let finalEnergy = mitigated;
  if (protectedByArmour) {
    if (isEnergyWeapon && armour.reflectivity > q(0)) {
      // Phase 11C: reflective armour reduces energy weapon damage
      finalEnergy = mulDiv(finalEnergy, SCALE.Q - armour.reflectivity, SCALE.Q);
    } else if (!isEnergyWeapon) {
      finalEnergy = applyKineticArmourPenetration(mitigated, armour.resist_J, armour.protectedDamageMul);
    }
    // Phase 11C: decrement ablative armour resist
    if (target.armourState) {
      for (const it of target.loadout.items) {
        if ((it as any).ablative && target.armourState.has(it.id)) {
          const st = target.armourState.get(it.id)!;
          st.resistRemaining_J = Math.max(0, st.resistRemaining_J - mitigated);
        }
      }
    }
  }

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

  // Phase 2 extension: update swing momentum based on outcome
  if (res.blocked || res.parried) {
    // Blocked/parried — defender broke the rhythm
    attacker.action.swingMomentumQ = q(0) as Q;
  } else {
    // Clean hit — rhythm maintained; capture intensity for next strike bonus
    attacker.action.swingMomentumQ = clampQ(qMul(clampedIntensity, q(0.80)), q(0), SCALE.Q as Q) as Q;
  }
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
  // Phase 3 extension: aiming time accumulation — runs even during reload cooldown
  {
    const svx = shooter.velocity_mps.x;
    const svy = shooter.velocity_mps.y;
    const shooterVelMag = Math.trunc(Math.sqrt(svx * svx + svy * svy));
    if (cmd.targetId !== shooter.action.aimTargetId || shooterVelMag > AIM_STILL_THRESHOLD) {
      shooter.action.aimTicks = 0;
      shooter.action.aimTargetId = cmd.targetId;
    } else if (shooter.action.shootCooldownTicks > 0 && shooterVelMag <= AIM_STILL_THRESHOLD) {
      shooter.action.aimTicks = Math.min(shooter.action.aimTicks + 1, AIM_MAX_TICKS);
    }
  }

  if (shooter.action.shootCooldownTicks > 0) return;

  const wpn = findRangedWeapon(shooter.loadout, cmd.weaponId);
  if (!wpn) return;

  const target = index.byId.get(cmd.targetId);
  if (!target || target.injury.dead) return;

  // Phase 3 extension: ammo type override
  const ammo = cmd.ammoId ? wpn.ammo?.find(a => a.id === cmd.ammoId) : undefined;
  const projMass_kg   = ammo?.projectileMass_kg ?? wpn.projectileMass_kg;
  const dragCoeff_perM = ammo?.dragCoeff_perM   ?? wpn.dragCoeff_perM;
  const ammoDamage    = ammo?.damage             ?? wpn.damage;
  const launchMul     = ammo?.launchEnergyMul    ?? (SCALE.Q as Q);

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
  // Phase 3 extension: ammo launchEnergyMul applied for non-thrown weapons
  const launchEnergy = wpn.category === "thrown"
    ? mulDiv(
        thrownLaunchEnergy_J(shooter.attributes.performance.peakPower_W),
        getSkill(shooter.skills, "throwingWeapons").energyTransferMul,
        SCALE.Q,
      )
    : Math.trunc(qMul(wpn.launchEnergy_J, launchMul));

  // Energy at impact after drag (Phase 3 extension: use ammo drag coefficient)
  const energy_J = energyAtRange_J(launchEnergy, dragCoeff_perM, dist_m);

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
  let gRadius_m = groupingRadius_m(skillAdjDisp, dist_m);

  // Phase 3 extension: aiming time — reduce dispersion up to 50% at full aim
  const aimReduction = mulDiv(SCALE.Q - AIM_MIN_MUL, Math.min(shooter.action.aimTicks, AIM_MAX_TICKS), AIM_MAX_TICKS);
  const aimMul = (SCALE.Q - aimReduction) as Q;
  gRadius_m = Math.trunc(qMul(gRadius_m, aimMul));

  // Phase 3 extension: moving target penalty — lead error based on target velocity
  const tvx = target.velocity_mps.x;
  const tvy = target.velocity_mps.y;
  const targetVelMag = Math.trunc(Math.sqrt(tvx * tvx + tvy * tvy));
  const leadError_m = mulDiv(targetVelMag, 2_000, SCALE.mps);  // 0.2s reaction × SCALE.m
  gRadius_m += leadError_m;

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
  shooter.action.aimTicks = 0;  // Phase 3 extension: reset aim after each shot

  if (suppressed) {
    target.condition.suppressedTicks = Math.max(target.condition.suppressedTicks, 4);
    target.condition.suppressionFearMul = wpn.suppressionFearMul ?? (SCALE.Q as Q);
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
    const armour = deriveArmourProfile(target.loadout, target.armourState);
    const isEnergyProjectile = !!(wpn as any).energyType;
    const PROJ_CHANNEL_MASK = isEnergyProjectile ? (1 << DamageChannel.Energy) : (1 << DamageChannel.Kinetic);
    const armourHit = armourCoversHit(world, (armour.coverageByRegion as any)[hitRegion] ?? q(0), shooter.id, target.id);
    const protectedByArmour = armourHit && ((armour.protects & PROJ_CHANNEL_MASK) !== 0);

    let finalEnergy = energy_J;
    if (shieldHit) {
      const shieldResidual = Math.max(0, energy_J - (shield as any).blockResist_J);
      finalEnergy = mulDiv(shieldResidual, (shield as any).deflectQ ?? q(0.30), SCALE.Q);
    }
    if (protectedByArmour) {
      if (isEnergyProjectile && armour.reflectivity > q(0)) {
        finalEnergy = mulDiv(finalEnergy, SCALE.Q - armour.reflectivity, SCALE.Q);
      } else if (!isEnergyProjectile) {
        finalEnergy = applyKineticArmourPenetration(finalEnergy, armour.resist_J, armour.protectedDamageMul);
      }
      // Phase 11C: decrement ablative armour resist
      if (target.armourState) {
        for (const it of target.loadout.items) {
          if ((it as any).ablative && target.armourState.has(it.id)) {
            const st = target.armourState.get(it.id)!;
            st.resistRemaining_J = Math.max(0, st.resistRemaining_J - energy_J);
          }
        }
      }
    }

    // Build a minimal Weapon proxy for applyImpactToInjury
    // Phase 3 extension: use ammo-overridden damage and projectile mass
    const wpnProxy: Weapon = {
      id: wpn.id,
      kind: "weapon",
      name: wpn.name,
      mass_kg: projMass_kg,
      bulk: q(0),
      damage: ammoDamage,
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

  // Phase 8C: intrinsic exoskeleton armor — absorbed before damage channels are allocated
  if (seg?.intrinsicArmor_J !== undefined && seg.intrinsicArmor_J > 0) {
    energy_J = Math.max(0, energy_J - seg.intrinsicArmor_J);
    if (energy_J === 0) return;
  }

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
  switch (payload.kind) {

    case "impact": {
      const wpn = CAPABILITY_CHANNEL_WEAPONS[payload.spec.channel] ?? CAPABILITY_WEAPON_DEFAULT;
      const capSeed = eventSeed(world.seed, tick, actor.id, target.id, 0xCAB1);
      const capRng  = makeRng(capSeed, SCALE.Q);
      let hitRegion: string;
      if (target.bodyPlan) {
        hitRegion = resolveHitSegment(target.bodyPlan, capRng.q01());
      } else {
        const area    = chooseArea(capRng.q01());
        const sideBit = (capSeed & 1) as 0 | 1;
        hitRegion     = regionFromHit(area, sideBit);
      }
      if (!target.injury.byRegion[hitRegion]) break;

      // Check temporary shield absorption before applying impact
      let effectiveEnergy = payload.spec.energy_J;
      if ((target.condition.shieldReserve_J ?? 0) > 0 &&
          target.condition.shieldExpiry_tick !== undefined &&
          tick <= target.condition.shieldExpiry_tick) {
        const absorbed = Math.min(target.condition.shieldReserve_J!, effectiveEnergy);
        target.condition.shieldReserve_J! -= absorbed;
        effectiveEnergy -= absorbed;
      }
      if (effectiveEnergy > 0) {
        applyImpactToInjury(target, wpn, effectiveEnergy, hitRegion, false, trace, tick);
      }
      break;
    }

    case "treatment": {
      // Direct healing — bypasses range/equipment checks; capability source IS the tool.
      const BASE_CAP_HEAL: Q = q(0.0050) as Q;
      const healRate = qMul(BASE_CAP_HEAL, payload.rateMul);
      for (const reg of Object.values(target.injury.byRegion)) {
        if (reg.bleedingRate > 0) {
          reg.bleedingRate = clampQ((reg.bleedingRate - healRate) as Q, 0, SCALE.Q);
        }
      }
      target.injury.shock = clampQ(
        (target.injury.shock - qMul(q(0.01), payload.rateMul)) as Q, 0, SCALE.Q,
      );
      break;
    }

    case "armourLayer": {
      // Accumulate into shield reserve; extend or set expiry.
      target.condition.shieldReserve_J = (target.condition.shieldReserve_J ?? 0) + payload.resist_J;
      const newExpiry = tick + payload.duration_ticks;
      target.condition.shieldExpiry_tick = Math.max(
        target.condition.shieldExpiry_tick ?? 0,
        newExpiry,
      );
      break;
    }

    case "velocity": {
      target.velocity_mps = vAdd(target.velocity_mps, payload.delta_mps);
      break;
    }

    case "substance": {
      if (!target.substances) target.substances = [];
      target.substances.push({ ...payload.substance });
      break;
    }

    case "structuralRepair": {
      const seg = target.injury.byRegion[payload.region];
      if (seg) {
        const floor = seg.permanentDamage ?? 0;
        const repaired = Math.max(floor, seg.structuralDamage - payload.amount);
        seg.structuralDamage = clampQ(repaired as Q, 0, SCALE.Q);
      }
      break;
    }

    case "fieldEffect": {
      if (!world.activeFieldEffects) world.activeFieldEffects = [];
      const fe: FieldEffect = {
        ...payload.spec,
        id: `${actor.id}_${effectId}_${tick}`,
        origin: { x: actor.position_m.x, y: actor.position_m.y, z: actor.position_m.z },
        placedByEntityId: actor.id,
      };
      world.activeFieldEffects.push(fe);
      break;
    }
  }
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
  const payloads: EffectPayload[] = Array.isArray(effect.payload)
    ? effect.payload
    : [effect.payload];

  // Determine target entities
  let targets: Entity[];
  if (effect.aoeRadius_m !== undefined) {
    const origin = targetId !== undefined
      ? (world.entities.find(e => e.id === targetId)?.position_m ?? actor.position_m)
      : actor.position_m;
    const radSq = effect.aoeRadius_m * effect.aoeRadius_m;
    targets = world.entities.filter(e => {
      if (e.injury.dead) return false;
      const dx = e.position_m.x - origin.x;
      const dy = e.position_m.y - origin.y;
      return dx * dx + dy * dy <= radSq;
    });
  } else if (targetId !== undefined) {
    const t = world.entities.find(e => e.id === targetId);
    targets = t && !t.injury.dead ? [t] : [];
  } else {
    targets = [actor];
  }

  for (const target of targets) {
    // Phase 12B: magic resistance — non-self targets may resist the effect
    if (target.id !== actor.id) {
      const mr = target.attributes.resilience.magicResist ?? 0;
      if (mr > 0) {
        const resistSeed = eventSeed(world.seed, tick, actor.id, target.id, 0x5E515);
        if ((resistSeed % SCALE.Q) < mr) continue;
      }
    }
    for (const p of payloads) {
      applyPayload(world, actor, target, p, trace, tick, effect.id);
    }
  }
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
  if (!actor.capabilitySources) return;
  const source = actor.capabilitySources.find(s => s.id === cmd.sourceId);
  if (!source) return;
  const effect = source.effects.find(ef => ef.id === cmd.effectId);
  if (!effect) return;

  // Phase 12B: cooldown gate — can't re-activate until cooldown expires
  const cooldownKey = `${source.id}:${effect.id}`;
  if ((actor.action.capabilityCooldowns?.get(cooldownKey) ?? 0) > 0) return;

  // Phase 12B: tech-context gate — requiredCapability must be available if techCtx is present
  if (effect.requiredCapability !== undefined && ctx.techCtx !== undefined) {
    if (!isCapabilityAvailable(ctx.techCtx, effect.requiredCapability)) return;
  }

  // Suppression check — any covering field whose tags overlap source tags blocks activation
  const ax = actor.position_m.x;
  const ay = actor.position_m.y;
  const suppressed = (world.activeFieldEffects ?? []).some(fe => {
    const dx = ax - fe.origin.x;
    const dy = ay - fe.origin.y;
    const distSq = dx * dx + dy * dy;
    const radSq  = fe.radius_m * fe.radius_m;
    return distSq <= radSq && source.tags.some(t => fe.suppressesTags.includes(t));
  });
  if (suppressed) {
    trace.onEvent({ kind: TraceKinds.CapabilitySuppressed, tick, entityId: actor.id, sourceId: cmd.sourceId, effectId: cmd.effectId });
    return;
  }

  // Range check
  if (effect.range_m !== undefined && cmd.targetId !== undefined) {
    const tgt = world.entities.find(e => e.id === cmd.targetId);
    if (tgt) {
      const dx = tgt.position_m.x - ax;
      const dy = tgt.position_m.y - ay;
      if (dx * dx + dy * dy > effect.range_m * effect.range_m) return;
    }
  }

  // Phase 12B: concentration aura — castTime_ticks < 0 means ongoing per-tick effect.
  // No upfront cost; stepConcentration deducts cost_J each tick.
  if (effect.castTime_ticks < 0) {
    actor.activeConcentration = {
      sourceId: source.id,
      effectId: effect.id,
      ...(cmd.targetId !== undefined ? { targetId: cmd.targetId } : {}),
    };
    trace.onEvent({ kind: TraceKinds.CapabilityActivated, tick, entityId: actor.id, sourceId: source.id, effectId: effect.id });
    return;
  }

  // Cost check (boundless sources always have enough)
  const isBoundless = source.regenModel.type === "boundless";
  let sourceToDraw = source;
  if (!isBoundless && source.reserve_J < effect.cost_J) {
    // Phase 12B: try linked fallback source
    if (source.linkedFallbackId) {
      const fallback = actor.capabilitySources!.find(s => s.id === source.linkedFallbackId);
      if (fallback && (fallback.regenModel.type === "boundless" || fallback.reserve_J >= effect.cost_J)) {
        sourceToDraw = fallback;
      } else {
        return; // both depleted
      }
    } else {
      return;
    }
  }
  const drawIsBoundless = sourceToDraw.regenModel.type === "boundless";

  // Cast time — queue pending activation and deduct cost at cast-start
  if (effect.castTime_ticks > 0) {
    if (!actor.pendingActivation) {
      if (!drawIsBoundless) sourceToDraw.reserve_J -= effect.cost_J;
      actor.pendingActivation = cmd.targetId !== undefined
        ? { sourceId: cmd.sourceId, effectId: cmd.effectId, targetId: cmd.targetId, resolveAtTick: tick + effect.castTime_ticks }
        : { sourceId: cmd.sourceId, effectId: cmd.effectId, resolveAtTick: tick + effect.castTime_ticks };
      // Phase 12B: set cooldown at cast-start so the cast itself is gated
      if (effect.cooldown_ticks && effect.cooldown_ticks > 0) {
        if (!actor.action.capabilityCooldowns) actor.action.capabilityCooldowns = new Map();
        actor.action.capabilityCooldowns.set(cooldownKey, effect.cooldown_ticks);
      }
    }
    return;
  }

  // Instant — deduct, resolve, and set cooldown
  if (!drawIsBoundless) sourceToDraw.reserve_J -= effect.cost_J;
  applyCapabilityEffect(world, actor, cmd.targetId, effect, trace, tick);
  trace.onEvent({ kind: TraceKinds.CapabilityActivated, tick, entityId: actor.id, sourceId: cmd.sourceId, effectId: cmd.effectId });
  if (effect.cooldown_ticks && effect.cooldown_ticks > 0) {
    if (!actor.action.capabilityCooldowns) actor.action.capabilityCooldowns = new Map();
    actor.action.capabilityCooldowns.set(cooldownKey, effect.cooldown_ticks);
  }
}
