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

function toFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function collectSuites(report) {
  const suites = report?.testResults;
  if (!Array.isArray(suites)) return [];
  return suites.map((suite) => ({
    name: typeof suite?.name === "string" ? suite.name : null,
    status: typeof suite?.status === "string" ? suite.status : null,
    assertionsTotal: Array.isArray(suite?.assertionResults) ? suite.assertionResults.length : null,
    assertionsPassed: Array.isArray(suite?.assertionResults)
      ? suite.assertionResults.filter((x) => x?.status === "passed").length
      : null,
    assertionsFailed: Array.isArray(suite?.assertionResults)
      ? suite.assertionResults.filter((x) => x?.status === "failed").length
      : null,
  }));
}

const { input, output } = parseArgs(process.argv.slice(2));
if (!input || !output) {
  console.error("usage: node tools/generate-determinism-status.mjs --input=<vitest.json> --output=<status.json>");
  process.exit(1);
}

const inputPath = resolve(input);
const outputPath = resolve(output);
const report = readJson(inputPath);

const totalTests = toFiniteNumber(report?.numTotalTests) ?? 0;
const failedTests = toFiniteNumber(report?.numFailedTests) ?? 0;
const passedTests = toFiniteNumber(report?.numPassedTests) ?? 0;

const status = {
  schemaVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  status: {
    overall: report?.success ? "pass" : "fail",
    reason: report?.success ? "all_determinism_tests_passed" : "one_or_more_determinism_tests_failed",
  },
  source: {
    tool: "vitest-json",
    input,
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
    numTotalTests: totalTests,
    numPassedTests: passedTests,
    numFailedTests: failedTests,
    numTotalTestSuites: toFiniteNumber(report?.numTotalTestSuites) ?? 0,
    numPassedTestSuites: toFiniteNumber(report?.numPassedTestSuites) ?? 0,
    numFailedTestSuites: toFiniteNumber(report?.numFailedTestSuites) ?? 0,
    passRate: totalTests > 0 ? passedTests / totalTests : null,
  },
  suites: collectSuites(report),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(status, null, 2)}\n`);
console.log(`wrote determinism status: ${output}`);
