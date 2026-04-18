import { describe, expect, it } from "vitest";
import { q } from "../src/units.js";
import { createPolity, createPolityRegistry, stepPolityDay, type PolityPair } from "../src/polity.js";
import { signTreaty } from "../src/diplomacy.js";
import { establishRoute } from "../src/trade-routes.js";
import { createGovernanceState, PRESET_LAW_CODES } from "../src/governance.js";
import type { DiseaseProfile } from "../src/sim/disease.js";
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
  const TEST_PLAGUE: DiseaseProfile = {
    id: "test_plague",
    name: "Test Plague",
    transmissionRoute: "airborne",
    baseTransmissionRate_Q: q(0.8),
    incubationPeriod_s: 3 * 86_400,
    symptomaticDuration_s: 14 * 86_400,
    mortalityRate_Q: q(0.4),
    symptomSeverity_Q: q(0.6),
    airborneRange_Sm: 10_000,
    immunityDuration_s: -1,
  };

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

  it("keeps final state and timeline parity when checkpoint emission is toggled", () => {
    const baselineReq = createBaselineRequest({
      steps: 48,
      checkpointInterval: undefined,
      includeDeltas: false,
    });
    const checkpointedReq = createBaselineRequest({
      steps: 48,
      checkpointInterval: 6,
      includeDeltas: false,
    });

    const baseline = runWorldEvolution(baselineReq);
    const checkpointed = runWorldEvolution(checkpointedReq);

    expect(checkpointed.finalSnapshot).toEqual(baseline.finalSnapshot);
    expect(checkpointed.timeline).toEqual(baseline.timeline);
    expect(checkpointed.checkpoints).toHaveLength(8);
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

  it("applies profile subsystem toggles deterministically without replacing core mechanics", () => {
    const expectations: Record<string, {
      expectClimateEvents: boolean;
      expectMigrationFlows: boolean;
      expectEpidemicDelta: boolean;
    }> = {
      minimal_world_history: {
        expectClimateEvents: false,
        expectMigrationFlows: false,
        expectEpidemicDelta: false,
      },
      polity_dynamics: {
        expectClimateEvents: false,
        expectMigrationFlows: false,
        expectEpidemicDelta: false,
      },
      conflict_heavy: {
        expectClimateEvents: false,
        expectMigrationFlows: true,
        expectEpidemicDelta: false,
      },
      climate_and_migration: {
        expectClimateEvents: true,
        expectMigrationFlows: true,
        expectEpidemicDelta: true,
      },
      full_world_evolution: {
        expectClimateEvents: true,
        expectMigrationFlows: true,
        expectEpidemicDelta: true,
      },
    };

    for (const [profileId, expectation] of Object.entries(expectations)) {
      const req = createBaselineRequest({ profileId: profileId as WorldEvolutionRunRequest["profileId"], steps: 180 });
      req.snapshot.diseases = [TEST_PLAGUE];
      req.snapshot.epidemics = [
        {
          polityId: "a",
          diseaseId: TEST_PLAGUE.id,
          prevalence_Q: q(0.08),
        },
      ];
      const result = runWorldEvolution(req);
      expect(result.timeline).toHaveLength(180);

      const sawClimateEvents = result.timeline.some((event) => event.climateEventIds.length > 0);
      const sawMigrationFlows = result.timeline.some((event) => event.migrations.length > 0);
      const sawEpidemicDelta = result.timeline.some((event) => event.epidemicPopulationDelta !== 0);

      expect(sawClimateEvents).toBe(expectation.expectClimateEvents);
      expect(sawMigrationFlows).toBe(expectation.expectMigrationFlows);
      expect(sawEpidemicDelta).toBe(expectation.expectEpidemicDelta);
    }
  });
});
