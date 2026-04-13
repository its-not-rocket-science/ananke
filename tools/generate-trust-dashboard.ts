#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DASHBOARD_PATH = path.join("docs", "trust-dashboard.md");
const DEFAULT_CI_OUTPUT_PATH = path.join("docs", "dashboard", "ci-trust-report.json");
const DEFAULT_COVERAGE_PATH = path.join("coverage", "coverage-summary.json");
const DEFAULT_DOC_REPORT_PATH = path.join("docs", "doc-consistency-report.json");

const COVERAGE_THRESHOLD = 85;
const DOCS_INCONSISTENCY_THRESHOLD = 0;
const DEFAULT_WASM_COVERAGE_THRESHOLD = 90;
const DEFAULT_FUZZ_THRESHOLD = 2000;

type Status = "verified" | "partially verified" | "unverified";

type Row = {
  area: string;
  status: Status;
  notes: string;
  evidence: string[];
};

function parseArgs(argv: string[]) {
  const args = new Set(argv);
  const readArg = (name: string, fallback: string): string => {
    const prefix = `--${name}=`;
    const found = argv.find((arg) => arg.startsWith(prefix));
    return found ? found.slice(prefix.length) : fallback;
  };

  return {
    write: args.has("--write"),
    check: args.has("--check"),
    failOnUnverified: args.has("--fail-on-unverified"),
    ciOutputPath: readArg("ci-output", DEFAULT_CI_OUTPUT_PATH),
    coveragePath: readArg("coverage", DEFAULT_COVERAGE_PATH),
    docReportPath: readArg("doc-report", DEFAULT_DOC_REPORT_PATH)
  };
}

function readJsonIfPresent<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function buildRows(paths: { ciOutputPath: string; coveragePath: string; docReportPath: string }): Row[] {
  const docReport = readJsonIfPresent<{ issueCount?: number }>(paths.docReportPath);
  const coverage = readJsonIfPresent<{ total?: { lines?: { pct?: number } } }>(paths.coveragePath);
  const ci = readJsonIfPresent<{
    determinism?: {
      ciMatrixPasses?: boolean;
      wasmCoverage?: { pct?: number; threshold?: number };
      fuzz?: { executions?: number; threshold?: number };
    };
  }>(paths.ciOutputPath);

  const rows: Row[] = [];

  if (!docReport) {
    rows.push({
      area: "docs coherence",
      status: "unverified",
      notes: "missing doc validation report",
      evidence: [`doc validation report: \`${paths.docReportPath}\` (missing)`]
    });
  } else {
    const issueCount = typeof docReport.issueCount === "number" ? docReport.issueCount : Number.NaN;
    const checksPass = Number.isFinite(issueCount) && issueCount === DOCS_INCONSISTENCY_THRESHOLD;
    rows.push({
      area: "docs coherence",
      status: checksPass ? "verified" : "unverified",
      notes: checksPass
        ? `semantic inconsistencies = ${issueCount}/${DOCS_INCONSISTENCY_THRESHOLD}`
        : `semantic inconsistencies = ${Number.isFinite(issueCount) ? issueCount : "unknown"}/${DOCS_INCONSISTENCY_THRESHOLD}`,
      evidence: [`doc validation report: \`${paths.docReportPath}\``]
    });
  }

  if (!coverage) {
    rows.push({
      area: "test coverage",
      status: "unverified",
      notes: "missing coverage summary",
      evidence: [`coverage summary: \`${paths.coveragePath}\` (missing)`]
    });
  } else {
    const linePct = coverage.total?.lines?.pct;
    if (typeof linePct !== "number" || !Number.isFinite(linePct)) {
      rows.push({
        area: "test coverage",
        status: "unverified",
        notes: "coverage summary present but lines.pct is invalid",
        evidence: [`coverage summary: \`${paths.coveragePath}\``]
      });
    } else {
      rows.push({
        area: "test coverage",
        status: linePct < COVERAGE_THRESHOLD ? "partially verified" : "verified",
        notes: `line coverage ${linePct.toFixed(2)}% (threshold ${COVERAGE_THRESHOLD}%)`,
        evidence: [`coverage summary: \`${paths.coveragePath}\``]
      });
    }
  }

  if (!ci?.determinism) {
    rows.push({
      area: "determinism",
      status: "unverified",
      notes: "missing CI determinism output",
      evidence: [`ci output: \`${paths.ciOutputPath}\` (missing determinism payload)`]
    });
  } else {
    const ciMatrixPasses = ci.determinism.ciMatrixPasses === true;
    const wasmCoverage = ci.determinism.wasmCoverage?.pct;
    const wasmThreshold = ci.determinism.wasmCoverage?.threshold ?? DEFAULT_WASM_COVERAGE_THRESHOLD;
    const fuzzExecutions = ci.determinism.fuzz?.executions;
    const fuzzThreshold = ci.determinism.fuzz?.threshold ?? DEFAULT_FUZZ_THRESHOLD;

    const hasWasmCoverage = typeof wasmCoverage === "number" && Number.isFinite(wasmCoverage);
    const hasFuzz = typeof fuzzExecutions === "number" && Number.isFinite(fuzzExecutions);

    if (!hasWasmCoverage || !hasFuzz) {
      rows.push({
        area: "determinism",
        status: "unverified",
        notes: "determinism output is incomplete",
        evidence: [`ci output: \`${paths.ciOutputPath}\``]
      });
    } else {
      const wasmMeetsThreshold = wasmCoverage >= wasmThreshold;
      const fuzzMeetsThreshold = fuzzExecutions >= fuzzThreshold;
      const allChecksPass = ciMatrixPasses && wasmMeetsThreshold && fuzzMeetsThreshold;
      const isCoverageOnlyFailure = ciMatrixPasses && !wasmMeetsThreshold && fuzzMeetsThreshold;

      rows.push({
        area: "determinism",
        status: allChecksPass ? "verified" : isCoverageOnlyFailure ? "partially verified" : "unverified",
        notes:
          `ci matrix passes=${ciMatrixPasses}; wasm coverage ${wasmCoverage.toFixed(2)}%/${wasmThreshold}%` +
          `; fuzz executions ${fuzzExecutions}/${fuzzThreshold}`,
        evidence: [`ci output: \`${paths.ciOutputPath}\``]
      });
    }
  }

  return rows;
}

