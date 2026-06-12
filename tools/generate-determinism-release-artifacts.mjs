#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { platform } from "node:os";

function parseArgs(argv) {
  const out = {
    input: "determinism-report/results.json",
    summary: "determinism-report/determinism-summary.json",
    matrix: "determinism-report/matrix-summary.json",
    doc: "docs/determinism-status.md",
    matrixDir: "",
    seed: process.env.DETERMINISM_SEED ?? "1337",
    fuzzThreshold: process.env.DETERMINISM_MIN_EXECUTIONS ?? "2000",
    worldStates: process.env.DETERMINISM_WORLD_STATES ?? "",
    commandsPerState: process.env.DETERMINISM_COMMANDS_PER_STATE ?? "",
  };

  for (const arg of argv) {
    if (arg.startsWith("--input=")) out.input = arg.slice("--input=".length);
    if (arg.startsWith("--summary=")) out.summary = arg.slice("--summary=".length);
    if (arg.startsWith("--matrix=")) out.matrix = arg.slice("--matrix=".length);
    if (arg.startsWith("--doc=")) out.doc = arg.slice("--doc=".length);
    if (arg.startsWith("--matrix-dir=")) out.matrixDir = arg.slice("--matrix-dir=".length);
    if (arg.startsWith("--seed=")) out.seed = arg.slice("--seed=".length);
    if (arg.startsWith("--fuzz-threshold=")) out.fuzzThreshold = arg.slice("--fuzz-threshold=".length);
    if (arg.startsWith("--world-states=")) out.worldStates = arg.slice("--world-states=".length);
    if (arg.startsWith("--commands-per-state=")) out.commandsPerState = arg.slice("--commands-per-state=".length);
  }

  return out;
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function loadJson(file) {
  return JSON.parse(readFileSync(resolve(file), "utf8"));
}

function summarizeSuites(report) {
  const suites = Array.isArray(report?.testResults) ? report.testResults : [];
  const mapped = suites.map((suite) => {
    const assertionResults = Array.isArray(suite?.assertionResults) ? suite.assertionResults : [];
    const passed = assertionResults.filter((a) => a?.status === "passed").length;
    const failed = assertionResults.filter((a) => a?.status === "failed").length;
    return {
      name: typeof suite?.name === "string" ? suite.name : "<unknown>",
      status: typeof suite?.status === "string" ? suite.status : "unknown",
      assertions: {
        total: assertionResults.length,
        passed,
        failed,
      },
    };
  });

  const findSuite = (matcher) => mapped.find((s) => matcher(s.name.toLowerCase()));
  const fuzzSuite = findSuite((name) => name.includes("fuzz-against-wasm"));
  const goldenSuite = findSuite((name) => name.includes("regression") || name.includes("golden"));
  const corpusSuite = findSuite((name) => name.includes("scenario-corpus"));

  return { suites: mapped, fuzzSuite, goldenSuite, corpusSuite };
}

function buildMatrixSummary(singleStatus, matrixDir) {
  if (matrixDir && existsSync(resolve(matrixDir))) {
    const entries = readdirSync(resolve(matrixDir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    const records = [];
    for (const entry of entries) {
      const statusPath = join(resolve(matrixDir), entry, "status.json");
      if (!existsSync(statusPath) || !statSync(statusPath).isFile()) continue;
      const raw = JSON.parse(readFileSync(statusPath, "utf8"));
      records.push({
        environment: entry.replace(/^determinism-status-/, ""),
        overall: raw?.status?.overall ?? "unknown",
        reason: raw?.status?.reason ?? "unknown",
      });
    }

    return {
      environmentsCompared: records.length,
      consistentAcrossMatrix: records.length > 0 && records.every((r) => r.overall === records[0].overall),
      records,
    };
  }

  return {
    environmentsCompared: 1,
    consistentAcrossMatrix: true,
    records: [singleStatus],
  };
}

function renderDoc(summary) {
  const fuzz = summary.fuzz;
  const golden = summary.goldenFixtures;
  const corpus = summary.scenarioCorpus;
  const matrix = summary.matrix;
  return `# Determinism Status\n\n` +
    `Generated: ${summary.generatedAtUtc}\n\n` +
    `- Overall: **${summary.status.overall.toUpperCase()}**\n` +
    `- Fuzz executions: **${fuzz.executions}** (threshold: ${fuzz.threshold})\n` +
    `- Golden fixtures: **${golden.status.toUpperCase()}** (${golden.passed}/${golden.total} passing)\n` +
    `- Scenario corpus: **${corpus.status.toUpperCase()}** (${corpus.passed}/${corpus.total} passing)\n` +
    `- Matrix environments: **${matrix.environmentsCompared}** (consistent: ${matrix.consistentAcrossMatrix})\n\n` +
    `## Per-platform matrix\n\n` +
    `| Environment | Status | Reason |\n| --- | --- | --- |\n` +
    `${matrix.records.map((r) => `| ${r.environment} | ${r.overall} | ${r.reason} |`).join("\n")}\n`;
}

const args = parseArgs(process.argv.slice(2));
const report = loadJson(args.input);
const worldStates = num(args.worldStates);
const commandsPerState = num(args.commandsPerState);
const computedExecutions = worldStates !== null && commandsPerState !== null ? worldStates * commandsPerState : null;
const { suites, fuzzSuite, goldenSuite, corpusSuite } = summarizeSuites(report);

const singleStatus = {
  environment: `${platform()}-node-${process.versions.node}`,
  overall: report?.success ? "pass" : "fail",
  reason: report?.success ? "all_determinism_tests_passed" : "determinism_test_failures",
};

const matrix = buildMatrixSummary(singleStatus, args.matrixDir);
const fuzzThreshold = num(args.fuzzThreshold) ?? 2000;
const fuzzExecutions = computedExecutions ?? (fuzzSuite?.assertions.total ?? 0);
const goldenTotal = goldenSuite?.assertions.total ?? 0;
const goldenPassed = goldenSuite?.assertions.passed ?? 0;
const corpusTotal = corpusSuite?.assertions.total ?? 0;
const corpusPassed = corpusSuite?.assertions.passed ?? 0;

const summary = {
  schemaVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  status: {
    overall: report?.success && matrix.records.every((r) => r.overall === "pass") ? "pass" : "fail",
    reason: report?.success ? "determinism_evidence_available" : "determinism_tests_failed",
  },
  source: {
    input: args.input,
    matrixDir: args.matrixDir || null,
  },
  thresholds: {
    fuzzExecutionsMin: fuzzThreshold,
  },
  fuzz: {
    seed: args.seed,
    worldStates,
    commandsPerState,
    executions: fuzzExecutions,
    threshold: fuzzThreshold,
    meetsThreshold: fuzzExecutions >= fuzzThreshold,
    suiteStatus: fuzzSuite?.status ?? "unknown",
  },
  goldenFixtures: {
    status: goldenSuite?.status ?? "unknown",
    total: goldenTotal,
    passed: goldenPassed,
    failed: Math.max(goldenTotal - goldenPassed, 0),
    suite: goldenSuite?.name ?? null,
  },
  scenarioCorpus: {
    status: corpusSuite?.status ?? "unknown",
    total: corpusTotal,
    passed: corpusPassed,
    failed: Math.max(corpusTotal - corpusPassed, 0),
    suite: corpusSuite?.name ?? null,
  },
  matrix,
  vitest: {
    success: Boolean(report?.success),
    numTotalTests: num(report?.numTotalTests) ?? 0,
    numPassedTests: num(report?.numPassedTests) ?? 0,
    numFailedTests: num(report?.numFailedTests) ?? 0,
    suites,
  },
};

mkdirSync(dirname(resolve(args.summary)), { recursive: true });
writeFileSync(resolve(args.summary), `${JSON.stringify(summary, null, 2)}\n`);
mkdirSync(dirname(resolve(args.matrix)), { recursive: true });
writeFileSync(resolve(args.matrix), `${JSON.stringify(summary.matrix, null, 2)}\n`);
mkdirSync(dirname(resolve(args.doc)), { recursive: true });
writeFileSync(resolve(args.doc), `${renderDoc(summary)}\n`);

console.log(`wrote ${args.summary}`);
console.log(`wrote ${args.matrix}`);
console.log(`wrote ${args.doc}`);
