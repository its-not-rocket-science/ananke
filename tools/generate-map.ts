// tools/generate-map.ts — Generative Cartography
//
// Runs a 180-day world simulation (5 polities, 15 locations, trade + war + tech diffusion)
// and writes a self-contained docs/map/index.html with an interactive SVG map viewer.
//
// Run:  npm run build && node dist/tools/generate-map.js

import { writeFileSync, mkdirSync } from "node:fs";
import { q, SCALE, type Q }         from "../src/units.js";
import { TechEra }                   from "../src/sim/tech.js";
import {
  createPolity, createPolityRegistry,
  stepPolityDay, declareWar, makePeace,
  type PolityPair,
} from "../src/polity.js";
import { stepTechDiffusion, techEraName } from "../src/tech-diffusion.js";

// ── World geography ───────────────────────────────────────────────────────────
// Each location has a map position (px) used only by the viewer.

const LOCS: Array<{ id: string; name: string; polityId: string; x: number; y: number }> = [
  // Iron Clans — NW
  { id: "ironholt",    name: "Ironholt",     polityId: "iron_clans",      x: 115, y:  95 },
  { id: "forge_peak",  name: "Forge Peak",   polityId: "iron_clans",      x: 185, y: 125 },
  { id: "ashfield",    name: "Ashfield",     polityId: "iron_clans",      x: 140, y: 185 },
  // Merchant League — Centre
  { id: "crossroads",  name: "Crossroads",   polityId: "merchant_league", x: 380, y: 285 },
  { id: "harbor_town", name: "Harbor Town",  polityId: "merchant_league", x: 315, y: 330 },
  { id: "silver_gate", name: "Silver Gate",  polityId: "merchant_league", x: 445, y: 305 },
  // Sun Theocracy — East
  { id: "dawn_citadel",name: "Dawn Citadel", polityId: "sun_theocracy",   x: 625, y: 135 },
  { id: "sun_temple",  name: "Sun Temple",   polityId: "sun_theocracy",   x: 675, y: 205 },
  { id: "radiant_port",name: "Radiant Port", polityId: "sun_theocracy",   x: 645, y: 275 },
  // Plains Nomads — SW
  { id: "dustwatch",   name: "Dustwatch",    polityId: "plains_nomads",   x: 165, y: 375 },
  { id: "grasshaven",  name: "Grasshaven",   polityId: "plains_nomads",   x: 225, y: 425 },
  { id: "windsteppe",  name: "Windsteppe",   polityId: "plains_nomads",   x: 170, y: 480 },
  // Ancient Library — South
  { id: "great_archive",name: "Great Archive",polityId: "ancient_library",x: 415, y: 510 },
  { id: "scholars_rest",name: "Scholar's Rest",polityId:"ancient_library",x: 475, y: 485 },
  { id: "ember_keep",  name: "Ember Keep",   polityId: "ancient_library", x: 385, y: 565 },
];

const POLITY_DEFS = [
  { id: "iron_clans",      name: "Iron Clans",      pop: 180_000, treasury: 1_200, era: TechEra.Ancient,
    stability: q(0.65) as Q, morale: q(0.72) as Q, color: "#ef4444" },
  { id: "merchant_league", name: "Merchant League", pop: 220_000, treasury: 4_500, era: TechEra.Medieval,
    stability: q(0.75) as Q, morale: q(0.80) as Q, color: "#f59e0b" },
  { id: "sun_theocracy",   name: "Sun Theocracy",   pop: 160_000, treasury: 2_800, era: TechEra.Medieval,
    stability: q(0.85) as Q, morale: q(0.78) as Q, color: "#a855f7" },
  { id: "plains_nomads",   name: "Plains Nomads",   pop: 120_000, treasury:   900, era: TechEra.Prehistoric,
    stability: q(0.60) as Q, morale: q(0.68) as Q, color: "#22c55e" },
  { id: "ancient_library", name: "Ancient Library", pop: 95_000,  treasury: 6_000, era: TechEra.EarlyModern,
    stability: q(0.90) as Q, morale: q(0.85) as Q, color: "#22d3ee" },
];

