import { describe, expect, it } from "vitest";
import { q } from "../src/units.js";
import { createPolity, createPolityRegistry, stepPolityDay, type PolityPair } from "../src/polity.js";
import { signTreaty } from "../src/diplomacy.js";
import { establishRoute } from "../src/trade-routes.js";
import { createGovernanceState, PRESET_LAW_CODES } from "../src/governance.js";
import {
  WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
  createWorldEvolutionSnapshot,
  listAvailableWorldEvolutionProfiles,
  resolveWorldEvolutionProfile,
  runWorldEvolution,
  type WorldEvolutionRunRequest,
} from "../src/world-evolution-backend/index.js";

function createBaselineRequest(overrides: Partial<WorldEvolutionRunRequest> = {}): WorldEvolutionRunRequest {
  const a = createPolity("a", "A", "fA", ["L1", "L2"], 120_000, 40_000, "Medieval", q(0.70), q(0.65));
  const b = createPolity("b", "B", "fB", ["L3"], 80_000, 30_000, "Medieval", q(0.60), q(0.55));
  const c = createPolity("c", "C", "fC", ["L4"], 60_000, 15_000, "Medieval", q(0.50), q(0.45));

  const treatyRegistry = { treaties: new Map() };
  signTreaty(treatyRegistry, "a", "b", "trade_pact", 0, 365);

  const tradeRegistry = { routes: new Map() };
  establishRoute(tradeRegistry, "a", "b", 8_000);
  establishRoute(tradeRegistry, "b", "c", 2_000);

  const pairs: PolityPair[] = [
    { polityAId: "a", polityBId: "b", sharedLocations: 2, routeQuality_Q: q(0.7) },
    { polityAId: "b", polityBId: "c", sharedLocations: 1, routeQuality_Q: q(0.5) },
  ];

  const governanceStates = [
    createGovernanceState("a", "republic"),
    createGovernanceState("b", "monarchy"),
    createGovernanceState("c", "tribal"),
  ];
  governanceStates[0].activeLawIds.push("rule_of_law");

  return {
    snapshot: {
      schemaVersion: WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
      worldSeed: 1337,
      tick: 0,
      polities: [a, b, c],
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
    steps: 12,
    profileId: "full_world_evolution",
    includeDeltas: true,
    checkpointInterval: 4,
    ...overrides,
  };
}

describe("world-evolution-backend", () => {
  it("is deterministic for the same snapshot + profile", () => {
    const req = createBaselineRequest();
    const first = runWorldEvolution(req);
    const second = runWorldEvolution(req);

    expect(second).toEqual(first);
  });

  it("keeps canon snapshot separate from derived timeline state", () => {
    const req = createBaselineRequest();
    const canon = structuredClone(req.snapshot);
    const normalizedCanon = createWorldEvolutionSnapshot(canon);

    const result = runWorldEvolution(req);

    expect(req.snapshot).toEqual(canon);
    expect(result.initialSnapshot).toEqual(normalizedCanon);
    expect(result.finalSnapshot.tick).toBe(canon.tick + req.steps);
    expect(result.finalSnapshot.polities).not.toEqual(canon.polities);
  });

  it("produces timeline, metrics, deltas, and checkpoints for host replay tooling", () => {
    const req = createBaselineRequest();
    const result = runWorldEvolution(req);

    expect(result.timeline).toHaveLength(req.steps);
    expect(result.metrics.totalPopulation).toBeGreaterThan(0);
    expect(result.deltas).toHaveLength(req.steps);
    expect(result.checkpoints).toHaveLength(3);
    expect(result.timeline[0]?.metrics.activeTreaties).toBeGreaterThanOrEqual(0);
  });

  it("composes polity stepping without changing its deterministic outcome", () => {
    const req = createBaselineRequest({
      steps: 1,
      profile: {
        id: "balanced",
        name: "polity-only",
        description: "test profile",
        polityDayEnabled: true,
        governanceEnabled: false,
        diplomacyEnabled: false,
        tradeEnabled: false,
        migrationEnabled: false,
        epidemicEnabled: false,
        climateEnabled: false,
        governanceStabilityDaysPerStep: 0,
        treatyStrengthBoost_Q: 0,
        routeEfficiencyBoost_Q: 0,
        epidemicHealthBuffer_Q: 0,
      },
      profileId: undefined,
    });

    const controlRegistry = createPolityRegistry(req.snapshot.polities.map((p) => ({ ...p, locationIds: [...p.locationIds] })));
    controlRegistry.activeWars.add("b:c");
    stepPolityDay(controlRegistry, req.snapshot.pairs, req.snapshot.worldSeed, req.snapshot.tick);
    const controlPolities = [...controlRegistry.polities.values()].sort((a, b) => a.id.localeCompare(b.id));

    const result = runWorldEvolution(req);
    expect(result.finalSnapshot.polities).toEqual(controlPolities);
  });

  it("exposes predefined host-friendly profiles", () => {
    const profiles = listAvailableWorldEvolutionProfiles();
    expect(profiles.map((p) => p.id)).toEqual([
      "minimal_world_history",
      "polity_dynamics",
      "conflict_heavy",
      "climate_and_migration",
      "full_world_evolution",
    ]);
    for (const profile of profiles) {
      expect(profile.pipelineOrder).toEqual([
        "polity",
        "governance",
        "diplomacy",
        "trade",
        "migration",
        "climate",
        "epidemic",
      ]);
    }
  });

  it("produces deterministic outputs for each predefined profile", () => {
    const profileIds = listAvailableWorldEvolutionProfiles().map((p) => p.id);
    for (const profileId of profileIds) {
      const req = createBaselineRequest({ profileId });
      const first = runWorldEvolution(req);
      const second = runWorldEvolution(req);
      expect(second).toEqual(first);
    }
  });

  it("supports deterministic host overrides layered on top of a base profile", () => {
    const baselineReq = createBaselineRequest({
      profileId: "polity_dynamics",
    });
    const overriddenReq = createBaselineRequest({
      profileId: "polity_dynamics",
      profile: {
        ...resolveWorldEvolutionProfile("polity_dynamics"),
        governanceStabilityDaysPerStep: 2,
        routeEfficiencyBoost_Q: q(0.001),
      },
    });

    const baseline = runWorldEvolution(baselineReq);
    const first = runWorldEvolution(overriddenReq);
    const second = runWorldEvolution(overriddenReq);

    expect(second).toEqual(first);
    expect(first.finalSnapshot).not.toEqual(baseline.finalSnapshot);
  });
});
