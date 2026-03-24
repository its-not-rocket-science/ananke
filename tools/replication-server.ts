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
 *     { type: "tick",     tick, diff: <base64 binary diff>, commands: [...] }
 *     { type: "snapshot", tick, state: WorldState,         commands: [...] }
 *
 *   Client → Server:
 *     { type: "command",  entityId: number, intent: object, tickHint?: number }
 *
 *   tickHint: the client's best estimate of the current server tick.
 *   Commands with |serverTick - tickHint| <= graceTicks are applied this tick.
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
import { fileURLToPath } from "node:url";
import type { Socket } from "node:net";

import { q, SCALE, type Q }              from "../src/units.js";
import { stepWorld }                     from "../src/sim/kernel.js";
import { buildWorldIndex }               from "../src/sim/indexing.js";
import { buildSpatialIndex }             from "../src/sim/spatial.js";
import { buildAICommands }               from "../src/sim/ai/system.js";
import { AI_PRESETS }                    from "../src/sim/ai/presets.js";
import { diffWorldState, packDiff, isDiffEmpty } from "../src/snapshot.js";
import { createWorld }                   from "../src/world-factory.js";
import type { WorldState }               from "../src/sim/world.js";
import type { KernelContext }            from "../src/sim/context.js";
import type { CommandMap, Command }      from "../src/sim/commands.js";

// ── Public API types ──────────────────────────────────────────────────────────

export interface ReplicationConfig {
  /** TCP port. Default 3001. Pass 0 for OS-assigned (useful in tests). */
  port?:             number;
  /** Simulation frequency in Hz. Default 20. */
  tickHz?:           number;
  /** Broadcast a full snapshot every N ticks (other ticks send a CE-9 diff). Default 20. */
  snapshotInterval?: number;
  /** Commands with lag > graceTicks are rejected. Default 3. */
  graceTicks?:       number;
  /** RNG seed for the demo world. Default 42. */
  seed?:             number;
  /** Entities per team. Default 8. */
  teamSize?:         number;
}

export interface ServerStats {
  tick:             number;
  tickHz:           number;
  tickMs:           number;
  entities:         number;
  liveEntities:     number;
  wsClients:        number;
  graceTicks:       number;
  snapshotInterval: number;
  avgStepMs:        string | null;
  avgDiffBytes:     number | null;
}

export interface ReplicationServer {
  readonly httpServer: http.Server;
  /** Advance one simulation tick.  In production this is called by setInterval. */
  doTick(): void;
  getStats(): ServerStats;
  getWorld(): WorldState;
  stop(): Promise<void>;
}

// ── WebSocket frame utilities (exported for testing) ─────────────────────────

const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export function wsAcceptKey(key: string): string {
  return crypto.createHash("sha1").update(key + WS_MAGIC).digest("base64");
}

/**
 * Decode one WebSocket frame from `buf`.
 * Returns null if the buffer doesn't contain a complete frame yet.
 * `frameBytes` is the total number of bytes consumed from `buf`.
 */
export function wsDecodeFrame(buf: Buffer): { opcode: number; payload: Buffer; frameBytes: number } | null {
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

  const raw     = buf.slice(offset, offset + payLen);
  const payload = masked
    ? Buffer.from(raw.map((byte, i) => byte ^ buf.readUInt8(maskStart + (i % 4))))
    : raw;

  return { opcode: buf.readUInt8(0) & 0x0F, payload, frameBytes: offset + payLen };
}

/** Encode a text string as an unmasked WebSocket text frame. */
export function wsEncodeText(text: string): Buffer {
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
  return Buffer.concat([header, payload]);
}

/** Encode a masked WebSocket text frame (browser → server direction). */
export function wsEncodeMaskedText(text: string): Buffer {
  const payload = Buffer.from(text, "utf8");
  const mask    = crypto.randomBytes(4);
  const masked  = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]!));
  const len     = payload.length;
  let   header: Buffer;
  if (len < 126) {
    header = Buffer.from([0x81, 0x80 | len]);
  } else if (len < 65536) {
    header = Buffer.from([0x81, 0xFE, len >> 8, len & 0xFF]);
  } else {
    const b = Buffer.alloc(10);
    b[0] = 0x81; b[1] = 0xFF;
    b.writeBigUInt64BE(BigInt(len), 2);
    header = b;
  }
  return Buffer.concat([header, mask, masked]);
}

