// tools/world-server.ts — Persistent World Server (reference implementation)
//
// Runs a continuous polity-scale world simulation and exposes it over HTTP and WebSocket.
// A browser client at docs/world-client/index.html connects via WebSocket for real-time
// push updates, with HTTP polling as a fallback.
//
// Architecture:
//   - 1 real second = 1 simulated day (adjustable via TICK_MS env var)
//   - Auto-checkpoint every 30 days to world-checkpoint.json
//   - Loads checkpoint on startup if present
//   - Zero external dependencies — Node built-ins only (crypto, http, fs, net)
//
// WebSocket endpoint: ws://localhost:3000/ws
//   Messages pushed: { type: "init"|"tick", state, events|newEvents }
//
// Run:  npm run build && node dist/tools/world-server.js
// Then: open docs/world-client/index.html in a browser

import * as http   from "node:http";
import * as crypto from "node:crypto";
import * as fs     from "node:fs";
import type { Socket } from "node:net";
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

// ── WebSocket server (zero external deps — Node built-ins only) ───────────────

const WS_MAGIC = "258EAFA5-E914-4789-ABBA-C4952A17A1B1";

interface WsClient {
  socket:         Socket;
  lastEventCount: number;
}

const wsClients = new Set<WsClient>();

function wsAcceptKey(clientKey: string): string {
  return crypto.createHash("sha1")
    .update(clientKey + WS_MAGIC)
    .digest("base64");
}

function wsSendText(socket: Socket, text: string): void {
  if (socket.destroyed) return;
  const payload = Buffer.from(text, "utf8");
  const len     = payload.length;
  let   header: Buffer;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.from([0x81, 0x7E, len >> 8, len & 0xFF]);
  } else {
    const b = Buffer.alloc(10);
    b[0] = 0x81; b[1] = 0x7F;
    b.writeBigUInt64BE(BigInt(len), 2);
    header = b;
  }
  try { socket.write(Buffer.concat([header, payload])); }
  catch { /* client gone */ }
}

function wsBroadcastTick(): void {
  for (const client of wsClients) {
    const newEvents = events.slice(client.lastEventCount);
    wsSendText(client.socket, JSON.stringify({ type: "tick", state: getSnapshot(), newEvents }));
    client.lastEventCount = events.length;
  }
}

