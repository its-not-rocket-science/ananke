// tools/run-demo.ts  — Ananke engine demo
//
// Runs four scenarios:
//   1. Melee brawl (2 vs 2) — AI-driven commands, morale, weapon binds, stamina
//   2. Ranged engagement — archer vs two swordsmen approaching through mud
//   3. Skill showcase — expert vs novice swordsman (Phase 7)
//   4. Field medicine — treated vs untreated soldier (Phase 9)

import { q, to, SCALE, type Q } from "../src/units.js";
import { type KernelContext, stepWorld } from "../src/sim/kernel.js";
import { TUNING } from "../src/sim/tuning.js";
import { mkWorld, mkHumanoidEntity } from "../src/sim/testing.js";
import { buildWorldIndex } from "../src/sim/indexing.js";
import { buildSpatialIndex } from "../src/sim/spatial.js";
import { TraceKinds, CommandKinds } from "../src/sim/kinds.js";
import type { MedicalAction } from "../src/sim/medical.js";
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
import { buildSkillMap, combineSkillLevels, defaultSkillLevel } from "../src/sim/skills.js";
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
        // Only print significant injury changes; suppress in quiet mode (medical scenario uses medLine)
        if (!this.quiet && ((ev as any).dead || (ev as any).shockQ > q(0.15))) {
          console.log(
            `  inj e${(ev as any).entityId} shock=${pct((ev as any).shockQ)}` +
            ` conc=${pct((ev as any).consciousnessQ)}` +
            ((ev as any).dead ? " **DEAD**" : "")
          );
        }
        break;

      case TraceKinds.Fracture:
        console.log(`  fracture e${(ev as any).entityId} region=${(ev as any).region}`);
        break;

      case TraceKinds.TreatmentApplied: {
        const t = ev as any;
        // Surgery fires every tick — skip it to avoid noise; log one-shot actions only
        if (t.action === "tourniquet" || t.action === "fluidReplacement") {
          console.log(`  treat e${t.treaterId}→e${t.targetId} ${t.action}${t.regionId ? ` [${t.regionId}]` : ""}`);
        }
        break;
      }
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

// ─── scenario 3: skill showcase (expert vs novice swordsman) ─────────────────
//
// Both fighters are physically identical (same archetype, same loadout).
// Expert carries three skill entries; novice has none (getSkill returns neutral defaults).
//
// What the output shows:
//   atk E values   — expert delivers 1.40× more energy per hit
//   attack rate    — expert cooldown is 10 ticks (0.5 s) vs novice 15 ticks (0.75 s)
//   final res (J)  — expert's fatigueRateMul 0.70 keeps reserves higher

function scenarioSkills(): void {
  const sword  = STARTER_WEAPONS.find(w => w.id === "wpn_longsword")!;
  const armour = STARTER_ARMOUR[0]!;
  const cellSize = Math.trunc(4 * M);

  // Expert meleeCombat: combine base technique with an athleticism timing synergy.
  // Base  : hitTimingOffset = −0.20 s, energyTransferMul = 1.40×
  // Synergy: additional −0.05 s from faster muscle response (athletics-trained)
  // Total : hitTimingOffset = −0.25 s  →  10-tick cooldown (vs 15 for novice)
  const expertMelee = combineSkillLevels(
    { ...defaultSkillLevel(), hitTimingOffset_s: -to.s(0.20), energyTransferMul: q(1.40) as Q },
    { ...defaultSkillLevel(), hitTimingOffset_s: -to.s(0.05) },
  );

  const expert = mkHumanoidEntity(1, 1, 0, 0);
  expert.loadout = { items: [sword, armour] };
  expert.skills = buildSkillMap({
    meleeCombat:  expertMelee,
    meleeDefence: { energyTransferMul: q(1.50) as Q },  // 50% better parry/block
    athleticism:  { fatigueRateMul:    q(0.70) as Q },  // 30% less fatigue per tick
  });

  // Novice: identical equipment and attributes; no skills set.
  // Start at exactly desiredRange_m (0.9 m) so neither entity needs to move —
  // avoids the 10-tick decision-latency overshoot that causes oscillation.
  const novice = mkHumanoidEntity(2, 2, Math.trunc(0.9 * M), 0);
  novice.loadout = { items: [sword, armour] };

  const world = mkWorld(7, [expert, novice]);
  const trace = new DemoTrace();
  const policy = AI_PRESETS["lineInfantry"]!;  // same AI policy for both

  console.log(`\n${"═".repeat(60)}`);
  console.log("  Skill Showcase — Expert Swordsman (e1/t1) vs Novice (e2/t2)");
  console.log("  Identical: longsword + light armour, same archetype attributes");
  console.log("  Expert skills (Phase 7):");
  console.log("    meleeCombat  timing −0.25 s total → 10-tick cd (novice: 15)");
  console.log("    meleeCombat  energyTransferMul 1.40× → harder strikes");
  console.log("    meleeDefence energyTransferMul 1.50× → better parry/block");
  console.log("    athleticism  fatigueRateMul    0.70× → 30% less fatigue");
  console.log(`${"═".repeat(60)}`);

  for (let tick = 0; tick < 200; tick++) {
    const index   = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, cellSize);

    const cmds: CommandMap = new Map();
    for (const e of world.entities) {
      if (e.injury.dead) continue;
      const entityCmds = decideCommandsForEntity(world, index, spatial, e, policy);
      if (entityCmds.length > 0) cmds.set(e.id, [...entityCmds]);
    }

    stepWorld(world, cmds, {
      tractionCoeff: q(0.80) as Q,
      tuning: TUNING.tactical,
      trace,
    });

    if (allDead(world, 1) || allDead(world, 2)) break;
  }

  console.log("\n── final state ──");
  for (const e of world.entities) {
    console.log(entityLine(e));
  }
  console.log("  (res reflects athleticism: expert drains less energy per tick)");
}

