/**
 * tools/replication-server.ts — CE-11: Network Replication Reference Implementation
 *
 * Demonstrates lock-step authoritative multiplayer using Ananke's deterministic kernel.
 *
 * ## Architecture
 *
 *   ┌────────────────────────────────────────────────────────────────────────┐
 *   │  Server (this file)                                                    │
 *   │  • Runs stepWorld at TICK_HZ (default 20 Hz = 50 ms / tick)           │
 *   │  • Authoritative — clients NEVER send state, only commands             │
 *   │  • Broadcasts CE-9 binary diffs (base64) every tick                   │
 *   │  • Broadcasts full WorldState snapshot every SNAPSHOT_INTERVAL ticks  │
 *   │  • Grace-tick window: commands timestamped up to GRACE_TICKS late     │
 *   │    are still applied to the current tick                               │
 *   └────────────────────────────────────────────────────────────────────────┘
 *            ↕  WebSocket (ws://localhost:3001/ws)
 *   ┌────────────────────────────────────────────────────────────────────────┐
 *   │  Client (docs/world-client/replication-client.html)                   │
 *   │  • Receives { type:"init"|"tick"|"snapshot" } messages                │
 *   │  • Client-side prediction: runs its own local stepWorld using the      │
 *   │    same seed to render ahead of the authoritative state                │
 *   │  • Reconciliation: replays from last confirmed snapshot when the       │
 *   │    predicted state diverges from the authoritative one                 │
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 * ## WebSocket message protocol (text frames, JSON)
 *
 *   Server → Client:
 *     { type: "init",     tick, state: WorldState }
 *     { type: "tick",     tick, diff: <base64 binary diff>, commands: [EntityCommand...] }
 *     { type: "snapshot", tick, state: WorldState }
 *
 *   Client → Server:
 *     { type: "command",  entityId: number, intent: object, tickHint?: number }
 *
 *   tickHint: the client's best estimate of the current server tick.
 *   Commands with |tickHint - serverTick| <= GRACE_TICKS are applied this tick.
 *   Stale commands (beyond the grace window) are dropped with a warning.
 *
 * ## HTTP endpoints
 *
 *   GET  /state   → full WorldState JSON (for non-WS clients / initial load)
 *   POST /command → { entityId, intent, tickHint? } → apply command to next tick
 *   GET  /stats   → server diagnostics (tick, entity count, client count, etc.)
 *
 * ## Demo world
 *
 *   Two teams of 8 humanoids fight on a 50 m battle line using the lineInfantry AI.
 *   Clients can override individual entity commands by posting to /command.
 *   The battle resets automatically when all entities on one side are dead.
 *
 * Usage:
 *   npm run build && node dist/tools/replication-server.js
 *   Then open: docs/world-client/replication-client.html
 */

import * as http   from "node:http";
import * as crypto from "node:crypto";
import type { Socket } from "node:net";

import { q, SCALE, type Q }              from "../src/units.js";
import { stepWorld }                     from "../src/sim/kernel.js";
import { buildWorldIndex }               from "../src/sim/indexing.js";
import { buildSpatialIndex }             from "../src/sim/spatial.js";
import { buildAICommands }               from "../src/sim/ai/system.js";
import { AI_PRESETS }                    from "../src/sim/ai/presets.js";
import { diffWorldState, applyDiff, packDiff, isDiffEmpty } from "../src/snapshot.js";
import { createWorld }                   from "../src/world-factory.js";
import type { WorldState }               from "../src/sim/world.js";
import type { KernelContext }            from "../src/sim/context.js";
import type { CommandMap, Command }      from "../src/sim/commands.js";

// ── Configuration ─────────────────────────────────────────────────────────────

const PORT               = parseInt(process.env.PORT              ?? "3001");
const TICK_HZ            = parseInt(process.env.TICK_HZ           ?? "20");
const TICK_MS            = Math.round(1000 / TICK_HZ);
const SNAPSHOT_INTERVAL  = parseInt(process.env.SNAPSHOT_INTERVAL ?? "20");  // ticks
const GRACE_TICKS        = parseInt(process.env.GRACE_TICKS       ?? "3");   // late-command tolerance
const SEED               = 42;

const CTX: KernelContext = { tractionCoeff: q(0.75) as Q };
const AI_POLICY          = AI_PRESETS["lineInfantry"]!;
const AI_POLICY_FN       = () => AI_POLICY;