function renderDashboard(rows: Row[], paths: { ciOutputPath: string; coveragePath: string; docReportPath: string }): string {
  const docReport = readJsonIfPresent<{ generatedAt?: string }>(paths.docReportPath);
  const coverage = readJsonIfPresent<{ generatedAt?: string }>(paths.coveragePath);
  const ci = readJsonIfPresent<{ generatedAt?: string }>(paths.ciOutputPath);
  const updatedAt = [docReport?.generatedAt, coverage?.generatedAt, ci?.generatedAt]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort()
    .at(-1) ?? "unknown";
  const tableRows = rows
    .map((row) => `| ${row.area} | ${row.status} | ${row.notes} | ${row.evidence.join("<br>")} |`)
    .join("\n");

  return `# Trust Dashboard\n\n> GENERATED FILE: produced by \`npm run generate-trust-dashboard\`.\n> Do not edit manually; update source artifacts and regenerate.\n\n_Last updated: ${updatedAt}_\n\n## Status rules (machine-derived)\n\n- **verified**: all required artifacts exist and all checks pass.\n- **partially verified**: required artifacts exist, checks are runnable, and coverage is below threshold.\n- **unverified**: one or more required artifacts are missing or required checks fail.\n\n## Thresholds\n\n- docs coherence: semantic inconsistencies must equal **${DOCS_INCONSISTENCY_THRESHOLD}**.\n- test coverage: line coverage must be **>= ${COVERAGE_THRESHOLD}%**.\n- determinism: CI matrix must pass, wasm coverage must meet threshold (default **${DEFAULT_WASM_COVERAGE_THRESHOLD}%** unless CI output overrides), and fuzz executions must meet threshold (default **${DEFAULT_FUZZ_THRESHOLD}** unless CI output overrides).\n\n## Inputs\n\n- CI outputs: \`${paths.ciOutputPath}\`\n- Test coverage: \`${paths.coveragePath}\`\n- Doc validation reports: \`${paths.docReportPath}\`\n\n## Status matrix\n\n| Area | Status | Computed summary | Evidence |
| --- | --- | --- | --- |
${tableRows}\n\n## CI stale-file rule\n\n- CI must run \`npm run check-trust-dashboard-artifacts\`.\n- The check re-renders \`${DASHBOARD_PATH}\` in-memory and fails if the committed file differs.\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = buildRows(args);
  const rendered = renderDashboard(rows, args);

  if (args.write) {
    writeFileSync(DASHBOARD_PATH, rendered, "utf8");
    console.log(`Wrote ${DASHBOARD_PATH}`);
  }

  if (args.failOnUnverified) {
    const unverified = rows.filter((row) => row.status === "unverified");
    if (unverified.length > 0) {
      console.error(`Trust dashboard contains unverified rows: ${unverified.map((row) => row.area).join(", ")}`);
      process.exit(1);
    }
  }

  if (args.check) {
    if (!existsSync(DASHBOARD_PATH)) {
      console.error(`${DASHBOARD_PATH} is missing. Run: npm run generate-trust-dashboard`);
      process.exit(1);
    }
    const existing = readFileSync(DASHBOARD_PATH, "utf8");
    if (existing !== rendered) {
      console.error(`${DASHBOARD_PATH} is stale or manually edited. Run: npm run generate-trust-dashboard`);
      process.exit(1);
    }
    console.log(`${DASHBOARD_PATH} is up to date.`);
  }

  if (!args.write && !args.check) {
    process.stdout.write(rendered);
  }
}

main();
