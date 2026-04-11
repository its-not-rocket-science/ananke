import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertDeterminismOrThrow,
  hasBuiltWasmKernel,
  type OracleCommand,
  loadWasmKernelFromDist,
  makeInitialState,
  runTraceWithTs,
  runTraceWithWasm,
} from "./shared.js";

interface ScenarioCase {
  name: string;
  seed: number;
  entityCount: number;
  commands: OracleCommand[];
}

const CORPUS = fileURLToPath(new URL("../../fixtures/determinism/scenario-corpus.json", import.meta.url));

describe.skipIf(!hasBuiltWasmKernel())("determinism structured scenario corpus", () => {
  it("matches TS and WASM on adversarial hand-crafted edge cases", async () => {
    const kernel = await loadWasmKernelFromDist();
    const fixture = JSON.parse(readFileSync(CORPUS, "utf8")) as { cases: ScenarioCase[] };

    for (const testCase of fixture.cases) {
      const initial = makeInitialState(testCase.seed, testCase.entityCount);
      const expected = runTraceWithTs(initial, testCase.commands);
      const actual = runTraceWithWasm(initial, testCase.commands, kernel);

      assertDeterminismOrThrow(expected, actual, {
        runSeed: testCase.seed,
        worldSeed: testCase.seed,
        entityCount: testCase.entityCount,
        commandCount: testCase.commands.length,
        label: testCase.name,
      });
      expect(true).toBe(true);
    }
  }, 180_000);
});
