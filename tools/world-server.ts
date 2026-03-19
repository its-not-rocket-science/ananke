// tools/world-server.ts — Persistent World Server (reference implementation)
//
// Runs a continuous polity-scale world simulation and exposes it over HTTP.
// A browser client at docs/world-client/index.html polls /state for live updates.
//
// Architecture:
//   - 1 real second = 1 simulated day (adjustable via TICK_MS env var)
//   - Auto-checkpoint every 30 days to world-checkpoint.json
//   - Loads checkpoint on startup if present
//   - Zero external dependencies — Node built-ins only
//
// Run:  npm run build && node dist/tools/world-server.js
// Then: open docs/world-client/index.html in a browser

import * as http from "node:http";
import * as fs   from "node:fs";
import { q, SCALE, type Q }         from "../src/units.js";
import { TechEra }                   from "../src/sim/tech.js";
import {
  createPolity, createPolityRegistry,
  stepPolityDay, declareWar, makePeace, areAtWar,
  type PolityPair, type Polity, type PolityRegistry,
} from "../src/polity.js";
import { stepTechDiffusion, techEraName } from "../src/tech-diffusion.js";

// ── Configuration ─────────────────────────────────────────────────────────────

const PORT         = parseInt(process.env.PORT      ?? "3000");
const TICK_MS      = parseInt(process.env.TICK_MS   ?? "1000");   // ms per simulated day
const CHECKPOINT   = process.env.CHECKPOINT         ?? "world-checkpoint.json";
const SEED         = 77;
const AUTO_SAVE_DAYS = 30;
const MAX_EVENTS   = 500;

// ── World geography (same grid as generate-map.ts) ───────────────────────────

const POLITY_DEFS = [
  { id: "iron_clans",      name: "Iron Clans",      pop: 180_000, treasury: 1_200, era: TechEra.Ancient      as number,
    stability: q(0.65) as Q, morale: q(0.72) as Q },
  { id: "merchant_league", name: "Merchant League", pop: 220_000, treasury: 4_500, era: TechEra.Medieval     as number,
    stability: q(0.75) as Q, morale: q(0.80) as Q },
  { id: "sun_theocracy",   name: "Sun Theocracy",   pop: 160_000, treasury: 2_800, era: TechEra.Medieval     as number,
    stability: q(0.85) as Q, morale: q(0.78) as Q },
  { id: "plains_nomads",   name: "Plains Nomads",   pop: 120_000, treasury:   900, era: TechEra.Prehistoric  as number,
    stability: q(0.60) as Q, morale: q(0.68) as Q },
  { id: "ancient_library", name: "Ancient Library", pop:  95_000, treasury: 6_000, era: TechEra.EarlyModern  as number,
    stability: q(0.90) as Q, morale: q(0.85) as Q },
];

const PAIRS: PolityPair[] = [
  { polityAId: "iron_clans",      polityBId: "merchant_league", sharedLocations: 2, routeQuality_Q: q(0.60) as Q },
  { polityAId: "merchant_league", polityBId: "sun_theocracy",   sharedLocations: 2, routeQuality_Q: q(0.75) as Q },
  { polityAId: "merchant_league", polityBId: "plains_nomads",   sharedLocations: 2, routeQuality_Q: q(0.55) as Q },
  { polityAId: "merchant_league", polityBId: "ancient_library", sharedLocations: 2, routeQuality_Q: q(0.80) as Q },
  { polityAId: "sun_theocracy",   polityBId: "ancient_library", sharedLocations: 1, routeQuality_Q: q(0.65) as Q },
  { polityAId: "plains_nomads",   polityBId: "ancient_library", sharedLocations: 1, routeQuality_Q: q(0.50) as Q },
];

const LOC_OWNERSHIP: Record<string, string> = {
  ironholt: "iron_clans", forge_peak: "iron_clans", ashfield: "iron_clans",
  crossroads: "merchant_league", harbor_town: "merchant_league", silver_gate: "merchant_league",
  dawn_citadel: "sun_theocracy", sun_temple: "sun_theocracy", radiant_port: "sun_theocracy",
  dustwatch: "plains_nomads", grasshaven: "plains_nomads", windsteppe: "plains_nomads",
  great_archive: "ancient_library", scholars_rest: "ancient_library", ember_keep: "ancient_library",
};

