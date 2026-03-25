// tools/persistent-world.ts — Persistent World Server
//
// Integrates the polity-scale campaign layer (world-server.ts) with tactical
// combat (replication-server.ts) via the battle bridge (src/battle-bridge.ts).
//
// Architecture:
//   - Polity tick: 1 real second = 1 simulated day (adjustable via POLITY_TICK_MS)
//   - When a war is active, a battle is staged every BATTLE_INTERVAL_DAYS days
//   - Battles run at 20 Hz (50 ms/tick) in the same process; no subprocess
//   - Battle outcomes feed back into polity morale, stability, and population
//   - Checkpoint auto-saves every 30 days (polity state + battle log)
//
// HTTP endpoints:
//   GET  /state               → polity snapshot + current day + battle log
//   GET  /events              → event log (?since=<day>)
//   POST /war    { a, b }     → declare war between polity ids
//   POST /peace  { a, b }     → make peace
//   POST /save                → force checkpoint save
//   POST /reset               → reset world to day 0
//   GET  /battles             → full battle log
//
// WebSocket: ws://localhost:3000/ws
//   Server → client:
//     { type: "init",   state, events, battles }
//     { type: "tick",   state, newEvents }
//     { type: "battle", record }    — fired when a battle resolves
//
// Run:  npm run build && node dist/tools/persistent-world.js

import * as http   from "node:http";
import * as crypto from "node:crypto";
import * as fs     from "node:fs";
import type { Socket } from "node:net";

import { q, SCALE, clampQ, type Q } from "../src/units.js";
import { TechEra }                   from "../src/sim/tech.js";
import {
  createPolity, createPolityRegistry, stepPolityDay,
  declareWar, makePeace, areAtWar,
  type PolityPair, type Polity, type PolityRegistry,
} from "../src/polity.js";
import { stepTechDiffusion, techEraName } from "../src/tech-diffusion.js";
import { stepWorld }                      from "../src/sim/kernel.js";
import { buildWorldIndex }                from "../src/sim/indexing.js";
import { buildSpatialIndex }              from "../src/sim/spatial.js";
import { buildAICommands }                from "../src/sim/ai/system.js";
import { AI_PRESETS }                     from "../src/sim/ai/presets.js";
import { createWorld }                    from "../src/world-factory.js";
import type { WorldState }                from "../src/sim/world.js";
import type { KernelContext }             from "../src/sim/context.js";
import type { CommandMap }                from "../src/sim/commands.js";
import {
  battleConfigFromPolities, polityImpactFromBattle, applyPolityImpact,
  type BattleRecord, type BattleOutcome,
} from "../src/battle-bridge.js";

// ── Configuration ─────────────────────────────────────────────────────────────

const PORT                = parseInt(process.env.PORT            ?? "3000");
const POLITY_TICK_MS      = parseInt(process.env.POLITY_TICK_MS  ?? "1000");  // ms per simulated day
const CHECKPOINT          = process.env.CHECKPOINT               ?? "persistent-world-checkpoint.json";
const WORLD_SEED          = 77;
const AUTO_SAVE_DAYS      = 30;
const MAX_EVENTS          = 500;
const BATTLE_INTERVAL_DAYS = 7;   // how often a battle is staged per active war
const BATTLE_TICK_HZ      = 20;
const BATTLE_TICK_MS      = Math.round(1000 / BATTLE_TICK_HZ);

// ── World geography ───────────────────────────────────────────────────────────

