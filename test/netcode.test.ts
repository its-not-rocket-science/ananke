// test/netcode.test.ts — PA-10: Deterministic Networking Kit

import { describe, it, expect } from "vitest";
import { q, to } from "../src/units";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import { STARTER_WEAPONS } from "../src/equipment";
import { ReplayRecorder, serializeReplay } from "../src/replay";
import {
  hashWorldState,
  diffReplays,
  diffReplayJson,
  type ReplayDiff,
} from "../src/netcode";

const BASE_CTX = { tractionCoeff: q(1.0) };
const club = STARTER_WEAPONS.find(w => w.id === "wpn_club")!;

// ── hashWorldState ─────────────────────────────────────────────────────────────

describe("hashWorldState", () => {
  it("returns a bigint", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    expect(typeof hashWorldState(world)).toBe("bigint");
  });

  it("is deterministic — same world, same hash", () => {
    const world = mkWorld(42, [mkHumanoidEntity(1, 1, 0, 0)]);
    expect(hashWorldState(world)).toBe(hashWorldState(world));
  });

  it("is stable across two independently constructed identical worlds", () => {
    const worldA = mkWorld(7, [mkHumanoidEntity(1, 1, 0, 0)]);
    const worldB = mkWorld(7, [mkHumanoidEntity(1, 1, 0, 0)]);
    expect(hashWorldState(worldA)).toBe(hashWorldState(worldB));
  });

  it("changes after stepWorld", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    const before = hashWorldState(world);
    stepWorld(world, new Map(), BASE_CTX);
    const after = hashWorldState(world);
    expect(after).not.toBe(before);
  });

  it("tracks tick — same state, different tick → different hash", () => {
    const worldA = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    const worldB = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    stepWorld(worldA, new Map(), BASE_CTX);
    // worldA is now at tick 1, worldB at tick 0
    expect(hashWorldState(worldA)).not.toBe(hashWorldState(worldB));
  });

  it("is sensitive to entity position", () => {
    const worldA = mkWorld(1, [mkHumanoidEntity(1, 1, to.m(0), 0)]);
    const worldB = mkWorld(1, [mkHumanoidEntity(1, 1, to.m(5), 0)]);
    expect(hashWorldState(worldA)).not.toBe(hashWorldState(worldB));
  });

  it("is insensitive to entity array order when ids differ", () => {
    const e1a = mkHumanoidEntity(1, 1, 0, 0);
    const e2a = mkHumanoidEntity(2, 1, to.m(2), 0);
    const worldA = mkWorld(1, [e1a, e2a]);

    const e1b = mkHumanoidEntity(1, 1, 0, 0);
    const e2b = mkHumanoidEntity(2, 1, to.m(2), 0);
    const worldB = mkWorld(1, [e2b, e1b]); // reversed order

    expect(hashWorldState(worldA)).toBe(hashWorldState(worldB));
  });

  it("two parallel simulations stay in sync under identical commands", () => {
    const worldA = mkWorld(99, [mkHumanoidEntity(1, 1, 0, 0)]);
    const worldB = mkWorld(99, [mkHumanoidEntity(1, 1, 0, 0)]);

    for (let i = 0; i < 5; i++) {
      stepWorld(worldA, new Map(), BASE_CTX);
      stepWorld(worldB, new Map(), BASE_CTX);
      expect(hashWorldState(worldA)).toBe(hashWorldState(worldB));
    }
  });

  it("detects divergence when one world receives a different command", () => {
    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    attacker.loadout.items = [club];
    const target = mkHumanoidEntity(2, 2, to.m(0.5), 0);

    const worldA = mkWorld(1, [structuredClone(attacker), structuredClone(target)]);
    const worldB = mkWorld(1, [structuredClone(attacker), structuredClone(target)]);

    // Both worlds identical before step
    expect(hashWorldState(worldA)).toBe(hashWorldState(worldB));

    // worldA gets an attack command; worldB does not
    const attackCmd = new Map([[1, [{ kind: "attack" as const, targetId: 2, weaponId: club.id, intensity: q(1.0) }]]]);
    stepWorld(worldA, attackCmd, BASE_CTX);
    stepWorld(worldB, new Map(), BASE_CTX);

    expect(hashWorldState(worldA)).not.toBe(hashWorldState(worldB));
  });

  it("handles world with armourState Map on entity", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.armourState = new Map([["chest", { resistRemaining_J: 500 }]]);
    const world = mkWorld(1, [e]);
    const h1 = hashWorldState(world);
    const h2 = hashWorldState(world);
    expect(h1).toBe(h2);
  });

  it("Map field order does not affect hash", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    e1.armourState = new Map([["chest", { resistRemaining_J: 500 }], ["head", { resistRemaining_J: 200 }]]);

    const e2 = mkHumanoidEntity(1, 1, 0, 0);
    e2.armourState = new Map([["head", { resistRemaining_J: 200 }], ["chest", { resistRemaining_J: 500 }]]);

    const w1 = mkWorld(1, [e1]);
    const w2 = mkWorld(1, [e2]);
    expect(hashWorldState(w1)).toBe(hashWorldState(w2));
  });
});

