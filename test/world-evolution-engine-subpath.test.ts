import { describe, expect, it } from "vitest";

import * as legacyBackend from "../src/world-evolution-backend/index.js";
import * as worldEvolutionEngine from "../src/world-evolution-backend/public.js";

describe("world-evolution-engine subpath barrel", () => {
  it("exports the curated deterministic world-evolution integration surface", () => {
    const requiredSymbols = [
      "runWorldEvolution",
      "createWorldEvolutionSnapshot",
      "listAvailableWorldEvolutionProfiles",
      "resolveWorldEvolutionProfile",
      "buildEvolutionTimeline",
      "normalizeHostWorldInput",
      "validateWorldEvolutionInput",
      "toWorldEvolutionRunRequest",
      "fromWorldEvolutionRunResult",
      "canonicalizeOpenWorldInput",
      "mapOpenWorldHostToEvolutionInput",
    ] as const;

    for (const symbol of requiredSymbols) {
      expect(symbol in worldEvolutionEngine).toBe(true);
    }
  });

  it("remains coherent with the legacy backend barrel", () => {
    expect(worldEvolutionEngine.runWorldEvolution).toBe(legacyBackend.runWorldEvolution);
    expect(worldEvolutionEngine.buildEvolutionTimeline).toBe(legacyBackend.buildEvolutionTimeline);
    expect(worldEvolutionEngine.normalizeHostWorldInput).toBe(legacyBackend.normalizeHostWorldInput);
    expect(worldEvolutionEngine.toAnankeEvolutionStateFromOpenWorld).toBe(legacyBackend.toAnankeEvolutionStateFromOpenWorld);
  });
});
