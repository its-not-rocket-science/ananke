import type { WorldState } from "../world.js";
import { type Entity } from "../entity.js";
import type { BreakGrappleCommand, GrappleCommand } from "../commands.js";
import { type SimulationTuning } from "../tuning.js";
import { SCALE, clampQ, q, qMul, type Q } from "../../units.js";
import { findWeapon } from "../../equipment.js";
import { eventSeed } from "../seeds.js";
import { breakBindContestQ } from "../weapon_dynamics.js";

import {
  resolveGrappleAttempt,
  resolveGrappleThrow,
  resolveGrappleChoke,
  resolveGrappleJointLock,
  resolveBreakGrapple,
} from "../grapple.js";
import type { WorldIndex } from "../indexing.js";
import { type ImpactEvent } from "../events.js";
import type { TraceSink } from "../trace.js";
import { TraceKinds } from "../kinds.js";

type ResolveGrappleCommandOptions = {
  world: WorldState;
  entity: Entity;
  command: GrappleCommand;
  tuning: SimulationTuning;
  index: WorldIndex;
  impacts: ImpactEvent[];
  trace: TraceSink;
};

export function resolveGrappleCommand(options: ResolveGrappleCommandOptions): void {
  const { world, entity, command, tuning, index, impacts, trace } = options;
  const target = index.byId.get(command.targetId);
  if (!target || target.injury.dead) return;

  const mode = command.mode ?? "grapple";

  if (mode === "grapple") {
    if (entity.grapple.holdingTargetId === 0 || entity.grapple.holdingTargetId !== command.targetId) {
      resolveGrappleAttempt(world, entity, target, command.intensity, tuning, impacts, trace);
    } else {
      trace.onEvent({
        kind: TraceKinds.Grapple,
        tick: world.tick, attackerId: entity.id, targetId: target.id,
        phase: "tick", strengthQ: entity.grapple.gripQ,
      });
    }
  } else if (mode === "throw") {
    resolveGrappleThrow(world, entity, target, command.intensity, tuning, impacts, trace);
  } else if (mode === "choke") {
    resolveGrappleChoke(entity, target, command.intensity, tuning);
  } else if (mode === "jointLock") {
    resolveGrappleJointLock(world, entity, target, command.intensity, tuning, impacts);
  }
}

type ResolveBreakBindOptions = {
  world: WorldState;
  entity: Entity;
  intensity: Q;
  index: WorldIndex;
  trace: TraceSink;
};

export function resolveBreakBind(options: ResolveBreakBindOptions): void {
  const { world, entity, intensity, index, trace } = options;
  if (entity.action.weaponBindPartnerId === 0) return;

  const partner = index.byId.get(entity.action.weaponBindPartnerId);
  if (!partner || partner.injury.dead) {
    entity.action.weaponBindPartnerId = 0;
    entity.action.weaponBindTicks = 0;
    return;
  }

  const breakerWpn = findWeapon(entity.loadout);
  const holderWpn = findWeapon(partner.loadout);
  const breakerArm = breakerWpn?.momentArm_m ?? Math.trunc(0.55 * SCALE.m);
  const holderArm = holderWpn?.momentArm_m ?? Math.trunc(0.55 * SCALE.m);

  const baseWinQ = breakBindContestQ(
    entity.attributes.performance.peakForce_N,
    partner.attributes.performance.peakForce_N,
    breakerArm,
    holderArm,
  );
  const winQ = clampQ(qMul(baseWinQ, intensity), q(0.05), q(0.95));

  const breakSeed = eventSeed(world.seed, world.tick, entity.id, partner.id, 0xBB1D);
  const breakRoll = (breakSeed % SCALE.Q) as Q;

  if (breakRoll < winQ) {
    partner.condition.stunned = clampQ(partner.condition.stunned + q(0.05), 0, SCALE.Q);

    entity.action.weaponBindPartnerId = 0;
    entity.action.weaponBindTicks = 0;
    partner.action.weaponBindPartnerId = 0;
    partner.action.weaponBindTicks = 0;

    trace.onEvent({
      kind: TraceKinds.WeaponBindBreak,
      tick: world.tick,
      entityId: entity.id,
      partnerId: partner.id,
      reason: "forced",
    });
  }
}

export function resolveBreakGrappleCommand(
  world: WorldState,
  entity: Entity,
  command: BreakGrappleCommand,
  tuning: SimulationTuning,
  index: WorldIndex,
  trace: TraceSink,
): void {
  resolveBreakGrapple(world, entity, command.intensity, tuning, index, trace);
}
