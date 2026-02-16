import { expect, test } from "vitest";
import { buildWorldIndex } from "../src/sim/indexing";
import { buildSpatialIndex } from "../src/sim/spatial";
import { isMeleeLaneOccludedByFriendly } from "../src/sim/occlusion";
import { v3 } from "../src/sim/vec3";
import { SCALE } from "../src/units";

function e(id: number, teamId: number, x_m: number, y_m = 0) {
  return {
    id,
    teamId,
    position_m: v3(x_m, y_m, 0),
    injury: { dead: false },
  } as any;
}

test("rear-rank melee lane is occluded by a friendly in between", () => {
  const A = e(1, 1, 0);                          // attacker
  const F = e(2, 1, Math.trunc(0.35 * SCALE.m));  // friendly in lane
  const T = e(3, 2, Math.trunc(0.70 * SCALE.m));  // enemy target

  const world: any = { tick: 0, seed: 1, entities: [A, F, T] };
  world.entities.sort((a: any, b: any) => a.id - b.id);

  const index = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, Math.trunc(4 * SCALE.m));

  const blocked = isMeleeLaneOccludedByFriendly(A, T, index, spatial, {
    laneRadius_m: Math.trunc(0.35 * SCALE.m),
  });

  expect(blocked).toBe(true);
});

test("lane is not occluded if friendly is outside corridor", () => {
  const A = e(1, 1, 0);
  const F = e(2, 1, Math.trunc(0.35 * SCALE.m), Math.trunc(0.60 * SCALE.m)); // offset in y
  const T = e(3, 2, Math.trunc(0.70 * SCALE.m));

  const world: any = { tick: 0, seed: 1, entities: [A, F, T] };
  world.entities.sort((a: any, b: any) => a.id - b.id);

  const index = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, Math.trunc(4 * SCALE.m));

  const blocked = isMeleeLaneOccludedByFriendly(A, T, index, spatial, {
    laneRadius_m: Math.trunc(0.35 * SCALE.m),
  });

  expect(blocked).toBe(false);
});