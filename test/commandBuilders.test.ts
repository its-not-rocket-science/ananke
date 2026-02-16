import { expect, test } from "vitest";
import { makeAttackCommand } from "../src/sim/commandBuilders";
import { defendBlock, defendDodge, defendNone, defendParry } from "../src/sim/commandBuilders";
import { q } from "../src/units";

test("makeAttackCommand omits undefined optionals (exactOptionalPropertyTypes safe)", () => {
  const a = makeAttackCommand(10);
  expect(a).toEqual({ kind: "attack", targetId: 10 });

  const b = makeAttackCommand(11, { weaponId: "wpn_knife", intensity: q(0.5) });
  expect(b.kind).toBe("attack");
  expect(b.targetId).toBe(11);
  expect(b.weaponId).toBe("wpn_knife");
  expect(b.intensity).toBe(q(0.5));
});



test("defence command builders set mode + intensity", () => {
  expect(defendNone()).toEqual({ kind: "defend", mode: "none", intensity: q(0) });

  expect(defendBlock()).toEqual({ kind: "defend", mode: "block", intensity: q(1.0) });
  expect(defendParry()).toEqual({ kind: "defend", mode: "parry", intensity: q(1.0) });
  expect(defendDodge()).toEqual({ kind: "defend", mode: "dodge", intensity: q(1.0) });

  expect(defendBlock(q(0.5))).toEqual({ kind: "defend", mode: "block", intensity: q(0.5) });
});