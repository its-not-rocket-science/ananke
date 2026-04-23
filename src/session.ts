import { ANANKE_ENGINE_VERSION } from "./version.js";
import { createWorld, type EntitySpec } from "./world-factory.js";
import { loadScenario, validateScenario } from "./scenario.js";
import { stepWorld } from "./sim/kernel.js";
import type { Command, CommandMap } from "./sim/commands.js";
import type { KernelContext } from "./sim/context.js";
import type { WorldState } from "./sim/world.js";
import { q } from "./units.js";
import {
  createEvolutionBranch,
  createEvolutionSession,
  deserializeEvolutionCheckpoint,
  forkEvolutionBranch,
  getEvolutionSummary,
  resumeEvolutionSessionFromCheckpoint,
  runEvolution,
  serializeEvolutionIntermediateState,
  stepEvolution,
  type EvolutionRequest,
  type EvolutionRuleset,
  type EvolutionSession,
} from "./world-evolution.js";
import {
  type WorldEvolutionRulesetId,
  type WorldEvolutionSnapshot,
} from "./world-evolution-backend/index.js";
import {
  getPackScenario,
  instantiatePackScenario,
  loadPack,
  validatePack,
  type AnankePackManifest,
  type LoadPackResult,
  type PackValidationError,
} from "./content-pack.js";
import { deserializeReplay, serializeReplay, type Replay, type ReplayFrame } from "./replay.js";

/** Tier 2 / experimental host session mode. */
export type SessionMode = "tactical" | "world_evolution";

const SESSION_SCHEMA_VERSION = "ananke.session.v1" as const;

export interface TacticalSessionConfig {
  mode: "tactical";
  /** Explicit tactical world snapshot. */
  worldState?: WorldState;
  /** Scenario JSON loaded via validateScenario + loadScenario. */
  scenarioJson?: unknown;
  /** Optional convenience bootstrap via createWorld(seed, entities). */
  worldSeed?: number;
  entities?: EntitySpec[];
  /** Enable in-session replay recording. */
  enableReplay?: boolean;
  id?: string;
}

export interface WorldEvolutionSessionConfig {
  mode: "world_evolution";
  canonicalSnapshot: WorldEvolutionSnapshot;
  rulesetId?: WorldEvolutionRulesetId;
  ruleset?: EvolutionRuleset;
  checkpointInterval?: number;
  includeDeltas?: boolean;
  label?: string;
  id?: string;
}

export type SessionConfig = TacticalSessionConfig | WorldEvolutionSessionConfig;

interface TacticalSessionState {
  world: WorldState;
  replay?: MutableReplay;
}

interface WorldEvolutionSessionState {
  evolution: EvolutionSession;
}

interface MutableReplay {
  initialState: WorldState;
  frames: ReplayFrame[];
}

export type SessionHandle =
  | {
    mode: "tactical";
    id: string;
    createdAt: number;
    state: TacticalSessionState;
  }
  | {
    mode: "world_evolution";
    id: string;
    createdAt: number;
    state: WorldEvolutionSessionState;
  };

export interface RunSessionRequest {
  /**
   * Number of simulation steps to run. Defaults to 1 when omitted.
   */
  steps?: number;
  /** Tactical command frames, one frame per requested step. */
  tacticalCommandFrames?: ReadonlyArray<ReadonlyArray<readonly [entityId: number, cmds: ReadonlyArray<Command>]>>;
  /** Alias for tacticalCommandFrames. Prefer this for new host integrations. */
  commandFrames?: ReadonlyArray<ReadonlyArray<readonly [entityId: number, cmds: ReadonlyArray<Command>]>>;
  tacticalContext?: KernelContext;
  /** Alias for tacticalContext. Prefer this for new host integrations. */
  context?: KernelContext;
  evolution?: Omit<EvolutionRequest, "steps">;
  /** Alias for evolution. Prefer this for new host integrations. */
  worldEvolution?: Omit<EvolutionRequest, "steps">;
}

export interface RunSessionResult {
  mode: SessionMode;
  executedSteps: number;
  summary: SessionSummary;
}

export type SessionSummary =
  | {
    mode: "tactical";
    id: string;
    tick: number;
    entityCount: number;
    hasReplay: boolean;
  }
  | {
    mode: "world_evolution";
    id: string;
    summary: ReturnType<typeof getEvolutionSummary>;
  };

export interface ForkSessionRequest {
  id?: string;
  label?: string;
  rulesetId?: WorldEvolutionRulesetId;
  ruleset?: EvolutionRuleset;
  seed?: number;
}

export interface LoadSessionPackResult {
  pack: LoadPackResult;
  validationErrors: PackValidationError[];
  scenarioJson?: unknown;
  worldState?: WorldState;
}

export interface LoadSessionPackRequest {
  manifest: AnankePackManifest;
  scenarioId?: string;
  instantiateScenario?: boolean;
}

interface SessionSerializationEnvelope {
  schemaVersion: typeof SESSION_SCHEMA_VERSION;
  engineVersion: string;
  mode: SessionMode;
  payload: TacticalSerializedPayload | WorldEvolutionSerializedPayload;
}

