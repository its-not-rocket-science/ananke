#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseArgs(argv) {
  const out = {
    summary: "determinism-report/determinism-summary.json",
    minFuzz: null,
    requireMatrix: true,
  };
  for (const arg of argv) {
    if (arg.startsWith("--summary=")) out.summary = arg.slice("--summary=".length);
    if (arg.startsWith("--min-fuzz=")) out.minFuzz = Number(arg.slice("--min-fuzz=".length));
    if (arg === "--allow-no-matrix") out.requireMatrix = false;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const summaryPath = resolve(args.summary);
if (!existsSync(summaryPath)) {
  console.error(`Missing determinism artifact: ${args.summary}`);
  process.exit(1);
}

const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
const errors = [];

const minFuzz = Number.isFinite(args.minFuzz)
  ? args.minFuzz
  : Number.isFinite(summary?.thresholds?.fuzzExecutionsMin)
    ? summary.thresholds.fuzzExecutionsMin
    : 2000;

if (summary?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
if ((summary?.status?.overall ?? "") !== "pass") errors.push("overall determinism status is not pass");
if (!Number.isFinite(summary?.fuzz?.executions) || summary.fuzz.executions < minFuzz) {
  errors.push(`fuzz executions ${summary?.fuzz?.executions ?? "unknown"} below threshold ${minFuzz}`);
}
if (summary?.fuzz?.meetsThreshold !== true) errors.push("fuzz threshold check failed");
if ((summary?.goldenFixtures?.status ?? "") !== "passed") errors.push("golden fixture suite did not pass");
if ((summary?.scenarioCorpus?.status ?? "") !== "passed") errors.push("scenario corpus suite did not pass");

if (args.requireMatrix) {
  const matrix = summary?.matrix;
  if (!matrix || !Array.isArray(matrix.records) || matrix.records.length === 0) {
    errors.push("matrix summary missing or empty");
  } else if (!matrix.records.every((record) => record?.overall === "pass")) {
    errors.push("one or more matrix entries are not pass");
  }
}

if (errors.length > 0) {
  console.error("Determinism artifact check failed:");
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log(`Determinism artifact check passed (${args.summary}).`);
