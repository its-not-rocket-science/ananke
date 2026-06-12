import {
  exportReplayJson,
  inspect,
  loadScenarioFromPath,
  loadSession,
  runUntilTerminal,
  saveSession,
  stepOnce,
} from "../../../../dist/examples/reference/host-coherence/index.js";

let session = null;

const headline = document.getElementById("headline");
const summary = document.getElementById("summary");
const entitiesTbody = document.getElementById("entities");
const bridgePre = document.getElementById("bridge");
const eventsPre = document.getElementById("events");
const uploader = document.getElementById("upload");

function download(filename, content) {
  const blob = new Blob([content], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function render(snapshot) {
  if (!snapshot) {
    headline.textContent = "No scenario loaded.";
    summary.textContent = "Use Load Scenario to begin.";
    entitiesTbody.innerHTML = "";
    bridgePre.textContent = "{}";
    eventsPre.textContent = "";
    return;
  }

  headline.textContent = `Tick ${snapshot.tick}/${snapshot.maxTicks} · Replay frames ${snapshot.replayFrames}`;
  summary.textContent = `Entities ${snapshot.entities.length} · Bridge entities ${snapshot.bridge.entityCount}`;

  entitiesTbody.innerHTML = "";
  for (const entity of snapshot.entities) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${entity.id}</td><td>${entity.teamId}</td><td>(${entity.x}, ${entity.y})</td><td>${entity.consciousnessPct}%</td><td>${entity.dead}</td>`;
    entitiesTbody.appendChild(tr);
  }

  bridgePre.textContent = JSON.stringify(snapshot.bridge, null, 2);
  eventsPre.textContent = snapshot.events.join("\n");
}

document.getElementById("load-scenario").onclick = () => {
  session = loadScenarioFromPath();
  render(inspect(session));
};

document.getElementById("step").onclick = () => {
  if (!session) return;
  render(stepOnce(session));
};

document.getElementById("run").onclick = () => {
  if (!session) return;
  render(runUntilTerminal(session, 30));
};

document.getElementById("run-terminal").onclick = () => {
  if (!session) return;
  render(runUntilTerminal(session, 500));
};

document.getElementById("save").onclick = () => {
  if (!session) return;
  localStorage.setItem("ananke-reference-host-session", saveSession(session));
  alert("Session saved to localStorage.");
};

document.getElementById("load").onclick = () => {
  const raw = localStorage.getItem("ananke-reference-host-session");
  if (!raw) return;
  session = loadSession(raw);
  render(inspect(session));
};

document.getElementById("replay").onclick = () => {
  if (!session) return;
  download("reference-host-replay.json", exportReplayJson(session));
};

uploader.onchange = async () => {
  const file = uploader.files?.[0];
  if (!file) return;
  const raw = await file.text();
  session = loadSession(raw);
  render(inspect(session));
};

render(null);
