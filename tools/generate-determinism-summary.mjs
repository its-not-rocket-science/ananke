#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function parseArgs(argv) {
  const out = { input: undefined, output: undefined };
  for (const arg of argv) {
    if (arg.startsWith("--input=")) out.input = arg.slice("--input=".length);
    if (arg.startsWith("--output=")) out.output = arg.slice("--output=".length);
  }
  return out;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function toNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const { input, output } = parseArgs(process.argv.slice(2));
if (!input || !output) {
  console.error("usage: node tools/generate-determinism-summary.mjs --input=<vitest.json> --output=<summary.json>");
  process.exit(1);
}

const inputPath = resolve(input);
const outputPath = resolve(output);
const report = readJson(inputPath);

const summarySection = report?.testResults?.[0]?.assertionResults;
const passedAssertions = Array.isArray(summarySection)
  ? summarySection.filter((x) => x?.status === "passed").length
  : undefined;
const failedAssertions = Array.isArray(summarySection)
  ? summarySection.filter((x) => x?.status === "failed").length
  : undefined;

const summary = {
  schemaVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  source: {
    tool: "vitest-json",
    input: input,
  },
  git: {
    sha: process.env.GITHUB_SHA ?? null,
    ref: process.env.GITHUB_REF ?? null,
    runId: process.env.GITHUB_RUN_ID ?? null,
    runNumber: process.env.GITHUB_RUN_NUMBER ?? null,
  },
  determinismConfig: {
    seed: process.env.DETERMINISM_SEED ?? null,
    worldStates: process.env.DETERMINISM_WORLD_STATES ?? null,
    commandsPerState: process.env.DETERMINISM_COMMANDS_PER_STATE ?? null,
  },
  vitest: {
    success: Boolean(report?.success),
    numTotalTests: toNumber(report?.numTotalTests),
    numPassedTests: toNumber(report?.numPassedTests),
    numFailedTests: toNumber(report?.numFailedTests),
    numTotalTestSuites: toNumber(report?.numTotalTestSuites),
    numPassedTestSuites: toNumber(report?.numPassedTestSuites),
    numFailedTestSuites: toNumber(report?.numFailedTestSuites),
    assertionResults: {
      passed: passedAssertions ?? null,
      failed: failedAssertions ?? null,
    },
  },
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`wrote determinism summary: ${output}`);
