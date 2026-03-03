// tools/run-demo.ts  — Ananke engine demo
//
// Runs six scenarios:
//   1. Melee brawl (2 vs 2) — AI-driven commands, morale, weapon binds, stamina
//   2. Ranged engagement — archer vs two swordsmen approaching through mud
//   3. Skill showcase — expert vs novice swordsman (Phase 7)
//   4. Field medicine — treated vs untreated soldier (Phase 9)
//   5. Technology spectrum — era validation, exoskeleton combat, nanomedicine gate (Phase 11)
//   6. Combat narrative  — human-readable log, injury descriptions, outcome summary (Phase 18)

import { q, to, SCALE, type Q } from "../src/units.js";
import type { KernelContext } from "../src/sim/context";
import { stepWorld } from "../src/sim/kernel.js";
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
  STARTER_EXOSKELETONS,
  validateLoadout,
  type Loadout,
} from "../src/equipment.js";
import {
  TechEra,
  defaultTechContext,
} from "../src/sim/tech.js";
import { buildTerrainGrid } from "../src/sim/terrain.js";
import { buildSkillMap, combineSkillLevels, defaultSkillLevel } from "../src/sim/skills.js";
import type { WorldState } from "../src/sim/world.js";
import { CollectingTrace } from "../src/metrics.js";
import {
  buildCombatLog,
  describeInjuries,
  describeCombatOutcome,
  type NarrativeConfig,
} from "../src/narrative.js";

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

// ─── scenario 5: technology spectrum ─────────────────────────────────────────
//
// Three demonstrations in one scenario:
//
//   Part A — Era validation
//     Show which items from a mixed loadout are and aren't available per era.
//     Items: arm_mail (MetallicArmour), rng_pistol (FirearmsPropellant),
//            exo_combat (PoweredExoskeleton), rng_plasma_rifle (EnergyWeapons)
//
//   Part B — Exoskeleton combat
//     Baseline  (e1/t1): club + 25 kg ballast — same mass as exo, no tech bonus
//     Augmented (e2/t2): club + exo_combat    — +25% speed, +40% force, 200W drain
//     Start 10 m apart; print positions every 5 ticks to show faster closure.
//
//   Part C — Nanomedicine technology gate
//     Same wound (structuralDamage q(0.50)) on two patients.
//     Patient A: treated with surgicalKit (no capability req) — heals in any era.
//     Patient B: treated with nanomedicine tier —
//                works in DeepSpace (NanomedicalRepair present);
//                blocked in Modern (NanomedicalRepair absent).

