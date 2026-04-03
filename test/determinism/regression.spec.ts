import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  firstDivergence,
  hasBuiltWasmKernel,
  loadWasmKernelFromDist,
  makeCommandSequence,
  makeInitialState,
  runTraceWithTs,
  runTraceWithWasm,
} from "./shared.js";

interface GoldenEntry {
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

      const divergence = firstDivergence(expected.snapshots, actual.snapshots);
      if (divergence) {
        throw new Error(
          `Determinism mismatch seed=${entry.seed} tick=${divergence.tick} entity=${divergence.entityId}\n` +
          `expected=${JSON.stringify(divergence.expected)}\nactual=${JSON.stringify(divergence.actual)}`,
        );
      }

      expect(actual.finalState).toEqual(expected.finalState);
    }
  }, 180_000);
});
