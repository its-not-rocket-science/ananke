import { expect, test } from "vitest";
import { buildWorldIndex } from "../src/sim/indexing";
import { buildSpatialIndex } from "../src/sim/spatial";
import { pickNearestEnemyInReach } from "../src/sim/formation";
import { v3 } from "../src/sim/vec3";
import { SCALE, q } from "../src/units";

function mkEntity(id: number, teamId: number, x_m: number) {
  return {
    id,
    teamId,
    position_m: v3(x_m, 0, 0),
    injury: { dead: false },
    action: { facingDirQ: { x: SCALE.Q, y: 0, z: 0 } }, // facing +x
  } as any;
}

test("pickNearestEnemyInReach ignores friendlies and breaks ties by id", () => {
  const world: any = {
    tick: 0,
    seed: 1,
    entities: [
      mkEntity(1, 1, 0),
      mkEntity(2, 1, Math.trunc(0.4 * SCALE.m)), // friendly closer
      mkEntity(3, 2, Math.trunc(0.5 * SCALE.m)), // enemy
      mkEntity(4, 2, Math.trunc(0.5 * SCALE.m)), // enemy same distance, higher id
    ],
  };

  const index = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, Math.trunc(4 * SCALE.m));

  const attacker = world.entities[0];
  const target = pickNearestEnemyInReach(attacker, index, spatial, {
    reach_m: Math.trunc(1.0 * SCALE.m),
    buffer_m: Math.trunc(0.2 * SCALE.m),
    maxTargets: 12,
    requireFrontArc: false,
  });

  expect(target?.id).toBe(3);
});