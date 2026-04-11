import type { WorldState } from "./sim/world.js";

let asserted = false;

function assertInteger(name: string, value: number): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`determinism assertion failed: ${name} must be a finite integer, received ${value}`);
  }
}

export function assertNoFloatUsage(world: WorldState): void {
  assertInteger("world.tick", world.tick);
  assertInteger("world.seed", world.seed);
  for (const e of world.entities) {
    assertInteger(`entity:${e.id}.position.x`, e.position_m.x);
    assertInteger(`entity:${e.id}.position.y`, e.position_m.y);
    assertInteger(`entity:${e.id}.velocity.x`, e.velocity_mps.x);
    assertInteger(`entity:${e.id}.velocity.y`, e.velocity_mps.y);
    assertInteger(`entity:${e.id}.injury.fluidLoss`, e.injury.fluidLoss);
    assertInteger(`entity:${e.id}.injury.shock`, e.injury.shock);
    assertInteger(`entity:${e.id}.injury.consciousness`, e.injury.consciousness);
  }
}

export function assertNoFloatUsageInProduction(world: WorldState): void {
  if (asserted) return;
  asserted = true;
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    assertNoFloatUsage(world);
  }
}

function assertFiniteNumber(name: string, value: unknown): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`determinism invariant failed: ${name} must be a finite number, received ${String(value)}`);
  }
}

function assertSortedUniqueAscending(name: string, values: number[]): void {
  let prev = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const value = values[i]!;
    assertFiniteNumber(`${name}[${i}]`, value);
    if (!Number.isInteger(value)) {
      throw new Error(`determinism invariant failed: ${name}[${i}] must be an integer id, received ${String(value)}`);
    }
    if (value <= prev) {
      throw new Error(`determinism invariant failed: ${name} must be strictly ascending (idx ${i - 1}=${prev}, idx ${i}=${value})`);
    }
    prev = value;
  }
}

/**
 * Strict deterministic-world invariants used by CI fuzzing and replay checks.
 *
 * Covers:
 * - no NaN/Infinity in core numeric state
 * - deterministic ordering in entity/id lists
 * - stable entity indexing assumptions used by kernel/index layers
 */
export function assertDeterministicWorldLike(world: WorldState, stage = "unknown"): void {
  assertFiniteNumber(`world.tick @${stage}`, world.tick);
  assertFiniteNumber(`world.seed @${stage}`, world.seed);
  if (!Number.isInteger(world.tick)) {
    throw new Error(`determinism invariant failed: world.tick @${stage} must be an integer`);
  }
  if (!Number.isInteger(world.seed)) {
    throw new Error(`determinism invariant failed: world.seed @${stage} must be an integer`);
  }

  const ids = world.entities.map((e) => e.id);
  assertSortedUniqueAscending(`world.entities.id @${stage}`, ids);

  const byId = new Map<number, number>();
  for (let i = 0; i < world.entities.length; i++) {
    const e = world.entities[i]!;
    byId.set(e.id, i);

    assertFiniteNumber(`entity:${e.id}.id @${stage}`, e.id);
    assertFiniteNumber(`entity:${e.id}.teamId @${stage}`, e.teamId);
    assertFiniteNumber(`entity:${e.id}.position.x @${stage}`, e.position_m.x);
    assertFiniteNumber(`entity:${e.id}.position.y @${stage}`, e.position_m.y);
    assertFiniteNumber(`entity:${e.id}.position.z @${stage}`, e.position_m.z);
    assertFiniteNumber(`entity:${e.id}.velocity.x @${stage}`, e.velocity_mps.x);
    assertFiniteNumber(`entity:${e.id}.velocity.y @${stage}`, e.velocity_mps.y);
    assertFiniteNumber(`entity:${e.id}.velocity.z @${stage}`, e.velocity_mps.z);
    assertFiniteNumber(`entity:${e.id}.injury.fluidLoss @${stage}`, e.injury.fluidLoss);
    assertFiniteNumber(`entity:${e.id}.injury.shock @${stage}`, e.injury.shock);
    assertFiniteNumber(`entity:${e.id}.injury.consciousness @${stage}`, e.injury.consciousness);
    assertFiniteNumber(`entity:${e.id}.grapple.holdingTargetId @${stage}`, e.grapple.holdingTargetId);
    assertFiniteNumber(`entity:${e.id}.action.attackCooldownTicks @${stage}`, e.action.attackCooldownTicks);
    assertFiniteNumber(`entity:${e.id}.action.defenceCooldownTicks @${stage}`, e.action.defenceCooldownTicks);
    assertFiniteNumber(`entity:${e.id}.action.grappleCooldownTicks @${stage}`, e.action.grappleCooldownTicks);

    assertSortedUniqueAscending(`entity:${e.id}.grapple.heldByIds @${stage}`, e.grapple.heldByIds);
  }

  for (const [id, idx] of byId) {
    const entityAtIndex = world.entities[idx];
    if (!entityAtIndex || entityAtIndex.id !== id) {
      throw new Error(`determinism invariant failed: unstable entity indexing for id=${id} @${stage}`);
    }
  }
}
