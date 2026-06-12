import * as fs from "node:fs";
import * as path from "node:path";
import {
  SCALE,
  ReplayRecorder,
  deserializeReplay,
  extractRigSnapshots,
  loadScenario,
  q,
  replayTo,
  serializeReplay,
  stepWorld,
  type AnankeScenario,
  type Command,
  type CommandMap,
  type KernelContext,
  type WorldState,
} from "../../../src/index.js";

export interface ReferenceHostSession {
  scenario: AnankeScenario;
  world: WorldState;
  recorder: ReplayRecorder;
  events: string[];
}

export interface InspectionRow {
  id: number;
  teamId: number;
  x: number;
  y: number;
  consciousnessPct: number;
  dead: boolean;
}

export interface BridgeSnapshotSummary {
  tick: number;
  entityCount: number;
  firstEntity: {
    id: number;
    pos: { x: number; y: number; z: number };
    hints: string[];
  } | null;
}

export interface HostSnapshot {
  tick: number;
  maxTicks: number;
  entities: InspectionRow[];
  events: string[];
  replayFrames: number;
  bridge: BridgeSnapshotSummary;
}

export interface SavedHostSession {
  scenario: AnankeScenario;
  replay: string;
  events: string[];
}

export const DEFAULT_SCENARIO_PATH = new URL("./scenario.json", import.meta.url);
export const FALLBACK_SCENARIO_PATH = new URL("../../../../examples/reference/host-coherence/scenario.json", import.meta.url);
const DEFAULT_CTX: KernelContext = { tractionCoeff: q(0.9) };

const percent = (qValue: number): number => Math.round((qValue / SCALE.Q) * 100);

function selectCommands(world: WorldState): CommandMap {
  const commands: CommandMap = new Map();

  for (const entity of world.entities) {
    if (entity.injury.dead || entity.injury.consciousness <= 0) continue;
    const target = world.entities.find(other => other.teamId !== entity.teamId && !other.injury.dead && other.injury.consciousness > 0);
    if (!target) continue;

    const dx = target.position_m.x - entity.position_m.x;
    const dy = target.position_m.y - entity.position_m.y;
    const move: Command = {
      kind: "move",
      dir: { x: Math.sign(dx) || 1, y: Math.sign(dy), z: 0 },
      intensity: q(1),
      mode: "run",
    };
    const attack: Command = {
      kind: "attackNearest",
      intensity: q(1),
      mode: "strike",
    };
    commands.set(entity.id, [move, attack]);
  }

  return commands;
}

function listAliveTeams(world: WorldState): number[] {
  return [...new Set(world.entities.filter(e => !e.injury.dead && e.injury.consciousness > 0).map(e => e.teamId))].sort((a, b) => a - b);
}

function buildBridgeSummary(world: WorldState): BridgeSnapshotSummary {
  const snapshots = extractRigSnapshots(world);
  const first = snapshots[0];
  if (!first) {
    return { tick: world.tick, entityCount: 0, firstEntity: null };
  }

  return {
    tick: world.tick,
    entityCount: snapshots.length,
    firstEntity: {
      id: first.entityId,
      pos: { x: 0, y: Number(first.mass.cogOffset_m.y.toFixed(3)), z: 0 },
      hints: [
        first.animation.dead ? "dead" : "alive",
        first.animation.unconscious ? "unconscious" : "conscious",
        first.animation.prone ? "prone" : "upright",
      ],
    },
  };
}

export function inspect(session: ReferenceHostSession): HostSnapshot {
  return {
    tick: session.world.tick,
    maxTicks: session.scenario.maxTicks,
    entities: session.world.entities
      .map(entity => ({
        id: entity.id,
        teamId: entity.teamId,
        x: Number((entity.position_m.x / SCALE.m).toFixed(2)),
        y: Number((entity.position_m.y / SCALE.m).toFixed(2)),
        consciousnessPct: percent(entity.injury.consciousness),
        dead: entity.injury.dead,
      }))
      .sort((a, b) => a.id - b.id),
    events: session.events.slice(-14),
    replayFrames: session.recorder.toReplay().frames.length,
    bridge: buildBridgeSummary(session.world),
  };
}

