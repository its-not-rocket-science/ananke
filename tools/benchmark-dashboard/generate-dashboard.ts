import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { BenchmarkRun } from "./types.js";

function loadHistory(): BenchmarkRun[] {
  const files = readdirSync("benchmarks/history", { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => `benchmarks/history/${entry.name}`)
    .sort();

  return files.map((file) => JSON.parse(readFileSync(file, "utf8")) as BenchmarkRun);
}

function pickAnankeTicks(run: BenchmarkRun, scenarioId: string): number {
  const measurement = run.measurements.find((m) => m.adapterId === "ananke" && m.scenarioId === scenarioId);
  return measurement?.ticksPerSec ?? 0;
}

function regressionLabel(history: BenchmarkRun[]): string {
  if (history.length < 2) return "No regression signal yet.";
  const current = history.at(-1)!;
  const prev = history.at(-2)!;
  const now = pickAnankeTicks(current, "large-battle");
  const prior = pickAnankeTicks(prev, "large-battle");
  if (prior <= 0) return "No comparable baseline yet.";

  const change = ((now - prior) / prior) * 100;
  if (change >= -10) return `✅ Stable (${change.toFixed(1)}% vs ${prev.commit.slice(0, 7)})`;
  return `⚠️ ${change.toFixed(1)}% ticks/sec since commit ${prev.commit.slice(0, 7)}`;
}

function buildHtml(history: BenchmarkRun[]): string {
  const trimmed = history.slice(-100);
  const points = trimmed.map((run) => ({
    commit: run.commit.slice(0, 7),
    ticks: pickAnankeTicks(run, "large-battle"),
  }));

  const latest = trimmed.at(-1);
  const latestRows = latest?.measurements.filter((m) => m.scenarioId === "large-battle") ?? [];
  const ananke = latestRows.find((row) => row.adapterId === "ananke");

  const rows = latestRows.map((row) => {
    const ratio = ananke && row.ticksPerSec > 0 ? ananke.ticksPerSec / row.ticksPerSec : 0;
    const delta = ananke ? ((ananke.ticksPerSec - row.ticksPerSec) / (row.ticksPerSec || 1)) * 100 : 0;
    return `<tr><td>${row.adapterLabel}</td><td>${row.ticksPerSec.toFixed(1)}</td><td>${ratio.toFixed(2)}x</td><td>${delta.toFixed(1)}%</td></tr>`;
  }).join("\n");

  return `<!doctype html>
<html>
<head><meta charset="utf-8" /><title>Ananke Performance Dashboard</title>
<style>body{font-family:Arial;margin:24px} table{border-collapse:collapse;width:100%} td,th{border:1px solid #ddd;padding:8px} .alert{font-weight:700;margin:8px 0}</style>
</head>
<body>
<h1>Ananke Performance Dashboard</h1>
<p class="alert">${regressionLabel(trimmed)}</p>
<canvas id="chart" width="1000" height="280"></canvas>
<h2>Current vs baseline (large battle)</h2>
<table><thead><tr><th>Adapter</th><th>Ticks/sec</th><th>Ananke Ratio</th><th>Delta vs Adapter</th></tr></thead><tbody>${rows}</tbody></table>
<script>
const points = ${JSON.stringify(points)};
const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');
ctx.clearRect(0,0,canvas.width,canvas.height);
ctx.strokeStyle='#0055cc'; ctx.lineWidth=2;
const max = Math.max(...points.map(p=>p.ticks), 1);
points.forEach((p,i)=>{ const x = 40 + (i*Math.max(1,(canvas.width-60)/Math.max(1,points.length-1))); const y = canvas.height-30-((p.ticks/max)*(canvas.height-60)); if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); });
ctx.stroke();
ctx.fillStyle='#333'; ctx.fillText('ticks/sec over time (last 100 commits)', 40, 18);
</script>
</body>
</html>`;
}

function main(): void {
  mkdirSync("docs/perf", { recursive: true });
  const history = loadHistory();
  writeFileSync("docs/perf/index.html", buildHtml(history));
}

main();
