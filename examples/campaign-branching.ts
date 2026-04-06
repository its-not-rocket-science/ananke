import { createWorld } from "../src/world-factory.js";
import { q } from "../src/units.js";
import { enableTimeTravel } from "../src/history/timetravel.js";

const base = createWorld(99, [
  { id: 1, teamId: 1, seed: 3, archetype: "HUMAN_BASE", weaponId: "wpn_spear", x_m: 0 },
  { id: 2, teamId: 2, seed: 4, archetype: "HUMAN_BASE", weaponId: "wpn_club", x_m: 1.4 },
]);

const timeTravel = enableTimeTravel(base, { tractionCoeff: q(0.92) as never }, { bufferSizeTicks: 600 });
for (let t = 0; t < 20; t++) timeTravel.step(new Map());

const forkA = (base as typeof base & { fork: () => typeof base }).fork();
const forkB = (base as typeof base & { fork: () => typeof base }).fork();

console.log("branch seeds", forkA.seed, forkB.seed);
console.log("branch tick", forkA.tick, forkB.tick);
