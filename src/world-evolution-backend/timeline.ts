import { SCALE } from "../units.js";
import type {
  EvolutionTimelineCategory,
  EvolutionTimelineEvent,
  EvolutionTimelineFactRef,
  WorldEvolutionMetrics,
  WorldEvolutionRunResult,
  WorldEvolutionStepEvent,
} from "./types.js";

export interface BuildEvolutionTimelineOptions {
  includeSummaryText?: boolean;
}

const CATEGORY_ORDER: Readonly<Record<EvolutionTimelineCategory, number>> = {
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

const CATEGORY_WEIGHT: Readonly<Record<EvolutionTimelineCategory, number>> = {
  polity: 16,
  migration: 14,
  conflict: 20,
  diplomacy: 12,
  economy: 10,
  disease: 18,
  climate: 15,
  infrastructure: 8,
  governance: 11,
  mythology_culture: 7,
};

export function buildEvolutionTimeline(
  result: Pick<WorldEvolutionRunResult, "initialSnapshot" | "timeline">,
  options: BuildEvolutionTimelineOptions = {},
): EvolutionTimelineEvent[] {
  const includeSummaryText = options.includeSummaryText === true;
  const events: EvolutionTimelineEvent[] = [];

  let previousMetrics: WorldEvolutionMetrics | undefined;
  let sequence = 0;

  for (const stepEvent of result.timeline) {
    const metricsDelta = deriveMetricsDelta(previousMetrics, stepEvent.metrics);

    appendTradeEvents(events, result.initialSnapshot.worldSeed, stepEvent, includeSummaryText, () => sequence++);
    appendConflictEvents(events, result.initialSnapshot.worldSeed, stepEvent, includeSummaryText, () => sequence++);
    appendMigrationEvents(events, result.initialSnapshot.worldSeed, stepEvent, includeSummaryText, () => sequence++);
    appendClimateEvents(events, result.initialSnapshot.worldSeed, stepEvent, includeSummaryText, () => sequence++);
    appendDiseaseEvents(events, result.initialSnapshot.worldSeed, stepEvent, includeSummaryText, () => sequence++);
    appendMetricDerivedEvents(events, result.initialSnapshot.worldSeed, stepEvent, metricsDelta, includeSummaryText, () => sequence++);

    previousMetrics = stepEvent.metrics;
  }

  return events.sort((a, b) =>
    a.tick - b.tick
    || a.step - b.step
    || CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]
    || a.sequence - b.sequence
    || a.id.localeCompare(b.id));
}

export function sortTimelineEventsBySignificance(events: readonly EvolutionTimelineEvent[]): EvolutionTimelineEvent[] {
  return [...events].sort((a, b) =>
    b.significance - a.significance
    || b.severity - a.severity
    || a.tick - b.tick
    || a.id.localeCompare(b.id));
}

function appendTradeEvents(
  target: EvolutionTimelineEvent[],
  worldSeed: number,
  step: WorldEvolutionStepEvent,
  includeSummaryText: boolean,
  nextSequence: () => number,
): void {
  for (let index = 0; index < step.trade.length; index++) {
    const trade = step.trade[index];
    if (!trade) continue;
    const severity = clampPercent(Math.floor(trade.incomeEach_cu / 250));
    target.push(makeEvent({
      worldSeed,
      step,
      category: "economy",
      severity,
      significanceBoost: 5,
      entityIds: [trade.polityAId, trade.polityBId],
      factRefs: [factRef("trade", step, index)],
      detail: { incomeEach_cu: trade.incomeEach_cu },
      includeSummaryText,
      summary: `Trade volume expanded between ${trade.polityAId} and ${trade.polityBId} (+${trade.incomeEach_cu} cu each).`,
      sequence: nextSequence(),
      localIndex: index,
    }));
  }
}

