import { mapOpenWorldHostToEvolutionInput, toAnankeEvolutionStateFromOpenWorld, type OpenWorldHostInput } from "./open-world-host-adapter.js";
import { mergeWorldEvolutionProfileWithOverrides } from "./profiles.js";
import { runWorldEvolution } from "./engine.js";
import { buildEvolutionTimeline, sortTimelineEventsBySignificance } from "./timeline.js";
import type { EvolutionTimelineEvent, WorldEvolutionRunResult, WorldEvolutionStepEvent } from "./types.js";

export interface OpenWorldBuilderDemoRunConfig {
  label: string;
  steps: number;
  checkpointInterval: number;
  profileId?: "full_world_evolution" | "climate_and_migration" | "conflict_heavy";
  profileTweaks?: {
    treatyStrengthBoost_Q?: number;
    routeEfficiencyBoost_Q?: number;
    epidemicHealthBuffer_Q?: number;
  };
}

export interface OpenWorldBuilderRunArtifacts {
  label: string;
  steps: number;
  checkpointInterval: number;
  finalWorldState: WorldEvolutionRunResult["finalSnapshot"];
  timelineEvents: EvolutionTimelineEvent[];
  metricsDashboard: {
    schemaVersion: "ananke.metrics-dashboard.v1";
    runLabel: string;
    totalSteps: number;
    startTick: number;
    finalTick: number;
    finalMetrics: WorldEvolutionRunResult["metrics"];
    sampledSeries: Array<{
      step: number;
      tick: number;
      totalPopulation: number;
      totalTreasury_cu: number;
      avgStability_Q: number;
      avgMorale_Q: number;
      activeWars: number;
      activeTreaties: number;
      viableTradeRoutes: number;
      activeEpidemics: number;
      activeClimateEvents: number;
      migrationsTotalPopulation: number;
    }>;
  };
  checkpointMetadata: {
    count: number;
    first?: { step: number; tick: number };
    last?: { step: number; tick: number };
    cadence: number;
  };
}

export interface OpenWorldBuilderDemoOutput {
  schemaVersion: "ananke.openworldbuilder-reference-demo.v1";
  adapterSummary: {
    sourceSchemaVersion?: string;
    anankeHostSchemaVersion?: string;
    worldSeed: number;
    startingTick: number;
    hostEntityCount: number;
    hostRelationshipCount: number;
    hostResourceCount: number;
    integrationNote: string;
  };
  baseline: OpenWorldBuilderRunArtifacts;
  altered: OpenWorldBuilderRunArtifacts;
  divergence: {
    finalTickDelta: number;
    totalPopulationDelta: number;
    totalTreasuryDelta_cu: number;
    avgStabilityDelta_Q: number;
    avgMoraleDelta_Q: number;
    activeWarsDelta: number;
    activeTreatiesDelta: number;
    viableTradeRoutesDelta: number;
    timelineEventCountDelta: number;
    strongestDivergenceSignals: Array<{
      category: string;
      baselineEventId: string;
      alteredEventId: string;
      significanceDelta: number;
      severityDelta: number;
    }>;
  };
}

export function runOpenWorldBuilderReferenceDemo(
  fixture: OpenWorldHostInput,
  baselineConfig: OpenWorldBuilderDemoRunConfig,
  alteredConfig: OpenWorldBuilderDemoRunConfig,
): OpenWorldBuilderDemoOutput {
  const mapped = mapOpenWorldHostToEvolutionInput(fixture);
  const adapted = toAnankeEvolutionStateFromOpenWorld(fixture);

  const baseline = executeRun(adapted.snapshot, baselineConfig);
  const altered = executeRun(adapted.snapshot, alteredConfig);

  return {
    schemaVersion: "ananke.openworldbuilder-reference-demo.v1",
    adapterSummary: {
      ...(fixture.schemaVersion == null ? {} : { sourceSchemaVersion: fixture.schemaVersion }),
      ...(mapped.input.schemaVersion == null ? {} : { anankeHostSchemaVersion: mapped.input.schemaVersion }),
      worldSeed: mapped.input.worldSeed,
      startingTick: mapped.input.tick ?? 0,
      hostEntityCount: mapped.input.entities.length,
      hostRelationshipCount: mapped.input.relationships?.length ?? 0,
      hostResourceCount: mapped.input.resources?.length ?? 0,
      integrationNote: "Ananke consumes host-generated world state and evolves it deterministically; generation and lore storage stay host-owned.",
    },
    baseline,
    altered,
    divergence: compareRuns(baseline, altered),
  };
}

