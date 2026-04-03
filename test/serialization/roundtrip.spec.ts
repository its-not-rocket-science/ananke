import { describe, expect, it } from "vitest";
import { createWorld } from "../../src/world-factory.js";
import { stepWorld } from "../../src/sim/kernel.js";
import { q } from "../../src/units.js";
import { hashWorldState } from "../../src/netcode.js";
import { exportWorldState, importWorldState, resetSerializationStream } from "../../src/serialization/binary.js";
import type { WorldState } from "../../src/sim/world.js";

function makeWorld(seed = 777): WorldState {
  return createWorld(seed, [
    { id: 1, teamId: 1, seed, archetype: "KNIGHT_INFANTRY", weaponId: "wpn_longsword" },
    { id: 2, teamId: 2, seed: seed + 1, archetype: "HUMAN_BASE", weaponId: "wpn_club" },
  ]);
}

function makeV1Blob(world: WorldState): Uint8Array {
  const MAGIC = 0x414e4b57;
  const payloadObj = {
    version: 1,
    timestampMs: 123,
    seed: world.seed,
    world,
  };
  const payload = new TextEncoder().encode(JSON.stringify(payloadObj));
  let checksum = 0x811c9dc5;
  for (const b of payload) {
    checksum ^= b;
    checksum = Math.imul(checksum, 0x01000193) >>> 0;
  }
  const out = new Uint8Array(28 + payload.length);
  const view = new DataView(out.buffer);
  let off = 0;
  view.setUint32(off, MAGIC, true); off += 4;
  view.setUint32(off, 1, true); off += 4;
  view.setUint32(off, 123, true); off += 4;
  view.setUint32(off, 0, true); off += 4;
  view.setUint32(off, checksum, true); off += 4;
  view.setUint32(off, 0, true); off += 4;
  view.setUint32(off, payload.length, true); off += 4;
  out.set(payload, off);
  return out;
}

describe("serialization/binary", () => {
  it("round-trips and remains deterministic after one more step", () => {
    resetSerializationStream();
    const world = makeWorld();
    const bytes = exportWorldState(world);
    const restored = importWorldState(bytes);

    const cmds = new Map([[1, [{ kind: "attack" as const, targetId: 2, intensity: q(0.5) }]]]);
    stepWorld(world, cmds, { tractionCoeff: q(0.9) });
    stepWorld(restored, cmds, { tractionCoeff: q(0.9) });

    expect(hashWorldState(restored)).toBe(hashWorldState(world));
  });

  it("supports incremental snapshots changed since last snapshot", () => {
    resetSerializationStream();
    const world = makeWorld(1234);
    const full = exportWorldState(world);
    const restored0 = importWorldState(full);

    stepWorld(world, new Map(), { tractionCoeff: q(0.9) });
    const delta = exportWorldState(world);
    const restored1 = importWorldState(delta);

    expect(restored0.tick).toBe(0);
    expect(restored1.tick).toBe(world.tick);
    expect(hashWorldState(restored1)).toBe(hashWorldState(world));
  });

  it("fuzzes random seeds and verifies checksum guard", () => {
    for (let i = 0; i < 25; i++) {
      resetSerializationStream();
      const world = makeWorld(1000 + i);
      const data = exportWorldState(world);
      const corrupted = new Uint8Array(data);
      corrupted[corrupted.length - 1] ^= 0xff;
      expect(() => importWorldState(corrupted)).toThrow(/checksum mismatch/);
    }
  });

  it("migrates v1 snapshots into v2 runtime model", () => {
    resetSerializationStream();
    const world = makeWorld(2026);
    const v1 = makeV1Blob(world);
    const migrated = importWorldState(v1);

    expect(migrated.seed).toBe(world.seed);
    expect(migrated.tick).toBe(world.tick);
    expect(hashWorldState(migrated)).toBe(hashWorldState(world));
  });
});
