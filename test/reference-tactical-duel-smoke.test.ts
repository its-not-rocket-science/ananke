import { describe, expect, test } from "vitest";

import { runTacticalDuel } from "../examples/reference/tactical-duel/index";

describe("reference app: tactical-duel", () => {
  test("runs full loop to a terminal result", () => {
    const result = runTacticalDuel({ seed: 42, maxTicks: 300, writeReplay: false });

    expect(result.world.tick).toBeGreaterThan(0);
    expect(["Knight", "Brawler", "Draw"]).toContain(result.winner);

    const aliveCount = result.world.entities.filter(e => !e.injury.dead && e.injury.consciousness > 0).length;
    expect(aliveCount).toBeLessThanOrEqual(2);
  });
});