function executeRun(
  snapshot: WorldEvolutionRunResult["finalSnapshot"],
  config: OpenWorldBuilderDemoRunConfig,
): OpenWorldBuilderRunArtifacts {
  const profile = mergeWorldEvolutionProfileWithOverrides(config.profileId ?? "full_world_evolution", {
    ...config.profileTweaks,
  });

  const result = runWorldEvolution({
    snapshot,
    steps: config.steps,
    checkpointInterval: config.checkpointInterval,
    includeDeltas: false,
    profile,
  });

  const timeline = buildEvolutionTimeline(result, { includeSummaryText: true });
  const prioritizedTimeline = sortTimelineEventsBySignificance(timeline).slice(0, 32);

  return {
    label: config.label,
    steps: config.steps,
    checkpointInterval: config.checkpointInterval,
    finalWorldState: result.finalSnapshot,
    timelineEvents: prioritizedTimeline,
    metricsDashboard: {
      schemaVersion: "ananke.metrics-dashboard.v1",
      runLabel: config.label,
      totalSteps: config.steps,
      startTick: result.initialSnapshot.tick,
      finalTick: result.finalSnapshot.tick,
      finalMetrics: result.metrics,
      sampledSeries: sampleMetrics(result.timeline),
    },
    checkpointMetadata: {
      count: result.checkpoints?.length ?? 0,
      ...(result.checkpoints?.[0] == null
        ? {}
        : { first: { step: result.checkpoints[0].step, tick: result.checkpoints[0].tick } }),
      ...(result.checkpoints?.at(-1) == null
        ? {}
        : {
          last: {
            step: result.checkpoints.at(-1)!.step,
            tick: result.checkpoints.at(-1)!.tick,
          },
        }),
      cadence: config.checkpointInterval,
    },
  };
}

function sampleMetrics(timeline: WorldEvolutionStepEvent[]): OpenWorldBuilderRunArtifacts["metricsDashboard"]["sampledSeries"] {
  const interval = Math.max(1, Math.floor(timeline.length / 12));
  const sampled = timeline.filter((event, index) => (index + 1) % interval === 0);
  const includeFinal = timeline.at(-1);

  const coalesced = includeFinal == null || sampled.some((event) => event.step === includeFinal.step)
    ? sampled
    : [...sampled, includeFinal];

  return coalesced.map((event) => ({
    step: event.step,
    tick: event.tick,
    totalPopulation: event.metrics.totalPopulation,
    totalTreasury_cu: event.metrics.totalTreasury_cu,
    avgStability_Q: event.metrics.avgStability_Q,
    avgMorale_Q: event.metrics.avgMorale_Q,
    activeWars: event.metrics.activeWars,
    activeTreaties: event.metrics.activeTreaties,
    viableTradeRoutes: event.metrics.viableTradeRoutes,
    activeEpidemics: event.metrics.activeEpidemics,
    activeClimateEvents: event.metrics.activeClimateEvents,
    migrationsTotalPopulation: event.metrics.migrationsTotalPopulation,
  }));
}

function compareRuns(baseline: OpenWorldBuilderRunArtifacts, altered: OpenWorldBuilderRunArtifacts): OpenWorldBuilderDemoOutput["divergence"] {
  const baselineMetrics = baseline.metricsDashboard.finalMetrics;
  const alteredMetrics = altered.metricsDashboard.finalMetrics;
  const strongestDivergenceSignals = zipTimelineSignals(baseline.timelineEvents, altered.timelineEvents)
    .map(([base, alt]) => ({
      category: `${base.category}`,
      baselineEventId: base.id,
      alteredEventId: alt.id,
      significanceDelta: alt.significance - base.significance,
      severityDelta: alt.severity - base.severity,
    }))
    .sort((a, b) => Math.abs(b.significanceDelta) - Math.abs(a.significanceDelta) || Math.abs(b.severityDelta) - Math.abs(a.severityDelta))
    .slice(0, 8);

  return {
    finalTickDelta: altered.finalWorldState.tick - baseline.finalWorldState.tick,
    totalPopulationDelta: alteredMetrics.totalPopulation - baselineMetrics.totalPopulation,
    totalTreasuryDelta_cu: alteredMetrics.totalTreasury_cu - baselineMetrics.totalTreasury_cu,
    avgStabilityDelta_Q: alteredMetrics.avgStability_Q - baselineMetrics.avgStability_Q,
    avgMoraleDelta_Q: alteredMetrics.avgMorale_Q - baselineMetrics.avgMorale_Q,
    activeWarsDelta: alteredMetrics.activeWars - baselineMetrics.activeWars,
    activeTreatiesDelta: alteredMetrics.activeTreaties - baselineMetrics.activeTreaties,
    viableTradeRoutesDelta: alteredMetrics.viableTradeRoutes - baselineMetrics.viableTradeRoutes,
    timelineEventCountDelta: altered.timelineEvents.length - baseline.timelineEvents.length,
    strongestDivergenceSignals,
  };
}

function zipTimelineSignals(
  baselineEvents: EvolutionTimelineEvent[],
  alteredEvents: EvolutionTimelineEvent[],
): Array<[EvolutionTimelineEvent, EvolutionTimelineEvent]> {
  const pairCount = Math.min(baselineEvents.length, alteredEvents.length);
  const pairs: Array<[EvolutionTimelineEvent, EvolutionTimelineEvent]> = [];
  for (let index = 0; index < pairCount; index++) {
    const baselineEvent = baselineEvents[index];
    const alteredEvent = alteredEvents[index];
    if (baselineEvent == null || alteredEvent == null) continue;
    pairs.push([baselineEvent, alteredEvent]);
  }
  return pairs;
}
