// tools/generate-zoo.ts — Generate the Simulation Zoo / Ananke Archive viewer
//
// Runs pre-defined scenarios (combat, disease), collects snapshots and events,
// then writes a self-contained docs/zoo/index.html with all data embedded.
//
// Run:  npm run build && node dist/tools/generate-zoo.js

import { writeFileSync, mkdirSync } from "node:fs";
import { q, SCALE, type Q }         from "../src/units.js";
import {
  KNIGHT_INFANTRY, HUMAN_BASE, PRO_BOXER, AMATEUR_BOXER,
} from "../src/archetypes.js";
import { generateIndividual }        from "../src/generate.js";
import { defaultIntent }             from "../src/sim/intent.js";
import { defaultAction }             from "../src/sim/action.js";
import { defaultCondition }          from "../src/sim/condition.js";
import { defaultInjury }             from "../src/sim/injury.js";
import { v3 }                        from "../src/sim/vec3.js";
import { stepWorld }                 from "../src/sim/kernel.js";
import { buildWorldIndex }           from "../src/sim/indexing.js";
import { buildSpatialIndex }         from "../src/sim/spatial.js";
import { decideCommandsForEntity }   from "../src/sim/ai/decide.js";
import { AI_PRESETS }                from "../src/sim/ai/presets.js";
import { STARTER_WEAPONS, STARTER_ARMOUR } from "../src/equipment.js";
import {
  exposeToDisease, stepDiseaseForEntity, spreadDisease,
  type NearbyPair,
} from "../src/sim/disease.js";
import type { Entity }               from "../src/sim/entity.js";
import type { KernelContext }        from "../src/sim/context.js";

