import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runWorldEvolution } from "../src/world-evolution-backend/engine.js";
import {
  mapOpenWorldHostToEvolutionInput,
  toAnankeEvolutionStateFromOpenWorld,
  type OpenWorldHostInput,
} from "../src/world-evolution-backend/open-world-host-adapter.js";

const fixturePath = fileURLToPath(new URL("../fixtures/world-evolution-open-worldbuilder/openworld-host-input.sample.json", import.meta.url));
const hostInput = JSON.parse(readFileSync(fixturePath, "utf8")) as OpenWorldHostInput;

const mapped = mapOpenWorldHostToEvolutionInput(hostInput);
const state = toAnankeEvolutionStateFromOpenWorld(hostInput);
const result = runWorldEvolution({
  snapshot: state.snapshot,
  steps: 6,
  includeDeltas: true,
  checkpointInterval: 3,
});

console.log("Open world host adapter example");
console.log(`worldSeed=${mapped.input.worldSeed} tick0=${mapped.input.tick ?? 0} finalTick=${result.finalSnapshot.tick}`);
console.log(`polities=${result.finalSnapshot.polities.length} routes=${result.finalSnapshot.tradeRoutes.length}`);
console.log(`metrics.population=${result.metrics.totalPopulation} metrics.treasury=${result.metrics.totalTreasury_cu}`);
for (const event of result.timeline.slice(0, 3)) {
  console.log(`- step=${event.step} tick=${event.tick} trade=${event.trade.length} wars=${event.wars.length} migration=${event.migrations.length}`);
}