function appendConflictEvents(
  target: EvolutionTimelineEvent[],
  worldSeed: number,
  step: WorldEvolutionStepEvent,
  includeSummaryText: boolean,
  nextSequence: () => number,
): void {
  for (let index = 0; index < step.wars.length; index++) {
    const war = step.wars[index];
    if (!war) continue;
    const territoryPressure = Math.abs(war.territoryGained.length) * 8;
    const severity = clampPercent(35 + territoryPressure + Math.floor((Math.abs(war.stabilityDeltaAttacker) + Math.abs(war.stabilityDeltaDefender)) * 100 / SCALE.Q));
    target.push(makeEvent({
      worldSeed,
      step,
      category: "conflict",
      severity,
      significanceBoost: 12,
      entityIds: [war.attackerId, war.defenderId],
      factRefs: [factRef("wars", step, index)],
      detail: { attackerWins: war.attackerWins, territoryGained: [...war.territoryGained] },
      includeSummaryText,
      summary: `${war.attackerId} ${war.attackerWins ? "prevailed over" : "failed against"} ${war.defenderId}.`,
      sequence: nextSequence(),
      localIndex: index,
    }));
  }
}

function appendMigrationEvents(
  target: EvolutionTimelineEvent[],
  worldSeed: number,
  step: WorldEvolutionStepEvent,
  includeSummaryText: boolean,
  nextSequence: () => number,
): void {
  for (let index = 0; index < step.migrations.length; index++) {
    const migration = step.migrations[index];
    if (!migration) continue;
    const severity = clampPercent(Math.floor(migration.population / 40));
    target.push(makeEvent({
      worldSeed,
      step,
      category: "migration",
      severity,
      significanceBoost: 8,
      entityIds: [migration.fromPolityId, migration.toPolityId],
      factRefs: [factRef("migrations", step, index)],
      detail: { population: migration.population },
      includeSummaryText,
      summary: `${migration.population} people migrated from ${migration.fromPolityId} to ${migration.toPolityId}.`,
      sequence: nextSequence(),
      localIndex: index,
    }));
  }
}

function appendClimateEvents(
  target: EvolutionTimelineEvent[],
  worldSeed: number,
  step: WorldEvolutionStepEvent,
  includeSummaryText: boolean,
  nextSequence: () => number,
): void {
  for (let index = 0; index < step.climateEventIds.length; index++) {
    const climateEventId = step.climateEventIds[index];
    if (!climateEventId) continue;
    const severity = clampPercent(30 + Math.floor(climateEventId.length / 3));
    target.push(makeEvent({
      worldSeed,
      step,
      category: "climate",
      severity,
      significanceBoost: 10,
      entityIds: [],
      factRefs: [factRef("climateEventIds", step, index)],
      detail: { climateEventId },
      includeSummaryText,
      summary: `Climate pressure event triggered (${climateEventId}).`,
      sequence: nextSequence(),
      localIndex: index,
    }));
  }
}

function appendDiseaseEvents(
  target: EvolutionTimelineEvent[],
  worldSeed: number,
  step: WorldEvolutionStepEvent,
  includeSummaryText: boolean,
  nextSequence: () => number,
): void {
  if (step.epidemicPopulationDelta === 0) return;
  const severity = clampPercent(Math.floor(Math.abs(step.epidemicPopulationDelta) / 20));
  target.push(makeEvent({
    worldSeed,
    step,
    category: "disease",
    severity,
    significanceBoost: 14,
    entityIds: [],
    factRefs: [factRef("epidemicPopulationDelta", step)],
    detail: { epidemicPopulationDelta: step.epidemicPopulationDelta },
    includeSummaryText,
    summary: `Epidemic pressure shifted population by ${step.epidemicPopulationDelta}.`,
    sequence: nextSequence(),
    localIndex: 0,
  }));
}

