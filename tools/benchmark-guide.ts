/**
 * tools/benchmark-guide.ts — PH-7: Benchmark Operational Guide
 *
 * Runs quick representative benchmarks across key entity counts and prints the
 * operational table for YOUR hardware.  Faster than the full benchmark (~30 s vs. ~2 min).
 *
 * Usage:  npm run benchmark:guide
 *         (requires `npm run build` first)
 */

import { q, SCALE }                    from "../src/units.js";
import { mkWorld, mkHumanoidEntity }   from "../src/sim/testing.js";
import { stepWorld }                   from "../src/sim/kernel.js";
import { buildWorldIndex }             from "../src/sim/indexing.js";
import { buildSpatialIndex }           from "../src/sim/spatial.js";
import { buildAICommands }             from "../src/sim/ai/system.js";
import { AI_PRESETS }                  from "../src/sim/ai/presets.js";
import { STARTER_WEAPONS, STARTER_ARMOUR } from "../src/equipment.js";
import type { KernelContext }          from "../src/sim/context.js";
import type { WorldState }             from "../src/sim/world.js";
import type { Entity }                 from "../src/sim/entity.js";
import type { Q }                      from "../src/units.js";

declare const performance: { now(): number };

// ── Statistics ──────────────────────────────────────────────────────────────

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

// ── Entity and world setup ──────────────────────────────────────────────────

const LONGSWORD = STARTER_WEAPONS[2]!;
const LEATHER   = STARTER_ARMOUR[0]!;

function mkMelee(id: number, teamId: number, x_Sm: number, y_Sm: number): Entity {
  const e = mkHumanoidEntity(id, teamId, x_Sm, y_Sm);
  e.loadout = { items: [LONGSWORD, LEATHER] };
  return e;
}

function makeTwoLineWorld(n: number): WorldState {
  const spacing = Math.round(2.0 * SCALE.m);
  const gap     = Math.round(10.0 * SCALE.m);
  const half    = Math.floor(n / 2);
  const entities: Entity[] = [];
  for (let i = 0; i < half; i++) {
    entities.push(mkMelee(i + 1, 1, Math.round((i - (half - 1) / 2) * spacing), 0));
  }
  const rem = n - half;
  for (let i = 0; i < rem; i++) {
    entities.push(mkMelee(half + i + 1, 2, Math.round((i - (rem - 1) / 2) * spacing), gap));
  }
  return mkWorld(1, entities);
}

// ── Benchmark loop ──────────────────────────────────────────────────────────

const POLICY    = AI_PRESETS["lineInfantry"]!;
const POLICY_FN = () => POLICY;

function runTicks(world: WorldState, ctx: KernelContext, nTicks: number): number[] {
  const times: number[] = [];
  for (let i = 0; i < nTicks; i++) {
    const t0  = performance.now();
    const idx = buildWorldIndex(world);
    const spt = buildSpatialIndex(world, 40_000);
    const cmd = buildAICommands(world, idx, spt, POLICY_FN);
    stepWorld(world, cmd, ctx);
    times.push(performance.now() - t0);
  }
  return times;
}

// ── Formatting ──────────────────────────────────────────────────────────────

function budgetStatus(medMs: number, p99Ms: number, budgetMs: number): string {
  if (medMs > budgetMs)                    return "❌";
  if (p99Ms > budgetMs * 1.10)             return "⚠️ ";
  return "✅";
}

function pct2(ms: number, budget: number): string {
  return Math.round((ms / budget) * 100) + "%";
}

function pad(s: string, n: number, right = false): string {
  return right ? s.padEnd(n) : s.padStart(n);
}

// ── Main ────────────────────────────────────────────────────────────────────

const HR  = "─".repeat(82);
const HR2 = "═".repeat(82);

console.log(HR2);
console.log(" ANANKE OPERATIONAL GUIDE — live measurement (npm run benchmark:guide)");
console.log(HR2);
console.log(`
This script measures median and p99 tick latency across key entity counts and
prints the operational table for YOUR hardware.

Reference numbers in docs/performance.md were measured on:
  Intel i7-12700 · Node.js 22 LTS · Windows 10 Pro
`);

const ctx: KernelContext = { tractionCoeff: q(0.75) as Q };

// Entity counts to probe
const PROBE_COUNTS = [10, 50, 100, 200, 500];
const WARMUP_TICKS = 30;
const MEASURE_TICKS = 100;

// Tick budget thresholds
const BUDGETS: { label: string; ms: number }[] = [
  { label: "20 Hz (50 ms)", ms: 50 },
  { label: "10 Hz (100 ms)", ms: 100 },
  { label: " 5 Hz (200 ms)", ms: 200 },
  { label: " 1 Hz (1000 ms)", ms: 1000 },
];

interface ProbeResult { n: number; medMs: number; p99Ms: number }
const results: ProbeResult[] = [];

for (const n of PROBE_COUNTS) {
  process.stdout.write(`  Probing ${String(n).padStart(4)} entities ...`);
  const world = makeTwoLineWorld(n);
  runTicks(world, ctx, WARMUP_TICKS);          // JIT warmup
  const times = runTicks(world, ctx, MEASURE_TICKS);
  const med   = median(times);
  const p99v  = pct(times, 99);
  results.push({ n, medMs: med, p99Ms: p99v });
  process.stdout.write(` med=${med.toFixed(1)} ms  p99=${p99v.toFixed(1)} ms\n`);
}

