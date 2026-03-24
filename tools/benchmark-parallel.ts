/**
 * tools/benchmark-parallel.ts — CE-7: Parallel Partitioning Benchmark
 *
 * Measures the overhead and throughput of spatial partitioning versus
 * single-threaded stepWorld at 100, 500, and 1 000 entities.
 *
 * Note: This benchmark runs on a single thread to measure the pure partitioning
 * overhead (split + merge cost). Actual multi-threaded speedup requires spawning
 * Workers (Node.js worker_threads or browser Worker API); see the CE-7 docs in
 * ROADMAP.md for guidance on that integration.
 *
 * Usage:  node dist/tools/benchmark-parallel.js
 */

import { q, SCALE }                      from "../src/units.js";
import { mkWorld, mkHumanoidEntity }     from "../src/sim/testing.js";
import { stepWorld }                     from "../src/sim/kernel.js";
import {
  partitionWorld,
  mergePartitions,
  detectBoundaryPairs,
  assignEntitiesToPartitions,
  canonicaliseBoundaryPairs,
} from "../src/parallel.js";
import type { KernelContext }            from "../src/sim/context.js";
import type { WorldState }              from "../src/sim/world.js";
import type { CommandMap }              from "../src/sim/commands.js";
import type { Q }                       from "../src/units.js";

// ── Runtime helpers ───────────────────────────────────────────────────────────

declare const performance: { now(): number };
declare const process: {
  memoryUsage(): { heapUsed: number };
};

// ── Statistics ────────────────────────────────────────────────────────────────

