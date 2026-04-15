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
  status:    "pass" | "fail" | "skip" | "warn";
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
        status: "skip",
        durationMs: Date.now() - start,
        summary: "No fixtures directory — run `npm run generate-fixtures` to create",
        detail: "test/fixtures/ does not exist or is empty. Generate fixtures first.",
      };
    }
    // Run any fixture-related tests
    const r = runCmd("npx", ["vitest", "run", "--reporter=verbose",
      "--testPathPattern=fixtures"], { timeoutMs: 60_000 });
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
      status: meetsThreshold ? "pass" : "warn",
      durationMs: Date.now() - start,
      summary: `Line coverage ${summary.pct.toFixed(2)}% (${summary.covered}/${summary.total}), threshold ${RELEASE_COVERAGE_THRESHOLD}%`,
      detail: "Source artifact: coverage/coverage-summary.json",
    };
  },
};

// ── Gate 3b: Determinism artifact readiness ─────────────────────────────────

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

// ── Gate 4: Benchmark regression ─────────────────────────────────────────────

const GATE_BENCHMARK: Gate = {
  id:   "benchmark",
  name: "Benchmark regression check",
  run() {
    if (QUICK) {
      return {
        id: "benchmark", name: this.name,
        status: "skip",
        durationMs: 0,
        summary: "Skipped in --quick mode",
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
        status: "skip",
        durationMs: 0,
        summary: "Skipped in --quick mode",
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
  GATE_DETERMINISM_ARTIFACTS,
  GATE_BENCHMARK,
  GATE_EMERGENT,
  GATE_MODULE_INDEX,
];

const statusIcon: Record<GateResult["status"], string> = {
  pass: "✅",
  fail: "❌",
  skip: "⏭",
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
  if (result.status !== "pass" && result.status !== "skip") {
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
const skipped  = results.filter(r => r.status === "skip").length;
const releasable = failed === 0 && warned === 0;

console.log("\n" + "─".repeat(65));
console.log(`  Passed: ${passed}  Failed: ${failed}  Warned: ${warned}  Skipped: ${skipped}`);
console.log(`  Verdict: ${releasable ? "✅ RELEASABLE" : failed > 0 ? "❌ NOT RELEASABLE" : "⚠️  REVIEW WARNINGS"}`);
console.log("");

// ── Write docs/release-report.json ───────────────────────────────────────────

const report = {
  _generated:   new Date().toISOString(),
  version:      pkgVersion(),
  quick:        QUICK,
  releasable,
  summary:      { passed, failed, warned, skipped },
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
  md += `| Gates skipped | ${r.summary.skipped} |\n\n`;
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

process.exit(releasable ? 0 : 1);
