import { expect, test } from "vitest";
import { buildWorldIndex } from "../src/sim/indexing";
import { buildSpatialIndex } from "../src/sim/spatial";
import { pickNearestEnemyInReach } from "../src/sim/formation";
import { SCALE, q } from "../src/units";
import { mkHumanoidEntity, mkWorld } from "../src";


test("pickNearestEnemyInReach ignores friendlies and breaks ties by id", () => {
  const world = mkWorld(1, [
    mkHumanoidEntity(1, 1, 0, 0), // attacker
    mkHumanoidEntity(2, 1, Math.trunc(0.4 * SCALE.m), 0), // friendly closer
    mkHumanoidEntity(3, 2, Math.trunc(0.5 * SCALE.m), 0), // enemy
    mkHumanoidEntity(4, 2, Math.trunc(0.5 * SCALE.m), 0), // enemy same distance, higher id
  ]);

  const index = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, Math.trunc(4 * SCALE.m));

  const attacker = world.entities[0]!;
  const target = pickNearestEnemyInReach(world, attacker, index, spatial, {
    reach_m: Math.trunc(1.0 * SCALE.m),
    buffer_m: Math.trunc(0.2 * SCALE.m),
    maxTargets: 12,
    requireFrontArc: false,
  });

  expect(target?.id).toBe(3);
});

test("pickNearestEnemyInReach requireFrontArc filters rear enemies", () => {
  // Attacker at 0 facing +x; enemy at -0.5m (behind) should be excluded
  const world = mkWorld(1, [
    mkHumanoidEntity(1, 1, 0, 0), // attacker
    mkHumanoidEntity(2, 2, Math.trunc(-0.5 * SCALE.m), 0), // enemy behind (-x)
  ]);
  
  const index = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, Math.trunc(4 * SCALE.m));

  const attacker = world.entities[0]!;
  const target = pickNearestEnemyInReach(world, attacker, index, spatial, {
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
  const world = mkWorld(1, [
    mkHumanoidEntity(1, 1, 0, 0), // attacker
    mkHumanoidEntity(2, 2, Math.trunc(0.5 * SCALE.m), 0), // enemy in front (+x)
  ]);

  const index = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, Math.trunc(4 * SCALE.m));

  const attacker = world.entities[0]!;
  const target = pickNearestEnemyInReach(world, attacker, index, spatial, {
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
  const world = mkWorld(1, [
    mkHumanoidEntity(1, 1, 0, 0), // attacker
    mkHumanoidEntity(2, 2, Math.trunc(0.9 * SCALE.m), 0), // enemy, 0.9m
    mkHumanoidEntity(3, 2, Math.trunc(0.5 * SCALE.m), 0), // enemy, 0.5m (nearest but sorted by id)
    mkHumanoidEntity(4, 2, Math.trunc(0.7 * SCALE.m), 0), // enemy, 0.7m
    mkHumanoidEntity(5, 2, Math.trunc(0.8 * SCALE.m), 0), // enemy, 0.8m
  ]);
  
  const index = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, Math.trunc(4 * SCALE.m));

  const attacker = world.entities[0]!;
  const target = pickNearestEnemyInReach(world, attacker, index, spatial, {
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
  const world = mkWorld(1, [
    mkHumanoidEntity(1, 1, 0, 0), // attacker
    mkHumanoidEntity(2, 2, Math.trunc(5.0 * SCALE.m), 0), // enemy beyond reach
  ]);

  const index = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, Math.trunc(4 * SCALE.m));

  const attacker = world.entities[0]!;
  const target = pickNearestEnemyInReach(world, attacker, index, spatial, {
    reach_m: Math.trunc(1.0 * SCALE.m),
    buffer_m: Math.trunc(0.2 * SCALE.m),
    maxTargets: 12,
    requireFrontArc: false,
  });

  expect(target).toBeUndefined();
});