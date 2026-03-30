// test/host-loop.test.ts — PA-8: Host Integration Bridge Protocol

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import {
  BRIDGE_SCHEMA_VERSION,
  DEFAULT_TICK_HZ,
  DEFAULT_BRIDGE_PORT,
  DEFAULT_BRIDGE_HOST,
  DEFAULT_STREAM_PATH,
  derivePrimaryState,
  derivePoseOffset,
  serializeBridgeFrame,
  type BridgeFrame,
  type HostLoopConfig,
} from "../src/host-loop.js";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing.js";
import type { AnimationHints } from "../src/model3d.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CFG: HostLoopConfig = { scenarioId: "test-duel", tickHz: 20 };

function blankAnim(overrides: Partial<AnimationHints> = {}): AnimationHints {
  return {
    idle:        SCALE.Q as ReturnType<typeof q>,
    walk:        q(0)    as ReturnType<typeof q>,
    run:         q(0)    as ReturnType<typeof q>,
    sprint:      q(0)    as ReturnType<typeof q>,
    crawl:       q(0)    as ReturnType<typeof q>,
    guardingQ:   q(0)    as ReturnType<typeof q>,
    attackingQ:  q(0)    as ReturnType<typeof q>,
    shockQ:      q(0)    as ReturnType<typeof q>,
    fearQ:       q(0)    as ReturnType<typeof q>,
    prone:       false,
    unconscious: false,
    dead:        false,
    ...overrides,
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("BRIDGE_SCHEMA_VERSION is correct string", () => {
    expect(BRIDGE_SCHEMA_VERSION).toBe("ananke.bridge.frame.v1");
  });
  it("DEFAULT_TICK_HZ = 20", () => {
    expect(DEFAULT_TICK_HZ).toBe(20);
  });
  it("DEFAULT_BRIDGE_PORT = 3001", () => {
    expect(DEFAULT_BRIDGE_PORT).toBe(3001);
  });
  it("DEFAULT_BRIDGE_HOST = 127.0.0.1", () => {
    expect(DEFAULT_BRIDGE_HOST).toBe("127.0.0.1");
  });
  it("DEFAULT_STREAM_PATH = /stream", () => {
    expect(DEFAULT_STREAM_PATH).toBe("/stream");
  });
});

// ── derivePrimaryState ────────────────────────────────────────────────────────

describe("derivePrimaryState", () => {
  it("dead → 'dead' (highest priority)", () => {
    expect(derivePrimaryState(blankAnim({ dead: true, unconscious: true }))).toBe("dead");
  });

  it("unconscious → 'unconscious'", () => {
    expect(derivePrimaryState(blankAnim({ unconscious: true }))).toBe("unconscious");
  });

  it("prone → 'prone'", () => {
    expect(derivePrimaryState(blankAnim({ prone: true, idle: q(0) as ReturnType<typeof q> }))).toBe("prone");
  });

  it("crawl > 0 → 'prone'", () => {
    expect(derivePrimaryState(blankAnim({
      idle:  q(0) as ReturnType<typeof q>,
      crawl: SCALE.Q as ReturnType<typeof q>,
    }))).toBe("prone");
  });

  it("attackingQ > 0 → 'attack'", () => {
    expect(derivePrimaryState(blankAnim({ attackingQ: SCALE.Q as ReturnType<typeof q> }))).toBe("attack");
  });

  it("run > 0 → 'flee'", () => {
    expect(derivePrimaryState(blankAnim({
      idle: q(0) as ReturnType<typeof q>,
      run:  SCALE.Q as ReturnType<typeof q>,
    }))).toBe("flee");
  });

  it("sprint > 0 → 'flee'", () => {
    expect(derivePrimaryState(blankAnim({
      idle:   q(0) as ReturnType<typeof q>,
      sprint: SCALE.Q as ReturnType<typeof q>,
    }))).toBe("flee");
  });

  it("idle → 'idle'", () => {
    expect(derivePrimaryState(blankAnim())).toBe("idle");
  });

  it("priority: unconscious beats attack", () => {
    expect(derivePrimaryState(blankAnim({
      unconscious: true,
      attackingQ:  SCALE.Q as ReturnType<typeof q>,
    }))).toBe("unconscious");
  });

  it("priority: prone beats attack", () => {
    expect(derivePrimaryState(blankAnim({ prone: true, attackingQ: SCALE.Q as ReturnType<typeof q> }))).toBe("prone");
  });
});