function sorted(arr: number[]): number[] {
  return [...arr].sort((a, b) => a - b);
}
function median(arr: number[]): number {
  const s = sorted(arr);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
function pct(arr: number[], p: number): number {
  const s = sorted(arr);
  return s[Math.min(Math.floor(s.length * p / 100), s.length - 1)]!;
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtMs(ms: number): string { return ms.toFixed(3) + " ms"; }

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

// ── World builder ─────────────────────────────────────────────────────────────

function buildWorld(entityCount: number, seed: number): WorldState {
  const SPACING_m = 10_000; // 1 m in fixed-point
  const entities = Array.from({ length: entityCount }, (_, i) => {
    const teamId = i % 2 === 0 ? 1 : 2;
    const x = (i % 50) * SPACING_m;
    const y = Math.trunc(i / 50) * SPACING_m;
    return mkHumanoidEntity(i + 1, teamId, x, y);
  });
  return mkWorld(seed, entities);
}

const CTX: KernelContext = { tractionCoeff: q(0.75) as Q };
const EMPTY_CMDS: CommandMap = new Map();

function cloneWorld(w: WorldState): WorldState {
  return JSON.parse(JSON.stringify(w)) as WorldState;
}

// ── stepWorld helper (mutates a clone per tick) ────────────────────────────────

function stepOneTick(world: WorldState): WorldState {
  const copy = cloneWorld(world);
  stepWorld(copy, EMPTY_CMDS, CTX);
  return copy;
}

// ── stepPartitioned helper ────────────────────────────────────────────────────

/** Split → step each slice independently → merge. */
function stepPartitioned(world: WorldState, nPartitions: number): WorldState {
  const specs   = assignEntitiesToPartitions(world, nPartitions);
  const slices  = partitionWorld(world, specs);

  // Step each slice (mutates in place — slices are already copies from partitionWorld)
  for (const slice of slices) {
    stepWorld(slice, EMPTY_CMDS, CTX);
  }

  // Detect boundary pairs at 5 m range
  const bpairs = detectBoundaryPairs(slices, 50_000);
  const { world: merged } = mergePartitions(slices, bpairs);
  return merged;
}

// ── Per-scenario benchmark ────────────────────────────────────────────────────

interface BenchResult {
  label:         string;
  entityCount:   number;
  nPartitions:   number;
  stMedianMs:    number;
  ptMedianMs:    number;
  ptP99Ms:       number;
  overheadMs:    number;
  boundaryPairs: number;
}

function runScenario(
  entityCount: number,
  nPartitions: number,
  seed        = 1,
  ticks       = 20,
  warmup      = 5,
): BenchResult {
  const baseWorld = buildWorld(entityCount, seed);

  // ── Single-threaded baseline ──────────────────────────────────────────────
  const stTimes: number[] = [];
  let stWorld = cloneWorld(baseWorld);
  for (let t = 0; t < ticks + warmup; t++) {
    const t0 = performance.now();
    const next = cloneWorld(stWorld);
    stepWorld(next, EMPTY_CMDS, CTX);
    stWorld = next;
    const dt = performance.now() - t0;
    if (t >= warmup) stTimes.push(dt);
  }

  // ── Partitioned path ──────────────────────────────────────────────────────
  const ptTimes: number[] = [];
  let ptWorld = cloneWorld(baseWorld);
  let lastBpairs = 0;
  for (let t = 0; t < ticks + warmup; t++) {
    const t0 = performance.now();
    const next = stepPartitioned(ptWorld, nPartitions);
    ptWorld = next;
    // Sample boundary pairs from last tick
    if (t === ticks + warmup - 1) {
      const specs  = assignEntitiesToPartitions(ptWorld, nPartitions);
      const slices = partitionWorld(ptWorld, specs);
      lastBpairs   = detectBoundaryPairs(slices, 50_000).length;
    }
    const dt = performance.now() - t0;
    if (t >= warmup) ptTimes.push(dt);
  }

  const stMedian = median(stTimes);
  const ptMedian = median(ptTimes);

  return {
    label:         `${entityCount} entities × ${nPartitions} partitions`,
    entityCount,
    nPartitions,
    stMedianMs:    stMedian,
    ptMedianMs:    ptMedian,
    ptP99Ms:       pct(ptTimes, 99),
    overheadMs:    ptMedian - stMedian,
    boundaryPairs: lastBpairs,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function printHeader(): void {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║         CE-7 — Parallel Partitioning Benchmark                  ║");
  console.log("║  (single-thread overhead measurement — no actual Workers)       ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log();
}

function printTable(results: BenchResult[]): void {
  const COL = [28, 9, 9, 9, 12, 10];

  const hdr = [
    pad("Scenario", COL[0]!),
    pad("ST med", COL[1]!),
    pad("PT med", COL[2]!),
    pad("PT p99", COL[3]!),
    pad("overhead", COL[4]!),
    pad("bdy pairs", COL[5]!),
  ].join(" │ ");
  const sep = COL.map(c => "─".repeat(c)).join("─┼─");

  console.log(" " + hdr);
  console.log(" " + sep);

  for (const r of results) {
    const overSign = r.overheadMs >= 0 ? "+" : "";
    const row = [
      pad(r.label, COL[0]!),
      pad(fmtMs(r.stMedianMs), COL[1]!),
      pad(fmtMs(r.ptMedianMs), COL[2]!),
      pad(fmtMs(r.ptP99Ms), COL[3]!),
      pad(overSign + fmtMs(r.overheadMs), COL[4]!),
      pad(String(r.boundaryPairs), COL[5]!),
    ].join(" │ ");
    console.log(" " + row);
  }
  console.log();
}

function printPartitioningInfo(): void {
  const world = buildWorld(200, 1);
  const specs = assignEntitiesToPartitions(world, 4);
  console.log("── assignEntitiesToPartitions(200 entities, 4 partitions) ──");
  for (const s of specs) {
    const sample = s.entities.slice(0, 5).join(",");
    console.log(`  ${s.regionIds[0]}: ${s.entities.length} entities  ids=[${sample}…]`);
  }
  console.log();

  const slices = partitionWorld(world, specs);
  const bpairs = detectBoundaryPairs(slices, 50_000);
  const csorted = canonicaliseBoundaryPairs(bpairs);
  console.log(`  boundary pairs at 5 m range: ${csorted.length}`);
  if (csorted.length > 0) {
    console.log(`  first 5: ${csorted.slice(0, 5).map(([a, b]) => `(${a},${b})`).join("  ")}`);
  }
  console.log();
}

function printDeterminismNote(): void {
  console.log("── Determinism guarantee ──────────────────────────────────────────");
  console.log("  Each partition is independently deterministic (same seed + commands");
  console.log("  → identical output). Cross-partition boundary pairs are sorted in");
  console.log("  canonical order [min(a,b), max(a,b)] by canonicaliseBoundaryPairs().");
  console.log("  Apply boundary-pair resolution in this order in the coordinator");
  console.log("  thread to guarantee global determinism.");
  console.log();
  console.log("── WebWorker integration ──────────────────────────────────────────");
  console.log("  1. partitionWorld(world, specs)         → slices[]");
  console.log("  2. worker.postMessage(slices[i])        for each Worker i");
  console.log("  3. Worker: stepWorld(slice, cmds, ctx)  → mutates slice");
  console.log("  4. worker.onmessage: collect stepped slices[]");
  console.log("  5. detectBoundaryPairs(slices, range_m)");
  console.log("  6. mergePartitions(slices, bpairs)      → { world, sortedBoundaryPairs }");
  console.log("  7. Optional: run push/repulsion on sortedBoundaryPairs in host thread");
  console.log();
  console.log("  SharedArrayBuffer is NOT required — slices transfer via structured clone.");
  console.log("  COOP/COEP headers are therefore not needed for this API.");
}

printHeader();
printPartitioningInfo();

console.log("── Overhead benchmarks (20 ticks, warmup=5) ──────────────────────");
console.log();

const results: BenchResult[] = [
  runScenario(100,   2),
  runScenario(100,   4),
  runScenario(500,   2),
  runScenario(500,   4),
  runScenario(1_000, 4),
  runScenario(1_000, 8),
];

printTable(results);
printDeterminismNote();
