#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const raw = process.argv.slice(2);
const defaultFiles = [];
const runFiles = [];
const pass = [];
let seed;
let runInBandRequested = false;

for (let i = 0; i < raw.length; i++) {
  const a = raw[i];
  if (a === "--seed") {
    seed = raw[i + 1];
    i += 1;
    continue;
  }
  if (a.startsWith("--seed=")) {
    seed = a.split("=")[1];
    continue;
  }
  if (a === "--run") {
    while (i + 1 < raw.length && !raw[i + 1].startsWith("--")) {
      runFiles.push(raw[i + 1]);
      i += 1;
    }
    continue;
  }
  if (a.endsWith(".ts") || a.endsWith(".js")) {
    defaultFiles.push(a);
    continue;
  }
  // Jest compat: --runInBand → Vitest single-worker serial execution
  if (a === "--runInBand") {
    runInBandRequested = true;
    continue;
  }
  pass.push(a);
}

let hasPoolSetting = pass.some((arg) => arg === "--pool" || arg.startsWith("--pool="));
const hasExplicitMaxWorkers = pass.some(
  (arg) => arg === "--maxWorkers" || arg.startsWith("--maxWorkers="),
);
if (runInBandRequested && !hasPoolSetting) {
  // Prefer threads for runInBand to avoid long-running fork RPC stalls on CI.
  pass.push("--pool=threads", "--poolOptions.threads.singleThread=true");
  hasPoolSetting = true;
}
if (!hasPoolSetting && !hasExplicitMaxWorkers) {
  // Determinism suites are CPU-heavy and occasionally trip Vitest's "tests are
  // still running while writing JSON report" issue in multi-worker mode on CI.
  // Force a single thread unless the caller has asked for a worker strategy.
  pass.push("--pool=threads", "--poolOptions.threads.singleThread=true");
}

const env = { ...process.env };
if (seed !== undefined) env.DETERMINISM_SEED = seed;
// Determinism fuzzing can run long CPU-bound tasks; increase RPC timeout to avoid
// spurious "Timeout calling onTaskUpdate" worker errors on slower CI machines.
if (env.VITEST_RPC_TIMEOUT === undefined) env.VITEST_RPC_TIMEOUT = "300000";

const files = runFiles.length > 0 ? runFiles : defaultFiles;
const vitestArgs = ["vitest", "run", ...new Set(files), ...pass];
const result = spawnSync("npx", vitestArgs, {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});
if (result.status !== 0) process.exit(result.status ?? 1);