// ── Table 1: Entity cap by tick rate ────────────────────────────────────────

console.log("\n" + HR);
console.log(" TABLE 1 — Entity cap by tick rate  (✅ safe  ⚠️  occasional overrun  ❌ over budget)");
console.log(HR);

const colW = 16;
const header = "  Entities" +
  BUDGETS.map(b => pad(b.label, colW)).join("");
console.log(header);
console.log("  " + "─".repeat(9) + BUDGETS.map(() => "─".repeat(colW)).join(""));

for (const { n, medMs, p99Ms } of results) {
  let row = "  " + pad(String(n), 9);
  for (const { ms } of BUDGETS) {
    const status = budgetStatus(medMs, p99Ms, ms);
    const usage  = "(" + pct2(medMs, ms) + ")";
    row += pad(status + " " + usage, colW);
  }
  console.log(row);
}

// ── Table 2: Recommended tick rate by scenario class ────────────────────────

console.log("\n" + HR);
console.log(" TABLE 2 — Recommended tick rate by scenario class");
console.log(HR);

const scenarios = [
  { label: "1v1 / duel",              entities: "2–20",        hz: "20 Hz",   note: "< 1% budget" },
  { label: "Squad skirmish",           entities: "20–100",      hz: "20 Hz",   note: "< 10% budget" },
  { label: "Battle (real-time)",       entities: "100–500",     hz: "20 Hz",   note: "Enable AI staggering above 300" },
  { label: "Large battle / RTS",       entities: "500–1 000",   hz: "10 Hz",   note: "~65% budget at 1k" },
  { label: "Campaign / world-sim",     entities: "1 000–5 000", hz: "1 Hz",    note: "Plenty of headroom" },
  { label: "Downtime / recovery",      entities: "any",         hz: "0.01 Hz", note: "Sleep, aging, disease" },
];

console.log("  " + pad("Scenario", 30, true) + pad("Entities", 14, true) + pad("Tick rate", 12, true) + "  Note");
console.log("  " + "─".repeat(30) + "─".repeat(14) + "─".repeat(12) + "  " + "─".repeat(20));
for (const { label, entities, hz, note } of scenarios) {
  console.log("  " + pad(label, 30, true) + pad(entities, 14, true) + pad(hz, 12, true) + "  " + note);
}

// ── Table 3: Supported real-time envelope ───────────────────────────────────

console.log("\n" + HR);
console.log(" TABLE 3 — Supported real-time envelope at 20 Hz (50 ms budget) — THIS HARDWARE");
console.log(HR);

let safeMedian = 0;
let safeP99    = 0;
for (const { n, medMs, p99Ms } of results) {
  if (medMs <= 50) safeMedian = n;
  if (p99Ms <= 50) safeP99    = n;
}

console.log(`  Maximum entity count within median budget : ${safeMedian} entities`);
console.log(`  Maximum entity count within p99 budget   : ${safeP99} entities`);

for (const { n, medMs, p99Ms } of results) {
  const medPct = pct2(medMs, 50);
  const p99Pct = pct2(p99Ms, 50);
  console.log(`  ${String(n).padStart(4)} entities : median ${medMs.toFixed(1).padStart(6)} ms (${medPct.padStart(4)})  p99 ${p99Ms.toFixed(1).padStart(6)} ms (${p99Pct.padStart(4)})`);
}

// ── Spatial-index guidance ──────────────────────────────────────────────────

console.log("\n" + HR);
console.log(" SPATIAL-INDEX GUIDANCE");
console.log(HR);
console.log(`
  Dense formation (all entities within ~100 m):
    → Omit spatial index or use arena-size cells.
      Cell-map overhead cancels pair-count reduction in dense scenarios.

  Mixed melee + ranged (engagement range ≥ 10 m):
    → Use 4–10 m cell size.

  Sparse open-field (engagement range ≥ 30 m):
    → Use 30–50 m cell size; large benefit as most pairs never interact.

  Large-scale simulation (> 500 entities spread over km):
    → Use 50–200 m cell size; naïve O(n²) is prohibitive.
`);

// ── Subsystem toggle guidance ────────────────────────────────────────────────

console.log(HR);
console.log(" SUBSYSTEM FEATURE-TOGGLE GUIDANCE  (costs at 500 entities)");
console.log(HR);
console.log(`
  Disease spread (spreadDisease)  : O(n²) — call once/in-game-minute, NOT each tick
  Weather modifiers (ctx.weather) : ~2–5%  — omit when irrelevant
  Capability / magic auras        : 1–3%  — profile if many entities have active auras
  All other subsystems            : < 1% each — safe to enable freely

  Rule of thumb: the dominant cost is stepWorld kernel physics (> 95% of tick time).
  Removing subsystems rarely saves more than 5–10% at high entity counts.
`);

console.log(HR2);
console.log(" Run `npm run run:benchmark` for the full detailed benchmark report.");
console.log(HR2);