function scenarioTech(): void {
  const club = STARTER_WEAPONS.find(w => w.id === "wpn_club")!;
  const exo  = STARTER_EXOSKELETONS.find(e => e.id === "exo_combat")!;

  console.log(`\n${"═".repeat(60)}`);
  console.log("  Technology Spectrum (Phase 11)");
  console.log(`${"═".repeat(60)}`);

  // ── Part A: Era validation ──────────────────────────────────────────────────
  console.log("\n── Part A: Era validation ──");

  const checkItems: [string, Loadout][] = [
    ["arm_mail",         { items: [STARTER_ARMOUR.find(a => a.id === "arm_mail")!] }],
    ["rng_pistol",       { items: [STARTER_RANGED_WEAPONS.find(w => w.id === "rng_pistol")!] }],
    ["exo_combat",       { items: [exo] }],
    ["rng_plasma_rifle", { items: [STARTER_RANGED_WEAPONS.find(w => w.id === "rng_plasma_rifle")!] }],
  ];

  const eras: Array<[string, number]> = [
    ["Prehistoric", TechEra.Prehistoric],
    ["Medieval",    TechEra.Medieval],
    ["EarlyModern", TechEra.EarlyModern],
    ["Modern",      TechEra.Modern],
    ["NearFuture",  TechEra.NearFuture],
    ["FarFuture",   TechEra.FarFuture],
    ["DeepSpace",   TechEra.DeepSpace],
  ];

  const itemPad = 18;
  const header = "  " + "Item".padEnd(itemPad) + eras.map(([n]) => n.padEnd(12)).join("");
  console.log(header);
  console.log("  " + "─".repeat(header.length - 2));

  for (const [itemName, loadout] of checkItems) {
    const row = "  " + itemName.padEnd(itemPad) +
      eras.map(([, era]) => {
        const ctx = defaultTechContext(era as any);
        const errors = validateLoadout(loadout, ctx);
        return (errors.length === 0 ? "✓" : "✗").padEnd(12);
      }).join("");
    console.log(row);
  }

  // ── Part B: Exoskeleton combat ──────────────────────────────────────────────
  console.log("\n── Part B: Exoskeleton combat (start 10 m apart) ──");
  console.log("  Baseline   (e1/t1): club + 25 kg ballast (no tech bonus)");
  console.log("  Augmented  (e2/t2): club + exo_combat  (+25% speed, +40% force, 200W drain)");
  console.log("  Watch augmented close distance faster and hit harder when they meet.\n");

  const ballast = { id: "ballast", kind: "gear" as const, name: "Ballast", mass_kg: exo.mass_kg, bulk: q(0) };

  const baseline  = mkHumanoidEntity(1, 1, 0, 0);
  baseline.loadout = { items: [club, ballast] };

  const augmented = mkHumanoidEntity(2, 2, Math.trunc(10.0 * M), 0);
  augmented.loadout = { items: [club, exo] };

  const worldExo = mkWorld(42, [baseline, augmented]);
  const traceExo = new DemoTrace();
  traceExo.quiet = true;

  const exoCellSize = Math.trunc(4 * M);
  const exoCtx: KernelContext = {
    tractionCoeff: q(0.80) as Q,
    tuning: TUNING.tactical,
    trace: traceExo,
  };

  for (let tick = 0; tick < 150; tick++) {
    const index   = buildWorldIndex(worldExo);
    const spatial = buildSpatialIndex(worldExo, exoCellSize);

    const cmds: CommandMap = new Map();
    for (const e of worldExo.entities) {
      if (e.injury.dead) continue;
      const policy = AI_PRESETS["lineInfantry"]!;
      const entityCmds = decideCommandsForEntity(worldExo, index, spatial, e, policy);
      if (entityCmds.length > 0) cmds.set(e.id, [...entityCmds]);
    }

    stepWorld(worldExo, cmds, exoCtx);

    if (tick % 5 === 0 || tick === 0) {
      const b = worldExo.entities.find(e => e.id === 1)!;
      const a = worldExo.entities.find(e => e.id === 2)!;
      if (!b.injury.dead && !a.injury.dead) {
        const dist_m = Math.abs(a.position_m.x - b.position_m.x) / M;
        console.log(
          `  tick ${String(tick).padStart(3)}: ` +
          `baseline x=${(b.position_m.x / M).toFixed(1).padStart(5)}m  ` +
          `augmented x=${(a.position_m.x / M).toFixed(1).padStart(5)}m  ` +
          `gap=${dist_m.toFixed(1)}m  ` +
          `res_aug=${a.energy.reserveEnergy_J}J`
        );
      }
    }

    if (allDead(worldExo, 1) || allDead(worldExo, 2)) break;
  }

  console.log("\n── final state ──");
  for (const e of worldExo.entities) console.log(entityLine(e));

  // ── Part C: Nanomedicine tech gate ─────────────────────────────────────────
  console.log("\n── Part C: Nanomedicine tech gate ──");
  console.log("  Wound: structuralDamage=50% on torso.  20 ticks of treatment.");
  console.log("  surgicalKit tier (no req):        works in any era");
  console.log("  nanomedicine tier (NanomedicalRepair):  Modern=blocked  DeepSpace=heals\n");

  const runGateTest = (tierLabel: string, tier: string, era: number | null): number => {
    const medic   = mkHumanoidEntity(1, 1, 0, 0);
    const patient = mkHumanoidEntity(2, 1, Math.trunc(0.5 * M), 0);
    patient.injury.byRegion["torso"]!.structuralDamage = q(0.50) as any;

    const world = mkWorld(1, [medic, patient]);
    const cmds = new Map([[1, [{
      kind: "treat" as const, targetId: 2,
      action: "surgery" as const,
      tier: tier as any,
      regionId: "torso",
    }]]]);

    const techCtx = era !== null ? defaultTechContext(era as any) : undefined;
    const ctx: KernelContext = { tractionCoeff: q(0.80) as Q, tuning: TUNING.tactical, ...(techCtx ? { techCtx } : {}) };
    for (let i = 0; i < 20; i++) stepWorld(world, cmds, ctx);
    const finalDmg = world.entities.find(e => e.id === 2)!.injury.byRegion["torso"]!.structuralDamage;
    const healed = finalDmg < q(0.50);
    console.log(`  ${tierLabel.padEnd(42)}: str=${pct(finalDmg)}  ${healed ? "✓ heals" : "✗ blocked"}`);
    return finalDmg;
  };

  runGateTest("surgicalKit   (no techCtx)",          "surgicalKit",  null);
  runGateTest("surgicalKit   (Modern era)",           "surgicalKit",  TechEra.Modern);
  runGateTest("nanomedicine  (no techCtx = gate off)","nanomedicine", null);
  runGateTest("nanomedicine  (Modern, gate ON)",      "nanomedicine", TechEra.Modern);
  runGateTest("nanomedicine  (DeepSpace, gate OFF)",  "nanomedicine", TechEra.DeepSpace);
}

// ─── scenario 6: combat narrative (Phase 18) ─────────────────────────────────
//
// Same 2v2 melee brawl as scenario 1, but output is rendered through the
// narrative layer instead of raw trace numbers.
//
// What the output shows:
//   terse log   — only the decisive moments (hits, KOs, deaths, fractures)
//   normal log  — adds blocked/parried/misses/grapple events  (much more text)
//   injuries    — English-language injury summary per entity at end
//   outcome     — one-line fight result with tick count

