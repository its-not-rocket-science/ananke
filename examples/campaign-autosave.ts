import { createWorld, q, stepWorld, type CommandMap, type KernelContext } from "../src/index.js";
import { AutosaveManager, createNodeAutosaveStorage } from "../src/history/autosave.js";

const ctx: KernelContext = { tractionCoeff: q(0.9) };
const storage = createNodeAutosaveStorage(".autosave-demo");
const autosave = new AutosaveManager("campaign-main", storage, { everyNTicks: 100, onEntityDeath: true });

let world = createWorld(9090, [
  { id: 1, teamId: 1, seed: 9090, archetype: "KNIGHT_INFANTRY", weaponId: "wpn_longsword" },
  { id: 2, teamId: 2, seed: 9091, archetype: "HUMAN_BASE", weaponId: "wpn_club" },
]);

for (let i = 0; i < 200; i++) {
  const cmds: CommandMap = new Map([[1, [{ kind: "attack", targetId: 2, intensity: q(0.8) }]]]);
  stepWorld(world, cmds, ctx);
  await autosave.maybeAutosave(world, "tick");
}

const recovered = await autosave.recoverLastAutosave();
if (recovered) {
  world = recovered;
}

console.log("recovered tick", world.tick);
