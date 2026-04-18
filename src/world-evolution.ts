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
import { ANANKE_ENGINE_VERSION } from "./version.js";
import { hashString } from "./sim/seeds.js";

export const WORLD_EVOLUTION_ORCHESTRATION_SCHEMA_VERSION = "ananke.world-evolution-orchestration.v1" as const;
export const WORLD_EVOLUTION_ENGINE_VERSION = ANANKE_ENGINE_VERSION;
export const WORLD_EVOLUTION_CHECKPOINT_SCHEMA_VERSION = "ananke.world-evolution-checkpoint.v1" as const;

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
  includeCheckpointDiffs?: boolean;
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
  metadata: EvolutionCheckpointMetadata;
}

export interface EvolutionCheckpointMetadata {
  engineVersion: string;
  seed: number;
  rulesetProfile: EvolutionRuleset;
  step: number;
  schemaVersion: typeof WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION;
}

export interface EvolutionCheckpointDiff {
  fromStep: number;
  toStep: number;
  fromTick: number;
  toTick: number;
  fromSnapshotHash: string;
  toSnapshotHash: string;
  worldChanges: Record<string, unknown>;
  polityDeltas: Array<{
    polityId: string;
    populationDelta: number;
    treasuryDelta_cu: number;
    stabilityDelta_Q: number;
    moraleDelta_Q: number;
  }>;
}

