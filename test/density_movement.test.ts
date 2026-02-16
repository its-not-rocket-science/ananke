import { expect, test } from "vitest";

import { stepWorld } from "../src/sim/kernel";
import type { WorldState } from "../src/sim/world";
import type { CommandMap } from "../src/sim/commands";
import { v3 } from "../src/sim/vec3";
import { q, SCALE } from "../src/units";
import { TUNING } from "../src/sim/tuning";

import { mkHumanoidEntity, mkWorld } from "./helpers/entities";


function displacementX(world: WorldState, id: number): number {
  const e = world.entities.find(e => e.id === id)!;
  return e.position_m.x;
}

test("density slows movement in a crowd", () => {
  const moverId = 1;


  const cmds: CommandMap = new Map();
  cmds.set(moverId, [
    {
      kind: "move",
      dir: v3(SCALE.Q, 0, 0), // +x
      intensity: q(1.0),
      mode: "sprint",
    },
  ]);

  const ctx = { tractionCoeff: q(0.9), tuning: TUNING.tactical };

    const entitiesHealthy: any[] = [];
  entitiesHealthy.push(mkHumanoidEntity(moverId, 1, 0, 0));
  {
    const far = Math.trunc(5 * SCALE.m);
    entitiesHealthy.push(mkHumanoidEntity(2, 1, far, 0));
    entitiesHealthy.push(mkHumanoidEntity(3, 1, far, far));
  }

  const entitiesCrowded: any[] = [];
  entitiesCrowded.push(mkHumanoidEntity(moverId, 1, 0, 0));
  {
    const r = Math.trunc(0.30 * SCALE.m);
    entitiesCrowded.push(mkHumanoidEntity(2, 1, r, 0));
    entitiesCrowded.push(mkHumanoidEntity(3, 1, -r, 0));
    entitiesCrowded.push(mkHumanoidEntity(4, 1, 0, r));
    entitiesCrowded.push(mkHumanoidEntity(5, 1, 0, -r));
    entitiesCrowded.push(mkHumanoidEntity(6, 1, r, r));
    entitiesCrowded.push(mkHumanoidEntity(7, 1, -r, r));
    entitiesCrowded.push(mkHumanoidEntity(8, 1, r, -r));
    entitiesCrowded.push(mkHumanoidEntity(9, 1, -r, -r));
  }

  const healthy = mkWorld(12345, entitiesHealthy);
  stepWorld(healthy, cmds, ctx as any);
  const dxHealthy = displacementX(healthy, moverId);

  const crowded = mkWorld(12345, entitiesCrowded);
  stepWorld(crowded, cmds, ctx as any);
  const dxCrowded = displacementX(crowded, moverId);

  expect(dxCrowded).toBeLessThan(dxHealthy);
});