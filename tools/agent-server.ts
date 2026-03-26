// tools/agent-server.ts — CE-18: External Agent Interface
//
// A thin WebSocket API layer over `stepWorld` that lets external agents
// (Python RL scripts, LLMs, rule-based bots) drive entity behaviour without
// importing any Ananke TypeScript.
//
// Architecture:
//   - Agent-driven stepping: server waits for a "step" command before advancing
//     the simulation, so agents control the tick rate.
//   - Default scenario: 1v1 (entity 1 = agent team, entity 2 = AI team).
//     Override with TEAM1_SIZE / TEAM2_SIZE env vars (max 4 each).
//   - External commands are injected via the existing `cmds` Map before
//     `stepWorld` — kernel unchanged, determinism preserved.
//   - `decideCommandsForEntity` fills in for any entity without an external
//     command that tick (partial control supported).
//
// WebSocket endpoint: ws://localhost:3001/agent
//   Client → { type: "step", commands: AgentCommand[] }
//   Server → { type: "obs",  tick, entities: ObservationSlice[], done, winner? }
//
// HTTP endpoints:
//   GET  /config  → scenario description (entity list, team assignments)
//   GET  /status  → current tick + alive counts
//   POST /reset   → restart the scenario
//
// Success criterion (from ROADMAP CE-18):
//   An external Python script using only `websockets` can drive a single entity
//   through a 100-tick 1v1 fight and receive observations each tick.
//
// Run:  npm run build && node dist/tools/agent-server.js

import * as http   from "node:http";
import * as crypto from "node:crypto";
import type { Socket } from "node:net";
import { q, SCALE, type Q }                 from "../src/units.js";
import { KNIGHT_INFANTRY, HUMAN_BASE }      from "../src/archetypes.js";
import { generateIndividual }               from "../src/generate.js";
import { defaultIntent }                    from "../src/sim/intent.js";
import { defaultAction }                    from "../src/sim/action.js";
import { defaultCondition }                 from "../src/sim/condition.js";
import { defaultInjury }                    from "../src/sim/injury.js";
import { v3 }                               from "../src/sim/vec3.js";
import { stepWorld }                        from "../src/sim/kernel.js";
import { buildWorldIndex }                  from "../src/sim/indexing.js";
import { buildSpatialIndex }                from "../src/sim/spatial.js";
import { decideCommandsForEntity }          from "../src/sim/ai/decide.js";
import { AI_PRESETS }                       from "../src/sim/ai/presets.js";
import { canDetect, DEFAULT_SENSORY_ENV }   from "../src/sim/sensory.js";
import { STARTER_WEAPONS, STARTER_ARMOUR } from "../src/equipment.js";
import { CommandKinds, MoveModes, DefenceModes, EngageModes } from "../src/sim/kinds.js";
import type { Entity }      from "../src/sim/entity.js";
import type { WorldState }  from "../src/sim/world.js";
import type { CommandMap, Command, MoveCommand, AttackCommand,
              AttackNearestCommand, DefendCommand } from "../src/sim/commands.js";
import type { KernelContext } from "../src/sim/context.js";

// ── Configuration ──────────────────────────────────────────────────────────────

const PORT        = parseInt(process.env.PORT        ?? "3001");
const SEED        = parseInt(process.env.SEED        ?? "42");
const TEAM1_SIZE  = Math.min(4, parseInt(process.env.TEAM1_SIZE ?? "1"));
const TEAM2_SIZE  = Math.min(4, parseInt(process.env.TEAM2_SIZE ?? "1"));
const MAX_TICKS   = parseInt(process.env.MAX_TICKS   ?? "600");

const CTX: KernelContext = { tractionCoeff: q(0.90) as Q };
const M = SCALE.m;

// ── Protocol types ─────────────────────────────────────────────────────────────

/** Simplified command sent by an external agent. */
interface AgentCommand {
  /** Entity the agent is controlling. */
  entityId: number;
  /** High-level action. */
  action:   "attack" | "move" | "dodge" | "flee" | "idle";
  /** Target entity id — used for "attack". */
  targetId?: number;
  /** Movement direction vector (unnormalised, will be normalised) — used for "move". */
  dir?:      { x: number; y: number; z: number };
}

/** Observation + outcome message sent after each step. */
interface ObsMsg {
  type:      "obs";
  tick:      number;
  entities:  ObservationSlice[];
  done:      boolean;
  winner?:   number;
}

