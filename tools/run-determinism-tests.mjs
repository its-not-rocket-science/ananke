#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const raw = process.argv.slice(2);
const files = [];
const pass = [];
let seed;

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
      files.push(raw[i + 1]);
      i += 1;
    }
    continue;
  }
  if (a.endsWith(".ts") || a.endsWith(".js")) {
    files.push(a);
    continue;
  }
  // Jest compat: --runInBand → Vitest single-fork serial execution
  if (a === "--runInBand") {
    pass.push("--pool=forks", "--poolOptions.forks.singleFork=true");
    continue;
  }
  pass.push(a);
}

const env = { ...process.env };
if (seed !== undefined) env.DETERMINISM_SEED = seed;
// Determinism fuzzing can run long CPU-bound tasks; increase RPC timeout to avoid
// spurious "Timeout calling onTaskUpdate" worker errors on slower CI machines.
if (env.VITEST_RPC_TIMEOUT === undefined) env.VITEST_RPC_TIMEOUT = "300000";

const vitestArgs = ["vitest", "run", ...files, ...pass];
const result = spawnSync("npx", vitestArgs, {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});
if (result.status !== 0) process.exit(result.status ?? 1);
