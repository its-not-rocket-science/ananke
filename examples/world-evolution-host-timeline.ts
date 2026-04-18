import {
  buildEvolutionTimeline,
  runWorldEvolution,
  sortTimelineEventsBySignificance,
  toWorldEvolutionRunRequest,
  type WorldEvolutionInput,
} from "../src/world-evolution-backend/index.js";

const hostInput: WorldEvolutionInput = {
  worldSeed: 20260417,
  entities: [
    { kind: "polity", id: "p.sun", name: "Sun Accord", population: 125_000, treasury_cu: 42_000, governanceType: "republic" },
    { kind: "polity", id: "p.moon", name: "Moon Compact", population: 89_000, treasury_cu: 30_000, governanceType: "monarchy" },
    { kind: "region", id: "r.delta", name: "River Delta", polityId: "p.sun", population: 96_000 },
    { kind: "region", id: "r.highlands", name: "Northern Highlands", polityId: "p.moon", population: 67_000 },
  ],
  relationships: [
    { id: "border.sun-moon", kind: "border", sourceId: "p.sun", targetId: "p.moon", sharedBorderCount: 2, routeQualityQ: 7000 },
    { id: "trade.sun-moon", kind: "trade_route", sourceId: "p.sun", targetId: "p.moon", baseVolume_cu: 12_000, routeQualityQ: 8200 },
    { id: "war.sun-moon", kind: "war", sourceId: "p.sun", targetId: "p.moon" },
  ],
  profileId: "full_world_evolution",
};

const request = toWorldEvolutionRunRequest(hostInput, 40, { includeDeltas: false });
const runResult = runWorldEvolution(request);

// Host-consumable event layer (stable IDs + categories + optional summaries).
const timeline = buildEvolutionTimeline(runResult, { includeSummaryText: true });
const highlights = sortTimelineEventsBySignificance(timeline).slice(0, 5);

console.log("World history timeline (chronological sample):");
for (const event of timeline.slice(0, 8)) {
  console.log(`[${event.tick}] ${event.category.padEnd(18)} severity=${event.severity} id=${event.id}`);
}

console.log("\nTop highlights for a host UI feed:");
for (const event of highlights) {
  console.log(`- (${event.significance}) ${event.summary ?? event.id}`);
}
