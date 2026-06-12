import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  assertDeterminismOrThrow,
  hasBuiltWasmKernel,
  loadWasmKernelFromDist,
  makeCommandSequence,
  makeInitialState,
  runTraceWithTs,
  runTraceWithWasm,
} from "./shared.js";

const runSeed = Number(process.env.DETERMINISM_SEED ?? 1337);
// CI defaults: 200 runs × 250 commands. Override via env vars for stress runs:
//   DETERMINISM_WORLD_STATES=10000 DETERMINISM_COMMANDS_PER_STATE=1000 npm test
const worldRuns = Number(process.env.DETERMINISM_WORLD_STATES ?? 200);
const commandsPerState = Number(process.env.DETERMINISM_COMMANDS_PER_STATE ?? 250);

describe.skipIf(!hasBuiltWasmKernel())("determinism fuzzer against wasm", () => {
  it(
    "TS shadow backend and WASM backend are bit-identical for every tick",
    async () => {
      const kernel = await loadWasmKernelFromDist();
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            seed: fc.integer({ min: 1, max: 0x7fffffff }),
            entityCount: fc.integer({ min: 1, max: 256 }),
            commandScale: fc.integer({ min: 1, max: 4 }),
          }),
          async ({ seed, entityCount, commandScale }) => {
            const initial = makeInitialState(seed, entityCount);
            const commandCount = commandsPerState * commandScale;
            const cmds = makeCommandSequence(seed ^ runSeed, entityCount, commandCount);
            const tsTrace = runTraceWithTs(initial, cmds);
            const wasmTrace = runTraceWithWasm(initial, cmds, kernel);

            assertDeterminismOrThrow(tsTrace, wasmTrace, {
              runSeed,
              worldSeed: seed,
              entityCount,
              commandCount,
              label: "fuzz-against-wasm",
            });
            expect(true).toBe(true);
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
