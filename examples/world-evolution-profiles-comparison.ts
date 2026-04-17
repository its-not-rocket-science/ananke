import { createPolity, type PolityPair } from "../src/polity.js";
import { q } from "../src/units.js";
import { PRESET_LAW_CODES, createGovernanceState } from "../src/governance.js";
import { establishRoute } from "../src/trade-routes.js";
import { signTreaty } from "../src/diplomacy.js";
import { TechEra } from "../src/sim/tech.js";
import {
  WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
  runWorldEvolution,
  type WorldEvolutionRunRequest,
  type WorldEvolutionRulesetId,
} from "../src/world-evolution-backend/index.js";

function createRequest(profileId: WorldEvolutionRulesetId): WorldEvolutionRunRequest {
  const polityA = createPolity("a", "A", "fA", ["L1", "L2"], 120_000, 35_000, TechEra.Medieval, q(0.65), q(0.62));
  const polityB = createPolity("b", "B", "fB", ["L3"], 95_000, 30_000, TechEra.Medieval, q(0.58), q(0.54));
  const polityC = createPolity("c", "C", "fC", ["L4"], 80_000, 22_000, TechEra.Medieval, q(0.55), q(0.50));

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

  return {
    snapshot: {
      schemaVersion: WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
      worldSeed: 2026,
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
    steps: 180,
    profileId,
  };
}

const profileIds: WorldEvolutionRulesetId[] = [
  "minimal_world_history",
  "climate_and_migration",
  "full_world_evolution",
];

const results = profileIds.map((profileId) => runWorldEvolution(createRequest(profileId)));

console.log("World evolution profile comparison");
for (const result of results) {
  console.log(
    [
      `profile=${result.profile.id}`,
      `tick=${result.finalSnapshot.tick}`,
      `population=${result.metrics.totalPopulation}`,
      `treasury=${result.metrics.totalTreasury_cu}`,
      `wars=${result.metrics.activeWars}`,
      `treaties=${result.metrics.activeTreaties}`,
      `migrations=${result.metrics.migrationsThisStep}`,
      `climate=${result.metrics.activeClimateEvents}`,
      `epidemics=${result.metrics.activeEpidemics}`,
    ].join(" "),
  );
}