interface TacticalSerializedPayload {
  id: string;
  createdAt: number;
  worldReplayJson: string;
  replayJson?: string;
}

interface WorldEvolutionSerializedPayload {
  id: string;
  createdAt: number;
  checkpointJson: string;
}

export function createSession(config: SessionConfig): SessionHandle {
  if (config.mode === "tactical") {
    const world = createTacticalWorld(config);
    const replay = config.enableReplay
      ? ({ initialState: structuredClone(world), frames: [] } satisfies MutableReplay)
      : undefined;

    return {
      mode: "tactical",
      id: config.id ?? `session-tactical-${world.seed}-${world.tick}`,
      createdAt: world.tick,
      state: replay ? { world, replay } : { world },
    };
  }

  const evolution = createEvolutionSession({
    seed: config.canonicalSnapshot.worldSeed,
    canonicalSnapshot: config.canonicalSnapshot,
    ...(config.ruleset != null ? { ruleset: config.ruleset } : {}),
    ...(config.rulesetId != null ? { rulesetId: config.rulesetId } : {}),
    ...(config.checkpointInterval != null ? { checkpointInterval: config.checkpointInterval } : {}),
    ...(config.includeDeltas != null ? { includeDeltas: config.includeDeltas } : {}),
    ...(config.label != null ? { label: config.label } : {}),
  });

  return {
    mode: "world_evolution",
    id: config.id ?? evolution.sessionId,
    createdAt: config.canonicalSnapshot.tick,
    state: { evolution },
  };
}

export function runSession(session: SessionHandle, request: RunSessionRequest): RunSessionResult {
  const requestedSteps = Math.max(0, Math.floor(request.steps ?? 1));
  const commandFrames = request.commandFrames ?? request.tacticalCommandFrames;
  const tacticalContext = request.context ?? request.tacticalContext;
  const evolutionRequest = request.worldEvolution ?? request.evolution;

  if (session.mode === "tactical") {
    for (let i = 0; i < requestedSteps; i += 1) {
      const frame = commandFrames?.[i] ?? [];
      if (session.state.replay) {
        session.state.replay.frames.push({
          tick: session.state.world.tick,
          commands: frame.map(([entityId, cmds]) => [entityId, [...cmds]] as const),
        });
      }
      stepWorld(session.state.world, toCommandMap(frame), tacticalContext ?? { tractionCoeff: q(0.85) });
    }

    return { mode: "tactical", executedSteps: requestedSteps, summary: getSessionSummary(session) };
  }

  runEvolution(session.state.evolution, {
    steps: requestedSteps,
    ...(evolutionRequest?.checkpointInterval != null ? { checkpointInterval: evolutionRequest.checkpointInterval } : {}),
    ...(evolutionRequest?.includeDeltas != null ? { includeDeltas: evolutionRequest.includeDeltas } : {}),
    ...(evolutionRequest?.includeCheckpointDiffs != null ? { includeCheckpointDiffs: evolutionRequest.includeCheckpointDiffs } : {}),
  });

  return { mode: "world_evolution", executedSteps: requestedSteps, summary: getSessionSummary(session) };
}

export function stepSession(session: SessionHandle, request: Omit<RunSessionRequest, "steps"> = {}): RunSessionResult {
  const evolutionRequest = request.worldEvolution ?? request.evolution;
  if (session.mode === "world_evolution") {
    stepEvolution(session.state.evolution, evolutionRequest ?? {});
    return { mode: "world_evolution", executedSteps: 1, summary: getSessionSummary(session) };
  }

  return runSession(session, { ...request, steps: 1 });
}

export function getSessionSummary(session: SessionHandle): SessionSummary {
  if (session.mode === "tactical") {
    return {
      mode: "tactical",
      id: session.id,
      tick: session.state.world.tick,
      entityCount: session.state.world.entities.length,
      hasReplay: session.state.replay != null,
    };
  }

  return { mode: "world_evolution", id: session.id, summary: getEvolutionSummary(session.state.evolution) };
}

