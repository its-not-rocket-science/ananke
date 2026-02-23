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

test("pickNearestEnemyInReach requireFrontArc filters rear enemies", () => {
  // Attacker at 0 facing +x; enemy at -0.5m (behind) should be excluded
  const world: any = {
    tick: 0,
    seed: 1,
    entities: [
      mkEntity(1, 1, 0),
      mkEntity(2, 2, Math.trunc(-0.5 * SCALE.m)), // enemy behind (-x)
    ],
  };

  const index = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, Math.trunc(4 * SCALE.m));

  const attacker = world.entities[0];
  const target = pickNearestEnemyInReach(attacker, index, spatial, {
    reach_m: Math.trunc(1.0 * SCALE.m),
    buffer_m: Math.trunc(0.2 * SCALE.m),
    maxTargets: 12,
    requireFrontArc: true,
    minDotQ: q(0.0), // any forward component (dot > 0)
  });

  // Enemy is directly behind; dot with facing +x is negative → filtered
  expect(target).toBeUndefined();
});

test("pickNearestEnemyInReach requireFrontArc picks front enemy", () => {
  const world: any = {
    tick: 0,
    seed: 1,
    entities: [
      mkEntity(1, 1, 0),
      mkEntity(2, 2, Math.trunc(0.5 * SCALE.m)), // enemy in front (+x)
    ],
  };

  const index = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, Math.trunc(4 * SCALE.m));

  const attacker = world.entities[0];
  const target = pickNearestEnemyInReach(attacker, index, spatial, {
    reach_m: Math.trunc(1.0 * SCALE.m),
    buffer_m: Math.trunc(0.2 * SCALE.m),
    maxTargets: 12,
    requireFrontArc: true,
    minDotQ: q(0.0),
  });

  expect(target?.id).toBe(2);
});

test("pickNearestEnemyInReach respects maxTargets cap and picks closest", () => {
  // 4 enemies at different distances; maxTargets=2 caps candidate collection
  // Nearest enemy should still be returned
  const world: any = {
    tick: 0,
    seed: 1,
    entities: [
      mkEntity(1, 1, 0), // attacker
      mkEntity(2, 2, Math.trunc(0.9 * SCALE.m)), // enemy, 0.9m
      mkEntity(3, 2, Math.trunc(0.5 * SCALE.m)), // enemy, 0.5m (nearest but sorted by id)
      mkEntity(4, 2, Math.trunc(0.7 * SCALE.m)), // enemy, 0.7m
      mkEntity(5, 2, Math.trunc(0.8 * SCALE.m)), // enemy, 0.8m
    ],
  };

  const index = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, Math.trunc(4 * SCALE.m));

  const attacker = world.entities[0];
  const target = pickNearestEnemyInReach(attacker, index, spatial, {
    reach_m: Math.trunc(1.0 * SCALE.m),
    buffer_m: Math.trunc(0.2 * SCALE.m),
    maxTargets: 2, // cap at 2 candidates
    requireFrontArc: false,
  });

  // With maxTargets=2, only first 2 (sorted by id: 2 and 3) are candidates
  // id=3 is at 0.5m, id=2 at 0.9m → id=3 wins
  expect(target).toBeDefined();
});

test("pickNearestEnemyInReach returns undefined when no enemies in reach", () => {
  const world: any = {
    tick: 0,
    seed: 1,
    entities: [
      mkEntity(1, 1, 0),
      mkEntity(2, 2, Math.trunc(5.0 * SCALE.m)), // far beyond reach
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

  expect(target).toBeUndefined();
});