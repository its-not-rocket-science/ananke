import { expect, test } from "vitest";
import { applyFrontageCap } from "../src/sim/frontage";
import { buildWorldIndex } from "../src/sim/indexing";
import { SCALE } from "../src/units";
import { mkHumanoidEntity, mkWorld, mkImpactEvent } from "../src/sim/testing.js";


test("frontage cap keeps nearest attackers, tie-break by attackerId", () => {
  // target at 0
  const target = mkHumanoidEntity(99, 0, 0, 0); // target on team 2 at origin

  // attackers at different distances; two at same distance to test id tie-break
  const a1 = mkHumanoidEntity(1, 1, Math.trunc(0.30 * SCALE.m), 0);
  const a2 = mkHumanoidEntity(2, 1, Math.trunc(0.20 * SCALE.m), 0);
  const a3 = mkHumanoidEntity(3, 1, Math.trunc(0.20 * SCALE.m), 0);
  const a4 = mkHumanoidEntity(4, 1, Math.trunc(0.50 * SCALE.m), 0);

  const world = mkWorld(1, [a1, a2, a3, a4, target]);
  world.entities.sort((a, b) => a.id - b.id);

  const index = buildWorldIndex(world);

  const impacts = [
    mkImpactEvent(1, 99),
    mkImpactEvent(2, 99),
    mkImpactEvent(3, 99),
    mkImpactEvent(4, 99),
  ];

  const kept = applyFrontageCap(impacts, index, { maxEngagersPerTarget: 2 });

  // expect the two nearest are attacker 2 and 3 at same distance,
  // but tie-break keeps smaller attackerId first (2) then (3)
  expect(kept.map(e => e.attackerId).sort((a, b) => a - b)).toEqual([2, 3]);
});