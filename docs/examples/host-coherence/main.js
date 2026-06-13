import {
  SCALE,
  q,
  loadScenario,
  stepWorld,
  ReplayRecorder,
  replayTo,
  serializeReplay,
  deserializeReplay,
  extractRigSnapshots,
} from "https://esm.sh/@its-not-rocket-science/ananke@0.5.0";

let session = null;
const DEFAULT_TRACTION = q(0.9);

// ── Business logic (ported from examples/reference/host-coherence/index.ts) ──

const percent = (qValue) => Math.round((qValue / SCALE.Q) * 100);

function selectCommands(world) {
  const commands = new Map();
  for (const entity of world.entities) {
    if (entity.injury.dead || entity.injury.consciousness <= 0) continue;
    const target = world.entities.find(
      other => other.teamId !== entity.teamId && !other.injury.dead && other.injury.consciousness > 0
    );
    if (!target) continue;
    const dx = target.position_m.x - entity.position_m.x;
    const dy = target.position_m.y - entity.position_m.y;
    commands.set(entity.id, [
      { kind: "move", dir: { x: Math.sign(dx) || 1, y: Math.sign(dy), z: 0 }, intensity: q(1), mode: "run" },
      { kind: "attackNearest", intensity: q(1), mode: "strike" },
    ]);
  }
  return commands;
}

function listAliveTeams(world) {
  return [
    ...new Set(
      world.entities
        .filter(e => !e.injury.dead && e.injury.consciousness > 0)
        .map(e => e.teamId)
    ),
  ].sort((a, b) => a - b);
}

function buildBridgeSummary(world) {
  const snapshots = extractRigSnapshots(world);
  const first = snapshots[0];
  if (!first) return { tick: world.tick, entityCount: 0, firstEntity: null };
  return {
    tick: world.tick,
    entityCount: snapshots.length,
    firstEntity: {
      id: first.entityId,
      pos: { x: 0, y: Number(first.mass.cogOffset_m.y.toFixed(3)), z: 0 },
      hints: [
        first.animation.dead ? "dead" : "alive",
        first.animation.unconscious ? "unconscious" : "conscious",
        first.animation.prone ? "prone" : "upright",
      ],
    },
  };
}

function inspect(sess) {
  return {
    tick: sess.world.tick,
    maxTicks: sess.scenario.maxTicks,
    entities: sess.world.entities
      .map(entity => ({
        id: entity.id,
        teamId: entity.teamId,
        x: Number((entity.position_m.x / SCALE.m).toFixed(2)),
        y: Number((entity.position_m.y / SCALE.m).toFixed(2)),
        consciousnessPct: percent(entity.injury.consciousness),
        dead: entity.injury.dead,
      }))
      .sort((a, b) => a.id - b.id),
    events: sess.events.slice(-14),
    replayFrames: sess.recorder.toReplay().frames.length,
    bridge: buildBridgeSummary(sess.world),
  };
}

function createSession(scenario) {
  const world = loadScenario(scenario);
  const recorder = new ReplayRecorder(world);
  return { scenario, world, recorder, events: [`Scenario "${scenario.id}" loaded at tick 0.`] };
}

function stepOnce(sess) {
  const aliveTeams = listAliveTeams(sess.world);
  if (sess.world.tick >= sess.scenario.maxTicks || aliveTeams.length <= 1) {
    sess.events.push("No step: scenario at terminal state.");
    return inspect(sess);
  }
  const commands = selectCommands(sess.world);
  sess.recorder.record(sess.world.tick, commands);
  stepWorld(sess.world, commands, { tractionCoeff: q(sess.scenario.tractionCoeff ?? 0.9) });
  const afterTeams = listAliveTeams(sess.world);
  if (afterTeams.length <= 1) {
    sess.events.push(`Terminal at tick ${sess.world.tick}: team ${afterTeams[0] ?? "none"} survives.`);
  } else {
    sess.events.push(`Stepped to tick ${sess.world.tick} (${commands.size} actors).`);
  }
  return inspect(sess);
}

function runUntilTerminal(sess, maxSteps) {
  for (let i = 0; i < maxSteps; i++) {
    const before = sess.world.tick;
    stepOnce(sess);
    if (sess.world.tick === before) break;
    if (sess.world.tick >= sess.scenario.maxTicks || listAliveTeams(sess.world).length <= 1) break;
  }
  return inspect(sess);
}