const PAIRS: PolityPair[] = [
  { polityAId: "iron_clans",      polityBId: "merchant_league", sharedLocations: 2, routeQuality_Q: q(0.60) as Q },
  { polityAId: "merchant_league", polityBId: "sun_theocracy",   sharedLocations: 2, routeQuality_Q: q(0.75) as Q },
  { polityAId: "merchant_league", polityBId: "plains_nomads",   sharedLocations: 2, routeQuality_Q: q(0.55) as Q },
  { polityAId: "merchant_league", polityBId: "ancient_library", sharedLocations: 2, routeQuality_Q: q(0.80) as Q },
  { polityAId: "sun_theocracy",   polityBId: "ancient_library", sharedLocations: 1, routeQuality_Q: q(0.65) as Q },
  { polityAId: "plains_nomads",   polityBId: "ancient_library", sharedLocations: 1, routeQuality_Q: q(0.50) as Q },
];

// ── Build Ananke objects ──────────────────────────────────────────────────────

const polities = POLITY_DEFS.map(d =>
  createPolity(d.id, d.name, d.id, LOCS.filter(l => l.polityId === d.id).map(l => l.id),
               d.pop, d.treasury, d.era, d.stability, d.morale));
const registry = createPolityRegistry(polities);

// ── Simulation ────────────────────────────────────────────────────────────────

const DAYS    = 180;
const SEED    = 42;
const SNAP_EVERY = 5;

interface DaySnap {
  day:      number;
  polities: Array<{
    id: string; treasury: number; morale: number; stability: number;
    techEra: number; locationIds: string[]; militaryStrength: number;
  }>;
  wars:         string[];
  tradeIncome:  Array<{ a: string; b: string; income: number }>;
  techAdvances: Array<{ polityId: string; newEra: number }>;
}

const snapshots: DaySnap[] = [];
const allTechAdvances: DaySnap["techAdvances"] = [];

function takeSnap(day: number, trade: DaySnap["tradeIncome"], tech: DaySnap["techAdvances"]): DaySnap {
  return {
    day,
    polities: [...registry.polities.values()].map(p => ({
      id: p.id,
      treasury:        p.treasury_cu,
      morale:          p.moraleQ / SCALE.Q,
      stability:       p.stabilityQ / SCALE.Q,
      techEra:         p.techEra,
      locationIds:     [...p.locationIds],
      militaryStrength:p.militaryStrength_Q / SCALE.Q,
    })),
    wars:        [...registry.activeWars],
    tradeIncome: trade,
    techAdvances:tech,
  };
}

snapshots.push(takeSnap(0, [], []));

for (let day = 1; day <= DAYS; day++) {
  // Scheduled war declarations / peace
  if (day === 20)  declareWar(registry, "iron_clans",    "merchant_league");
  if (day === 65)  makePeace(registry,  "iron_clans",    "merchant_league");
  if (day === 75)  declareWar(registry, "sun_theocracy", "plains_nomads");
  if (day === 130) makePeace(registry,  "sun_theocracy", "plains_nomads");

  const dayResult  = stepPolityDay(registry, PAIRS, SEED, day);
  const techResult = stepTechDiffusion(registry, PAIRS, SEED, day);

  const trade = dayResult.trade.map(t => ({ a: t.polityAId, b: t.polityBId, income: t.incomeEach_cu }));
  const tech  = techResult.map(t => ({ polityId: t.polityId, newEra: t.newTechEra }));
  if (tech.length) allTechAdvances.push(...tech);

  if (day % SNAP_EVERY === 0 || day === DAYS) snapshots.push(takeSnap(day, trade, tech));
}

console.log(`Simulation complete: ${DAYS} days, ${snapshots.length} snapshots`);
console.log(`Tech advances: ${allTechAdvances.map(t => `${t.polityId}→era${t.newEra}`).join(", ") || "none"}`);
console.log(`Final state:`);
for (const [, p] of registry.polities) {
  console.log(`  ${p.name}: era=${techEraName(p.techEra)} treasury=${p.treasury_cu} locs=${p.locationIds.length}`);
}

// ── HTML generation ───────────────────────────────────────────────────────────