function appendMetricDerivedEvents(
  target: EvolutionTimelineEvent[],
  worldSeed: number,
  step: WorldEvolutionStepEvent,
  metricsDelta: ReturnType<typeof deriveMetricsDelta>,
  includeSummaryText: boolean,
  nextSequence: () => number,
): void {
  const metricFacts = [factRef("metrics", step)];

  if (metricsDelta.totalPopulation !== 0) {
    const severity = clampPercent(Math.floor(Math.abs(metricsDelta.totalPopulation) / 60));
    target.push(makeEvent({
      worldSeed,
      step,
      category: "polity",
      severity,
      significanceBoost: 7,
      entityIds: [],
      factRefs: metricFacts,
      detail: { totalPopulationDelta: metricsDelta.totalPopulation },
      includeSummaryText,
      summary: `Aggregate polity population changed by ${metricsDelta.totalPopulation}.`,
      sequence: nextSequence(),
      localIndex: 0,
    }));
  }

  if (metricsDelta.activeTreaties !== 0) {
    target.push(makeEvent({
      worldSeed,
      step,
      category: "diplomacy",
      severity: clampPercent(25 + Math.abs(metricsDelta.activeTreaties) * 20),
      significanceBoost: 6,
      entityIds: [],
      factRefs: metricFacts,
      detail: { activeTreatiesDelta: metricsDelta.activeTreaties },
      includeSummaryText,
      summary: `Diplomatic treaty count shifted by ${metricsDelta.activeTreaties}.`,
      sequence: nextSequence(),
      localIndex: 1,
    }));
  }

  if (metricsDelta.avgStability_Q !== 0) {
    target.push(makeEvent({
      worldSeed,
      step,
      category: "governance",
      severity: clampPercent(Math.floor(Math.abs(metricsDelta.avgStability_Q) * 100 / SCALE.Q)),
      significanceBoost: 4,
      entityIds: [],
      factRefs: metricFacts,
      detail: { avgStabilityDelta_Q: metricsDelta.avgStability_Q },
      includeSummaryText,
      summary: `Governance stability shifted by ${metricsDelta.avgStability_Q}.`,
      sequence: nextSequence(),
      localIndex: 2,
    }));
  }

  if (metricsDelta.viableTradeRoutes !== 0) {
    target.push(makeEvent({
      worldSeed,
      step,
      category: "infrastructure",
      severity: clampPercent(20 + Math.abs(metricsDelta.viableTradeRoutes) * 15),
      significanceBoost: 5,
      entityIds: [],
      factRefs: metricFacts,
      detail: { viableTradeRoutesDelta: metricsDelta.viableTradeRoutes },
      includeSummaryText,
      summary: `Infrastructure connectivity changed by ${metricsDelta.viableTradeRoutes} viable routes.`,
      sequence: nextSequence(),
      localIndex: 3,
    }));
  }

  if (metricsDelta.totalTreasury_cu !== 0 && step.trade.length === 0) {
    target.push(makeEvent({
      worldSeed,
      step,
      category: "economy",
      severity: clampPercent(Math.floor(Math.abs(metricsDelta.totalTreasury_cu) / 500)),
      significanceBoost: 3,
      entityIds: [],
      factRefs: metricFacts,
      detail: { totalTreasuryDelta_cu: metricsDelta.totalTreasury_cu },
      includeSummaryText,
      summary: `Macro treasury shifted by ${metricsDelta.totalTreasury_cu} cu.`,
      sequence: nextSequence(),
      localIndex: 4,
    }));
  }

  if (metricsDelta.avgMorale_Q !== 0) {
    target.push(makeEvent({
      worldSeed,
      step,
      category: "mythology_culture",
      severity: clampPercent(Math.floor(Math.abs(metricsDelta.avgMorale_Q) * 100 / SCALE.Q)),
      significanceBoost: 2,
      entityIds: [],
      factRefs: metricFacts,
      detail: { avgMoraleDelta_Q: metricsDelta.avgMorale_Q },
      includeSummaryText,
      summary: `Cultural sentiment moved by ${metricsDelta.avgMorale_Q}.`,
      sequence: nextSequence(),
      localIndex: 5,
    }));
  }
}

