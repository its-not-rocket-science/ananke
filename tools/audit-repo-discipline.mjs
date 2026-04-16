#!/usr/bin/env node
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const dashboardDir = path.join(repoRoot, "docs", "dashboard");
const jsonOutputPath = path.join(dashboardDir, "repo-discipline-audit.json");
const markdownOutputPath = path.join(dashboardDir, "repo-discipline-audit.md");

const now = new Date();
const staleDaysDefault = 30;

const checks = [
  {
    key: "public-contract",
    label: "Public contract checks",
    command: "npm run check-public-contract",
    trustCritical: true,
    artifacts: [
      { path: "docs/public-contract.md", maxAgeDays: 90 },
      { path: "docs/stable-api-manifest.json", maxAgeDays: 90 },
      { path: "STABLE_API.md", maxAgeDays: 90 },
    ],
  },
  {
    key: "docs-semantic-consistency",
    label: "Docs semantic consistency",
    command: "npm run check-doc-semantic-consistency",
    trustCritical: true,
    artifacts: [{ path: "docs/doc-consistency-report.json", maxAgeDays: 30 }],
  },
  {
    key: "doc-examples",
    label: "Doc examples",
    command: "npm run check:doc-examples",
    trustCritical: true,
    artifacts: [],
  },
  {
    key: "doc-links-and-references",
    label: "Link/reference checks",
    command: "node dist/tools/check-doc-links-and-references.js",
    trustCritical: true,
    artifacts: [],
  },
  {
    key: "trust-dashboard-artifacts",
    label: "Trust dashboard artifact checks",
    command: "npm run check-trust-dashboard-artifacts",
    trustCritical: true,
    artifacts: [
      { path: "docs/trust-dashboard.md", maxAgeDays: 30 },
      { path: "docs/dashboard/ci-trust-report.json", maxAgeDays: 30 },
      { path: "docs/dashboard/verification-check-inventory.json", maxAgeDays: 30 },
    ],
  },
  {
    key: "release-check-quick",
    label: "Release-check quick mode",
    command: "npm run release-check:quick",
    trustCritical: true,
    artifacts: [
      { path: "docs/release-readiness-bundle.md", maxAgeDays: 30 },
      { path: "docs/releases/v1.0.0-beta.1-readiness-checklist.md", maxAgeDays: 365 },
    ],
  },
  {
    key: "determinism-artifact-validation",
    label: "Determinism artifact validation",
    command: "npm run check-determinism-release-artifacts",
    trustCritical: true,
    artifacts: [
      { path: "docs/dashboard/determinism-release-status.json", maxAgeDays: 30 },
      { path: "docs/dashboard/determinism-matrix-summary.json", maxAgeDays: 30 },
      { path: "docs/determinism-status.md", maxAgeDays: 30 },
    ],
  },
];

function ageDays(filePath) {
  const stats = statSync(path.join(repoRoot, filePath));
  return (now.getTime() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
}

function inspectArtifacts(artifacts) {
  const details = [];
  for (const artifact of artifacts) {
    const target = path.join(repoRoot, artifact.path);
    const maxAgeDays = artifact.maxAgeDays ?? staleDaysDefault;
    if (!existsSync(target)) {
      details.push({ path: artifact.path, status: "missing", maxAgeDays });
      continue;
    }

    const days = ageDays(artifact.path);
    details.push({
      path: artifact.path,
      status: days > maxAgeDays ? "stale" : "fresh",
      ageDays: Number(days.toFixed(2)),
      maxAgeDays,
      lastModified: new Date(statSync(target).mtimeMs).toISOString(),
    });
  }
  return details;
}

function runCheck(check) {
  const result = spawnSync(check.command, {
    cwd: repoRoot,
    shell: true,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  const artifacts = inspectArtifacts(check.artifacts);
  const artifactProblems = artifacts.filter((a) => a.status === "missing" || a.status === "stale");
  const commandPassed = result.status === 0;
  const verified = commandPassed && artifactProblems.length === 0;

  return {
    key: check.key,
    label: check.label,
    trustCritical: check.trustCritical,
    command: check.command,
    commandExitCode: result.status,
    commandPassed,
    artifacts,
    artifactProblems,
    verified,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# Repo Discipline Audit Summary");
  lines.push("");
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Final verdict: **${report.finalVerdict.toUpperCase()}**`);
  lines.push(`- Trust-critical verified: ${report.totals.verifiedTrustCritical}/${report.totals.totalTrustCritical}`);
  lines.push("");
  lines.push("## Area results");
  lines.push("");
  lines.push("| Area | Status | Command | Artifact issues |");
  lines.push("|---|---|---|---|");

  for (const item of report.results) {
    const status = item.verified ? "PASS" : "FAIL";
    const problems = item.artifactProblems.length
      ? item.artifactProblems.map((a) => `${a.status}: ${a.path}`).join("<br />")
      : "none";
    lines.push(`| ${item.label} | ${status} | \`${item.command}\` | ${problems} |`);
  }

  lines.push("");
  lines.push("## Artifact freshness and existence");
  lines.push("");

  for (const item of report.results) {
    if (item.artifacts.length === 0) continue;
    lines.push(`### ${item.label}`);
    for (const artifact of item.artifacts) {
      if (artifact.status === "fresh") {
        lines.push(
          `- ✅ ${artifact.path} (fresh, ${artifact.ageDays}d old, max ${artifact.maxAgeDays}d; modified ${artifact.lastModified})`,
        );
      } else if (artifact.status === "stale") {
        lines.push(`- ⚠️ ${artifact.path} (stale, ${artifact.ageDays}d old, max ${artifact.maxAgeDays}d)`);
      } else {
        lines.push(`- ❌ ${artifact.path} (missing)`);
      }
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

mkdirSync(dashboardDir, { recursive: true });

const results = checks.map(runCheck);
const failedTrustCritical = results.filter((r) => r.trustCritical && !r.verified);

const report = {
  schemaVersion: 1,
  generatedAt: now.toISOString(),
  finalVerdict: failedTrustCritical.length === 0 ? "pass" : "fail",
  totals: {
    totalAreas: results.length,
    verifiedAreas: results.filter((r) => r.verified).length,
    totalTrustCritical: results.filter((r) => r.trustCritical).length,
    verifiedTrustCritical: results.filter((r) => r.trustCritical && r.verified).length,
  },
  results,
};

writeFileSync(jsonOutputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(markdownOutputPath, toMarkdown(report), "utf8");

if (report.finalVerdict !== "pass") {
  console.error(`Repo discipline audit FAILED. See ${path.relative(repoRoot, jsonOutputPath)} and ${path.relative(repoRoot, markdownOutputPath)}.`);
  process.exit(1);
}

console.log(`Repo discipline audit PASSED. See ${path.relative(repoRoot, jsonOutputPath)} and ${path.relative(repoRoot, markdownOutputPath)}.`);