// ── diffReplays ────────────────────────────────────────────────────────────────

describe("diffReplays", () => {
  it("returns no divergence for identical replays", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    const recorder = new ReplayRecorder(world);

    for (let i = 0; i < 5; i++) {
      recorder.record(world.tick, new Map());
      stepWorld(world, new Map(), BASE_CTX);
    }

    const replay = recorder.toReplay();
    const result = diffReplays(replay, replay, BASE_CTX);

    expect(result.divergeAtTick).toBeUndefined();
    expect(result.hashA).toBeUndefined();
    expect(result.hashB).toBeUndefined();
    expect(result.ticksCompared).toBe(5);
  });

  it("detects divergence at tick -1 when initial states differ", () => {
    const worldA = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    const worldB = mkWorld(2, [mkHumanoidEntity(1, 1, 0, 0)]); // different seed

    const recA = new ReplayRecorder(worldA);
    const recB = new ReplayRecorder(worldB);

    recA.record(worldA.tick, new Map());
    recB.record(worldB.tick, new Map());
    stepWorld(worldA, new Map(), BASE_CTX);
    stepWorld(worldB, new Map(), BASE_CTX);

    const result = diffReplays(recA.toReplay(), recB.toReplay(), BASE_CTX);

    expect(result.divergeAtTick).toBe(-1);
    expect(result.hashA).toBeDefined();
    expect(result.hashB).toBeDefined();
    expect(result.hashA).not.toBe(result.hashB);
    expect(result.ticksCompared).toBe(0);
  });

  it("detects divergence at the tick an attack command differs", () => {
    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    attacker.loadout.items = [club];
    const target = mkHumanoidEntity(2, 2, to.m(0.5), 0);

    // Build two separate simulations from same seed
    const worldA = mkWorld(42, [structuredClone(attacker), structuredClone(target)]);
    const worldB = mkWorld(42, [structuredClone(attacker), structuredClone(target)]);

    const recA = new ReplayRecorder(worldA);
    const recB = new ReplayRecorder(worldB);

    // Tick 0: worldA attacks, worldB idles
    const attackCmd = new Map([[1, [{ kind: "attack" as const, targetId: 2, weaponId: club.id, intensity: q(1.0) }]]]);
    recA.record(worldA.tick, attackCmd);
    recB.record(worldB.tick, new Map());
    stepWorld(worldA, attackCmd, BASE_CTX);
    stepWorld(worldB, new Map(), BASE_CTX);

    // Tick 1: both idle
    recA.record(worldA.tick, new Map());
    recB.record(worldB.tick, new Map());
    stepWorld(worldA, new Map(), BASE_CTX);
    stepWorld(worldB, new Map(), BASE_CTX);

    const result = diffReplays(recA.toReplay(), recB.toReplay(), BASE_CTX);

    expect(result.divergeAtTick).toBeDefined();
    expect(typeof result.divergeAtTick).toBe("number");
    expect(result.hashA).not.toBe(result.hashB);
    expect(result.ticksCompared).toBeGreaterThanOrEqual(1);
  });

  it("handles replays of different lengths gracefully", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    const recA = new ReplayRecorder(world);
    const recB = new ReplayRecorder(mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]));

    // A has 5 ticks, B has 3 — no divergence in the 3 compared ticks
    for (let i = 0; i < 5; i++) {
      recA.record(world.tick, new Map());
      stepWorld(world, new Map(), BASE_CTX);
    }
    const worldB = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    for (let i = 0; i < 3; i++) {
      recB.record(worldB.tick, new Map());
      stepWorld(worldB, new Map(), BASE_CTX);
    }

    const result = diffReplays(recA.toReplay(), recB.toReplay(), BASE_CTX);
    expect(result.divergeAtTick).toBeUndefined();
    expect(result.ticksCompared).toBe(3); // limited to shorter replay
  });
});

// ── diffReplayJson ──────────────────────────────────────────────────────────────

describe("diffReplayJson", () => {
  it("round-trips through JSON serialization with no divergence", () => {
    const world = mkWorld(5, [mkHumanoidEntity(1, 1, 0, 0)]);
    const recorder = new ReplayRecorder(world);

    for (let i = 0; i < 3; i++) {
      recorder.record(world.tick, new Map());
      stepWorld(world, new Map(), BASE_CTX);
    }

    const json = serializeReplay(recorder.toReplay());
    const result = diffReplayJson(json, json, BASE_CTX);

    expect(result.divergeAtTick).toBeUndefined();
    expect(result.ticksCompared).toBe(3);
  });
});
