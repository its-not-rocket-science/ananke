import { createPolity, type PolityPair } from "../src/polity.js";
import { q } from "../src/units.js";
import { PRESET_LAW_CODES, createGovernanceState } from "../src/governance.js";
import { establishRoute } from "../src/trade-routes.js";
import { signTreaty } from "../src/diplomacy.js";
import { TechEra } from "../src/sim/tech.js";
import {
  WORLD_EVOLUTION_ENGINE_VERSION,
  createEvolutionSession,
  runEvolution,
  getEvolutionSummary,
} from "../src/world-evolution.js";
import { WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION } from "../src/world-evolution-backend/index.js";

const polityA = createPolity("a", "A", "fA", ["L1", "L2"], 120_000, 35_000, TechEra.Medieval, q(0.65), q(0.62));
const polityB = createPolity("b", "B", "fB", ["L3"], 95_000, 30_000, TechEra.Medieval, q(0.58), q(0.54));
const polityC = createPolity("c", "C", "fC", ["L4"], 80_000, 22_000, TechEra.Medieval, q(0.55), q(0.5));

const treatyRegistry = { treaties: new Map() };
signTreaty(treatyRegistry, "a", "b", "trade_pact", 0, 3650);

const tradeRegistry = { routes: new Map() };
establishRoute(tradeRegistry, "a", "b", 8_500);
establishRoute(tradeRegistry, "b", "c", 3_000);

const pairs: PolityPair[] = [
  { polityAId: "a", polityBId: "b", sharedLocations: 2, routeQuality_Q: q(0.72) },
  { polityAId: "b", polityBId: "c", sharedLocations: 1, routeQuality_Q: q(0.55) },
  { polityAId: "a", polityBId: "c", sharedLocations: 1, routeQuality_Q: q(0.35) },
];

const governanceStates = [
  createGovernanceState("a", "republic"),
  createGovernanceState("b", "monarchy"),
  createGovernanceState("c", "tribal"),
];

const leadGovernance = governanceStates[0];
if (!leadGovernance) throw new Error("missing lead governance state");
leadGovernance.activeLawIds.push("rule_of_law");

const session = createEvolutionSession({
  seed: 4242,
  rulesetId: "balanced",
  canonicalSnapshot: {
    schemaVersion: WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
    worldSeed: 4242,
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
  checkpointInterval: 50,
  includeDeltas: false,
  label: "open-worldbuilder-demo",
});

const runResult = runEvolution(session, {
  steps: 240,
  checkpointInterval: 40,
});

const summary = getEvolutionSummary(session);

console.log("World evolution orchestration demo");
console.log(`engineVersion=${WORLD_EVOLUTION_ENGINE_VERSION}`);
console.log(`session=${summary.sessionId} label=${summary.label ?? "-"}`);
console.log(`totalSteps=${summary.totalSteps} finalTick=${runResult.finalSnapshot.tick}`);
console.log(`population=${runResult.metrics.totalPopulation} treasury=${runResult.metrics.totalTreasury_cu}`);
console.log("Timeline sample (first 5 steps):");
for (const event of runResult.timeline.slice(0, 5)) {
  console.log(`- step=${event.step} tick=${event.tick} :: ${event.summary}`);
}
