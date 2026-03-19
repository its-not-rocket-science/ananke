// tools/benchmark-check.ts — Performance regression check
//
// Runs a lean benchmark over three canonical scenarios and compares each
// result against the stored baseline in benchmarks/baseline.json.
//
// Exit codes:
//   0 — all scenarios within threshold
//   1 — one or more scenarios regressed beyond threshold
//
// Usage:
//   node dist/tools/benchmark-check.js                    # default 50% CI threshold
//   node dist/tools/benchmark-check.js --threshold=0.10   # 10% for local same-hardware checks
//   node dist/tools/benchmark-check.js --update-baseline  # regenerate baseline.json
//
// The 50% default is intentional: GitHub Actions runners vary by ±30–50% run-to-run.
// Use --threshold=0.10 locally on the same machine for fine-grained detection.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { q, SCALE }                   from "../src/units.js";
import { mkWorld, mkHumanoidEntity }  from "../src/sim/testing.js";
import { stepWorld }                  from "../src/sim/kernel.js";
import { buildWorldIndex }            from "../src/sim/indexing.js";
import { buildSpatialIndex }          from "../src/sim/spatial.js";
import { buildAICommands }            from "../src/sim/ai/system.js";
import { AI_PRESETS }                 from "../src/sim/ai/presets.js";
import { STARTER_ARMOUR, STARTER_WEAPONS } from "../src/equipment.js";
import type { KernelContext }         from "../src/sim/context.js";
import type { WorldState }            from "../src/sim/world.js";
import type { Entity }                from "../src/sim/entity.js";
import type { Q }                     from "../src/units.js";

declare const performance:  { now(): number };
declare const process: {
  argv?: string[];
  memoryUsage(): { heapUsed: number; rss: number };
  exit(code: number): never;
};

// ── CLI args ─────────────────────────────────────────────────────────────────

const args            = typeof process !== "undefined" ? (process.argv ?? []) : [];
const UPDATE_BASELINE = args.includes("--update-baseline");
const thresholdArg    = args.find(a => a.startsWith("--threshold="));
const THRESHOLD       = thresholdArg ? parseFloat(thresholdArg.split("=")[1]!) : 0.50;

// ── Helpers ──────────────────────────────────────────────────────────────────

function sorted(arr: number[]): number[] { return [...arr].sort((a, b) => a - b); }
function median(arr: number[]): number {
  const s = sorted(arr);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const LONGSWORD = STARTER_WEAPONS.find(w => w.id === "wpn_longsword")!;
const LEATHER   = STARTER_ARMOUR.find(a => a.id === "arm_leather")!;
const POLICY    = AI_PRESETS["lineInfantry"]!;

function mkMelee(id: number, teamId: number, x: number, y: number): Entity {
  const e = mkHumanoidEntity(id, teamId, x, y);
  e.loadout = { items: [LONGSWORD, LEATHER] };
  return e;
}

function makeTwoLine(n: number, seed: number): WorldState {
  const spacing = Math.round(2.0 * SCALE.m);
  const gap     = Math.round(10.0 * SCALE.m);
  const half    = Math.floor(n / 2);
  const entities: Entity[] = [];
  for (let i = 0; i < half; i++)
    entities.push(mkMelee(i + 1, 1, Math.round((i - (half - 1) / 2) * spacing), 0));
  for (let i = 0; i < n - half; i++)
    entities.push(mkMelee(half + i + 1, 2, Math.round((i - (n - half - 1) / 2) * spacing), gap));
  return mkWorld(seed, entities);
}

function measure(world: WorldState, ctx: KernelContext, warmup: number, ticks: number): number {
  // warmup — JIT stabilisation
  for (let i = 0; i < warmup; i++) {
    const idx = buildWorldIndex(world);
    const spt = buildSpatialIndex(world, 40_000);
    const cmd = buildAICommands(world, idx, spt, () => POLICY);
    stepWorld(world, cmd, ctx);
  }
  const times: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const t0  = performance.now();
    const idx = buildWorldIndex(world);
    const spt = buildSpatialIndex(world, 40_000);
    const cmd = buildAICommands(world, idx, spt, () => POLICY);
    stepWorld(world, cmd, ctx);
    times.push(performance.now() - t0);
  }
  return median(times);
}

