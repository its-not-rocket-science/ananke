import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadScenario, stepWorld, q, SCALE, ReplayRecorder, serializeReplay, replayTo } from "../src/index.js";
import { serializeBridgeFrame } from "../src/host-loop.js"; // Tier 2 acceptable

// Extended demo: intentionally imports internal modules to showcase richer AI/routing behaviors.
import { buildWorldIndex } from "../src/sim/indexing.js";
import { buildSpatialIndex } from "../src/sim/spatial.js";
import { decideCommandsForEntity } from "../src/sim/ai/decide.js";
import { AI_PRESETS } from "../src/sim/ai/presets.js";
import { isRouting } from "../src/sim/morale.js";
import type { CommandMap, KernelContext } from "../src/index.js";

interface SliceScenario {
  id: string;
  seed: number;
  maxTicks: number;
  tractionCoeff?: number;
  entities: Array<{ id: number; teamId: number; archetype: string; weapon: string; armour?: string; x_m?: number; y_m?: number }>;
}

interface OutcomeSummary {
  scenarioId: string;
  seed: number;
  ticksSimulated: number;
  endReason: string;
  survivingTeams: number[];
  casualties: Array<{ entityId: number; teamId: number; dead: boolean; unconscious: boolean; shockPct: number; fearPct: number }>;
  replayPath: string;
  inspectionUiPath: string;
  policy: string;
  internalImports: string[];
}

function resolveRepoPath(...segments: string[]): string {
  return path.resolve(process.cwd(), ...segments);
}

function pct(v: number): number {
  return Math.round((v / SCALE.Q) * 1000) / 10;
}

function inferEndReason(world: ReturnType<typeof loadScenario>): string {
  const dead = world.entities.filter((e) => e.injury.dead);
  if (dead.length > 0) return `casualty: entity ${dead[0]!.id}`;
  const knockedOut = world.entities.filter((e) => e.injury.consciousness <= 0);
  if (knockedOut.length > 0) return `knockout: entity ${knockedOut[0]!.id}`;

  const routing = world.entities.filter((e) =>
    isRouting((e.condition.fearQ ?? 0) as any, e.attributes.resilience.distressTolerance),
  );
  if (routing.length > 0) return `routing: entity ${routing[0]!.id}`;
  return "maxTicks";
}

