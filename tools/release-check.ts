// tools/release-check.ts
// PM-4: Release Discipline Dashboard
//
// Pre-release gate runner.  Executes all release gates in sequence,
// produces docs/release-report.json (machine-readable) and
// docs/release-dashboard.md (human-readable audit trail).
//
// Usage:
//   npm run build && npm run release-check
//   npm run release-check -- --quick    (fast mode: reduced seeds, skip slow gates)
//   npm run release-check -- --write    (write docs/ files even if gates fail)
//
// Exit codes:
//   0 — all gates passed (or all failures are expected/known)
//   1 — one or more gates failed

import * as fs              from "node:fs";
import * as path            from "node:path";
import * as child_process   from "node:child_process";

const ROOT  = process.cwd();
const QUICK = process.argv.includes("--quick");

// ── Gate definitions ──────────────────────────────────────────────────────────

interface GateResult {
  id:        string;
  name:      string;
  status:    "pass" | "fail" | "warn";
  durationMs: number;
  summary:   string;
  detail:    string;
}

type Gate = {
  id:      string;
  name:    string;
  run():   GateResult;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function runCmd(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number; cwd?: string } = {},
): { exitCode: number; stdout: string; stderr: string; durationMs: number } {
  const start = Date.now();
  const result = child_process.spawnSync(cmd, args, {
    cwd:      opts.cwd ?? ROOT,
    encoding: "utf8",
    timeout:  opts.timeoutMs ?? 120_000,
    shell:    process.platform === "win32",
  });
  return {
    exitCode:   result.status ?? 1,
    stdout:     result.stdout ?? "",
    stderr:     result.stderr ?? "",
    durationMs: Date.now() - start,
  };
}

function pkgVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as { version: string };
  return pkg.version;
}

function readLineCoverageSummary(): { pct: number; covered: number; total: number } | null {
  const coveragePath = path.join(ROOT, "coverage", "coverage-summary.json");
  if (!fs.existsSync(coveragePath)) return null;
  const raw = JSON.parse(fs.readFileSync(coveragePath, "utf8")) as {
    total?: { lines?: { pct?: number; covered?: number; total?: number } };
  };
  const pct = raw.total?.lines?.pct;
  const covered = raw.total?.lines?.covered;
  const total = raw.total?.lines?.total;
  if (
    typeof pct !== "number" || !Number.isFinite(pct) ||
    typeof covered !== "number" || !Number.isFinite(covered) ||
    typeof total !== "number" || !Number.isFinite(total) || total <= 0
  ) {
    return null;
  }
  return { pct, covered, total };
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function fileAgeMs(filePath: string): number | null {
  if (!fs.existsSync(filePath)) return null;
  return Date.now() - fs.statSync(filePath).mtimeMs;
}

function ageSummary(ageMs: number): string {
  const hours = ageMs / (60 * 60 * 1000);
  if (hours < 24) return `${hours.toFixed(1)}h old`;
  return `${(hours / 24).toFixed(1)}d old`;
}

function readJsonFile<T>(relativePath: string): T | null {
  const absolute = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolute)) return null;
  return JSON.parse(fs.readFileSync(absolute, "utf8")) as T;
}

const RELEASE_FRESHNESS_MAX_AGE_MS = 48 * 60 * 60 * 1000;

// ── Gate 1: Schema migration tests ───────────────────────────────────────────

const GATE_SCHEMA: Gate = {
  id:   "schema",
  name: "Schema migration tests",
  run() {
    const start = Date.now();
    const r = runCmd("npx", [
      "vitest", "run",
      "test/schema-migration.test.ts",
      "test/anatomy_schema.test.ts",
      "--reporter=verbose",
    ], { timeoutMs: 60_000 });
    const passed  = r.exitCode === 0;
    const summary = passed
      ? "Schema migration tests passed"
      : "Schema migration tests failed";
    const counts  = (r.stdout + r.stderr).match(/(\d+) passed/)?.[0] ?? "";
    return {
      id: "schema", name: this.name,
      status: passed ? "pass" : "fail",
      durationMs: Date.now() - start,
      summary,
      detail: counts || (passed ? "All tests passed" : (r.stderr.slice(0, 400) || r.stdout.slice(0, 400))),
    };
  },
};