export interface SerializedEvolutionCheckpoint {
  schemaVersion: typeof WORLD_EVOLUTION_CHECKPOINT_SCHEMA_VERSION;
  checkpoint: EvolutionCheckpoint;
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
  checkpointDiffs?: EvolutionCheckpointDiff[];
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

export interface ResumeEvolutionOptions {
  label?: string;
  checkpointInterval?: number;
  includeDeltas?: boolean;
}

export interface EvolutionBranchMetadata {
  name: string;
  description?: string;
  seed: number;
  rulesetProfile: EvolutionRuleset;
  createdAtStep: number;
  parentBranchId?: string;
}

export interface EvolutionBranchSnapshotRef {
  snapshot: WorldEvolutionSnapshot;
  step: number;
  tick: number;
  snapshotHash: string;
}

export interface EvolutionBranchDerivedState {
  totalSteps: number;
  currentSnapshot: WorldEvolutionSnapshot;
  timeline: EvolutionTimelineEvent[];
  lastMetrics: WorldEvolutionMetrics;
}

export interface EvolutionBranch {
  branchId: string;
  schemaVersion: typeof WORLD_EVOLUTION_ORCHESTRATION_SCHEMA_VERSION;
  baseSnapshotRef: EvolutionBranchSnapshotRef;
  derivedState: EvolutionBranchDerivedState;
  branchMetadata: EvolutionBranchMetadata;
}

export interface CreateEvolutionBranchInput {
  baseSnapshot: WorldEvolutionSnapshot;
  metadata: {
    name: string;
    description?: string;
    seed: number;
    rulesetProfile?: EvolutionRuleset;
    rulesetId?: WorldEvolutionRulesetId;
    createdAtStep?: number;
    parentBranchId?: string;
  };
  baseStep?: number;
}

export interface ForkEvolutionBranchInput {
  metadata: {
    name: string;
    description?: string;
    seed?: number;
    rulesetProfile?: EvolutionRuleset;
    rulesetId?: WorldEvolutionRulesetId;
  };
}

export interface EvolutionBranchDiff {
  branchId: string;
  baseSnapshotRef: Pick<EvolutionBranchSnapshotRef, "step" | "tick" | "snapshotHash">;
  branchStep: number;
  branchTick: number;
  branchSnapshotHash: string;
  worldChanges: Record<string, unknown>;
  polityDeltas: Array<{
    polityId: string;
    populationDelta: number;
    treasuryDelta_cu: number;
    stabilityDelta_Q: number;
    moraleDelta_Q: number;
  }>;
}

export function createEvolutionSession(config: EvolutionSessionConfig): EvolutionSession {
  const canonicalSnapshot = createWorldEvolutionSnapshot({
    ...config.canonicalSnapshot,
    worldSeed: config.seed,
  });
  const ruleset = config.ruleset ? cloneRuleset(config.ruleset) : resolveWorldEvolutionProfile(config.rulesetId ?? "full_world_evolution");
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
  const includeCheckpointDiffs = request.includeCheckpointDiffs ?? false;
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
  const checkpoints = mapCheckpoints(session, backendResult.checkpoints);

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
      ...(includeCheckpointDiffs ? { includeCheckpointDiffs: true } : {}),
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
    if (includeCheckpointDiffs) {
      result.checkpointDiffs = buildEvolutionCheckpointDiffs(checkpoints);
    }
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

export function resumeEvolutionSessionFromCheckpoint(
  checkpoint: EvolutionCheckpoint,
  options: ResumeEvolutionOptions = {},
): EvolutionSession {
  validateCheckpointCompatibility(checkpoint);
  const session = createEvolutionSession({
    seed: checkpoint.metadata.seed,
    ruleset: checkpoint.metadata.rulesetProfile,
    canonicalSnapshot: checkpoint.snapshot,
    ...(options.checkpointInterval != null ? { checkpointInterval: options.checkpointInterval } : {}),
    ...(options.includeDeltas != null ? { includeDeltas: options.includeDeltas } : {}),
    ...(options.label != null ? { label: options.label } : {}),
  });

  session.state.totalSteps = checkpoint.step;
  session.state.currentSnapshot = cloneSnapshot(checkpoint.snapshot);
  session.state.checkpoints = [cloneCheckpoint(checkpoint)];
  session.state.timeline = [];
  session.state.lastMetrics = computeStaticMetrics(checkpoint.snapshot);
  return session;
}

export function createEvolutionBranch(input: CreateEvolutionBranchInput): EvolutionBranch {
  const baseStep = Math.max(0, Math.floor(input.baseStep ?? input.metadata.createdAtStep ?? 0));
  const rulesetProfile = input.metadata.rulesetProfile
    ? cloneRuleset(input.metadata.rulesetProfile)
    : resolveWorldEvolutionProfile(input.metadata.rulesetId ?? "full_world_evolution");
  const canonicalBaseSnapshot = createWorldEvolutionSnapshot({
    ...input.baseSnapshot,
    worldSeed: input.metadata.seed,
  });

  return {
    branchId: buildBranchId(input.metadata.seed, canonicalBaseSnapshot.tick, rulesetProfile.id, baseStep),
    schemaVersion: WORLD_EVOLUTION_ORCHESTRATION_SCHEMA_VERSION,
    baseSnapshotRef: {
      snapshot: cloneSnapshot(canonicalBaseSnapshot),
      step: baseStep,
      tick: canonicalBaseSnapshot.tick,
      snapshotHash: computeSnapshotHash(canonicalBaseSnapshot),
    },
    derivedState: {
      totalSteps: 0,
      currentSnapshot: cloneSnapshot(canonicalBaseSnapshot),
      timeline: [],
      lastMetrics: computeStaticMetrics(canonicalBaseSnapshot),
    },
    branchMetadata: {
      name: input.metadata.name,
      ...(input.metadata.description != null ? { description: input.metadata.description } : {}),
      seed: input.metadata.seed,
      rulesetProfile,
      createdAtStep: baseStep,
      ...(input.metadata.parentBranchId != null ? { parentBranchId: input.metadata.parentBranchId } : {}),
    },
  };
}

export function forkEvolutionBranch(branch: EvolutionBranch, input: ForkEvolutionBranchInput): EvolutionBranch {
  return createEvolutionBranch({
    baseSnapshot: branch.derivedState.currentSnapshot,
    baseStep: branch.baseSnapshotRef.step + branch.derivedState.totalSteps,
    metadata: {
      name: input.metadata.name,
      ...(input.metadata.description != null ? { description: input.metadata.description } : {}),
      seed: input.metadata.seed ?? branch.branchMetadata.seed,
      ...(input.metadata.rulesetProfile != null ? { rulesetProfile: input.metadata.rulesetProfile } : {}),
      ...(input.metadata.rulesetId != null ? { rulesetId: input.metadata.rulesetId } : {}),
      createdAtStep: branch.baseSnapshotRef.step + branch.derivedState.totalSteps,
      parentBranchId: branch.branchId,
    },
  });
}

export function runEvolutionOnBranch(branch: EvolutionBranch, request: EvolutionRequest): EvolutionRunResult {
  const runResult = runEvolutionFromSnapshot({
    snapshot: branch.derivedState.currentSnapshot,
    ruleset: branch.branchMetadata.rulesetProfile,
    request,
  });
  branch.derivedState.totalSteps += runResult.request.steps;
  branch.derivedState.currentSnapshot = cloneSnapshot(runResult.finalSnapshot);
  branch.derivedState.timeline.push(...runResult.timeline);
  branch.derivedState.lastMetrics = { ...runResult.metrics };
  return runResult;
}

export function diffBranchAgainstBase(branch: EvolutionBranch): EvolutionBranchDiff {
  const diff = diffSnapshots(
    branch.baseSnapshotRef.snapshot,
    branch.derivedState.currentSnapshot,
    branch.baseSnapshotRef.step,
    branch.baseSnapshotRef.tick,
    branch.baseSnapshotRef.snapshotHash,
    branch.baseSnapshotRef.step + branch.derivedState.totalSteps,
  );

  return {
    branchId: branch.branchId,
    baseSnapshotRef: {
      step: branch.baseSnapshotRef.step,
      tick: branch.baseSnapshotRef.tick,
      snapshotHash: branch.baseSnapshotRef.snapshotHash,
    },
    branchStep: diff.toStep,
    branchTick: diff.toTick,
    branchSnapshotHash: diff.toSnapshotHash,
    worldChanges: diff.worldChanges,
    polityDeltas: diff.polityDeltas,
  };
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
        metadata: {
          ...checkpoint.metadata,
          rulesetProfile: cloneRuleset(checkpoint.metadata.rulesetProfile),
        },
      })),
      checkpointDiffs: result.checkpointDiffs?.map(cloneCheckpointDiff),
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
      ...(payload.request.includeCheckpointDiffs != null ? { includeCheckpointDiffs: payload.request.includeCheckpointDiffs } : {}),
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
      metadata: {
        ...checkpoint.metadata,
        rulesetProfile: cloneRuleset(checkpoint.metadata.rulesetProfile),
      },
    }));
  }
  if (payload.checkpointDiffs) {
    result.checkpointDiffs = payload.checkpointDiffs.map(cloneCheckpointDiff);
  }
  if (payload.deltas) {
    result.deltas = payload.deltas.map(cloneDelta);
  }
  return result;
}

