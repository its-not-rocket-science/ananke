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
    return {
      ciMatrixPasses,
      matrix: {
        consistentAcrossMatrix: raw?.consistentAcrossMatrix === true,
        environmentsCompared: typeof raw?.environmentsCompared === "number" ? raw.environmentsCompared : records.length,
        baselineEnvironment: typeof raw?.baselineEnvironment === "string" ? raw.baselineEnvironment : null,
        records: records.map((record) => ({
          environment: record?.environment ?? null,
          status: record?.status?.overall ?? null,
          reason: record?.status?.reason ?? null
        }))
      }
    };
  }

  if (raw?.status && typeof raw.status.overall === "string") {
    return { ciMatrixPasses: raw.status.overall === "pass", matrix: null };
  }

  return null;
}

function main() {
  const argv = process.argv.slice(2);
  const outputPath = readArg(argv, "output", DEFAULT_OUTPUT);
  const detStatusPath = readArg(argv, "determinism-status", "");
  const requireDeterminismStatus = parseBool(readArg(argv, "require-determinism-status", ""), false);

  const detFromStatus = readDeterminismStatus(detStatusPath);
  if (requireDeterminismStatus && !detFromStatus) {
    throw new Error(
      `Determinism status is required but missing/invalid: ${detStatusPath || "<not provided>"}.`
    );
  }

  const ciMatrixPasses = detFromStatus?.ciMatrixPasses ?? parseBool(readArg(argv, "ci-matrix-passes", ""), false);
  const wasmThreshold = parseNum(readArg(argv, "wasm-threshold", ""), DEFAULT_WASM_THRESHOLD);
  const wasmPct = parseNum(readArg(argv, "wasm-pct", ""), 0);
  const fuzzThreshold = parseNum(readArg(argv, "fuzz-threshold", ""), DEFAULT_FUZZ_THRESHOLD);
  const fuzzExecutions = parseNum(readArg(argv, "fuzz-executions", ""), 0);

  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    determinism: {
      ciMatrixPasses,
      matrix: detFromStatus?.matrix ?? null,
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

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
