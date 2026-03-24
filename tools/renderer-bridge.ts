// tools/renderer-bridge.ts — Renderer Bridge WebSocket Server
//
// Runs a Knight vs. Brawler combat simulation at 20 Hz wall-clock and
// broadcasts per-tick rig snapshots over WebSocket for consumption by
// game-engine renderer plugins (Godot 4, Unity 6, etc.).
//
// Protocol
// --------
//   ws://localhost:3001/bridge
//
//   On connect:  { type:"hello", tick_hz:20, scale_Q:10000, scale_m:10000,
//                  scale_mps:10000, seed:<n>, entities:[...] }
//   Each tick:   { type:"tick",  tick, sim_time_s, entities:[...] }
//   On end:      { type:"end",   reason, tick, sim_time_s }
//   After 2 s the sim restarts automatically with the same seed.
//
// Entity frame fields (floats, SI units)
// ---------------------------------------
//   id, team
//   px/py/pz        — position in metres
//   vx/vy/vz        — velocity in m/s
//   fx/fz           — facing XZ unit vector (derived from velocity; 1,0 default)
//   anim.idle/walk/run/sprint/crawl     — locomotion blend [0..1]
//   anim.guard/attack/shock/fear        — overlay blends   [0..1]
//   anim.prone/unconscious/dead         — boolean flags
//   cond.shock/fear/consciousness/fluid_loss — [0..1]
//   cond.dead
//   bones[]         — { seg, impairment, structural, surface }  all [0..1]
//
// Run:  npm run build && node dist/tools/renderer-bridge.js [seed]
// Port: BRIDGE_PORT env var (default 3001)

import * as http   from "node:http";
import * as crypto from "node:crypto";
import type { Socket } from "node:net";

import { q, SCALE }            from "../src/units.js";
import type { Q }              from "../src/units.js";
import { KNIGHT_INFANTRY, HUMAN_BASE } from "../src/archetypes.js";
import { generateIndividual }  from "../src/generate.js";
import { defaultIntent }       from "../src/sim/intent.js";
import { defaultAction }       from "../src/sim/action.js";
import { defaultCondition }    from "../src/sim/condition.js";
import { defaultInjury }       from "../src/sim/injury.js";
import { v3 }                  from "../src/sim/vec3.js";
import { stepWorld }           from "../src/sim/kernel.js";
import { buildWorldIndex }     from "../src/sim/indexing.js";
import { buildSpatialIndex }   from "../src/sim/spatial.js";
import { decideCommandsForEntity } from "../src/sim/ai/decide.js";
import { AI_PRESETS }          from "../src/sim/ai/presets.js";
import { isRouting }           from "../src/sim/morale.js";
import { extractRigSnapshots } from "../src/model3d.js";
import type { RigSnapshot }    from "../src/model3d.js";
import { STARTER_WEAPONS, STARTER_ARMOUR } from "../src/equipment.js";
import type { Entity }         from "../src/sim/entity.js";
import type { WorldState }     from "../src/sim/world.js";
import type { KernelContext }  from "../src/sim/context.js";
import type { CommandMap }     from "../src/sim/commands.js";

// ─── Config ───────────────────────────────────────────────────────────────────

declare const process: {
  argv?: string[];
  env?: Record<string, string | undefined>;
} | undefined;

const PORT     = parseInt(
  (typeof process !== "undefined" ? process.env?.["BRIDGE_PORT"] : undefined) ?? "3001", 10);
const SEED     = parseInt(
  (typeof process !== "undefined" ? process.argv?.[2] : undefined) ?? "1", 10);
const MAX_TICKS = 600;
const TICK_MS   = 50; // 20 Hz — matches TICK_HZ in src/sim/tick.ts

// ─── Scale helpers ────────────────────────────────────────────────────────────

const SQ  = SCALE.Q;
const SM  = SCALE.m;
const SMPS = SCALE.mps;

// ─── Entity factory ───────────────────────────────────────────────────────────

