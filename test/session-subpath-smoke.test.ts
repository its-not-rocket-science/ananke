import { describe, expect, test } from "vitest";

import { runMinimalSessionEmbeddingDemo } from "../examples/session-embedding-minimal/index.js";

describe("session facade subpath consumer smoke", () => {
  test("imports @its-not-rocket-science/ananke/session and runs a tactical step", async () => {
    const sessionFacade = await import("@its-not-rocket-science/ananke/session");
    const session = sessionFacade.createSession({
      mode: "tactical",
      worldSeed: 11,
      entities: [
        { id: 1, teamId: 1, seed: 111, archetype: "HUMAN_BASE", weaponId: "wpn_longsword" },
        { id: 2, teamId: 2, seed: 222, archetype: "HUMAN_BASE", weaponId: "wpn_club" },
      ],
      enableReplay: true,
    });

    const result = sessionFacade.runSession(session, { steps: 1 });
    expect(result.summary.mode).toBe("tactical");
    expect(result.summary.tick).toBe(1);
    expect(session.state.replay?.frames.length).toBe(1);
  });

  test("runs the embedding example without side effects beyond deterministic summaries", () => {
    const summary = runMinimalSessionEmbeddingDemo(() => {});
    expect(summary.tactical.tick).toBe(3);
    expect(summary.tacticalRestored.tick).toBe(3);
    expect(summary.worldEvolution.summary.currentSnapshot.tick).toBe(5);
    expect(summary.worldEvolutionFork.summary.currentSnapshot.tick).toBe(7);
  });
});
