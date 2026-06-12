import {
  buildEvolutionTimeline,
  mapOpenWorldHostToEvolutionInput,
  normalizeHostWorldInput,
  runWorldEvolution,
  toAnankeEvolutionState,
  toWorldEvolutionRunRequest,
  type EvolutionTimelineEvent,
  type HostAdapterContext,
  type OpenWorldHostInput,
  type WorldEvolutionInput,
  type WorldEvolutionRulesetId,
  type WorldEvolutionRulesetProfile,
  type WorldEvolutionRunResult,
  buildEvolutionRunReproducibilityRecord,
  type EvolutionRunReproducibilityRecord,
} from "./world-evolution-backend/public.js";
import {
  createEvolutionBranch,
  createEvolutionSession,
  resumeEvolutionSessionFromCheckpoint,
  runEvolution,
  runEvolutionOnBranch,
  type CreateEvolutionBranchInput,
  type EvolutionBranch,
  type EvolutionCheckpoint,
  type EvolutionRequest,
  type EvolutionRunResult,
  type EvolutionSession,
  type ResumeEvolutionOptions,
} from "./world-evolution.js";

/**
 * Host-facing deterministic backend wrapper: adapt + validate + run + timeline projection.
 *
 * Stability boundary:
 * - Additive API (non Tier-1) exposed only via `@.../world-evolution-host-backend`.
 * - Reuses authoritative world-evolution backend + orchestration modules without replacing them.
 */
export interface HostDeterministicRunRequest {
  input: WorldEvolutionInput | OpenWorldHostInput;
  steps: number;
  profileId?: WorldEvolutionRulesetId;
  profile?: WorldEvolutionRulesetProfile;
  includeDeltas?: boolean;
  checkpointInterval?: number;
  includeSummaryText?: boolean;
}

export interface HostDeterministicRunResult {
  normalizedInput: WorldEvolutionInput;
  adapterContext: HostAdapterContext;
  run: WorldEvolutionRunResult;
  history: EvolutionTimelineEvent[];
}

export interface HostDeterministicRunWithReplayProofResult extends HostDeterministicRunResult {
  reproducibility: EvolutionRunReproducibilityRecord;
}

export interface HostOrchestrationSessionConfig {
  input: WorldEvolutionInput | OpenWorldHostInput;
  rulesetId?: WorldEvolutionRulesetId;
  ruleset?: WorldEvolutionRulesetProfile;
  checkpointInterval?: number;
  includeDeltas?: boolean;
  label?: string;
}

export interface HostOrchestrationRunRequest extends EvolutionRequest {}

export interface HostOrchestrationRunResult {
  session: EvolutionSession;
  result: EvolutionRunResult;
}

export function runHostDeterministicEvolution(request: HostDeterministicRunRequest): HostDeterministicRunResult {
  const hostInput = normalizeHostBackendInput(request.input);
  const normalizedInput = normalizeHostWorldInput({
    ...hostInput,
    ...(request.profileId != null ? { profileId: request.profileId } : {}),
  });

  const adapterState = toAnankeEvolutionState(normalizedInput);
  const runRequest = toWorldEvolutionRunRequest(normalizedInput, request.steps, {
    ...(request.profileId != null ? { profileId: request.profileId } : {}),
    ...(request.profile != null ? { profile: request.profile } : {}),
    ...(request.includeDeltas != null ? { includeDeltas: request.includeDeltas } : {}),
    ...(request.checkpointInterval != null ? { checkpointInterval: request.checkpointInterval } : {}),
  });

  const run = runWorldEvolution(runRequest);
  const history = buildEvolutionTimeline(run, {
    ...(request.includeSummaryText != null ? { includeSummaryText: request.includeSummaryText } : {}),
  });

  return {
    normalizedInput,
    adapterContext: adapterState.context,
    run,
    history,
  };
}

