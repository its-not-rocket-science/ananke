// tools/generate-playground.ts — Generate the CE-17 Browser Simulation Playground
//
// Pre-computes a grid of 1v1 combat variants across weapon × armour × seed,
// then writes a self-contained docs/playground/index.html with all data embedded.
// No build step required to view the output — open the HTML file directly.
//
// Run:  npm run build && node dist/tools/generate-playground.js

import { writeFileSync, mkdirSync } from "node:fs";
import { q, SCALE, type Q }        from "../src/units.js";
import {
  KNIGHT_INFANTRY, HUMAN_BASE, PRO_BOXER,
} from "../src/archetypes.js";
import { generateIndividual }       from "../src/generate.js";
import { defaultIntent }            from "../src/sim/intent.js";
import { defaultAction }            from "../src/sim/action.js";
import { defaultCondition }         from "../src/sim/condition.js";
import { defaultInjury }            from "../src/sim/injury.js";
import { v3 }                       from "../src/sim/vec3.js";
import { stepWorld }                from "../src/sim/kernel.js";
import { buildWorldIndex }          from "../src/sim/indexing.js";
import { buildSpatialIndex }        from "../src/sim/spatial.js";
import { decideCommandsForEntity }  from "../src/sim/ai/decide.js";
import { AI_PRESETS }               from "../src/sim/ai/presets.js";
import { STARTER_WEAPONS, STARTER_ARMOUR } from "../src/equipment.js";
import type { Entity }              from "../src/sim/entity.js";
import type { KernelContext }       from "../src/sim/context.js";

const M   = SCALE.m;
const CTX: KernelContext = { tractionCoeff: q(0.90) as Q };
const SNAP_EVERY = 20;

// ── Parameter grid ────────────────────────────────────────────────────────────

const WEAPONS = [
  { id: "wpn_club",      label: "Club",      icon: "🪵" },
  { id: "wpn_knife",     label: "Knife",     icon: "🔪" },
  { id: "wpn_longsword", label: "Longsword", icon: "⚔️" },
] as const;

const ARMOURS = [
  { id: null,          label: "None",    icon: "🧥" },
  { id: "arm_leather", label: "Leather", icon: "🛡" },
  { id: "arm_mail",    label: "Mail",    icon: "⛓" },
] as const;

const SEEDS = [1, 42, 99] as const;

