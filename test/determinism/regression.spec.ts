import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertDeterminismOrThrow,
  hasBuiltWasmKernel,
  loadWasmKernelFromDist,
  makeCommandSequence,
  makeInitialState,
  runTraceWithTs,
  runTraceWithWasm,
} from "./shared.js";

interface GoldenEntry {
  label?: string;
  seed: number;
  entityCount: number;
  commands: number;
}

const FIXTURE = fileURLToPath(new URL("../../fixtures/determinism/golden-masters.json", import.meta.url));

describe.skipIf(!hasBuiltWasmKernel())("cross-version determinism regression", () => {
  it("golden masters match current HEAD", async () => {
    const kernel = await loadWasmKernelFromDist();
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as { seeds: GoldenEntry[] };

    for (const entry of fixture.seeds) {
      const initial = makeInitialState(entry.seed, entry.entityCount);
      const commands = makeCommandSequence(entry.seed, entry.entityCount, entry.commands);
      const expected = runTraceWithTs(initial, commands);
      const actual = runTraceWithWasm(initial, commands, kernel);
      assertDeterminismOrThrow(expected, actual, {
        runSeed: entry.seed,
        worldSeed: entry.seed,
        entityCount: entry.entityCount,
        commandCount: entry.commands,
        label: entry.label ?? "golden-masters",
      });
      expect(true).toBe(true);
    }
  }, 180_000);
});
