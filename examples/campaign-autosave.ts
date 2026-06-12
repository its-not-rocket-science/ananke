import { createWorld } from "../src/world-factory.js";
import { q } from "../src/units.js";
import { stepWorld } from "../src/sim/kernel.js";
import { AutosaveManager } from "../src/history/autosave.js";

const autosave = new AutosaveManager(undefined, { everyNTicks: 100, onEntityDeath: true });

let world = createWorld(777, [
  { id: 1, teamId: 1, seed: 1, archetype: "HUMAN_BASE", weaponId: "wpn_club", x_m: 0 },
  { id: 2, teamId: 2, seed: 2, archetype: "HUMAN_BASE", weaponId: "wpn_club", x_m: 1.2 },
]);

for (let i = 0; i < 300; i++) {
  const previous = structuredClone(world);
  stepWorld(world, new Map(), { tractionCoeff: q(0.95) as never });
  await autosave.maybeAutosave(world, previous);
}

const recovered = await autosave.recover();
if (recovered) world = recovered;
console.log("recovered tick", world.tick);
