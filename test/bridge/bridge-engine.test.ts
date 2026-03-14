// test/bridge/bridge‑engine.test.ts — Bridge engine integration

import { describe, it, expect, beforeEach } from "vitest";
import { q, SCALE } from "../../src/units";
import { v3 } from "../../src/sim/vec3";
import { BridgeEngine } from "../../src/bridge/bridge-engine";
import type { RigSnapshot } from "../../src/model3d";
import type { MotionVector, ConditionSample } from "../../src/debug";
import type { Vec3 } from "../../src/sim/vec3";

// ─── Mock data helpers ─────────────────────────────────────────────────────────

function mockRigSnapshot(
  entityId: number,
  tick: number,
  position_m = v3(0, 0, 0),
  facing = v3(SCALE.Q, 0, 0),
): RigSnapshot {
  return {
    entityId,
    teamId: 1,
    tick,
    mass: { totalMass_kg: 70000, segments: [], cogOffset_m: { x: 0, y: 0 } },
    inertia: { yaw_kgm2: 0, pitch_kgm2: 0, roll_kgm2: 0 },
    animation: {
      idle: SCALE.Q, walk: 0, run: 0, sprint: 0, crawl: 0,
      guardingQ: 0,
      attackingQ: 0,
      shockQ: 0,
      fearQ: 0,
      prone: false,
      unconscious: false,
      dead: false,
    },
    pose: [],
    grapple: {
      isHolder: false,
      isHeld: false,
      heldByIds: [],
      position: "standing",
      gripQ: 0,
    },
  };
}

function mockMotionVector(entityId: number, position_m: Vec3, facing: Vec3): MotionVector {
  return { entityId, teamId: 1, position_m, velocity_mps: v3(0, 0, 0), facing };
}

function mockConditionSample(entityId: number, dead = false): ConditionSample {
  return {
    entityId,
    teamId: 1,
    position_m: v3(0, 0, 0),
    fearQ: 0,
    shock: 0,
    consciousness: SCALE.Q,
    fluidLoss: 0,
    dead,
  };
}

// ─── Bridge engine basics ──────────────────────────────────────────────────────