export function forkSession(session: SessionHandle, request: ForkSessionRequest = {}): SessionHandle {
  if (session.mode === "tactical") {
    return {
      mode: "tactical",
      id: request.id ?? `${session.id}-fork-${session.state.world.tick}`,
      createdAt: session.state.world.tick,
      state: session.state.replay
        ? {
          world: structuredClone(session.state.world),
          replay: structuredClone(session.state.replay),
        }
        : {
          world: structuredClone(session.state.world),
        },
    };
  }

  const baseBranch = createEvolutionBranch({
    baseSnapshot: session.state.evolution.state.currentSnapshot,
    baseStep: session.state.evolution.state.totalSteps,
    metadata: {
      name: `${session.id}-base`,
      seed: session.state.evolution.seed,
      rulesetProfile: session.state.evolution.ruleset,
      createdAtStep: session.state.evolution.state.totalSteps,
    },
  });

  const branch = forkEvolutionBranch(baseBranch, {
    metadata: {
      name: request.label ?? `${session.id}-fork`,
      ...(request.seed != null ? { seed: request.seed } : {}),
      ...(request.ruleset != null ? { rulesetProfile: request.ruleset } : {}),
      ...(request.rulesetId != null ? { rulesetId: request.rulesetId } : {}),
    },
  });

  const evolution = createEvolutionSession({
    seed: branch.branchMetadata.seed,
    canonicalSnapshot: branch.derivedState.currentSnapshot,
    ruleset: branch.branchMetadata.rulesetProfile,
    ...(request.label != null ? { label: request.label } : {}),
  });

  return {
    mode: "world_evolution",
    id: request.id ?? `${session.id}-fork-${session.state.evolution.state.totalSteps}`,
    createdAt: evolution.state.currentSnapshot.tick,
    state: { evolution },
  };
}

export function loadSessionPack(input: LoadSessionPackRequest | AnankePackManifest): LoadSessionPackResult {
  const request = isPackManifest(input) ? { manifest: input } : input;
  const validationErrors = validatePack(request.manifest);
  const pack = loadPack(request.manifest);

  const out: LoadSessionPackResult = { pack, validationErrors };
  if (request.scenarioId) {
    out.scenarioJson = getPackScenario(pack.packId, request.scenarioId);
    if (request.instantiateScenario && out.scenarioJson != null) {
      out.worldState = instantiatePackScenario(pack.packId, request.scenarioId);
    }
  }
  return out;
}

export function serializeSession(session: SessionHandle): string {
  const envelope: SessionSerializationEnvelope = session.mode === "tactical"
    ? {
      schemaVersion: SESSION_SCHEMA_VERSION,
      engineVersion: ANANKE_ENGINE_VERSION,
      mode: "tactical",
      payload: {
        id: session.id,
        createdAt: session.createdAt,
        worldReplayJson: serializeReplay({ initialState: session.state.world, frames: [] }),
        ...(session.state.replay ? { replayJson: serializeReplay(session.state.replay as Replay) } : {}),
      },
    }
    : {
      schemaVersion: SESSION_SCHEMA_VERSION,
      engineVersion: ANANKE_ENGINE_VERSION,
      mode: "world_evolution",
      payload: {
        id: session.id,
        createdAt: session.createdAt,
        checkpointJson: serializeEvolutionIntermediateState(session.state.evolution),
      },
    };

  return JSON.stringify(envelope);
}

export function deserializeSession(json: string): SessionHandle {
  const envelope = JSON.parse(json) as SessionSerializationEnvelope;
  if (envelope.schemaVersion !== SESSION_SCHEMA_VERSION) {
    throw new Error(`deserializeSession: unsupported schemaVersion '${String((envelope as { schemaVersion?: unknown }).schemaVersion)}'`);
  }

  if (envelope.mode === "tactical") {
    const payload = envelope.payload as TacticalSerializedPayload;
    const worldReplay = deserializeReplay(payload.worldReplayJson);
    const replay = payload.replayJson ? deserializeReplay(payload.replayJson) : undefined;
    return {
      mode: "tactical",
      id: payload.id,
      createdAt: payload.createdAt,
      state: replay
        ? {
          world: worldReplay.initialState,
          replay: {
            initialState: structuredClone(replay.initialState),
            frames: replay.frames.map((frame) => ({
              tick: frame.tick,
              commands: frame.commands.map(([entityId, cmds]) => [entityId, [...cmds]] as const),
            })),
          },
        }
        : {
          world: worldReplay.initialState,
        },
    };
  }

  const payload = envelope.payload as WorldEvolutionSerializedPayload;
  const evolution = resumeEvolutionSessionFromCheckpoint(deserializeEvolutionCheckpoint(payload.checkpointJson));
  return {
    mode: "world_evolution",
    id: payload.id,
    createdAt: payload.createdAt,
    state: { evolution },
  };
}

function createTacticalWorld(config: TacticalSessionConfig): WorldState {
  if (config.worldState != null) return structuredClone(config.worldState);

  if (config.scenarioJson != null) {
    const validation = validateScenario(config.scenarioJson);
    if (validation.length > 0) {
      throw new Error(`createSession(tactical): invalid scenario JSON:\n${validation.map((e) => `- ${e}`).join("\n")}`);
    }
    return loadScenario(config.scenarioJson);
  }

  if (config.worldSeed != null && config.entities != null) {
    return createWorld(config.worldSeed, config.entities);
  }

  throw new Error("createSession(tactical): provide worldState, scenarioJson, or worldSeed+entities");
}

function toCommandMap(frame: ReadonlyArray<readonly [entityId: number, cmds: ReadonlyArray<Command>]>): CommandMap {
  return new Map(frame.map(([entityId, cmds]) => [entityId, [...cmds]]));
}

function isPackManifest(input: LoadSessionPackRequest | AnankePackManifest): input is AnankePackManifest {
  return !("manifest" in input);
}