function wsHandleUpgrade(req: http.IncomingMessage, socket: Socket): void {
  const key = (req.headers as Record<string, string | undefined>)["sec-websocket-key"];
  if (!key) { socket.destroy(); return; }

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${wsAcceptKey(key)}\r\n\r\n`
  );

  const client: WsClient = { socket, lastEventCount: 0 };
  wsClients.add(client);

  // Send full initial state + all events on connect
  wsSendText(socket, JSON.stringify({ type: "init", state: getSnapshot(), events }));
  client.lastEventCount = events.length;

  // Handle incoming frames — server is push-only; clients only send close/ping
  socket.on("data", (chunk: Buffer) => {
    if (chunk.length < 2) return;
    const b0     = chunk.readUInt8(0);
    const b1     = chunk.readUInt8(1);
    const opcode = b0 & 0x0F;
    if (opcode === 0x8) {                               // close
      try { socket.write(Buffer.from([0x88, 0x00])); } catch { /* ignore */ }
      socket.destroy();
    } else if (opcode === 0x9) {                        // ping → pong
      const masked    = (b1 & 0x80) !== 0;
      const payLen    = b1 & 0x7F;
      const dataStart = masked ? 6 : 2;
      const raw       = chunk.slice(dataStart, dataStart + payLen);
      const payload   = masked
        ? Buffer.from(raw.map((b, i) => b ^ (chunk.readUInt8(2 + (i % 4)))))
        : raw;
      try { socket.write(Buffer.concat([Buffer.from([0x8A, payLen]), payload])); } catch { /* ignore */ }
    }
  });

  const remove = () => wsClients.delete(client);
  socket.on("close", remove);
  socket.on("error", () => { remove(); socket.destroy(); });

  console.log(`[world-server] WebSocket client connected (${wsClients.size} total)`);
}

// ── World tick ────────────────────────────────────────────────────────────────

function tick(): void {
  day++;

  const dayResult  = stepPolityDay(registry, PAIRS, SEED, day);
  const techResult = stepTechDiffusion(registry, PAIRS, SEED, day);

  for (const t of techResult) {
    const name = registry.polities.get(t.polityId)?.name ?? t.polityId;
    events.push({ day, type: "tech",
      text: `${name} advances to ${techEraName(t.newTechEra)} era` });
    console.log(`[day ${day}] TECH: ${name} → ${techEraName(t.newTechEra)}`);
  }

  for (const t of dayResult.trade) {
    if (t.incomeEach_cu >= 100) {
      const a = registry.polities.get(t.polityAId)?.name ?? t.polityAId;
      const b = registry.polities.get(t.polityBId)?.name ?? t.polityBId;
      events.push({ day, type: "trade", text: `${a} ↔ ${b}: ${t.incomeEach_cu} cu each` });
    }
  }

  if (day % AUTO_SAVE_DAYS === 0) saveCheckpoint();
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);

  // Push to all WebSocket clients
  wsBroadcastTick();
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

  if (method === "OPTIONS") { cors(res); res.writeHead(204); res.end(); return; }

  if (method === "GET" && url.pathname === "/state") {
    return json(res, 200, getSnapshot());
  }

  if (method === "GET" && url.pathname === "/events") {
    const since = parseInt(url.searchParams.get("since") ?? "0");
    return json(res, 200, { events: events.filter(e => e.day > since) });
  }

  if (method === "POST" && url.pathname === "/war") {
    const body = JSON.parse(await readBody(req)) as { a: string; b: string };
    if (!body.a || !body.b) return json(res, 400, { error: "Missing a or b" });
    if (areAtWar(registry, body.a, body.b)) return json(res, 400, { error: "Already at war" });
    declareWar(registry, body.a, body.b);
    const na = registry.polities.get(body.a)?.name ?? body.a;
    const nb = registry.polities.get(body.b)?.name ?? body.b;
    events.push({ day, type: "war", text: `${na} declares war on ${nb}` });
    wsBroadcastTick();
    return json(res, 200, { ok: true });
  }

  if (method === "POST" && url.pathname === "/peace") {
    const body = JSON.parse(await readBody(req)) as { a: string; b: string };
    if (!body.a || !body.b) return json(res, 400, { error: "Missing a or b" });
    makePeace(registry, body.a, body.b);
    const na = registry.polities.get(body.a)?.name ?? body.a;
    const nb = registry.polities.get(body.b)?.name ?? body.b;
    events.push({ day, type: "peace", text: `${na} and ${nb} make peace` });
    wsBroadcastTick();
    return json(res, 200, { ok: true });
  }

  if (method === "POST" && url.pathname === "/save") {
    saveCheckpoint();
    return json(res, 200, { ok: true, day });
  }

  if (method === "POST" && url.pathname === "/reset") {
    clearInterval(tickHandle);
    day      = 0;
    registry = freshRegistry();
    events   = [{ day: 0, type: "info", text: "World reset by operator." }];
    if (fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT);
    tickHandle = setInterval(tick, TICK_MS);
    wsBroadcastTick();
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "Not found" });
});

// Attach WebSocket upgrade handler
server.on("upgrade", (req, socket, _head) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/ws") {
    wsHandleUpgrade(req, socket as Socket);
  } else {
    (socket as Socket).destroy();
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

let tickHandle = setInterval(tick, TICK_MS);

server.listen(PORT, () => {
  console.log(`[world-server] Listening on http://localhost:${PORT}`);
  console.log(`[world-server] WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`[world-server] Tick rate: ${TICK_MS}ms per simulated day`);
  console.log(`[world-server] Open docs/world-client/index.html to view live state`);
  console.log(`[world-server] Press Ctrl+C to stop (checkpoint auto-saves every ${AUTO_SAVE_DAYS} days)`);
});

process.on("SIGINT", () => {
  console.log("\n[world-server] Shutting down — saving checkpoint...");
  clearInterval(tickHandle);
  for (const client of wsClients) {
    try { client.socket.write(Buffer.from([0x88, 0x00])); } catch { /* ignore */ }
    client.socket.destroy();
  }
  saveCheckpoint();
  server.close(() => process.exit(0));
});
