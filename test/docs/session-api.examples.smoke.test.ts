import { describe, expect, it } from "vitest";
import { createSession, runSession, getSessionSummary } from "@its-not-rocket-science/ananke/session";
import { runSessionEmbeddingMinimalExample } from "../../examples/session-embedding-minimal/index.js";

describe("session facade public-subpath and embedding example smoke", () => {
  it("supports external-consumer subpath imports", () => {
    const session = createSession({
      mode: "tactical",
      worldSeed: 17,
      entities: [{ id: 1, teamId: 1, seed: 11, archetype: "KNIGHT_INFANTRY", weaponId: "wpn_longsword" }],
    });
    runSession(session, { steps: 2 });

    const summary = getSessionSummary(session);
    expect(summary.mode).toBe("tactical");
    expect(summary.tick).toBe(2);
    expect(summary.entityCount).toBe(1);
  });

  it("keeps the embedding example executable", () => {
    const result = runSessionEmbeddingMinimalExample();

    expect(result.tactical.mode).toBe("tactical");
    expect(result.tactical.tick).toBe(3);
    expect(result.tacticalRestored).toEqual(result.tactical);
    expect(result.worldEvolution.mode).toBe("world_evolution");
    expect(result.worldEvolution.summary.totalSteps).toBe(5);
    expect(result.worldEvolutionFork.summary.totalSteps).toBe(2);
  });
});
