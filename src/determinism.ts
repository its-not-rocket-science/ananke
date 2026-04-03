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