export function serializeEvolutionCheckpoint(checkpoint: EvolutionCheckpoint): string {
  const payload: SerializedEvolutionCheckpoint = {
    schemaVersion: WORLD_EVOLUTION_CHECKPOINT_SCHEMA_VERSION,
    checkpoint: cloneCheckpoint(checkpoint),
  };
  return JSON.stringify(payload);
}

export function deserializeEvolutionCheckpoint(json: string): EvolutionCheckpoint {
  const parsed = JSON.parse(json) as { schemaVersion?: string; checkpoint?: EvolutionCheckpoint };
  if (parsed.schemaVersion !== WORLD_EVOLUTION_CHECKPOINT_SCHEMA_VERSION || parsed.checkpoint == null) {
    throw new Error("Invalid evolution checkpoint payload: unsupported schema version or missing checkpoint");
  }
  const checkpoint = cloneCheckpoint(parsed.checkpoint);
  validateCheckpointCompatibility(checkpoint);
  return checkpoint;
}

export function serializeEvolutionIntermediateState(session: EvolutionSession): string {
  return serializeEvolutionCheckpoint(buildSessionCheckpoint(session));
}

export function serializeEvolutionFinalState(result: Pick<EvolutionRunResult, "finalSnapshot" | "sessionId" | "engineVersion" | "ruleset">): string {
  const checkpoint: EvolutionCheckpoint = {
    step: Number.MAX_SAFE_INTEGER,
    tick: result.finalSnapshot.tick,
    summary: `final-state tick=${result.finalSnapshot.tick}`,
    snapshot: cloneSnapshot(result.finalSnapshot),
    metadata: {
      engineVersion: result.engineVersion,
      seed: result.finalSnapshot.worldSeed,
      rulesetProfile: cloneRuleset(result.ruleset),
      step: Number.MAX_SAFE_INTEGER,
      schemaVersion: WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
    },
  };
  return serializeEvolutionCheckpoint(checkpoint);
}

