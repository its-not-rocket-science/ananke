import {
  buildEvolutionTimeline,
  runWorldEvolution,
  toWorldEvolutionRunRequest,
  validateWorldEvolutionInput,
  type WorldEvolutionInput,
} from "../src/world-evolution-backend/public.js";

function buildHostInput(): WorldEvolutionInput {
  return {
    worldSeed: 1337,
    entities: [
      {
        kind: "polity",
        id: "p.alpha",
        name: "Alpha Republic",
        controlledSettlementIds: ["s.capital"],
        population: 90_000,
        treasury_cu: 30_000,
        stabilityQ: 650,
        moraleQ: 620,
      },
      {
        kind: "polity",
        id: "p.beta",
        name: "Beta League",
        controlledSettlementIds: ["s.port"],
        population: 70_000,
        treasury_cu: 24_000,
        stabilityQ: 590,
        moraleQ: 570,
      },
      {
        kind: "settlement",
        id: "s.capital",
        name: "Capital",
        polityId: "p.alpha",
        population: 40_000,
      },
      {
        kind: "settlement",
        id: "s.port",
        name: "Port",
        polityId: "p.beta",
        population: 25_000,
      },
    ],
    relationships: [
      {
        id: "border.alpha.beta",
        kind: "border",
        sourceId: "p.alpha",
        targetId: "p.beta",
        sharedBorderCount: 2,
        routeQualityQ: 700,
      },
      {
        id: "trade.alpha.beta",
        kind: "trade_route",
        sourceId: "p.alpha",
        targetId: "p.beta",
        baseVolume_cu: 18_000,
        routeQualityQ: 760,
      },
      {
        id: "treaty.alpha.beta",
        kind: "treaty",
        sourceId: "p.alpha",
        targetId: "p.beta",
        treatyType: "trade_pact",
        treatyStrength_Q: 700,
      },
    ],
  };
}

function runFirstHour(): void {
  const hostInput = { ...buildHostInput(), profileId: "polity_dynamics" as const };
  const validation = validateWorldEvolutionInput(hostInput);

  if (validation.length > 0) {
    throw new Error(`Invalid host input: ${validation.map((v) => `${v.path} ${v.code}`).join("; ")}`);
  }

  const request = toWorldEvolutionRunRequest(hostInput, 90, {
    includeDeltas: true,
    checkpointInterval: 30,
  });

  const first = runWorldEvolution(request);
  const second = runWorldEvolution(request);

  const timeline = buildEvolutionTimeline(first, { includeSummaryText: true });
  const highlights = timeline.slice(0, 5).map((event) => ({
    step: event.step,
    category: event.category,
    significance: event.significance,
    summary: event.summary,
  }));

  console.log("[world-evolution-engine:first-hour] checkpoints", first.checkpoints?.length ?? 0);
  console.log("[world-evolution-engine:first-hour] finalTick", first.finalSnapshot.tick);
  console.log("[world-evolution-engine:first-hour] deterministic", JSON.stringify(first) === JSON.stringify(second));
  console.log("[world-evolution-engine:first-hour] highlights", JSON.stringify(highlights, null, 2));
}

runFirstHour();
