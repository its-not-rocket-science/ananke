import { describe, expect, test } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { loadWasmKernelFromDist, makeCommandSequence, makeRng, makeWorldFromSeed, parseCliSeed, tsShadowStep } from "./shared.js";
import { stepWorld } from "../../src/sim/kernel.js";
import { q } from "../../src/units.js";

interface GoldenRun {
  seed: number;
  entityCount: number;
  tickHashes: string[];
  finalHash: string;
}

interface GoldenFile {
  generatedAt: string;
  runs: GoldenRun[];
}

const GOLDEN_PATH = fileURLToPath(new URL("../../fixtures/determinism/golden-masters.json", import.meta.url));
const UPDATE = process.env.UPDATE_DETERMINISM_GOLDEN === "1";
const FIXED_SEED = parseCliSeed();

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function buildSeeds(): number[] {
  if (FIXED_SEED !== undefined) return [FIXED_SEED];
  const next = makeRng(1337);
  return Array.from({ length: 100 }, () => Math.floor(next() * 2_147_000_000));
}

function findFirstDivergence(a: string[], b: string[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return i;
  }
  return -1;
}

describe("cross-version determinism regression", () => {
  test("golden masters match current HEAD", async () => {
    const kernel = await loadWasmKernelFromDist();
    const seeds = buildSeeds();
    const runs: GoldenRun[] = [];

    for (const [seedIndex, seed] of seeds.entries()) {
      const entityCount = (seed % 256) + 1;
      const world = makeWorldFromSeed(seed, entityCount);
      const sequence = makeCommandSequence(seed, entityCount, 12);
      const tickHashes: string[] = [];

      for (const cmds of sequence) {
        stepWorld(world, cmds, { tractionCoeff: q(0.9) });
        const tickSnapshot = {
          world,
          ts: tsShadowStep(world),
          wasm: kernel.shadowStep(world, world.tick),
        };
        tickHashes.push(stableHash(tickSnapshot));
      }

      if (seedIndex % 5 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      runs.push({
        seed,
        entityCount,
        tickHashes,
        finalHash: stableHash(world),
      });
    }

    const nextGolden: GoldenFile = {
      generatedAt: new Date().toISOString(),
      runs,
    };

    if (UPDATE || !existsSync(GOLDEN_PATH)) {
      mkdirSync(fileURLToPath(new URL("../../fixtures/determinism", import.meta.url)), { recursive: true });
      writeFileSync(GOLDEN_PATH, JSON.stringify(nextGolden, null, 2));
    }

    const prevGolden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as GoldenFile;
    const expectedRuns = FIXED_SEED === undefined
      ? prevGolden.runs
      : (() => {
        const matched = prevGolden.runs.filter((run) => run.seed === FIXED_SEED);
        return matched.length > 0 ? matched : nextGolden.runs;
      })();

    expect(expectedRuns.length).toBe(nextGolden.runs.length);

    for (let i = 0; i < expectedRuns.length; i++) {
      const expected = expectedRuns[i]!;
      const actual = nextGolden.runs[i]!;

      if (expected.finalHash !== actual.finalHash || expected.tickHashes.join("|") !== actual.tickHashes.join("|")) {
        const tick = findFirstDivergence(expected.tickHashes, actual.tickHashes);
        throw new Error(
          `Determinism regression at seed=${expected.seed}, entityCount=${expected.entityCount}, ` +
          `firstDivergingTick=${tick >= 0 ? tick + 1 : "final"}`,
        );
      }
    }
  }, 180_000);
});