export function buildEvolutionCheckpointDiffs(checkpoints: readonly EvolutionCheckpoint[]): EvolutionCheckpointDiff[] {
  if (checkpoints.length < 2) return [];
  const diffs: EvolutionCheckpointDiff[] = [];
  for (let i = 1; i < checkpoints.length; i += 1) {
    const prev = checkpoints[i - 1];
    const next = checkpoints[i];
    if (!prev || !next) continue;
    diffs.push(diffEvolutionSnapshots(prev, next));
  }
  return diffs;
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

function mapCheckpoints(session: EvolutionSession, checkpoints?: WorldEvolutionCheckpoint[]): EvolutionCheckpoint[] {
  if (!checkpoints || checkpoints.length === 0) return [];
  return checkpoints.map((checkpoint) => ({
    step: checkpoint.step,
    tick: checkpoint.tick,
    summary: `checkpoint step=${checkpoint.step} tick=${checkpoint.tick}`,
    snapshot: cloneSnapshot(checkpoint.snapshot),
    metadata: {
      engineVersion: session.engineVersion,
      seed: session.seed,
      rulesetProfile: cloneRuleset(session.ruleset),
      step: checkpoint.step,
      schemaVersion: WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
    },
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

function cloneCheckpoint(checkpoint: EvolutionCheckpoint): EvolutionCheckpoint {
  return {
    ...checkpoint,
    snapshot: cloneSnapshot(checkpoint.snapshot),
    metadata: {
      ...checkpoint.metadata,
      rulesetProfile: cloneRuleset(checkpoint.metadata.rulesetProfile),
    },
  };
}

function cloneCheckpointDiff(diff: EvolutionCheckpointDiff): EvolutionCheckpointDiff {
  return {
    ...diff,
    worldChanges: { ...diff.worldChanges },
    polityDeltas: diff.polityDeltas.map((entry) => ({ ...entry })),
  };
}

function runEvolutionFromSnapshot(input: {
  snapshot: WorldEvolutionSnapshot;
  ruleset: EvolutionRuleset;
  request: EvolutionRequest;
}): EvolutionRunResult {
  const steps = Math.max(0, Math.floor(input.request.steps));
  const includeDeltas = input.request.includeDeltas ?? false;
  const includeCheckpointDiffs = input.request.includeCheckpointDiffs ?? false;
  const checkpointInterval = input.request.checkpointInterval;
  const initialSnapshot = createWorldEvolutionSnapshot({
    ...input.snapshot,
    worldSeed: input.snapshot.worldSeed,
  });
  const backendResult = runWorldEvolution({
    snapshot: cloneSnapshot(initialSnapshot),
    steps,
    profile: cloneRuleset(input.ruleset),
    includeDeltas,
    ...(checkpointInterval != null ? { checkpointInterval } : {}),
  });

  const checkpoints = backendResult.checkpoints?.map((checkpoint) => ({
    step: checkpoint.step,
    tick: checkpoint.tick,
    summary: `checkpoint step=${checkpoint.step} tick=${checkpoint.tick}`,
    snapshot: cloneSnapshot(checkpoint.snapshot),
    metadata: {
      engineVersion: WORLD_EVOLUTION_ENGINE_VERSION,
      seed: initialSnapshot.worldSeed,
      rulesetProfile: cloneRuleset(input.ruleset),
      step: checkpoint.step,
      schemaVersion: WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
    },
  }));

  return {
    schemaVersion: WORLD_EVOLUTION_ORCHESTRATION_SCHEMA_VERSION,
    engineVersion: WORLD_EVOLUTION_ENGINE_VERSION,
    sessionId: buildSessionId(initialSnapshot.worldSeed, initialSnapshot.tick, input.ruleset.id),
    request: {
      steps,
      includeDeltas,
      ...(includeCheckpointDiffs ? { includeCheckpointDiffs: true } : {}),
      ...(checkpointInterval != null ? { checkpointInterval } : {}),
    },
    ruleset: cloneRuleset(input.ruleset),
    initialSnapshot,
    finalSnapshot: cloneSnapshot(backendResult.finalSnapshot),
    timeline: backendResult.timeline.map(toTimelineEvent),
    metrics: { ...backendResult.metrics },
    ...(checkpoints && checkpoints.length > 0
      ? {
        checkpoints,
        ...(includeCheckpointDiffs ? { checkpointDiffs: buildEvolutionCheckpointDiffs(checkpoints) } : {}),
      }
      : {}),
    ...(backendResult.deltas ? { deltas: backendResult.deltas.map(cloneDelta) } : {}),
  };
}

function buildSessionId(seed: number, tick: number, rulesetId: string): string {
  return `evo-${seed}-${tick}-${rulesetId}`;
}

function buildBranchId(seed: number, tick: number, rulesetId: string, createdAtStep: number): string {
  return `branch-${seed}-${tick}-${rulesetId}-${createdAtStep}`;
}

function computeSnapshotHash(snapshot: WorldEvolutionSnapshot): string {
  return hashString(JSON.stringify(snapshot)).toString(16);
}

function buildSessionCheckpoint(session: EvolutionSession): EvolutionCheckpoint {
  return {
    step: session.state.totalSteps,
    tick: session.state.currentSnapshot.tick,
    summary: `checkpoint step=${session.state.totalSteps} tick=${session.state.currentSnapshot.tick}`,
    snapshot: cloneSnapshot(session.state.currentSnapshot),
    metadata: {
      engineVersion: session.engineVersion,
      seed: session.seed,
      rulesetProfile: cloneRuleset(session.ruleset),
      step: session.state.totalSteps,
      schemaVersion: WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
    },
  };
}

function validateCheckpointCompatibility(checkpoint: EvolutionCheckpoint): void {
  if (checkpoint.metadata.schemaVersion !== WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION) {
    throw new Error(
      `Evolution checkpoint schema mismatch: checkpoint=${checkpoint.metadata.schemaVersion} runtime=${WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION}`,
    );
  }
  if (checkpoint.metadata.engineVersion !== WORLD_EVOLUTION_ENGINE_VERSION) {
    throw new Error(
      `Evolution checkpoint engine mismatch: checkpoint=${checkpoint.metadata.engineVersion} runtime=${WORLD_EVOLUTION_ENGINE_VERSION}`,
    );
  }
  if (checkpoint.snapshot.worldSeed !== checkpoint.metadata.seed) {
    throw new Error(
      `Evolution checkpoint seed mismatch: snapshot=${checkpoint.snapshot.worldSeed} metadata=${checkpoint.metadata.seed}`,
    );
  }
}

function diffEvolutionSnapshots(from: EvolutionCheckpoint, to: EvolutionCheckpoint): EvolutionCheckpointDiff {
  return diffSnapshots(
    from.snapshot,
    to.snapshot,
    from.step,
    from.tick,
    hashString(JSON.stringify(from.snapshot)).toString(16),
    to.step,
  );
}

function diffSnapshots(
  fromSnapshotInput: WorldEvolutionSnapshot,
  toSnapshotInput: WorldEvolutionSnapshot,
  fromStep: number,
  fromTick: number,
  fromSnapshotHash: string,
  toStep: number,
): EvolutionCheckpointDiff {
  const fromSnapshot = cloneSnapshot(fromSnapshotInput);
  const toSnapshot = cloneSnapshot(toSnapshotInput);
  const worldChanges: Record<string, unknown> = {};

  if (fromSnapshot.tick !== toSnapshot.tick) worldChanges.tick = toSnapshot.tick;
  if (fromSnapshot.worldSeed !== toSnapshot.worldSeed) worldChanges.worldSeed = toSnapshot.worldSeed;
  if (JSON.stringify(fromSnapshot.activeWars) !== JSON.stringify(toSnapshot.activeWars)) worldChanges.activeWars = toSnapshot.activeWars;
  if (JSON.stringify(fromSnapshot.treaties) !== JSON.stringify(toSnapshot.treaties)) worldChanges.treaties = toSnapshot.treaties;
  if (JSON.stringify(fromSnapshot.tradeRoutes) !== JSON.stringify(toSnapshot.tradeRoutes)) worldChanges.tradeRoutes = toSnapshot.tradeRoutes;
  if (JSON.stringify(fromSnapshot.governanceStates) !== JSON.stringify(toSnapshot.governanceStates)) worldChanges.governanceStates = toSnapshot.governanceStates;
  if (JSON.stringify(fromSnapshot.governanceLawRegistry) !== JSON.stringify(toSnapshot.governanceLawRegistry)) worldChanges.governanceLawRegistry = toSnapshot.governanceLawRegistry;
  if (JSON.stringify(fromSnapshot.epidemics) !== JSON.stringify(toSnapshot.epidemics)) worldChanges.epidemics = toSnapshot.epidemics;
  if (JSON.stringify(fromSnapshot.diseases) !== JSON.stringify(toSnapshot.diseases)) worldChanges.diseases = toSnapshot.diseases;
  if (JSON.stringify(fromSnapshot.climateByPolity) !== JSON.stringify(toSnapshot.climateByPolity)) worldChanges.climateByPolity = toSnapshot.climateByPolity;

  const beforeById = new Map(fromSnapshot.polities.map((polity) => [polity.id, polity]));
  const polityDeltas = toSnapshot.polities.map((polity) => {
    const prev = beforeById.get(polity.id);
    return {
      polityId: polity.id,
      populationDelta: polity.population - (prev?.population ?? 0),
      treasuryDelta_cu: polity.treasury_cu - (prev?.treasury_cu ?? 0),
      stabilityDelta_Q: polity.stabilityQ - (prev?.stabilityQ ?? 0),
      moraleDelta_Q: polity.moraleQ - (prev?.moraleQ ?? 0),
    };
  });

  return {
    fromStep,
    toStep,
    fromTick,
    toTick: toSnapshot.tick,
    fromSnapshotHash,
    toSnapshotHash: hashString(JSON.stringify(toSnapshot)).toString(16),
    worldChanges,
    polityDeltas,
  };
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
