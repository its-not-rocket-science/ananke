// examples/rollback-client.ts — PA-10: Rollback netcode sample
//
// Demonstrates client-side speculative execution with server reconciliation:
//
//  1. Client predicts locally by applying its own inputs immediately.
//  2. Server authoritatively steps the world and returns confirmed hash.
//  3. When the confirmed hash arrives, the client compares:
//     - Match  → discard the saved snapshot, continue predicting.
//     - Mismatch → roll back to the saved snapshot and re-apply all
//                  un-acknowledged inputs using the server's authoritative commands.
//
// This example simulates one client round-trip in a single process.
//
// Run:  npm run build && node dist/examples/rollback-client.js

import { q, SCALE, type Q }           from "../src/units.js";
import { KNIGHT_INFANTRY, HUMAN_BASE } from "../src/archetypes.js";
import { generateIndividual }          from "../src/generate.js";
import { defaultIntent }               from "../src/sim/intent.js";
import { defaultAction }               from "../src/sim/action.js";
import { defaultCondition }            from "../src/sim/condition.js";
import { defaultInjury }               from "../src/sim/injury.js";
import { v3 }                          from "../src/sim/vec3.js";
import { stepWorld }                   from "../src/sim/kernel.js";
import { STARTER_WEAPONS, STARTER_ARMOUR } from "../src/equipment.js";
import type { Entity }                 from "../src/sim/entity.js";
import type { KernelContext }          from "../src/sim/context.js";
import type { WorldState }             from "../src/sim/world.js";
import type { CommandMap }             from "../src/sim/commands.js";
import { hashWorldState }              from "../src/netcode.js";

const M   = SCALE.m;
const CTX: KernelContext = { tractionCoeff: q(0.90) as Q };
const SWORD = STARTER_WEAPONS.find(w => w.id === "wpn_longsword")!;

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

const pct = (v: number) => ((v / SCALE.Q) * 100).toFixed(1).padStart(5) + "%";
function printState(label: string, world: WorldState): void {
  const e1 = world.entities[0]!;
  const e2 = world.entities[1]!;
  console.log(`[${label}] tick=${world.tick}  knight.shock=${pct(e1.injury.shock)}  brawler.shock=${pct(e2.injury.shock)}`);
}

// ── Authoritative server (simulated inline) ───────────────────────────────────

const serverWorld = makeWorld(42);

// ── Client state ──────────────────────────────────────────────────────────────

let clientWorld: WorldState = makeWorld(42);
let confirmedSnapshot: WorldState = structuredClone(clientWorld);
let confirmedTick = 0;
const pendingInputs: Array<{ tick: number; cmds: CommandMap }> = [];

console.log("=== Ananke — Rollback Netcode Demo ===\n");

// ── Round 1: client predicts an attack, server confirms ───────────────────────

const attackCmd: CommandMap = new Map([[
  1, [{ kind: "attack" as const, targetId: 2, weaponId: SWORD.id, intensity: q(1.0) }],
]]);

// Client speculates
pendingInputs.push({ tick: clientWorld.tick, cmds: attackCmd });
stepWorld(clientWorld, attackCmd, CTX);
printState("client (speculative)", clientWorld);

// Server also applies the attack (same command — no desync)
stepWorld(serverWorld, attackCmd, CTX);
const serverHash1 = hashWorldState(serverWorld);

// Reconcile
if (hashWorldState(clientWorld) === serverHash1) {
  confirmedSnapshot = structuredClone(clientWorld);
  confirmedTick     = clientWorld.tick;
  pendingInputs.length = 0;
  console.log(`[reconcile OK]  tick=${confirmedTick} — hashes match, snapshot advanced\n`);
} else {
  console.log("[reconcile MISMATCH] (unexpected)\n");
}

// ── Round 2: client predicts idle; server applies a DIFFERENT command ─────────
// Simulates a late or dropped-packet scenario where the server received an
// extra authoritative input that the client was not aware of.

const clientIdle: CommandMap = new Map();
pendingInputs.push({ tick: clientWorld.tick, cmds: clientIdle });
stepWorld(clientWorld, clientIdle, CTX);
printState("client (speculative idle)", clientWorld);

// Server steps with a second attack (authoritative command differs)
const serverOverride: CommandMap = new Map([[
  1, [{ kind: "attack" as const, targetId: 2, weaponId: SWORD.id, intensity: q(0.6) }],
]]);
stepWorld(serverWorld, serverOverride, CTX);
const serverHash2 = hashWorldState(serverWorld);

// Reconcile
if (hashWorldState(clientWorld) !== serverHash2) {
  console.log(`[reconcile MISMATCH]  rolling back to tick ${confirmedTick}...`);

  // Roll back to last confirmed snapshot
  clientWorld = structuredClone(confirmedSnapshot);

  // Re-simulate from confirmed tick using the server's authoritative command
  stepWorld(clientWorld, serverOverride, CTX);

  confirmedSnapshot = structuredClone(clientWorld);
  confirmedTick     = clientWorld.tick;
  pendingInputs.length = 0;

  printState("client (after rollback)", clientWorld);
  console.log(`[reconcile COMPLETE]  re-synced at tick ${confirmedTick}\n`);
} else {
  console.log("[reconcile OK] no rollback needed\n");
}

// ── Final verification ────────────────────────────────────────────────────────

const clientHash = hashWorldState(clientWorld);
const srvHash    = hashWorldState(serverWorld);

console.log(`Final hashes:`);
console.log(`  client: ${clientHash.toString(16).padStart(16, "0")}`);
console.log(`  server: ${srvHash.toString(16).padStart(16, "0")}`);
console.log(`In sync: ${clientHash === srvHash}`);
