import fs from "node:fs";
import path from "node:path";

import { diffApiSurface, readSurface, requiredBump, summarize } from "./api-policy.js";

type Semver = { major: number; minor: number; patch: number };

function parseSemver(version: string): Semver {
  const [core = ""] = version.split("-");
  const [major = Number.NaN, minor = Number.NaN, patch = Number.NaN] = core.split(".").map((part) => Number(part));
  if ([major, minor, patch].some((part) => Number.isNaN(part))) {
    throw new Error(`Invalid semver string: ${version}`);
  }
  return { major, minor, patch };
}

function classifyBump(base: Semver, head: Semver): "none" | "patch" | "minor" | "major" {
  if (head.major > base.major) return "major";
  if (head.major < base.major) return "none";
  if (head.minor > base.minor) return "minor";
  if (head.minor < base.minor) return "none";
  if (head.patch > base.patch) return "patch";
  return "none";
}

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [rawKey, rawValue] = arg.slice(2).split("=");
    if (!rawKey) continue;
    result[rawKey] = rawValue ?? "true";
  }
  return result;
}

function readVersion(filePath: string): string {
  const pkg = JSON.parse(fs.readFileSync(filePath, "utf8")) as { version: string };
  return pkg.version;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const baseSurface = readSurface(path.resolve(args.baseSurface ?? "api-surface-main.json"));
  const headSurface = readSurface(path.resolve(args.headSurface ?? "api-surface-pr.json"));

  const baseVersion = parseSemver(readVersion(path.resolve(args.basePackage ?? "package-main.json")));
  const headVersion = parseSemver(readVersion(path.resolve(args.headPackage ?? "package.json")));

  const changes = summarize(diffApiSurface(baseSurface, headSurface));
  const expected = requiredBump(changes);
  const actual = classifyBump(baseVersion, headVersion);

  console.log(`API changes: ${changes.length}`);
  console.log(`Required bump: ${expected}`);
  console.log(`Version bump: ${actual} (${baseVersion.major}.${baseVersion.minor}.${baseVersion.patch} -> ${headVersion.major}.${headVersion.minor}.${headVersion.patch})`);

  if (expected !== "none" && actual === "none") {
    console.error(`Version must be incremented by at least ${expected} when Tier 1 API changes are present.`);
    process.exit(1);
    return;
  }

  if (expected === "none") {
    console.log("No Tier 1 API changes detected; version bump is optional.");
    console.log("Semver policy check passed.");
    return;
  }

  const rank = { none: 0, patch: 1, minor: 2, major: 3 } as const;
  if (rank[actual] < rank[expected]) {
    console.error(`Semver mismatch: expected at least ${expected} bump for current Tier 1 API changes.`);
    process.exit(1);
  }

  if (expected === "patch" && actual !== "patch") {
    console.error(`Semver mismatch: patch-only changes require patch bump, got ${actual}.`);
    process.exit(1);
  }

  console.log("Semver policy check passed.");
}

main();
