import { expect, test } from "vitest";

import { stepWorld } from "../src/sim/kernel";
import type { WorldState } from "../src/sim/world";
import type { CommandMap } from "../src/sim/commands";
import { q, SCALE } from "../src/units";
import { TUNING } from "../src/sim/tuning";

import { mkHumanoidEntity, mkWorld } from "./helpers/entities";


test("push/repulsion produces separating velocities for overlapping entities", () => {
  // within personal radius (~0.45m)
  const sep = Math.trunc(0.20 * SCALE.m);

  const a = mkHumanoidEntity(1, 1, 0, 0);
  const b = mkHumanoidEntity(2, 1, sep, 0);

  const world = mkWorld(999, [a, b]);
  const cmds: CommandMap = new Map(); // no movement commands
  const ctx = { tractionCoeff: q(0.9), tuning: TUNING.tactical };

  stepWorld(world, cmds, ctx as any);

  const A = world.entities[0]!;
  const B = world.entities[1]!;

  // They should have been pushed apart along x
  expect(A.velocity_mps.x).toBeLessThan(0);
  expect(B.velocity_mps.x).toBeGreaterThan(0);
});