// tools/run-demo.ts  — Ananke engine demo
//
// Runs two scenarios:
//   1. Melee brawl (2 vs 2) — AI-driven commands, morale, weapon binds, stamina
//   2. Ranged engagement — archer vs two swordsmen approaching through mud

import { q, SCALE, type Q } from "../src/units.js";
import { type KernelContext, stepWorld } from "../src/sim/kernel.js";
import { TUNING } from "../src/sim/tuning.js";
import { mkWorld, mkHumanoidEntity } from "../src/sim/testing.js";
import { buildWorldIndex } from "../src/sim/indexing.js";
import { buildSpatialIndex } from "../src/sim/spatial.js";
import { TraceKinds } from "../src/sim/kinds.js";
import type { TraceEvent, TraceSink } from "../src/sim/trace.js";
import type { CommandMap } from "../src/sim/commands.js";
import { decideCommandsForEntity } from "../src/sim/ai/decide.js";
import { AI_PRESETS } from "../src/sim/ai/presets.js";
import { isRouting, moraleThreshold } from "../src/sim/morale.js";
import {
  STARTER_WEAPONS,
  STARTER_ARMOUR,
  STARTER_SHIELDS,
  STARTER_RANGED_WEAPONS,
} from "../src/equipment.js";
import { buildTerrainGrid } from "../src/sim/terrain.js";
import type { WorldState } from "../src/sim/world.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

const M = SCALE.m;

function pct(q: Q): string {
  return (q / SCALE.Q * 100).toFixed(0) + "%";
}

function entityLine(e: any): string {
  const inj = e.injury;
  const fear = (e.condition.fearQ ?? 0) as Q;
  const routing = isRouting(fear, e.attributes.resilience.distressTolerance);
  const flags = [
    inj.dead ? "DEAD" : "",
    routing ? "ROUTING" : "",
    (e.condition.suppressedTicks ?? 0) > 0 ? "SUPPRESSED" : "",
    e.condition.prone ? "prone" : "",
  ].filter(Boolean).join("|");
  return `  e${e.id}(t${e.teamId}) shock=${pct(inj.shock)} conc=${pct(inj.consciousness)} fear=${pct(fear)} res=${e.energy.reserveEnergy_J}J ${flags}`;
}

// ─── trace sink ───────────────────────────────────────────────────────────────

class DemoTrace implements TraceSink {
  quiet = false; // suppress move spam

  onEvent(ev: TraceEvent): void {
    switch (ev.kind) {
      case TraceKinds.TickStart:
        if (!this.quiet) console.log(`\n── tick ${(ev as any).tick} ──`);
        break;

      case TraceKinds.Attack:
        console.log(
          `  atk e${(ev as any).attackerId}→e${(ev as any).targetId}` +
          ` ${(ev as any).region} E=${(ev as any).energy_J}J` +
          ` arm=${(ev as any).armoured} blk=${(ev as any).blocked}` +
          ` shd=${(ev as any).shieldBlocked} pry=${(ev as any).parried}`
        );
        break;

      case TraceKinds.ProjectileHit:
        console.log(
          `  prj e${(ev as any).shooterId}→e${(ev as any).targetId}` +
          ` hit=${(ev as any).hit}` +
          (!(ev as any).hit ? ` suppressed=${(ev as any).suppressed}` : ` region=${(ev as any).region}`) +
          ` dist=${((ev as any).distance_m / M).toFixed(1)}m` +
          ` E=${(ev as any).energyAtImpact_J}J`
        );
        break;

      case TraceKinds.WeaponBind:
        console.log(`  bind e${(ev as any).entityAId}↔e${(ev as any).entityBId} (${(ev as any).durationTicks} ticks)`);
        break;

      case TraceKinds.WeaponBindBreak:
        console.log(`  bind-break e${(ev as any).entityAId}↔e${(ev as any).entityBId}`);
        break;

      case TraceKinds.MoraleRoute:
        console.log(`  !! ROUTE e${(ev as any).entityId} fearQ=${pct((ev as any).fearQ)}`);
        break;

      case TraceKinds.Injury:
        // Only print significant injury changes
        if ((ev as any).dead || (ev as any).shockQ > q(0.15)) {
          console.log(
            `  inj e${(ev as any).entityId} shock=${pct((ev as any).shockQ)}` +
            ` conc=${pct((ev as any).consciousnessQ)}` +
            ((ev as any).dead ? " **DEAD**" : "")
          );
        }
        break;
    }
  }
}

// ─── scenario runner ──────────────────────────────────────────────────────────

function allDead(world: WorldState, teamId: number): boolean {
  return world.entities.filter(e => e.teamId === teamId).every(e => e.injury.dead);
}

