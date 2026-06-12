import { makeLineBattleWorld } from "./common.js";
import type { ScenarioDefinition } from "./common.js";

const scenario: ScenarioDefinition = {
  id: "epic-battle",
  label: "Epic battle (5,000v5,000 optimized lane battle)",
  ticks: 180,
  warmupTicks: 60,
  setup: () => makeLineBattleWorld(5_000, 5_000, { rangedRatio: 0.35 }),
};

export default scenario;
