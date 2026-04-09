import type { Entity } from "../../src/sim/entity.js";
import type { TraceEvent } from "../../src/sim/trace.js";
import type { WorldState } from "../../src/sim/world.js";

export interface DiffResult {
  path: string;
  before: unknown;
  after: unknown;
}

export interface WorldParitySnapshot {
  tick: number;
  seed: number;
  entities: unknown[];
  activeFieldEffects: unknown[];
  runtimeState: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableEntity(entity: Entity): unknown {
  const torso = entity.injury.byRegion?.torso;
  return {
    id: entity.id,
    teamId: entity.teamId,
    pos: {
      x: entity.position_m.x,
      y: entity.position_m.y,
      z: entity.position_m.z,
    },
    vel: {
      x: entity.velocity_mps.x,
      y: entity.velocity_mps.y,
      z: entity.velocity_mps.z,
    },
    energy: {
      reserveEnergy_J: entity.energy.reserveEnergy_J,
      fatigue: entity.energy.fatigue,
    },
    injury: {
      dead: entity.injury.dead,
      fluidLoss: entity.injury.fluidLoss,
      shock: entity.injury.shock,
      consciousness: entity.injury.consciousness,
      torso: {
        surfaceDamage: torso?.surfaceDamage ?? 0,
        internalDamage: torso?.internalDamage ?? 0,
        structuralDamage: torso?.structuralDamage ?? 0,
        bleedingRate: torso?.bleedingRate ?? 0,
      },
    },
    condition: {
      fearQ: entity.condition.fearQ,
      suppressedTicks: entity.condition.suppressedTicks,
      suppressionFearMul: entity.condition.suppressionFearMul,
      surrendered: entity.condition.surrendered,
      rallyCooldownTicks: entity.condition.rallyCooldownTicks,
      hungerState: entity.condition.hungerState,
      caloricBalance_J: entity.condition.caloricBalance_J,
      hydrationBalance_J: entity.condition.hydrationBalance_J,
      coreTemp_Q: entity.condition.coreTemp_Q,
    },
    action: {
      attackCooldownTicks: entity.action.attackCooldownTicks,
      shootCooldownTicks: entity.action.shootCooldownTicks,
      capabilityCooldownTicks: entity.action.capabilityCooldownTicks,
      treatCooldownTicks: entity.action.treatCooldownTicks,
      weaponBindPartnerId: entity.action.weaponBindPartnerId,
      weaponBindTicks: entity.action.weaponBindTicks,
    },
    grapple: {
      holdingTargetId: entity.grapple?.holdingTargetId ?? null,
      gripQ: entity.grapple?.gripQ ?? 0,
      heldByTargetId: entity.grapple?.heldByTargetId ?? null,
    },
    capabilities: (entity.capabilitySources ?? []).map((source) => ({
      id: source.id,
      reserve_J: source.reserve_J,
      maxReserve_J: source.maxReserve_J,
      regenModel: source.regenModel,
    })),
  };
}

export function captureWorldParitySnapshot(world: WorldState): WorldParitySnapshot {
  return {
    tick: world.tick,
    seed: world.seed,
    entities: world.entities
      .slice()
      .sort((a, b) => a.id - b.id)
      .map(stableEntity),
    activeFieldEffects: (world.activeFieldEffects ?? [])
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((effect) => ({
        id: effect.id,
        sourceEntityId: effect.sourceEntityId,
        radius_m: effect.radius_m,
        duration_ticks: effect.duration_ticks,
        pulseEvery_ticks: effect.pulseEvery_ticks,
      })),
    runtimeState: {
      nutritionAccum: world.runtimeState?.nutritionAccum ?? 0,
    },
  };
}

export function captureTraceOrder(events: TraceEvent[]): unknown[] {
  return events.map((event) => {
    const anyEvent = event as Record<string, unknown>;
    return {
      kind: event.kind,
      tick: event.tick,
      entityId: anyEvent.entityId ?? null,
      attackerId: anyEvent.attackerId ?? null,
      targetId: anyEvent.targetId ?? null,
      shooterId: anyEvent.shooterId ?? null,
      treaterId: anyEvent.treaterId ?? null,
      sourceId: anyEvent.sourceId ?? null,
      effectId: anyEvent.effectId ?? null,
    };
  });
}

export function firstDiff(before: unknown, after: unknown, path = "$"): DiffResult | null {
  if (Object.is(before, after)) return null;

  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) {
      return { path: `${path}.length`, before: before.length, after: after.length };
    }
    for (let i = 0; i < before.length; i += 1) {
      const diff = firstDiff(before[i], after[i], `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }

  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      if (!(key in before)) return { path: `${path}.${key}`, before: undefined, after: after[key] };
      if (!(key in after)) return { path: `${path}.${key}`, before: before[key], after: undefined };
      const diff = firstDiff(before[key], after[key], `${path}.${key}`);
      if (diff) return diff;
    }
    return null;
  }

  return { path, before, after };
}

export function formatParityDiff(label: string, before: unknown, after: unknown): string {
  const diff = firstDiff(before, after);
  if (!diff) return `${label}: identical`;

  return [
    `${label}: divergence at ${diff.path}`,
    `before=${JSON.stringify(diff.before)}`,
    `after=${JSON.stringify(diff.after)}`,
  ].join("\n");
}
