import { expect, test } from "vitest";
import { buildSpatialIndex, queryNearbyIds } from "../src/sim/spatial";
import { v3 } from "../src/sim/vec3";
import { SCALE } from "../src/units";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";

test("spatial query is deterministic and returns sorted ids", () => {
  const world = mkWorld(1, [
    mkHumanoidEntity(10, 1, Math.trunc(0.5 * SCALE.m), 0, 0),
    mkHumanoidEntity(2, 1, Math.trunc(0.7 * SCALE.m), 0, 0),
    mkHumanoidEntity(7, 1, Math.trunc(5.5 * SCALE.m), 0, 0),
  ]);

  const cell = Math.trunc(4 * SCALE.m);
  const idx1 = buildSpatialIndex(world, cell);
  const idx2 = buildSpatialIndex(world, cell);

  const q1 = queryNearbyIds(idx1, v3(0, 0, 0), Math.trunc(2 * SCALE.m));
  const q2 = queryNearbyIds(idx2, v3(0, 0, 0), Math.trunc(2 * SCALE.m));

  expect(q1).toEqual(q2);
  expect(q1).toEqual([2, 10]); // sorted ids in radius
});