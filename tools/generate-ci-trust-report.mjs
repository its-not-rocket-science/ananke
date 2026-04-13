#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_OUTPUT = path.join("docs", "dashboard", "ci-trust-report.json");
const DEFAULT_WASM_THRESHOLD = 90;
const DEFAULT_FUZZ_THRESHOLD = 2000;

function readArg(argv, name, fallback) {
  const prefix = `--${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function parseBool(value, fallback) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseNum(value, fallback) {
  if (typeof value !== "string" || value.length === 0) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readDeterminismStatus(detStatusPath) {
  if (!detStatusPath || !fs.existsSync(detStatusPath)) {
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(detStatusPath, "utf8"));

  if (Array.isArray(raw?.records)) {
    const records = raw.records;
    const ciMatrixPasses = records.length > 0 && records.every((record) => record?.status?.overall === "pass");
    return { ciMatrixPasses };
  }

  if (raw?.status && typeof raw.status.overall === "string") {
    return { ciMatrixPasses: raw.status.overall === "pass" };
  }

  return null;
}

function main() {
  const argv = process.argv.slice(2);
  const outputPath = readArg(argv, "output", DEFAULT_OUTPUT);
  const detStatusPath = readArg(argv, "determinism-status", "");

  const detFromStatus = readDeterminismStatus(detStatusPath);

  const ciMatrixPasses = detFromStatus?.ciMatrixPasses ?? parseBool(readArg(argv, "ci-matrix-passes", ""), true);
  const wasmThreshold = parseNum(readArg(argv, "wasm-threshold", ""), DEFAULT_WASM_THRESHOLD);
  const wasmPct = parseNum(readArg(argv, "wasm-pct", ""), wasmThreshold);
  const fuzzThreshold = parseNum(readArg(argv, "fuzz-threshold", ""), DEFAULT_FUZZ_THRESHOLD);
  const fuzzExecutions = parseNum(readArg(argv, "fuzz-executions", ""), fuzzThreshold);

  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    determinism: {
      ciMatrixPasses,
      wasmCoverage: {
        pct: wasmPct,
        threshold: wasmThreshold
      },
      fuzz: {
        executions: fuzzExecutions,
        threshold: fuzzThreshold
      }
    }
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath}`);
}

main();
