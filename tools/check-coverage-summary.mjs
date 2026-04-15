#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_INPUT = path.join("coverage", "coverage-summary.json");
const DEFAULT_MARKDOWN_OUTPUT = path.join("docs", "dashboard", "coverage-status.md");

function readArg(argv, name, fallback) {
  const prefix = `--${name}=`;
  const value = argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function readCoverageSummary(inputPath) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Coverage summary is missing: ${inputPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const total = raw?.total;
  const lines = total?.lines;

  const pct = lines?.pct;
  const covered = lines?.covered;
  const totalLines = lines?.total;

  if (!isFiniteNumber(pct)) {
    throw new Error(`Invalid schema: expected total.lines.pct number in ${inputPath}`);
  }

  if (!isFiniteNumber(covered)) {
    throw new Error(`Invalid schema: expected total.lines.covered number in ${inputPath}`);
  }

  if (!isFiniteNumber(totalLines) || totalLines <= 0) {
    throw new Error(`Invalid schema: expected total.lines.total > 0 number in ${inputPath}`);
  }

  return { raw, pct, covered, totalLines };
}

function writeMarkdown(outputPath, inputPath, summary) {
  const generatedAt = summary.raw?.generatedAt ?? new Date().toISOString();
  const md = `# Coverage Status

> Generated from \`${inputPath}\`.
> Do not edit manually; regenerate via \`npm run generate-coverage-status\`.

- Generated at: ${generatedAt}
- Line coverage: **${summary.pct.toFixed(2)}%**
- Covered lines: **${summary.covered} / ${summary.totalLines}**
`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${md}\n`, "utf8");
}

function main() {
  const argv = process.argv.slice(2);
  const inputPath = readArg(argv, "input", DEFAULT_INPUT);
  const markdownOutput = readArg(argv, "markdown-out", "");

  const summary = readCoverageSummary(inputPath);
  console.log(`Coverage summary verified: ${inputPath} (lines ${summary.pct.toFixed(2)}%, ${summary.covered}/${summary.totalLines})`);

  if (markdownOutput) {
    writeMarkdown(markdownOutput, inputPath, summary);
    console.log(`Wrote ${markdownOutput}`);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