function makeEvent(args: {
  worldSeed: number;
  step: WorldEvolutionStepEvent;
  category: EvolutionTimelineCategory;
  severity: number;
  significanceBoost: number;
  entityIds: string[];
  factRefs: EvolutionTimelineFactRef[];
  detail: Record<string, unknown>;
  includeSummaryText: boolean;
  summary: string;
  sequence: number;
  localIndex: number;
}): EvolutionTimelineEvent {
  const fingerprint = JSON.stringify({
    seed: args.worldSeed,
    step: args.step.step,
    tick: args.step.tick,
    category: args.category,
    index: args.localIndex,
    entities: [...args.entityIds].sort((a, b) => a.localeCompare(b)),
    detail: args.detail,
    facts: args.factRefs.map((ref) => `${ref.subsystem}:${ref.step}:${ref.tick}:${ref.index ?? -1}`),
  });
  const hash = stableHashHex(fingerprint);
  const significance = clampPercent(args.severity + CATEGORY_WEIGHT[args.category] + args.significanceBoost);

  return {
    id: `evo.${args.step.step}.${args.category}.${hash.slice(0, 12)}`,
    hash,
    step: args.step.step,
    tick: args.step.tick,
    category: args.category,
    severity: args.severity,
    significance,
    entityIds: [...args.entityIds].sort((a, b) => a.localeCompare(b)),
    factRefs: args.factRefs.map((ref) => ({ ...ref })),
    ...(args.includeSummaryText ? { summary: args.summary } : {}),
    sequence: args.sequence,
  };
}

function factRef(
  subsystem: EvolutionTimelineFactRef["subsystem"],
  step: WorldEvolutionStepEvent,
  index?: number,
): EvolutionTimelineFactRef {
  return {
    subsystem,
    step: step.step,
    tick: step.tick,
    ...(index != null ? { index } : {}),
  };
}

function deriveMetricsDelta(prev: WorldEvolutionMetrics | undefined, next: WorldEvolutionMetrics): WorldEvolutionMetrics {
  if (prev == null) {
    return {
      totalPopulation: next.totalPopulation,
      totalTreasury_cu: next.totalTreasury_cu,
      avgStability_Q: next.avgStability_Q,
      avgMorale_Q: next.avgMorale_Q,
      activeWars: next.activeWars,
      activeTreaties: next.activeTreaties,
      viableTradeRoutes: next.viableTradeRoutes,
      activeEpidemics: next.activeEpidemics,
      activeClimateEvents: next.activeClimateEvents,
      migrationsThisStep: next.migrationsThisStep,
      migrationsTotalPopulation: next.migrationsTotalPopulation,
    };
  }
  return {
    totalPopulation: next.totalPopulation - prev.totalPopulation,
    totalTreasury_cu: next.totalTreasury_cu - prev.totalTreasury_cu,
    avgStability_Q: next.avgStability_Q - prev.avgStability_Q,
    avgMorale_Q: next.avgMorale_Q - prev.avgMorale_Q,
    activeWars: next.activeWars - prev.activeWars,
    activeTreaties: next.activeTreaties - prev.activeTreaties,
    viableTradeRoutes: next.viableTradeRoutes - prev.viableTradeRoutes,
    activeEpidemics: next.activeEpidemics - prev.activeEpidemics,
    activeClimateEvents: next.activeClimateEvents - prev.activeClimateEvents,
    migrationsThisStep: next.migrationsThisStep - prev.migrationsThisStep,
    migrationsTotalPopulation: next.migrationsTotalPopulation - prev.migrationsTotalPopulation,
  };
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.floor(value)));
}

function stableHashHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const normalized = hash >>> 0;
  return normalized.toString(16).padStart(8, "0");
}