const GEN_DATE = new Date().toISOString().slice(0, 10);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ananke — Generative Cartography</title>
<style>
  :root{--bg:#0f1117;--surface:#1a1d27;--surface2:#22263a;--border:#2e3245;--text:#e0e4f0;
    --muted:#7a81a0;--accent:#6366f1;--warn:#f59e0b;--cyan:#22d3ee;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:ui-monospace,"Cascadia Code",Menlo,monospace;font-size:13px;display:flex;flex-direction:column;height:100vh;overflow:hidden}
  header{padding:.6rem 1.25rem;border-bottom:1px solid var(--border);display:flex;align-items:baseline;gap:1rem;flex-shrink:0}
  header h1{font-size:1.05rem}
  .sub{color:var(--muted);font-size:.78rem}
  .gen-date{color:var(--muted);font-size:.72rem;margin-left:auto}
  /* Layout */
  .body{display:flex;flex:1;overflow:hidden;gap:0}
  .map-col{flex:1;display:flex;flex-direction:column;border-right:1px solid var(--border);min-width:0}
  .controls{padding:.6rem 1rem;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:1rem;flex-shrink:0;flex-wrap:wrap}
  .day-label{color:var(--warn);font-weight:700;font-size:.85rem;min-width:80px}
  input[type=range]{flex:1;-webkit-appearance:none;appearance:none;background:var(--border);border-radius:2px;height:4px;outline:none;cursor:pointer}
  input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;border-radius:50%;background:var(--accent);cursor:pointer}
  .map-wrap{flex:1;overflow:hidden;display:flex;align-items:center;justify-content:center;padding:.5rem}
  svg#map{width:100%;height:100%;max-width:820px;max-height:640px}
  /* Right panel */
  .stats-col{width:280px;overflow-y:auto;flex-shrink:0;padding:.75rem}
  .sec-head{color:var(--warn);font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin:.75rem 0 .35rem}
  .sec-head:first-child{margin-top:0}
  .polity-card{background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:.6rem .75rem;margin-bottom:.4rem;border-left-width:3px}
  .pc-header{display:flex;align-items:center;gap:.4rem;margin-bottom:.35rem}
  .pc-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
  .pc-name{font-weight:700;font-size:.8rem}
  .pc-era{color:var(--cyan);font-size:.7rem;margin-left:auto}
  .pc-grid{display:grid;grid-template-columns:1fr 1fr;gap:.2rem .75rem;font-size:.72rem}
  .pc-key{color:var(--muted)}
  .pc-val{font-weight:600;color:var(--text)}
  .pc-locs{font-size:.7rem;color:var(--muted);margin-top:.3rem;border-top:1px solid var(--border);padding-top:.3rem}
  .war-badge{background:#450a0a;color:#fca5a5;border-radius:3px;font-size:.65rem;font-weight:700;padding:.1rem .3rem}
  /* Events */
  .events{max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:4px}
  .ev{padding:.25rem .5rem;border-bottom:1px solid var(--border);font-size:.72rem}
  .ev:last-child{border-bottom:none}
  .ev-day{color:var(--muted);min-width:45px;display:inline-block}
  .ev-war{color:#fca5a5}.ev-peace{color:#86efac}.ev-tech{color:var(--cyan)}
  /* Legend */
  .legend{display:flex;gap:.5rem;flex-wrap:wrap;padding:.5rem .75rem;border-top:1px solid var(--border);font-size:.7rem;flex-shrink:0}
  .leg{display:flex;align-items:center;gap:.3rem}
  .leg-dot{width:9px;height:9px;border-radius:50%}
  .leg-war{width:18px;height:2px;background:#ef4444;border:1px dashed #ef4444}
  .leg-trade{width:18px;height:2px;background:#22d3ee;opacity:.6}
</style>
</head>
<body>
<header>
  <h1>Ananke — Generative Cartography</h1>
  <span class="sub">180-day world simulation · 5 polities · trade, war &amp; tech diffusion</span>
  <span class="gen-date">Generated ${GEN_DATE}</span>
</header>
<div class="body">
  <div class="map-col">
    <div class="controls">
      <span class="day-label" id="day-label">Day 0</span>
      <input type="range" id="timeline" min="0" max="${snapshots.length - 1}" value="0" oninput="seek(+this.value)">
      <span style="color:var(--muted);font-size:.72rem">Day ${DAYS}</span>
    </div>
    <div class="map-wrap">
      <svg id="map" viewBox="0 0 800 620" xmlns="http://www.w3.org/2000/svg">
        <!-- Background -->
        <rect width="800" height="620" fill="#0d1117"/>
        <radialGradient id="rg1" cx="30%" cy="20%" r="45%"><stop offset="0%" stop-color="#1a2435"/><stop offset="100%" stop-color="#0d1117"/></radialGradient>
        <radialGradient id="rg2" cx="70%" cy="75%" r="45%"><stop offset="0%" stop-color="#1a2520"/><stop offset="100%" stop-color="#0d1117"/></radialGradient>
        <rect width="800" height="620" fill="url(#rg1)"/>
        <rect width="800" height="620" fill="url(#rg2)" opacity="0.6"/>
        <!-- Dynamic SVG layers populated by JS -->
        <g id="territories"></g>
        <g id="routes"></g>
        <g id="war-lines"></g>
        <g id="nodes"></g>
        <g id="labels"></g>
      </svg>
    </div>
    <div class="legend">
      <div class="leg"><div class="leg-trade"></div>Trade route</div>
      <div class="leg"><div class="leg-war"></div>Active war</div>
      ${POLITY_DEFS.map(p => `<div class="leg"><div class="leg-dot" style="background:${p.color}"></div>${p.name}</div>`).join("")}
    </div>
  </div>
  <div class="stats-col">
    <div class="sec-head">Polity Status</div>
    <div id="polity-cards"></div>
    <div class="sec-head">Historical Events</div>
    <div class="events" id="events-log"></div>
  </div>
</div>

<script>
const SNAPS = ${JSON.stringify(snapshots)};
const LOCS  = ${JSON.stringify(LOCS)};
const POLITY_DEFS = ${JSON.stringify(POLITY_DEFS)};
const PAIRS = ${JSON.stringify(PAIRS.map(p => ({ a: p.polityAId, b: p.polityBId })))};
const ERA_NAMES = ["Prehistoric","Ancient","Medieval","EarlyModern","Industrial","Modern","NearFuture","FarFuture","DeepSpace"];

// Build location lookup
const locMap = new Map(LOCS.map(l => [l.id, l]));
const polityColor = new Map(POLITY_DEFS.map(p => [p.id, p.color]));
const polityName  = new Map(POLITY_DEFS.map(p => [p.id, p.name]));

function cross(O, A, B) {
  return (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
}
function convexHull(pts) {
  if (pts.length <= 2) return pts;
  const sorted = [...pts].sort((a,b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
  const lo = [], hi = [];
  for (const p of sorted) {
    while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), p) <= 0) lo.pop();
    lo.push(p);
  }
  for (const p of [...sorted].reverse()) {
    while (hi.length >= 2 && cross(hi.at(-2), hi.at(-1), p) <= 0) hi.pop();
    hi.push(p);
  }
  return [...lo.slice(0,-1), ...hi.slice(0,-1)];
}
function expandHull(hull, cx, cy, pad) {
  return hull.map(p => {
    const dx = p.x - cx, dy = p.y - cy;
    const d  = Math.sqrt(dx*dx + dy*dy) || 1;
    return { x: p.x + dx/d*pad, y: p.y + dy/d*pad };
  });
}
function pointsStr(pts) { return pts.map(p => p.x+','+p.y).join(' '); }

function svgEl(tag, attrs, inner) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (inner !== undefined) el.innerHTML = inner;
  return el;
}

function renderMap(snapIdx) {
  const snap = SNAPS[snapIdx];
  if (!snap) return;

  // Build ownership map: locationId → polityId
  const ownership = new Map();
  for (const ps of snap.polities)
    for (const lid of ps.locationIds)
      ownership.set(lid, ps.id);

  // Clear layers
  ["territories","routes","war-lines","nodes","labels"].forEach(id => {
    document.getElementById(id).innerHTML = '';
  });

  const territories = document.getElementById('territories');
  const routes      = document.getElementById('routes');
  const warLines    = document.getElementById('war-lines');
  const nodes       = document.getElementById('nodes');
  const labels      = document.getElementById('labels');

  // Territories (convex hulls of owned locations, padded 28px)
  for (const ps of snap.polities) {
    if (!ps.locationIds.length) continue;
    const pts = ps.locationIds.map(lid => locMap.get(lid)).filter(Boolean);
    if (pts.length < 2) {
      const p = pts[0];
      if (!p) continue;
      territories.appendChild(svgEl('circle', {
        cx: p.x, cy: p.y, r: 35,
        fill: polityColor.get(ps.id) + '22',
        stroke: polityColor.get(ps.id), 'stroke-width': '1',
        'stroke-dasharray': '3,3',
      }));
      continue;
    }
    const hull = convexHull(pts);
    const cx = pts.reduce((s,p)=>s+p.x,0)/pts.length;
    const cy = pts.reduce((s,p)=>s+p.y,0)/pts.length;
    const expanded = expandHull(hull, cx, cy, 28);
    territories.appendChild(svgEl('polygon', {
      points: pointsStr(expanded),
      fill: polityColor.get(ps.id) + '18',
      stroke: polityColor.get(ps.id),
      'stroke-width': '1.5',
      'stroke-dasharray': '4,3',
      rx: '8',
    }));
    // Polity label at centroid
    labels.appendChild(svgEl('text', {
      x: cx, y: cy - 5,
      'text-anchor': 'middle',
      fill: polityColor.get(ps.id),
      'font-size': '10',
      'font-weight': '700',
      'font-family': 'ui-monospace, monospace',
      opacity: '0.8',
    }, polityName.get(ps.id)));
    labels.appendChild(svgEl('text', {
      x: cx, y: cy + 8,
      'text-anchor': 'middle',
      fill: polityColor.get(ps.id),
      'font-size': '8.5',
      'font-family': 'ui-monospace, monospace',
      opacity: '0.6',
    }, 'Era: ' + ERA_NAMES[ps.techEra]));
  }

  // Trade routes (draw between polity pair capitals if no war)
  const wars = new Set(snap.wars);
  for (const pair of PAIRS) {
    const warKey1 = pair.a + ':' + pair.b;
    const warKey2 = pair.b + ':' + pair.a;
    const atWar = wars.has(warKey1) || wars.has(warKey2);

    // Find capital (first owned location) for each polity
    const psA = snap.polities.find(p => p.id === pair.a);
    const psB = snap.polities.find(p => p.id === pair.b);
    if (!psA || !psB) continue;
    const capA = locMap.get(psA.locationIds[0]);
    const capB = locMap.get(psB.locationIds[0]);
    if (!capA || !capB) continue;

    if (atWar) {
      warLines.appendChild(svgEl('line', {
        x1: capA.x, y1: capA.y, x2: capB.x, y2: capB.y,
        stroke: '#ef4444', 'stroke-width': '2',
        'stroke-dasharray': '6,4', opacity: '0.7',
      }));
    } else {
      routes.appendChild(svgEl('line', {
        x1: capA.x, y1: capA.y, x2: capB.x, y2: capB.y,
        stroke: '#22d3ee', 'stroke-width': '1',
        opacity: '0.25',
      }));
    }
  }

  // Location nodes
  for (const loc of LOCS) {
    const ownerPolityId = ownership.get(loc.id);
    const color = ownerPolityId ? polityColor.get(ownerPolityId) : '#374151';
    const isCapital = snap.polities.find(p => p.id === ownerPolityId)?.locationIds[0] === loc.id;
    const r = isCapital ? 9 : 6;

    nodes.appendChild(svgEl('circle', {
      cx: loc.x, cy: loc.y, r: r + 3,
      fill: color + '22',
    }));
    nodes.appendChild(svgEl('circle', {
      cx: loc.x, cy: loc.y, r,
      fill: ownerPolityId ? color : '#1f2937',
      stroke: color, 'stroke-width': isCapital ? '2' : '1',
    }));
    if (isCapital) {
      nodes.appendChild(svgEl('circle', {
        cx: loc.x, cy: loc.y, r: '3',
        fill: '#fff', opacity: '0.8',
      }));
    }
    labels.appendChild(svgEl('text', {
      x: loc.x, y: loc.y + r + 10,
      'text-anchor': 'middle', fill: '#94a3b8',
      'font-size': '8', 'font-family': 'ui-monospace, monospace',
    }, loc.name));
  }
}

function renderStats(snapIdx) {
  const snap = SNAPS[snapIdx];
  if (!snap) return;

  const wars = new Set(snap.wars);

  // Polity cards
  const cardsEl = document.getElementById('polity-cards');
  cardsEl.innerHTML = snap.polities.map(ps => {
    const def = POLITY_DEFS.find(d => d.id === ps.id);
    if (!def) return '';
    const atWar = [...wars].some(w => w.includes(ps.id));
    const warStr = atWar ? ' <span class="war-badge">⚔ AT WAR</span>' : '';
    const locNames = ps.locationIds.map(lid => locMap.get(lid)?.name ?? lid).join(', ');
    return '<div class="polity-card" style="border-left-color:' + def.color + '">' +
      '<div class="pc-header">' +
        '<div class="pc-dot" style="background:' + def.color + '"></div>' +
        '<span class="pc-name">' + def.name + warStr + '</span>' +
        '<span class="pc-era">' + ERA_NAMES[ps.techEra] + '</span>' +
      '</div>' +
      '<div class="pc-grid">' +
        '<span class="pc-key">Treasury</span><span class="pc-val">' + ps.treasury.toLocaleString() + ' cu</span>' +
        '<span class="pc-key">Military</span><span class="pc-val">' + Math.round(ps.militaryStrength * 100) + '%</span>' +
        '<span class="pc-key">Morale</span><span class="pc-val">' + Math.round(ps.morale * 100) + '%</span>' +
        '<span class="pc-key">Stability</span><span class="pc-val">' + Math.round(ps.stability * 100) + '%</span>' +
        '<span class="pc-key">Locations</span><span class="pc-val">' + ps.locationIds.length + '</span>' +
      '</div>' +
      '<div class="pc-locs">' + locNames + '</div>' +
    '</div>';
  }).join('');

  // Events up to this day
  const day = snap.day;
  const events = [];
  for (const s of SNAPS) {
    if (s.day > day) break;
    for (const t of s.techAdvances)
      events.push({ day: s.day, cls: 'ev-tech',
        text: (polityName.get(t.polityId) ?? t.polityId) + ' advances to ' + ERA_NAMES[t.newEra] });
  }
  // Hard-coded scheduled events (must match generate-map.ts)
  const SCHEDULED = [
    { day: 20, cls: 'ev-war',   text: 'Iron Clans declares war on Merchant League' },
    { day: 65, cls: 'ev-peace', text: 'Iron Clans and Merchant League make peace' },
    { day: 75, cls: 'ev-war',   text: 'Sun Theocracy declares war on Plains Nomads' },
    { day: 130,cls: 'ev-peace', text: 'Sun Theocracy and Plains Nomads make peace' },
  ];
  for (const e of SCHEDULED)
    if (e.day <= day) events.push(e);
  events.sort((a,b) => a.day - b.day);

  const evEl = document.getElementById('events-log');
  evEl.innerHTML = events.length === 0
    ? '<div style="padding:.5rem;color:#7a81a0;font-size:.75rem">No events yet.</div>'
    : events.map(e =>
        '<div class="ev"><span class="ev-day">Day ' + e.day + '</span>' +
        '<span class="' + e.cls + '">' + e.text + '</span></div>'
      ).join('');
  evEl.scrollTop = evEl.scrollHeight;
}

function seek(idx) {
  const snap = SNAPS[idx];
  if (!snap) return;
  document.getElementById('day-label').textContent = 'Day ' + snap.day;
  renderMap(idx);
  renderStats(idx);
}

seek(0);
</script>
</body>
</html>`;

mkdirSync("docs/map", { recursive: true });
writeFileSync("docs/map/index.html", html);
console.log(`\n✓ docs/map/index.html written (${snapshots.length} snapshots, ${DAYS} days)`);