// ── derivePoseOffset ──────────────────────────────────────────────────────────

describe("derivePoseOffset", () => {
  it("unknown segment → {0, 0, 0}", () => {
    const off = derivePoseOffset("pelvis", 1.0);
    expect(off).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("zero impairment → zero offset for all canonical segments", () => {
    const segs = ["head", "torso", "leftArm", "rightArm", "leftLeg", "rightLeg"];
    for (const seg of segs) {
      const off = derivePoseOffset(seg, 0);
      expect(off.x).toBe(0);
      expect(off.y).toBe(0);
      expect(off.z).toBe(0);
    }
  });

  it("head at full impairment: y < 0, z = 0", () => {
    const off = derivePoseOffset("head", 1.0);
    expect(off.y).toBeLessThan(0);
    expect(off.z).toBe(0);
  });

  it("thorax / abdomen use same offsets as torso", () => {
    const torso   = derivePoseOffset("torso",   1.0);
    const thorax  = derivePoseOffset("thorax",  1.0);
    const abdomen = derivePoseOffset("abdomen", 1.0);
    expect(thorax).toEqual(torso);
    expect(abdomen).toEqual(torso);
  });

  it("leftArm: x < 0, y = 0 at full impairment", () => {
    const off = derivePoseOffset("leftArm", 1.0);
    expect(off.x).toBeLessThan(0);
    expect(off.y).toBe(0);
  });

  it("rightArm: x > 0 at full impairment (mirrors leftArm)", () => {
    const left  = derivePoseOffset("leftArm",  1.0);
    const right = derivePoseOffset("rightArm", 1.0);
    expect(right.x).toBe(-left.x);
    expect(right.y).toBe(left.y);
  });

  it("legs: both have x != 0 and y < 0 at full impairment", () => {
    const ll = derivePoseOffset("leftLeg",  1.0);
    const rl = derivePoseOffset("rightLeg", 1.0);
    expect(ll.y).toBeLessThan(0);
    expect(rl.y).toBeLessThan(0);
    expect(Math.abs(ll.x)).toBeGreaterThan(0);
    expect(Math.abs(rl.x)).toBeGreaterThan(0);
    expect(rl.x).toBe(-ll.x); // symmetric
  });

  it("offset scales with impairmentQ (half impairment → smaller offset)", () => {
    const full = derivePoseOffset("head", 1.0);
    const half = derivePoseOffset("head", 0.5);
    expect(Math.abs(half.y)).toBeLessThan(Math.abs(full.y));
  });
});

// ── serializeBridgeFrame ──────────────────────────────────────────────────────

describe("serializeBridgeFrame", () => {
  it("returns correct schema version", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(42, [e]);
    const frame = serializeBridgeFrame(world, CFG);
    expect(frame.schema).toBe(BRIDGE_SCHEMA_VERSION);
  });

  it("returns correct scenarioId and tickHz", () => {
    const world = mkWorld(42, [mkHumanoidEntity(1, 1, 0, 0)]);
    const frame = serializeBridgeFrame(world, CFG);
    expect(frame.scenarioId).toBe("test-duel");
    expect(frame.tickHz).toBe(20);
  });

  it("uses DEFAULT_TICK_HZ when tickHz omitted from config", () => {
    const world = mkWorld(42, [mkHumanoidEntity(1, 1, 0, 0)]);
    const frame = serializeBridgeFrame(world, { scenarioId: "no-hz" });
    expect(frame.tickHz).toBe(DEFAULT_TICK_HZ);
  });

  it("includes all world entities", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e2 = mkHumanoidEntity(2, 2, 10 * SCALE.m, 0);
    const world = mkWorld(42, [e1, e2]);
    const frame = serializeBridgeFrame(world, CFG);
    expect(frame.entities).toHaveLength(2);
    expect(frame.entities.map(s => s.entityId).sort()).toEqual([1, 2]);
  });

  it("entity position_m is in real metres (not fixed-point)", () => {
    const X_Sm = 5 * SCALE.m;  // 5 m = 50 000 Sm
    const e = mkHumanoidEntity(1, 1, X_Sm, 0);
    const world = mkWorld(42, [e]);
    const frame = serializeBridgeFrame(world, CFG);
    expect(frame.entities[0]!.position_m.x).toBeCloseTo(5.0, 5);
  });

  it("entity massKg is in real kg", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(42, [e]);
    const frame = serializeBridgeFrame(world, CFG);
    const kg = frame.entities[0]!.massKg;
    expect(kg).toBeGreaterThan(0);
    expect(kg).toBeLessThan(500); // reasonable humanoid mass
  });

  it("condition fields are [0,1] floats, not fixed-point", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(42, [e]);
    const frame = serializeBridgeFrame(world, CFG);
    const cond = frame.entities[0]!.condition;
    expect(cond.shockQ).toBeGreaterThanOrEqual(0);
    expect(cond.shockQ).toBeLessThanOrEqual(1);
    expect(cond.consciousnessQ).toBeGreaterThanOrEqual(0);
    expect(cond.consciousnessQ).toBeLessThanOrEqual(1);
  });

  it("animation Q-values are [0,1] floats", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(42, [e]);
    const frame = serializeBridgeFrame(world, CFG);
    const anim = frame.entities[0]!.animation;
    for (const key of ["idle", "walk", "run", "sprint", "crawl", "guardingQ", "attackingQ"] as const) {
      expect(anim[key]).toBeGreaterThanOrEqual(0);
      expect(anim[key]).toBeLessThanOrEqual(1);
    }
  });

  it("animation.primaryState is a non-empty string", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(42, [e]);
    const frame = serializeBridgeFrame(world, CFG);
    expect(typeof frame.entities[0]!.animation.primaryState).toBe("string");
    expect(frame.entities[0]!.animation.primaryState.length).toBeGreaterThan(0);
  });

  it("animation.locomotionBlend is max of locomotion weights", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(42, [e]);
    const frame = serializeBridgeFrame(world, CFG);
    const anim = frame.entities[0]!.animation;
    const max = Math.max(anim.idle, anim.walk, anim.run, anim.sprint, anim.crawl);
    expect(anim.locomotionBlend).toBeCloseTo(max, 5);
  });

  it("dead entity: condition.dead = true, animation.dead = true", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.injury.dead = true;
    const world = mkWorld(42, [e]);
    const frame = serializeBridgeFrame(world, CFG);
    const snap = frame.entities[0]!;
    expect(snap.condition.dead).toBe(true);
    expect(snap.animation.dead).toBe(true);
    expect(snap.animation.primaryState).toBe("dead");
  });

  it("pose modifiers: impairmentQ is [0,1] float per segment", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(42, [e]);
    const frame = serializeBridgeFrame(world, CFG);
    for (const pm of frame.entities[0]!.pose) {
      expect(pm.impairmentQ).toBeGreaterThanOrEqual(0);
      expect(pm.impairmentQ).toBeLessThanOrEqual(1);
    }
  });

  it("pose modifiers include localOffset_m", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(42, [e]);
    const frame = serializeBridgeFrame(world, CFG);
    for (const pm of frame.entities[0]!.pose) {
      expect(pm.localOffset_m).toBeDefined();
      expect(typeof pm.localOffset_m.x).toBe("number");
    }
  });

  it("grapple.gripQ is [0,1] float", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(42, [e]);
    const frame = serializeBridgeFrame(world, CFG);
    const grip = frame.entities[0]!.grapple.gripQ;
    expect(grip).toBeGreaterThanOrEqual(0);
    expect(grip).toBeLessThanOrEqual(1);
  });

  it("generatedAt is an ISO 8601 timestamp string", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(42, [e]);
    const frame = serializeBridgeFrame(world, CFG);
    expect(() => new Date(frame.generatedAt)).not.toThrow();
    expect(frame.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("empty world → entities array is empty", () => {
    const world = mkWorld(42, []);
    const frame = serializeBridgeFrame(world, CFG);
    expect(frame.entities).toHaveLength(0);
  });

  it("tick matches world.tick", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(42, [e]);
    world.tick = 99;
    const frame = serializeBridgeFrame(world, CFG);
    expect(frame.tick).toBe(99);
  });

  it("JSON-round-trip preserves all top-level fields", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(42, [e]);
    const frame = serializeBridgeFrame(world, CFG);
    const rt: BridgeFrame = JSON.parse(JSON.stringify(frame));
    expect(rt.schema).toBe(frame.schema);
    expect(rt.tick).toBe(frame.tick);
    expect(rt.entities).toHaveLength(frame.entities.length);
    expect(rt.entities[0]!.entityId).toBe(frame.entities[0]!.entityId);
  });
});