function makeKnight(seed: number): Entity {
  const attrs = generateIndividual(seed, KNIGHT_INFANTRY);
  const sword = STARTER_WEAPONS.find(w => w.id === "wpn_longsword")!;
  const mail  = STARTER_ARMOUR.find(a => a.id === "arm_mail")!;
  return {
    id: 1, teamId: 1, attributes: attrs,
    energy:   { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout:  { items: [sword, mail] },
    traits:   [],
    position_m:   v3(0, 0, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(), action: defaultAction(),
    condition: defaultCondition(), injury: defaultInjury(),
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
  };
}

function makeBrawler(seed: number): Entity {
  const attrs = generateIndividual(seed, HUMAN_BASE);
  const club  = STARTER_WEAPONS.find(w => w.id === "wpn_club")!;
  return {
    id: 2, teamId: 2, attributes: attrs,
    energy:   { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout:  { items: [club] },
    traits:   [],
    position_m:   v3(Math.trunc(0.6 * SM), 0, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(), action: defaultAction(),
    condition: defaultCondition(), injury: defaultInjury(),
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
  };
}

// ─── Frame serialisation ─────────────────────────────────────────────────────

interface EntityFrame {
  id: number; team: number;
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  fx: number; fz: number;
  anim: {
    idle: number; walk: number; run: number; sprint: number; crawl: number;
    guard: number; attack: number; shock: number; fear: number;
    prone: boolean; unconscious: boolean; dead: boolean;
  };
  cond: {
    shock: number; fear: number; consciousness: number; fluid_loss: number;
    dead: boolean;
  };
  bones: Array<{ seg: string; impairment: number; structural: number; surface: number }>;
}

function rigToFrame(snap: RigSnapshot, e: Entity): EntityFrame {
  const a = snap.animation;
  // Facing: derive from velocity XZ; fall back to +X (east)
  const vx = e.velocity_mps.x, vz = e.velocity_mps.z;
  const vLen = Math.sqrt(vx * vx + vz * vz);
  const fx = vLen > 0 ? vx / vLen : 1;
  const fz = vLen > 0 ? vz / vLen : 0;

  return {
    id:   snap.entityId,
    team: snap.teamId,
    px: e.position_m.x  / SM,
    py: e.position_m.y  / SM,
    pz: e.position_m.z  / SM,
    vx: e.velocity_mps.x / SMPS,
    vy: e.velocity_mps.y / SMPS,
    vz: e.velocity_mps.z / SMPS,
    fx, fz,
    anim: {
      idle:        a.idle        / SQ,
      walk:        a.walk        / SQ,
      run:         a.run         / SQ,
      sprint:      a.sprint      / SQ,
      crawl:       a.crawl       / SQ,
      guard:       a.guardingQ   / SQ,
      attack:      a.attackingQ  / SQ,
      shock:       a.shockQ      / SQ,
      fear:        a.fearQ       / SQ,
      prone:       a.prone,
      unconscious: a.unconscious,
      dead:        a.dead,
    },
    cond: {
      shock:         e.injury.shock         / SQ,
      fear:          ((e.condition.fearQ ?? 0) as Q) / SQ,
      consciousness: e.injury.consciousness / SQ,
      fluid_loss:    e.injury.fluidLoss     / SQ,
      dead:          e.injury.dead,
    },
    bones: snap.pose.map(pm => ({
      seg:        pm.segmentId,
      impairment: pm.impairmentQ  / SQ,
      structural: pm.structuralQ  / SQ,
      surface:    pm.surfaceQ     / SQ,
    })),
  };
}

// ─── Simulation state ─────────────────────────────────────────────────────────

let world:    WorldState;
let ctx:      KernelContext;
let simTick = 0;
let isDone  = false;
let endReason = "";

function initSim(): void {
  world     = { tick: 0, seed: SEED, entities: [makeKnight(SEED), makeBrawler(SEED)] };
  ctx       = { tractionCoeff: q(0.90) as Q };
  simTick   = 0;
  isDone    = false;
  endReason = "";
}

function currentFrames(): EntityFrame[] {
  const snaps = extractRigSnapshots(world);
  return snaps.map(s => rigToFrame(s, world.entities.find(e => e.id === s.entityId)!));
}

function stepSim(): { frames: EntityFrame[]; ended: boolean; reason: string } {
  if (isDone) return { frames: currentFrames(), ended: true, reason: endReason };

  const index   = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, Math.trunc(4 * SM));
  const cmds: CommandMap = new Map();
  for (const e of world.entities) {
    if (e.injury.dead) continue;
    cmds.set(e.id, [...decideCommandsForEntity(world, index, spatial, e, AI_PRESETS["lineInfantry"]!)]);
  }
  stepWorld(world, cmds, ctx);
  simTick++;

  const frames = currentFrames();
  const k = world.entities.find(e => e.id === 1)!;
  const b = world.entities.find(e => e.id === 2)!;

  let reason = "";
  if      (k.injury.dead)                reason = "knight_killed";
  else if (b.injury.dead)                reason = "brawler_killed";
  else if (k.injury.consciousness <= 0)  reason = "knight_knockout";
  else if (b.injury.consciousness <= 0)  reason = "brawler_knockout";
  else if (isRouting((k.condition.fearQ ?? 0) as Q, k.attributes.resilience.distressTolerance)) reason = "knight_routing";
  else if (isRouting((b.condition.fearQ ?? 0) as Q, b.attributes.resilience.distressTolerance)) reason = "brawler_routing";
  else if (simTick >= MAX_TICKS)         reason = "max_ticks";

  if (reason) { isDone = true; endReason = reason; }
  return { frames, ended: isDone, reason };
}

// ─── WebSocket server (zero external deps — Node built-ins only) ──────────────

const WS_MAGIC  = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const wsClients = new Set<Socket>();

function wsAcceptKey(key: string): string {
  return crypto.createHash("sha1").update(key + WS_MAGIC).digest("base64");
}

function wsSend(socket: Socket, obj: unknown): void {
  if (socket.destroyed) return;
  const payload = Buffer.from(JSON.stringify(obj), "utf8");
  const len = payload.length;
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
  try { socket.write(Buffer.concat([header, payload])); } catch { /* client gone */ }
}

function wsBroadcast(obj: unknown): void {
  for (const socket of wsClients) wsSend(socket, obj);
}

function wsHandleUpgrade(req: http.IncomingMessage, socket: Socket): void {
  const key = (req.headers as Record<string, string | undefined>)["sec-websocket-key"];
  if (!key) { socket.destroy(); return; }

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${wsAcceptKey(key)}\r\n\r\n`,
  );

  wsClients.add(socket);
  wsSend(socket, {
    type: "hello", tick_hz: 20,
    scale_Q: SQ, scale_m: SM, scale_mps: SMPS,
    seed: SEED, entities: currentFrames(),
  });

  socket.on("data", (chunk: Buffer) => {
    if (chunk.length < 2) return;
    const opcode = chunk.readUInt8(0) & 0x0F;
    if (opcode === 0x8) {
      try { socket.write(Buffer.from([0x88, 0x00])); } catch { /* ignore */ }
      socket.destroy();
    } else if (opcode === 0x9) {
      const masked  = (chunk.readUInt8(1) & 0x80) !== 0;
      const payLen  = chunk.readUInt8(1) & 0x7F;
      const start   = masked ? 6 : 2;
      const raw     = chunk.slice(start, start + payLen);
      const payload = masked
        ? Buffer.from(raw.map((b, i) => b ^ chunk.readUInt8(2 + (i % 4))))
        : raw;
      try { socket.write(Buffer.concat([Buffer.from([0x8A, payLen]), payload])); } catch { /* ignore */ }
    }
  });

  const remove = () => wsClients.delete(socket);
  socket.on("close", remove);
  socket.on("error", () => { remove(); socket.destroy(); });
  console.log(`[renderer-bridge] client connected (${wsClients.size} total)`);
}

// ─── Server + tick loop ───────────────────────────────────────────────────────

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(
    `ananke renderer-bridge\nWebSocket: ws://localhost:${PORT}/bridge\n` +
    `tick: ${simTick}  seed: ${SEED}\n`,
  );
});

server.on("upgrade", (req, socket, _head) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/bridge") wsHandleUpgrade(req, socket as Socket);
  else socket.destroy();
});

initSim();

server.listen(PORT, () => {
  console.log(`[renderer-bridge] http://localhost:${PORT}`);
  console.log(`[renderer-bridge] ws://localhost:${PORT}/bridge`);
  console.log(`[renderer-bridge] seed=${SEED} max_ticks=${MAX_TICKS} tick_ms=${TICK_MS}`);
});

setInterval(() => {
  const { frames, ended, reason } = stepSim();

  wsBroadcast({ type: "tick", tick: simTick, sim_time_s: +(simTick / 20).toFixed(3), entities: frames });

  if (ended) {
    wsBroadcast({ type: "end", reason, tick: simTick, sim_time_s: +(simTick / 20).toFixed(3) });
    console.log(`[renderer-bridge] fight ended: ${reason} at tick ${simTick} (${(simTick / 20).toFixed(1)} s)`);
    setTimeout(initSim, 2000);
  }
}, TICK_MS);