const ARCHETYPES = [
  { id: "HUMAN_BASE",      label: "Brawler",  arch: HUMAN_BASE },
  { id: "KNIGHT_INFANTRY", label: "Knight",   arch: KNIGHT_INFANTRY },
  { id: "PRO_BOXER",       label: "Pro Boxer",arch: PRO_BOXER },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

type SnapState = {
  id: number; shock: number; consciousness: number; fatigue: number; dead: boolean;
};
type PlayEvent = { tick: number; type: string; label: string };
type Snapshot  = { tick: number; states: SnapState[] };

interface VariantResult {
  variantKey: string;
  finalTick: number;
  outcome: string;
  snapshots: Snapshot[];
  events: PlayEvent[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntity(
  id: number, teamId: number, seed: number,
  arch: typeof HUMAN_BASE,
  weaponId: string, armourId: string | null,
  xOff = 0, yOff = 0,
): Entity {
  const attrs = generateIndividual(seed, arch);
  const items = [
    STARTER_WEAPONS.find(w => w.id === weaponId)!,
    ...(armourId ? [STARTER_ARMOUR.find(a => a.id === armourId)!] : []),
  ];
  return {
    id, teamId, attributes: attrs,
    energy:   { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout:  { items }, traits: [],
    position_m:   v3(xOff, yOff, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(), action: defaultAction(),
    condition: defaultCondition(), injury: defaultInjury(),
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
  };
}

function snapOf(entities: Entity[], tick: number): Snapshot {
  return {
    tick,
    states: entities.map(e => ({
      id:            e.id,
      shock:         e.injury.shock,
      consciousness: e.injury.consciousness,
      fatigue:       e.energy.fatigue,
      dead:          e.injury.dead,
    })),
  };
}

function oneTeamDown(entities: Entity[]): boolean {
  const teams = new Set(entities.map(e => e.teamId));
  for (const team of teams) {
    if (entities.filter(e => e.teamId === team).every(
      e => e.injury.dead || e.injury.consciousness === 0)) return true;
  }
  return false;
}

function runVariant(
  weaponId: string, armourId: string | null, archId: string, seed: number,
): Omit<VariantResult, "variantKey"> {
  const arch = ARCHETYPES.find(a => a.id === archId)!.arch;
  const entities: Entity[] = [
    makeEntity(1, 1, seed,     arch,       weaponId, armourId,    0,                       0),
    makeEntity(2, 2, seed + 1, HUMAN_BASE, "wpn_club", null, Math.trunc(0.6 * M), 0),
  ];
  const world = { tick: 0, seed, entities };
  const snapshots: Snapshot[] = [snapOf(entities, 0)];
  const events: PlayEvent[] = [];
  const prevShock = new Map(entities.map(e => [e.id, 0]));
  const prevDead  = new Map(entities.map(e => [e.id, false]));

  for (let t = 0; t < 800; t++) {
    if (oneTeamDown(entities)) break;
    const index   = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * M));
    const cmds    = new Map<number, ReturnType<typeof decideCommandsForEntity>>();
    for (const e of world.entities)
      if (!e.injury.dead)
        cmds.set(e.id, decideCommandsForEntity(world, index, spatial, e, AI_PRESETS.lineInfantry!));
    stepWorld(world, cmds, CTX);

    for (const e of world.entities) {
      const lbl  = e.teamId === 1 ? "Attacker" : "Brawler";
      const prev = prevShock.get(e.id) ?? 0;
      if (e.injury.shock > prev + 300)
        events.push({ tick: world.tick, type: "hit",
          label: `${lbl} takes a hit (shock +${e.injury.shock - prev})` });
      if (e.injury.dead && !prevDead.get(e.id))
        events.push({ tick: world.tick, type: "death", label: `${lbl} is killed` });
      prevShock.set(e.id, e.injury.shock);
      prevDead.set(e.id, e.injury.dead);
    }
    if (world.tick % SNAP_EVERY === 0) snapshots.push(snapOf(entities, world.tick));
  }
  const last = snapshots.at(-1);
  if (last && last.tick !== world.tick) snapshots.push(snapOf(entities, world.tick));

  const survivors = entities.filter(e => !e.injury.dead);
  const winnerTeam = survivors.length > 0 ? survivors[0]!.teamId : 0;
  const outcome = survivors.length === 0
    ? "Both combatants down"
    : winnerTeam === 1
      ? `Attacker wins at tick ${world.tick}`
      : `Brawler wins at tick ${world.tick}`;

  return { finalTick: world.tick, outcome, snapshots, events };
}

// ── Pre-compute grid ──────────────────────────────────────────────────────────

console.log("Generating playground variants...");

const variantMap: Record<string, VariantResult> = {};
let count = 0;

for (const seed of SEEDS) {
  for (const weapon of WEAPONS) {
    for (const armour of ARMOURS) {
      for (const archEntry of ARCHETYPES) {
        const key = `${archEntry.id}_${weapon.id}_${armour.id ?? "none"}_${seed}`;
        const result = runVariant(weapon.id, armour.id, archEntry.id, seed);
        variantMap[key] = { variantKey: key, ...result };
        count++;
        if (count % 9 === 0) process.stdout.write(".");
      }
    }
  }
}
console.log(`\n  ✓ ${count} variants computed`);

// ── HTML ──────────────────────────────────────────────────────────────────────

const VARIANTS_JSON  = JSON.stringify(variantMap);
const WEAPONS_JSON   = JSON.stringify(WEAPONS);
const ARMOURS_JSON   = JSON.stringify(ARMOURS);
const ARCHETYPES_JSON = JSON.stringify(ARCHETYPES.map(a => ({ id: a.id, label: a.label })));
const GEN_DATE = new Date().toISOString().slice(0, 10);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ananke — Simulation Playground</title>
<style>
  :root{--bg:#0f1117;--surface:#1a1d27;--surface2:#22263a;--border:#2e3245;--text:#e0e4f0;
    --muted:#7a81a0;--pass:#22c55e;--fail:#ef4444;--accent:#6366f1;--warn:#f59e0b;--cyan:#22d3ee;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:ui-monospace,"Cascadia Code",Menlo,monospace;font-size:13px;display:flex;flex-direction:column;min-height:100vh}
  header{padding:.75rem 1.25rem;border-bottom:1px solid var(--border);display:flex;align-items:baseline;gap:1rem;flex-shrink:0}
  header h1{font-size:1.1rem}
  header .sub{color:var(--muted);font-size:.78rem}
  .gen-date{color:var(--muted);font-size:.72rem;margin-left:auto}
  .main{display:flex;flex:1;overflow:hidden;height:calc(100vh - 49px)}
  /* Controls */
  .controls{width:280px;border-right:1px solid var(--border);overflow-y:auto;flex-shrink:0;padding:1rem}
  .ctrl-group{margin-bottom:1.25rem}
  .ctrl-label{color:var(--warn);font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.5rem}
  .btn-row{display:flex;flex-wrap:wrap;gap:.3rem}
  .btn{background:var(--surface);border:1px solid var(--border);color:var(--text);
    border-radius:4px;padding:.3rem .65rem;font-size:.78rem;cursor:pointer;
    font-family:inherit;transition:border-color .12s,background .12s}
  .btn:hover{border-color:var(--accent)}
  .btn.active{border-color:var(--accent);background:var(--surface2);color:#a5b4fc}
  .outcome-box{background:var(--surface);border:1px solid var(--border);border-radius:6px;
    padding:.75rem 1rem;margin-top:1.25rem}
  .outcome-title{color:var(--muted);font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.3rem}
  .outcome-val{font-size:.92rem;font-weight:700}
  .outcome-ticks{color:var(--muted);font-size:.75rem;margin-top:.2rem}
  .outcome-win{color:var(--pass)}.outcome-lose{color:var(--fail)}.outcome-draw{color:var(--warn)}
  .export-btn{margin-top:1rem;width:100%;padding:.4rem;background:var(--surface2);
    border:1px solid var(--border);border-radius:4px;color:var(--muted);font-size:.75rem;
    cursor:pointer;font-family:inherit;transition:border-color .12s,color .12s}
  .export-btn:hover{border-color:var(--accent);color:var(--text)}
  .export-btn.copied{color:var(--pass);border-color:var(--pass)}
  /* Detail panel */
  .detail{flex:1;overflow-y:auto;padding:1.25rem 1.5rem}
  .matchup{display:flex;align-items:center;gap:1rem;margin-bottom:1rem;font-size:.9rem;font-weight:700}
  .vs{color:var(--muted);font-size:.78rem}
  .fighter-tag{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:.25rem .6rem;font-size:.8rem}
  .fighter-a{border-color:#6366f1;color:#a5b4fc}
  .fighter-b{border-color:#f59e0b;color:#fcd34d}
  .stats{background:var(--surface);border:1px solid var(--border);border-radius:6px;
    display:flex;gap:1.5rem;padding:.6rem 1rem;margin-bottom:1rem;flex-wrap:wrap}
  .stat{display:flex;flex-direction:column;gap:.1rem}
  .stat-val{font-size:1rem;font-weight:700;color:var(--cyan)}
  .stat-label{color:var(--muted);font-size:.7rem;text-transform:uppercase;letter-spacing:.05em}
  /* Health tracks */
  .sec-head{color:var(--warn);font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin:.9rem 0 .4rem}
  .tracks{display:flex;flex-direction:column;gap:.45rem;margin-bottom:1rem}
  .track-row{display:flex;align-items:center;gap:.6rem}
  .track-label{width:90px;font-size:.72rem;color:var(--muted);text-align:right;flex-shrink:0}
  .track-cells{display:flex;gap:2px;flex:1;min-width:0}
  .tc{height:16px;border-radius:2px;flex:1;min-width:4px;cursor:default;position:relative}
  .tc:hover::after{content:attr(data-tip);position:absolute;top:-22px;left:50%;transform:translateX(-50%);
    background:#000;border:1px solid var(--border);border-radius:3px;color:var(--text);
    font-size:.7rem;padding:.1rem .3rem;white-space:nowrap;pointer-events:none;z-index:10}
  .track-outcome{font-size:.7rem;font-weight:700;margin-left:.4rem;flex-shrink:0}
  .outcome-win{color:var(--pass)}.outcome-dead{color:var(--fail)}.outcome-alive{color:var(--cyan)}
  /* Events */
  .events{max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:4px}
  .ev{display:flex;gap:.6rem;padding:.3rem .6rem;border-bottom:1px solid var(--border);font-size:.75rem}
  .ev:last-child{border-bottom:none}
  .ev-tick{color:var(--muted);min-width:56px;flex-shrink:0}
  .ev-hit{color:var(--warn)}.ev-death{color:var(--fail)}
  .empty{color:var(--muted);font-size:.82rem;padding:2rem;text-align:center}
  .legend{display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.6rem;align-items:center}
  .leg-item{display:flex;align-items:center;gap:.3rem;font-size:.7rem;color:var(--muted)}
  .leg-swatch{width:14px;height:10px;border-radius:2px}
</style>
</head>
<body>
<header>
  <h1>Ananke Playground</h1>
  <span class="sub">Pre-computed 1v1 combat — change parameters to explore outcomes</span>
  <span class="gen-date">Generated ${GEN_DATE}</span>
</header>
<div class="main">
  <div class="controls">
    <div class="ctrl-group">
      <div class="ctrl-label">Archetype</div>
      <div class="btn-row" id="arch-btns"></div>
    </div>
    <div class="ctrl-group">
      <div class="ctrl-label">Weapon</div>
      <div class="btn-row" id="weapon-btns"></div>
    </div>
    <div class="ctrl-group">
      <div class="ctrl-label">Armour</div>
      <div class="btn-row" id="armour-btns"></div>
    </div>
    <div class="ctrl-group">
      <div class="ctrl-label">Seed</div>
      <div class="btn-row" id="seed-btns">
        <button class="btn active" data-seed="1" onclick="setSeed(1)">Seed 1</button>
        <button class="btn" data-seed="42" onclick="setSeed(42)">Seed 42</button>
        <button class="btn" data-seed="99" onclick="setSeed(99)">Seed 99</button>
      </div>
    </div>
    <div class="outcome-box" id="outcome-box">
      <div class="outcome-title">Outcome</div>
      <div class="outcome-val" id="outcome-val">—</div>
      <div class="outcome-ticks" id="outcome-ticks"></div>
    </div>
    <button class="export-btn" id="export-btn" onclick="exportScenario()">⬇ Copy scenario JSON</button>
  </div>
  <div class="detail" id="detail">
    <div class="empty">Select parameters to view a simulation run.</div>
  </div>
</div>
<script>
const VARIANTS   = ${VARIANTS_JSON};
const WEAPONS    = ${WEAPONS_JSON};
const ARMOURS    = ${ARMOURS_JSON};
const ARCHETYPES = ${ARCHETYPES_JSON};
const SCALE_Q    = 10000;

let selArch   = ARCHETYPES[0].id;
let selWeapon = WEAPONS[0].id;
let selArmour = "none";
let selSeed   = 1;

function healthColor(consciousnessQ) {
  const f = consciousnessQ / SCALE_Q;
  if (f > 0.9)  return "#22c55e";
  if (f > 0.7)  return "#86efac";
  if (f > 0.5)  return "#f59e0b";
  if (f > 0.3)  return "#fb923c";
  if (f > 0.1)  return "#ef4444";
  if (f > 0)    return "#991b1b";
  return "#1f2937";
}

function renderDetail(v) {
  if (!v) { document.getElementById("detail").innerHTML = '<div class="empty">No data for this combination.</div>'; return; }

  const attacker = v.snapshots[0]?.states[0];
  const brawler  = v.snapshots[0]?.states[1];
  const selW = WEAPONS.find(w => w.id === selWeapon) || WEAPONS[0];
  const selA = ARMOURS.find(a => (a.id ?? "none") === selArmour) || ARMOURS[0];
  const selArch2 = ARCHETYPES.find(a => a.id === selArch) || ARCHETYPES[0];

  // Build track data for each entity
  const tracks = [
    { id: 1, label: selArch2.label + " (A)", color: "#6366f1", team: 1 },
    { id: 2, label: "Brawler (B)",           color: "#f59e0b", team: 2 },
  ].map(t => {
    const snaps = v.snapshots.map(s => s.states.find(st => st.id === t.id));
    return { ...t, snaps };
  });

  const lastSnap = v.snapshots.at(-1);
  const aFinal = lastSnap?.states.find(s => s.id === 1);
  const bFinal = lastSnap?.states.find(s => s.id === 2);

  let html = \`
    <div class="matchup">
      <span class="fighter-tag fighter-a">\${selArch2.label} · \${selW.icon} \${selW.label} · \${selA.icon} \${selA.label}</span>
      <span class="vs">vs</span>
      <span class="fighter-tag fighter-b">Brawler · 🪵 Club · 🧥 None</span>
    </div>
    <div class="stats">
      <div class="stat"><span class="stat-val">\${v.finalTick}</span><span class="stat-label">Ticks</span></div>
      <div class="stat"><span class="stat-val">\${v.snapshots.length}</span><span class="stat-label">Snapshots</span></div>
      <div class="stat"><span class="stat-val">\${v.events.length}</span><span class="stat-label">Events</span></div>
      <div class="stat"><span class="stat-val">Seed \${selSeed}</span><span class="stat-label">RNG</span></div>
    </div>
    <div class="legend">
      <span style="color:var(--muted);font-size:.7rem">Consciousness:</span>
      \${["#22c55e","#86efac","#f59e0b","#fb923c","#ef4444","#991b1b","#1f2937"].map((c,i) =>
        \`<span class="leg-item"><span class="leg-swatch" style="background:\${c}"></span>\${["≥90%","≥70%","≥50%","≥30%","≥10%",">0%","0"][i]}</span>\`
      ).join("")}
    </div>
    <div class="sec-head">Health Tracks (consciousness)</div>
    <div class="tracks">
  \`;

  for (const t of tracks) {
    const lastState = t.snaps.at(-1);
    const isDead = lastState?.dead ?? false;
    const finalC = lastState?.consciousness ?? 0;
    const outcomeClass = isDead ? "outcome-dead" : "outcome-alive";
    const outcomeText  = isDead ? "DEAD" : Math.round(finalC / SCALE_Q * 100) + "%";
    html += \`<div class="track-row">
      <span class="track-label" title="\${t.label}">\${t.label}</span>
      <span class="track-cells">\${
        t.snaps.map((s, i) => {
          const c = s?.consciousness ?? 0;
          const bg = (s?.dead) ? "#1f2937" : healthColor(c);
          const pct = Math.round(c / SCALE_Q * 100);
          return \`<span class="tc" style="background:\${bg}" data-tip="t\${v.snapshots[i]?.tick ?? "?"}: \${pct}% consciousness"></span>\`;
        }).join("")
      }</span>
      <span class="track-outcome \${outcomeClass}">\${outcomeText}</span>
    </div>\`;
  }

  html += \`</div>\`;
  html += \`<div class="sec-head">Event Log (\${v.events.length})</div>\`;
  if (v.events.length === 0) {
    html += \`<div class="empty">No events recorded.</div>\`;
  } else {
    html += \`<div class="events">\${
      v.events.map(ev => \`<div class="ev">
        <span class="ev-tick">t\${ev.tick}</span>
        <span class="ev-\${ev.type}">\${ev.label}</span>
      </div>\`).join("")
    }</div>\`;
  }

  document.getElementById("detail").innerHTML = html;

  // Outcome box
  const ov = document.getElementById("outcome-val");
  const ot = document.getElementById("outcome-ticks");
  ov.className = "outcome-val " + (v.outcome.includes("Attacker") ? "outcome-win"
    : v.outcome.includes("Brawler") ? "outcome-lose" : "outcome-draw");
  ov.textContent = v.outcome;
  ot.textContent = v.finalTick + " ticks elapsed";
}

function variantKey() {
  return selArch + "_" + selWeapon + "_" + selArmour + "_" + selSeed;
}

function update() {
  const v = VARIANTS[variantKey()];
  renderDetail(v);
}

function setArch(id) {
  selArch = id;
  document.querySelectorAll("#arch-btns .btn").forEach(b =>
    b.classList.toggle("active", b.dataset.arch === id));
  update();
}

function setWeapon(id) {
  selWeapon = id;
  document.querySelectorAll("#weapon-btns .btn").forEach(b =>
    b.classList.toggle("active", b.dataset.weapon === id));
  update();
}

function setArmour(id) {
  selArmour = id;
  document.querySelectorAll("#armour-btns .btn").forEach(b =>
    b.classList.toggle("active", b.dataset.armour === id));
  update();
}

function setSeed(s) {
  selSeed = s;
  document.querySelectorAll("#seed-btns .btn").forEach(b =>
    b.classList.toggle("active", +b.dataset.seed === s));
  update();
}

function exportScenario() {
  const v = VARIANTS[variantKey()];
  if (!v) return;
  const scenario = {
    id: variantKey(),
    type: "ArenaScenario",
    description: "1v1 duel — " + selWeapon + " + " + selArmour + " vs club, seed " + selSeed,
    seed: selSeed,
    teamA: [{ archetype: selArch, weaponId: selWeapon, armourId: selArmour === "none" ? null : selArmour }],
    teamB: [{ archetype: "HUMAN_BASE", weaponId: "wpn_club", armourId: null }],
    outcome: v.outcome,
    finalTick: v.finalTick,
  };
  navigator.clipboard.writeText(JSON.stringify(scenario, null, 2)).then(() => {
    const btn = document.getElementById("export-btn");
    btn.textContent = "✓ Copied!";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = "⬇ Copy scenario JSON"; btn.classList.remove("copied"); }, 2000);
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

(function init() {
  const ab = document.getElementById("arch-btns");
  ARCHETYPES.forEach((a, i) => {
    const btn = document.createElement("button");
    btn.className = "btn" + (i === 0 ? " active" : "");
    btn.dataset.arch = a.id;
    btn.textContent = a.label;
    btn.onclick = () => setArch(a.id);
    ab.appendChild(btn);
  });

  const wb = document.getElementById("weapon-btns");
  WEAPONS.forEach((w, i) => {
    const btn = document.createElement("button");
    btn.className = "btn" + (i === 0 ? " active" : "");
    btn.dataset.weapon = w.id;
    btn.textContent = w.icon + " " + w.label;
    btn.onclick = () => setWeapon(w.id);
    wb.appendChild(btn);
  });

  const armb = document.getElementById("armour-btns");
  ARMOURS.forEach((a, i) => {
    const id = a.id ?? "none";
    const btn = document.createElement("button");
    btn.className = "btn" + (i === 0 ? " active" : "");
    btn.dataset.armour = id;
    btn.textContent = a.icon + " " + a.label;
    btn.onclick = () => setArmour(id);
    armb.appendChild(btn);
  });

  update();
})();
</script>
</body>
</html>`;

mkdirSync("docs/playground", { recursive: true });
writeFileSync("docs/playground/index.html", html, "utf-8");
console.log("  ✓ docs/playground/index.html written");