// ── Scenarios ────────────────────────────────────────────────────────────────

interface ScenarioSpec { id: string; label: string; n: number; warmup: number; ticks: number; }
interface ScenarioResult { id: string; label: string; n: number; medianMs: number; throughputTps: number; }

const SCENARIOS: ScenarioSpec[] = [
  { id: "melee-10",      label: "10 entities, melee skirmish",     n: 10,  warmup: 200, ticks: 1000 },
  { id: "mixed-100",     label: "100 entities, mixed ranged/melee", n: 100, warmup: 100, ticks: 500  },
  { id: "formation-500", label: "500 entities, formation combat",   n: 500, warmup: 30,  ticks: 100  },
];

const ctx: KernelContext = { tractionCoeff: q(0.75) as Q };

console.log("\nAnanke — benchmark regression check");
console.log(`Threshold: ${(THRESHOLD * 100).toFixed(0)}% degradation = fail\n`);

const results: ScenarioResult[] = SCENARIOS.map(s => {
  const world    = makeTwoLine(s.n, 1);
  const medianMs = measure(world, ctx, s.warmup, s.ticks);
  const tps      = medianMs > 0 ? Math.round(1000 / medianMs) : 0;
  console.log(`  ${s.label.padEnd(38)}  median=${medianMs.toFixed(2).padStart(7)} ms  tps=${String(tps).padStart(6)}`);
  return { id: s.id, label: s.label, n: s.n, medianMs, throughputTps: tps };
});

// ── Update baseline mode ──────────────────────────────────────────────────────

if (UPDATE_BASELINE) {
  mkdirSync("benchmarks", { recursive: true });
  const baseline = {
    generatedAt:  new Date().toISOString(),
    note: "Update with: npm run benchmark-check -- --update-baseline.  " +
          "CI uses --threshold=0.50; local fine-grained checks use --threshold=0.10.",
    scenarios:    results.map(r => ({ id: r.id, label: r.label, n: r.n,
      baselineMedianMs: r.medianMs, baselineThroughputTps: r.throughputTps })),
  };
  writeFileSync("benchmarks/baseline.json", JSON.stringify(baseline, null, 2));
  console.log("\n✓ benchmarks/baseline.json updated");
  process.exit(0);
}

// ── Compare against baseline ──────────────────────────────────────────────────

interface BaselineEntry { id: string; label: string; n: number; baselineMedianMs: number; baselineThroughputTps: number; }
interface Baseline { generatedAt: string; scenarios: BaselineEntry[]; }

let baseline: Baseline;
try {
  baseline = JSON.parse(readFileSync("benchmarks/baseline.json", "utf8")) as Baseline;
} catch {
  console.error("\n✗  benchmarks/baseline.json not found.  Run with --update-baseline first.");
  process.exit(1);
}

console.log(`\nComparing against baseline from ${baseline.generatedAt}\n`);

let failed = false;
for (const result of results) {
  const ref = baseline.scenarios.find(s => s.id === result.id);
  if (!ref) { console.log(`  ${result.id}: no baseline entry — skipping`); continue; }

  const ratio = result.medianMs / ref.baselineMedianMs;  // 1.0 = same; >1 = slower
  const status = ratio > (1 + THRESHOLD) ? "FAIL" : "PASS";
  const arrow  = ratio > 1 ? "↑" : "↓";
  console.log(
    `  [${status}] ${result.label.padEnd(38)}  ` +
    `${arrow}${((Math.abs(ratio - 1)) * 100).toFixed(1).padStart(5)}%  ` +
    `(baseline=${ref.baselineMedianMs.toFixed(2)}ms  current=${result.medianMs.toFixed(2)}ms)`
  );
  if (status === "FAIL") failed = true;
}

if (failed) {
  console.log(`\n✗  Regression detected.  Investigate or update baseline with --update-baseline.\n`);
  process.exit(1);
} else {
  console.log(`\n✓  All scenarios within ${(THRESHOLD * 100).toFixed(0)}% threshold.\n`);
  process.exit(0);
}
