import * as fs from "node:fs";
import * as path from "node:path";
import {
  createWorld,
  deserializeReplay,
  q,
  ReplayRecorder,
  replayTo,
  serializeReplay,
  stepWorld,
  type Command,
  type CommandMap,
  type KernelContext,
  type WorldState,
} from "../../../src/index.js";
import { loadPack } from "../../../src/content-pack.js";

const TACTICS_PACK_PATH = new URL("./tactics-pack.json", import.meta.url);
const TACTICS_PACK_FALLBACK_PATH = new URL("../../../../examples/games/tactics-duel/tactics-pack.json", import.meta.url);

export type TeamId = 1 | 2;

export interface TacticalUnit {
  id: number;
  teamId: TeamId;
  role: "Knight" | "Archer" | "Mage";
  gridX: number;
  gridY: number;
}

export interface TacticalState {
  seed: number;
  world: WorldState;
  activeTeam: TeamId;
  turn: number;
  units: TacticalUnit[];
  recorder: ReplayRecorder;
}

const CTX: KernelContext = { tractionCoeff: q(0.9) };

let didLoadPack = false;

function ensurePackLoaded(): void {
  if (didLoadPack) return;
  const packPath = fs.existsSync(TACTICS_PACK_PATH) ? TACTICS_PACK_PATH : TACTICS_PACK_FALLBACK_PATH;
  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  const result = loadPack(pack);
  if (result.errors.length > 0) {
    throw new Error(`Failed to load tactics content pack: ${result.errors[0]?.message ?? "unknown"}`);
  }
  didLoadPack = true;
}

function encodePosition(gridX: number, gridY: number): { x_m: number; y_m: number } {
  return { x_m: (gridX - 2) * 0.6, y_m: (gridY - 2) * 0.6 };
}

export function newTacticsDuel(seed = 1337): TacticalState {
  ensurePackLoaded();

  const units: TacticalUnit[] = [
    { id: 1, teamId: 1, role: "Knight", gridX: 0, gridY: 2 },
    { id: 2, teamId: 1, role: "Archer", gridX: 0, gridY: 1 },
    { id: 3, teamId: 1, role: "Mage", gridX: 0, gridY: 3 },
    { id: 4, teamId: 2, role: "Knight", gridX: 4, gridY: 2 },
    { id: 5, teamId: 2, role: "Archer", gridX: 4, gridY: 1 },
    { id: 6, teamId: 2, role: "Mage", gridX: 4, gridY: 3 },
  ];

  const roleToArchetype: Record<TacticalUnit["role"], string> = {
    Knight: "td_knight",
    Archer: "td_archer",
    Mage: "td_mage",
  };
  const roleToWeapon: Record<TacticalUnit["role"], string> = {
    Knight: "td_sword",
    Archer: "td_bow",
    Mage: "td_focus",
  };

  const world = createWorld(seed, units.map(unit => ({
    id: unit.id,
    teamId: unit.teamId,
    seed: seed + unit.id,
    archetype: roleToArchetype[unit.role],
    weaponId: roleToWeapon[unit.role],
    armourId: "td_robe",
    ...encodePosition(unit.gridX, unit.gridY),
  })));

  return {
    seed,
    world,
    activeTeam: 1,
    turn: 1,
    units,
    recorder: new ReplayRecorder(world),
  };
}

function isAlive(world: WorldState, id: number): boolean {
  const entity = world.entities.find(e => e.id === id);
  return Boolean(entity && !entity.injury.dead && entity.injury.consciousness > 0);
}

export function applyTeamCommand(
  state: TacticalState,
  action: { kind: "move"; unitId: number; dx: number; dy: number } | { kind: "attack"; unitId: number },
): void {
  const commands: CommandMap = new Map<number, Command[]>();

  if (action.kind === "move") {
    const unit = state.units.find(u => u.id === action.unitId && u.teamId === state.activeTeam);
    if (!unit) return;
    unit.gridX = Math.max(0, Math.min(4, unit.gridX + action.dx));
    unit.gridY = Math.max(0, Math.min(4, unit.gridY + action.dy));

    commands.set(action.unitId, [{
      kind: "move",
      dir: { x: action.dx, y: action.dy, z: 0 },
      intensity: q(1),
      mode: "walk",
    }]);
  } else {
    commands.set(action.unitId, [{ kind: "attackNearest", intensity: q(1), mode: "strike" }]);
  }

  state.recorder.record(state.world.tick, commands);
  stepWorld(state.world, commands, CTX);

  state.activeTeam = state.activeTeam === 1 ? 2 : 1;
  if (state.activeTeam === 1) state.turn += 1;
}

export function getWinner(state: TacticalState): TeamId | 0 {
  const team1Alive = state.units.some(u => u.teamId === 1 && isAlive(state.world, u.id));
  const team2Alive = state.units.some(u => u.teamId === 2 && isAlive(state.world, u.id));
  if (team1Alive && team2Alive) return 0;
  if (team1Alive) return 1;
  if (team2Alive) return 2;
  return 0;
}

export function saveState(state: TacticalState): string {
  return JSON.stringify({
    seed: state.seed,
    activeTeam: state.activeTeam,
    turn: state.turn,
    units: state.units,
    replay: serializeReplay(state.recorder.toReplay()),
  });
}

export function loadState(serialized: string): TacticalState {
  ensurePackLoaded();
  const parsed = JSON.parse(serialized) as {
    seed: number;
    activeTeam: TeamId;
    turn: number;
    units: TacticalUnit[];
    replay: string;
  };

  const replay = deserializeReplay(parsed.replay);
  const world = replayTo(replay, Number.MAX_SAFE_INTEGER, CTX);

  return {
    seed: parsed.seed,
    world,
    activeTeam: parsed.activeTeam,
    turn: parsed.turn,
    units: parsed.units,
    recorder: new ReplayRecorder(world),
  };
}

export function exportReplay(state: TacticalState, outPath: string): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, serializeReplay(state.recorder.toReplay()), "utf8");
}

export function verifyDeterminism(state: TacticalState): boolean {
  const replay = state.recorder.toReplay();
  const replayed = replayTo(replay, Number.MAX_SAFE_INTEGER, CTX);
  return JSON.stringify(replayed.entities.map(e => ({ id: e.id, c: e.injury.consciousness, d: e.injury.dead })))
    === JSON.stringify(state.world.entities.map(e => ({ id: e.id, c: e.injury.consciousness, d: e.injury.dead })));
}

export function runHeadlessTacticsDuel(seed = 1337): { winner: TeamId | 0; deterministic: boolean; ticks: number } {
  const state = newTacticsDuel(seed);
  for (let i = 0; i < 80 && getWinner(state) === 0; i += 1) {
    const unit = state.units.find(u => u.teamId === state.activeTeam && isAlive(state.world, u.id));
    if (!unit) break;
    if (i % 2 === 0) {
      applyTeamCommand(state, { kind: "attack", unitId: unit.id });
    } else {
      const dx = state.activeTeam === 1 ? 1 : -1;
      applyTeamCommand(state, { kind: "move", unitId: unit.id, dx, dy: 0 });
    }
  }
  return { winner: getWinner(state), deterministic: verifyDeterminism(state), ticks: state.world.tick };
}