function createSession(scenario: AnankeScenario): ReferenceHostSession {
  const world = loadScenario(scenario);
  const recorder = new ReplayRecorder(world);
  return {
    scenario,
    world,
    recorder,
    events: [`Scenario ${scenario.id} loaded at tick 0.`],
  };
}

export function loadScenarioFromPath(scenarioPath = DEFAULT_SCENARIO_PATH): ReferenceHostSession {
  const resolvedPath = fs.existsSync(scenarioPath) ? scenarioPath : FALLBACK_SCENARIO_PATH;
  const raw = fs.readFileSync(resolvedPath, "utf8");
  return createSession(JSON.parse(raw) as AnankeScenario);
}

export function stepOnce(session: ReferenceHostSession): HostSnapshot {
  const aliveTeams = listAliveTeams(session.world);
  if (session.world.tick >= session.scenario.maxTicks || aliveTeams.length <= 1) {
    session.events.push("No step executed: scenario reached terminal state.");
    return inspect(session);
  }

  const commands = selectCommands(session.world);
  session.recorder.record(session.world.tick, commands);
  stepWorld(session.world, commands, { ...DEFAULT_CTX, tractionCoeff: q(session.scenario.tractionCoeff ?? 0.9) });

  const afterTeams = listAliveTeams(session.world);
  if (afterTeams.length <= 1) {
    session.events.push(`Terminal state reached at tick ${session.world.tick}: team ${afterTeams[0] ?? "none"} survives.`);
  } else {
    session.events.push(`Stepped to tick ${session.world.tick} with ${commands.size} actor command sets.`);
  }

  return inspect(session);
}

export function runUntilTerminal(session: ReferenceHostSession, maxSteps = 120): HostSnapshot {
  for (let i = 0; i < maxSteps; i += 1) {
    const beforeTick = session.world.tick;
    stepOnce(session);
    if (session.world.tick === beforeTick) break;
    if (session.world.tick >= session.scenario.maxTicks || listAliveTeams(session.world).length <= 1) break;
  }
  return inspect(session);
}

export function exportReplayJson(session: ReferenceHostSession): string {
  return serializeReplay(session.recorder.toReplay());
}

export function saveSession(session: ReferenceHostSession): string {
  const payload: SavedHostSession = {
    scenario: session.scenario,
    replay: exportReplayJson(session),
    events: session.events,
  };
  return JSON.stringify(payload, null, 2);
}

export function loadSession(serialized: string): ReferenceHostSession {
  const payload = JSON.parse(serialized) as SavedHostSession;
  const replay = deserializeReplay(payload.replay);
  const world = replayTo(replay, Number.MAX_SAFE_INTEGER, { tractionCoeff: q(payload.scenario.tractionCoeff ?? 0.9) });

  return {
    scenario: payload.scenario,
    world,
    recorder: new ReplayRecorder(world),
    events: [...payload.events, `Session loaded at tick ${world.tick}.`],
  };
}

export function summarizeCli(session: ReferenceHostSession): string {
  const snapshot = inspect(session);
  const lines: string[] = [];
  lines.push("Ananke reference host coherence app");
  lines.push(`Scenario: ${session.scenario.id}`);
  lines.push(`Tick: ${snapshot.tick}/${snapshot.maxTicks}`);
  lines.push(`Replay frames: ${snapshot.replayFrames}`);
  lines.push(`Bridge extraction entities: ${snapshot.bridge.entityCount}`);
  for (const row of snapshot.entities) {
    lines.push(`- E${row.id} T${row.teamId} pos(${row.x},${row.y}) consciousness=${row.consciousnessPct}% dead=${row.dead}`);
  }
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const session = loadScenarioFromPath();
  runUntilTerminal(session, 120);
  const replayPath = path.join(path.dirname(new URL(import.meta.url).pathname), "replay-latest.json");
  fs.writeFileSync(replayPath, exportReplayJson(session), "utf8");
  console.log(summarizeCli(session));
  console.log(`Replay saved to ${replayPath}`);
}
