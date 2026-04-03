import { mkWorld } from "../../src/sim/testing.js";
import type { ScenarioDefinition } from "./common.js";

const scenario: ScenarioDefinition = {
  id: "empty-world",
  label: "Empty world tick overhead (0 entities)",
  ticks: 5_000,
  warmupTicks: 400,
  setup: () => mkWorld(1, []),
};

export default scenario;
