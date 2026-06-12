import { createWorld, stepWorld, extractRigSnapshots, q } from "../src/index.js";
import { BridgeEngine, type BridgeConfig } from "../src/tier2.js";

export function runBridgeMinimalExample(): { tick: number; entitySeen: boolean } {
  const world = createWorld(123, [
    { id: 1, teamId: 1, seed: 1, archetype: "KNIGHT_INFANTRY", weaponId: "wpn_longsword" },
  ]);

  const config: BridgeConfig = {
    mappings: [
      {
        bodyPlanId: "humanoid",
        segments: [],
      },
    ],
    defaultBoneName: "root",
    extrapolationAllowed: false,
  };

  const bridge = new BridgeEngine(config);
  bridge.setEntityBodyPlan(1, "humanoid");

  stepWorld(world, new Map(), { tractionCoeff: q(0.8) });
  bridge.update(extractRigSnapshots(world));

  stepWorld(world, new Map(), { tractionCoeff: q(0.8) });
  bridge.update(extractRigSnapshots(world));

  return {
    tick: bridge.getLatestTick(),
    entitySeen: bridge.hasEntity(1),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runBridgeMinimalExample();
  console.log("bridge-minimal", result);
}
