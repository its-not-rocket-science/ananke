// test/debug.test.ts — Phase 13 visual debug layer

import { describe, it, expect } from "vitest";
import { q, to, SCALE } from "../src/units";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import { CollectingTrace } from "../src/metrics";
import {
  extractMotionVectors,
  extractHitTraces,
  extractConditionSamples,
} from "../src/debug";

// ── extractMotionVectors ──────────────────────────────────────────────────────

describe("extractMotionVectors", () => {
  it("returns one entry per entity", () => {
    const world = mkWorld(1, [
      mkHumanoidEntity(1, 1, 0, 0),
      mkHumanoidEntity(2, 2, to.m(2), 0),
    ]);
    const vectors = extractMotionVectors(world);
    expect(vectors).toHaveLength(2);
    expect(vectors.map(v => v.entityId)).toEqual([1, 2]);
  });

  it("empty world returns empty array", () => {
    const world = mkWorld(1, []);
    expect(extractMotionVectors(world)).toHaveLength(0);
  });

  it("position_m matches entity position", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.position_m = { x: to.m(3), y: to.m(4), z: 0 };
    const world = mkWorld(1, [e]);
    const [v] = extractMotionVectors(world);
    expect(v!.position_m).toEqual({ x: to.m(3), y: to.m(4), z: 0 });
  });

  it("velocity_mps matches entity velocity", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.velocity_mps = { x: 5000, y: 1000, z: 0 };
    const world = mkWorld(1, [e]);
    const [v] = extractMotionVectors(world);
    expect(v!.velocity_mps).toEqual({ x: 5000, y: 1000, z: 0 });
  });

  it("facing matches action.facingDirQ", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.action.facingDirQ = { x: 0, y: SCALE.Q, z: 0 };
    const world = mkWorld(1, [e]);
    const [v] = extractMotionVectors(world);
    expect(v!.facing).toEqual({ x: 0, y: SCALE.Q, z: 0 });
  });

  it("includes dead entities", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.injury.dead = true;
    const world = mkWorld(1, [e]);
    const vectors = extractMotionVectors(world);
    expect(vectors).toHaveLength(1);
    expect(vectors[0]!.entityId).toBe(1);
  });

  it("teamId is preserved", () => {
    const world = mkWorld(1, [
      mkHumanoidEntity(1, 1, 0, 0),
      mkHumanoidEntity(2, 2, 0, 0),
    ]);
    const vectors = extractMotionVectors(world);
    expect(vectors[0]!.teamId).toBe(1);
    expect(vectors[1]!.teamId).toBe(2);
  });
});

// ── extractHitTraces ──────────────────────────────────────────────────────────

describe("extractHitTraces", () => {
  it("empty event list returns empty result", () => {
    const result = extractHitTraces([]);
    expect(result.meleeHits).toHaveLength(0);
    expect(result.projectileHits).toHaveLength(0);
  });

  it("extracts Attack events as melee hits", () => {
    const ev = {
      kind: "attack" as const,
      tick: 4,
      attackerId: 1,
      targetId: 2,
      region: "torso",
      energy_J: 350,
      blocked: false,
      parried: false,
      shieldBlocked: false,
      armoured: true,
      hitQuality: q(0.7),
    };
    const result = extractHitTraces([ev]);
    expect(result.meleeHits).toHaveLength(1);
    const hit = result.meleeHits[0]!;
    expect(hit.attackerId).toBe(1);
    expect(hit.targetId).toBe(2);
    expect(hit.region).toBe("torso");
    expect(hit.energy_J).toBe(350);
    expect(hit.blocked).toBe(false);
    expect(hit.parried).toBe(false);
    expect(hit.shieldBlocked).toBe(false);
    expect(hit.armoured).toBe(true);
    expect(hit.tick).toBe(4);
  });

  it("extracts only hit=true ProjectileHit events", () => {
    // Build a trace with a synthetic ProjectileHit miss and a hit
    const missEvent = {
      kind: "projectileHit" as const,
      tick: 1,
      shooterId: 1,
      targetId: 2,
      hit: false,
      distance_m: 10000,
      energyAtImpact_J: 0,
      suppressed: false,
    };
    const hitEvent = {
      kind: "projectileHit" as const,
      tick: 2,
      shooterId: 1,
      targetId: 2,
      hit: true,
      region: "torso",
      distance_m: 10000,
      energyAtImpact_J: 500,
      suppressed: false,
    };
    const result = extractHitTraces([missEvent, hitEvent]);
    expect(result.projectileHits).toHaveLength(1);
    expect(result.projectileHits[0]!.region).toBe("torso");
    expect(result.projectileHits[0]!.energyAtImpact_J).toBe(500);
    expect(result.projectileHits[0]!.shooterId).toBe(1);
    expect(result.projectileHits[0]!.targetId).toBe(2);
  });

  it("non-hit-related events are ignored", () => {
    const result = extractHitTraces([
      { kind: "death" as const, tick: 1, entityId: 1 },
      { kind: "moraleRoute" as const, tick: 1, entityId: 2, fearQ: q(0.8) },
    ] as any);
    expect(result.meleeHits).toHaveLength(0);
    expect(result.projectileHits).toHaveLength(0);
  });

  it("preserves blocked/parried/shieldBlocked flags", () => {
    const ev = {
      kind: "attack" as const,
      tick: 5,
      attackerId: 1,
      targetId: 2,
      region: "torso",
      energy_J: 0,
      blocked: true,
      parried: false,
      shieldBlocked: false,
      armoured: false,
      hitQuality: q(0.5),
    };
    const result = extractHitTraces([ev]);
    expect(result.meleeHits[0]!.blocked).toBe(true);
    expect(result.meleeHits[0]!.parried).toBe(false);
    expect(result.meleeHits[0]!.shieldBlocked).toBe(false);
  });

  it("collects hits across multiple ticks", () => {
    const events = [
      { kind: "attack" as const, tick: 1, attackerId: 1, targetId: 2, region: "head", energy_J: 100, blocked: false, parried: false, shieldBlocked: false, armoured: false, hitQuality: q(0.8) },
      { kind: "attack" as const, tick: 3, attackerId: 1, targetId: 2, region: "torso", energy_J: 200, blocked: false, parried: false, shieldBlocked: false, armoured: false, hitQuality: q(0.6) },
    ];
    const result = extractHitTraces(events);
    expect(result.meleeHits).toHaveLength(2);
    expect(result.meleeHits[0]!.tick).toBe(1);
    expect(result.meleeHits[1]!.tick).toBe(3);
  });
});