const POLITY_DEFS = [
  { id: "iron_clans",      name: "Iron Clans",      pop: 180_000, treasury: 1_200, era: TechEra.Ancient     as number, stability: q(0.65) as Q, morale: q(0.72) as Q },
  { id: "merchant_league", name: "Merchant League", pop: 220_000, treasury: 4_500, era: TechEra.Medieval    as number, stability: q(0.75) as Q, morale: q(0.80) as Q },
  { id: "sun_theocracy",   name: "Sun Theocracy",   pop: 160_000, treasury: 2_800, era: TechEra.Medieval    as number, stability: q(0.85) as Q, morale: q(0.78) as Q },
  { id: "plains_nomads",   name: "Plains Nomads",   pop: 120_000, treasury:   900, era: TechEra.Prehistoric as number, stability: q(0.60) as Q, morale: q(0.68) as Q },
  { id: "ancient_library", name: "Ancient Library", pop:  95_000, treasury: 6_000, era: TechEra.EarlyModern as number, stability: q(0.90) as Q, morale: q(0.85) as Q },
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorldEvent {
  day:  number;
  type: "war" | "peace" | "tech" | "trade" | "battle" | "info";
  text: string;
}

interface CheckpointData {
  day:      number;
  polities: Polity[];
  wars:     string[];
  alliances:Array<[string, string[]]>;
  events:   WorldEvent[];
  battles:  BattleRecord[];
}

// ── World state ───────────────────────────────────────────────────────────────

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
let events:  WorldEvent[]  = [];
let battles: BattleRecord[] = [];

events.push({ day: 0, type: "info", text: "World initialised. Simulation begins." });

// ── Checkpoint ────────────────────────────────────────────────────────────────

function saveCheckpoint(): void {
  try {
    const data: CheckpointData = {
      day,
      polities:  [...registry.polities.values()],
      wars:      [...registry.activeWars],
      alliances: [...registry.alliances.entries()].map(([k, v]) => [k, [...v]]),
      events:    events.slice(-MAX_EVENTS),
      battles,
    };
    fs.writeFileSync(CHECKPOINT, JSON.stringify(data, null, 2));
    console.log(`[persistent-world] Checkpoint saved at day ${day}`);
  } catch (e) {
    console.error(`[persistent-world] Checkpoint save failed:`, e);
  }
}

function loadCheckpoint(): void {
  if (!fs.existsSync(CHECKPOINT)) {
    console.log(`[persistent-world] No checkpoint found, starting fresh world.`);
    return;
  }
  try {
    const data = JSON.parse(fs.readFileSync(CHECKPOINT, "utf8")) as CheckpointData;
    day      = data.day;
    registry = {
      polities:   new Map(data.polities.map(p => [p.id, p])),
      activeWars: new Set(data.wars),
      alliances:  new Map(data.alliances.map(([k, v]) => [k, new Set(v)])),
    };
    events  = data.events  ?? [];
    battles = data.battles ?? [];
    console.log(`[persistent-world] Checkpoint loaded: day ${day}, ${battles.length} battles, ${events.length} events`);
  } catch (e) {
    console.warn(`[persistent-world] Failed to load checkpoint, starting fresh:`, e);
  }
}

loadCheckpoint();

// ── Battle runner ─────────────────────────────────────────────────────────────

const CTX: KernelContext = { tractionCoeff: q(0.75) as Q };
const AI_POLICY    = AI_PRESETS["lineInfantry"]!;
const AI_POLICY_FN = () => AI_POLICY;

/**
 * Run a synchronous tactical battle between two polities.
 * Steps the world up to maxTicks at BATTLE_TICK_HZ until one side is eliminated.
 * Returns immediately — no setInterval, no async.  This is a burst-step.
 */
function runBattle(polityA: Polity, polityB: Polity): BattleRecord {
  const config = battleConfigFromPolities(polityA, polityB, WORLD_SEED, day);
  const spacing = Math.round(2 * SCALE.m);
  const gap     = Math.round(8 * SCALE.m);

  const entityDefs = [];
  for (let i = 0; i < config.teamASize; i++) {
    entityDefs.push({
      id: i + 1, teamId: 1, seed: config.seed + i + 1,
      x_m: Math.round((i - (config.teamASize - 1) / 2) * spacing), y_m: 0,
      archetype: config.loadoutA.archetype,
      weaponId:  config.loadoutA.weaponId,
      armourId:  config.loadoutA.armourId,
    });
  }
  for (let i = 0; i < config.teamBSize; i++) {
    entityDefs.push({
      id: config.teamASize + i + 1, teamId: 2, seed: config.seed + config.teamASize + i + 1,
      x_m: Math.round((i - (config.teamBSize - 1) / 2) * spacing), y_m: gap,
      archetype: config.loadoutB.archetype,
      weaponId:  config.loadoutB.weaponId,
      armourId:  config.loadoutB.armourId,
    });
  }

  const world: WorldState = createWorld(config.seed, entityDefs);
  let tick = 0;

  while (tick < config.maxTicks) {
    const live1 = world.entities.filter(e => e.teamId === 1 && !e.injury.dead).length;
    const live2 = world.entities.filter(e => e.teamId === 2 && !e.injury.dead).length;
    if (live1 === 0 || live2 === 0) break;

    const idx: ReturnType<typeof buildWorldIndex>  = buildWorldIndex(world);
    const spt: ReturnType<typeof buildSpatialIndex> = buildSpatialIndex(world, 40_000);
    const cmds: CommandMap = buildAICommands(world, idx, spt, AI_POLICY_FN);
    stepWorld(world, cmds, CTX);
    tick++;
  }

  const dead1 = world.entities.filter(e => e.teamId === 1 && e.injury.dead).length;
  const dead2 = world.entities.filter(e => e.teamId === 2 && e.injury.dead).length;
  const live1 = world.entities.filter(e => e.teamId === 1 && !e.injury.dead).length;
  const live2 = world.entities.filter(e => e.teamId === 2 && !e.injury.dead).length;

  const winner: 0 | 1 | 2 = live1 > 0 && live2 === 0 ? 1
                           : live2 > 0 && live1 === 0 ? 2
                           : 0;

  const outcome: BattleOutcome = { winner, ticksElapsed: tick, teamACasualties: dead1, teamBCasualties: dead2 };
  const impacts = polityImpactFromBattle(outcome, config);
  for (const impact of impacts) {
    const polity = registry.polities.get(impact.polityId);
    if (polity) applyPolityImpact(polity, impact);
  }

  return {
    day,
    polityAId:       config.polityAId,
    polityBId:       config.polityBId,
    winner,
    teamACasualties: dead1,
    teamBCasualties: dead2,
    ticksElapsed:    tick,
  };
}

// ── WebSocket ──────────────────────────────────────────────────────────────────

const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

interface WsClient { socket: Socket; lastEventCount: number; }
const wsClients = new Set<WsClient>();

function wsSend(socket: Socket, text: string): void {
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
  try { socket.write(Buffer.concat([header, payload])); } catch { /* client gone */ }
}

function broadcast(msg: unknown): void {
  const text = JSON.stringify(msg);
  for (const c of wsClients) wsSend(c.socket, text);
}

function getSnapshot() {
  return {
    day,
    tickMs:   POLITY_TICK_MS,
    polities: [...registry.polities.values()].map(p => ({
      id:              p.id,
      name:            p.name,
      treasury:        p.treasury_cu,
      morale:          p.moraleQ / SCALE.Q,
      stability:       p.stabilityQ / SCALE.Q,
      techEra:         p.techEra,
      techEraName:     techEraName(p.techEra),
      militaryStrength:p.militaryStrength_Q / SCALE.Q,
      population:      p.population,
      locationIds:     p.locationIds,
    })),
    wars:    [...registry.activeWars],
    running: true,
  };
}

function wsHandleUpgrade(req: http.IncomingMessage, socket: Socket): void {
  const key = (req.headers as Record<string, string | undefined>)["sec-websocket-key"];
  if (!key) { socket.destroy(); return; }

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${crypto.createHash("sha1").update(key + WS_MAGIC).digest("base64")}\r\n\r\n`
  );

  const client: WsClient = { socket, lastEventCount: 0 };
  wsClients.add(client);
  wsSend(socket, JSON.stringify({ type: "init", state: getSnapshot(), events, battles }));
  client.lastEventCount = events.length;

  socket.on("data", (chunk: Buffer) => {
    if (chunk.length < 2) return;
    const opcode = chunk.readUInt8(0) & 0x0F;
    if (opcode === 0x8) {
      try { socket.write(Buffer.from([0x88, 0x00])); } catch { /* ignore */ }
      socket.destroy();
    }
  });
  const remove = () => wsClients.delete(client);
  socket.on("close", remove);
  socket.on("error", () => { remove(); socket.destroy(); });
  console.log(`[persistent-world] WebSocket client connected (${wsClients.size} total)`);
}

// ── World tick ────────────────────────────────────────────────────────────────

function tick(): void {
  day++;

  const techResult = stepTechDiffusion(registry, PAIRS, WORLD_SEED, day);
  const dayResult  = stepPolityDay(registry, PAIRS, WORLD_SEED, day);

  for (const t of techResult) {
    const name = registry.polities.get(t.polityId)?.name ?? t.polityId;
    const text = `${name} advances to ${techEraName(t.newTechEra)} era`;
    events.push({ day, type: "tech", text });
    console.log(`[day ${day}] TECH: ${text}`);
  }

  for (const t of dayResult.trade) {
    if (t.incomeEach_cu >= 100) {
      const a = registry.polities.get(t.polityAId)?.name ?? t.polityAId;
      const b = registry.polities.get(t.polityBId)?.name ?? t.polityBId;
      events.push({ day, type: "trade", text: `${a} ↔ ${b}: ${t.incomeEach_cu} cu each` });
    }
  }

  // Stage battles for active wars every BATTLE_INTERVAL_DAYS days
  if (day % BATTLE_INTERVAL_DAYS === 0) {
    for (const warKey of registry.activeWars) {
      const [aId, bId] = warKey.split(":") as [string, string];
      const polityA = registry.polities.get(aId);
      const polityB = registry.polities.get(bId);
      if (!polityA || !polityB) continue;

      console.log(`[day ${day}] BATTLE: ${polityA.name} vs ${polityB.name} — running...`);
      const record = runBattle(polityA, polityB);
      battles.push(record);
      if (battles.length > 200) battles = battles.slice(-200);

      const winnerName = record.winner === 1 ? polityA.name
                       : record.winner === 2 ? polityB.name
                       : "draw";
      const text = `Battle: ${polityA.name} vs ${polityB.name} — ${winnerName === "draw" ? "no victor" : `${winnerName} wins`} (A:${record.teamACasualties} B:${record.teamBCasualties} dead, ${record.ticksElapsed} ticks)`;
      events.push({ day, type: "battle", text });
      console.log(`[day ${day}] ${text}`);
      broadcast({ type: "battle", record });
    }
  }

  if (day % AUTO_SAVE_DAYS === 0) saveCheckpoint();
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);

  for (const client of wsClients) {
    const newEvents = events.slice(client.lastEventCount);
    wsSend(client.socket, JSON.stringify({ type: "tick", state: getSnapshot(), newEvents }));
    client.lastEventCount = events.length;
  }
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

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
    return json(res, 200, { ...getSnapshot(), battles: battles.slice(-20) });
  }

  if (method === "GET" && url.pathname === "/events") {
    const since = parseInt(url.searchParams.get("since") ?? "0");
    return json(res, 200, { events: events.filter(e => e.day > since) });
  }

  if (method === "GET" && url.pathname === "/battles") {
    return json(res, 200, { battles });
  }

  if (method === "POST" && url.pathname === "/war") {
    const body = JSON.parse(await readBody(req)) as { a: string; b: string };
    if (!body.a || !body.b) return json(res, 400, { error: "Missing a or b" });
    if (areAtWar(registry, body.a, body.b)) return json(res, 400, { error: "Already at war" });
    declareWar(registry, body.a, body.b);
    const na = registry.polities.get(body.a)?.name ?? body.a;
    const nb = registry.polities.get(body.b)?.name ?? body.b;
    events.push({ day, type: "war", text: `${na} declares war on ${nb}` });
    broadcast({ type: "tick", state: getSnapshot(), newEvents: events.slice(-1) });
    return json(res, 200, { ok: true });
  }

  if (method === "POST" && url.pathname === "/peace") {
    const body = JSON.parse(await readBody(req)) as { a: string; b: string };
    if (!body.a || !body.b) return json(res, 400, { error: "Missing a or b" });
    makePeace(registry, body.a, body.b);
    const na = registry.polities.get(body.a)?.name ?? body.a;
    const nb = registry.polities.get(body.b)?.name ?? body.b;
    events.push({ day, type: "peace", text: `${na} and ${nb} make peace` });
    broadcast({ type: "tick", state: getSnapshot(), newEvents: events.slice(-1) });
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
    battles  = [];
    if (fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT);
    tickHandle = setInterval(tick, POLITY_TICK_MS);
    broadcast({ type: "init", state: getSnapshot(), events, battles });
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "Not found" });
});

server.on("upgrade", (req, socket, _head) => {
  if (new URL(req.url ?? "/", `http://localhost:${PORT}`).pathname === "/ws") {
    wsHandleUpgrade(req, socket as Socket);
  } else {
    (socket as Socket).destroy();
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

let tickHandle = setInterval(tick, POLITY_TICK_MS);

server.listen(PORT, () => {
  console.log(`[persistent-world] Listening on http://localhost:${PORT}`);
  console.log(`[persistent-world] WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`[persistent-world] Polity tick: ${POLITY_TICK_MS}ms / day`);
  console.log(`[persistent-world] Battles staged every ${BATTLE_INTERVAL_DAYS} days per active war`);
  console.log(`[persistent-world] Press Ctrl+C to stop (auto-saves every ${AUTO_SAVE_DAYS} days)`);
});

process.on("SIGINT", () => {
  console.log("\n[persistent-world] Shutting down — saving checkpoint...");
  clearInterval(tickHandle);
  for (const client of wsClients) {
    try { client.socket.write(Buffer.from([0x88, 0x00])); } catch { /* ignore */ }
    client.socket.destroy();
  }
  saveCheckpoint();
  server.close(() => process.exit(0));
});
