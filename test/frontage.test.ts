import { expect, test } from "vitest";
import { applyFrontageCap } from "../src/sim/frontage";
import { buildWorldIndex } from "../src/sim/indexing";
import { v3 } from "../src/sim/vec3";
import { SCALE } from "../src/units";

function ent(id: number, x_m: number) {
  return { id, teamId: 1, position_m: v3(x_m, 0, 0), injury: { dead: false } } as any;
}

test("frontage cap keeps nearest attackers, tie-break by attackerId", () => {
  // target at 0
  const target = ent(99, 0);

  // attackers at different distances; two at same distance to test id tie-break
  const a1 = ent(1, Math.trunc(0.30 * SCALE.m));
  const a2 = ent(2, Math.trunc(0.20 * SCALE.m));
  const a3 = ent(3, Math.trunc(0.20 * SCALE.m)); // same distance as a2, higher id
  const a4 = ent(4, Math.trunc(0.50 * SCALE.m));

  const world: any = { tick: 0, seed: 1, entities: [a1, a2, a3, a4, target] };
  world.entities.sort((a: any, b: any) => a.id - b.id);

  const index = buildWorldIndex(world);

  const impacts: any[] = [
    { kind: "impact", attackerId: 1, targetId: 99 },
    { kind: "impact", attackerId: 2, targetId: 99 },
    { kind: "impact", attackerId: 3, targetId: 99 },
    { kind: "impact", attackerId: 4, targetId: 99 },
  ];

  const kept = applyFrontageCap(impacts as any, index, { maxEngagersPerTarget: 2 });

  // expect the two nearest are attacker 2 and 3 at same distance,
  // but tie-break keeps smaller attackerId first (2) then (3)
  expect(kept.map(e => e.attackerId).sort((a, b) => a - b)).toEqual([2, 3]);
});