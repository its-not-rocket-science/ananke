import { describe, expect, it } from "vitest";

import { createWorld } from "../src/world-factory.js";
import { q } from "../src/units.js";
import { stepWorld } from "../src/sim/kernel.js";
import { ReplayRecorder, serializeReplay, deserializeReplay } from "../src/replay.js";
import { exportWorldState, importWorldState, exportLegacyV1WorldState, resetSerializationContext } from "../src/serialization/binary.js";
import { diffWorldState, packDiff, unpackDiff, applyDiff } from "../src/snapshot.js";
import { stampSnapshot, validateSnapshot, migrateWorld } from "../src/schema-migration.js";

function mkWorld(seed: number) {
  return createWorld(seed, [
    { id: 1, teamId: 1, seed: seed + 11, archetype: "HUMAN_BASE", weaponId: "wpn_club", x_m: 0 },
    { id: 2, teamId: 2, seed: seed + 22, archetype: "HUMAN_BASE", weaponId: "wpn_club", x_m: 1.2 },
  ]);
}

describe("documented shipped protocol formats", () => {
  it("save snapshot JSON format round-trips and validates", () => {
    const world = mkWorld(101);
    const stamped = stampSnapshot(world as unknown as Record<string, unknown>, "world");

    const json = JSON.stringify(stamped);
    const loaded = JSON.parse(json) as Record<string, unknown>;
    const migrated = migrateWorld(loaded);

    expect(validateSnapshot(migrated)).toEqual([]);
    expect((migrated as Record<string, unknown>)["_schema"]).toBe("world");
  });

  it("replay format round-trips via serializeReplay/deserializeReplay", () => {
    const world = mkWorld(202);
    const ctx = { tractionCoeff: q(0.9) as never };
    const recorder = new ReplayRecorder(world);

    recorder.record(world.tick, new Map());
    stepWorld(world, new Map(), ctx);

    const json = serializeReplay(recorder.toReplay());
    const restored = deserializeReplay(json);

    expect(restored.frames.length).toBe(1);
    expect(restored.initialState.seed).toBe(202);
  });

  it("binary world snapshot format round-trips (including legacy v1 import)", () => {
    resetSerializationContext();
    const world = mkWorld(303);

    const bytes = exportWorldState(world);
    const restored = importWorldState(bytes);
    expect(restored).toEqual(world);

    const legacyBytes = exportLegacyV1WorldState(world);
    const restoredFromLegacy = importWorldState(legacyBytes);
    expect(restoredFromLegacy).toEqual(world);
  });

  it("binary diff format round-trips pack/unpack/apply", () => {
    const prev = mkWorld(404);
    const next = mkWorld(404);
    const ctx = { tractionCoeff: q(0.85) as never };
    stepWorld(next, new Map(), ctx);

    const diff = diffWorldState(prev, next);
    const bytes = packDiff(diff);
    const unpacked = unpackDiff(bytes);
    const rebuilt = applyDiff(prev, unpacked);

    expect(rebuilt).toEqual(next);
  });
});