function createInspectionHtml(payload: {
  scenario: SliceScenario;
  bridgeFrames: unknown[];
  summary: OutcomeSummary;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Ananke Proof-of-Use Inspector (Extended)</title>
<style>
body { font-family: Inter, Arial, sans-serif; margin: 24px; color: #111; }
.card { border: 1px solid #ddd; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
h1,h2 { margin: 0 0 12px 0; }
label { display: block; margin-bottom: 8px; font-weight: 600; }
input[type="range"] { width: 100%; }
pre { background: #f8f8f8; padding: 12px; overflow: auto; border-radius: 8px; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; border-bottom: 1px solid #eee; padding: 8px; }
small { color: #666; }
</style>
</head>
<body>
<h1>Ananke — Proof-of-Use Inspector (Extended/Internal Demo)</h1>
<div class="card">
  <h2>Scenario</h2>
  <pre id="scenario"></pre>
</div>
<div class="card">
  <h2>Outcome summary</h2>
  <pre id="summary"></pre>
</div>
<div class="card">
  <h2>Tick inspection</h2>
  <label for="tick">Tick: <span id="tickLabel"></span></label>
  <input id="tick" type="range" min="0" max="0" value="0" step="1" />
  <small>Extended mode uses internal AI/indexing modules for richer behavior.</small>
  <table>
    <thead>
      <tr><th>Entity</th><th>Team</th><th>Position (m)</th><th>Shock</th><th>Fear</th><th>Consciousness</th><th>State</th></tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>
</div>
<script>
const payload = ${JSON.stringify(payload)};
const frames = payload.bridgeFrames;
const slider = document.getElementById("tick");
const tickLabel = document.getElementById("tickLabel");
const rows = document.getElementById("rows");
document.getElementById("scenario").textContent = JSON.stringify(payload.scenario, null, 2);
document.getElementById("summary").textContent = JSON.stringify(payload.summary, null, 2);
slider.max = String(Math.max(0, frames.length - 1));

function toPct(v) { return (v * 100).toFixed(1) + "%"; }

function render(i) {
  const frame = frames[i];
  tickLabel.textContent = frame ? String(frame.tick) : "n/a";
  rows.innerHTML = "";
  if (!frame) return;
  for (const e of frame.entities) {
    const tr = document.createElement("tr");
    const state = e.condition.dead ? "dead" : (e.condition.consciousnessQ <= 0 ? "unconscious" : e.animation.primaryState);
    tr.innerHTML = [
      e.entityId,
      e.teamId,
      "(" + e.position_m.x.toFixed(2) + ", " + e.position_m.y.toFixed(2) + ", " + e.position_m.z.toFixed(2) + ")",
      toPct(e.condition.shockQ),
      toPct(e.condition.fearQ),
      toPct(e.condition.consciousnessQ),
      state,
    ].map((x) => "<td>" + x + "</td>").join("");
    rows.appendChild(tr);
  }
}

slider.addEventListener("input", () => render(Number(slider.value)));
render(0);
</script>
</body>
</html>`;
}

async function run(): Promise<void> {
  const scenarioPath = resolveRepoPath("examples", "scenarios", "proof-of-use-duel.json");
  const outDir = resolveRepoPath("artifacts", "proof-of-use", "extended");

  await mkdir(outDir, { recursive: true });

  const rawScenario = await readFile(scenarioPath, "utf8");
  const scenario = JSON.parse(rawScenario) as SliceScenario;
  const world = loadScenario(scenario);

  const ctx: KernelContext = {
    tractionCoeff: q(scenario.tractionCoeff ?? 0.85) as any,
  };

  const replay = new ReplayRecorder(world);
  const bridgeFrames: unknown[] = [];

  let endReason = "maxTicks";
  for (let i = 0; i < scenario.maxTicks; i++) {
    const index = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * SCALE.m));

    const cmds: CommandMap = new Map();
    for (const entity of world.entities) {
      if (entity.injury.dead) continue;
      const preset = entity.teamId === 1 ? AI_PRESETS["lineInfantry"]! : AI_PRESETS["skirmisher"]!;
      const next = decideCommandsForEntity(world, index, spatial, entity, preset);
      if (next.length > 0) cmds.set(entity.id, [...next]);
    }

    replay.record(world.tick, cmds);
    stepWorld(world, cmds, ctx);

    bridgeFrames.push(serializeBridgeFrame(world, { scenarioId: scenario.id, tickHz: 20 }));

    endReason = inferEndReason(world);
    if (endReason !== "maxTicks") break;
  }

  const serializedReplay = serializeReplay(replay.toReplay());
  const replayPath = path.join(outDir, `${scenario.id}.replay.json`);
  await writeFile(replayPath, serializedReplay, "utf8");

  const replayValidationWorld = replayTo(replay.toReplay(), world.tick, ctx);
  const determinismMatches = JSON.stringify(replayValidationWorld.entities.map((e) => e.injury)) ===
    JSON.stringify(world.entities.map((e) => e.injury));

  const summary: OutcomeSummary = {
    scenarioId: scenario.id,
    seed: scenario.seed,
    ticksSimulated: world.tick,
    endReason: `${endReason}${determinismMatches ? "" : " (replay mismatch)"}`,
    survivingTeams: [...new Set(world.entities.filter((e) => !e.injury.dead).map((e) => e.teamId))],
    casualties: world.entities.map((e) => ({
      entityId: e.id,
      teamId: e.teamId,
      dead: e.injury.dead,
      unconscious: e.injury.consciousness <= 0,
      shockPct: pct(e.injury.shock),
      fearPct: pct((e.condition.fearQ ?? 0) as number),
    })),
    replayPath,
    inspectionUiPath: path.join(outDir, `${scenario.id}.inspector.html`),
    policy: "internal AI presets + world/spatial indexing for richer tactical behavior",
    internalImports: [
      "src/sim/indexing.ts",
      "src/sim/spatial.ts",
      "src/sim/ai/decide.ts",
      "src/sim/ai/presets.ts",
      "src/sim/morale.ts",
    ],
  };

  const summaryPath = path.join(outDir, `${scenario.id}.summary.json`);
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  const uiHtml = createInspectionHtml({ scenario, bridgeFrames, summary });
  await writeFile(summary.inspectionUiPath, uiHtml, "utf8");

  console.log("═".repeat(72));
  console.log("ANANKE PROOF-OF-USE (EXTENDED)");
  console.log(`scenario: ${scenario.id}`);
  console.log(`ticks simulated: ${summary.ticksSimulated}`);
  console.log(`end reason: ${summary.endReason}`);
  console.log(`bridge frames: ${bridgeFrames.length}`);
  console.log(`replay: ${replayPath}`);
  console.log(`summary: ${summaryPath}`);
  console.log(`inspection ui: ${summary.inspectionUiPath}`);
  console.log("═".repeat(72));
}

run().catch((err) => {
  console.error("proof-of-use extended failed", err);
  process.exitCode = 1;
});
