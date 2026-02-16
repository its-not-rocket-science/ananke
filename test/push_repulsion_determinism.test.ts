import { expect, test } from "vitest";

import { mkHumanoidEntity, mkWorld } from "./helpers/entities";
import { q, SCALE } from "../src/units";
import type { CommandMap } from "../src/sim/commands";
import { stepWorld } from "../src/sim/kernel";

function snapshot(world: any) {
  return world.entities
    .slice()
    .sort((a: any, b: any) => a.id - b.id)
    .map((e: any) => ({
      id: e.id,
      x: e.position_m.x,
      y: e.position_m.y,
      z: e.position_m.z,
      vx: e.velocity_mps.x,
      vy: e.velocity_mps.y,
      vz: e.velocity_mps.z,
    }));
}

test("push/repulsion is deterministic regardless of entity insertion order", () => {
  // Pack several entities into near-overlap so push/repulsion definitely triggers.
  const r = Math.trunc(0.02 * SCALE.m);

  const base = [
    mkHumanoidEntity(1, 1, 0, 0),
    mkHumanoidEntity(2, 1, r, 0),
    mkHumanoidEntity(3, 1, -r, 0),
    mkHumanoidEntity(4, 1, 0, r),
    mkHumanoidEntity(5, 1, 0, -r),
    mkHumanoidEntity(6, 1, r, r),
    mkHumanoidEntity(7, 1, -r, r),
    mkHumanoidEntity(8, 1, r, -r),
    mkHumanoidEntity(9, 1, -r, -r),
    mkHumanoidEntity(10, 1, 0, 0),
  ];

  // Same entities, different insertion order.
  const shuffled = [base[6]!, base[2]!, base[9]!, base[0]!, base[5]!, base[1]!, base[8]!, base[3]!, base[7]!, base[4]!];

  const seed = 424242;
  const ctx = { tractionCoeff: q(0.9) };

  // No commands; push/repulsion should still run during movement/physics.
  const cmds: CommandMap = new Map();

  const wA = mkWorld(seed, base);
  const wB = mkWorld(seed, shuffled);

  for (let i = 0; i < 10; i++) {
    stepWorld(wA, cmds, ctx as any);
    stepWorld(wB, cmds, ctx as any);
  }

  expect(snapshot(wA)).toEqual(snapshot(wB));
});