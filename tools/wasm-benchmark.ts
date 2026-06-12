import { mkdirSync, writeFileSync } from "node:fs";
import { initAnankeWasm } from "../src/wasm/bridge.js";
import { makeLineBattleWorld, runAnankeTick } from "../benchmarks/scenarios/common.js";
import { applyCommandBatch, createCommandBatch, fillMoveCommands } from "../benchmarks/optimizations/batch-command-processor.js";
import { createEntityPool, resetEntityPool } from "../benchmarks/optimizations/object-pool.js";
import { integratePositionsSIMD } from "../benchmarks/optimizations/simd-math.js";
import { createSpatialHashGrid, resolveProximityDamage } from "../benchmarks/optimizations/spatial-hash-grid.js";

interface Measure { backend: string; scenario: string; tickMs: number; ticksPerSec: number; notes?: string; }

function arg(name: string): string | undefined {
  const pfx = `--${name}=`;
  return process.argv.find((a) => a.startsWith(pfx))?.slice(pfx.length);
}

async function runTsTicks(entityCount: number, ticks: number): Promise<number> {
  const world = makeLineBattleWorld(entityCount / 2, entityCount / 2, { rangedRatio: 0.5 });
  const t0 = performance.now();
  for (let i = 0; i < ticks; i++) runAnankeTick(world);
  return (performance.now() - t0) / ticks;
}

async function runOptimizedTicks(entityCount: number, ticks: number): Promise<number> {
  const pool = createEntityPool(entityCount);
  resetEntityPool(pool, entityCount);
  const commands = createCommandBatch(entityCount);
  const grid = createSpatialHashGrid(36);

  for (let i = 0; i < entityCount; i++) {
    pool.posX[i] = (i % 200) * 4;
    pool.posY[i] = Math.trunc(i / 200) * 4;
  }

  const t0 = performance.now();
  for (let tick = 0; tick < ticks; tick++) {
    fillMoveCommands(commands, entityCount, 1 + (tick & 1));
    applyCommandBatch(pool, commands);
    integratePositionsSIMD(pool);
    resolveProximityDamage(pool, grid, 1.8);
  }

  return (performance.now() - t0) / ticks;
}

async function runWasmTicks(entityCount: number, ticks: number): Promise<{ tickMs: number; backend: string }> {
  const bridge = await initAnankeWasm();
  bridge.world_create(1337);
  const commands = new Int32Array(entityCount * 3);
  for (let i = 0; i < commands.length; i += 3) {
    commands[i] = (i / 3) % 256;
    commands[i + 1] = 1;
    commands[i + 2] = 0;
  }
  const t0 = performance.now();
  for (let i = 0; i < ticks; i++) bridge.world_step(commands);
  return { tickMs: (performance.now() - t0) / ticks, backend: bridge.backend };
}

async function main(): Promise<void> {
  const backend = arg("backend") ?? "both";
  const scenarioFilter = arg("scenario");
  const measures: Measure[] = [];

  const scenarios = [
    { name: "small", entities: 20, ticks: 1500, optimized: false },
    { name: "large", entities: 200, ticks: 400, optimized: false },
    { name: "epic-battle", entities: 10_000, ticks: 180, optimized: true },
  ].filter((scenario) => !scenarioFilter || scenarioFilter === scenario.name);

  for (const scenario of scenarios) {
    if (backend === "ts" || backend === "both") {
      const tickMs = scenario.optimized
        ? await runOptimizedTicks(scenario.entities, scenario.ticks)
        : await runTsTicks(scenario.entities, scenario.ticks);
      measures.push({
        backend: scenario.optimized ? "ts-optimized" : "ts",
        scenario: scenario.name,
        tickMs,
        ticksPerSec: 1000 / tickMs,
      });
    }
    if (!scenario.optimized && (backend === "wasm" || backend === "both")) {
      const wasm = await runWasmTicks(scenario.entities, scenario.ticks);
      measures.push({
        backend: "wasm",
        scenario: scenario.name,
        tickMs: wasm.tickMs,
        ticksPerSec: 1000 / wasm.tickMs,
        notes: `backend=${wasm.backend}`,
      });
    }
  }

  const grouped = new Map<string, Measure[]>();
  for (const m of measures) grouped.set(m.scenario, [...(grouped.get(m.scenario) ?? []), m]);

  for (const [name, rows] of grouped) {
    const printable = rows
      .map((row) => `${row.backend}=${row.ticksPerSec.toFixed(1)} tps (${row.tickMs.toFixed(3)} ms)`)
      .join(" ");
    console.log(`${name}: ${printable}`);
  }

  const day = new Date().toISOString().slice(0, 10);
  mkdirSync("benchmarks/results", { recursive: true });
  writeFileSync(`benchmarks/results/wasm-vs-ts-${day}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), measures }, null, 2));
}

void main();
