import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  hasBuiltWasmKernel,
  loadWasmKernelFromDist,
  makeCommandSequence,
  makeInitialState,
  runTraceWithTs,
  runTraceWithWasm,
} from "./shared.js";

const runSeed = Number(process.env.DETERMINISM_SEED ?? 1337);
// CI defaults: 50 runs × 50 commands. Override via env vars for stress runs:
//   DETERMINISM_WORLD_STATES=10000 DETERMINISM_COMMANDS_PER_STATE=1000 npm test
const worldRuns = Number(process.env.DETERMINISM_WORLD_STATES ?? 50);
const commandsPerState = Number(process.env.DETERMINISM_COMMANDS_PER_STATE ?? 50);

describe.skipIf(!hasBuiltWasmKernel())("determinism fuzzer against wasm", () => {
  it(
    "TS shadow backend and WASM backend are bit-identical for every tick",
    async () => {
      const kernel = await loadWasmKernelFromDist();
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            seed: fc.integer({ min: 1, max: 0x7fffffff }),
            entityCount: fc.integer({ min: 1, max: 64 }),
          }),
          async ({ seed, entityCount }) => {
            const initial = makeInitialState(seed, entityCount);
            const cmds = makeCommandSequence(seed ^ runSeed, entityCount, commandsPerState);
            const tsTrace = runTraceWithTs(initial, cmds);
            const wasmTrace = runTraceWithWasm(initial, cmds, kernel);

            expect(wasmTrace.snapshots).toEqual(tsTrace.snapshots);
            expect(wasmTrace.finalState).toEqual(tsTrace.finalState);
          },
        ),
        {
          seed: runSeed,
          numRuns: worldRuns,
        },
      );
    },
    180_000,
  );
});
