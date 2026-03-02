// test/replay.test.ts — Phase 13: deterministic replay system

import { WorldState } from "../src";
import { describe, it, expect } from "vitest";
import { q, to } from "../src/units";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import { STARTER_WEAPONS } from "../src/equipment";
import {
  ReplayRecorder,
  replayTo,
  serializeReplay,
  deserializeReplay,
} from "../src/replay";

const BASE_CTX = { tractionCoeff: q(0.80) };
const club = STARTER_WEAPONS.find(w => w.id === "wpn_club")!;

// ── ReplayRecorder ────────────────────────────────────────────────────────────

describe("ReplayRecorder", () => {
  it("snapshots initial state without mutating original", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    const recorder = new ReplayRecorder(world);

    // Advance the live world
    stepWorld(world, new Map(), BASE_CTX);
    const liveTick = world.tick;

    // Snapshot should still be at tick 0
    const replay = recorder.toReplay();
    expect(replay.initialState.tick).toBe(0);
    expect(liveTick).toBeGreaterThan(0);
  });

  it("records one frame per tick", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    const recorder = new ReplayRecorder(world);

    for (let i = 0; i < 5; i++) {
      recorder.record(world.tick, new Map());
      stepWorld(world, new Map(), BASE_CTX);
    }

    const replay = recorder.toReplay();
    expect(replay.frames).toHaveLength(5);
    expect(replay.frames[0]!.tick).toBe(0);
    expect(replay.frames[4]!.tick).toBe(4);
  });

  it("records commands in each frame", () => {
    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    attacker.loadout.items = [club];
    const target = mkHumanoidEntity(2, 2, to.m(0.5), 0);
    const world = mkWorld(1, [attacker, target]);
    const recorder = new ReplayRecorder(world);

    const cmds = new Map([[1, [{ kind: "attack" as const, targetId: 2, weaponId: club.id, intensity: q(1.0) }]]]);
    recorder.record(world.tick, cmds);
    stepWorld(world, cmds, BASE_CTX);

    const replay = recorder.toReplay();
    expect(replay.frames[0]!.commands).toHaveLength(1);
    expect(replay.frames[0]!.commands[0]![0]).toBe(1); // entityId
  });

  it("toReplay returns independent copies — recorder mutations do not affect returned replay", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    const recorder = new ReplayRecorder(world);
    recorder.record(0, new Map());
    const r1 = recorder.toReplay();
    recorder.record(1, new Map());
    const r2 = recorder.toReplay();
    expect(r1.frames).toHaveLength(1);
    expect(r2.frames).toHaveLength(2);
  });
});

// ── replayTo ──────────────────────────────────────────────────────────────────

