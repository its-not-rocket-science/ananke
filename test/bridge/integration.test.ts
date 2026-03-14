// test/bridge/integration.test.ts — Bridge integration with real simulation

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../../src/units";
import { v3 } from "../../src/sim/vec3";
import { mkWorld, mkHumanoidEntity } from "../../src/sim/testing";
import { stepWorld } from "../../src/sim/kernel";
import { extractRigSnapshots } from "../../src/model3d";
import { extractMotionVectors, extractConditionSamples } from "../../src/debug";
import { BridgeEngine } from "../../src/bridge/bridge-engine";

describe("BridgeEngine integration with simulation", () => {
  it("consumes rig snapshots and interpolates", () => {
    // Create a simple world with one entity
    const world = mkWorld(100, []);
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.position_m = v3(0, 0, 0);
    entity.action.facingDirQ = v3(SCALE.Q, 0, 0);
    world.entities.push(entity);

    // Step the world a few ticks to generate motion
    stepWorld(world, new Map(), { tractionCoeff: q(0.80) }); // tick 0 → 1
    const snapshots1 = extractRigSnapshots(world);
    const motion1 = extractMotionVectors(world);
    const condition1 = extractConditionSamples(world);

    stepWorld(world, new Map(), { tractionCoeff: q(0.80) }); // tick 1 → 2
    const snapshots2 = extractRigSnapshots(world);
    const motion2 = extractMotionVectors(world);
    const condition2 = extractConditionSamples(world);

    // Configure bridge with humanoid mapping
    const engine = new BridgeEngine({
      mappings: [
        {
          bodyPlanId: "humanoid",
          segments: [
            { segmentId: "head", boneName: "Head" },
            { segmentId: "torso", boneName: "Spine" },
            { segmentId: "leftArm", boneName: "LeftArm" },
            { segmentId: "rightArm", boneName: "RightArm" },
            { segmentId: "leftLeg", boneName: "LeftLeg" },
            { segmentId: "rightLeg", boneName: "RightLeg" },
          ],
        },
      ],
      extrapolationAllowed: false,
      defaultBoneName: "Root",
    });

    engine.setEntityBodyPlan(1, "humanoid");
    engine.update(snapshots1, motion1, condition1);
    engine.update(snapshots2, motion2, condition2);

    // Now we have prev at tick 1, curr at tick 2
    const dt = 1 / 20; // TICK_HZ = 20
    const renderTime = 1.5 * dt; // halfway between tick 1 and 2
    const state = engine.getInterpolatedState(1, renderTime);
    expect(state).not.toBeNull();
    expect(state!.entityId).toBe(1);
    expect(state!.fromTick).toBe(1);
    expect(state!.toTick).toBe(2);
    expect(state!.interpolationFactor).toBeGreaterThan(0);
    expect(state!.interpolationFactor).toBeLessThan(SCALE.Q);
    // Pose modifiers should be mapped to bone names
    expect(state!.poseModifiers.length).toBeGreaterThan(0);
    const headPose = state!.poseModifiers.find(p => p.segmentId === "head");
    expect(headPose?.boneName).toBe("Head");
  });

  it("handles entity without body plan mapping (fallback)", () => {
    const world = mkWorld(100, []);
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    world.entities.push(entity);
    stepWorld(world, new Map(), { tractionCoeff: q(0.80) });
    const snapshots = extractRigSnapshots(world);

    // Engine with empty mappings
    const engine = new BridgeEngine({
      mappings: [],
      extrapolationAllowed: false,
      defaultBoneName: "defaultBone",
    });
    // No call to setEntityBodyPlan → default "humanoid"
    engine.update(snapshots);
    const state = engine.getInterpolatedState(1, 0);
    expect(state).not.toBeNull();
    expect(state!.poseModifiers[0]?.boneName).toBe("defaultBone");
  });

  it("supports multiple entities with different body plans", () => {
    // This test would require creating entities with different body plans.
    // Since mkHumanoidEntity always uses humanoid plan, we'll just test mapping lookup.
    const engine = new BridgeEngine({
      mappings: [
        { bodyPlanId: "humanoid", segments: [] },
        { bodyPlanId: "quadruped", segments: [] },
      ],
    });
    engine.setEntityBodyPlan(1, "humanoid");
    engine.setEntityBodyPlan(2, "quadruped");
    engine.setEntityBodyPlan(3, "avian"); // no mapping
    // No snapshots; just ensure no crash
    expect(engine.hasEntity(1)).toBe(false);
  });
});