// ── Serialization helpers (Map / Set → JSON-safe) ────────────────────────────

interface CheckpointData {
  day:      number;
  polities: Polity[];
  wars:     string[];
  alliances:Array<[string, string[]]>;
  events:   WorldEvent[];
}

function serializeRegistry(registry: PolityRegistry, day: number, events: WorldEvent[]): string {
  const data: CheckpointData = {
    day,
    polities:  [...registry.polities.values()],
    wars:      [...registry.activeWars],
    alliances: [...registry.alliances.entries()].map(([k, v]) => [k, [...v]]),
    events:    events.slice(-MAX_EVENTS),
  };
  return JSON.stringify(data, null, 2);
}

function deserializeRegistry(json: string): { day: number; registry: PolityRegistry; events: WorldEvent[] } {
  const data = JSON.parse(json) as CheckpointData;
  const registry: PolityRegistry = {
    polities:   new Map(data.polities.map(p => [p.id, p])),
    activeWars: new Set(data.wars),
    alliances:  new Map(data.alliances.map(([k, v]) => [k, new Set(v)])),
  };
  return { day: data.day, registry, events: data.events ?? [] };
}

// ── World state ───────────────────────────────────────────────────────────────

interface WorldEvent {
  day:  number;
  type: "war" | "peace" | "tech" | "trade" | "info";
  text: string;
}

function freshRegistry(): PolityRegistry {
  const polities = POLITY_DEFS.map(d =>
    createPolity(d.id, d.name, d.id,
      Object.entries(LOC_OWNERSHIP).filter(([, pid]) => pid === d.id).map(([lid]) => lid),
      d.pop, d.treasury, d.era as typeof TechEra[keyof typeof TechEra],
      d.stability, d.morale));
  return createPolityRegistry(polities);
}

let day      = 0;
let registry = freshRegistry();
let events:  WorldEvent[] = [];

events.push({ day: 0, type: "info", text: "World initialised. Simulation begins." });

// Load checkpoint if present
if (fs.existsSync(CHECKPOINT)) {
  try {
    const saved = deserializeRegistry(fs.readFileSync(CHECKPOINT, "utf8"));
    day      = saved.day;
    registry = saved.registry;
    events   = saved.events;
    console.log(`[world-server] Checkpoint loaded: day ${day}, ${events.length} events`);
  } catch (e) {
    console.warn(`[world-server] Failed to load checkpoint, starting fresh:`, e);
  }
} else {
  console.log(`[world-server] No checkpoint found, starting fresh world.`);
}

// ── Checkpoint ────────────────────────────────────────────────────────────────

function saveCheckpoint(): void {
  try {
    fs.writeFileSync(CHECKPOINT, serializeRegistry(registry, day, events));
    console.log(`[world-server] Checkpoint saved at day ${day}`);
  } catch (e) {
    console.error(`[world-server] Checkpoint save failed:`, e);
  }
}

// ── World tick ────────────────────────────────────────────────────────────────

function tick(): void {
  day++;

  const dayResult  = stepPolityDay(registry, PAIRS, SEED, day);
  const techResult = stepTechDiffusion(registry, PAIRS, SEED, day);

  // Log tech advances
  for (const t of techResult) {
    const name = registry.polities.get(t.polityId)?.name ?? t.polityId;
    events.push({ day, type: "tech",
      text: `${name} advances to ${techEraName(t.newTechEra)} era` });
    console.log(`[day ${day}] TECH: ${name} → ${techEraName(t.newTechEra)}`);
  }

  // Log significant trade (only when substantial)
  for (const t of dayResult.trade) {
    if (t.incomeEach_cu >= 100) {
      const a = registry.polities.get(t.polityAId)?.name ?? t.polityAId;
      const b = registry.polities.get(t.polityBId)?.name ?? t.polityBId;
      events.push({ day, type: "trade", text: `${a} ↔ ${b}: ${t.incomeEach_cu} cu each` });
    }
  }

  // Auto-checkpoint
  if (day % AUTO_SAVE_DAYS === 0) saveCheckpoint();

  // Trim events
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
}