function runScenario(
  label: string,
  world: WorldState,
  ctx: KernelContext,
  maxTicks = 300,
): void {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"═".repeat(60)}`);

  const trace = ctx.trace as DemoTrace;

  for (let tick = 0; tick < maxTicks; tick++) {
    const index   = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * M));

    // AI generates commands for each living entity
    const cmds: CommandMap = new Map();
    for (const e of world.entities) {
      if (e.injury.dead) continue;
      const teamId = e.teamId;
      const policy = teamId === 1 ? AI_PRESETS["lineInfantry"]! : AI_PRESETS["skirmisher"]!;
      const entityCmds = decideCommandsForEntity(world, index, spatial, e, policy);
      if (entityCmds.length > 0) cmds.set(e.id, [...entityCmds]);
    }

    stepWorld(world, cmds, ctx);

    // Stop when one side is wiped out
    if (allDead(world, 1) || allDead(world, 2)) break;
  }

  // Final state
  console.log("\n── final state ──");
  for (const e of world.entities) {
    console.log(entityLine(e));
  }
}

// ─── scenario 1: melee brawl (2v2) ───────────────────────────────────────────

function scenarioMelee(): void {
  const club  = STARTER_WEAPONS.find(w => w.id === "wpn_club")!;
  const sword = STARTER_WEAPONS.find(w => w.id === "wpn_longsword")
             ?? STARTER_WEAPONS[1]!;

  // Team 1: two swordsmen, light armour
  const a1 = mkHumanoidEntity(1, 1, Math.trunc(0.0 * M), 0);
  const a2 = mkHumanoidEntity(2, 1, Math.trunc(0.8 * M), 0);
  a1.loadout = { items: [sword, STARTER_ARMOUR[0]!] };
  a2.loadout = { items: [club,  STARTER_SHIELDS[0]!] };

  // Team 2: two fighters, slightly further away
  const b1 = mkHumanoidEntity(3, 2, Math.trunc(4.0 * M), 0);
  const b2 = mkHumanoidEntity(4, 2, Math.trunc(4.8 * M), 0);
  b1.loadout = { items: [sword] };
  b2.loadout = { items: [club,  STARTER_ARMOUR[1]!] };

  const world = mkWorld(42, [a1, a2, b1, b2]);
  const trace = new DemoTrace();

  runScenario("Melee Brawl (2v2) — AI-driven, morale active", world, {
    tractionCoeff: q(0.80) as Q,
    tuning: TUNING.tactical,
    trace,
  });
}

// ─── scenario 2: ranged engagement (archer vs approaching infantry) ───────────

function scenarioRanged(): void {
  const shortbow = STARTER_RANGED_WEAPONS.find(w => w.id === "rng_shortbow")!;
  const sword    = STARTER_WEAPONS.find(w => w.id === "wpn_longsword")
                ?? STARTER_WEAPONS[1]!;

  // Team 1: one archer at x=0
  const archer = mkHumanoidEntity(1, 1, Math.trunc(0.0 * M), 0);
  archer.loadout = { items: [shortbow] };

  // Team 2: two swordsmen approaching from 30 m, one wading through mud (y=8m)
  const inf1 = mkHumanoidEntity(2, 2, Math.trunc(30.0 * M),  0);
  const inf2 = mkHumanoidEntity(3, 2, Math.trunc(30.0 * M), Math.trunc(8.0 * M));
  inf1.loadout = { items: [sword] };
  inf2.loadout = { items: [sword, STARTER_ARMOUR[1]!] };

  const world = mkWorld(99, [archer, inf1, inf2]);

  // Mud patch between x=10m..30m, y=4m..12m (cell size 4m: cells (2..7, 1..3))
  const mudCells: Record<string, "mud"> = {};
  for (let cx = 2; cx <= 7; cx++) {
    for (let cy = 0; cy <= 3; cy++) {
      mudCells[`${cx},${cy}`] = "mud";
    }
  }
  const terrainGrid = buildTerrainGrid(mudCells);

  // Ranged AI: archer uses shoot command; infantry use lineInfantry
  const trace = new DemoTrace();
  trace.quiet = true; // suppress tick headers to reduce noise

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Ranged Engagement — archer vs infantry through mud`);
  console.log(`  Mud zone: x=8..28m, y=0..12m (cells [2..7],[0..3])`);
  console.log(`${"═".repeat(60)}`);

  const cellSize = Math.trunc(4 * M);

  for (let tick = 0; tick < 400; tick++) {
    const index   = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, cellSize);

    const cmds: CommandMap = new Map();
    for (const e of world.entities) {
      if (e.injury.dead) continue;
      const policy = e.teamId === 1 ? AI_PRESETS["skirmisher"]! : AI_PRESETS["lineInfantry"]!;
      const entityCmds = decideCommandsForEntity(world, index, spatial, e, policy, undefined, undefined, cellSize);
      if (entityCmds.length > 0) cmds.set(e.id, [...entityCmds]);
    }

    // Archer always tries to shoot at nearest enemy if melee AI doesn't produce shoot cmd
    const archerCmds = cmds.get(archer.id) ?? [];
    const hasShoot = archerCmds.some(c => c.kind === "shoot");
    const hasAttack = archerCmds.some(c => c.kind === "attack");
    if (!archer.injury.dead && !hasShoot && !hasAttack) {
      const enemies = world.entities.filter(e => e.teamId !== archer.teamId && !e.injury.dead);
      if (enemies.length > 0) {
        const nearest = enemies.reduce((a, b) => {
          const da = Math.abs(b.position_m.x - archer.position_m.x);
          const db = Math.abs(a.position_m.x - archer.position_m.x);
          return da < db ? b : a;
        });
        cmds.set(archer.id, [{ kind: "shoot", targetId: nearest.id, weaponId: shortbow.id, intensity: q(1.0) as Q }]);
      }
    }

    // Print tick header every 20 ticks or when something notable happens
    if (tick % 20 === 0) {
      console.log(`\n── tick ${tick} ──`);
      for (const e of world.entities) {
        if (!e.injury.dead) console.log(entityLine(e));
      }
    }

    stepWorld(world, cmds, {
      tractionCoeff: q(0.80) as Q,
      tuning: TUNING.tactical,
      terrainGrid,
      cellSize_m: cellSize,
      trace,
    });

    if (allDead(world, 1) || allDead(world, 2)) break;
  }

  console.log("\n── final state ──");
  for (const e of world.entities) console.log(entityLine(e));
}

// ─── main ─────────────────────────────────────────────────────────────────────

scenarioMelee();
scenarioRanged();
