import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const dashboardPath = path.join(repoRoot, "docs", "trust-dashboard.md");
const allowedStatuses = new Set(["verified", "partially verified", "unverified", "planned"]);
const allowedTypes = new Set(["test", "ci workflow", "example", "doc-example compile check", "fixture", "benchmark"]);

function parseTableRows(lines) {
  const rows = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "## Status matrix") {
      inTable = true;
      continue;
    }

    if (inTable && trimmed.startsWith("## ")) {
      break;
    }

    if (!inTable || !trimmed.startsWith("|")) {
      continue;
    }

    if (trimmed.includes("---")) {
      continue;
    }

    const cols = trimmed
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());

    if (cols.length === 3 && cols[0] !== "Area") {
      rows.push({ area: cols[0], status: cols[1], evidence: cols[2] });
    }
  }

  return rows;
}

function parseEvidenceCell(evidenceCell) {
  const rawEntries = evidenceCell.split("<br>").map((entry) => entry.trim()).filter(Boolean);
  const parsed = [];

  for (const entry of rawEntries) {
    const match = entry.match(/^([a-z\- ]+):\s*`([^`]+)`$/i);
    if (!match) {
      parsed.push({ error: `invalid evidence format: ${entry}` });
      continue;
    }

    parsed.push({
      type: match[1].toLowerCase(),
      relPath: match[2]
    });
  }

  return parsed;
}

function main() {
  if (!fs.existsSync(dashboardPath)) {
    console.error("Trust dashboard check failed: docs/trust-dashboard.md is missing.");
    process.exit(1);
  }

  const lines = fs.readFileSync(dashboardPath, "utf8").split(/\r?\n/);
  const rows = parseTableRows(lines);
  const errors = [];

  if (rows.length === 0) {
    errors.push("No rows found in '## Status matrix' table.");
  }

  for (const row of rows) {
    const status = row.status.toLowerCase();
    if (!allowedStatuses.has(status)) {
      errors.push(`${row.area}: status must be one of ${Array.from(allowedStatuses).join(", ")} (got '${row.status}')`);
    }

    const evidenceEntries = parseEvidenceCell(row.evidence);
    if (evidenceEntries.length === 0) {
      errors.push(`${row.area}: no evidence entries found`);
      continue;
    }

    for (const entry of evidenceEntries) {
      if (entry.error) {
        errors.push(`${row.area}: ${entry.error}`);
        continue;
      }

      if (!allowedTypes.has(entry.type)) {
        errors.push(`${row.area}: unsupported artifact type '${entry.type}'`);
      }

      const fullPath = path.join(repoRoot, entry.relPath);
      if (!fs.existsSync(fullPath)) {
        errors.push(`${row.area}: missing referenced artifact '${entry.relPath}'`);
      }
    }
  }

  if (errors.length > 0) {
    console.error("Trust dashboard artifact check failed:");
    for (const error of errors) {
      console.error(` - ${error}`);
    }
    process.exit(1);
  }

  console.log(`Trust dashboard artifact check passed (${rows.length} rows).`);
}

main();