// ── Snapshot for API ──────────────────────────────────────────────────────────

function getSnapshot() {
  return {
    day,
    tickMs:   TICK_MS,
    polities: [...registry.polities.values()].map(p => ({
      id:              p.id,
      name:            p.name,
      treasury:        p.treasury_cu,
      morale:          p.moraleQ / SCALE.Q,
      stability:       p.stabilityQ / SCALE.Q,
      techEra:         p.techEra,
      techEraName:     techEraName(p.techEra),
      militaryStrength:p.militaryStrength_Q / SCALE.Q,
      locationIds:     p.locationIds,
    })),
    wars:    [...registry.activeWars],
    running: true,
  };
}

// ── HTTP server ───────────────────────────────────────────────────────────────

function cors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res: http.ServerResponse, code: number, data: unknown): void {
  cors(res);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise(resolve => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  const url    = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const method = req.method ?? "GET";

  // CORS preflight
  if (method === "OPTIONS") { cors(res); res.writeHead(204); res.end(); return; }

  // GET /state
  if (method === "GET" && url.pathname === "/state") {
    return json(res, 200, getSnapshot());
  }

  // GET /events?since=N
  if (method === "GET" && url.pathname === "/events") {
    const since = parseInt(url.searchParams.get("since") ?? "0");
    return json(res, 200, { events: events.filter(e => e.day > since) });
  }

  // POST /war  { a: polityId, b: polityId }
  if (method === "POST" && url.pathname === "/war") {
    const body = JSON.parse(await readBody(req)) as { a: string; b: string };
    if (!body.a || !body.b) return json(res, 400, { error: "Missing a or b" });
    if (areAtWar(registry, body.a, body.b)) return json(res, 400, { error: "Already at war" });
    declareWar(registry, body.a, body.b);
    const na = registry.polities.get(body.a)?.name ?? body.a;
    const nb = registry.polities.get(body.b)?.name ?? body.b;
    events.push({ day, type: "war",   text: `${na} declares war on ${nb}` });
    return json(res, 200, { ok: true });
  }

  // POST /peace  { a: polityId, b: polityId }
  if (method === "POST" && url.pathname === "/peace") {
    const body = JSON.parse(await readBody(req)) as { a: string; b: string };
    if (!body.a || !body.b) return json(res, 400, { error: "Missing a or b" });
    makePeace(registry, body.a, body.b);
    const na = registry.polities.get(body.a)?.name ?? body.a;
    const nb = registry.polities.get(body.b)?.name ?? body.b;
    events.push({ day, type: "peace", text: `${na} and ${nb} make peace` });
    return json(res, 200, { ok: true });
  }

  // POST /save
  if (method === "POST" && url.pathname === "/save") {
    saveCheckpoint();
    return json(res, 200, { ok: true, day });
  }

  // POST /reset
  if (method === "POST" && url.pathname === "/reset") {
    clearInterval(tickHandle);
    day      = 0;
    registry = freshRegistry();
    events   = [{ day: 0, type: "info", text: "World reset by operator." }];
    if (fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT);
    tickHandle = setInterval(tick, TICK_MS);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "Not found" });
});

// ── Start ─────────────────────────────────────────────────────────────────────

let tickHandle = setInterval(tick, TICK_MS);

server.listen(PORT, () => {
  console.log(`[world-server] Listening on http://localhost:${PORT}`);
  console.log(`[world-server] Tick rate: ${TICK_MS}ms per simulated day`);
  console.log(`[world-server] Open docs/world-client/index.html to view live state`);
  console.log(`[world-server] Press Ctrl+C to stop (checkpoint auto-saves every ${AUTO_SAVE_DAYS} days)`);
});

process.on("SIGINT", () => {
  console.log("\n[world-server] Shutting down — saving checkpoint...");
  clearInterval(tickHandle);
  saveCheckpoint();
  server.close(() => process.exit(0));
});