// ── Gate 2: Golden replay / fixture round-trip ────────────────────────────────

const GATE_FIXTURES: Gate = {
  id:   "fixtures",
  name: "Golden replay / fixture round-trip",
  run() {
    const start = Date.now();
    const fixturesDir = path.join(ROOT, "test", "fixtures");
    if (!fs.existsSync(fixturesDir) || fs.readdirSync(fixturesDir).length === 0) {
      return {
        id: "fixtures", name: this.name,
        status: "fail",
        durationMs: Date.now() - start,
        summary: "Fixture directory missing",
        detail: "test/fixtures/ does not exist or is empty. Run `npm run generate-fixtures` before release checks.",
      };
    }
    // Run any fixture-related tests
    const r = runCmd("npx", ["vitest", "run", "--reporter=verbose",
      "test/golden-fixtures.test.ts"], { timeoutMs: 60_000 });
    const passed = r.exitCode === 0;
    return {
      id: "fixtures", name: this.name,
      status: passed ? "pass" : "fail",
      durationMs: Date.now() - start,
      summary: passed ? "Fixture round-trips passed" : "Fixture tests failed",
      detail: (r.stdout + r.stderr).slice(0, 400),
    };
  },
};

// ── Gate 3: Bridge contract type-check ───────────────────────────────────────

const GATE_TYPECHECK: Gate = {
  id:   "typecheck",
  name: "Bridge contract type-check (tsc --noEmit)",
  run() {
    const start = Date.now();
    const r = runCmd("npx", ["tsc", "--noEmit", "-p", "tsconfig.build.json"],
      { timeoutMs: 60_000 });
    const passed = r.exitCode === 0;
    const errors = (r.stdout + r.stderr).match(/error TS\d+/g)?.length ?? 0;
    return {
      id: "typecheck", name: this.name,
      status: passed ? "pass" : "fail",
      durationMs: Date.now() - start,
      summary: passed ? "No TypeScript errors" : `${errors} TypeScript error(s) found`,
      detail: passed ? "Clean compile" : (r.stdout + r.stderr).slice(0, 600),
    };
  },
};

// ── Gate 3a: Coverage artifact contract ──────────────────────────────────────

const RELEASE_COVERAGE_THRESHOLD = 85;

const GATE_COVERAGE_ARTIFACT: Gate = {
  id: "coverage-artifact",
  name: "Coverage artifact contract (coverage/coverage-summary.json)",
  run() {
    const start = Date.now();
    const verify = runCmd("node", [
      "tools/check-coverage-summary.mjs",
      "--input=coverage/coverage-summary.json",
      "--markdown-out=docs/dashboard/coverage-status.md",
    ], { timeoutMs: 30_000 });
    if (verify.exitCode !== 0) {
      return {
        id: "coverage-artifact",
        name: this.name,
        status: "fail",
        durationMs: Date.now() - start,
        summary: "Coverage artifact generation/verification failed",
        detail: (verify.stdout + verify.stderr).trim().slice(0, 700),
      };
    }

    const summary = readLineCoverageSummary();
    if (!summary) {
      return {
        id: "coverage-artifact",
        name: this.name,
        status: "fail",
        durationMs: Date.now() - start,
        summary: "Coverage artifact missing or schema-invalid",
        detail: "Expected coverage/coverage-summary.json with numeric total.lines.{pct,covered,total}.",
      };
    }

    const meetsThreshold = summary.pct >= RELEASE_COVERAGE_THRESHOLD;
    return {
      id: "coverage-artifact",
      name: this.name,
      status: meetsThreshold ? "pass" : "fail",
      durationMs: Date.now() - start,
      summary: `Line coverage ${summary.pct.toFixed(2)}% (${summary.covered}/${summary.total}), threshold ${RELEASE_COVERAGE_THRESHOLD}%`,
      detail: "Source artifact: coverage/coverage-summary.json",
    };
  },
};

// ── Gate 3b: Determinism (WASM-dependent) evidence ──────────────────────────