function exportReplayJson(sess) {
  return serializeReplay(sess.recorder.toReplay());
}

function saveSession(sess) {
  return JSON.stringify(
    { scenario: sess.scenario, replay: exportReplayJson(sess), events: sess.events },
    null, 2
  );
}

function loadSessionFromRaw(serialized) {
  const payload = JSON.parse(serialized);
  const replay = deserializeReplay(payload.replay);
  const world = replayTo(replay, Number.MAX_SAFE_INTEGER, {
    tractionCoeff: q(payload.scenario.tractionCoeff ?? 0.9),
  });
  return {
    scenario: payload.scenario,
    world,
    recorder: new ReplayRecorder(world),
    events: [...payload.events, `Session loaded at tick ${world.tick}.`],
  };
}

// ── UI ────────────────────────────────────────────────────────────────────────

const headline      = document.getElementById("headline");
const summaryEl     = document.getElementById("summary");
const entitiesTbody = document.getElementById("entities");
const bridgePre     = document.getElementById("bridge");
const eventsPre     = document.getElementById("events");
const uploader      = document.getElementById("upload");
const statusEl      = document.getElementById("status");

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className   = `status ${isError ? "error" : "ok"}`;
}

function download(filename, content) {
  const blob = new Blob([content], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function render(snapshot) {
  if (!snapshot) {
    headline.textContent    = "No scenario loaded.";
    summaryEl.textContent   = "Use Load Scenario to begin.";
    entitiesTbody.innerHTML = "";
    bridgePre.textContent   = "{}";
    eventsPre.textContent   = "";
    return;
  }
  headline.textContent  = `Tick ${snapshot.tick}/${snapshot.maxTicks} · Replay frames ${snapshot.replayFrames}`;
  summaryEl.textContent = `Entities ${snapshot.entities.length} · Bridge entities ${snapshot.bridge.entityCount}`;

  entitiesTbody.innerHTML = "";
  for (const entity of snapshot.entities) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${entity.id}</td><td>${entity.teamId}</td><td>(${entity.x}, ${entity.y})</td><td>${entity.consciousnessPct}%</td><td class="${entity.dead ? "dead" : ""}">${entity.dead}</td>`;
    entitiesTbody.appendChild(tr);
  }
  bridgePre.textContent = JSON.stringify(snapshot.bridge, null, 2);
  eventsPre.textContent = snapshot.events.join("\n");
}

document.getElementById("load-scenario").onclick = async () => {
  try {
    const scenario = await fetch("./scenario.json").then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    session = createSession(scenario);
    setStatus(`Loaded scenario "${scenario.id}"`);
    render(inspect(session));
  } catch (err) {
    setStatus(`Failed to load scenario: ${err.message}`, true);
  }
};

document.getElementById("step").onclick = () => {
  if (!session) { setStatus("Load a scenario first.", true); return; }
  render(stepOnce(session));
};

document.getElementById("run").onclick = () => {
  if (!session) { setStatus("Load a scenario first.", true); return; }
  render(runUntilTerminal(session, 30));
};

document.getElementById("run-terminal").onclick = () => {
  if (!session) { setStatus("Load a scenario first.", true); return; }
  render(runUntilTerminal(session, 500));
};

document.getElementById("save").onclick = () => {
  if (!session) { setStatus("Load a scenario first.", true); return; }
  localStorage.setItem("ananke-reference-host-session", saveSession(session));
  setStatus("Session saved to localStorage.");
};

document.getElementById("load").onclick = () => {
  const raw = localStorage.getItem("ananke-reference-host-session");
  if (!raw) { setStatus("No saved session found.", true); return; }
  session = loadSessionFromRaw(raw);
  setStatus("Session loaded from localStorage.");
  render(inspect(session));
};

document.getElementById("replay").onclick = () => {
  if (!session) { setStatus("Load a scenario first.", true); return; }
  download("reference-host-replay.json", exportReplayJson(session));
};

uploader.onchange = async () => {
  const file = uploader.files?.[0];
  if (!file) return;
  try {
    const raw = await file.text();
    session = loadSessionFromRaw(raw);
    setStatus(`Session loaded from "${file.name}".`);
    render(inspect(session));
  } catch (err) {
    setStatus(`Failed to load file: ${err.message}`, true);
  }
};

render(null);
