import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BaselineAdapter } from "./types.js";

const execFileAsync = promisify(execFile);
const DOTS_RUNNER = "benchmarks/adapters/vendor/unity-dots-runner.wasm";

export const unityDotsAdapter: BaselineAdapter = {
  id: "unity-dots",
  label: "Unity DOTS (C#/WASM minimal)",
  async run(scenario) {
    if (!existsSync(DOTS_RUNNER)) {
      return {
        tickMs: 0,
        ticksPerSec: 0,
        notes: "Unity DOTS WASM runner not present (expected benchmarks/adapters/vendor/unity-dots-runner.wasm).",
      };
    }

    const { stdout } = await execFileAsync("node", ["dist/tools/benchmark-dashboard/run-unity-wasm.js", scenario.id]);
    const parsed = JSON.parse(stdout) as { tickMs: number; notes?: string };
    return {
      tickMs: parsed.tickMs,
      ticksPerSec: parsed.tickMs > 0 ? 1000 / parsed.tickMs : 0,
      notes: parsed.notes ?? "Measured via Unity DOTS WASM minimal runner.",
    };
  },
};
