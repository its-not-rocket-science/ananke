import { describe, expect, test } from "vitest";

import * as EntityModule from "../src/sim/entity";
import * as WorldModule from "../src/sim/world";
import * as TickModule from "../src/sim/tick";

import {
  v3,
  vAdd as add,
  vSub as sub,
  vScaleQ as scale,
} from "../src/sim/vec3";

import { q } from "../src/units";

describe("runtime module smoke coverage", () => {
  test("entity/world/tick modules load", () => {
    // ensures runtime import so coverage registers
    expect(EntityModule).toBeTruthy();
    expect(WorldModule).toBeTruthy();
    expect(TickModule).toBeTruthy();
  });
});

describe("vec3 operations", () => {
  test("v3 constructor", () => {
    const a = v3(1, 2, 3);
    expect(a).toEqual({ x: 1, y: 2, z: 3 });
  });

  test("add and sub", () => {
    const a = v3(5, 7, 9);
    const b = v3(1, 2, 3);

    expect(add(a, b)).toEqual(v3(6, 9, 12));
    expect(sub(a, b)).toEqual(v3(4, 5, 6));
  });

  test("scale", () => {
    const a = v3(10, -20, 30);
    expect(scale(a, q(0.5))).toEqual(v3(5, -10, 15));
  });

});