describe("replayTo", () => {
  it("reproduces identical entity positions as the live run", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.intent.move = { dir: { x: 1, y: 0, z: 0 }, intensity: q(1.0), mode: "run" };
    const world = mkWorld(1, [e]);
    const recorder = new ReplayRecorder(world);

    for (let i = 0; i < 10; i++) {
      recorder.record(world.tick, new Map());
      stepWorld(world, new Map(), BASE_CTX);
    }

    const liveX = world.entities[0]!.position_m.x;
    const replay = recorder.toReplay();
    const replayed = replayTo(replay, 9, BASE_CTX);

    expect(replayed.entities[0]!.position_m.x).toBe(liveX);
  });

  it("reproduces identical combat damage totals as the live run", () => {
    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    attacker.loadout.items = [club];
    const target = mkHumanoidEntity(2, 2, to.m(0.5), 0);
    const world = mkWorld(42, [attacker, target]);
    const recorder = new ReplayRecorder(world);

    const cmds = new Map([[1, [{ kind: "attack" as const, targetId: 2, weaponId: club.id, intensity: q(1.0) }]]]);
    for (let i = 0; i < 30; i++) {
      recorder.record(world.tick, cmds);
      stepWorld(world, cmds, BASE_CTX);
    }

    const liveDmg = (world: WorldState, id: number) => {
      const t = world.entities.find(e => e.id === id)!;
      return Object.values(t.injury.byRegion).reduce(
        (s, r) => s + r.structuralDamage + r.internalDamage + r.surfaceDamage, 0,
      );
    };

    const liveTotal = liveDmg(world, 2);
    const replayedWorld = replayTo(recorder.toReplay(), 29, BASE_CTX);
    const replayedTotal = liveDmg(replayedWorld, 2);

    expect(replayedTotal).toBe(liveTotal);
  });

  it("replayTo(N) applies frames through tick N — world.tick becomes N+1", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    const recorder = new ReplayRecorder(world);
    for (let i = 0; i < 10; i++) {
      recorder.record(world.tick, new Map());
      stepWorld(world, new Map(), BASE_CTX);
    }
    // replayTo(5) applies frames at ticks 0-5 (6 frames), world.tick ends at 6
    const r = replayTo(recorder.toReplay(), 5, BASE_CTX);
    expect(r.tick).toBe(6);
  });

  it("replayTo(0) returns world after 1 step (tick becomes 1)", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    const recorder = new ReplayRecorder(world);
    recorder.record(0, new Map());
    stepWorld(world, new Map(), BASE_CTX);

    const r = replayTo(recorder.toReplay(), 0, BASE_CTX);
    expect(r.tick).toBe(1);
  });

  it("does not mutate the Replay object", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    const recorder = new ReplayRecorder(world);
    recorder.record(0, new Map());
    const replay = recorder.toReplay();
    const initialTick = replay.initialState.tick;

    replayTo(replay, 0, BASE_CTX);
    replayTo(replay, 0, BASE_CTX); // call twice to verify no mutation

    expect(replay.initialState.tick).toBe(initialTick);
  });
});

// ── Serialisation ─────────────────────────────────────────────────────────────

describe("serializeReplay / deserializeReplay", () => {
  it("round-trips a simple replay", () => {
    const world = mkWorld(7, [mkHumanoidEntity(1, 1, 0, 0)]);
    const recorder = new ReplayRecorder(world);
    recorder.record(0, new Map());
    stepWorld(world, new Map(), BASE_CTX);

    const replay = recorder.toReplay();
    const json = serializeReplay(replay);
    const restored = deserializeReplay(json);

    expect(typeof json).toBe("string");
    expect(restored.frames).toHaveLength(1);
    expect(restored.initialState.tick).toBe(0);
  });

  it("restored replay produces same result as original", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.intent.move = { dir: { x: 0, y: 1, z: 0 }, intensity: q(1.0), mode: "run" };
    const world = mkWorld(99, [e]);
    const recorder = new ReplayRecorder(world);

    for (let i = 0; i < 8; i++) {
      recorder.record(world.tick, new Map());
      stepWorld(world, new Map(), BASE_CTX);
    }

    const liveY = world.entities[0]!.position_m.y;
    const restored = deserializeReplay(serializeReplay(recorder.toReplay()));
    const replayed = replayTo(restored, 7, BASE_CTX);

    expect(replayed.entities[0]!.position_m.y).toBe(liveY);
  });

  it("serialised JSON is a string containing 'initialState'", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    const recorder = new ReplayRecorder(world);
    const json = serializeReplay(recorder.toReplay());
    expect(json).toContain("initialState");
  });

  it("round-trips a replay containing an entity with armourState Map", async () => {
    const { STARTER_ARMOUR_11C } = await import("../src/equipment");
    const reactive = STARTER_ARMOUR_11C.find(a => a.id === "arm_reactive")!;
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.loadout.items = [reactive];
    const world = mkWorld(1, [e]);

    // Run one tick to initialize armourState
    stepWorld(world, new Map(), BASE_CTX);
    const recorder = new ReplayRecorder(world);
    recorder.record(world.tick, new Map());

    const json = serializeReplay(recorder.toReplay());
    const restored = deserializeReplay(json);

    // armourState should be a Map, not a plain object
    const restoredArmourState = restored.initialState.entities[0]!.armourState;
    expect(restoredArmourState).toBeInstanceOf(Map);
    expect(restoredArmourState!.has("arm_reactive")).toBe(true);
  });
});
