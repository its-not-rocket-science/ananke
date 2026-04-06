import { createWorld } from "../src/world-factory.js";
import { q } from "../src/units.js";
import { enableTimeTravel } from "../src/history/timetravel.js";

const world = createWorld(1234, [
  { id: 1, teamId: 1, seed: 1, archetype: "HUMAN_BASE", weaponId: "wpn_club", x_m: 0 },
  { id: 2, teamId: 2, seed: 2, archetype: "HUMAN_BASE", weaponId: "wpn_club", x_m: 1.2 },
]);

const tt = enableTimeTravel(world, { tractionCoeff: q(0.95) as never }, { bufferSizeTicks: 300 });

for (let i = 0; i < 10; i++) {
  tt.step(new Map());
}

console.log("tick before rewind", world.tick);
(world as typeof world & { rewind: (ticks: number) => void }).rewind(4);
console.log("tick after rewind", world.tick);
