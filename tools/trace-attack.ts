// tools/trace-attack.ts — Integration Milestone 2: Trace data flow of a simple melee attack
//
// Demonstrates the kernel's internal data flow from Command input through injury output.
// Sets up two entities, issues an AttackCommand, runs stepWorld with a CollectingTrace
// sink, and prints all trace events with commentary mapping each event to the simulation
// pipeline.

import { q, SCALE } from "../src/units.js";
import { generateIndividual } from "../src/generate.js";
import { HUMAN_BASE } from "../src/archetypes.js";
import { defaultIntent } from "../src/sim/intent.js";
import { defaultAction } from "../src/sim/action.js";
import { defaultCondition } from "../src/sim/condition.js";
import { defaultInjury } from "../src/sim/injury.js";
import { v3 } from "../src/sim/vec3.js";
import { stepWorld } from "../src/sim/kernel.js";
import { buildWorldIndex } from "../src/sim/indexing.js";
import { buildSpatialIndex } from "../src/sim/spatial.js";
import type { Entity } from "../src/sim/entity.js";
import type { WorldState } from "../src/sim/world.js";
import type { KernelContext } from "../src/sim/context.js";
import type { CommandMap } from "../src/sim/commands.js";
import { makeAttackCommand } from "../src/sim/commandBuilders.js";
import { STARTER_WEAPONS } from "../src/equipment.js";
import { CollectingTrace } from "../src/metrics.js";
import { TraceKinds } from "../src/sim/kinds.js";

// ─── entity factory ───────────────────────────────────────────────────────────