// ── Demo world builder ────────────────────────────────────────────────────────

const SPACING_m  = Math.round(2 * SCALE.m);
const GAP_m      = Math.round(8 * SCALE.m);
const TEAM_SIZE  = 8;

function buildDemoWorld(): WorldState {
  const entities = [];
  for (let i = 0; i < TEAM_SIZE; i++) {
    const x = Math.round((i - (TEAM_SIZE - 1) / 2) * SPACING_m);
    entities.push({ id: i + 1,             teamId: 1, seed: SEED + i + 1,             x_m: x, y_m: 0,      archetype: "human", weaponId: "wpn_longsword", armourId: "arm_chainmail" });
    entities.push({ id: TEAM_SIZE + i + 1, teamId: 2, seed: SEED + TEAM_SIZE + i + 1, x_m: x, y_m: GAP_m, archetype: "human", weaponId: "wpn_longsword", armourId: "arm_chainmail" });
  }
  return createWorld(SEED, entities);
}

// ── Server state ──────────────────────────────────────────────────────────────

let world       = buildDemoWorld();
let prevWorld   = structuredClone(world);    // for diff computation
let serverTick  = 0;

/** Commands queued by clients for the next tick: entityId → commands */
const pendingCommands = new Map<number, Command[]>();

interface TickStats {
  stepMs:    number;
  diffBytes: number;
  clients:   number;
}
const recentStats: TickStats[] = [];
let   totalTickMs = 0;
let   totalTicks  = 0;

// ── WebSocket infrastructure ──────────────────────────────────────────────────

const WS_MAGIC = "258EAFA5-E914-4789-ABBA-C4952A17A1B1";

interface WsClient {
  socket:   Socket;
  clientId: string;
  /** Estimated round-trip ticks (updated from tickHint messages). */
  rttTicks: number;
}

const wsClients = new Set<WsClient>();

function wsAcceptKey(key: string): string {
  return crypto.createHash("sha1").update(key + WS_MAGIC).digest("base64");
}

