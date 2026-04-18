import { describe, expect, it } from "vitest";
import * as hostBackend from "../src/world-evolution-host-backend.js";
import * as tier1Root from "../src/index.js";

describe("world-evolution-host-backend additive subpath surface", () => {
  it("exports deterministic host facade helpers", () => {
    const symbols = [
      "runHostDeterministicEvolution",
      "createHostEvolutionSession",
      "runHostEvolutionSession",
      "resumeHostEvolutionSessionFromCheckpoint",
      "createHostEvolutionBranch",
      "runHostEvolutionBranch",
    ] as const;

    for (const symbol of symbols) {
      expect(symbol in hostBackend).toBe(true);
    }
  });

  it("does not leak host-backend facade symbols into Tier-1 root exports", () => {
    const symbols = [
      "runHostDeterministicEvolution",
      "createHostEvolutionSession",
      "runHostEvolutionSession",
      "resumeHostEvolutionSessionFromCheckpoint",
      "createHostEvolutionBranch",
      "runHostEvolutionBranch",
    ] as const;

    for (const symbol of symbols) {
      expect(symbol in tier1Root).toBe(false);
    }
  });
});
