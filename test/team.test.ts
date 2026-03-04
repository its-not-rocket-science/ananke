import { expect, test } from "vitest";
import { isEnemy } from "../src/sim/team";
import { Entity } from "../src/sim/entity";

test("isEnemy compares teamId", () => {
  expect(isEnemy({ teamId: 1 } as Entity, { teamId: 2 } as Entity)).toBe(true);
  expect(isEnemy({ teamId: 1 } as Entity, { teamId: 1 } as Entity)).toBe(false);
});