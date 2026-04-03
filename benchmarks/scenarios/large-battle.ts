import { makeLineBattleWorld } from "./common.js";
import type { ScenarioDefinition } from "./common.js";

const scenario: ScenarioDefinition = {
  id: "large-battle",
  label: "Large battle (100v100 mixed ranged/melee)",
  ticks: 400,
  warmupTicks: 80,
  setup: () => makeLineBattleWorld(100, 100, { rangedRatio: 0.5 }),
};

export default scenario;
