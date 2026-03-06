import { expect, test } from "vitest";
import { buildWorldIndex } from "../src/sim/indexing";
import { buildSpatialIndex } from "../src/sim/spatial";
import { isMeleeLaneOccludedByFriendly } from "../src/sim/occlusion";
import { SCALE } from "../src/units";
import { mkWorld, mkHumanoidEntity } from "../src";


test("rear-rank melee lane is occluded by a friendly in between", () => {
  const A = mkHumanoidEntity(1, 1, 0, 0);
  const F = mkHumanoidEntity(2, 1, Math.trunc(0.35 * SCALE.m), 0);
  const T = mkHumanoidEntity(3, 2, Math.trunc(0.70 * SCALE.m), 0);

  const world = mkWorld(1, [A, F, T]);
  // const world: any = { tick: 0, seed: 1, entities: [A, F, T] };
  world.entities.sort((a, b) => a.id - b.id);

  const index = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, Math.trunc(4 * SCALE.m));

  const blocked = isMeleeLaneOccludedByFriendly(A, T, index, spatial, {
    laneRadius_m: Math.trunc(0.35 * SCALE.m),
  });

  expect(blocked).toBe(true);
});

test("lane is not occluded if friendly is outside corridor", () => {
  const A = mkHumanoidEntity(1, 1, 0, 0);
  const F = mkHumanoidEntity(2, 1, Math.trunc(0.35 * SCALE.m), Math.trunc(0.60 * SCALE.m)); // offset in y
  const T = mkHumanoidEntity(3, 2, Math.trunc(0.70 * SCALE.m), 0);

  const world = mkWorld(1, [A, F, T]);
  world.entities.sort((a, b) => a.id - b.id);

  const index = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, Math.trunc(4 * SCALE.m));

  const blocked = isMeleeLaneOccludedByFriendly(A, T, index, spatial, {
    laneRadius_m: Math.trunc(0.35 * SCALE.m),
  });

  expect(blocked).toBe(false);
});