import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { loadWasmKernelFromDist, makeCommandSequence, makeWorldFromSeed, parseCliSeed, tsShadowStep } from "./shared.js";
import { stepWorld } from "../../src/sim/kernel.js";
import { q } from "../../src/units.js";

const DIST_KERNEL = fileURLToPath(new URL("../../dist/src/wasm-kernel.js", import.meta.url));
const PUSH_WASM = fileURLToPath(new URL("../../dist/as/push.wasm", import.meta.url));
const INJURY_WASM = fileURLToPath(new URL("../../dist/as/injury.wasm", import.meta.url));
const WASM_READY = existsSync(DIST_KERNEL) && existsSync(PUSH_WASM) && existsSync(INJURY_WASM);

const FIXED_SEED = parseCliSeed();
const WORLD_STATES = Number(process.env.DETERMINISM_WORLD_STATES ?? (FIXED_SEED ? 1 : 2));
const COMMAND_SEQUENCES_PER_STATE = Number(process.env.DETERMINISM_COMMAND_SEQUENCES ?? 32);

describe.skipIf(!WASM_READY)("determinism fuzzer against wasm", () => {
  test("TS shadow backend and WASM backend are bit-identical for every tick", async () => {
    const kernel = await loadWasmKernelFromDist();
    const failingSeeds: number[] = [];

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seed: fc.integer({ min: 1, max: 2_147_000_000 }),
          entityCount: fc.integer({ min: 1, max: 256 }),
        }),
        async ({ seed, entityCount }) => {
          if (FIXED_SEED !== undefined && seed !== FIXED_SEED) return;

          const world = makeWorldFromSeed(seed, entityCount);
          const sequence = makeCommandSequence(seed, entityCount, COMMAND_SEQUENCES_PER_STATE);

          for (const cmds of sequence) {
            stepWorld(world, cmds, { tractionCoeff: q(0.9) });
            const tsReport = tsShadowStep(world);
            const wasmReport = kernel.shadowStep(world, world.tick);
            try {
              expect(wasmReport).toEqual(tsReport);
            } catch (error) {
              failingSeeds.push(seed);
              throw error;
            }
          }
        },
      ),
      {
        numRuns: FIXED_SEED !== undefined ? 1 : WORLD_STATES,
        seed: FIXED_SEED,
      },
    );

    const outDir = fileURLToPath(new URL("../../fixtures/determinism", import.meta.url));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(`${outDir}/fuzzer-last-run.json`, JSON.stringify({
      date: new Date().toISOString(),
      worldStatesChecked: FIXED_SEED !== undefined ? 1 : WORLD_STATES,
      commandSequencesPerState: COMMAND_SEQUENCES_PER_STATE,
      failures: failingSeeds,
    }, null, 2));
  }, 180_000);
});
