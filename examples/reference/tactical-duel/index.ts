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
  type Entity,
} from "../../../src/index.js";
import { buildWorldIndex } from "../../../src/sim/indexing.js";
import { buildSpatialIndex } from "../../../src/sim/spatial.js";
import { buildAICommands } from "../../../src/sim/ai/system.js";
import type { AIPolicy } from "../../../src/sim/ai/types.js";
import { deriveAnimationHints } from "../../../src/model3d.js";
import { canDetect, DEFAULT_SENSORY_ENV } from "../../../src/sim/sensory.js";

// ── Types ─────────────────────────────────────────────────────────────────────

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

type SnapState = {
  consciousness: number;
  shock: number;
  fluidLoss: number;
  x: number;
  attackCooldown: number;
  dead: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_CTX: KernelContext = { tractionCoeff: q(0.9) };
const CELL_SIZE_M = Math.trunc(2 * SCALE.m);
const ARENA_WIDTH = 44;           // chars
const ARENA_LEFT_M = -2.5;        // metres
const ARENA_RIGHT_M = 2.5;        // metres
const MAX_LOG = 8;
const TICK_MS = 130;              // game tick rate in interactive mode

// Berserker AI: close-in, rarely defends, very sticky target
const BERSERKER_POLICY: AIPolicy = {
  archetype: "berserker",
  desiredRange_m: 0.3,
  engageRange_m: 1.8,
  retreatRange_m: 0,
  threatRange_m: 2.5,
  defendWhenThreatenedQ: q(0.15),
  parryBiasQ: q(0.25),
  dodgeBiasQ: q(0.05),
  retargetCooldownTicks: 3,
  focusStickinessQ: q(0.95),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const alive = (w: WorldState, id: number): boolean => {
  const e = w.entities.find(x => x.id === id);
  return Boolean(e && !e.injury.dead && e.injury.consciousness > 0);
};

const pct = (val: number) => `${Math.round((val / SCALE.Q) * 100)}%`.padStart(4);

function bar(val: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.round((val / SCALE.Q) * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function snapState(e: Entity): SnapState {
  return {
    consciousness: e.injury.consciousness,
    shock:         e.injury.shock,
    fluidLoss:     e.injury.fluidLoss,
    x:             e.position_m.x,
    attackCooldown: e.action.attackCooldownTicks,
    dead:          e.injury.dead,
  };
}

function diffEvents(world: WorldState, prev: Map<number, SnapState>): string[] {
  const events: string[] = [];
  const t = world.tick;
  for (const e of world.entities) {
    const p = prev.get(e.id);
    if (!p) continue;
    const name = e.id === 1 ? "Knight" : "Brawler";

    if (!p.dead && e.injury.dead) {
      events.push(`T:${t} ${name} is slain!`);
      continue;
    }
    if (p.consciousness > 0 && e.injury.consciousness <= 0 && !e.injury.dead) {
      events.push(`T:${t} ${name} falls unconscious!`);
    }
    const shockDelta = e.injury.shock - p.shock;
    if (shockDelta > 50) {
      const who = e.id === 1 ? "Brawler" : "Knight";
      events.push(`T:${t} ${who} hits! ${name} shock +${Math.round(shockDelta / SCALE.Q * 100)}%`);
    }
    const fluidDelta = e.injury.fluidLoss - p.fluidLoss;
    if (fluidDelta > 30) {
      events.push(`T:${t} ${name} bleeding +${Math.round(fluidDelta / SCALE.Q * 100)}%`);
    }
    if (p.attackCooldown === 0 && e.action.attackCooldownTicks > 0) {
      events.push(`T:${t} ${name} strikes!`);
    }
    const dx = Math.abs(e.position_m.x - p.x);
    if (dx > SCALE.m * 0.15) {
      const toward = (e.id === 1)
        ? (e.position_m.x > p.x ? "advances" : "retreats")
        : (e.position_m.x < p.x ? "advances" : "retreats");
      events.push(`T:${t} ${name} ${toward}`);
    }
  }
  return events;
}

function renderArena(knight: Entity, brawler: Entity): string {
  const kx = knight.position_m.x / SCALE.m;
  const bx = brawler.position_m.x / SCALE.m;
  const range = ARENA_RIGHT_M - ARENA_LEFT_M;
  const toCol = (x: number) =>
    Math.max(0, Math.min(ARENA_WIDTH - 1,
      Math.round((x - ARENA_LEFT_M) / range * (ARENA_WIDTH - 1))));

  const kCol = toCol(kx);
  const bCol = toCol(bx);
  const line = Array<string>(ARENA_WIDTH).fill("─");

  if (kCol === bCol) {
    line[kCol] = "X";
  } else {
    line[kCol] = "K";
    line[bCol] = "B";
  }

  const dist = Math.abs(bx - kx).toFixed(2);
  const top    = "  ┌" + "─".repeat(ARENA_WIDTH) + "┐";
  const mid    = "  │" + line.join("") + "│";
  const bottom = "  └" + "─".repeat(ARENA_WIDTH) + "┘";
  const label  = `  Distance: ${dist}m`;
  return [top, mid, bottom, label].join("\n");
}

function renderFighter(e: Entity, label: string, padRight = 36): string {
  const h = deriveAnimationHints(e);
  const motion = h.dead ? "DEAD"
    : h.unconscious ? "OUT "
    : h.prone       ? "PRNE"
    : h.sprint > 0  ? "SPRT"
    : h.run > 0     ? "RUN "
    : h.walk > 0    ? "WALK"
    : "IDLE";

  const cBar = bar(e.injury.consciousness);
  const sBar = bar(e.injury.shock);
  const fBar = bar(e.injury.fluidLoss);

  const lines = [
    `\x1B[1m${label}\x1B[0m`,
    ` Con ${cBar} ${pct(e.injury.consciousness)}`,
    ` Shk ${sBar} ${pct(e.injury.shock)}`,
    ` Fld ${fBar} ${pct(e.injury.fluidLoss)}`,
    ` [${motion}] Grd:${pct(h.guardingQ)} Atk:${pct(h.attackingQ)}`,
  ];
  return lines.map(l => l.padEnd(padRight)).join("\n");
}

function renderDetection(world: WorldState): string {
  const [k, b] = [
    world.entities.find(e => e.id === 1)!,
    world.entities.find(e => e.id === 2)!,
  ];
  const kSeeB = canDetect(k, b, DEFAULT_SENSORY_ENV);
  const bSeeK = canDetect(b, k, DEFAULT_SENSORY_ENV);
  return `  K→B detect: ${bar(kSeeB, 8)}${pct(kSeeB)}   B→K detect: ${bar(bSeeK, 8)}${pct(bSeeK)}`;
}

function renderFrame(
  world: WorldState,
  log: string[],
  paused: boolean,
  seed: number,
): string {
  const [k, b] = [
    world.entities.find(e => e.id === 1)!,
    world.entities.find(e => e.id === 2)!,
  ];

  const kLines = renderFighter(k, "KNIGHT (you)").split("\n");
  const bLines = renderFighter(b, "BRAWLER (AI)").split("\n");

  const fighterRow = kLines.map((l, i) =>
    l.padEnd(38) + (bLines[i] ?? "")).join("\n");

  const logLines = log.slice(0, MAX_LOG)
    .map(l => `  ${l}`)
    .join("\n") || "  (no events yet)";

  const pauseTag = paused ? " \x1B[33m[PAUSED]\x1B[0m" : "";
  const header = `\x1B[1m ANANKE — TACTICAL DUEL\x1B[0m  seed:${seed}  tick:${world.tick}${pauseTag}`;
  const sep = "─".repeat(74);

  return [
    "",
    header,
    sep,
    "",
    fighterRow,
    "",
    renderDetection(world),
    "",
    renderArena(k, b),
    "",
    "  ─── EVENTS " + "─".repeat(60),
    logLines,
    "",
    "  [A]ttack  [B]lock  [H/←]Left  [L/→]Right  [Space]Wait  [P]ause  [Q]uit",
    "",
  ].join("\n");
}

// ── Auto mode (CI / non-TTY) ──────────────────────────────────────────────────

function buildAutoCommands(world: WorldState): CommandMap {
  const cmds: CommandMap = new Map();
  for (const entity of world.entities) {
    if (entity.injury.dead || entity.injury.consciousness <= 0) continue;
    const target = world.entities.find(e => e.teamId !== entity.teamId && !e.injury.dead);
    if (!target) continue;
    const dirX = target.position_m.x > entity.position_m.x ? 1 : -1;
    cmds.set(entity.id, [
      { kind: "move", dir: { x: dirX, y: 0, z: 0 }, intensity: q(1), mode: "run" },
      { kind: "attackNearest", intensity: q(1), mode: "strike" },
    ]);
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
    const cmds = buildAutoCommands(world);
    recorder.record(world.tick, cmds);
    stepWorld(world, cmds, DEFAULT_CTX);
  }

  return finalize(world, recorder, seed, writeReplay);
}

// ── Interactive mode ──────────────────────────────────────────────────────────

function parseKey(raw: string): Command[] | "pause" | "quit" | null {
  switch (raw) {
    case "q":
    case "\x03": return "quit";
    case "p":   return "pause";
    case "a":
      return [{ kind: "attackNearest", intensity: q(1), mode: "strike" }];
    case "b":
      return [{ kind: "defend", mode: "block", intensity: q(1) }];
    case "h":
    case "\x1B[D":
      return [{ kind: "move", dir: { x: -1, y: 0, z: 0 }, intensity: q(1), mode: "run" }];
    case "l":
    case "\x1B[C":
      return [{ kind: "move", dir: { x: 1, y: 0, z: 0 }, intensity: q(1), mode: "run" }];
    case " ":
      return [{ kind: "move", dir: { x: 0, y: 0, z: 0 }, intensity: q(0), mode: "walk" }];
    default:
      return null;
  }
}

async function runTacticalDuelInteractive(opts: DuelRunOptions = {}): Promise<DuelRunResult> {
  const seed = opts.seed ?? 42;
  const maxTicks = opts.maxTicks ?? 500;
  const writeReplay = opts.writeReplay ?? true;

  const world = createWorld(seed, [
    { id: 1, teamId: 1, seed, archetype: "KNIGHT_INFANTRY", weaponId: "wpn_longsword", armourId: "arm_mail", x_m: -0.8 },
    { id: 2, teamId: 2, seed: seed + 1, archetype: "AMATEUR_BOXER", weaponId: "wpn_club", x_m: 0.8 },
  ]);

  const recorder = new ReplayRecorder(world);
  const eventLog: string[] = [];
  let prevStates = new Map(world.entities.map(e => [e.id, snapState(e)]));

  let pendingCmd: Command[] | null = null;
  let paused = false;
  let quit = false;

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  process.stdin.on("data", (raw: string) => {
    const result = parseKey(raw);
    if (result === "quit") { quit = true; return; }
    if (result === "pause") { paused = !paused; return; }
    if (result !== null) pendingCmd = result;
  });

  // Initial render
  process.stdout.write("\x1B[2J\x1B[H");
  process.stdout.write(renderFrame(world, eventLog, paused, seed));

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const gameOver = quit
        || world.tick >= maxTicks
        || !alive(world, 1)
        || !alive(world, 2);

      if (gameOver) {
        clearInterval(interval);
        process.stdin.setRawMode(false);
        process.stdin.pause();

        const winner = determineWinner(world);
        process.stdout.write("\x1B[2J\x1B[H");
        process.stdout.write(`\n\x1B[1m DUEL OVER — ${winner.toUpperCase()} wins!\x1B[0m  (tick ${world.tick})\n\n`);
        resolve(finalize(world, recorder, seed, writeReplay));
        return;
      }

      if (paused) {
        process.stdout.write("\x1B[2J\x1B[H");
        process.stdout.write(renderFrame(world, eventLog, paused, seed));
        return;
      }

      // AI commands for Brawler
      const idx = buildWorldIndex(world);
      const spatial = buildSpatialIndex(world, CELL_SIZE_M);
      const aiCmds = buildAICommands(world, idx, spatial, (id) =>
        id === 2 ? BERSERKER_POLICY : undefined
      );

      // Merge: player command (if any) overrides
      const cmds: CommandMap = new Map(aiCmds);
      if (pendingCmd) {
        cmds.set(1, pendingCmd);
        pendingCmd = null;
      } else if (!cmds.has(1)) {
        // Default player: wait
        cmds.set(1, [{ kind: "move", dir: { x: 0, y: 0, z: 0 }, intensity: q(0), mode: "walk" }]);
      }

      recorder.record(world.tick, cmds);
      stepWorld(world, cmds, DEFAULT_CTX);

      const newStates = new Map(world.entities.map(e => [e.id, snapState(e)]));
      const newEvents = diffEvents(world, prevStates);
      if (newEvents.length > 0) eventLog.unshift(...newEvents);
      if (eventLog.length > MAX_LOG * 2) eventLog.length = MAX_LOG * 2;
      prevStates = newStates;

      process.stdout.write("\x1B[2J\x1B[H");
      process.stdout.write(renderFrame(world, eventLog, paused, seed));
    }, TICK_MS);
  });
}

