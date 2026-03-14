// tools/observer.ts — Integration Milestone 2: Minimal observer reading WorldState each tick
//
// Demonstrates how to hook into stepWorld and extract per‑tick entity state
// (positions, velocities, condition, injury) for debugging or visualisation.
// Uses the pure data‑extraction functions from debug.ts.

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
import { makeAttackCommand, defendBlock } from "../src/sim/commandBuilders.js";
import { STARTER_WEAPONS } from "../src/equipment.js";
import { extractMotionVectors, extractConditionSamples } from "../src/debug.js";

// ─── entity factory ───────────────────────────────────────────────────────────

function mkEntity(id: number, teamId: number, x_m: number, weaponId?: string): Entity {
  const attrs = generateIndividual(id, HUMAN_BASE);
  const items = [];
  if (weaponId) {
    const weapon = STARTER_WEAPONS.find(w => w.id === weaponId);
    if (weapon) items.push(weapon);
  }
  return {
    id,
    teamId,
    attributes: attrs,
    energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout: { items },
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

// ─── formatting helpers ───────────────────────────────────────────────────────

function fmtVec(v: { x: number; y: number; z: number }): string {
  return `(${(v.x / SCALE.m).toFixed(2)}, ${(v.y / SCALE.m).toFixed(2)}, ${(v.z / SCALE.m).toFixed(2)}) m`;
}

function fmtVel(v: { x: number; y: number; z: number }): string {
  const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) / SCALE.mps;
  return `speed=${speed.toFixed(2)} m/s`;
}

function fmtQ(v: number, scale = SCALE.Q): string {
  return `${(v / scale * 100).toFixed(1)}%`;
}

// ─── run ──────────────────────────────────────────────────────────────────────

function run(): void {
  const seed = 9999;
  const world: WorldState = {
    tick: 0,
    seed,
    entities: [
      mkEntity(1, 1, 0, "wpn_club"),
      mkEntity(2, 2, Math.trunc(0.8 * SCALE.m)), // 0.8 m apart
    ],
  };

  const ctx: KernelContext = {
    tractionCoeff: q(0.90) as any,
  };

  console.log("═".repeat(72));
  console.log("  ANANKE OBSERVER — seed", seed);
  console.log("  Attacker (id 1, club) vs Target (id 2, unarmed, blocking)");
  console.log("═".repeat(72));
  console.log();

  const maxTicks = 8;
  for (let tick = 0; tick < maxTicks; tick++) {
    console.log(`\n[ TICK ${world.tick} ]`);
    console.log("-".repeat(72));

    // Build indexes (required for command decisions, but we hard‑code commands)
    const index = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * SCALE.m));

    // Command generation: attacker strikes each tick, target blocks
    const cmds: CommandMap = new Map();
    cmds.set(1, [makeAttackCommand(2, { weaponId: "wpn_club", intensity: q(1.0) })]);
    cmds.set(2, [defendBlock(q(1.0))]);

    // Extract and print state BEFORE this tick's stepWorld
    const motion = extractMotionVectors(world);
    const condition = extractConditionSamples(world);

    for (const e of world.entities) {
      console.log(`Entity ${e.id} (team ${e.teamId}):`);
      const m = motion.find(mv => mv.entityId === e.id)!;
      const c = condition.find(cs => cs.entityId === e.id)!;
      console.log(`  position ${fmtVec(m.position_m)}  ${fmtVel(m.velocity_mps)}  facing ${fmtVec(m.facing)}`);
      console.log(`  shock ${fmtQ(c.shock)}  conc ${fmtQ(c.consciousness)}  fear ${fmtQ(c.fearQ)}  fluid ${fmtQ(c.fluidLoss)}`);
      console.log(`  dead? ${c.dead}`);
      if (e.injury.byRegion) {
        const regions = Object.entries(e.injury.byRegion);
        if (regions.length > 0) {
          console.log(`  per‑region damage:`);
          for (const [reg, r] of regions) {
            const rd = r as any;
            if (rd.surfaceDamage > 0 || rd.internalDamage > 0) {
              console.log(`    ${reg}: surface=${rd.surfaceDamage}, internal=${rd.internalDamage}, permanent=${rd.permanentDamage}`);
            }
          }
        }
      }
      console.log();
    }

    // Execute the tick
    stepWorld(world, cmds, ctx);

    // Print any notable events that happened during the tick
    // (We could attach a CollectingTrace here, but keep it simple for now)
    console.log("Commands executed:");
    for (const [id, cmdList] of cmds) {
      for (const cmd of cmdList) {
        console.log(`  ${id} → ${cmd.kind}${'targetId' in cmd ? ` target ${cmd.targetId}` : ''}`);
      }
    }

    // Stop early if target is dead or unconscious
    const target = world.entities.find(e => e.id === 2)!;
    if (target.injury.dead || target.injury.consciousness <= 0) {
      console.log("\n*** Target incapacitated — stopping simulation ***");
      break;
    }
  }

  console.log("\n═".repeat(72));
  console.log("  Final state after", world.tick, "ticks:");
  for (const e of world.entities) {
    console.log(`  Entity ${e.id}: shock ${fmtQ(e.injury.shock)} conc ${fmtQ(e.injury.consciousness)}`);
    if (e.injury.dead) console.log("    DEAD");
    else if (e.injury.consciousness <= 0) console.log("    UNCONSCIOUS");
  }
  console.log("═".repeat(72));
}

// ─── entry ──────────────────────────────────────────────────────────────────

run();