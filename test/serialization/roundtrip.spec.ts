import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { createWorld } from "../../src/world-factory.js";
import { stepWorld } from "../../src/sim/kernel.js";
import { q } from "../../src/units.js";
import { exportLegacyV1WorldState, exportWorldState, importWorldState, resetSerializationContext } from "../../src/serialization/binary.js";

function mkWorld(seed: number) {
  return createWorld(seed, [
    { id: 1, teamId: 1, seed: seed + 11, archetype: "HUMAN_BASE", weaponId: "wpn_club", x_m: 0 },
    { id: 2, teamId: 2, seed: seed + 22, archetype: "HUMAN_BASE", weaponId: "wpn_club", x_m: 1.2 },
  ]);
}

describe("world binary serialization", () => {
  it("round-trip world -> serialize -> deserialize -> step -> compare", () => {
    resetSerializationContext();
    const original = mkWorld(42);
    const ctx = { tractionCoeff: q(0.9) as never };

    for (let i = 0; i < 4; i++) stepWorld(original, new Map(), ctx);

    const bytes = exportWorldState(original);
    const restored = importWorldState(bytes);

    stepWorld(original, new Map(), ctx);
    stepWorld(restored, new Map(), ctx);

    expect(restored).toEqual(original);
  });

  it("fuzzes random seeds and validates checksum by successful import", () => {
    resetSerializationContext();
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000000 }), (seed) => {
        const world = mkWorld(seed);
        const bytes = exportWorldState(world);
        const restored = importWorldState(bytes);
        expect(restored.tick).toBe(world.tick);
        expect(restored.seed).toBe(world.seed);
      }),
      { numRuns: 32 },
    );
  });

  it("supports version migration from v1 snapshot to v2 loader", () => {
    resetSerializationContext();
    const world = mkWorld(7);
    const legacy = exportLegacyV1WorldState(world);

    const loaded = importWorldState(legacy);
    expect(loaded).toEqual(world);

    const v2 = exportWorldState(loaded);
    const loadedV2 = importWorldState(v2);
    expect(loadedV2).toEqual(world);
  });

  it("applies incremental snapshots against the previous import", () => {
    resetSerializationContext();
    const world = mkWorld(9001);
    const ctx = { tractionCoeff: q(0.95) as never };

    const first = exportWorldState(world);
    const restored0 = importWorldState(first);
    expect(restored0.tick).toBe(0);

    stepWorld(world, new Map(), ctx);
    const second = exportWorldState(world);
    const restored1 = importWorldState(second);
    expect(restored1).toEqual(world);
  });
});