function makeAttacker(id: number, teamId: number, x_m: number): Entity {
  const attrs = generateIndividual(id, HUMAN_BASE);
  const club = STARTER_WEAPONS.find(w => w.id === "wpn_club")!;
  return {
    id,
    teamId,
    attributes: attrs,
    energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout: { items: [club] },
    traits: [],
    position_m: v3(x_m, 0, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(),
    action: defaultAction(),
    condition: defaultCondition(),
    injury: defaultInjury(),
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
  };
}

function makeTarget(id: number, teamId: number, x_m: number): Entity {
  const attrs = generateIndividual(id, HUMAN_BASE);
  return {
    id,
    teamId,
    attributes: attrs,
    energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout: { items: [] }, // unarmed
    traits: [],
    position_m: v3(x_m, 0, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(),
    action: defaultAction(),
    condition: defaultCondition(),
    injury: defaultInjury(),
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
  };
}

// ─── commentary mapping ──────────────────────────────────────────────────────

const FLOW_EXPLANATION: Record<string, string> = {
  [TraceKinds.TickStart]:      "Kernel begins processing tick — clears ImpactEvent queue",
  [TraceKinds.Intent]:         "Entity's intent state (derived from previous tick's commands) captured before movement",
  [TraceKinds.Move]:           "Movement resolved; position and velocity updated",
  [TraceKinds.AttackAttempt]:  "resolveAttack: hit roll, block/parry check, area selection, hitQuality computed",
  [TraceKinds.Attack]:         "resolveHit: energy delivered to region, armour/shield penetration, injury accumulated",
  [TraceKinds.Injury]:         "stepConditionsToInjury: shock, fluidLoss, consciousness updated from accumulated damage",
  [TraceKinds.KO]:             "Consciousness reached zero — entity unconscious",
  [TraceKinds.Death]:          "Shock reached threshold or fatal injury — entity dead",
  [TraceKinds.Fracture]:       "Bone fracture detected (internal damage ≥ threshold)",
  [TraceKinds.TickEnd]:        "Tick complete — all queued ImpactEvents applied, state finalised",
};

// ─── formatting ──────────────────────────────────────────────────────────────

function fmtEvent(ev: any): string {
  const lines = [];
  lines.push(`[${ev.kind}] tick=${ev.tick}`);
  for (const [k, v] of Object.entries(ev)) {
    if (k === "kind" || k === "tick") continue;
    if (v === undefined || v === null) continue;
    if (typeof v === "number" && v > 10000) {
      lines.push(`  ${k}=${v.toLocaleString()}`);
    } else {
      lines.push(`  ${k}=${JSON.stringify(v)}`);
    }
  }
  return lines.join("\n");
}

// ─── run ────────────────────────────────────────────────────────────────────

function run(): void {
  const seed = 12345;
  const world: WorldState = {
    tick: 0,
    seed,
    entities: [
      makeAttacker(1, 1, 0),
      makeTarget(2, 2, Math.trunc(0.5 * SCALE.m)), // 0.5 metres apart
    ],
  };

  const ctx: KernelContext = {
    tractionCoeff: q(0.90) as any,
  };

  const tracer = new CollectingTrace();
  const cmds: CommandMap = new Map();
  // Attacker attempts to strike target with club
  cmds.set(1, [makeAttackCommand(2, { weaponId: "wpn_club", intensity: q(1.0) })]);
  // Target does not defend (no command)

  console.log("═".repeat(72));
  console.log("  ANANKE ATTACK TRACE — seed", seed);
  console.log("  Attacker (id 1, club) vs Target (id 2, unarmed, no defence)");
  console.log("═".repeat(72));
  console.log();

  console.log("Initial state:");
  console.log("  Attacker position:", world.entities[0]!.position_m);
  console.log("  Target position:  ", world.entities[1]!.position_m);
  console.log("  Distance:         0.5 m");
  console.log();

  // Run a single tick
  stepWorld(world, cmds, { ...ctx, trace: tracer });

  console.log("Events captured (in order of emission):");
  console.log("-".repeat(72));

  for (let i = 0; i < tracer.events.length; i++) {
    const ev = tracer.events[i]!;
    console.log(`${i + 1}. ${FLOW_EXPLANATION[ev.kind] ?? "(no commentary)"}`);
    console.log(fmtEvent(ev));
    console.log();
  }

  console.log("-".repeat(72));
  console.log("Final entity state after tick", world.tick, ":");
  for (const e of world.entities) {
    console.log(`  Entity ${e.id} (team ${e.teamId}):`);
    console.log(`    shock          ${e.injury.shock}/${SCALE.Q} (${(e.injury.shock / SCALE.Q * 100).toFixed(1)}%)`);
    console.log(`    consciousness ${e.injury.consciousness}/${SCALE.Q} (${(e.injury.consciousness / SCALE.Q * 100).toFixed(1)}%)`);
    console.log(`    fluidLoss     ${e.injury.fluidLoss}/${SCALE.Q} (${(e.injury.fluidLoss / SCALE.Q * 100).toFixed(1)}%)`);
    console.log(`    dead?         ${e.injury.dead}`);
    if (e.injury.byRegion) {
      const regions = Object.entries(e.injury.byRegion);
      if (regions.length > 0) {
        console.log(`    per‑region damage:`);
        for (const [reg, r] of regions) {
          const rd = r as any;
          if (rd.surfaceDamage > 0 || rd.internalDamage > 0) {
            console.log(`      ${reg}: surface=${rd.surfaceDamage}, internal=${rd.internalDamage}, permanent=${rd.permanentDamage}`);
          }
        }
      }
    }
  }

  console.log();
  console.log("═".repeat(72));
  console.log("  Data‑flow summary:");
  console.log("  1. Command → intent (Intent event)");
  console.log("  2. Movement (Move event)");
  console.log("  3. Attack attempt (AttackAttempt event) — hit roll, block, area");
  console.log("  4. Hit resolution (Attack event) — energy, region, armour/shield");
  console.log("  5. Injury accumulation (Injury event) — shock, fluidLoss, consciousness");
  console.log("  6. Tick end (TickEnd event) — ImpactEvent queue cleared");
  console.log("═".repeat(72));
}

// ─── entry ──────────────────────────────────────────────────────────────────

run();