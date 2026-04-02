import * as fs from "node:fs";
import * as path from "node:path";
import {
  SCALE,
  createWorld,
  q,
  stepWorld,
  ReplayRecorder,
  serializeReplay,
  type Command,
  type CommandMap,
  type KernelContext,
  type WorldState,
} from "../../../src/index.js";

type DuelRunOptions = {
  seed?: number;
  maxTicks?: number;
  writeReplay?: boolean;
};

type DuelRunResult = {
  world: WorldState;
  winner: "Knight" | "Brawler" | "Draw";
  replayPath?: string;
};

const DEFAULT_CTX: KernelContext = { tractionCoeff: q(0.9) };

const alive = (w: WorldState, id: number): boolean => {
  const e = w.entities.find(x => x.id === id);
  return Boolean(e && !e.injury.dead && e.injury.consciousness > 0);
};

function buildCommands(world: WorldState): CommandMap {
  const cmds: CommandMap = new Map();

  for (const entity of world.entities) {
    if (entity.injury.dead || entity.injury.consciousness <= 0) continue;
    const target = world.entities.find(e => e.teamId !== entity.teamId && !e.injury.dead);
    if (!target) continue;

    const dirX = target.position_m.x > entity.position_m.x ? 1 : -1;
    const move: Command = {
      kind: "move",
      dir: { x: dirX, y: 0, z: 0 },
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

export function runTacticalDuel(opts: DuelRunOptions = {}): DuelRunResult {
  const seed = opts.seed ?? 42;
  const maxTicks = opts.maxTicks ?? 250;
  const writeReplay = opts.writeReplay ?? true;

  const world = createWorld(seed, [
    { id: 1, teamId: 1, seed, archetype: "KNIGHT_INFANTRY", weaponId: "wpn_longsword", armourId: "arm_mail", x_m: -0.6 },
    { id: 2, teamId: 2, seed: seed + 1, archetype: "AMATEUR_BOXER", weaponId: "wpn_club", x_m: 0.6 },
  ]);

  const recorder = new ReplayRecorder(world);

  while (world.tick < maxTicks && alive(world, 1) && alive(world, 2)) {
    const cmds = buildCommands(world);
    recorder.record(world.tick, cmds);
    stepWorld(world, cmds, DEFAULT_CTX);
  }

  const knightAlive = alive(world, 1);
  const brawlerAlive = alive(world, 2);
  const winner: DuelRunResult["winner"] = knightAlive && !brawlerAlive
    ? "Knight"
    : brawlerAlive && !knightAlive
      ? "Brawler"
      : "Draw";

  let replayPath: string | undefined;
  if (writeReplay) {
    const replay = serializeReplay(recorder.toReplay());
    replayPath = path.join(path.dirname(new URL(import.meta.url).pathname), `replay-seed${seed}.json`);
    fs.writeFileSync(replayPath, replay, "utf8");
  }

  return replayPath ? { world, winner, replayPath } : { world, winner };
}

function printSummary(result: DuelRunResult, seed: number): void {
  const knight = result.world.entities.find(e => e.id === 1)!;
  const brawler = result.world.entities.find(e => e.id === 2)!;
  const pct = (v: number) => `${Math.round((v / SCALE.Q) * 100)}%`;

  console.log(`Ananke tactical duel reference (Tier-1 stable API only)`);
  console.log(`Seed: ${seed}`);
  console.log(`Ticks: ${result.world.tick}`);
  console.log(`Winner: ${result.winner}`);
  console.log(`Knight consciousness: ${pct(knight.injury.consciousness)} | dead=${knight.injury.dead}`);
  console.log(`Brawler consciousness: ${pct(brawler.injury.consciousness)} | dead=${brawler.injury.dead}`);
  if (result.replayPath) {
    console.log(`Replay: ${result.replayPath}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seed = Number.parseInt(process.argv[2] ?? "42", 10);
  const result = runTacticalDuel({ seed });
  printSummary(result, seed);
}