const M    = SCALE.m;
const SQ   = SCALE.Q;
const CTX: KernelContext = { tractionCoeff: q(0.90) as Q };
const SNAP_EVERY = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntity(
  id: number, teamId: number, seed: number,
  arch: typeof KNIGHT_INFANTRY,
  weaponId: string, armourId?: string,
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

type SnapState = {
  id: number; shock: number; consciousness: number; fatigue: number; dead: boolean;
};
type ZooEvent  = { tick: number; type: string; label: string };
type Snapshot  = { tick: number; states: SnapState[] };

interface EntityMeta {
  id: number; label: string; teamId: number; archetype: string;
}

interface ZooScenario {
  id: string; title: string; description: string; category: string;
  seed: number; finalTick: number; outcome: string;
  entities: EntityMeta[];
  snapshots: Snapshot[];
  events: ZooEvent[];
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

// ── Combat scenario runner ────────────────────────────────────────────────────

function oneTeamDown(entities: Entity[]): boolean {
  const teams = new Set(entities.map(e => e.teamId));
  for (const team of teams) {
    if (entities.filter(e => e.teamId === team).every(
      e => e.injury.dead || e.injury.consciousness === 0)) return true;
  }
  return false;
}

function runCombat(
  id: string, title: string, description: string, seed: number,
  entities: Entity[], metas: EntityMeta[],
  maxTicks = 600,
): ZooScenario {
  const world = { tick: 0, seed, entities };
  const snapshots: Snapshot[] = [snapOf(entities, 0)];
  const events:    ZooEvent[] = [];

  const prevShock = new Map(entities.map(e => [e.id, e.injury.shock]));
  const prevDead  = new Map(entities.map(e => [e.id, false]));

  for (let t = 0; t < maxTicks; t++) {
    if (oneTeamDown(entities)) break;

    const index   = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * M));
    const cmds    = new Map<number, ReturnType<typeof decideCommandsForEntity>>();
    for (const e of world.entities)
      if (!e.injury.dead)
        cmds.set(e.id, decideCommandsForEntity(world, index, spatial, e, AI_PRESETS.lineInfantry!));

    stepWorld(world, cmds, CTX);

    for (const e of world.entities) {
      const lbl  = metas.find(m => m.id === e.id)?.label ?? `Entity ${e.id}`;
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
  const winnerMeta = metas.find(m => m.teamId === winnerTeam && survivors.some(s => s.id === m.id));
  const outcome = survivors.length === 0
    ? "Both combatants down"
    : `${winnerMeta?.label ?? "Team " + winnerTeam} wins at tick ${world.tick}`;

  return { id, title, description, category: "combat", seed,
           finalTick: world.tick, outcome, entities: metas, snapshots, events };
}

// ── Disease scenario ──────────────────────────────────────────────────────────

function runDisease(): ZooScenario {
  const SEED = 42;
  const positions = [
    [0, 0], [1, 0], [2, 0], [0, 1], [1, 1],
  ].map(([x, y]) => [Math.trunc(x! * M), Math.trunc(y! * M)] as [number, number]);

  const entities: Entity[] = positions.map(([x, y], i) => {
    const e = makeEntity(i + 1, 1, SEED + i, HUMAN_BASE, "wpn_club", undefined, x, y);
    return e;
  });
  exposeToDisease(entities[0]!, "plague_pneumonic");

  const metas: EntityMeta[] = entities.map((e, i) => ({
    id: e.id,
    label: i === 0 ? "Patient Zero" : `Villager ${i + 1}`,
    teamId: 1,
    archetype: "HUMAN_BASE",
  }));

  const HOURS = 30 * 24;
  const DELTA_S = 3600;
  const snapshots: Snapshot[] = [];
  const events:    ZooEvent[] = [];

  const diseaseSnap = (tick: number): Snapshot => ({
    tick,
    states: entities.map(e => ({
      id:            e.id,
      shock:         0,
      consciousness: SQ,
      fatigue:       e.energy.fatigue,
      dead:          e.injury.dead,
    })),
  });
  snapshots.push(diseaseSnap(0));

  const prevInfected = new Map(entities.map(e => [e.id, false]));
  const prevDead     = new Map(entities.map(e => [e.id, false]));

  for (let hour = 1; hour <= HOURS; hour++) {
    const entityMap = new Map<number, Entity>(entities.map(e => [e.id, e]));
    const pairs: NearbyPair[] = [];
    for (let i = 0; i < entities.length; i++)
      for (let j = 0; j < entities.length; j++) {
        if (i === j) continue;
        const a = entities[i]!, b = entities[j]!;
        const dx = a.position_m.x - b.position_m.x;
        const dy = a.position_m.y - b.position_m.y;
        const dist = Math.trunc(Math.sqrt(dx * dx + dy * dy));
        pairs.push({ carrierId: a.id, targetId: b.id, dist_Sm: dist });
      }
    spreadDisease(entityMap, pairs, SEED, hour);
    for (const e of entities) stepDiseaseForEntity(e, DELTA_S, SEED, hour);

    for (const e of entities) {
      const lbl = metas.find(m => m.id === e.id)?.label ?? `Entity ${e.id}`;
      const inf = (e.activeDiseases?.length ?? 0) > 0;
      if (inf && !prevInfected.get(e.id)) {
        events.push({ tick: hour, type: "infection", label: `${lbl} infected (hour ${hour})` });
        prevInfected.set(e.id, true);
      }
      if (e.injury.dead && !prevDead.get(e.id)) {
        events.push({ tick: hour, type: "death", label: `${lbl} dies from plague (hour ${hour})` });
        prevDead.set(e.id, true);
      }
      prevDead.set(e.id, e.injury.dead);
    }

    if (hour % 24 === 0) snapshots.push(diseaseSnap(hour));
  }

  const dead = entities.filter(e => e.injury.dead).length;
  return {
    id: "plague-spread", title: "Pneumonic Plague", category: "disease", seed: SEED,
    description: "Patient Zero is exposed to plague_pneumonic in a village of 5 at hour 0. " +
                 "Watch the epidemic unfold over 30 days. " +
                 "Mortality rate: 60%. No treatment.",
    finalTick: HOURS, outcome: `${dead} of 5 villagers died in 30 days`,
    entities: metas, snapshots, events,
  };
}

// ── Run all scenarios ─────────────────────────────────────────────────────────

console.log("Running scenarios...");

const scenarios: ZooScenario[] = [];

// 1 — Knight vs Brawler
scenarios.push(runCombat(
  "knight-vs-brawler", "Knight vs Brawler",
  "Armoured professional (mail + longsword) against an unequipped brawler (club). " +
  "A textbook mismatch — armour dramatically extends survival.",
  1,
  [
    makeEntity(1, 1, 1,   KNIGHT_INFANTRY, "wpn_longsword", "arm_mail",  0,              0),
    makeEntity(2, 2, 2,   HUMAN_BASE,      "wpn_club",       undefined, Math.trunc(0.6 * M), 0),
  ],
  [
    { id: 1, label: "Knight",  teamId: 1, archetype: "KNIGHT_INFANTRY" },
    { id: 2, label: "Brawler", teamId: 2, archetype: "HUMAN_BASE" },
  ],
));
console.log(`  ✓ knight-vs-brawler (finalTick=${scenarios[0]!.finalTick})`);

// 2 — Two Knights (mirror match)
scenarios.push(runCombat(
  "two-knights", "Two Knights",
  "Two equally-equipped knights (mail + longsword) with the same archetype but different " +
  "random seeds. Small individual variation determines the winner.",
  7,
  [
    makeEntity(1, 1, 7,   KNIGHT_INFANTRY, "wpn_longsword", "arm_mail",  0,              0),
    makeEntity(2, 2, 11,  KNIGHT_INFANTRY, "wpn_longsword", "arm_mail",  Math.trunc(0.6 * M), 0),
  ],
  [
    { id: 1, label: "Knight A", teamId: 1, archetype: "KNIGHT_INFANTRY" },
    { id: 2, label: "Knight B", teamId: 2, archetype: "KNIGHT_INFANTRY" },
  ],
));
console.log(`  ✓ two-knights (finalTick=${scenarios[1]!.finalTick})`);

// 3 — Knight vs Pro Boxer
scenarios.push(runCombat(
  "knight-vs-boxer", "Knight vs Pro Boxer",
  "An armoured knight faces a peak-performance professional boxer. " +
  "Speed and power vs. armour and training. The boxer lands harder but armour absorbs.",
  3,
  [
    makeEntity(1, 1, 3,  KNIGHT_INFANTRY, "wpn_longsword", "arm_mail",   0,              0),
    makeEntity(2, 2, 5,  PRO_BOXER,       "wpn_boxing_gloves", undefined, Math.trunc(0.6 * M), 0),
  ],
  [
    { id: 1, label: "Knight",    teamId: 1, archetype: "KNIGHT_INFANTRY" },
    { id: 2, label: "Pro Boxer", teamId: 2, archetype: "PRO_BOXER" },
  ],
));
console.log(`  ✓ knight-vs-boxer (finalTick=${scenarios[2]!.finalTick})`);

// 4 — 3v3 Squad Battle
const SQUAD_SEP = Math.trunc(0.7 * M);
const SQUAD_GAP = Math.trunc(0.5 * M);
scenarios.push(runCombat(
  "squad-battle", "3v3 Squad Battle",
  "Three mail-clad knights against three unarmoured brawlers. " +
  "Armour advantage compounds: the side that loses a member first collapses quickly.",
  13,
  [
    makeEntity(1, 1, 13, KNIGHT_INFANTRY, "wpn_longsword", "arm_mail", 0,          -SQUAD_GAP),
    makeEntity(2, 1, 14, KNIGHT_INFANTRY, "wpn_longsword", "arm_mail", 0,          0),
    makeEntity(3, 1, 15, KNIGHT_INFANTRY, "wpn_longsword", "arm_mail", 0,          SQUAD_GAP),
    makeEntity(4, 2, 16, HUMAN_BASE,      "wpn_club", undefined, SQUAD_SEP, -SQUAD_GAP),
    makeEntity(5, 2, 17, HUMAN_BASE,      "wpn_club", undefined, SQUAD_SEP, 0),
    makeEntity(6, 2, 18, HUMAN_BASE,      "wpn_club", undefined, SQUAD_SEP, SQUAD_GAP),
  ],
  [
    { id: 1, label: "Knight 1", teamId: 1, archetype: "KNIGHT_INFANTRY" },
    { id: 2, label: "Knight 2", teamId: 1, archetype: "KNIGHT_INFANTRY" },
    { id: 3, label: "Knight 3", teamId: 1, archetype: "KNIGHT_INFANTRY" },
    { id: 4, label: "Brawler 1", teamId: 2, archetype: "HUMAN_BASE" },
    { id: 5, label: "Brawler 2", teamId: 2, archetype: "HUMAN_BASE" },
    { id: 6, label: "Brawler 3", teamId: 2, archetype: "HUMAN_BASE" },
  ],
));
console.log(`  ✓ squad-battle (finalTick=${scenarios[3]!.finalTick})`);

// 5 — Plague spread
scenarios.push(runDisease());
console.log(`  ✓ plague-spread (events=${scenarios[4]!.events.length})`);

// ── HTML generation ───────────────────────────────────────────────────────────

const DATA_JSON = JSON.stringify(scenarios);
const GEN_DATE  = new Date().toISOString().slice(0, 10);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ananke — Simulation Zoo</title>
<style>
  :root{--bg:#0f1117;--surface:#1a1d27;--surface2:#22263a;--border:#2e3245;--text:#e0e4f0;
    --muted:#7a81a0;--pass:#22c55e;--fail:#ef4444;--accent:#6366f1;--warn:#f59e0b;--cyan:#22d3ee;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:ui-monospace,"Cascadia Code",Menlo,monospace;font-size:13px;display:flex;flex-direction:column;height:100vh;overflow:hidden}
  header{padding:.75rem 1.25rem;border-bottom:1px solid var(--border);display:flex;align-items:baseline;gap:1rem;flex-shrink:0}
  header h1{font-size:1.1rem}
  header .sub{color:var(--muted);font-size:.78rem}
  .gen-date{color:var(--muted);font-size:.72rem;margin-left:auto}
  .body{display:flex;flex:1;overflow:hidden}
  /* Sidebar */
  .sidebar{width:260px;border-right:1px solid var(--border);overflow-y:auto;flex-shrink:0;padding:.5rem}
  .sc-card{background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:.7rem .85rem;margin-bottom:.4rem;cursor:pointer;transition:border-color .12s}
  .sc-card:hover{border-color:var(--accent)}
  .sc-card.active{border-color:var(--accent);background:var(--surface2)}
  .sc-title{font-size:.82rem;font-weight:700;margin-bottom:.2rem}
  .sc-outcome{color:var(--muted);font-size:.72rem;margin-bottom:.3rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cat-badge{display:inline-block;border-radius:3px;font-size:.65rem;font-weight:700;padding:.1rem .3rem;text-transform:uppercase;letter-spacing:.04em}
  .cat-combat{background:#1e1b4b;color:#a5b4fc}
  .cat-disease{background:#1c1917;color:#fde68a}
  .cat-squad{background:#052e16;color:#86efac}
  /* Detail */
  .detail{flex:1;overflow-y:auto;padding:1.25rem 1.5rem}
  .detail-title{font-size:1.1rem;font-weight:700;margin-bottom:.2rem}
  .detail-desc{color:var(--muted);font-size:.82rem;margin-bottom:1rem;line-height:1.5}
  .stats{background:var(--surface);border:1px solid var(--border);border-radius:6px;display:flex;gap:1.5rem;padding:.6rem 1rem;margin-bottom:1rem;flex-wrap:wrap}
  .stat{display:flex;flex-direction:column;gap:.1rem}
  .stat-val{font-size:1rem;font-weight:700;color:var(--cyan)}
  .stat-label{color:var(--muted);font-size:.7rem;text-transform:uppercase;letter-spacing:.05em}
  /* Health tracks */
  .sec-head{color:var(--warn);font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin:.9rem 0 .4rem}
  .tracks{display:flex;flex-direction:column;gap:.45rem;margin-bottom:1rem}
  .track-row{display:flex;align-items:center;gap:.6rem}
  .track-label{width:90px;font-size:.72rem;color:var(--muted);text-align:right;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .track-cells{display:flex;gap:2px;flex:1;min-width:0}
  .tc{height:16px;border-radius:2px;flex:1;min-width:4px;cursor:default;transition:opacity .1s;position:relative}
  .tc:hover::after{content:attr(data-tip);position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:#000;border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:.7rem;padding:.1rem .3rem;white-space:nowrap;pointer-events:none;z-index:10}
  .track-outcome{font-size:.7rem;font-weight:700;margin-left:.4rem;flex-shrink:0}
  .outcome-win{color:var(--pass)}.outcome-dead{color:var(--fail)}.outcome-alive{color:var(--cyan)}
  /* Events */
  .events{max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:4px}
  .ev{display:flex;gap:.6rem;padding:.3rem .6rem;border-bottom:1px solid var(--border);font-size:.75rem}
  .ev:last-child{border-bottom:none}
  .ev-tick{color:var(--muted);min-width:60px;flex-shrink:0}
  .ev-hit{color:var(--warn)}.ev-death{color:var(--fail)}.ev-infection{color:var(--rose, #fb7185)}
  .empty{color:var(--muted);font-size:.82rem;padding:2rem;text-align:center}
  /* Legend */
  .legend{display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.6rem;align-items:center}
  .leg-item{display:flex;align-items:center;gap:.3rem;font-size:.7rem;color:var(--muted)}
  .leg-swatch{width:14px;height:10px;border-radius:2px}
</style>
</head>
<body>
<header>
  <h1>Ananke — Simulation Zoo</h1>
  <span class="sub">Pre-computed scenario archive. Physics-grounded, deterministic, seed-reproducible.</span>
  <span class="gen-date">Generated ${GEN_DATE}</span>
</header>
<div class="body">
  <div class="sidebar" id="sidebar"></div>
  <div class="detail" id="detail"><div class="empty">Select a scenario to explore.</div></div>
</div>

<script>
const SCENARIOS = ${DATA_JSON};
const SQ = 10000;

function cellColor(state, category) {
  if (state.dead) return '#111827';
  if (category === 'disease') {
    const health = Math.max(0, (SQ - state.fatigue) / SQ);
    if (health > 0.8) return '#22c55e';
    if (health > 0.6) return '#84cc16';
    if (health > 0.4) return '#f59e0b';
    if (health > 0.2) return '#ef4444';
    return '#7f1d1d';
  }
  const c = state.consciousness / SQ;
  if (c > 0.8) return '#22c55e';
  if (c > 0.6) return '#84cc16';
  if (c > 0.4) return '#f59e0b';
  if (c > 0.2) return '#ef4444';
  if (c > 0) return '#7f1d1d';
  return '#111827';
}

function tipFor(snap, state, category) {
  if (state.dead) return 'tick ' + snap.tick + ': DEAD';
  if (category === 'disease') {
    const pct = Math.round((SQ - state.fatigue) / SQ * 100);
    return 'tick ' + snap.tick + ': health ' + pct + '%';
  }
  const c = Math.round(state.consciousness / SQ * 100);
  const s = Math.round(state.shock / SQ * 100);
  return 'tick ' + snap.tick + ': con ' + c + '% shock ' + s + '%';
}

function renderSidebar() {
  const el = document.getElementById('sidebar');
  el.innerHTML = SCENARIOS.map((s, i) =>
    '<div class="sc-card" id="sc-' + i + '" onclick="showScenario(' + i + ')">' +
      '<div class="sc-title">' + s.title + '</div>' +
      '<div class="sc-outcome">' + s.outcome + '</div>' +
      '<span class="cat-badge cat-' + (s.category === 'squad' ? 'squad' : s.category) + '">' + s.category + '</span>' +
    '</div>'
  ).join('');
}

function showScenario(idx) {
  document.querySelectorAll('.sc-card').forEach((c, i) => c.classList.toggle('active', i === idx));
  const s = SCENARIOS[idx];
  if (!s) return;

  const catClass = s.category === 'squad' ? 'squad' : s.category;
  const isDisease = s.category === 'disease';
  const tickLabel = isDisease ? 'hours' : 'ticks';

  // Build track HTML
  const trackHTML = s.entities.map(meta => {
    const finalState = s.snapshots.at(-1)?.states.find(st => st.id === meta.id);
    const dead = finalState?.dead ?? false;
    const cells = s.snapshots.map(snap => {
      const st = snap.states.find(st => st.id === meta.id);
      if (!st) return '';
      const color = cellColor(st, s.category);
      const tip   = tipFor(snap, st, s.category);
      return '<div class="tc" style="background:' + color + '" data-tip="' + tip + '"></div>';
    }).join('');

    const teamBadge = s.entities.filter(e => e.teamId !== meta.teamId).length > 0
      ? '<span style="color:var(--muted);font-size:.65rem">[T' + meta.teamId + ']</span> '
      : '';
    const outcomeClass = dead ? 'outcome-dead' : 'outcome-alive';
    const outcomeLabel = dead ? 'DEAD' : 'ALIVE';

    return '<div class="track-row">' +
      '<div class="track-label">' + teamBadge + meta.label + '</div>' +
      '<div class="track-cells">' + cells + '</div>' +
      '<div class="track-outcome ' + outcomeClass + '">' + outcomeLabel + '</div>' +
    '</div>';
  }).join('');

  // Build events HTML
  const evHTML = s.events.length === 0
    ? '<div style="padding:.5rem .75rem;color:var(--muted);font-size:.78rem">No significant events recorded.</div>'
    : s.events.map(ev => {
        const cls = 'ev-' + ev.type;
        const label = isDisease ? 'hr ' + ev.tick : 'tick ' + ev.tick;
        return '<div class="ev"><span class="ev-tick">' + label + '</span>' +
               '<span class="' + cls + '">' + ev.label + '</span></div>';
      }).join('');

  const healthLabel = isDisease ? 'Energy / Fatigue Drain' : 'Consciousness over time';

  document.getElementById('detail').innerHTML =
    '<div class="detail-title">' + s.title +
      ' <span class="cat-badge cat-' + catClass + '" style="font-size:.7rem;vertical-align:middle">' + s.category + '</span>' +
    '</div>' +
    '<p class="detail-desc">' + s.description + '</p>' +
    '<div class="stats">' +
      '<div class="stat"><span class="stat-val">' + s.entities.length + '</span><span class="stat-label">Entities</span></div>' +
      '<div class="stat"><span class="stat-val">' + s.finalTick + '</span><span class="stat-label">Final ' + tickLabel + '</span></div>' +
      '<div class="stat"><span class="stat-val">' + s.snapshots.length + '</span><span class="stat-label">Snapshots</span></div>' +
      '<div class="stat"><span class="stat-val">' + s.seed + '</span><span class="stat-label">Seed</span></div>' +
    '</div>' +
    '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:.6rem 1rem;margin-bottom:1rem;font-size:.82rem">' +
      '<strong>Outcome:</strong> <span style="color:var(--pass)">' + s.outcome + '</span>' +
    '</div>' +
    '<div class="sec-head">' + healthLabel + '</div>' +
    '<div class="legend">' +
      '<span style="color:var(--muted);font-size:.72rem">Health:</span>' +
      '<div class="leg-item"><div class="leg-swatch" style="background:#22c55e"></div>>80%</div>' +
      '<div class="leg-item"><div class="leg-swatch" style="background:#84cc16"></div>60–80%</div>' +
      '<div class="leg-item"><div class="leg-swatch" style="background:#f59e0b"></div>40–60%</div>' +
      '<div class="leg-item"><div class="leg-swatch" style="background:#ef4444"></div>20–40%</div>' +
      '<div class="leg-item"><div class="leg-swatch" style="background:#7f1d1d"></div><20%</div>' +
      '<div class="leg-item"><div class="leg-swatch" style="background:#111827;border:1px solid #374151"></div>Dead</div>' +
    '</div>' +
    '<div class="tracks">' + trackHTML + '</div>' +
    '<div class="sec-head">Events (' + s.events.length + ')</div>' +
    '<div class="events">' + evHTML + '</div>';
}

renderSidebar();
showScenario(0);
</script>
</body>
</html>`;

mkdirSync("docs/zoo", { recursive: true });
writeFileSync("docs/zoo/index.html", html);
console.log(`\n✓ docs/zoo/index.html written (${scenarios.length} scenarios)`);