// ─── scenario 4: field medicine — treated vs untreated soldier ────────────────
//
// Two soldiers receive identical torso wounds at tick 0.
// Soldier A (e1) is treated by a medic (e3) standing 1 m away.
// Soldier B (e2) is 20 m away — outside the 2 m treatment radius — untreated.
//
// What the output shows:
//   treated   — tourniquet zeroes bleeding immediately; surgery slowly repairs
//               structural damage; infection never develops
//   untreated — fluid loss accumulates q(0.003)/tick; infection onsets at
//               tick 100 (5 s), adding q(0.0003)/tick internal damage; death
//               near tick 267 (13.4 s) when fluidLoss reaches fatal q(0.80)

function scenarioMedical(): void {
  const WOUND_REGION = "torso";

  // Soldier A (treated): at origin; medic is 1 m away (within 2 m treatment range)
  const soldierA = mkHumanoidEntity(1, 1, 0, 0);
  // Soldier B (untreated): 20 m away — far outside treatment range
  const soldierB = mkHumanoidEntity(2, 1, Math.trunc(20 * M), 0);
  // Medic: 1 m from soldier A, surgicalKit tier, 20% treatment skill bonus
  const medic    = mkHumanoidEntity(3, 1, Math.trunc(1 * M), 0);
  medic.skills   = buildSkillMap({
    medical: { ...defaultSkillLevel(), treatmentRateMul: q(1.20) as Q },
  });

  // Identical torso wound on both soldiers:
  //   bleedingRate q(0.06) → q(0.003)/tick fluid loss → fatal at ~tick 267
  //   internalDamage q(0.20) > infection threshold q(0.10) — infection can develop
  //   structuralDamage q(0.55) — significant but below fracture threshold q(0.70)
  const applyWound = (e: any) => {
    const r = e.injury.byRegion[WOUND_REGION];
    r.bleedingRate     = q(0.06) as Q;
    r.structuralDamage = q(0.55) as Q;
    r.internalDamage   = q(0.20) as Q;
  };
  applyWound(soldierA);
  applyWound(soldierB);

  const world = mkWorld(1, [soldierA, soldierB, medic]);
  const trace = new DemoTrace();
  trace.quiet = true;  // suppress tick headers from DemoTrace; we print our own

  const ctx: KernelContext = {
    tractionCoeff: q(0.80) as Q,
    tuning: TUNING.tactical,
    trace,
  };

  console.log(`\n${"═".repeat(60)}`);
  console.log("  Field Medicine — Treated (e1) vs Untreated (e2)");
  console.log("  Wound: torso bleed=6%  str=55%  int=20%  TICK_HZ=20");
  console.log("  Medic (e3): surgicalKit tier, treatmentRateMul=1.20×");
  console.log("  Infection onset: tick 100 (5 s) if still bleeding");
  console.log("  Fatal fluid loss: q(0.80) ≈ tick 267 (13.4 s)");
  console.log(`${"═".repeat(60)}`);

  const medLine = (label: string, e: any) => {
    const r = e.injury.byRegion[WOUND_REGION];
    const infected = r.infectedTick >= 0;
    const flags = [
      e.injury.dead     ? "DEAD"     : "",
      infected          ? "INFECTED" : "",
      r.fractured       ? "FRACTURED": "",
    ].filter(Boolean).join("|");
    console.log(
      `  ${label}` +
      ` bleed=${pct(r.bleedingRate)}` +
      ` fluid=${pct(e.injury.fluidLoss)}` +
      ` shock=${pct(e.injury.shock)}` +
      ` str=${pct(r.structuralDamage)}` +
      (flags ? `  [${flags}]` : ""),
    );
  };

  for (let tick = 0; tick < 300; tick++) {
    const index = buildWorldIndex(world);
    const cmds: CommandMap = new Map();

    // Medic treats soldier A: tourniquet on tick 0 (stops bleeding), surgery thereafter
    if (!medic.injury.dead && !soldierA.injury.dead) {
      const action: MedicalAction = tick === 0 ? "tourniquet" : "surgery";
      cmds.set(medic.id, [{
        kind: CommandKinds.Treat,
        targetId: soldierA.id,
        action,
        tier: "surgicalKit",
        regionId: WOUND_REGION,
      }]);
    }

    stepWorld(world, cmds, ctx);

    if (tick % 25 === 0 || soldierB.injury.dead) {
      console.log(`\n── tick ${tick} (${(tick / 20).toFixed(1)} s) ──`);
      medLine("treated  (e1):", soldierA);
      medLine("untreated(e2):", soldierB);
    }

    if (soldierB.injury.dead) break;
  }

  console.log("\n── outcome ──");
  medLine("treated  (e1):", soldierA);
  medLine("untreated(e2):", soldierB);
}

// ─── main ─────────────────────────────────────────────────────────────────────

scenarioMelee();
scenarioRanged();
scenarioSkills();
scenarioMedical();