/** The subset of entity state visible to an external agent. */
interface ObservationSlice {
  entityId:      number;
  teamId:        number;
  position:      { x: number; y: number; z: number };
  velocity:      { x: number; y: number; z: number };
  energy: {
    fatigue_Q:   number;   // [0, SCALE.Q]
    reserve_J:   number;
  };
  injury: {
    shock_Q:         number;
    consciousness_Q: number;
    dead:            boolean;
  };
  actionKind:    string;   // current command kind or "idle"
  nearbyEnemies: NearbyEnemyObs[];
}

interface NearbyEnemyObs {
  entityId:      number;
  teamId:        number;
  position:      { x: number; y: number; z: number };
  detectQuality: number;  // Q — q(0) = undetected, q(1.0) = fully visible
  injury: {
    shock_Q:         number;
    consciousness_Q: number;
    dead:            boolean;
  };
}

// Inbound client message types
type ClientMsg =
  | { type: "step"; commands?: AgentCommand[] }
  | { type: "reset" };

// Outbound server message types
type ServerMsg =
  | { type: "init";  config: ScenarioConfig; obs: ObservationSlice[] }
  | ObsMsg
  | { type: "error"; message: string };

interface ScenarioConfig {
  seed:         number;
  maxTicks:     number;
  entities: Array<{
    entityId:   number;
    teamId:     number;
    archetype:  string;
    controlled: boolean;   // true if agent controls this entity (team 1)
  }>;
}

// ── World construction ────────────────────────────────────────────────────────

