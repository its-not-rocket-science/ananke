import type { WorldState } from "../world.js";
import { type Entity } from "../entity.js";
import type { ActivateCommand } from "../commands.js";
import type { CapabilityEffect, EffectPayload, FieldEffect } from "../capability.js";
import type { KernelContext } from "../context.js";

import { SCALE, q, clampQ, qMul, type Q } from "../../units.js";
import { DamageChannel } from "../../channels.js";
import { type Weapon } from "../../equipment.js";

import { isCapabilityAvailable } from "../tech.js";
import { eventSeed } from "../seeds.js";
import { entityInCone, type ConeSpec } from "../cone.js";
import { type Vec3, vAdd } from "../vec3.js";
import type { TraceSink } from "../trace.js";
import { TraceKinds } from "../kinds.js";

const CAPABILITY_CHANNEL_WEAPONS: Partial<Record<number, Weapon>> = {
  [DamageChannel.Kinetic]: { id: "cap_kinetic", kind: "weapon", name: "Kinetic Force", mass_kg: 0, bulk: q(0), damage: { penetrationBias: q(0.30), surfaceFrac: q(0.30), internalFrac: q(0.30), structuralFrac: q(0.40), bleedFactor: q(0.30) } },
  [DamageChannel.Thermal]: { id: "cap_thermal", kind: "weapon", name: "Thermal", mass_kg: 0, bulk: q(0), damage: { penetrationBias: q(0), surfaceFrac: q(0.40), internalFrac: q(0.50), structuralFrac: q(0.10), bleedFactor: q(0.10) } },
  [DamageChannel.Electrical]: { id: "cap_elec", kind: "weapon", name: "Electrical", mass_kg: 0, bulk: q(0), damage: { penetrationBias: q(0.20), surfaceFrac: q(0.20), internalFrac: q(0.60), structuralFrac: q(0.20), bleedFactor: q(0.05) } },
  [DamageChannel.Chemical]: { id: "cap_chem", kind: "weapon", name: "Chemical", mass_kg: 0, bulk: q(0), damage: { penetrationBias: q(0), surfaceFrac: q(0.45), internalFrac: q(0.45), structuralFrac: q(0.10), bleedFactor: q(0.20) } },
  [DamageChannel.Radiation]: { id: "cap_rad", kind: "weapon", name: "Radiation", mass_kg: 0, bulk: q(0), damage: { penetrationBias: q(0), surfaceFrac: q(0.05), internalFrac: q(0.90), structuralFrac: q(0.05), bleedFactor: q(0.05) } },
};
const CAPABILITY_WEAPON_DEFAULT: Weapon = {
  id: "cap_generic", kind: "weapon", name: "Capability", mass_kg: 0, bulk: q(0),
  damage: { penetrationBias: q(0.10), surfaceFrac: q(0.30), internalFrac: q(0.40), structuralFrac: q(0.30), bleedFactor: q(0.20) },
};

type CapabilityResolverHelpers = {
  resolveCapabilityHitSegment: (world: WorldState, tick: number, actor: Entity, target: Entity, salt: number) => string;
  applyImpactToInjury: (target: Entity, wpn: Weapon, energy_J: number, region: string, armoured: boolean, trace: TraceSink, tick: number, tempCavityMul_Q?: number) => void;
};

