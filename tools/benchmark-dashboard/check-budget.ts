import { readFileSync } from "node:fs";

interface BudgetEntry { minTicksPerSec?: number; maxHeapMB?: number; }

const budget = JSON.parse(readFileSync(".github/perf-budget.json", "utf8")) as Record<string, BudgetEntry>;
const latest = JSON.parse(readFileSync("benchmarks/results/latest.json", "utf8")) as {
  measurements: Array<{ scenarioId: string; adapterId: string; ticksPerSec: number; heapDeltaMB?: number }>;
};

const failures: string[] = [];
for (const [scenarioId, entry] of Object.entries(budget)) {
  const current = latest.measurements.find((m) => m.scenarioId === scenarioId && m.adapterId === "ananke");
  if (!current) continue;

  if (typeof entry.minTicksPerSec === "number" && current.ticksPerSec < entry.minTicksPerSec) {
    failures.push(`${scenarioId}: ticks/sec ${current.ticksPerSec.toFixed(1)} < budget ${entry.minTicksPerSec}`);
  }
  if (typeof entry.maxHeapMB === "number" && typeof current.heapDeltaMB === "number" && current.heapDeltaMB > entry.maxHeapMB) {
    failures.push(`${scenarioId}: heap ${current.heapDeltaMB.toFixed(1)}MB > budget ${entry.maxHeapMB}MB`);
  }
}

if (failures.length > 0) {
  console.error("Performance budget violations:\n" + failures.map((line) => `- ${line}`).join("\n"));
  process.exit(1);
}

console.log("Performance budget check passed.");