function makeEntity(
  id: number, teamId: number, seed: number,
  archName: string, weaponId: string, armourId?: string,
  x = 0, y = 0,
): Entity {
  const arch  = archName === "KNIGHT_INFANTRY" ? KNIGHT_INFANTRY : HUMAN_BASE;
  const attrs = generateIndividual(seed, arch);
  const items = [
    STARTER_WEAPONS.find(w => w.id === weaponId)!,
    ...(armourId ? [STARTER_ARMOUR.find(a => a.id === armourId)!] : []),
  ];
  return {
    id, teamId, attributes: attrs,
    energy:       { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout:      { items }, traits: [],
    position_m:   v3(x * M, y * M, 0),
    velocity_mps: v3(0, 0, 0),
    intent:    defaultIntent(),
    action:    defaultAction(),
    condition: defaultCondition(),
    injury:    defaultInjury(),
    grapple:   { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
  };
}

// Entity configs — team 1 = knight/agent, team 2 = brawler/AI
const TEAM1_DEFS = [
  { arch: "KNIGHT_INFANTRY", weapon: "longsword",   armour: "mail"    },
  { arch: "KNIGHT_INFANTRY", weapon: "longsword",   armour: "mail"    },
  { arch: "HUMAN_BASE",      weapon: "shortsword",  armour: "leather" },
  { arch: "HUMAN_BASE",      weapon: "shortsword",  armour: "leather" },
];

const TEAM2_DEFS = [
  { arch: "HUMAN_BASE",      weapon: "club",        armour: undefined },
  { arch: "HUMAN_BASE",      weapon: "club",        armour: undefined },
  { arch: "HUMAN_BASE",      weapon: "knife",       armour: undefined },
  { arch: "HUMAN_BASE",      weapon: "knife",       armour: undefined },
];

function createWorld(): { world: WorldState; config: ScenarioConfig } {
  const entities: Entity[] = [];
  const configEntities: ScenarioConfig["entities"] = [];

  // Team 1 (agent-controlled)
  for (let i = 0; i < TEAM1_SIZE; i++) {
    const def = TEAM1_DEFS[i]!;
    const id  = i + 1;
    entities.push(makeEntity(id, 1, SEED + id, def.arch, def.weapon, def.armour, -2 + i * 1.5, 0));
    configEntities.push({ entityId: id, teamId: 1, archetype: def.arch, controlled: true });
  }

  // Team 2 (AI-controlled)
  for (let i = 0; i < TEAM2_SIZE; i++) {
    const def = TEAM2_DEFS[i]!;
    const id  = TEAM1_SIZE + i + 1;
    entities.push(makeEntity(id, 2, SEED + id * 7, def.arch, def.weapon, def.armour, 2 + i * 1.5, 0));
    configEntities.push({ entityId: id, teamId: 2, archetype: def.arch, controlled: false });
  }

  const world: WorldState = { entities, tick: 0, seed: SEED };
  const config: ScenarioConfig = {
    seed: SEED, maxTicks: MAX_TICKS, entities: configEntities,
  };
  return { world, config };
}

// ── Observation builder ───────────────────────────────────────────────────────

function buildObs(world: WorldState): ObservationSlice[] {
  return world.entities.map(e => {
    // Enemies visible to this entity via canDetect
    const nearbyEnemies: NearbyEnemyObs[] = [];
    for (const other of world.entities) {
      if (other.teamId === e.teamId || other.injury.dead) continue;
      const dq = canDetect(e, other, DEFAULT_SENSORY_ENV, undefined);
      if (dq > 0) {
        nearbyEnemies.push({
          entityId:      other.id,
          teamId:        other.teamId,
          position:      { x: other.position_m.x, y: other.position_m.y, z: other.position_m.z },
          detectQuality: dq,
          injury: {
            shock_Q:         other.injury.shock,
            consciousness_Q: other.injury.consciousness,
            dead:            other.injury.dead,
          },
        });
      }
    }

    return {
      entityId: e.id,
      teamId:   e.teamId,
      position: { x: e.position_m.x, y: e.position_m.y, z: e.position_m.z },
      velocity: { x: e.velocity_mps.x, y: e.velocity_mps.y, z: e.velocity_mps.z },
      energy: {
        fatigue_Q:  e.energy.fatigue,
        reserve_J:  e.energy.reserveEnergy_J,
      },
      injury: {
        shock_Q:         e.injury.shock,
        consciousness_Q: e.injury.consciousness,
        dead:            e.injury.dead,
      },
      actionKind:    e.intent.move.intensity > 0 ? "move" : "idle",
      nearbyEnemies,
    };
  });
}

// ── Command translation ───────────────────────────────────────────────────────

function agentCmdToCommands(
  cmd: AgentCommand,
  entity: Entity,
  world: WorldState,
): Command[] {
  switch (cmd.action) {
    case "attack": {
      if (cmd.targetId != null) {
        return [{
          kind:      CommandKinds.Attack,
          targetId:  cmd.targetId,
          intensity: q(0.80) as Q,
          mode:      EngageModes.Strike,
        } as AttackCommand];
      }
      return [{
        kind:      CommandKinds.AttackNearest,
        mode:      EngageModes.Strike,
        intensity: q(0.80) as Q,
      } as AttackNearestCommand];
    }

    case "move": {
      const raw = cmd.dir ?? { x: 0, y: 0, z: 0 };
      const len = Math.sqrt(raw.x * raw.x + raw.y * raw.y + raw.z * raw.z) || 1;
      return [{
        kind:      CommandKinds.Move,
        dir:       v3(Math.round(raw.x / len * M), Math.round(raw.y / len * M), 0),
        intensity: q(0.70) as Q,
        mode:      MoveModes.Run,
      } as MoveCommand];
    }

    case "dodge": {
      return [{
        kind:      CommandKinds.Defend,
        mode:      DefenceModes.Dodge,
        intensity: q(0.80) as Q,
      } as DefendCommand];
    }

    case "flee": {
      // Move away from the nearest living enemy
      const enemies = world.entities.filter(e => e.teamId !== entity.teamId && !e.injury.dead);
      if (enemies.length === 0) return [];
      let nearest: Entity = enemies[0]!;
      let nearestDist = Infinity;
      for (const en of enemies) {
        const dx = en.position_m.x - entity.position_m.x;
        const dy = en.position_m.y - entity.position_m.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearestDist) { nearestDist = d2; nearest = en; }
      }
      const dx = entity.position_m.x - nearest.position_m.x;
      const dy = entity.position_m.y - nearest.position_m.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      return [{
        kind:      CommandKinds.Move,
        dir:       v3(Math.round(dx / len * M), Math.round(dy / len * M), 0),
        intensity: q(1.0) as Q,
        mode:      MoveModes.Sprint,
      } as MoveCommand];
    }

    case "idle":
    default:
      return [];
  }
}

// ── Fight end detection ───────────────────────────────────────────────────────

interface FightOutcome { done: boolean; winner: number | null }

function fightOutcome(world: WorldState): FightOutcome {
  const teams = new Map<number, { alive: number; dead: number }>();
  for (const e of world.entities) {
    const t = teams.get(e.teamId) ?? { alive: 0, dead: 0 };
    if (e.injury.dead) t.dead++; else t.alive++;
    teams.set(e.teamId, t);
  }
  const livingTeams = [...teams.entries()].filter(([, t]) => t.alive > 0);
  if (livingTeams.length <= 1) {
    return { done: true, winner: livingTeams[0]?.[0] ?? null };
  }
  if (world.tick >= MAX_TICKS) {
    return { done: true, winner: null };  // draw / timeout
  }
  return { done: false, winner: null };
}

// ── Simulation step ───────────────────────────────────────────────────────────

function runStep(world: WorldState, agentCmds: AgentCommand[]): void {
  const index = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, 5);

  const cmds: CommandMap = new Map();

  // Inject external agent commands for team 1 entities
  const agentIds = new Set(agentCmds.map(c => c.entityId));
  for (const ac of agentCmds) {
    const entity = index.byId.get(ac.entityId);
    if (!entity || entity.injury.dead) continue;
    // Validate: only allow controlling team 1
    if (entity.teamId !== 1) continue;
    const translated = agentCmdToCommands(ac, entity, world);
    if (translated.length > 0) cmds.set(entity.id, translated);
  }

  // AI fills in for everyone without an external command
  for (const entity of world.entities) {
    if (entity.injury.dead) continue;
    if (agentIds.has(entity.id) && cmds.has(entity.id)) continue;
    const policy  = AI_PRESETS["balanced"] ?? AI_PRESETS["lineInfantry"]!;
    const aiCmds = decideCommandsForEntity(world, index, spatial, entity, policy);
    if (aiCmds.length > 0) cmds.set(entity.id, aiCmds);
  }

  stepWorld(world, cmds, CTX);
}

