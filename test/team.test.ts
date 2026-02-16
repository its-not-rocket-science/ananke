import { expect, test } from "vitest";
import { isEnemy } from "../src/sim/team";

test("isEnemy compares teamId", () => {
  expect(isEnemy({ teamId: 1 } as any, { teamId: 2 } as any)).toBe(true);
  expect(isEnemy({ teamId: 1 } as any, { teamId: 1 } as any)).toBe(false);
});