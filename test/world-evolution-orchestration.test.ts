import { describe, expect, it } from "vitest";
import { q } from "../src/units.js";
import { createPolity, type PolityPair } from "../src/polity.js";
import { signTreaty } from "../src/diplomacy.js";
import { establishRoute } from "../src/trade-routes.js";
import { createGovernanceState, PRESET_LAW_CODES } from "../src/governance.js";
import { WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION } from "../src/world-evolution-backend/index.js";
import {
  WORLD_EVOLUTION_ORCHESTRATION_SCHEMA_VERSION,
  WORLD_EVOLUTION_ENGINE_VERSION,
  createEvolutionSession,
  deserializeEvolutionCheckpoint,
  deserializeEvolutionResult,
  getEvolutionSummary,
  resumeEvolutionSessionFromCheckpoint,
  runEvolution,
  serializeEvolutionCheckpoint,
  serializeEvolutionResult,
  serializeEvolutionIntermediateState,
  stepEvolution,
} from "../src/world-evolution.js";

function createSession(seed = 7331) {
  const a = createPolity("a", "A", "fA", ["L1", "L2"], 120_000, 40_000, "Medieval", q(0.7), q(0.65));
  const b = createPolity("b", "B", "fB", ["L3"], 80_000, 30_000, "Medieval", q(0.6), q(0.55));
  const c = createPolity("c", "C", "fC", ["L4"], 60_000, 15_000, "Medieval", q(0.5), q(0.45));

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

  return createEvolutionSession({
    seed,
    rulesetId: "full_world_evolution",
    canonicalSnapshot: {
      schemaVersion: WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
      worldSeed: seed,
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
  });
}

describe("world-evolution orchestration", () => {
  it("is replayable for full-run mode given the same seed and ruleset", () => {
    const sessionA = createSession(1337);
    const sessionB = createSession(1337);

    const first = runEvolution(sessionA, { steps: 30, includeDeltas: true, checkpointInterval: 10 });
    const second = runEvolution(sessionB, { steps: 30, includeDeltas: true, checkpointInterval: 10 });

    expect(first).toEqual(second);
  });

  it("matches full-run and stepwise modes over the same number of steps", () => {
    const fullSession = createSession(9001);
    const steppedSession = createSession(9001);

    const full = runEvolution(fullSession, { steps: 24, checkpointInterval: 6 });
    for (let i = 0; i < 4; i += 1) {
      stepEvolution(steppedSession, { steps: 6, checkpointInterval: 6 });
    }

    const steppedSummary = getEvolutionSummary(steppedSession);

    expect(steppedSummary.totalSteps).toBe(24);
    expect(steppedSummary.currentSnapshot).toEqual(full.finalSnapshot);
    expect(steppedSummary.timelineEvents).toBe(24);
    expect(steppedSummary.checkpointCount).toBe(4);
  });

  it("remains seed-stable and changes output when the seed changes", () => {
    const sameSeedA = runEvolution(createSession(42), { steps: 40 });
    const sameSeedB = runEvolution(createSession(42), { steps: 40 });
    const differentSeed = runEvolution(createSession(43), { steps: 40 });

    expect(sameSeedA.finalSnapshot).toEqual(sameSeedB.finalSnapshot);
    expect(differentSeed.finalSnapshot).not.toEqual(sameSeedA.finalSnapshot);
  });

  it("serializes and deserializes orchestration run payloads", () => {
    const session = createSession(512);
    const result = runEvolution(session, { steps: 12, includeDeltas: true, checkpointInterval: 3 });

    const json = serializeEvolutionResult(result);
    const decoded = deserializeEvolutionResult(json);

    expect(decoded).toEqual(result);
    expect(decoded.schemaVersion).toBe(WORLD_EVOLUTION_ORCHESTRATION_SCHEMA_VERSION);
  });

  it("resumes from checkpoint and matches uninterrupted run exactly", () => {
    const uninterrupted = runEvolution(createSession(1024), { steps: 60, checkpointInterval: 20 });

    const firstLegSession = createSession(1024);
    const firstLeg = runEvolution(firstLegSession, { steps: 20, checkpointInterval: 20 });
    const checkpoint = firstLeg.checkpoints?.[0];
    if (!checkpoint) throw new Error("expected checkpoint");

    const resumedSession = resumeEvolutionSessionFromCheckpoint(checkpoint);
    const secondLeg = runEvolution(resumedSession, { steps: 40, checkpointInterval: 20, includeCheckpointDiffs: true });

    expect(secondLeg.finalSnapshot).toEqual(uninterrupted.finalSnapshot);
    const uninterruptedTail = uninterrupted.timeline.slice(20).map(({ step: _step, ...rest }) => rest);
    const resumedTimeline = secondLeg.timeline.map(({ step: _step, ...rest }) => rest);
    expect(resumedTimeline).toEqual(uninterruptedTail);
  });

  it("serializes and deserializes checkpoints with deterministic metadata", () => {
    const session = createSession(2048);
    runEvolution(session, { steps: 10, checkpointInterval: 5 });
    const serialized = serializeEvolutionIntermediateState(session);
    const checkpoint = deserializeEvolutionCheckpoint(serialized);

    expect(checkpoint.metadata.engineVersion).toBe(WORLD_EVOLUTION_ENGINE_VERSION);
    expect(checkpoint.metadata.seed).toBe(2048);
    expect(checkpoint.metadata.step).toBe(10);
  });

  it("rejects checkpoint when engine metadata is incompatible", () => {
    const session = createSession(55);
    const result = runEvolution(session, { steps: 5, checkpointInterval: 5 });
    const checkpoint = result.checkpoints?.[0];
    if (!checkpoint) throw new Error("expected checkpoint");

    const tampered = {
      ...checkpoint,
      metadata: {
        ...checkpoint.metadata,
        engineVersion: "0.0.0-dev-incompatible",
      },
    };

    const serialized = serializeEvolutionCheckpoint(tampered);
    expect(() => deserializeEvolutionCheckpoint(serialized)).toThrow(/engine mismatch/);
  });
});