function scenarioNarrative(): void {
  const club  = STARTER_WEAPONS.find(w => w.id === "wpn_club")!;
  const sword = STARTER_WEAPONS.find(w => w.id === "wpn_longsword")
             ?? STARTER_WEAPONS[1]!;

  const a1 = mkHumanoidEntity(1, 1, Math.trunc(0.0 * M), 0);
  const a2 = mkHumanoidEntity(2, 1, Math.trunc(0.8 * M), 0);
  a1.loadout = { items: [sword, STARTER_ARMOUR[0]!] };
  a2.loadout = { items: [club,  STARTER_SHIELDS[0]!] };

  const b1 = mkHumanoidEntity(3, 2, Math.trunc(4.0 * M), 0);
  const b2 = mkHumanoidEntity(4, 2, Math.trunc(4.8 * M), 0);
  b1.loadout = { items: [sword] };
  b2.loadout = { items: [club, STARTER_ARMOUR[1]!] };

  const world = mkWorld(42, [a1, a2, b1, b2]);

  // Build weapon profiles map for verb selection in narrative
  const allWeapons = [...STARTER_WEAPONS, ...STARTER_RANGED_WEAPONS];
  const weaponProfiles = new Map(
    allWeapons
      .filter(w => (w as any).damage)
      .map(w => [w.id, (w as any).damage]),
  );

  // Name map — entity 1 is "you" for second-person demonstration
  const nameMap = new Map([
    [1, "you"],
    [2, "your ally"],
    [3, "the enemy"],
    [4, "the brute"],
  ]);

  const collecting = new CollectingTrace();
  let lastTick = 0;

  const cellSize = Math.trunc(4 * M);
  for (let tick = 0; tick < 300; tick++) {
    const index   = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, cellSize);

    const cmds: CommandMap = new Map();
    for (const e of world.entities) {
      if (e.injury.dead) continue;
      const policy = e.teamId === 1 ? AI_PRESETS["lineInfantry"]! : AI_PRESETS["skirmisher"]!;
      const entityCmds = decideCommandsForEntity(world, index, spatial, e, policy);
      if (entityCmds.length > 0) cmds.set(e.id, [...entityCmds]);
    }

    stepWorld(world, cmds, {
      tractionCoeff: q(0.80) as Q,
      tuning: TUNING.tactical,
      trace: collecting,
    });

    lastTick = tick;
    if (allDead(world, 1) || allDead(world, 2)) break;
  }

  const events = collecting.events;

  console.log(`\n${"═".repeat(60)}`);
  console.log("  Combat Narrative (Phase 18) — same 2v2 brawl, human-readable");
  console.log(`  seed=42  entities: you(1/t1), your ally(2/t1), 2× enemies`);
  console.log(`${"═".repeat(60)}`);

  // ── Terse log ────────────────────────────────────────────────────────────────
  console.log("\n── Terse log (hits, KOs, deaths, fractures only) ──");
  const terseCfg: NarrativeConfig = { verbosity: "terse", nameMap, weaponProfiles };
  const terseLines = buildCombatLog(events, terseCfg);
  for (const line of terseLines) console.log(`  ${line}`);
  if (terseLines.length === 0) console.log("  (no notable events)");

  // ── Normal log ───────────────────────────────────────────────────────────────
  console.log("\n── Normal log (adds blocks, parries, misses, grapple) ──");
  const normalCfg: NarrativeConfig = { verbosity: "normal", nameMap, weaponProfiles };
  const normalLines = buildCombatLog(events, normalCfg);
  // Print first 20 lines to keep output manageable
  const shown = normalLines.slice(0, 20);
  for (const line of shown) console.log(`  ${line}`);
  if (normalLines.length > 20) {
    console.log(`  … (${normalLines.length - 20} more lines at normal verbosity)`);
  }

  // ── Injury summaries ─────────────────────────────────────────────────────────
  console.log("\n── Injury summaries ──");
  for (const e of world.entities) {
    const name = nameMap.get(e.id) ?? `combatant ${e.id}`;
    console.log(`  ${name}: ${describeInjuries(e.injury)}`);
  }

  // ── Outcome ──────────────────────────────────────────────────────────────────
  console.log("\n── Outcome ──");
  const combatants = world.entities.map(e => ({
    id:     e.id,
    teamId: e.teamId,
    injury: { dead: e.injury.dead, consciousness: e.injury.consciousness },
  }));
  console.log(`  ${describeCombatOutcome(combatants, lastTick + 1)}`);
}

// ─── main ─────────────────────────────────────────────────────────────────────

scenarioMelee();
scenarioRanged();
scenarioSkills();
scenarioMedical();
scenarioTech();
scenarioNarrative();
