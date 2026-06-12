import { createWorld, q, stepWorld, type CommandMap, type KernelContext } from "../../../src/index.js";

const ctx: KernelContext = { tractionCoeff: q(0.9) };

export function runRLArenaSmoke(seed = 99): { ticks: number; sparseRewardEvents: number } {
  const entities = Array.from({ length: 10 }, (_, idx) => ({
    id: idx + 1,
    teamId: idx < 5 ? 1 : 2,
    seed: seed + idx,
    archetype: "HUMAN_BASE",
    weaponId: "wpn_club",
    x_m: idx < 5 ? -1 : 1,
    y_m: (idx % 5) * 0.2,
  }));

  const world = createWorld(seed, entities);
  let sparseRewardEvents = 0;

  for (let t = 0; t < 120; t += 1) {
    const cmds: CommandMap = new Map();
    for (const e of world.entities) {
      cmds.set(e.id, [{ kind: "attackNearest", intensity: q(1), mode: "strike" }]);
    }
    stepWorld(world, cmds, ctx);

    const dead1 = world.entities.filter(e => e.teamId === 1 && e.injury.dead).length;
    const dead2 = world.entities.filter(e => e.teamId === 2 && e.injury.dead).length;
    if ((dead1 >= 5 || dead2 >= 5) && sparseRewardEvents === 0) sparseRewardEvents = 1;
  }

  return { ticks: world.tick, sparseRewardEvents };
}
