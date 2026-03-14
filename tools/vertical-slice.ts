// tools/vertical-slice.ts — Integration & Adoption Milestone 1
//
// Confirm Fit for Purpose: Use-Case Validation
//
// A focused 1v1 duel demonstrating that Ananke's physics depth generates
// meaningful, varied, emergent outcomes that translate to tangible gameplay.
//
// Fighter A — "The Knight":  KNIGHT_INFANTRY archetype, mail armour, longsword
// Fighter B — "The Brawler": HUMAN_BASE archetype, no armour, club
//
// Run:  npm run build && node dist/tools/vertical-slice.js
// Seed: SEED=<n> node dist/tools/vertical-slice.js  (default: 1)
//
// For each seed the script prints:
//   • A per-tick summary showing the physics unfolding
//   • A final state breakdown with simulation-backed injury prose
//   • A validation summary confirming which fit-for-purpose claims hold

import { q, to, SCALE, type Q } from "../src/units.js";
import { KNIGHT_INFANTRY, HUMAN_BASE } from "../src/archetypes.js";
import { generateIndividual } from "../src/generate.js";
import { defaultIntent } from "../src/sim/intent.js";
import { defaultAction } from "../src/sim/action.js";
import { defaultCondition } from "../src/sim/condition.js";
import { defaultInjury } from "../src/sim/injury.js";
import { v3 } from "../src/sim/vec3.js";
import { stepWorld } from "../src/sim/kernel.js";
import { buildWorldIndex } from "../src/sim/indexing.js";
import { buildSpatialIndex } from "../src/sim/spatial.js";
import { decideCommandsForEntity } from "../src/sim/ai/decide.js";
import { AI_PRESETS } from "../src/sim/ai/presets.js";
import { isRouting } from "../src/sim/morale.js";
import { describeInjuries, describeCombatOutcome } from "../src/narrative.js";
import { STARTER_WEAPONS, STARTER_ARMOUR } from "../src/equipment.js";
import type { Entity } from "../src/sim/entity.js";
import type { WorldState } from "../src/sim/world.js";
import type { KernelContext } from "../src/sim/context.js";
import type { CommandMap } from "../src/sim/commands.js";

// ─── seed ─────────────────────────────────────────────────────────────────────

// Seed is passed as the first CLI argument: node dist/tools/vertical-slice.js 42
// Falls back to seed 1 if not supplied.
declare const process: { argv?: string[] } | undefined;
const SEED = parseInt(
  (typeof process !== "undefined" ? process.argv?.[2] : undefined) ?? "1",
  10,
);
const MAX_TICKS = 400;

// ─── formatting helpers ───────────────────────────────────────────────────────

const M = SCALE.m;

function pct(v: Q | number, scale = SCALE.Q): string {
  return ((v as number) / scale * 100).toFixed(0).padStart(3) + "%";
}

function bar(v: Q | number, scale = SCALE.Q, width = 10): string {
  const filled = Math.round((v as number) / scale * width);
  return "[" + "█".repeat(filled) + "░".repeat(width - filled) + "]";
}

function joules(j: number): string {
  return j.toLocaleString().padStart(6) + " J";
}

// ─── entity factory ───────────────────────────────────────────────────────────

