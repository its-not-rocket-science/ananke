import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as legacyBackend from "../src/world-evolution-backend/index.js";
import * as worldEvolutionEngine from "../src/world-evolution-backend/public.js";
import * as tier1Root from "../src/index.js";

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

  it("does not leak backend symbols into Tier-1 root exports", () => {
    const backendOnlySymbols = [
      "runWorldEvolution",
      "createWorldEvolutionSnapshot",
      "buildEvolutionTimeline",
      "normalizeHostWorldInput",
      "canonicalizeOpenWorldInput",
    ] as const;
    for (const symbol of backendOnlySymbols) {
      expect(symbol in tier1Root).toBe(false);
    }
  });

  it("keeps Tier-1 symbol allowlist untouched by backend subpath additions", () => {
    const manifestPath = fileURLToPath(new URL("../docs/stable-api-manifest.json", import.meta.url));
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { symbols: string[] };

    expect(manifest.symbols).not.toContain("runWorldEvolution");
    expect(manifest.symbols).not.toContain("buildEvolutionTimeline");
    expect(manifest.symbols).not.toContain("canonicalizeOpenWorldInput");
  });

  it("preserves Tier-1 runtime canary exports while backend surface evolves", () => {
    const canaryTier1RuntimeSymbols = [
      "SCALE",
      "q",
      "createWorld",
      "loadScenario",
      "stepWorld",
      "ReplayRecorder",
      "extractRigSnapshots",
      "loadPlugin",
    ] as const;
    for (const symbol of canaryTier1RuntimeSymbols) {
      expect(symbol in tier1Root).toBe(true);
    }
  });
});