export function applyPayload(
  world: WorldState,
  actor: Entity,
  target: Entity,
  payload: EffectPayload,
  trace: TraceSink,
  tick: number,
  effectId: string,
  helpers: CapabilityResolverHelpers,
): void {
  switch (payload.kind) {
    case "impact": {
      const hitRegion = helpers.resolveCapabilityHitSegment(world, tick, actor, target, 0xCAB1);
      if (!target.injury.byRegion[hitRegion]) break;

      let effectiveEnergy = payload.spec.energy_J;
      if ((target.condition.shieldReserve_J ?? 0) > 0 &&
        target.condition.shieldExpiry_tick !== undefined &&
        tick <= target.condition.shieldExpiry_tick) {
        const absorbed = Math.min(target.condition.shieldReserve_J!, effectiveEnergy);
        target.condition.shieldReserve_J! -= absorbed;
        effectiveEnergy -= absorbed;
      }
      if (effectiveEnergy > 0) {
        const wpn = CAPABILITY_CHANNEL_WEAPONS[payload.spec.channel] ?? CAPABILITY_WEAPON_DEFAULT;
        helpers.applyImpactToInjury(target, wpn, effectiveEnergy, hitRegion, false, trace, tick);
      }
      break;
    }

    case "treatment": {
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
    case "weaponImpact": {
      const wpn: Weapon = {
        id: "cap_weaponimpact",
        kind: "weapon",
        name: "WeaponImpact",
        mass_kg: 0,
        bulk: q(0),
        damage: payload.profile,
      };

      const hitRegion = helpers.resolveCapabilityHitSegment(world, tick, actor, target, 0xCAB2);

      if (!target.injury.byRegion[hitRegion]) break;

      let effectiveEnergy = payload.energy_J;
      if (
        (target.condition.shieldReserve_J ?? 0) > 0 &&
        target.condition.shieldExpiry_tick !== undefined &&
        tick <= target.condition.shieldExpiry_tick
      ) {
        const absorbed = Math.min(target.condition.shieldReserve_J!, effectiveEnergy);
        target.condition.shieldReserve_J! -= absorbed;
        effectiveEnergy -= absorbed;
      }

      if (effectiveEnergy > 0) {
        helpers.applyImpactToInjury(target, wpn, effectiveEnergy, hitRegion, false, trace, tick);
      }
      break;
    }
  }
}

export function applyCapabilityEffect(
  world: WorldState,
  actor: Entity,
  targetId: number | undefined,
  effect: CapabilityEffect,
  trace: TraceSink,
  tick: number,
  helpers: CapabilityResolverHelpers,
): void {
  const payloads: EffectPayload[] = Array.isArray(effect.payload)
    ? effect.payload
    : [effect.payload];

  let targets: Entity[];
  if (effect.coneHalfAngle_rad !== undefined) {
    const range_m = effect.range_m ?? 0;
    let dir: { dx: number; dy: number };
    if (effect.coneDir === "fixed" && effect.coneDirFixed) {
      dir = effect.coneDirFixed;
    } else {
      const fx = actor.action.facingDirQ.x;
      const fy = actor.action.facingDirQ.y;
      const mag = Math.sqrt(fx * fx + fy * fy);
      const sc = mag > 0 ? SCALE.m / mag : 1;
      dir = { dx: Math.round(fx * sc), dy: Math.round(fy * sc) };
    }
    const cone: ConeSpec = {
      origin: { x: actor.position_m.x, y: actor.position_m.y },
      dir,
      halfAngle_rad: effect.coneHalfAngle_rad,
      range_m,
    };
    targets = world.entities.filter(e => !e.injury.dead && entityInCone(e, cone));
  } else if (effect.aoeRadius_m !== undefined) {
    const origin: Vec3 = targetId !== undefined
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
    if (target.id !== actor.id) {
      const mr = target.attributes.resilience.magicResist ?? 0;
      if (mr > 0) {
        const resistSeed = eventSeed(world.seed, tick, actor.id, target.id, 0x5E515);
        if ((resistSeed % SCALE.Q) < mr) continue;
      }
    }
    for (const p of payloads) {
      applyPayload(world, actor, target, p, trace, tick, effect.id, helpers);
    }
  }
}

export function resolveActivation(
  world: WorldState,
  actor: Entity,
  cmd: ActivateCommand,
  ctx: KernelContext,
  trace: TraceSink,
  tick: number,
  onInstantResolve?: (effect: CapabilityEffect) => void,
): void {
  if (!actor.capabilitySources) return;
  const source = actor.capabilitySources.find(s => s.id === cmd.sourceId);
  if (!source) return;
  const effect = source.effects.find(ef => ef.id === cmd.effectId);
  if (!effect) return;

  const cooldownKey = `${source.id}:${effect.id}`;
  if ((actor.action.capabilityCooldowns?.get(cooldownKey) ?? 0) > 0) return;

  if (effect.requiredCapability !== undefined && ctx.techCtx !== undefined) {
    if (!isCapabilityAvailable(ctx.techCtx, effect.requiredCapability)) return;
  }

  const ax = actor.position_m.x;
  const ay = actor.position_m.y;
  const suppressed = (world.activeFieldEffects ?? []).some(fe => {
    const dx = ax - fe.origin.x;
    const dy = ay - fe.origin.y;
    const distSq = dx * dx + dy * dy;
    const radSq = fe.radius_m * fe.radius_m;
    return distSq <= radSq && source.tags.some(t => fe.suppressesTags.includes(t));
  });
  if (suppressed) {
    trace.onEvent({ kind: TraceKinds.CapabilitySuppressed, tick, entityId: actor.id, sourceId: cmd.sourceId, effectId: cmd.effectId });
    return;
  }

  if (effect.range_m !== undefined && cmd.targetId !== undefined) {
    const tgt = world.entities.find(e => e.id === cmd.targetId);
    if (tgt) {
      const dx = tgt.position_m.x - ax;
      const dy = tgt.position_m.y - ay;
      if (dx * dx + dy * dy > effect.range_m * effect.range_m) return;
    }
  }

  if (effect.castTime_ticks < 0) {
    actor.activeConcentration = {
      sourceId: source.id,
      effectId: effect.id,
      ...(cmd.targetId !== undefined ? { targetId: cmd.targetId } : {}),
    };
    trace.onEvent({ kind: TraceKinds.CapabilityActivated, tick, entityId: actor.id, sourceId: source.id, effectId: effect.id });
    return;
  }

  const isBoundless = source.regenModel.type === "boundless";
  let sourceToDraw = source;
  if (!isBoundless && source.reserve_J < effect.cost_J) {
    if (source.linkedFallbackId) {
      const fallback = actor.capabilitySources!.find(s => s.id === source.linkedFallbackId);
      if (fallback && (fallback.regenModel.type === "boundless" || fallback.reserve_J >= effect.cost_J)) {
        sourceToDraw = fallback;
      } else {
        return;
      }
    } else {
      return;
    }
  }
  const drawIsBoundless = sourceToDraw.regenModel.type === "boundless";

  if (effect.castTime_ticks > 0) {
    if (!actor.pendingActivation) {
      if (!drawIsBoundless) sourceToDraw.reserve_J -= effect.cost_J;
      actor.pendingActivation = cmd.targetId !== undefined
        ? { sourceId: cmd.sourceId, effectId: cmd.effectId, targetId: cmd.targetId, resolveAtTick: tick + effect.castTime_ticks }
        : { sourceId: cmd.sourceId, effectId: cmd.effectId, resolveAtTick: tick + effect.castTime_ticks };
      if (effect.cooldown_ticks && effect.cooldown_ticks > 0) {
        if (!actor.action.capabilityCooldowns) actor.action.capabilityCooldowns = new Map();
        actor.action.capabilityCooldowns.set(cooldownKey, effect.cooldown_ticks);
      }
    }
    return;
  }

  if (!drawIsBoundless) sourceToDraw.reserve_J -= effect.cost_J;
  onInstantResolve?.(effect);
  trace.onEvent({ kind: TraceKinds.CapabilityActivated, tick, entityId: actor.id, sourceId: cmd.sourceId, effectId: cmd.effectId });
  if (effect.cooldown_ticks && effect.cooldown_ticks > 0) {
    if (!actor.action.capabilityCooldowns) actor.action.capabilityCooldowns = new Map();
    actor.action.capabilityCooldowns.set(cooldownKey, effect.cooldown_ticks);
  }

  if (effect.sustainedTicks && effect.sustainedTicks > 1) {
    actor.action.sustainedEmission = {
      sourceId: cmd.sourceId,
      effectId: cmd.effectId,
      ...(cmd.targetId !== undefined ? { targetId: cmd.targetId } : {}),
      remainingTicks: effect.sustainedTicks - 1,
    };
  }
}
