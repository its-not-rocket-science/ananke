#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = process.cwd();
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
const canonicalVersion = packageJson.version;

if (typeof canonicalVersion !== "string" || canonicalVersion.trim() === "") {
  throw new Error("package.json version must be a non-empty string");
}

const mdFiles = execSync("git ls-files -z -- '*.md'", { cwd: repoRoot, encoding: "utf8" })
  .split("\0")
  .map((line) => line.trim())
  .filter(Boolean);

const ignoredFiles = new Set([
  "CHANGELOG.md",
  "ROADMAP.md",
  "docs/release-dashboard.md"
]);

const checks = [
  {
    id: "badge",
    regex: /img\.shields\.io\/badge\/ananke-([0-9]+\.[0-9]+\.[0-9]+)/gi,
    message: "Ananke badge version should match package.json or use a non-hardcoded label"
  },
  {
    id: "dependency-pin",
    regex: /"ananke"\s*:\s*"\^?([0-9]+\.[0-9]+\.[0-9]+)"/gi,
    message: "Ananke dependency example is stale"
  },
  {
    id: "table-version",
    regex: /\|\s*Ananke\s*\|\s*([0-9]+\.[0-9]+\.[0-9]+\+?)\s*\|/gi,
    message: "Ananke table version is stale"
  },
  {
    id: "current-version",
    regex: /project is currently (?:at|in)\s*`?([0-9]+\.[0-9]+\.[0-9x]+)`?/gi,
    message: "" // handled below
  },
  {
    id: "ananke-version-constraint",
    regex: /"anankeVersion"\s*:\s*"[~^<>=\s]*([0-9]+\.[0-9]+\.[0-9]+)"/gi,
    message: "anankeVersion constraint is stale"
  }
];

const failures = [];

for (const file of mdFiles) {
  if (ignoredFiles.has(file)) continue;
  const text = readFileSync(resolve(repoRoot, file), "utf8");
  const lines = text.split("\n");

  checks.forEach((check) => {
    lines.forEach((line, idx) => {
      check.regex.lastIndex = 0;
      let match;
      while ((match = check.regex.exec(line)) !== null) {
        const matchedVersion = match[1].replace(/x$/, "0").replace(/\+$/, "");
        if (matchedVersion !== canonicalVersion) {
          const message = check.id === "current-version"
            ? `Current-version statement is stale (found ${match[1]}, expected ${canonicalVersion})`
            : `${check.message} (found ${match[1]}, expected ${canonicalVersion})`;
          failures.push(`${file}:${idx + 1}: ${message}`);
        }
      }
    });
  });
}

if (failures.length > 0) {
  console.error("Documentation version sync check failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Doc version references are in sync with package.json (${canonicalVersion}).`);
