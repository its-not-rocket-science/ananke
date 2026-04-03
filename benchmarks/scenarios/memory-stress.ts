import { makeLineBattleWorld } from "./common.js";
import type { ScenarioDefinition } from "./common.js";

const scenario: ScenarioDefinition = {
  id: "memory-stress",
  label: "Memory stress (10,000 ticks heap growth)",
  ticks: 10_000,
  warmupTicks: 100,
  setup: () => makeLineBattleWorld(50, 50, { rangedRatio: 0.3 }),
  collectMemory: true,
};

export default scenario;
