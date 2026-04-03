import { createWorld, q, stepWorld, type CommandMap, type KernelContext } from "../src/index.js";
import { enableTimeTravel } from "../src/history/timetravel.js";

const ctx: KernelContext = { tractionCoeff: q(0.85) };
const root = enableTimeTravel(createWorld(404, [
  { id: 1, teamId: 1, seed: 404, archetype: "KNIGHT_INFANTRY", weaponId: "wpn_longsword" },
  { id: 2, teamId: 2, seed: 405, archetype: "ORC", weaponId: "wpn_short_sword" },
]));

for (let i = 0; i < 8; i++) {
  const cmds: CommandMap = i % 2 === 0
    ? new Map([[1, [{ kind: "attack", targetId: 2, intensity: q(1) }]]])
    : new Map();
  stepWorld(root, cmds, ctx);
  root.recordTick(cmds);
}

root.rewind(4);
const diplomacyBranch = root.fork();
const warBranch = root.fork();

stepWorld(diplomacyBranch, new Map(), ctx);
stepWorld(warBranch, new Map([[1, [{ kind: "attack", targetId: 2, intensity: q(0.7) }]]]), ctx);

console.log("branch ticks", { base: root.tick, diplomacy: diplomacyBranch.tick, war: warBranch.tick });
