import { expect, test } from "vitest";
import { sortEventsDeterministic } from "../src/sim/events";

test("impact events sort deterministically by attackerId then targetId", () => {
  const ev: any[] = [
    { attackerId: 5, targetId: 9 },
    { attackerId: 2, targetId: 9 },
    { attackerId: 2, targetId: 1 },
    { attackerId: 5, targetId: 3 },
  ];

  sortEventsDeterministic(ev);

  expect(ev.map(e => [e.attackerId, e.targetId])).toEqual([
    [2, 1],
    [2, 9],
    [5, 3],
    [5, 9],
  ]);
});