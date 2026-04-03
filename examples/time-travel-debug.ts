import { createWorld, q, stepWorld, type CommandMap, type KernelContext } from "../src/index.js";
import { enableTimeTravel } from "../src/history/timetravel.js";

const ctx: KernelContext = { tractionCoeff: q(0.9) };
const world = enableTimeTravel(createWorld(1337, [
  { id: 1, teamId: 1, seed: 1337, archetype: "KNIGHT_INFANTRY", weaponId: "wpn_longsword" },
  { id: 2, teamId: 2, seed: 1338, archetype: "HUMAN_BASE", weaponId: "wpn_club" },
]));

for (let i = 0; i < 5; i++) {
  const cmds: CommandMap = new Map([[1, [{ kind: "attack", targetId: 2, intensity: q(0.6) }]]]);
  stepWorld(world, cmds, ctx);
  world.recordTick(cmds);
}

console.log("before rewind", world.tick);
world.rewind(3);
console.log("after rewind", world.tick);

const branch = world.fork();
console.log("fork tick", branch.tick);
