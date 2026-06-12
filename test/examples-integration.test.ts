import { describe, expect, it } from "vitest";

import {
  createWorld,
  q,
  ReplayRecorder,
  replayTo,
  serializeReplay,
  deserializeReplay,
  stepWorld,
  type Command,
  type CommandMap,
  type WorldState,
} from "../src";
import {
  exportReplayJson,
  loadScenarioFromPath,
  loadSession,
  runUntilTerminal,
  saveSession,
} from "../examples/reference/host-coherence/index";

const CTX = { tractionCoeff: q(0.9) };

type WorldSignature = {
  tick: number;
  aliveTeams: number[];
  entities: Array<{
    id: number;
    teamId: number;
    x: number;
    y: number;
    shock: number;
    consciousness: number;
    dead: boolean;
  }>;
};

function buildLargeExampleWorld(seed: number): WorldState {
  const entities = Array.from({ length: 18 }, (_, i) => {
    const id = i + 1;
    const teamId = i < 6 ? 1 : i < 12 ? 2 : 3;
    return {
      id,
      teamId,
      seed: seed + id,
      archetype: i % 2 === 0 ? "KNIGHT_INFANTRY" : "AMATEUR_BOXER",
      weaponId: i % 2 === 0 ? "wpn_longsword" : "wpn_club",
      armourId: i % 2 === 0 ? "arm_mail" : undefined,
      x_m: (teamId - 2) * 1.2 + (i % 3) * 0.3,
      y_m: (i % 6) * 0.25 - 0.5,
    };
  });

  return createWorld(seed, entities);
}

function buildCommands(world: WorldState): CommandMap {
  const cmds: CommandMap = new Map();

  for (const entity of world.entities) {
    if (entity.injury.dead || entity.injury.consciousness <= 0) continue;

    const target = world.entities
      .filter(other => other.teamId !== entity.teamId && !other.injury.dead && other.injury.consciousness > 0)
      .sort((a, b) => {
        const da = Math.hypot(a.position_m.x - entity.position_m.x, a.position_m.y - entity.position_m.y);
        const db = Math.hypot(b.position_m.x - entity.position_m.x, b.position_m.y - entity.position_m.y);
        return da - db;
      })[0];

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
    cmds.set(entity.id, [move, attack]);
  }

  return cmds;
}

function worldSignature(world: WorldState): WorldSignature {
  const entities = world.entities
    .map(entity => ({
      id: entity.id,
      teamId: entity.teamId,
      x: Number(entity.position_m.x.toFixed(4)),
      y: Number(entity.position_m.y.toFixed(4)),
      shock: entity.injury.shock,
      consciousness: entity.injury.consciousness,
      dead: entity.injury.dead,
    }))
    .sort((a, b) => a.id - b.id);

  const aliveTeams = [...new Set(entities.filter(e => !e.dead && e.consciousness > 0).map(e => e.teamId))].sort((a, b) => a - b);

  return {
    tick: world.tick,
    aliveTeams,
    entities,
  };
}

function runLargeExample(seed: number, ticks: number): { live: WorldState; replayed: WorldState; replayJson: string } {
  const world = buildLargeExampleWorld(seed);
  const recorder = new ReplayRecorder(world);

  for (let i = 0; i < ticks; i += 1) {
    const cmds = buildCommands(world);
    recorder.record(world.tick, cmds);
    stepWorld(world, cmds, CTX);
  }

  const replayJson = serializeReplay(recorder.toReplay());
  const replay = deserializeReplay(replayJson);
  const replayed = replayTo(replay, ticks - 1, CTX);

  return { live: world, replayed, replayJson };
}

describe("examples integration validation", () => {
  it("runs a production-shape example workload across many entities and ticks", () => {
    const { live } = runLargeExample(1337, 180);

    expect(live.tick).toBe(180);
    expect(live.entities).toHaveLength(18);
    expect(live.entities.some(entity => entity.injury.shock > 0)).toBe(true);
  });

  it("serializes, replays, and matches the live world state deterministically", () => {
    const { live, replayed, replayJson } = runLargeExample(2048, 220);

    expect(replayJson.length).toBeGreaterThan(500);
    expect(worldSignature(replayed)).toEqual(worldSignature(live));
  });

  it("is stable across repeat runs with the same seed and no single-tick assumptions", () => {
    const runA = runLargeExample(9001, 160);
    const runB = runLargeExample(9001, 160);

    expect(worldSignature(runA.live)).toEqual(worldSignature(runB.live));
    expect(worldSignature(runA.replayed)).toEqual(worldSignature(runA.live));
    expect(runA.live.tick).toBeGreaterThan(1);
  });

  it("long-running integration example: host-coherence session save/load remains equivalent at terminal", () => {
    const original = loadScenarioFromPath();
    const terminalBeforeSave = runUntilTerminal(original, 500);
    const savedSession = saveSession(original);

    const restored = loadSession(savedSession);
    const terminalAfterLoad = runUntilTerminal(restored, 500);

    expect(terminalBeforeSave.tick).toBeGreaterThan(100);
    expect(terminalAfterLoad.tick).toBe(terminalBeforeSave.tick);
    expect(terminalAfterLoad.entities).toEqual(terminalBeforeSave.entities);
    expect(exportReplayJson(original).length).toBeGreaterThan(500);
    expect(exportReplayJson(restored)).toContain("\"frames\":[]");
  });
});
