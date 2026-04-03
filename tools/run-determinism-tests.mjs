import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const seedIndex = args.indexOf("--seed");
let seed;
if (seedIndex >= 0 && seedIndex < args.length - 1) {
  seed = args[seedIndex + 1];
  args.splice(seedIndex, 2);
}

const env = { ...process.env };
if (seed !== undefined) env.DETERMINISM_SEED = seed;

const result = spawnSync("npx", ["vitest", "run", "test/determinism/", ...args], {
  stdio: "inherit",
  env,
});

process.exit(result.status ?? 1);
