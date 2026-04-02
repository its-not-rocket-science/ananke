import { describe, expect, it } from "vitest";
import { WORLD_STEP_PHASE_ORDER } from "../src/sim/step/world-phases.js";

describe("world-step phase order", () => {
  it("keeps the deterministic phase pipeline order stable", () => {
    expect(WORLD_STEP_PHASE_ORDER).toEqual([
      "prepare",
      "cooldowns",
      "input",
      "movement",
      "actions",
      "impacts",
      "systems",
      "finalize",
    ]);
  });
});