export function createHostEvolutionSession(config: HostOrchestrationSessionConfig): EvolutionSession {
  const hostInput = normalizeHostBackendInput(config.input);
  const normalizedInput = normalizeHostWorldInput({
    ...hostInput,
    ...(config.rulesetId != null ? { profileId: config.rulesetId } : {}),
  });
  const runRequest = toWorldEvolutionRunRequest(normalizedInput, 0, {
    ...(config.rulesetId != null ? { profileId: config.rulesetId } : {}),
    ...(config.ruleset != null ? { profile: config.ruleset } : {}),
    ...(config.checkpointInterval != null ? { checkpointInterval: config.checkpointInterval } : {}),
    ...(config.includeDeltas != null ? { includeDeltas: config.includeDeltas } : {}),
  });

  return createEvolutionSession({
    seed: runRequest.snapshot.worldSeed,
    canonicalSnapshot: runRequest.snapshot,
    ...(config.rulesetId != null ? { rulesetId: config.rulesetId } : {}),
    ...(config.ruleset != null ? { ruleset: config.ruleset } : {}),
    ...(config.checkpointInterval != null ? { checkpointInterval: config.checkpointInterval } : {}),
    ...(config.includeDeltas != null ? { includeDeltas: config.includeDeltas } : {}),
    ...(config.label != null ? { label: config.label } : {}),
  });
}

export function runHostEvolutionSession(
  session: EvolutionSession,
  request: HostOrchestrationRunRequest,
): HostOrchestrationRunResult {
  return {
    session,
    result: runEvolution(session, request),
  };
}

export function resumeHostEvolutionSessionFromCheckpoint(
  checkpoint: EvolutionCheckpoint,
  request: HostOrchestrationRunRequest,
  options: ResumeEvolutionOptions = {},
): HostOrchestrationRunResult {
  const resumedSession = resumeEvolutionSessionFromCheckpoint(checkpoint, options);
  return {
    session: resumedSession,
    result: runEvolution(resumedSession, request),
  };
}

export function createHostEvolutionBranch(
  config: HostOrchestrationSessionConfig & {
    metadata: CreateEvolutionBranchInput["metadata"];
    baseStep?: number;
  },
): EvolutionBranch {
  const session = createHostEvolutionSession(config);
  return createEvolutionBranch({
    baseSnapshot: session.canonicalInitialSnapshot,
    metadata: {
      ...config.metadata,
      rulesetProfile: config.metadata.rulesetProfile ?? session.ruleset,
    },
    ...(config.baseStep != null ? { baseStep: config.baseStep } : {}),
  });
}

export function runHostEvolutionBranch(branch: EvolutionBranch, request: HostOrchestrationRunRequest): EvolutionRunResult {
  return runEvolutionOnBranch(branch, request);
}

function normalizeHostBackendInput(input: WorldEvolutionInput | OpenWorldHostInput): WorldEvolutionInput {
  if (isOpenWorldHostInput(input)) {
    return mapOpenWorldHostToEvolutionInput(input).input;
  }
  return input;
}

function isOpenWorldHostInput(input: WorldEvolutionInput | OpenWorldHostInput): input is OpenWorldHostInput {
  const candidate = input as Partial<OpenWorldHostInput>;
  return Array.isArray(candidate.regions) && Array.isArray(candidate.settlements) && Array.isArray(candidate.factions);
}


export function runHostDeterministicEvolutionWithReplayProof(
  request: HostDeterministicRunRequest,
): HostDeterministicRunWithReplayProofResult {
  const result = runHostDeterministicEvolution(request);
  return {
    ...result,
    reproducibility: buildEvolutionRunReproducibilityRecord(
      toWorldEvolutionRunRequest(result.normalizedInput, request.steps, {
        ...(request.profileId != null ? { profileId: request.profileId } : {}),
        ...(request.profile != null ? { profile: request.profile } : {}),
        ...(request.includeDeltas != null ? { includeDeltas: request.includeDeltas } : {}),
        ...(request.checkpointInterval != null ? { checkpointInterval: request.checkpointInterval } : {}),
      }),
      result.run,
    ),
  };
}