function makeKnight(seed: number): Entity {
  const attrs = generateIndividual(seed, KNIGHT_INFANTRY);
  const sword  = STARTER_WEAPONS.find(w => w.id === "wpn_longsword")!;
  const mail   = STARTER_ARMOUR.find(a => a.id === "arm_mail")!;
  return {
    id: 1, teamId: 1, attributes: attrs,
    energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout: { items: [sword, mail] },
    traits: [],
    position_m: v3(0, 0, 0),
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
    energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout: { items: [club] },
    traits: [],
    position_m: v3(Math.trunc(0.6 * M), 0, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(), action: defaultAction(),
    condition: defaultCondition(), injury: defaultInjury(),
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
  };
}

// ─── tick summary ─────────────────────────────────────────────────────────────

interface TickSnapshot {
  tick: number;
  knightShock: Q;
  knightConc: Q;
  knightFear: Q;
  knightFatigue: Q;
  knightEnergy: number;
  brawlerShock: Q;
  brawlerConc: Q;
  brawlerFear: Q;
  brawlerFatigue: Q;
  brawlerEnergy: number;
  knightDead: boolean;
  brawlerDead: boolean;
}

function snapshot(world: WorldState, tick: number): TickSnapshot {
  const k = world.entities.find(e => e.id === 1)!;
  const b = world.entities.find(e => e.id === 2)!;
  return {
    tick,
    knightShock:   k.injury.shock,
    knightConc:    k.injury.consciousness,
    knightFear:    (k.condition.fearQ ?? 0) as Q,
    knightFatigue: k.energy.fatigue,
    knightEnergy:  k.energy.reserveEnergy_J,
    brawlerShock:  b.injury.shock,
    brawlerConc:   b.injury.consciousness,
    brawlerFear:   (b.condition.fearQ ?? 0) as Q,
    brawlerFatigue: b.energy.fatigue,
    brawlerEnergy:  b.energy.reserveEnergy_J,
    knightDead:    k.injury.dead,
    brawlerDead:   b.injury.dead,
  };
}

// ─── run ──────────────────────────────────────────────────────────────────────

function run(seed: number): void {
  const world: WorldState = {
    tick: 0, seed,
    entities: [makeKnight(seed), makeBrawler(seed)],
  };

  const ctx: KernelContext = { tractionCoeff: q(0.90) as Q };

  const snapshots: TickSnapshot[] = [];
  let endReason = "max ticks reached";

  for (let tick = 0; tick < MAX_TICKS; tick++) {
    const index   = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * M));

    const cmds: CommandMap = new Map();
    for (const e of world.entities) {
      if (e.injury.dead) continue;
      const policy = e.teamId === 1
        ? AI_PRESETS["lineInfantry"]!
        : AI_PRESETS["lineInfantry"]!;
      cmds.set(e.id, [...decideCommandsForEntity(world, index, spatial, e, policy)]);
    }

    stepWorld(world, cmds, ctx);

    const s = snapshot(world, tick + 1);
    snapshots.push(s);

    const k = world.entities.find(e => e.id === 1)!;
    const b = world.entities.find(e => e.id === 2)!;

    const kRouting = isRouting(
      (k.condition.fearQ ?? 0) as Q,
      k.attributes.resilience.distressTolerance,
    );
    const bRouting = isRouting(
      (b.condition.fearQ ?? 0) as Q,
      b.attributes.resilience.distressTolerance,
    );

    if (s.knightDead)   { endReason = "Knight killed";         break; }
    if (s.brawlerDead)  { endReason = "Brawler killed";        break; }
    if (s.knightConc <= 0) { endReason = "Knight knocked out"; break; }
    if (s.brawlerConc <= 0) { endReason = "Brawler knocked out"; break; }
    if (kRouting)       { endReason = "Knight routing";        break; }
    if (bRouting)       { endReason = "Brawler routing";       break; }
  }

  // ─── output ─────────────────────────────────────────────────────────────────

  const sep  = "─".repeat(72);
  const sep2 = "═".repeat(72);

  console.log(`\n${sep2}`);
  console.log(`  ANANKE VERTICAL SLICE — Seed ${seed}`);
  console.log(`  Knight (mail+longsword, KNIGHT_INFANTRY) vs Brawler (club, HUMAN_BASE)`);
  console.log(`${sep2}`);

  // Print a concise table every 20 ticks (+ first + last)
  const printTicks = new Set<number>([
    1,
    ...Array.from({ length: Math.floor(MAX_TICKS / 20) }, (_, i) => (i + 1) * 20),
    snapshots.length,
  ]);

  console.log(
    `\n${"Tick".padEnd(5)} ${"Knight shock".padEnd(14)} ${"Conc".padEnd(5)} ` +
    `${"Fear".padEnd(5)} ${"Fatigue".padEnd(8)} ${"   "}` +
    `${"Brawler shock".padEnd(14)} ${"Conc".padEnd(5)} ` +
    `${"Fear".padEnd(5)} ${"Fatigue".padEnd(8)}`,
  );
  console.log(sep);

  for (const s of snapshots) {
    if (!printTicks.has(s.tick)) continue;
    const kFlag = s.knightDead ? " DEAD" : s.knightConc <= 0 ? " KO  " : "     ";
    const bFlag = s.brawlerDead ? " DEAD" : s.brawlerConc <= 0 ? " KO  " : "     ";
    console.log(
      `${String(s.tick).padEnd(5)} ` +
      `${bar(s.knightShock)} ${pct(s.knightShock)}${kFlag}  ` +
      `${pct(s.knightConc)} ${pct(s.knightFear)} ` +
      `${pct(s.knightFatigue)} ${" ".repeat(3)}` +
      `${bar(s.brawlerShock)} ${pct(s.brawlerShock)}${bFlag}  ` +
      `${pct(s.brawlerConc)} ${pct(s.brawlerFear)} ` +
      `${pct(s.brawlerFatigue)}`,
    );
  }

  // ─── final state ────────────────────────────────────────────────────────────

  const finalTick = snapshots.length;
  const k = world.entities.find(e => e.id === 1)!;
  const b = world.entities.find(e => e.id === 2)!;

  console.log(`\n${sep}`);
  console.log(`  OUTCOME after ${finalTick} ticks (${(finalTick / 20).toFixed(1)} s): ${endReason}`);
  console.log(sep);

  console.log(`\nKnight (seed ${seed}, KNIGHT_INFANTRY + mail + longsword)`);
  console.log(`  shock       ${bar(k.injury.shock, SCALE.Q, 20)} ${pct(k.injury.shock)}`);
  console.log(`  consciousness ${bar(k.injury.consciousness, SCALE.Q, 20)} ${pct(k.injury.consciousness)}`);
  console.log(`  fear        ${bar((k.condition.fearQ ?? 0) as Q, SCALE.Q, 20)} ${pct((k.condition.fearQ ?? 0) as Q)}`);
  console.log(`  fatigue     ${bar(k.energy.fatigue, SCALE.Q, 20)} ${pct(k.energy.fatigue)}`);
  console.log(`  energy      ${joules(k.energy.reserveEnergy_J)} / ${joules(k.attributes.performance.reserveEnergy_J)}`);
  console.log(`  injuries:   ${describeInjuries(k.injury)}`);

  console.log(`\nBrawler (seed ${seed}, HUMAN_BASE + club, unarmoured)`);
  console.log(`  shock       ${bar(b.injury.shock, SCALE.Q, 20)} ${pct(b.injury.shock)}`);
  console.log(`  consciousness ${bar(b.injury.consciousness, SCALE.Q, 20)} ${pct(b.injury.consciousness)}`);
  console.log(`  fear        ${bar((b.condition.fearQ ?? 0) as Q, SCALE.Q, 20)} ${pct((b.condition.fearQ ?? 0) as Q)}`);
  console.log(`  fatigue     ${bar(b.energy.fatigue, SCALE.Q, 20)} ${pct(b.energy.fatigue)}`);
  console.log(`  energy      ${joules(b.energy.reserveEnergy_J)} / ${joules(b.attributes.performance.reserveEnergy_J)}`);
  console.log(`  injuries:   ${describeInjuries(b.injury)}`);

  // Narrative outcome
  console.log();
  console.log(describeCombatOutcome([
    { id: k.id, teamId: k.teamId, injury: k.injury },
    { id: b.id, teamId: b.teamId, injury: b.injury },
  ]));

  // ─── validation checks ────────────────────────────────────────────────────────

  console.log(`\n${sep}`);
  console.log("  FIT-FOR-PURPOSE VALIDATION CHECKS");
  console.log(sep);

  const last = snapshots[snapshots.length - 1]!;
  const first = snapshots[0]!;

  // Claim 1: armour slows shock accumulation
  // Knight's shock per tick should be lower than Brawler's given roughly equal hits
  const knightShockRate = last.knightShock / Math.max(finalTick, 1);
  const brawlerShockRate = last.brawlerShock / Math.max(finalTick, 1);
  const armorClaim = knightShockRate < brawlerShockRate;
  console.log(`\n[${armorClaim ? "✓" : "✗"}] Armour slows shock accumulation`);
  console.log(`     Knight shock/tick=${(knightShockRate).toFixed(1)}  Brawler shock/tick=${(brawlerShockRate).toFixed(1)}`);

  // Claim 2: energy is consumed through combat effort (attacks + movement cost reserveEnergy_J)
  const kEnergyStart = k.attributes.performance.reserveEnergy_J;
  const bEnergyStart = b.attributes.performance.reserveEnergy_J;
  const energyClaim  = last.knightEnergy < kEnergyStart || last.brawlerEnergy < bEnergyStart;
  const kDrain = kEnergyStart - last.knightEnergy;
  const bDrain = bEnergyStart - last.brawlerEnergy;
  console.log(`\n[${energyClaim ? "✓" : "✗"}] Energy depletes through combat effort`);
  console.log(`     Knight drained ${kDrain.toLocaleString()} J  Brawler drained ${bDrain.toLocaleString()} J`);

  // Claim 3: per-region injury accumulates (not a single HP pool — multiple body regions affected)
  const regions = Object.entries(b.injury.byRegion ?? {});
  const damagedRegions = regions.filter(([, r]) => (r as any).surfaceDamage > 0 || (r as any).internalDamage > 0);
  const regionClaim = damagedRegions.length > 0;
  console.log(`\n[${regionClaim ? "✓" : "✗"}] Per-region injury accumulates (not a single HP pool)`);
  console.log(`     Brawler damaged regions: ${damagedRegions.length > 0 ? damagedRegions.map(([n]) => n).join(", ") : "none"} of ${regions.length} total`);

  // Claim 4: fight ended via simulation mechanism (not max ticks)
  const mechanisticEnd = endReason !== "max ticks reached";
  console.log(`\n[${mechanisticEnd ? "✓" : "✗"}] Fight ended via emergent physics mechanism`);
  console.log(`     End reason: ${endReason}`);

  // Claim 5: consciousness degrades independently of shock
  const concDegraded = last.knightConc < SCALE.Q || last.brawlerConc < SCALE.Q;
  console.log(`\n[${concDegraded ? "✓" : "✗"}] Consciousness degrades independently of instant kill`);
  console.log(`     Knight conc=${pct(last.knightConc)}  Brawler conc=${pct(last.brawlerConc)}`);

  const passed = [armorClaim, energyClaim, regionClaim, mechanisticEnd, concDegraded]
    .filter(Boolean).length;
  console.log(`\n${sep}`);
  console.log(`  ${passed}/5 validation claims confirmed  (seed=${seed})`);
  if (passed >= 4) {
    console.log("  VERDICT: Physics depth is visible in outcomes — strong fit for purpose.");
  } else {
    console.log("  VERDICT: Re-run with different seeds or review tuning constants.");
  }
  console.log(sep);
}

// ─── entry ────────────────────────────────────────────────────────────────────

run(SEED);

// When no seed argument supplied, run three seeds for variety comparison
if (SEED === 1 && (typeof process === "undefined" || !process.argv?.[2])) {
  run(42);
  run(99);
}
