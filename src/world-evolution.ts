import {
  WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
  createWorldEvolutionSnapshot,
  resolveWorldEvolutionProfile,
  runWorldEvolution,
  type WorldEvolutionCheckpoint,
  type WorldEvolutionDelta,
  type WorldEvolutionMetrics,
  type WorldEvolutionRulesetId,
  type WorldEvolutionRulesetProfile,
  type WorldEvolutionRunResult,
  type WorldEvolutionSnapshot,
  type WorldEvolutionStepEvent,
} from "./world-evolution-backend/index.js";

export const WORLD_EVOLUTION_ORCHESTRATION_SCHEMA_VERSION = "ananke.world-evolution-orchestration.v1" as const;
export const WORLD_EVOLUTION_ENGINE_VERSION = WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION;

export type EvolutionRuleset = WorldEvolutionRulesetProfile;

export interface EvolutionSessionConfig {
  seed: number;
  canonicalSnapshot: WorldEvolutionSnapshot;
  rulesetId?: WorldEvolutionRulesetId;
  ruleset?: EvolutionRuleset;
  checkpointInterval?: number;
  includeDeltas?: boolean;
  label?: string;
}

export interface EvolutionRequest {
  steps: number;
  checkpointInterval?: number;
  includeDeltas?: boolean;
}

export interface EvolutionTimelineEvent {
  step: number;
  tick: number;
  kind: "evolution.step";
  summary: string;
  tradeCount: number;
  warCount: number;
  migrationCount: number;
  climateEventCount: number;
  epidemicPopulationDelta: number;
  metrics: WorldEvolutionMetrics;
}

export interface EvolutionCheckpoint {
  step: number;
  tick: number;
  summary: string;
  snapshot: WorldEvolutionSnapshot;
}

export interface EvolutionRunResult {
  schemaVersion: typeof WORLD_EVOLUTION_ORCHESTRATION_SCHEMA_VERSION;
  engineVersion: string;
  sessionId: string;
  request: EvolutionRequest;
  ruleset: EvolutionRuleset;
  initialSnapshot: WorldEvolutionSnapshot;
  finalSnapshot: WorldEvolutionSnapshot;
  timeline: EvolutionTimelineEvent[];
  metrics: WorldEvolutionMetrics;
  checkpoints?: EvolutionCheckpoint[];
  deltas?: WorldEvolutionDelta[];
}

export interface EvolutionSessionSummary {
  schemaVersion: typeof WORLD_EVOLUTION_ORCHESTRATION_SCHEMA_VERSION;
  sessionId: string;
  label?: string;
  engineVersion: string;
  seed: number;
  totalSteps: number;
  ruleset: EvolutionRuleset;
  initialSnapshot: WorldEvolutionSnapshot;
  currentSnapshot: WorldEvolutionSnapshot;
  metrics: WorldEvolutionMetrics;
  timelineEvents: number;
  checkpointCount: number;
}

export interface EvolutionSession {
  readonly sessionId: string;
  readonly schemaVersion: typeof WORLD_EVOLUTION_ORCHESTRATION_SCHEMA_VERSION;
  readonly engineVersion: string;
  readonly seed: number;
  readonly label?: string;
  readonly ruleset: EvolutionRuleset;
  readonly canonicalInitialSnapshot: WorldEvolutionSnapshot;
  readonly state: {
    totalSteps: number;
    currentSnapshot: WorldEvolutionSnapshot;
    timeline: EvolutionTimelineEvent[];
    checkpoints: EvolutionCheckpoint[];
    lastMetrics: WorldEvolutionMetrics;
    defaultCheckpointInterval?: number;
    defaultIncludeDeltas: boolean;
  };
}

export function createEvolutionSession(config: EvolutionSessionConfig): EvolutionSession {
  const canonicalSnapshot = createWorldEvolutionSnapshot({
    ...config.canonicalSnapshot,
    worldSeed: config.seed,
  });
  const ruleset = config.ruleset ? cloneRuleset(config.ruleset) : resolveWorldEvolutionProfile(config.rulesetId ?? "balanced");
  const seed = canonicalSnapshot.worldSeed;

  const state: EvolutionSession["state"] = {
    totalSteps: 0,
    currentSnapshot: cloneSnapshot(canonicalSnapshot),
    timeline: [],
    checkpoints: [],
    lastMetrics: computeStaticMetrics(canonicalSnapshot),
    defaultIncludeDeltas: config.includeDeltas ?? false,
  };
  if (config.checkpointInterval != null) {
    state.defaultCheckpointInterval = config.checkpointInterval;
  }

  const session: EvolutionSession = {
    sessionId: buildSessionId(seed, canonicalSnapshot.tick, ruleset.id),
    schemaVersion: WORLD_EVOLUTION_ORCHESTRATION_SCHEMA_VERSION,
    engineVersion: WORLD_EVOLUTION_ENGINE_VERSION,
    seed,
    ruleset,
    canonicalInitialSnapshot: cloneSnapshot(canonicalSnapshot),
    state,
  };
  if (config.label != null) {
    (session as { label: string }).label = config.label;
  }
  return session;
}

