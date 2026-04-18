import { createPolity, type PolityPair } from "../src/polity.js";
import { q } from "../src/units.js";
import { PRESET_LAW_CODES, createGovernanceState } from "../src/governance.js";
import { establishRoute } from "../src/trade-routes.js";
import { signTreaty } from "../src/diplomacy.js";
import { TechEra } from "../src/sim/tech.js";
import {
  createEvolutionSession,
  getEvolutionSummary,
  resumeEvolutionSessionFromCheckpoint,
  runEvolution,
  serializeEvolutionCheckpoint,
} from "../src/world-evolution.js";
import { WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION } from "../src/world-evolution-backend/index.js";

const CHECKPOINT_INTERVAL = 100;
const TOTAL_STEPS = 1000;

const polityA = createPolity("a", "A", "fA", ["L1", "L2"], 125_000, 42_000, TechEra.Medieval, q(0.7), q(0.66));
const polityB = createPolity("b", "B", "fB", ["L3"], 93_000, 28_000, TechEra.Medieval, q(0.62), q(0.58));
const polityC = createPolity("c", "C", "fC", ["L4"], 71_000, 21_000, TechEra.Medieval, q(0.56), q(0.51));

const treatyRegistry = { treaties: new Map() };
signTreaty(treatyRegistry, "a", "b", "trade_pact", 0, 10_000);

const tradeRegistry = { routes: new Map() };
establishRoute(tradeRegistry, "a", "b", 8_000);
establishRoute(tradeRegistry, "b", "c", 2_500);

const pairs: PolityPair[] = [
  { polityAId: "a", polityBId: "b", sharedLocations: 2, routeQuality_Q: q(0.75) },
  { polityAId: "b", polityBId: "c", sharedLocations: 1, routeQuality_Q: q(0.52) },
];

const governanceStates = [
  createGovernanceState("a", "republic"),
  createGovernanceState("b", "monarchy"),
  createGovernanceState("c", "tribal"),
];

governanceStates[0]?.activeLawIds.push("rule_of_law");

const session = createEvolutionSession({
  seed: 777,
  rulesetId: "full_world_evolution",
  canonicalSnapshot: {
    schemaVersion: WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
    worldSeed: 777,
    tick: 0,
    polities: [polityA, polityB, polityC],
    pairs,
    activeWars: [["b", "c"]],
    treaties: [...treatyRegistry.treaties.values()],
    tradeRoutes: [...tradeRegistry.routes.values()],
    governanceStates,
    governanceLawRegistry: PRESET_LAW_CODES,
    epidemics: [],
    diseases: [],
    climateByPolity: [],
  },
  checkpointInterval: CHECKPOINT_INTERVAL,
});

const uninterrupted = runEvolution(session, {
  steps: TOTAL_STEPS,
  checkpointInterval: CHECKPOINT_INTERVAL,
  includeCheckpointDiffs: true,
});

const checkpoint = uninterrupted.checkpoints?.[4];
if (!checkpoint) throw new Error("missing checkpoint for resume demo");

const checkpointBlob = serializeEvolutionCheckpoint(checkpoint);
const resumedSession = resumeEvolutionSessionFromCheckpoint(checkpoint, {
  checkpointInterval: CHECKPOINT_INTERVAL,
  label: "resume-demo",
});

const resumed = runEvolution(resumedSession, {
  steps: TOTAL_STEPS - checkpoint.step,
  checkpointInterval: CHECKPOINT_INTERVAL,
});

console.log("Checkpointing/resume demo");
console.log(`totalSteps=${TOTAL_STEPS} checkpointInterval=${CHECKPOINT_INTERVAL}`);
console.log(`checkpoints=${uninterrupted.checkpoints?.length ?? 0} checkpointBlobBytes=${checkpointBlob.length}`);
console.log(`resumeFromStep=${checkpoint.step} uninterruptedTick=${uninterrupted.finalSnapshot.tick} resumedTick=${resumed.finalSnapshot.tick}`);
console.log(`deterministicMatch=${JSON.stringify(uninterrupted.finalSnapshot) === JSON.stringify(resumed.finalSnapshot)}`);

const summary = getEvolutionSummary(session);
console.log(`sessionSummary totalSteps=${summary.totalSteps} checkpointCount=${summary.checkpointCount}`);