// ── extractConditionSamples ───────────────────────────────────────────────────

describe("extractConditionSamples", () => {
  it("returns one sample per entity", () => {
    const world = mkWorld(1, [
      mkHumanoidEntity(1, 1, 0, 0),
      mkHumanoidEntity(2, 2, to.m(3), 0),
    ]);
    expect(extractConditionSamples(world)).toHaveLength(2);
  });

  it("empty world returns empty array", () => {
    expect(extractConditionSamples(mkWorld(1, []))).toHaveLength(0);
  });

  it("fearQ matches entity condition", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.condition.fearQ = q(0.40);
    const world = mkWorld(1, [e]);
    const [s] = extractConditionSamples(world);
    expect(s!.fearQ).toBe(q(0.40));
  });

  it("shock matches entity injury", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.injury.shock = q(0.25);
    const world = mkWorld(1, [e]);
    const [s] = extractConditionSamples(world);
    expect(s!.shock).toBe(q(0.25));
  });

  it("consciousness matches entity injury", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.injury.consciousness = q(0.60);
    const world = mkWorld(1, [e]);
    const [s] = extractConditionSamples(world);
    expect(s!.consciousness).toBe(q(0.60));
  });

  it("fluidLoss matches entity injury fluidLoss_L", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.injury.fluidLoss_L = q(0.30);
    const world = mkWorld(1, [e]);
    const [s] = extractConditionSamples(world);
    expect(s!.fluidLoss).toBe(q(0.30));
  });

  it("dead flag reflects entity state for both alive and dead entities", () => {
    const alive = mkHumanoidEntity(1, 1, 0, 0);
    const dead  = mkHumanoidEntity(2, 2, to.m(1), 0);
    dead.injury.dead = true;
    const world = mkWorld(1, [alive, dead]);
    const samples = extractConditionSamples(world);
    expect(samples[0]!.dead).toBe(false);
    expect(samples[1]!.dead).toBe(true);
  });

  it("position_m and teamId are correct", () => {
    const e = mkHumanoidEntity(3, 2, to.m(5), to.m(7));
    const world = mkWorld(1, [e]);
    const [s] = extractConditionSamples(world);
    expect(s!.entityId).toBe(3);
    expect(s!.teamId).toBe(2);
    expect(s!.position_m.x).toBe(to.m(5));
    expect(s!.position_m.y).toBe(to.m(7));
  });

  it("integrates with live simulation — condition evolves over ticks", () => {
    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    const target   = mkHumanoidEntity(2, 2, to.m(0.5), 0);
    const world    = mkWorld(1, [attacker, target]);

    const before = extractConditionSamples(world);
    const shockBefore = before[1]!.shock;

    // Run several ticks of combat
    for (let i = 0; i < 40; i++) {
      stepWorld(world, new Map([[1, [{ kind: "attack", targetId: 2 }]]]), { tractionCoeff: q(0.80) });
    }

    const after = extractConditionSamples(world);
    const shockAfter = after[1]!.shock;
    // Target should have accumulated some shock from hits
    expect(shockAfter).toBeGreaterThanOrEqual(shockBefore);
  });
});