export function runEvolution(session: EvolutionSession, request: EvolutionRequest): EvolutionRunResult {
  const steps = Math.max(0, Math.floor(request.steps));
  const initialSnapshot = cloneSnapshot(session.state.currentSnapshot);
  const includeDeltas = request.includeDeltas ?? session.state.defaultIncludeDeltas;
  const checkpointInterval = request.checkpointInterval ?? session.state.defaultCheckpointInterval;

  const backendRequest = {
    snapshot: initialSnapshot,
    steps,
    profile: session.ruleset,
    includeDeltas,
    ...(checkpointInterval != null ? { checkpointInterval } : {}),
  };
  const backendResult = runWorldEvolution(backendRequest);

  const timeline = backendResult.timeline.map(toTimelineEvent);
  const checkpoints = mapCheckpoints(backendResult.checkpoints);

  session.state.totalSteps += steps;
  session.state.currentSnapshot = cloneSnapshot(backendResult.finalSnapshot);
  session.state.timeline.push(...timeline);
  session.state.checkpoints.push(...checkpoints);
  session.state.lastMetrics = { ...backendResult.metrics };

  const result: EvolutionRunResult = {
    schemaVersion: WORLD_EVOLUTION_ORCHESTRATION_SCHEMA_VERSION,
    engineVersion: session.engineVersion,
    sessionId: session.sessionId,
    request: {
      steps,
      includeDeltas,
      ...(checkpointInterval != null ? { checkpointInterval } : {}),
    },
    ruleset: cloneRuleset(session.ruleset),
    initialSnapshot,
    finalSnapshot: cloneSnapshot(backendResult.finalSnapshot),
    timeline,
    metrics: { ...backendResult.metrics },
  };
  if (checkpoints.length > 0) {
    result.checkpoints = checkpoints;
  }
  if (backendResult.deltas) {
    result.deltas = backendResult.deltas.map(cloneDelta);
  }
  return result;
}

export function stepEvolution(
  session: EvolutionSession,
  request: Omit<EvolutionRequest, "steps"> & { steps?: number } = {},
): EvolutionRunResult {
  return runEvolution(session, {
    steps: request.steps ?? 1,
    ...(request.checkpointInterval != null ? { checkpointInterval: request.checkpointInterval } : {}),
    ...(request.includeDeltas != null ? { includeDeltas: request.includeDeltas } : {}),
  });
}

export function getEvolutionSummary(session: EvolutionSession): EvolutionSessionSummary {
  const summary: EvolutionSessionSummary = {
    schemaVersion: WORLD_EVOLUTION_ORCHESTRATION_SCHEMA_VERSION,
    sessionId: session.sessionId,
    engineVersion: session.engineVersion,
    seed: session.seed,
    totalSteps: session.state.totalSteps,
    ruleset: cloneRuleset(session.ruleset),
    initialSnapshot: cloneSnapshot(session.canonicalInitialSnapshot),
    currentSnapshot: cloneSnapshot(session.state.currentSnapshot),
    metrics: { ...session.state.lastMetrics },
    timelineEvents: session.state.timeline.length,
    checkpointCount: session.state.checkpoints.length,
  };
  if (session.label != null) {
    (summary as { label: string }).label = session.label;
  }
  return summary;
}

export function serializeEvolutionResult(result: EvolutionRunResult): string {
  return JSON.stringify({
    schemaVersion: WORLD_EVOLUTION_ORCHESTRATION_SCHEMA_VERSION,
    payload: {
      ...result,
      ruleset: cloneRuleset(result.ruleset),
      initialSnapshot: cloneSnapshot(result.initialSnapshot),
      finalSnapshot: cloneSnapshot(result.finalSnapshot),
      timeline: result.timeline.map((event) => ({ ...event, metrics: { ...event.metrics } })),
      checkpoints: result.checkpoints?.map((checkpoint) => ({
        ...checkpoint,
        snapshot: cloneSnapshot(checkpoint.snapshot),
      })),
      deltas: result.deltas?.map(cloneDelta),
      metrics: { ...result.metrics },
    },
  });
}

