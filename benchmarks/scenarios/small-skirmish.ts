import { makeLineBattleWorld } from "./common.js";
import type { ScenarioDefinition } from "./common.js";

const scenario: ScenarioDefinition = {
  id: "small-skirmish",
  label: "Small skirmish (10v10 melee)",
  ticks: 2_000,
  warmupTicks: 200,
  setup: () => makeLineBattleWorld(10, 10),
};

export default scenario;
