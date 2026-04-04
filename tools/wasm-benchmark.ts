import { mkdirSync, writeFileSync } from "node:fs";
import { initAnankeWasm } from "../src/wasm/bridge.js";
import { makeLineBattleWorld, runAnankeTick } from "../benchmarks/scenarios/common.js";

interface Measure { backend: string; scenario: string; tickMs: number; ticksPerSec: number; }

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

async function runWasmTicks(entityCount: number, ticks: number): Promise<number> {
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
  return (performance.now() - t0) / ticks;
}

async function main(): Promise<void> {
  const backend = arg("backend") ?? "both";
  const measures: Measure[] = [];

  const scenarios = [
    { name: "small", entities: 20, ticks: 1500 },
    { name: "large", entities: 200, ticks: 400 },
  ];

  for (const scenario of scenarios) {
    if (backend === "ts" || backend === "both") {
      const tickMs = await runTsTicks(scenario.entities, scenario.ticks);
      measures.push({ backend: "ts", scenario: scenario.name, tickMs, ticksPerSec: 1000 / tickMs });
    }
    if (backend === "wasm" || backend === "both") {
      const tickMs = await runWasmTicks(scenario.entities, scenario.ticks);
      measures.push({ backend: "wasm", scenario: scenario.name, tickMs, ticksPerSec: 1000 / tickMs });
    }
  }

  const grouped = new Map<string, Measure[]>();
  for (const m of measures) grouped.set(m.scenario, [...(grouped.get(m.scenario) ?? []), m]);

  for (const [name, rows] of grouped) {
    const ts = rows.find((r) => r.backend === "ts");
    const wasm = rows.find((r) => r.backend === "wasm");
    if (ts && wasm) {
      const ratio = wasm.ticksPerSec / ts.ticksPerSec;
      console.log(`${name}: ts=${ts.ticksPerSec.toFixed(1)} tps wasm=${wasm.ticksPerSec.toFixed(1)} tps speedup=${ratio.toFixed(2)}x`);
    }
  }

  const day = new Date().toISOString().slice(0, 10);
  mkdirSync("benchmarks/results", { recursive: true });
  writeFileSync(`benchmarks/results/wasm-vs-ts-${day}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), measures }, null, 2));
}

void main();