// ── Shared utilities ──────────────────────────────────────────────────────────

function determineWinner(world: WorldState): DuelRunResult["winner"] {
  const knightAlive = alive(world, 1);
  const brawlerAlive = alive(world, 2);
  return knightAlive && !brawlerAlive ? "Knight"
    : brawlerAlive && !knightAlive  ? "Brawler"
    : "Draw";
}

function finalize(
  world: WorldState,
  recorder: ReplayRecorder,
  seed: number,
  writeReplay: boolean,
): DuelRunResult {
  const winner = determineWinner(world);
  let replayPath: string | undefined;

  if (writeReplay) {
    const replay = serializeReplay(recorder.toReplay());
    replayPath = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      `replay-seed${seed}.json`,
    );
    fs.writeFileSync(replayPath, replay, "utf8");
  }

  return replayPath ? { world, winner, replayPath } : { world, winner };
}

function printSummary(result: DuelRunResult, seed: number): void {
  const knight  = result.world.entities.find(e => e.id === 1)!;
  const brawler = result.world.entities.find(e => e.id === 2)!;
  console.log("Ananke tactical duel — Tier-1 stable API only");
  console.log(`Seed: ${seed}  Ticks: ${result.world.tick}  Winner: ${result.winner}`);
  console.log(`Knight  consciousness:${pct(knight.injury.consciousness)}  dead:${knight.injury.dead}`);
  console.log(`Brawler consciousness:${pct(brawler.injury.consciousness)}  dead:${brawler.injury.dead}`);
  if (result.replayPath) console.log(`Replay: ${result.replayPath}`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const seed = Number.parseInt(args.find(a => /^\d+$/.test(a)) ?? "42", 10);
  const interactive = args.includes("--interactive") || args.includes("-i");

  if (interactive && process.stdout.isTTY) {
    runTacticalDuelInteractive({ seed })
      .then(result => printSummary(result, seed))
      .catch(err => { console.error(err); process.exit(1); });
  } else {
    if (interactive) process.stderr.write("Warning: not a TTY — running auto mode\n");
    const result = runTacticalDuel({ seed });
    printSummary(result, seed);
  }
}
