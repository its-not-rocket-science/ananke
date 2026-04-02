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

const [entityA, entityB] = world.entities;
console.log(`first-hour: tick=${world.tick}`);
console.log(`entity-1 dead=${entityA?.injury.dead} consciousness=${entityA?.injury.consciousness}`);
console.log(`entity-2 dead=${entityB?.injury.dead} consciousness=${entityB?.injury.consciousness}`);

const replay = recorder.toReplay();
const encoded = serializeReplay(replay);
const decoded = deserializeReplay(encoded);
const targetTick = decoded.frames[decoded.frames.length - 1]?.tick ?? 0;
const replayWorld = replayTo(decoded, targetTick, { tractionCoeff: q(0.9) });

console.log(`replay-frames=${decoded.frames.length}`);
console.log(`replay-final-tick=${replayWorld.tick}`);
