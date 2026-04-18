import { describe, expect, it } from "vitest";
import { signTreaty } from "../src/diplomacy.js";
import { PRESET_LAW_CODES, createGovernanceState } from "../src/governance.js";
import { createPolity, type PolityPair } from "../src/polity.js";
import { establishRoute } from "../src/trade-routes.js";
import { q } from "../src/units.js";
import {
  WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
  buildEvolutionTimeline,
  runWorldEvolution,
  sortTimelineEventsBySignificance,
  type WorldEvolutionRunRequest,
} from "../src/world-evolution-backend/index.js";

function createTimelineRequest(): WorldEvolutionRunRequest {
  const a = createPolity("a", "A", "fA", ["L1", "L2"], 120_000, 40_000, "Medieval", q(0.70), q(0.65));
  const b = createPolity("b", "B", "fB", ["L3"], 80_000, 30_000, "Medieval", q(0.60), q(0.55));

  const treatyRegistry = { treaties: new Map() };
  signTreaty(treatyRegistry, "a", "b", "trade_pact", 0, 365);

  const tradeRegistry = { routes: new Map() };
  establishRoute(tradeRegistry, "a", "b", 8_000);

  const pairs: PolityPair[] = [
    { polityAId: "a", polityBId: "b", sharedLocations: 2, routeQuality_Q: q(0.7) },
  ];

  return {
    snapshot: {
      schemaVersion: WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
      worldSeed: 7331,
      tick: 0,
      polities: [a, b],
      pairs,
      activeWars: [["a", "b"]],
      treaties: [...treatyRegistry.treaties.values()],
      tradeRoutes: [...tradeRegistry.routes.values()],
      governanceStates: [
        createGovernanceState("a", "republic"),
        createGovernanceState("b", "monarchy"),
      ],
      governanceLawRegistry: PRESET_LAW_CODES,
      epidemics: [],
      diseases: [],
      climateByPolity: [],
    },
    steps: 24,
    profileId: "full_world_evolution",
  };
}

describe("world-evolution timeline builder", () => {
  it("builds deterministic chronological timeline events with stable IDs", () => {
    const request = createTimelineRequest();

    const firstRun = runWorldEvolution(request);
    const secondRun = runWorldEvolution(request);

    const firstTimeline = buildEvolutionTimeline(firstRun);
    const secondTimeline = buildEvolutionTimeline(secondRun);

    expect(secondTimeline).toEqual(firstTimeline);
    expect(firstTimeline.length).toBeGreaterThan(0);

    const categoryOrder: Record<string, number> = {
      polity: 0,
      governance: 1,
      diplomacy: 2,
      economy: 3,
      infrastructure: 4,
      migration: 5,
      conflict: 6,
      climate: 7,
      disease: 8,
      mythology_culture: 9,
    };
    const copy = [...firstTimeline].sort((a, b) =>
      a.tick - b.tick
      || a.step - b.step
      || categoryOrder[a.category] - categoryOrder[b.category]
      || a.sequence - b.sequence
      || a.id.localeCompare(b.id));
    expect(copy).toEqual(firstTimeline);

    const ids = new Set(firstTimeline.map((event) => event.id));
    expect(ids.size).toBe(firstTimeline.length);
  });

  it("supports host-friendly significance sorting when summaries are requested", () => {
    const request = createTimelineRequest();
    const runResult = runWorldEvolution(request);

    const timeline = buildEvolutionTimeline(runResult, { includeSummaryText: true });
    const sorted = sortTimelineEventsBySignificance(timeline);

    expect(sorted).toHaveLength(timeline.length);
    expect(sorted[0]?.significance).toBeGreaterThanOrEqual(sorted[1]?.significance ?? 0);
    expect(timeline.every((event) => typeof event.summary === "string" && event.summary.length > 0)).toBe(true);
  });
});
