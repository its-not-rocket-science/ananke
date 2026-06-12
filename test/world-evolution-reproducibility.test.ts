import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildEvolutionRunReproducibilityRecord,
  mapOpenWorldHostToEvolutionInput,
  runWorldEvolution,
  toAnankeEvolutionState,
  toWorldEvolutionRunRequest,
} from "../src/world-evolution-backend/public.js";
import {
  runHostDeterministicEvolutionWithReplayProof,
} from "../src/world-evolution-host-backend.js";
import type { OpenWorldHostInput } from "../src/world-evolution-backend/open-world-host-adapter.js";

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/world-evolution-open-worldbuilder/", import.meta.url));

function readJson<T>(name: string): T {
  const raw = readFileSync(`${FIXTURE_DIR}${name}`, "utf8");
  return JSON.parse(raw) as T;
}

describe("world-evolution reproducibility", () => {
  it("builds stable fingerprints for equivalent host inputs", () => {
    const input = readJson<OpenWorldHostInput>("openworld-host-input.sample.json");
    const shuffled: OpenWorldHostInput = {
      ...input,
      factions: [...input.factions].reverse(),
      regions: [...input.regions].reverse(),
      settlements: [...input.settlements].reverse(),
    };

    const mappedA = mapOpenWorldHostToEvolutionInput(input).input;
    const mappedB = mapOpenWorldHostToEvolutionInput(shuffled).input;

    const requestA = toWorldEvolutionRunRequest(mappedA, 18, { includeDeltas: true, checkpointInterval: 6 });
    const requestB = toWorldEvolutionRunRequest(mappedB, 18, { includeDeltas: true, checkpointInterval: 6 });

    const resultA = runWorldEvolution(requestA);
    const resultB = runWorldEvolution(requestB);

    const proofA = buildEvolutionRunReproducibilityRecord(requestA, resultA);
    const proofB = buildEvolutionRunReproducibilityRecord(requestB, resultB);

    expect(proofA).toEqual(proofB);
  });

  it("returns replay-proof metadata from host backend facade", () => {
    const input = readJson<OpenWorldHostInput>("openworld-host-input.sample.json");
    const first = runHostDeterministicEvolutionWithReplayProof({
      input,
      steps: 12,
      includeDeltas: true,
      checkpointInterval: 4,
    });

    const second = runHostDeterministicEvolutionWithReplayProof({
      input,
      steps: 12,
      includeDeltas: true,
      checkpointInterval: 4,
    });

    expect(first.reproducibility).toEqual(second.reproducibility);
    expect(first.reproducibility.requestFingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(first.reproducibility.outputDigest).toMatch(/^[0-9a-f]{8}$/);

    const adaptedRequest = toWorldEvolutionRunRequest(first.normalizedInput, 12, {
      includeDeltas: true,
      checkpointInterval: 4,
    });
    const fromAdapter = runWorldEvolution(adaptedRequest);
    const directProof = buildEvolutionRunReproducibilityRecord(adaptedRequest, fromAdapter);
    expect(first.reproducibility).toEqual(directProof);
  });

  it("changes output digest when simulation result diverges", () => {
    const input = readJson<OpenWorldHostInput>("openworld-host-input.sample.json");
    const mapped = mapOpenWorldHostToEvolutionInput(input).input;
    const state = toAnankeEvolutionState(mapped);
    const requestA = toWorldEvolutionRunRequest(mapped, 10, { includeDeltas: true });
    const requestB = {
      ...requestA,
      snapshot: {
        ...state.snapshot,
        polities: state.snapshot.polities.map((polity, idx) => (
          idx === 0 ? { ...polity, treasury_cu: polity.treasury_cu + 1 } : polity
        )),
      },
    };

    const proofA = buildEvolutionRunReproducibilityRecord(requestA, runWorldEvolution(requestA));
    const proofB = buildEvolutionRunReproducibilityRecord(requestB, runWorldEvolution(requestB));

    expect(proofA.requestFingerprint).not.toBe(proofB.requestFingerprint);
    expect(proofA.outputDigest).not.toBe(proofB.outputDigest);
  });
});
