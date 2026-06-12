#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseArgs(argv) {
  const out = {
    report: "",
    require: [],
  };

  for (const arg of argv) {
    if (arg.startsWith("--report=")) out.report = arg.slice("--report=".length);
    if (arg.startsWith("--require=")) out.require.push(arg.slice("--require=".length).toLowerCase());
  }

  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.report) {
  console.error("Missing required argument: --report=<vitest-json-report>");
  process.exit(1);
}
if (args.require.length === 0) {
  console.error("At least one --require=<suite-name-substring> is required");
  process.exit(1);
}

const reportPath = resolve(args.report);
if (!existsSync(reportPath)) {
  console.error(`Vitest report not found: ${args.report}`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const suites = Array.isArray(report?.testResults) ? report.testResults : [];

const errors = [];
for (const required of args.require) {
  const matched = suites.filter((suite) => String(suite?.name ?? "").toLowerCase().includes(required));
  if (matched.length === 0) {
    errors.push(`required suite not found in report: ${required}`);
    continue;
  }

  const skipped = matched.filter((suite) => String(suite?.status ?? "").toLowerCase() === "skipped");
  if (skipped.length > 0) {
    errors.push(`required suite was skipped: ${required}`);
  }

  const failed = matched.filter((suite) => String(suite?.status ?? "").toLowerCase() !== "passed");
  if (failed.length > 0) {
    const statuses = failed.map((suite) => String(suite?.status ?? "unknown")).join(", ");
    errors.push(`required suite did not pass: ${required} (statuses: ${statuses})`);
  }
}

if (errors.length > 0) {
  console.error("Required vitest suites verification failed:");
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log(`Required vitest suites verified (${args.report}).`);