const GATE_DETERMINISM: Gate = {
  id: "determinism-required",
  name: "Required determinism suites (WASM parity + corpus + regression)",
  run() {
    const start = Date.now();
    const reportPath = path.join(ROOT, "determinism-report", "results.release-check.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });

    const testRun = runCmd("node", [
      "tools/run-determinism-tests.mjs",
      "test/determinism/fuzz-against-wasm.spec.ts",
      "test/determinism/regression.spec.ts",
      "test/determinism/scenario-corpus.spec.ts",
      "--seed=1337",
      "--reporter=json",
      `--outputFile=${reportPath}`,
    ], { timeoutMs: 240_000 });
    if (testRun.exitCode !== 0) {
      return {
        id: this.id,
        name: this.name,
        status: "fail",
        durationMs: Date.now() - start,
        summary: "Determinism suite failed",
        detail: (testRun.stdout + testRun.stderr).trim().slice(0, 700),
      };
    }

    const verify = runCmd("node", [
      "tools/verify-required-vitest-suites.mjs",
      `--report=${reportPath}`,
      "--require=fuzz-against-wasm",
      "--require=regression",
      "--require=scenario-corpus",
    ], { timeoutMs: 30_000 });

    return {
      id: this.id,
      name: this.name,
      status: verify.exitCode === 0 ? "pass" : "fail",
      durationMs: Date.now() - start,
      summary: verify.exitCode === 0
        ? "Required determinism suites executed with no skips"
        : "Determinism suite verification failed",
      detail: (verify.stdout + verify.stderr).trim().slice(0, 700),
    };
  },
};

// ── Gate 3c: Determinism artifact readiness ─────────────────────────────────

const GATE_DETERMINISM_ARTIFACTS: Gate = {
  id:   "determinism-artifacts",
  name: "Determinism release artifacts",
  run() {
    const start = Date.now();
    const summaryPath = path.join(ROOT, "docs", "dashboard", "determinism-release-status.json");
    if (!fs.existsSync(summaryPath)) {
      return {
        id: "determinism-artifacts", name: this.name,
        status: "fail",
        durationMs: Date.now() - start,
        summary: "Missing determinism artifact summary",
        detail: "Expected docs/dashboard/determinism-release-status.json. Run release determinism artifact generation first.",
      };
    }

    const r = runCmd("node", [
      "tools/check-determinism-release-artifacts.mjs",
      "--summary=docs/dashboard/determinism-release-status.json",
    ], { timeoutMs: 30_000 });

    const passed = r.exitCode === 0;
    return {
      id: "determinism-artifacts", name: this.name,
      status: passed ? "pass" : "fail",
      durationMs: Date.now() - start,
      summary: passed ? "Determinism artifacts satisfy release thresholds" : "Determinism artifacts are missing or below threshold",
      detail: (r.stdout + r.stderr).trim().slice(0, 700),
    };
  },
};

// ── Gate 3f: Trust-critical evidence freshness ──────────────────────────────

const GATE_TRUST_EVIDENCE_FRESHNESS: Gate = {
  id: "trust-evidence-freshness",
  name: "Trust-critical evidence freshness & completeness",
  run() {
    const start = Date.now();
    const failures: string[] = [];
    const notes: string[] = [];

    const trustDashboardPath = path.join(ROOT, "docs", "trust-dashboard.md");
    if (!fs.existsSync(trustDashboardPath)) {
      failures.push("trust dashboard is missing");
    } else {
      const trustDashboard = fs.readFileSync(trustDashboardPath, "utf8");
      const unverifiedRows = [...trustDashboard.matchAll(/\|\s*[^|]+\|\s*unverified\s*\|/gi)].length;
      if (unverifiedRows > 0) {
        failures.push(`trust dashboard has ${unverifiedRows} unverified row(s)`);
      }

      const trustUpdatedMatch = /_Last updated:\s*([^_]+)_/.exec(trustDashboard);
      const trustUpdatedMs = parseTimestamp(trustUpdatedMatch?.[1]?.trim());
      const trustAgeMs = trustUpdatedMs === null ? fileAgeMs(trustDashboardPath) : Date.now() - trustUpdatedMs;
      if (trustAgeMs === null) {
        failures.push("trust dashboard freshness cannot be determined");
      } else {
        notes.push(`trust dashboard ${ageSummary(trustAgeMs)}`);
        if (trustAgeMs > RELEASE_FRESHNESS_MAX_AGE_MS) {
          failures.push(`trust dashboard is stale (${ageSummary(trustAgeMs)})`);
        }
      }
    }

    const determinismPath = "docs/dashboard/determinism-release-status.json";
    const determinism = readJsonFile<{ generatedAtUtc?: string }>(determinismPath);
    const determinismAgeMs =
      parseTimestamp(determinism?.generatedAtUtc) !== null
        ? Date.now() - (parseTimestamp(determinism?.generatedAtUtc) ?? 0)
        : fileAgeMs(path.join(ROOT, determinismPath));
    if (determinismAgeMs === null) {
      failures.push("determinism artifact is missing");
    } else {
      notes.push(`determinism artifact ${ageSummary(determinismAgeMs)}`);
      if (determinismAgeMs > RELEASE_FRESHNESS_MAX_AGE_MS) {
        failures.push(`determinism artifact is stale (${ageSummary(determinismAgeMs)})`);
      }
    }

    const docConsistencyPath = "docs/doc-consistency-report.json";
    const docConsistency = readJsonFile<{ generatedAt?: string }>(docConsistencyPath);
    const docAgeMs =
      parseTimestamp(docConsistency?.generatedAt) !== null
        ? Date.now() - (parseTimestamp(docConsistency?.generatedAt) ?? 0)
        : fileAgeMs(path.join(ROOT, docConsistencyPath));
    if (docAgeMs === null) {
      failures.push("doc-consistency report is missing");
    } else {
      notes.push(`doc-consistency report ${ageSummary(docAgeMs)}`);
      if (docAgeMs > RELEASE_FRESHNESS_MAX_AGE_MS) {
        failures.push(`doc-consistency report is stale (${ageSummary(docAgeMs)})`);
      }
    }

    const exportStatusPath = path.join(ROOT, "docs", "export-status-matrix.md");
    const exportAgeMs = fileAgeMs(exportStatusPath);
    if (exportAgeMs === null) {
      failures.push("export-status matrix is missing");
    } else {
      notes.push(`export-status matrix ${ageSummary(exportAgeMs)}`);
      if (exportAgeMs > RELEASE_FRESHNESS_MAX_AGE_MS) {
        failures.push(`export-status matrix is stale (${ageSummary(exportAgeMs)})`);
      }
    }

    const coveragePath = path.join(ROOT, "coverage", "coverage-summary.json");
    if (!fs.existsSync(coveragePath)) {
      failures.push("coverage summary is missing");
    }

    return {
      id: this.id,
      name: this.name,
      status: failures.length === 0 ? "pass" : "fail",
      durationMs: Date.now() - start,
      summary: failures.length === 0
        ? "All trust-critical evidence is fresh and complete"
        : `${failures.length} trust-critical release blocker(s)`,
      detail: failures.length === 0 ? notes.join("; ") : `${failures.join("; ")}${notes.length ? ` | ${notes.join("; ")}` : ""}`,
    };
  },
};

// ── Gate 3d: Example verification ────────────────────────────────────────────

const GATE_EXAMPLES: Gate = {
  id: "example-verification",
  name: "Required example verification suite",
  run() {
    const start = Date.now();
    const reportPath = path.join(ROOT, "determinism-report", "results.examples.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });

    const testRun = runCmd("npx", [
      "vitest",
      "run",
      "test/examples-integration.test.ts",
      "--reporter=json",
      `--outputFile=${reportPath}`,
    ], { timeoutMs: 120_000 });
    if (testRun.exitCode !== 0) {
      return {
        id: this.id,
        name: this.name,
        status: "fail",
        durationMs: Date.now() - start,
        summary: "Example verification failed",
        detail: (testRun.stdout + testRun.stderr).trim().slice(0, 700),
      };
    }

    const verify = runCmd("node", [
      "tools/verify-required-vitest-suites.mjs",
      `--report=${reportPath}`,
      "--require=examples-integration.test.ts",
    ], { timeoutMs: 30_000 });

    return {
      id: this.id,
      name: this.name,
      status: verify.exitCode === 0 ? "pass" : "fail",
      durationMs: Date.now() - start,
      summary: verify.exitCode === 0
        ? "Example verification suite executed with no skips"
        : "Example verification suite was skipped/missing",
      detail: (verify.stdout + verify.stderr).trim().slice(0, 700),
    };
  },
};

// ── Gate 3e: Protocol round-trip verification ───────────────────────────────

const GATE_PROTOCOL_ROUNDTRIP: Gate = {
  id: "protocol-roundtrip",
  name: "Required protocol round-trip suites",
  run() {
    const start = Date.now();
    const reportPath = path.join(ROOT, "determinism-report", "results.protocol-roundtrip.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });

    const testRun = runCmd("npx", [
      "vitest",
      "run",
      "test/protocol-formats-roundtrip.test.ts",
      "test/serialization/roundtrip.spec.ts",
      "--reporter=json",
      `--outputFile=${reportPath}`,
    ], { timeoutMs: 120_000 });
    if (testRun.exitCode !== 0) {
      return {
        id: this.id,
        name: this.name,
        status: "fail",
        durationMs: Date.now() - start,
        summary: "Protocol round-trip verification failed",
        detail: (testRun.stdout + testRun.stderr).trim().slice(0, 700),
      };
    }

    const verify = runCmd("node", [
      "tools/verify-required-vitest-suites.mjs",
      `--report=${reportPath}`,
      "--require=protocol-formats-roundtrip.test.ts",
      "--require=serialization/roundtrip.spec.ts",
    ], { timeoutMs: 30_000 });

    return {
      id: this.id,
      name: this.name,
      status: verify.exitCode === 0 ? "pass" : "fail",
      durationMs: Date.now() - start,
      summary: verify.exitCode === 0
        ? "Protocol round-trip suites executed with no skips"
        : "Protocol round-trip suites were skipped/missing",
      detail: (verify.stdout + verify.stderr).trim().slice(0, 700),
    };
  },
};

// ── Gate 4: Benchmark regression ─────────────────────────────────────────────

const GATE_BENCHMARK: Gate = {
  id:   "benchmark",
  name: "Benchmark regression check",
  run() {
    if (QUICK) {
      return {
        id: "benchmark", name: this.name,
        status: "warn",
        durationMs: 0,
        summary: "Not run in --quick mode",
        detail: "Run without --quick to include benchmark regression.",
      };
    }
    const start = Date.now();
    const r = runCmd("node", ["dist/tools/benchmark-check.js"], { timeoutMs: 120_000 });
    const passed = r.exitCode === 0;
    // Extract scenario lines from output
    const lines = (r.stdout + r.stderr).split("\n").filter(l =>
      l.includes("✓") || l.includes("✗") || l.includes("PASS") || l.includes("FAIL")
    ).slice(0, 6).join("; ");
    return {
      id: "benchmark", name: this.name,
      status: passed ? "pass" : "fail",
      durationMs: Date.now() - start,
      summary: passed ? "All scenarios within threshold" : "Benchmark regression detected",
      detail: lines || (r.stdout.slice(0, 400)),
    };
  },
};

// ── Gate 5: Emergent validation ───────────────────────────────────────────────

const GATE_EMERGENT: Gate = {
  id:   "emergent",
  name: "Emergent behaviour validation",
  run() {
    if (QUICK) {
      return {
        id: "emergent", name: this.name,
        status: "warn",
        durationMs: 0,
        summary: "Not run in --quick mode",
        detail: "Run without --quick to include emergent validation (100 seeds).",
      };
    }
    const start = Date.now();
    const r = runCmd("node", ["dist/tools/emergent-validation.js"], { timeoutMs: 180_000 });
    const out = r.stdout + r.stderr;
    const isPass    = out.includes("PASS — All emergent");
    const isPartial = out.includes("PARTIAL PASS");
    const isFail    = out.includes("FAIL — Scenarios");
    const status: GateResult["status"] = isPass ? "pass" : isPartial ? "warn" : "fail";
    const matchLine = out.split("\n").find(l => l.includes("Verdict:"))?.trim() ?? "";
    const passLine  = out.split("\n").find(l => l.includes("scenarios validated"))?.trim() ?? "";
    return {
      id: "emergent", name: this.name,
      status,
      durationMs: Date.now() - start,
      summary: matchLine || (isFail ? "Emergent validation failed" : "Emergent validation passed"),
      detail: passLine || (isPass ? "4/4 scenarios validated" : out.slice(-400)),
    };
  },
};

// ── Gate 6: Module-index freshness ────────────────────────────────────────────

const GATE_MODULE_INDEX: Gate = {
  id:   "module-index",
  name: "Module-index freshness (idempotent diff)",
  run() {
    const start = Date.now();
    const indexPath = path.join(ROOT, "docs", "module-index.md");
    const existing  = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";

    // Re-generate into a temp buffer by running the tool with stdout capture
    const r = runCmd("node", ["dist/tools/generate-module-index.js"], { timeoutMs: 30_000 });
    if (r.exitCode !== 0) {
      return {
        id: "module-index", name: this.name,
        status: "fail",
        durationMs: Date.now() - start,
        summary: "generate-module-index failed",
        detail: (r.stderr + r.stdout).slice(0, 400),
      };
    }
    const regenerated = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";
    const changed = regenerated !== existing;

    // Restore original (we don't want to mutate docs/ as a side effect here)
    if (existing) fs.writeFileSync(indexPath, existing, "utf8");

    if (!changed) {
      return {
        id: "module-index", name: this.name,
        status: "pass",
        durationMs: Date.now() - start,
        summary: "Module index is up-to-date",
        detail: "Re-generated output matches committed docs/module-index.md",
      };
    }

    // Compute a rough diff summary
    const oldLines = existing.split("\n").length;
    const newLines = regenerated.split("\n").length;
    return {
      id: "module-index", name: this.name,
      status: "warn",
      durationMs: Date.now() - start,
      summary: "Module index is stale — run `npm run generate-module-index`",
      detail: `Committed: ${oldLines} lines. Re-generated: ${newLines} lines. Diff found.`,
    };
  },
};

// ── Run all gates ─────────────────────────────────────────────────────────────

const GATES: Gate[] = [
  GATE_SCHEMA,
  GATE_FIXTURES,
  GATE_TYPECHECK,
  GATE_COVERAGE_ARTIFACT,
  GATE_DETERMINISM,
  GATE_DETERMINISM_ARTIFACTS,
  GATE_TRUST_EVIDENCE_FRESHNESS,
  GATE_EXAMPLES,
  GATE_PROTOCOL_ROUNDTRIP,
  GATE_BENCHMARK,
  GATE_EMERGENT,
  GATE_MODULE_INDEX,
];

const statusIcon: Record<GateResult["status"], string> = {
  pass: "✅",
  fail: "❌",
  warn: "⚠️",
};

console.log(`\nAnanke — Release Discipline Dashboard  v${pkgVersion()}`);
console.log("═".repeat(65));
if (QUICK) console.log("  [quick mode — slow gates skipped]\n");
else console.log("");

const results: GateResult[] = [];

for (let i = 0; i < GATES.length; i++) {
  const gate = GATES[i]!;
  process.stdout.write(`  [${i + 1}/${GATES.length}] ${gate.name} … `);
  const result = gate.run();
  results.push(result);
  console.log(`${statusIcon[result.status]}  (${result.durationMs} ms)`);
  if (result.status !== "pass") {
    console.log(`          ${result.summary}`);
  }
}

// ── Summary table ─────────────────────────────────────────────────────────────

console.log("\n" + "─".repeat(65));
console.log("  Gate results:\n");
for (const r of results) {
  const pad = r.name.padEnd(44);
  console.log(`  ${statusIcon[r.status]}  ${pad} ${r.summary.slice(0, 40)}`);
}

const passed   = results.filter(r => r.status === "pass").length;
const failed   = results.filter(r => r.status === "fail").length;
const warned   = results.filter(r => r.status === "warn").length;
const releasable = failed === 0 && warned === 0;

console.log("\n" + "─".repeat(65));
console.log(`  Passed: ${passed}  Failed: ${failed}  Warned: ${warned}`);
console.log(`  Verdict: ${releasable ? "✅ RELEASABLE" : failed > 0 ? "❌ NOT RELEASABLE" : "⚠️  REVIEW WARNINGS"}`);
console.log("");

// ── Write docs/release-report.json ───────────────────────────────────────────

const report = {
  _generated:   new Date().toISOString(),
  version:      pkgVersion(),
  quick:        QUICK,
  releasable,
  summary:      { passed, failed, warned },
  gates:        results.map(r => ({
    id:         r.id,
    name:       r.name,
    status:     r.status,
    durationMs: r.durationMs,
    summary:    r.summary,
    detail:     r.detail,
  })),
};

const reportPath = path.join(ROOT, "docs", "release-report.json");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(`  Wrote docs/release-report.json`);

// ── Write docs/release-dashboard.md ──────────────────────────────────────────

function renderDashboard(r: typeof report): string {
  const date = r._generated.split("T")[0];
  const verdict = r.releasable
    ? "✅ RELEASABLE"
    : r.summary.failed > 0
    ? "❌ NOT RELEASABLE"
    : "⚠️  REVIEW WARNINGS";

  let md = `# Release Dashboard — v${r.version}\n\n`;
  md += `> Generated ${r._generated}${r.quick ? " (quick mode)" : ""}.\n`;
  md += `> Run \`npm run release-check\` to refresh.\n\n`;
  md += `## Verdict: ${verdict}\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Version | \`${r.version}\` |\n`;
  md += `| Date | ${date} |\n`;
  md += `| Gates passed | ${r.summary.passed} |\n`;
  md += `| Gates failed | ${r.summary.failed} |\n`;
  md += `| Gates warned | ${r.summary.warned} |\n`;
  md += `## Gate Results\n\n`;
  md += `| # | Gate | Status | Duration | Summary |\n`;
  md += `|---|------|--------|----------|---------|\n`;
  for (let i = 0; i < r.gates.length; i++) {
    const g = r.gates[i]!;
    const icon = statusIcon[g.status];
    md += `| ${i + 1} | ${g.name} | ${icon} ${g.status.toUpperCase()} | ${g.durationMs} ms | ${g.summary} |\n`;
  }
  md += `\n## Gate Details\n\n`;
  for (const g of r.gates) {
    const icon = statusIcon[g.status];
    md += `### ${icon} ${g.name}\n\n`;
    md += `**Status:** ${g.status.toUpperCase()}  **Duration:** ${g.durationMs} ms\n\n`;
    md += `${g.summary}\n\n`;
    if (g.detail && g.detail !== g.summary) {
      md += `\`\`\`\n${g.detail}\n\`\`\`\n\n`;
    }
  }
  md += `---\n\n`;
  md += `*To reach releasable state: fix all ❌ failures, then re-run \`npm run release-check\`.*\n`;
  return md;
}

const dashPath = path.join(ROOT, "docs", "release-dashboard.md");
fs.writeFileSync(dashPath, renderDashboard(report), "utf8");
console.log(`  Wrote docs/release-dashboard.md\n`);

// ── Write docs/release-readiness-bundle.* ───────────────────────────────────

type BundleEntry = {
  status: "pass" | "fail";
  stale: boolean;
  summary: string;
  source: string;
};

type BundleEntries = {
  trustDashboard: BundleEntry;
  determinismStatus: BundleEntry;
  docConsistencyReport: BundleEntry;
  publicContractStatus: BundleEntry;
  coverageStatus: BundleEntry;
};

function collectReadinessBundle(): { entries: BundleEntries; verdict: string } {
  const trustDashboardPath = path.join(ROOT, "docs", "trust-dashboard.md");
  const trustDashboardText = fs.existsSync(trustDashboardPath) ? fs.readFileSync(trustDashboardPath, "utf8") : "";
  const trustUpdated = parseTimestamp(/_Last updated:\s*([^_]+)_/.exec(trustDashboardText)?.[1]?.trim());
  const trustAgeMs = trustUpdated === null ? fileAgeMs(trustDashboardPath) : Date.now() - trustUpdated;
  const trustUnverified = [...trustDashboardText.matchAll(/\|\s*[^|]+\|\s*unverified\s*\|/gi)].length;
  const trustEntry: BundleEntry = {
    status: fs.existsSync(trustDashboardPath) && trustUnverified === 0 ? "pass" : "fail",
    stale: trustAgeMs === null || trustAgeMs > RELEASE_FRESHNESS_MAX_AGE_MS,
    summary: !fs.existsSync(trustDashboardPath)
      ? "missing trust dashboard"
      : trustUnverified > 0
      ? `${trustUnverified} unverified row(s)`
      : "no unverified rows",
    source: "docs/trust-dashboard.md",
  };

  const determinism = readJsonFile<{ generatedAtUtc?: string; status?: { overall?: string } }>(
    "docs/dashboard/determinism-release-status.json",
  );
  const determinismTs = parseTimestamp(determinism?.generatedAtUtc);
  const determinismEntry: BundleEntry = {
    status: determinism?.status?.overall === "pass" ? "pass" : "fail",
    stale: determinismTs === null || (Date.now() - determinismTs) > RELEASE_FRESHNESS_MAX_AGE_MS,
    summary: determinism?.status?.overall === "pass" ? "overall=pass" : "overall!=pass or missing",
    source: "docs/dashboard/determinism-release-status.json",
  };

  const docConsistency = readJsonFile<{ generatedAt?: string; issueCount?: number }>("docs/doc-consistency-report.json");
  const docTs = parseTimestamp(docConsistency?.generatedAt);
  const docIssues = typeof docConsistency?.issueCount === "number" ? docConsistency.issueCount : Number.NaN;
  const docEntry: BundleEntry = {
    status: Number.isFinite(docIssues) && docIssues === 0 ? "pass" : "fail",
    stale: docTs === null || (Date.now() - docTs) > RELEASE_FRESHNESS_MAX_AGE_MS,
    summary: Number.isFinite(docIssues) ? `issues=${docIssues}` : "missing issueCount",
    source: "docs/doc-consistency-report.json",
  };

  const publicContract = runCmd("node", ["dist/tools/check-public-contract.js"], { timeoutMs: 45_000 });
  const publicContractEntry: BundleEntry = {
    status: publicContract.exitCode === 0 ? "pass" : "fail",
    stale: false,
    summary: publicContract.exitCode === 0 ? "public contract check passed" : "public contract check failed",
    source: "dist/tools/check-public-contract.js",
  };

  const coverage = readLineCoverageSummary();
  const coverageEntry: BundleEntry = {
    status: coverage ? "pass" : "fail",
    stale: false,
    summary: coverage
      ? `line coverage ${coverage.pct.toFixed(2)}% (${coverage.covered}/${coverage.total})`
      : "coverage summary missing",
    source: "coverage/coverage-summary.json",
  };

  const entries: BundleEntries = {
    trustDashboard: trustEntry,
    determinismStatus: determinismEntry,
    docConsistencyReport: docEntry,
    publicContractStatus: publicContractEntry,
    coverageStatus: coverageEntry,
  };
  const blockers = Object.values(entries).filter((entry) => entry.status !== "pass" || entry.stale).length;
  const verdict = blockers === 0
    ? "RELEASE READY: all trust-critical evidence is green and fresh."
    : "RELEASE BLOCKED: trust-critical evidence is not fully green and fresh.";
  return { entries, verdict };
}

function renderBundleMarkdown(
  payload: { generatedAt: string; entries: BundleEntries; verdict: string },
): string {
  const row = (name: string, entry: BundleEntry): string =>
    `| ${name} | ${entry.status === "pass" ? "✅ pass" : "❌ fail"} | ${entry.stale ? "⚠️ yes" : "no"} | ${entry.summary} | \`${entry.source}\` |`;
  return `# Release Readiness Bundle

> Generated ${payload.generatedAt}.
> Source command: \`npm run release-check\`.

| Artifact | Status | Stale | Summary | Source |
|---|---|---|---|---|
${row("trust dashboard", payload.entries.trustDashboard)}
${row("determinism status", payload.entries.determinismStatus)}
${row("doc consistency report", payload.entries.docConsistencyReport)}
${row("public contract status", payload.entries.publicContractStatus)}
${row("coverage status", payload.entries.coverageStatus)}

Final verdict: **${payload.verdict}**
`;
}

const readiness = collectReadinessBundle();
const bundlePayload = {
  generatedAt: new Date().toISOString(),
  entries: readiness.entries,
  verdict: readiness.verdict,
};
const bundleJsonPath = path.join(ROOT, "docs", "release-readiness-bundle.json");
const bundleMdPath = path.join(ROOT, "docs", "release-readiness-bundle.md");
fs.writeFileSync(bundleJsonPath, `${JSON.stringify(bundlePayload, null, 2)}\n`, "utf8");
fs.writeFileSync(bundleMdPath, renderBundleMarkdown(bundlePayload), "utf8");
console.log("  Wrote docs/release-readiness-bundle.json");
console.log("  Wrote docs/release-readiness-bundle.md\n");

process.exit(releasable ? 0 : 1);