export function deserializeEvolutionResult(json: string): EvolutionRunResult {
  const parsed = JSON.parse(json) as { schemaVersion?: string; payload?: EvolutionRunResult };
  const payload = parsed.payload;

  if (parsed.schemaVersion !== WORLD_EVOLUTION_ORCHESTRATION_SCHEMA_VERSION || !payload) {
    throw new Error("Invalid evolution result payload: unsupported schema version or missing payload");
  }

  if (payload.schemaVersion !== WORLD_EVOLUTION_ORCHESTRATION_SCHEMA_VERSION) {
    throw new Error("Invalid evolution result payload: schema mismatch");
  }

  const result: EvolutionRunResult = {
    ...payload,
    request: {
      steps: Math.max(0, Math.floor(payload.request.steps)),
      ...(payload.request.includeDeltas != null ? { includeDeltas: payload.request.includeDeltas } : {}),
      ...(payload.request.checkpointInterval != null ? { checkpointInterval: payload.request.checkpointInterval } : {}),
    },
    ruleset: cloneRuleset(payload.ruleset),
    initialSnapshot: cloneSnapshot(payload.initialSnapshot),
    finalSnapshot: cloneSnapshot(payload.finalSnapshot),
    timeline: payload.timeline.map((event) => ({
      ...event,
      metrics: { ...event.metrics },
    })),
    metrics: { ...payload.metrics },
  };
  if (payload.checkpoints) {
    result.checkpoints = payload.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      snapshot: cloneSnapshot(checkpoint.snapshot),
    }));
  }
  if (payload.deltas) {
    result.deltas = payload.deltas.map(cloneDelta);
  }
  return result;
}

function toTimelineEvent(event: WorldEvolutionStepEvent): EvolutionTimelineEvent {
  return {
    step: event.step,
    tick: event.tick,
    kind: "evolution.step",
    summary: `tick=${event.tick} trade=${event.trade.length} wars=${event.wars.length} migrations=${event.migrations.length} climate=${event.climateEventIds.length} epidemicΔ=${event.epidemicPopulationDelta}`,
    tradeCount: event.trade.length,
    warCount: event.wars.length,
    migrationCount: event.migrations.length,
    climateEventCount: event.climateEventIds.length,
    epidemicPopulationDelta: event.epidemicPopulationDelta,
    metrics: { ...event.metrics },
  };
}

function mapCheckpoints(checkpoints?: WorldEvolutionCheckpoint[]): EvolutionCheckpoint[] {
  if (!checkpoints || checkpoints.length === 0) return [];
  return checkpoints.map((checkpoint) => ({
    step: checkpoint.step,
    tick: checkpoint.tick,
    summary: `checkpoint step=${checkpoint.step} tick=${checkpoint.tick}`,
    snapshot: cloneSnapshot(checkpoint.snapshot),
  }));
}

function cloneRuleset(ruleset: EvolutionRuleset): EvolutionRuleset {
  return { ...ruleset };
}

function cloneSnapshot(snapshot: WorldEvolutionSnapshot): WorldEvolutionSnapshot {
  return createWorldEvolutionSnapshot(snapshot);
}

function cloneDelta(delta: WorldEvolutionDelta): WorldEvolutionDelta {
  return {
    step: delta.step,
    tick: delta.tick,
    polityDeltas: delta.polityDeltas.map((entry) => ({ ...entry })),
  };
}

function buildSessionId(seed: number, tick: number, rulesetId: string): string {
  return `evo-${seed}-${tick}-${rulesetId}`;
}


function computeStaticMetrics(snapshot: WorldEvolutionSnapshot): WorldEvolutionMetrics {
  const polities = snapshot.polities;
  const totalPopulation = polities.reduce((sum, polity) => sum + polity.population, 0);
  const totalTreasury_cu = polities.reduce((sum, polity) => sum + polity.treasury_cu, 0);
  const avgStability_Q = polities.length > 0
    ? Math.floor(polities.reduce((sum, polity) => sum + polity.stabilityQ, 0) / polities.length)
    : 0;
  const avgMorale_Q = polities.length > 0
    ? Math.floor(polities.reduce((sum, polity) => sum + polity.moraleQ, 0) / polities.length)
    : 0;

  return {
    totalPopulation,
    totalTreasury_cu,
    avgStability_Q,
    avgMorale_Q,
    activeWars: snapshot.activeWars.length,
    activeTreaties: snapshot.treaties.length,
    viableTradeRoutes: snapshot.tradeRoutes.length,
    activeEpidemics: snapshot.epidemics.length,
    activeClimateEvents: snapshot.climateByPolity.reduce((sum, entry) => sum + entry.active.length, 0),
    migrationsThisStep: 0,
    migrationsTotalPopulation: 0,
  };
}

export type {
  WorldEvolutionSnapshot,
  WorldEvolutionMetrics,
  WorldEvolutionDelta,
  WorldEvolutionRulesetId,
};

export type { WorldEvolutionRunResult as EvolutionBackendRunResult };
