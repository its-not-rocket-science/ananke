import { describe, it, expect } from "vitest";
import {
  createWorld,
  stepWorld,
  extractRigSnapshots,
  deriveAnimationHints,
  q,
  SCALE,
  type RigSnapshot,
} from "../../src/index.js";
import {
  BridgeEngine,
  type BridgeConfig,
  type BodyPlanMapping,
  validateMappingCoverage,
} from "../../src/tier2.js";
import { runBridgeMinimalExample } from "../../examples/bridge-minimal.js";

describe("docs/bridge-contract snippets", () => {
  it("minimum and advanced snippets compile and run", () => {
    const world = createWorld(42, [
      { id: 1, teamId: 1, seed: 101, archetype: "KNIGHT_INFANTRY", weaponId: "wpn_longsword" },
      { id: 2, teamId: 2, seed: 202, archetype: "KNIGHT_INFANTRY", weaponId: "wpn_longsword", x_m: 1.0 },
    ]);

    stepWorld(world, new Map(), { tractionCoeff: q(0.8) });

    const rigs: RigSnapshot[] = extractRigSnapshots(world);
    const hints = deriveAnimationHints(world.entities[0]!);
    expect(rigs.length).toBeGreaterThan(0);
    expect(hints.idle / SCALE.Q).toBeGreaterThanOrEqual(0);

    const humanoidMapping: BodyPlanMapping = {
      bodyPlanId: "humanoid",
      segments: [{ segmentId: "head", boneName: "Head" }],
    };
    const missing = validateMappingCoverage(humanoidMapping, ["head", "torso"]);
    expect(missing).toContain("torso");

    const config: BridgeConfig = {
      mappings: [humanoidMapping],
      defaultBoneName: "root",
      extrapolationAllowed: false,
    };
    const engine = new BridgeEngine(config);
    engine.setEntityBodyPlan(1, "humanoid");

    stepWorld(world, new Map(), { tractionCoeff: q(0.8) });
    engine.update(extractRigSnapshots(world));

    stepWorld(world, new Map(), { tractionCoeff: q(0.8) });
    engine.update(extractRigSnapshots(world));

    const state = engine.getInterpolatedState(1, engine.getLatestSimTime() - 1 / 40);
    expect(state?.entityId).toBe(1);

    const result = runBridgeMinimalExample();
    expect(result.entitySeen).toBe(true);
  });
});
