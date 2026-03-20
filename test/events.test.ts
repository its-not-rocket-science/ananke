import { expect, test } from "vitest";
import { ImpactEvent, sortEventsDeterministic } from "../src/sim/events";
import { mkImpactEvent } from "../src/sim/testing.js";

test("impact events sort deterministically by attackerId then targetId", () => {
  const ev: ImpactEvent[] = [
    mkImpactEvent(5, 9),
    mkImpactEvent(2, 9),
    mkImpactEvent(2, 1),
    mkImpactEvent(5, 3),
  ];

  sortEventsDeterministic(ev);

  expect(ev.map(e => [e.attackerId, e.targetId])).toEqual([
    [2, 1],
    [2, 9],
    [5, 3],
    [5, 9],
  ]);
});