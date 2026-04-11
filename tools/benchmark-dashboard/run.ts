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

type BenchmarkConclusion =
  | "supported"
  | "unsupported"
  | "inconclusive_underpowered"
  | "inconclusive_sufficiently_powered";

interface PairwisePowerReport {
  candidateAdapterId: string;
  baselineAdapterId: string;
  testQueries: number;
  perDomainCounts: Record<string, number>;
  observedEffectSizePct: number;
  detectableEffectThresholdPct: number;
  meanDeltaPct: number;
  ci95LowPct: number;
  ci95HighPct: number;
  absoluteDeltaPct: number;
  adequacy: {
    uncertaintyCalibration: { adequate: boolean; minRequired: number; observed: number };
    pairedSignificanceTesting: { adequate: boolean; minRequired: number; observed: number };
    perDomainAnalysis: { adequate: boolean; minRequiredPerDomain: number; minObservedPerDomain: number; weakestDomains: string[] };
  };
  state: BenchmarkConclusion;
  rationale: string;
}

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

function sqrtSafe(v: number): number {
  return v > 0 ? Math.sqrt(v) : 0;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function sampleStd(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / (values.length - 1);
  return sqrtSafe(variance);
}

function buildPairwisePowerReport(measurements: ScenarioMeasurement[]): PairwisePowerReport {
  const candidateAdapterId = process.env.BENCHMARK_CANDIDATE_ADAPTER ?? "ananke";
  const baselineAdapterId = process.env.BENCHMARK_BASELINE_ADAPTER ?? "wasm";

  const byScenario = new Map<string, { candidate?: ScenarioMeasurement; baseline?: ScenarioMeasurement }>();
  for (const m of measurements) {
    const slot = byScenario.get(m.scenarioId) ?? {};
    if (m.adapterId === candidateAdapterId) slot.candidate = m;
    if (m.adapterId === baselineAdapterId) slot.baseline = m;
    byScenario.set(m.scenarioId, slot);
  }

  const deltasPct: number[] = [];
  const perDomainCounts = new Map<string, number>();
  for (const [scenarioId, pair] of byScenario.entries()) {
    if (!pair.candidate || !pair.baseline) continue;
    if (pair.baseline.ticksPerSec <= 0) continue;
    const deltaPct = ((pair.candidate.ticksPerSec - pair.baseline.ticksPerSec) / pair.baseline.ticksPerSec) * 100;
    deltasPct.push(deltaPct);

    const domain = scenarioId.split("-")[0] ?? "unknown";
    perDomainCounts.set(domain, (perDomainCounts.get(domain) ?? 0) + 1);
  }

  const n = deltasPct.length;
  const avg = mean(deltasPct);
  const sd = sampleStd(deltasPct, avg);
  const se = n > 0 ? sd / sqrtSafe(n) : 0;
  const z95 = 1.96;
  const ciLow = avg - z95 * se;
  const ciHigh = avg + z95 * se;

  // Simple two-sided 80% power approximation for paired normal deltas.
  // MDE ≈ (z_(alpha/2)+z_power) * sd/sqrt(n), with z_(alpha/2)=1.96, z_power≈0.84.
  const detectable = n > 0 ? (1.96 + 0.84) * se : Number.POSITIVE_INFINITY;

  const minQueriesForUncertainty = 20;
  const minPairsForSignificance = 12;
  const minPerDomain = 5;
  const minObservedPerDomain = perDomainCounts.size === 0
    ? 0
    : Math.min(...Array.from(perDomainCounts.values()));
  const weakestDomains = Array.from(perDomainCounts.entries())
    .filter(([, count]) => count === minObservedPerDomain)
    .map(([domain]) => domain)
    .sort();

  const uncertaintyAdequate = n >= minQueriesForUncertainty;
  const significanceAdequate = n >= minPairsForSignificance;
  const perDomainAdequate = perDomainCounts.size > 0 && minObservedPerDomain >= minPerDomain;
  const sufficientlyPowered = uncertaintyAdequate && significanceAdequate;

  const effectPositive = ciLow > 0;
  const effectNegative = ciHigh < 0;

  let state: BenchmarkConclusion;
  let rationale: string;
  if (effectPositive && sufficientlyPowered) {
    state = "supported";
    rationale = "Candidate outperforms baseline and the 95% interval stays above zero with adequate sample size.";
  } else if (effectNegative && sufficientlyPowered) {
    state = "unsupported";
    rationale = "Candidate underperforms baseline and the 95% interval stays below zero with adequate sample size.";
  } else if (!sufficientlyPowered) {
    state = "inconclusive_underpowered";
    rationale = "Observed sample size is below minimum thresholds for uncertainty and paired-testing confidence.";
  } else {
    state = "inconclusive_sufficiently_powered";
    rationale = "Sample size is adequate, but the 95% interval still overlaps zero so no clear advantage is supported.";
  }

  return {
    candidateAdapterId,
    baselineAdapterId,
    testQueries: n,
    perDomainCounts: Object.fromEntries(Array.from(perDomainCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]))),
    observedEffectSizePct: roundPct(Math.abs(avg)),
    detectableEffectThresholdPct: Number.isFinite(detectable) ? roundPct(Math.abs(detectable)) : 0,
    meanDeltaPct: roundPct(avg),
    ci95LowPct: roundPct(ciLow),
    ci95HighPct: roundPct(ciHigh),
    absoluteDeltaPct: roundPct(Math.abs(avg)),
    adequacy: {
      uncertaintyCalibration: { adequate: uncertaintyAdequate, minRequired: minQueriesForUncertainty, observed: n },
      pairedSignificanceTesting: { adequate: significanceAdequate, minRequired: minPairsForSignificance, observed: n },
      perDomainAnalysis: {
        adequate: perDomainAdequate,
        minRequiredPerDomain: minPerDomain,
        minObservedPerDomain,
        weakestDomains,
      },
    },
    state,
    rationale,
  };
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

  const powerReport = buildPairwisePowerReport(measurements);

  mkdirSync("benchmarks/results", { recursive: true });
  writeFileSync(buildOutputPath(generatedAt), JSON.stringify(payload, null, 2));
  writeFileSync("benchmarks/results/latest.json", JSON.stringify(payload, null, 2));
  writeFileSync("benchmarks/results/canonical-report.json", JSON.stringify({
    generatedAt,
    commit: payload.commit,
    branch: payload.branch,
    machine: payload.machine,
    pairwisePowerReport: powerReport,
  }, null, 2));

  console.log(`Wrote ${measurements.length} measurements.`);
  console.log(`Canonical benchmark state: ${powerReport.state}`);
}

void main();
