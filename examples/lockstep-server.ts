// examples/lockstep-server.ts — PA-10: Authoritative lockstep sample
//
// Demonstrates the authoritative lockstep pattern:
//  1. A single "server" world is the source of truth.
//  2. Each tick: collect input commands from all clients, step the world,
//     broadcast the resulting BridgeFrame + hash checksum to clients.
//  3. Clients apply the same commands and verify the checksum.
//     A mismatch triggers a resync (full world snapshot transfer).
//
// This example simulates two "virtual clients" in the same process to
// illustrate the protocol without actual networking.
//
// Run:  npm run build && node dist/examples/lockstep-server.js

import { q, SCALE, type Q }          from "../src/units.js";
import { KNIGHT_INFANTRY, HUMAN_BASE } from "../src/archetypes.js";
import { generateIndividual }          from "../src/generate.js";
import { defaultIntent }               from "../src/sim/intent.js";
import { defaultAction }               from "../src/sim/action.js";
import { defaultCondition }            from "../src/sim/condition.js";
import { defaultInjury }               from "../src/sim/injury.js";
import { v3 }                          from "../src/sim/vec3.js";
import { stepWorld }                   from "../src/sim/kernel.js";
import { buildWorldIndex }             from "../src/sim/indexing.js";
import { buildSpatialIndex }           from "../src/sim/spatial.js";
import { decideCommandsForEntity }     from "../src/sim/ai/decide.js";
import { AI_PRESETS }                  from "../src/sim/ai/presets.js";
import { STARTER_WEAPONS, STARTER_ARMOUR } from "../src/equipment.js";
import type { Entity }                 from "../src/sim/entity.js";
import type { KernelContext }          from "../src/sim/context.js";
import type { WorldState }             from "../src/sim/world.js";
import type { CommandMap }             from "../src/sim/commands.js";
import { serializeBridgeFrame }        from "../src/host-loop.js";
import { hashWorldState }              from "../src/netcode.js";
import { ReplayRecorder, serializeReplay } from "../src/replay.js";

const M   = SCALE.m;
const CTX: KernelContext = { tractionCoeff: q(0.90) as Q };
const TICKS = 40;
const SCENARIO_ID = "lockstep-demo";

// ── Entity factory ────────────────────────────────────────────────────────────

function makeEntity(id: number, teamId: number, seed: number,
                    arch: typeof KNIGHT_INFANTRY,
                    weaponId: string, armourId?: string): Entity {
  const attrs = generateIndividual(seed, arch);
  const items = [
    STARTER_WEAPONS.find(w => w.id === weaponId)!,
    ...(armourId ? [STARTER_ARMOUR.find(a => a.id === armourId)!] : []),
  ];
  return {
    id, teamId, attributes: attrs,
    energy:    { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout:   { items }, traits: [],
    position_m:   v3(id === 1 ? 0 : Math.trunc(0.6 * M), 0, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(), action: defaultAction(),
    condition: defaultCondition(), injury: defaultInjury(),
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
  };
}

function makeWorld(seed: number): WorldState {
  return {
    tick: 0, seed,
    entities: [
      makeEntity(1, 1, seed,     KNIGHT_INFANTRY, "wpn_longsword", "arm_mail"),
      makeEntity(2, 2, seed + 1, HUMAN_BASE,      "wpn_club"),
    ],
  };
}

// ── Authoritative server ──────────────────────────────────────────────────────

const authoritative = makeWorld(42);
const recorder      = new ReplayRecorder(authoritative);

// ── Virtual clients ───────────────────────────────────────────────────────────

const clientA = makeWorld(42);
const clientB = makeWorld(42);

let desyncsDetected = 0;

console.log("=== Ananke — Authoritative Lockstep Demo ===");
console.log(`Running ${TICKS} ticks with 2 virtual clients...\n`);

// ── Main loop ─────────────────────────────────────────────────────────────────

for (let t = 0; t < TICKS; t++) {
  // 1. Build AI commands (server is authoritative source)
  const idx     = buildWorldIndex(authoritative);
  const spatial = buildSpatialIndex(authoritative, Math.trunc(4 * M));
  const cmds: CommandMap = new Map();
  for (const e of authoritative.entities) {
    if (!e.injury.dead) {
      cmds.set(e.id, decideCommandsForEntity(authoritative, idx, spatial, e, AI_PRESETS.lineInfantry!));
    }
  }

  // 2. Record for replay
  recorder.record(authoritative.tick, cmds);

  // 3. Step authoritative world
  stepWorld(authoritative, cmds, CTX);

  // 4. Compute authoritative hash
  const authHash = hashWorldState(authoritative);

  // 5. Clients apply same commands and verify
  stepWorld(clientA, cmds, CTX);
  stepWorld(clientB, cmds, CTX);

  const hashA = hashWorldState(clientA);
  const hashB = hashWorldState(clientB);

  if (hashA !== authHash || hashB !== authHash) {
    desyncsDetected++;
    console.error(`  DESYNC at tick ${authoritative.tick}`);
    console.error(`    auth: ${authHash.toString(16)}`);
    console.error(`    A:    ${hashA.toString(16)}`);
    console.error(`    B:    ${hashB.toString(16)}`);
  }

  // 6. Publish BridgeFrame to renderer clients
  const frame = serializeBridgeFrame(authoritative, { scenarioId: SCENARIO_ID });

  if (t === 0 || t === TICKS - 1) {
    console.log(`tick=${frame.tick.toString().padStart(3)}  hash=${authHash.toString(16).padStart(16, "0")}  entities=${frame.entities.length}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

const e1  = authoritative.entities[0]!;
const e2  = authoritative.entities[1]!;
const pct = (v: number) => ((v / SCALE.Q) * 100).toFixed(0).padStart(3) + "%";

console.log(`\nFinal state after ${authoritative.tick} ticks:`);
console.log(`  Knight:  shock=${pct(e1.injury.shock)}  dead=${e1.injury.dead}`);
console.log(`  Brawler: shock=${pct(e2.injury.shock)}  dead=${e2.injury.dead}`);
console.log(`\nDesync events: ${desyncsDetected}`);

// ── Replay export ─────────────────────────────────────────────────────────────

const replayJson = serializeReplay(recorder.toReplay());
console.log(`\nReplay: ${replayJson.length} bytes, ${authoritative.tick} frames.`);
console.log("  Use 'ananke replay diff' to compare against a second client's recording.");
