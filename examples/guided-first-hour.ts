// examples/guided-first-hour.ts
// Strict first-hour path: stable root APIs only.

import {
  createWorld,
  stepWorld,
  q,
  ReplayRecorder,
  replayTo,
  serializeReplay,
  deserializeReplay,
  type Command,
  type CommandMap,
} from "../src/index.js";

type FirstHourEntitySummary = {
  id: number;
  dead: boolean;
  consciousness: number;
};

type FirstHourResult = {
  seed: number;
  maxTicks: number;
  finalTick: number;
  replayFrames: number;
  replayFinalTick: number;
  deterministicReplayMatch: boolean;
  entities: FirstHourEntitySummary[];
  success: boolean;
};

const seed = 7;
const maxTicks = 180;

const world = createWorld(seed, [
  {
    id: 1,
    teamId: 1,
    seed: 7001,
    archetype: "KNIGHT_INFANTRY",
    weaponId: "wpn_longsword",
    armourId: "arm_mail",
    x_m: -1.2,
  },
  {
    id: 2,
    teamId: 2,
    seed: 7002,
    archetype: "HUMAN_BASE",
    weaponId: "wpn_club",
    x_m: 1.2,
  },
]);

const recorder = new ReplayRecorder(world);

const strike: Command = { kind: "attackNearest", mode: "strike", intensity: q(1.0) };

for (let tick = 0; tick < maxTicks; tick++) {
  const commands: CommandMap = new Map([
    [1, [strike]],
    [2, [strike]],
  ]);
  stepWorld(world, commands, { tractionCoeff: q(0.9) });
  recorder.record(world.tick, commands);

  const everyoneDown = world.entities.every((entity) => entity.injury.dead || entity.injury.consciousness <= 0);
  if (everyoneDown) break;
}

const replay = recorder.toReplay();
const encoded = serializeReplay(replay);
const decoded = deserializeReplay(encoded);
const targetTick = decoded.frames[decoded.frames.length - 1]?.tick ?? 0;
const replayWorld = replayTo(decoded, targetTick, { tractionCoeff: q(0.9) });

const summary: FirstHourResult = {
  seed,
  maxTicks,
  finalTick: world.tick,
  replayFrames: decoded.frames.length,
  replayFinalTick: replayWorld.tick,
  deterministicReplayMatch: replayWorld.tick === world.tick,
  entities: world.entities.map((entity) => ({
    id: entity.id,
    dead: entity.injury.dead,
    consciousness: entity.injury.consciousness,
  })),
  success: decoded.frames.length > 0 && replayWorld.tick === world.tick,
};

console.log(`FIRST_HOUR_RESULT ${JSON.stringify(summary)}`);
console.log(`FIRST_HOUR_SUCCESS ${summary.success ? "PASS" : "FAIL"}`);