// ── Simulation state ──────────────────────────────────────────────────────────

let { world, config } = createWorld();

function resetWorld(): void {
  const fresh = createWorld();
  world  = fresh.world;
  config = fresh.config;
}

// ── WebSocket server ──────────────────────────────────────────────────────────

const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

interface AgentClient {
  socket: Socket;
}

const agentClients = new Set<AgentClient>();

function wsAcceptKey(key: string): string {
  return crypto.createHash("sha1").update(key + WS_MAGIC).digest("base64");
}

function wsSendText(socket: Socket, msg: ServerMsg): void {
  if (socket.destroyed) return;
  const payload = Buffer.from(JSON.stringify(msg), "utf8");
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

/**
 * Parse a WebSocket frame from the client.
 * Handles masking (RFC 6455: client→server frames are always masked).
 * Returns the text payload, or null if not a complete text frame.
 */
function wsParseTextFrame(chunk: Buffer): string | null {
  if (chunk.length < 2) return null;
  const b0 = chunk.readUInt8(0);
  const b1 = chunk.readUInt8(1);
  const opcode = b0 & 0x0F;
  if (opcode !== 0x1) return null;          // not a text frame

  const masked  = (b1 & 0x80) !== 0;
  const payLen7 = b1 & 0x7F;

  let payLen: number;
  let offset: number;

  if (payLen7 < 126) {
    payLen = payLen7;
    offset = 2;
  } else if (payLen7 === 126) {
    if (chunk.length < 4) return null;
    payLen = chunk.readUInt16BE(2);
    offset = 4;
  } else {
    return null;  // 8-byte extended length not needed for commands
  }

  if (masked) {
    if (chunk.length < offset + 4 + payLen) return null;
    const k0 = chunk.readUInt8(offset);
    const k1 = chunk.readUInt8(offset + 1);
    const k2 = chunk.readUInt8(offset + 2);
    const k3 = chunk.readUInt8(offset + 3);
    offset += 4;
    const raw = chunk.slice(offset, offset + payLen);
    const mask = [k0, k1, k2, k3];
    const unmasked = Buffer.from(raw.map((b, i) => b ^ (mask[i % 4] ?? 0)));
    return unmasked.toString("utf8");
  }

  if (chunk.length < offset + payLen) return null;
  return chunk.slice(offset, offset + payLen).toString("utf8");
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

  const client: AgentClient = { socket };
  agentClients.add(client);

  // Send initial state
  wsSendText(socket, { type: "init", config, obs: buildObs(world) });

  socket.on("data", (chunk: Buffer) => {
    if (chunk.length < 2) return;
    const b0 = chunk.readUInt8(0) & 0x0F;

    if (b0 === 0x8) {  // close
      try { socket.write(Buffer.from([0x88, 0x00])); } catch { /* ignore */ }
      socket.destroy();
      return;
    }

    if (b0 === 0x9) {  // ping → pong
      const b1      = chunk.readUInt8(1);
      const masked  = (b1 & 0x80) !== 0;
      const payLen  = b1 & 0x7F;
      const dataOff = masked ? 6 : 2;
      const raw     = chunk.slice(dataOff, dataOff + payLen);
      const payload = masked
        ? Buffer.from(raw.map((b, i) => b ^ chunk.readUInt8(2 + (i % 4))))
        : raw;
      try { socket.write(Buffer.concat([Buffer.from([0x8A, payLen]), payload])); } catch { /* ignore */ }
      return;
    }

    // Text frame — agent command
    const text = wsParseTextFrame(chunk);
    if (!text) return;

    let msg: ClientMsg;
    try {
      msg = JSON.parse(text) as ClientMsg;
    } catch {
      wsSendText(socket, { type: "error", message: "invalid JSON" });
      return;
    }

    if (msg.type === "reset") {
      resetWorld();
      wsSendText(socket, { type: "init", config, obs: buildObs(world) });
      return;
    }

    if (msg.type === "step") {
      // Check if fight is already over
      const preCheck = fightOutcome(world);
      if (preCheck.done) {
        const m: ObsMsg = { type: "obs", tick: world.tick, entities: buildObs(world), done: true };
        if (preCheck.winner !== null) m.winner = preCheck.winner;
        wsSendText(socket, m);
        return;
      }

      // Advance simulation
      runStep(world, msg.commands ?? []);

      const outcome = fightOutcome(world);
      const obsMsg: ObsMsg = { type: "obs", tick: world.tick, entities: buildObs(world), done: outcome.done };
      if (outcome.winner !== null) obsMsg.winner = outcome.winner;
      wsSendText(socket, obsMsg);
      return;
    }

    wsSendText(socket, { type: "error", message: `unknown message type: ${(msg as Record<string, unknown>).type}` });
  });

  const remove = () => agentClients.delete(client);
  socket.on("close", remove);
  socket.on("error", () => { remove(); socket.destroy(); });

  console.log(`[agent-server] Agent connected (${agentClients.size} active)`);
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url    = req.url ?? "/";
  const method = req.method ?? "GET";

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (url === "/config" && method === "GET") {
    res.end(JSON.stringify(config));
    return;
  }

  if (url === "/status" && method === "GET") {
    const alive = world.entities.filter(e => !e.injury.dead);
    const teams = [...new Set(world.entities.map(e => e.teamId))].map(tid => ({
      teamId: tid,
      alive:  alive.filter(e => e.teamId === tid).length,
    }));
    res.end(JSON.stringify({ tick: world.tick, maxTicks: MAX_TICKS, teams }));
    return;
  }

  if (url === "/reset" && method === "POST") {
    resetWorld();
    // Notify all connected WebSocket clients
    for (const c of agentClients) {
      wsSendText(c.socket, { type: "init", config, obs: buildObs(world) });
    }
    res.end(JSON.stringify({ ok: true, tick: 0 }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
});

server.on("upgrade", (req, socket, _head) => {
  if (req.url === "/agent") {
    wsHandleUpgrade(req, socket as Socket);
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`[agent-server] Listening on http://localhost:${PORT}`);
  console.log(`[agent-server] WebSocket endpoint: ws://localhost:${PORT}/agent`);
  console.log(`[agent-server] Scenario: ${TEAM1_SIZE}v${TEAM2_SIZE}, seed ${SEED}, maxTicks ${MAX_TICKS}`);
  console.log(`[agent-server] Team 1 (controlled): entities 1–${TEAM1_SIZE}`);
  console.log(`[agent-server] Team 2 (AI):         entities ${TEAM1_SIZE + 1}–${TEAM1_SIZE + TEAM2_SIZE}`);
  console.log(`[agent-server] HTTP: GET /config, GET /status, POST /reset`);
});