describe("BridgeEngine", () => {
  let engine: BridgeEngine;

  beforeEach(() => {
    engine = new BridgeEngine({
      mappings: [
        {
          bodyPlanId: "humanoid",
          segments: [
            { segmentId: "head", boneName: "Head" },
            { segmentId: "torso", boneName: "Spine" },
          ],
        },
      ],
      extrapolationAllowed: false,
      defaultBoneName: "root",
    });
  });

  it("starts empty", () => {
    expect(engine.hasEntity(1)).toBe(false);
    expect(engine.getInterpolatedState(1, 0)).toBeNull();
  });

  it("registers entity body plan", () => {
    engine.setEntityBodyPlan(1, "humanoid");
    // cannot test internal state; just ensure no error
    expect(engine.hasEntity(1)).toBe(false); // still no snapshots
  });

  it("ingests snapshots and provides interpolated state", () => {
    engine.setEntityBodyPlan(1, "humanoid");
    const snapshots = [mockRigSnapshot(1, 0, v3(0, 0, 0), v3(SCALE.Q, 0, 0))];
    const motion = [mockMotionVector(1, v3(0, 0, 0), v3(SCALE.Q, 0, 0))];
    engine.update(snapshots, motion);
    // now has current snapshot only, previous is null
    expect(engine.hasEntity(1)).toBe(true);
    // render time exactly at tick 0 (prevTime_s = 0, currTime_s = tick * DT)
    const state = engine.getInterpolatedState(1, 0);
    expect(state).not.toBeNull();
    expect(state!.entityId).toBe(1);
    expect(state!.interpolationFactor).toBe(SCALE.Q); // only current snapshot, hold
  });

  it("interpolates between two ticks", () => {
    engine.setEntityBodyPlan(1, "humanoid");
    // First tick at position (0,0,0), facing +x
    const snap1 = [mockRigSnapshot(1, 0, v3(0, 0, 0), v3(SCALE.Q, 0, 0))];
    const motion1 = [mockMotionVector(1, v3(0, 0, 0), v3(SCALE.Q, 0, 0))];
    engine.update(snap1, motion1);
    // Second tick at position (100,0,0), facing +z
    const snap2 = [mockRigSnapshot(1, 1, v3(100, 0, 0), v3(0, 0, SCALE.Q))];
    const motion2 = [mockMotionVector(1, v3(100, 0, 0), v3(0, 0, SCALE.Q))];
    engine.update(snap2, motion2);
    // Now we have prev at tick 0, curr at tick 1
    const dt = 1 / 20; // TICK_HZ = 20
    // render time halfway between ticks
    const state = engine.getInterpolatedState(1, dt / 2);
    expect(state).not.toBeNull();
    expect(state!.interpolationFactor).toBe(SCALE.Q / 2);
    expect(state!.position_m.x).toBe(50); // lerp 0..100 at t=0.5
    // facing should be interpolated (normalised)
    expect(state!.facing.z).toBeGreaterThan(0);
    expect(state!.facing.x).toBeGreaterThan(0);
  });

  it("holds previous when render time before previous snapshot", () => {
    engine.setEntityBodyPlan(1, "humanoid");
    const snap = [mockRigSnapshot(1, 10, v3(100, 0, 0))];
    const motion = [mockMotionVector(1, v3(100, 0, 0), v3(SCALE.Q, 0, 0))];
    engine.update(snap, motion);
    // only current snapshot, prev is null
    // render time earlier than simulation time (sim time = tick * DT)
    const state = engine.getInterpolatedState(1, -1);
    expect(state).not.toBeNull();
    expect(state!.interpolationFactor).toBe(SCALE.Q); // hold current
  });

  it("extrapolates when allowed", () => {
    engine.updateConfig({ mappings: [], extrapolationAllowed: true });
    engine.setEntityBodyPlan(1, "humanoid");
    const snap = [mockRigSnapshot(1, 0, v3(0, 0, 0))];
    const motion = [mockMotionVector(1, v3(0, 0, 0), v3(SCALE.Q, 0, 0))];
    engine.update(snap, motion);
    // only current snapshot, no previous
    // render time ahead by 0.1 seconds
    const state = engine.getInterpolatedState(1, 0.1);
    expect(state).not.toBeNull();
    // extrapolation will add velocity * delta (velocity is zero)
    expect(state!.position_m.x).toBe(0);
  });

  it("maps pose modifiers to bone names", () => {
    engine.setEntityBodyPlan(1, "humanoid");
    const snap: RigSnapshot = {
      ...mockRigSnapshot(1, 0),
      pose: [
        { segmentId: "head", structuralQ: q(0.2), surfaceQ: q(0.1), impairmentQ: q(0.2) },
        { segmentId: "torso", structuralQ: q(0.3), surfaceQ: q(0.2), impairmentQ: q(0.3) },
        { segmentId: "leftArm", structuralQ: q(0.4), surfaceQ: q(0.3), impairmentQ: q(0.4) },
      ],
    };
    engine.update([snap]);
    const state = engine.getInterpolatedState(1, 0);
    expect(state!.poseModifiers).toHaveLength(3);
    const head = state!.poseModifiers.find(p => p.segmentId === "head");
    expect(head!.boneName).toBe("Head");
    const torso = state!.poseModifiers.find(p => p.segmentId === "torso");
    expect(torso!.boneName).toBe("Spine");
    const leftArm = state!.poseModifiers.find(p => p.segmentId === "leftArm");
    expect(leftArm!.boneName).toBe("root"); // unmapped → default
  });

  it("removes entities", () => {
    engine.setEntityBodyPlan(1, "humanoid");
    engine.update([mockRigSnapshot(1, 0)]);
    expect(engine.hasEntity(1)).toBe(true);
    engine.removeEntity(1);
    expect(engine.hasEntity(1)).toBe(false);
  });

  it("clears all state", () => {
    engine.setEntityBodyPlan(1, "humanoid");
    engine.update([mockRigSnapshot(1, 0)]);
    engine.clear();
    expect(engine.hasEntity(1)).toBe(false);
    expect(engine.getLatestTick()).toBe(0);
  });
});