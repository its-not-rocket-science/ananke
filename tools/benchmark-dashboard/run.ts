import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { scenarios } from "../../benchmarks/scenarios/index.js";
import { adapters } from "../../benchmarks/adapters/index.js";
import type { BenchmarkRun, ScenarioMeasurement } from "./types.js";

function gitOrUnknown(cmd: string): string {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim();
  } catch {
    return "unknown";
  }
}

function buildOutputPath(dateISO: string): string {
  const day = dateISO.slice(0, 10);
  return `benchmarks/results/baseline-${day}.json`;
}

async function main(): Promise<void> {
  const measurements: ScenarioMeasurement[] = [];

  for (const scenario of scenarios) {
    for (const adapter of adapters) {
      const result = await adapter.run(scenario);
      if (!result) continue;
      const measurement: ScenarioMeasurement = {
        scenarioId: scenario.id,
        scenarioLabel: scenario.label,
        adapterId: adapter.id,
        adapterLabel: adapter.label,
        tickMs: result.tickMs,
        ticksPerSec: result.ticksPerSec,
      };
      if (typeof result.heapDeltaMB === "number") measurement.heapDeltaMB = result.heapDeltaMB;
      if (typeof result.notes === "string") measurement.notes = result.notes;
      measurements.push(measurement);
    }
  }

  const generatedAt = new Date().toISOString();
  const payload: BenchmarkRun = {
    generatedAt,
    commit: process.env.GITHUB_SHA ?? gitOrUnknown("git rev-parse --short HEAD"),
    branch: process.env.GITHUB_REF_NAME ?? gitOrUnknown("git rev-parse --abbrev-ref HEAD"),
    machine: `${process.platform}-${process.arch}`,
    measurements,
  };

  mkdirSync("benchmarks/results", { recursive: true });
  writeFileSync(buildOutputPath(generatedAt), JSON.stringify(payload, null, 2));
  writeFileSync("benchmarks/results/latest.json", JSON.stringify(payload, null, 2));

  console.log(`Wrote ${measurements.length} measurements.`);
}

void main();