// ── State serialisation ───────────────────────────────────────────────────────

/**
 * Serialise a WorldState for wire transport.
 * Converts Map/Set values to plain objects/arrays so JSON.stringify works.
 */
export function worldToJson(w: WorldState): unknown {
  return JSON.parse(JSON.stringify(w, (_key, value) => {
    if (value instanceof Map) return Object.fromEntries(value);
    if (value instanceof Set) return [...value];
    return value;
  }));
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createReplicationServer(cfg: ReplicationConfig = {}): ReplicationServer {
  const TICK_HZ           = cfg.tickHz           ?? 20;
  const TICK_MS           = Math.round(1000 / TICK_HZ);
  const SNAPSHOT_INTERVAL = cfg.snapshotInterval ?? 20;
  const GRACE_TICKS       = cfg.graceTicks       ?? 3;
  const SEED              = cfg.seed             ?? 42;
  const TEAM_SIZE         = cfg.teamSize         ?? 8;
  const SPACING_m         = Math.round(2 * SCALE.m);
  const GAP_m             = Math.round(8 * SCALE.m);

  const CTX: KernelContext = { tractionCoeff: q(0.75) as Q };
  const AI_POLICY          = AI_PRESETS["lineInfantry"]!;
  const AI_POLICY_FN       = () => AI_POLICY;

  // ── State ─────────────────────────────────────────────────────────────────

  function buildDemoWorld(): WorldState {
    const entities = [];
    for (let i = 0; i < TEAM_SIZE; i++) {
      const x = Math.round((i - (TEAM_SIZE - 1) / 2) * SPACING_m);
      entities.push({
        id: i + 1, teamId: 1, seed: SEED + i + 1,
        x_m: x, y_m: 0, archetype: "HUMAN_BASE",
        weaponId: "wpn_longsword", armourId: "arm_leather",
      });
      entities.push({
        id: TEAM_SIZE + i + 1, teamId: 2, seed: SEED + TEAM_SIZE + i + 1,
        x_m: x, y_m: GAP_m, archetype: "HUMAN_BASE",
        weaponId: "wpn_longsword", armourId: "arm_leather",
      });
    }
    return createWorld(SEED, entities);
  }

  let world      = buildDemoWorld();
  let serverTick = 0;

  const pendingCommands = new Map<number, Command[]>();

  interface TickStats { stepMs: number; diffBytes: number; }
  const recentStats: TickStats[] = [];
  let   totalTickMs = 0;
  let   totalTicks  = 0;

  // ── WebSocket clients ────────────────────────────────────────────────────

  interface WsClient { socket: Socket; clientId: string; rttTicks: number; }
  const wsClients = new Set<WsClient>();

  function wsSend(socket: Socket, msg: unknown): void {
    if (socket.destroyed) return;
    try { socket.write(wsEncodeText(JSON.stringify(msg))); }
    catch { /* client gone */ }
  }

  function wsBroadcastAll(msg: unknown): void {
    for (const c of wsClients) wsSend(c.socket, msg);
  }

  function wsHandleMessage(client: WsClient, payload: Buffer): void {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(payload.toString("utf8")) as Record<string, unknown>; }
    catch { return; }

    if (msg.type === "command") {
      const entityId = msg.entityId as number;
      const intent   = msg.intent   as Record<string, unknown> | undefined;
      const tickHint = msg.tickHint as number | undefined;

      if (tickHint !== undefined) {
        const lag = serverTick - tickHint;
        if (lag > GRACE_TICKS) {
          wsSend(client.socket, { type: "command_dropped", reason: "stale", tickHint, serverTick });
          return;
        }
        client.rttTicks = Math.round((client.rttTicks + Math.max(0, lag)) / 2);
      }

      if (!intent || typeof entityId !== "number") return;

      const cmd = intent as unknown as Command;
      const existing = pendingCommands.get(entityId);
      if (existing) existing.push(cmd);
      else pendingCommands.set(entityId, [cmd]);
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

    wsSend(socket, { type: "init", tick: serverTick, state: worldToJson(world) });

    let buf = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 2) {
        const frame = wsDecodeFrame(buf);
        if (!frame) break;
        const { opcode, payload, frameBytes } = frame;
        if (opcode === 0x8) {
          try { socket.write(Buffer.from([0x88, 0x00])); } catch { /**/ }
          socket.destroy();
          break;
        } else if (opcode === 0x9) {
          try { socket.write(Buffer.concat([Buffer.from([0x8A, payload.length]), payload])); } catch { /**/ }
        } else if (opcode === 0x1) {
          wsHandleMessage(client, payload);
        }
        buf = buf.slice(frameBytes);
      }
    });

    const remove = () => wsClients.delete(client);
    socket.on("close", remove);
    socket.on("error", () => { remove(); socket.destroy(); });
  }

  // ── Tick ─────────────────────────────────────────────────────────────────

  function checkReset(): boolean {
    const live  = world.entities.filter(e => !e.injury.dead);
    const team1 = live.filter(e => e.teamId === 1).length;
    const team2 = live.filter(e => e.teamId === 2).length;
    if (team1 > 0 && team2 > 0) return false;

    const winner = team1 > 0 ? 1 : team2 > 0 ? 2 : 0;
    wsBroadcastAll({ type: "reset", winner });
    world      = buildDemoWorld();
    serverTick = 0;
    pendingCommands.clear();
    wsBroadcastAll({ type: "init", tick: serverTick, state: worldToJson(world) });
    return true;
  }

  function doTick(): void {
    const t0 = Date.now();

    if (checkReset()) return;

    const idx     = buildWorldIndex(world);
    const spt     = buildSpatialIndex(world, 40_000);
    const aiCmds: CommandMap = buildAICommands(world, idx, spt, AI_POLICY_FN);

    const mergedCmds: CommandMap = new Map(aiCmds);
    for (const [id, cmds] of pendingCommands) mergedCmds.set(id, cmds);
    pendingCommands.clear();

    const broadcastCmds = [...mergedCmds.entries()].map(([id, cmds]) => ({ entityId: id, commands: cmds }));
    const snapBefore    = structuredClone(world);
    stepWorld(world, mergedCmds, CTX);
    serverTick++;

    const stepMs   = Date.now() - t0;
    const diff     = diffWorldState(snapBefore, world);
    const isEmpty  = isDiffEmpty(diff);
    const doSnap   = (serverTick % SNAPSHOT_INTERVAL === 0) || isEmpty;

    if (doSnap) {
      wsBroadcastAll({ type: "snapshot", tick: serverTick, state: worldToJson(world), commands: broadcastCmds });
    } else {
      const binary  = packDiff(diff);
      const diffB64 = Buffer.from(binary.buffer, binary.byteOffset, binary.byteLength).toString("base64");
      wsBroadcastAll({ type: "tick", tick: serverTick, diff: diffB64, commands: broadcastCmds });

      recentStats.push({ stepMs, diffBytes: binary.length });
      if (recentStats.length > 100) recentStats.shift();
      totalTickMs += stepMs;
      totalTicks++;
    }
  }

  // ── HTTP ─────────────────────────────────────────────────────────────────

  function jsonReply(res: http.ServerResponse, code: number, data: unknown): void {
    res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(data));
  }

  const httpServer = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const url = req.url?.split("?")[0] ?? "/";

    if (req.method === "GET" && url === "/state") {
      jsonReply(res, 200, { tick: serverTick, state: worldToJson(world) });
      return;
    }

    if (req.method === "GET" && url === "/stats") {
      const recent   = recentStats.slice(-20);
      const avgStep  = recent.length > 0
        ? (recent.reduce((s, r) => s + r.stepMs, 0) / recent.length).toFixed(2) : null;
      const avgDiff  = recent.length > 0
        ? Math.round(recent.reduce((s, r) => s + r.diffBytes, 0) / recent.length) : null;
      jsonReply(res, 200, {
        tick: serverTick, tickHz: TICK_HZ, tickMs: TICK_MS,
        entities: world.entities.length,
        liveEntities: world.entities.filter(e => !e.injury.dead).length,
        wsClients: wsClients.size,
        graceTicks: GRACE_TICKS,
        snapshotInterval: SNAPSHOT_INTERVAL,
        avgStepMs: avgStep, avgDiffBytes: avgDiff,
      } satisfies ServerStats);
      return;
    }

    if (req.method === "POST" && url === "/command") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(body) as Record<string, unknown>; }
        catch { jsonReply(res, 400, { error: "invalid JSON" }); return; }

        const entityId = parsed.entityId as number | undefined;
        const intent   = parsed.intent   as Record<string, unknown> | undefined;
        const tickHint = parsed.tickHint as number | undefined;

        if (typeof entityId !== "number" || !intent) {
          jsonReply(res, 400, { error: "entityId (number) and intent (object) required" }); return;
        }

        if (tickHint !== undefined) {
          const lag = serverTick - tickHint;
          if (lag > GRACE_TICKS) {
            jsonReply(res, 409, { error: "stale", lag, graceTicks: GRACE_TICKS, serverTick }); return;
          }
        }

        const cmd      = intent as unknown as Command;
        const existing = pendingCommands.get(entityId);
        if (existing) existing.push(cmd);
        else pendingCommands.set(entityId, [cmd]);

        jsonReply(res, 202, { queued: true, tick: serverTick });
      });
      return;
    }

    jsonReply(res, 404, { error: "not found" });
  });

  httpServer.on("upgrade", (req, socket, _head) => {
    if (req.url === "/ws") wsHandleUpgrade(req, socket as Socket);
    else socket.destroy();
  });

  function getStats(): ServerStats {
    const recent  = recentStats.slice(-20);
    return {
      tick: serverTick, tickHz: TICK_HZ, tickMs: TICK_MS,
      entities: world.entities.length,
      liveEntities: world.entities.filter(e => !e.injury.dead).length,
      wsClients: wsClients.size,
      graceTicks: GRACE_TICKS,
      snapshotInterval: SNAPSHOT_INTERVAL,
      avgStepMs:    recent.length > 0 ? (recent.reduce((s,r) => s + r.stepMs, 0) / recent.length).toFixed(2) : null,
      avgDiffBytes: recent.length > 0 ? Math.round(recent.reduce((s,r) => s + r.diffBytes, 0) / recent.length) : null,
    };
  }

  function stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      for (const c of wsClients) {
        try { c.socket.write(Buffer.from([0x88, 0x00])); } catch { /**/ }
        c.socket.destroy();
      }
      wsClients.clear();
      httpServer.close(err => err ? reject(err) : resolve());
    });
  }

  return { httpServer, doTick, getStats, getWorld: () => world, stop };
}

// ── Entry point ───────────────────────────────────────────────────────────────

// Only start the server when executed directly (not when imported by tests).
const isMain = (() => {
  try {
    const scriptPath = fileURLToPath(import.meta.url);
    return process.argv[1] !== undefined &&
           (process.argv[1] === scriptPath || process.argv[1].endsWith("replication-server.js"));
  } catch { return false; }
})();

if (isMain) {
  const PORT = parseInt(process.env.PORT ?? "3001");
  const { httpServer, doTick } = createReplicationServer({
    port:             PORT,
    tickHz:           parseInt(process.env.TICK_HZ           ?? "20"),
    snapshotInterval: parseInt(process.env.SNAPSHOT_INTERVAL ?? "20"),
    graceTicks:       parseInt(process.env.GRACE_TICKS       ?? "3"),
  });

  httpServer.listen(PORT, () => {
    console.log(`[replication-server] http://localhost:${PORT}`);
    console.log(`[replication-server] ws://localhost:${PORT}/ws`);
    console.log(`[replication-server] open docs/world-client/replication-client.html`);

    const tickHz = parseInt(process.env.TICK_HZ ?? "20");
    setInterval(doTick, Math.round(1000 / tickHz));
  });
}