function wsSend(socket: Socket, msg: unknown): void {
  if (socket.destroyed) return;
  const payload = Buffer.from(JSON.stringify(msg), "utf8");
  const len     = payload.length;
  let header: Buffer;
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

/** Decode a single WebSocket frame from a Buffer.  Returns null if incomplete. */
function wsDecodeFrame(buf: Buffer): { opcode: number; payload: Buffer } | null {
  if (buf.length < 2) return null;
  const b1     = buf.readUInt8(1);
  const masked = (b1 & 0x80) !== 0;
  let   payLen = b1 & 0x7F;
  let   offset = 2;

  if (payLen === 126) {
    if (buf.length < 4) return null;
    payLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payLen === 127) {
    if (buf.length < 10) return null;
    payLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  const maskStart = offset;
  if (masked) offset += 4;

  if (buf.length < offset + payLen) return null;

  const raw = buf.slice(offset, offset + payLen);
  const payload = masked
    ? Buffer.from(raw.map((byte, i) => byte ^ buf.readUInt8(maskStart + (i % 4))))
    : raw;

  return { opcode: buf.readUInt8(0) & 0x0F, payload };
}

function wsHandleMessage(client: WsClient, payload: Buffer): void {
  let msg: Record<string, unknown>;
  try { msg = JSON.parse(payload.toString("utf8")) as Record<string, unknown>; }
  catch { return; }

  if (msg.type === "command") {
    const entityId  = msg.entityId  as number;
    const intent    = msg.intent    as Record<string, unknown> | undefined;
    const tickHint  = msg.tickHint  as number | undefined;

    // Grace-tick check
    if (tickHint !== undefined) {
      const lag = serverTick - tickHint;
      if (lag > GRACE_TICKS) {
        console.warn(`[replication-server] dropped stale command from ${client.clientId}: tickHint=${tickHint} serverTick=${serverTick} lag=${lag}`);
        wsSend(client.socket, { type: "command_dropped", reason: "stale", tickHint, serverTick });
        return;
      }
      // Update round-trip estimate
      client.rttTicks = Math.round((client.rttTicks + Math.max(0, lag)) / 2);
    }

    if (!intent || typeof entityId !== "number") return;

    // Merge into pending commands for this entity
    const cmd: Command = intent as unknown as Command;
    const existing = pendingCommands.get(entityId);
    if (existing) existing.push(cmd);
    else pendingCommands.set(entityId, [cmd]);

    console.log(`[replication-server] command queued for entity ${entityId} from ${client.clientId}`);
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

  const clientId = crypto.randomBytes(4).toString("hex");
  const client: WsClient = { socket, clientId, rttTicks: 0 };
  wsClients.add(client);

  // Initial full state
  wsSend(socket, { type: "init", tick: serverTick, state: worldToJson(world) });

  // Handle incoming frames
  let buf = Buffer.alloc(0);
  socket.on("data", (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const frame = wsDecodeFrame(buf);
      if (!frame) break;
      const opcode = frame.opcode;
      if (opcode === 0x8) {                         // close
        try { socket.write(Buffer.from([0x88, 0x00])); } catch { /**/ }
        socket.destroy();
        break;
      } else if (opcode === 0x9) {                  // ping → pong
        try { socket.write(Buffer.concat([Buffer.from([0x8A, frame.payload.length]), frame.payload])); } catch { /**/ }
      } else if (opcode === 0x1) {                  // text
        wsHandleMessage(client, frame.payload);
      }
      // Advance buffer past this frame
      const headerLen = 2 + ((buf.readUInt8(1) & 0x80) ? 4 : 0) +
        (((buf.readUInt8(1) & 0x7F) === 126) ? 2 : ((buf.readUInt8(1) & 0x7F) === 127) ? 8 : 0);
      buf = buf.slice(headerLen + frame.payload.length);
    }
  });

  const remove = () => wsClients.delete(client);
  socket.on("close", remove);
  socket.on("error", () => { remove(); socket.destroy(); });

  console.log(`[replication-server] client ${clientId} connected (${wsClients.size} total)`);
}

// ── State serialisation ───────────────────────────────────────────────────────

/**
 * Strip Maps and non-JSON-safe values for wire transport.
 * Entity armourState and capabilityCooldowns are Maps — convert to arrays.
 */
function worldToJson(w: WorldState): unknown {
  return JSON.parse(JSON.stringify(w, (_key, value) => {
    if (value instanceof Map) return Object.fromEntries(value);
    if (value instanceof Set) return [...value];
    return value;
  }));
}

// ── Tick loop ─────────────────────────────────────────────────────────────────

function checkReset(): boolean {
  const live = world.entities.filter(e => !e.injury.dead);
  const team1 = live.filter(e => e.teamId === 1).length;
  const team2 = live.filter(e => e.teamId === 2).length;
  if (team1 === 0 || team2 === 0) {
    const winner = team1 > 0 ? 1 : team2 > 0 ? 2 : 0;
    console.log(`[replication-server] Battle over! ${winner ? `Team ${winner} wins` : "Draw"}. Resetting…`);
    wsBroadcastAll({ type: "reset", winner });
    world    = buildDemoWorld();
    prevWorld = structuredClone(world);
    serverTick = 0;
    pendingCommands.clear();
    wsBroadcastAll({ type: "init", tick: serverTick, state: worldToJson(world) });
    return true;
  }
  return false;
}

function tick(): void {
  const t0 = Date.now();

  if (checkReset()) return;

  // Build AI commands (entities not overridden by clients)
  const idx  = buildWorldIndex(world);
  const spt  = buildSpatialIndex(world, 40_000);
  const aiCmds: CommandMap = buildAICommands(world, idx, spt, AI_POLICY_FN);

  // Merge client-pending commands (client commands override AI for that entity)
  const mergedCmds: CommandMap = new Map(aiCmds);
  for (const [entityId, cmds] of pendingCommands) {
    mergedCmds.set(entityId, cmds);
  }
  pendingCommands.clear();

  // Record for broadcast (serialisable)
  const broadcastCmds = [...mergedCmds.entries()].map(([id, cmds]) => ({ entityId: id, commands: cmds }));

  // Step world (mutates in place)
  const snapBefore = structuredClone(world);
  stepWorld(world, mergedCmds, CTX);
  serverTick++;

  const stepMs = Date.now() - t0;

  // Compute diff
  const diff     = diffWorldState(snapBefore, world);
  const isEmpty  = isDiffEmpty(diff);

  // Full snapshot every SNAPSHOT_INTERVAL ticks or when diff is empty (no change)
  const doSnapshot = (serverTick % SNAPSHOT_INTERVAL === 0) || isEmpty;

  if (doSnapshot) {
    const msg = { type: "snapshot" as const, tick: serverTick, state: worldToJson(world), commands: broadcastCmds };
    wsBroadcastAll(msg);
  } else {
    const binary     = packDiff(diff);
    const diffB64    = Buffer.from(binary.buffer, binary.byteOffset, binary.byteLength).toString("base64");
    const msg = { type: "tick" as const, tick: serverTick, diff: diffB64, commands: broadcastCmds };
    wsBroadcastAll(msg);

    // Accumulate stats
    const stats: TickStats = { stepMs, diffBytes: binary.length, clients: wsClients.size };
    recentStats.push(stats);
    if (recentStats.length > 100) recentStats.shift();
    totalTickMs += stepMs;
    totalTicks++;
  }

  prevWorld = snapBefore;

  if (serverTick % 100 === 0) {
    const avg = totalTicks > 0 ? (totalTickMs / totalTicks).toFixed(2) : "—";
    console.log(`[replication-server] tick=${serverTick} step=${stepMs}ms avg=${avg}ms clients=${wsClients.size}`);
  }
}

function wsBroadcastAll(msg: unknown): void {
  for (const client of wsClients) {
    wsSend(client.socket, msg);
  }
}

// ── HTTP server ───────────────────────────────────────────────────────────────

function json(res: http.ServerResponse, code: number, data: unknown): void {
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

function cors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = req.url?.split("?")[0] ?? "/";

  if (req.method === "GET" && url === "/state") {
    json(res, 200, { tick: serverTick, state: worldToJson(world) });
    return;
  }

  if (req.method === "GET" && url === "/stats") {
    const recent = recentStats.slice(-20);
    const avgStep = recent.length > 0
      ? (recent.reduce((s, r) => s + r.stepMs, 0) / recent.length).toFixed(2)
      : null;
    const avgDiff = recent.length > 0
      ? Math.round(recent.reduce((s, r) => s + r.diffBytes, 0) / recent.length)
      : null;
    json(res, 200, {
      tick:       serverTick,
      tickHz:     TICK_HZ,
      tickMs:     TICK_MS,
      entities:   world.entities.length,
      liveEntities: world.entities.filter(e => !e.injury.dead).length,
      wsClients:  wsClients.size,
      graceTicks: GRACE_TICKS,
      snapshotInterval: SNAPSHOT_INTERVAL,
      avgStepMs:  avgStep,
      avgDiffBytes: avgDiff,
    });
    return;
  }

  if (req.method === "POST" && url === "/command") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(body) as Record<string, unknown>; }
      catch { json(res, 400, { error: "invalid JSON" }); return; }

      const entityId = parsed.entityId as number | undefined;
      const intent   = parsed.intent   as Record<string, unknown> | undefined;
      const tickHint = parsed.tickHint as number | undefined;

      if (typeof entityId !== "number" || !intent) {
        json(res, 400, { error: "entityId (number) and intent (object) required" }); return;
      }

      if (tickHint !== undefined) {
        const lag = serverTick - tickHint;
        if (lag > GRACE_TICKS) {
          json(res, 409, { error: "stale", lag, graceTicks: GRACE_TICKS, serverTick });
          return;
        }
      }

      const cmd = intent as unknown as Command;
      const existing = pendingCommands.get(entityId);
      if (existing) existing.push(cmd);
      else pendingCommands.set(entityId, [cmd]);

      json(res, 202, { queued: true, tick: serverTick });
    });
    return;
  }

  json(res, 404, { error: "not found" });
});

server.on("upgrade", (req, socket, _head) => {
  if (req.url === "/ws") {
    wsHandleUpgrade(req, socket as Socket);
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`[replication-server] listening on http://localhost:${PORT}`);
  console.log(`[replication-server] WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`[replication-server] tick rate: ${TICK_HZ} Hz (${TICK_MS} ms/tick)`);
  console.log(`[replication-server] snapshot every ${SNAPSHOT_INTERVAL} ticks`);
  console.log(`[replication-server] grace window: ${GRACE_TICKS} ticks`);
  console.log(`[replication-server] open docs/world-client/replication-client.html`);
  console.log();

  setInterval(tick, TICK_MS);
});
