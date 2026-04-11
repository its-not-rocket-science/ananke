import { describe, expect, test } from "vitest";
import { assertDeterministicWorldLike } from "../src/determinism";
import { stepWorld } from "../src/sim/kernel";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { q } from "../src/units";

describe("deterministic world invariants", () => {
  test("accepts a normalized deterministic world", () => {
    const world = mkWorld(1337, [
      mkHumanoidEntity(1, 1, 0, 0),
      mkHumanoidEntity(2, 2, 10_000, 0),
    ]);

    expect(() => assertDeterministicWorldLike(world, "test")).not.toThrow();
  });

  test("rejects non-deterministic entity ordering", () => {
    const world = mkWorld(1337, [
      mkHumanoidEntity(1, 1, 0, 0),
      mkHumanoidEntity(2, 2, 10_000, 0),
    ]);
    world.entities.reverse();

    expect(() => assertDeterministicWorldLike(world, "test")).toThrow(/strictly ascending/i);
  });

  test("strict mode in stepWorld fails on invariant violations", () => {
    const world = mkWorld(1337, [
      mkHumanoidEntity(1, 1, 0, 0),
      mkHumanoidEntity(2, 2, 10_000, 0),
    ]);
    world.entities[0]!.injury.shock = Number.NaN;

    expect(() =>
      stepWorld(world, new Map(), { tractionCoeff: q(1), strictDeterminism: true })
    ).toThrow(/invariant failed/i);
  });
});
