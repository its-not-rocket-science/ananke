import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = process.cwd();

function readText(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function extractLatestChangelogVersion(changelog: string): string | null {
  const match = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  return match?.[1] ?? null;
}

function extractDashboardVersion(dashboard: string): string | null {
  const match = dashboard.match(/^# Release Dashboard — v(\d+\.\d+\.\d+)/m);
  return match?.[1] ?? null;
}

function main(): void {
  const pkgJson = JSON.parse(readText("package.json")) as { version?: string };
  const pkgVersion = pkgJson.version ?? null;

  const changelog = readText("CHANGELOG.md");
  const dashboard = readText("docs/release-dashboard.md");

  const changelogVersion = extractLatestChangelogVersion(changelog);
  const dashboardVersion = extractDashboardVersion(dashboard);

  const entries: Array<{ source: string; version: string | null }> = [
    { source: "package.json", version: pkgVersion },
    { source: "CHANGELOG.md (latest)", version: changelogVersion },
    { source: "docs/release-dashboard.md", version: dashboardVersion },
  ];

  console.log("Release version alignment\n");
  for (const entry of entries) {
    console.log(`- ${entry.source.padEnd(30)} ${entry.version ?? "<missing>"}`);
  }

  const missing = entries.filter(e => !e.version);
  if (missing.length > 0) {
    console.error("\n❌ Missing version markers:");
    for (const m of missing) {
      console.error(`  - ${m.source}`);
    }
    process.exit(1);
  }

  const distinct = new Set(entries.map(e => e.version));
  if (distinct.size > 1) {
    console.error("\n❌ Version mismatch detected:");
    console.error(`  package.json             = ${pkgVersion}`);
    console.error(`  CHANGELOG.md (latest)   = ${changelogVersion}`);
    console.error(`  release-dashboard.md     = ${dashboardVersion}`);
    console.error("\nRun `npm run release-check:quick` and commit updated release docs.");
    process.exit(1);
  }

  console.log("\n✅ package.json, CHANGELOG.md, and release dashboard are aligned.");
}

main();
