import { mkWorld } from "../../src/sim/testing.js";
import { spawnEntities } from "./common.js";
import type { ScenarioDefinition } from "./common.js";

const scenario: ScenarioDefinition = {
  id: "spawn-storm",
  label: "Spawn storm (+10 entities/tick for 100 ticks)",
  ticks: 100,
  setup: () => mkWorld(2, []),
  beforeTick: (world) => spawnEntities(world, 10),
};

export default scenario;
