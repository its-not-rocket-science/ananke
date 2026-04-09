// Mirrors docs/bridge-contract.md quickstarts using local source entrypoints for in-repo typechecking.
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
  type InterpolatedState,
} from "../../src/tier2.js";

const world = createWorld(7, [
  { id: 1, teamId: 1, seed: 11, archetype: "KNIGHT_INFANTRY", weaponId: "arming_sword" },
]);

stepWorld(world, new Map(), { tractionCoeff: q(0.8) });

const rigs: RigSnapshot[] = extractRigSnapshots(world);
const hints = deriveAnimationHints(world.entities[0]!);
const rootIdleWeight = hints.idle / SCALE.Q;

const config: BridgeConfig = { mappings: [], defaultBoneName: "root", extrapolationAllowed: false };
const engine = new BridgeEngine(config);
engine.setEntityBodyPlan(1, "humanoid");
engine.update(rigs);

stepWorld(world, new Map(), { tractionCoeff: q(0.8) });
engine.update(extractRigSnapshots(world));

const maybeState: InterpolatedState | null = engine.getInterpolatedState(1, engine.getLatestSimTime());
if (maybeState) {
  const bridgeIdleWeight = maybeState.animation.idle / SCALE.Q;
  void bridgeIdleWeight;
}

void rootIdleWeight;
