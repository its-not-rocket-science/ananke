// examples/reference/species-lab/index.ts
// Reference build PM-1: Species / Xenobiology Lab
//
// An interactive species comparison tool demonstrating Ananke's biology layer:
//   species · character · generate · competence · extended-senses
//
// Shows attribute profiles for every built-in species, then runs a round-robin
// combat tournament (100 seeds per matchup) to demonstrate how physical
// differences produce measurable outcome distributions.
//
// Usage:
//   npm run build && node dist/examples/reference/species-lab/index.js [--quick]
//   node dist/examples/reference/species-lab/index.js --quick   (10 seeds, faster)
//
// Architecture:
//   src/species.ts           SpeciesDefinition, generateSpeciesIndividual
//   src/generate.ts          generateIndividual (attribute generation)
//   src/extended-senses.ts   dominantSense, thermalSignature
//   src/extended-senses.ts   hasEcholocation, hasElectroreception, hasThermalVision
//   src/sim/kernel.ts        stepWorld (combat loop)
//   src/sim/ai/              decideCommandsForEntity

import { q, SCALE, type Q }            from "../../../src/units.js";
import {
  ELF_SPECIES, DWARF_SPECIES, ORC_SPECIES,
  GOBLIN_SPECIES, TROLL_SPECIES, HALFLING_SPECIES,
  generateSpeciesIndividual,
  type SpeciesDefinition,
}                                       from "../../../src/species.js";
import { defaultIntent }                from "../../../src/sim/intent.js";
import { defaultAction }                from "../../../src/sim/action.js";
import { defaultCondition }             from "../../../src/sim/condition.js";
import { defaultInjury }                from "../../../src/sim/injury.js";
import { v3 }                           from "../../../src/sim/vec3.js";
import { stepWorld }                    from "../../../src/sim/kernel.js";
import { buildWorldIndex }              from "../../../src/sim/indexing.js";
import { buildSpatialIndex }            from "../../../src/sim/spatial.js";
import { decideCommandsForEntity }      from "../../../src/sim/ai/decide.js";
import { AI_PRESETS }                   from "../../../src/sim/ai/presets.js";
import { STARTER_WEAPONS }              from "../../../src/equipment.js";
import type { Entity }                  from "../../../src/sim/entity.js";
import type { KernelContext }           from "../../../src/sim/context.js";
import type { WorldState }              from "../../../src/sim/world.js";
import type { CommandMap }              from "../../../src/sim/commands.js";
import {
  dominantSense, thermalSignature,
  hasEcholocation, hasElectroreception, hasThermalVision, hasOlfaction,
}                                       from "../../../src/extended-senses.js";

// ── CLI args ──────────────────────────────────────────────────────────────────

const QUICK      = process.argv.includes("--quick");
const N_SEEDS    = QUICK ? 10 : 100;
const MAX_TICKS  = 400;
const M          = SCALE.m;
const CTX: KernelContext = { tractionCoeff: q(0.90) as Q };

// Species under study — a representative cross-section
const SPECIES_POOL: SpeciesDefinition[] = [
  ELF_SPECIES,
  DWARF_SPECIES,
  ORC_SPECIES,
  GOBLIN_SPECIES,
  TROLL_SPECIES,
  HALFLING_SPECIES,
];

const WEAPON_ID = "wpn_longsword";

// ── Entity factory ────────────────────────────────────────────────────────────

function makeSpeciesEntity(id: number, teamId: number, seed: number,
                            species: SpeciesDefinition): Entity {
  const spec  = generateSpeciesIndividual(species, seed);
  const sword = STARTER_WEAPONS.find(w => w.id === WEAPON_ID)!;
  const weapons = spec.naturalWeapons.length > 0 ? spec.naturalWeapons : [sword];
  const entity: Entity = {
    id, teamId, attributes: spec.attributes,
    energy: { reserveEnergy_J: spec.attributes.performance.reserveEnergy_J, fatigue: q(0) },
    loadout: { items: weapons }, traits: spec.innateTraits,
    position_m:   v3(id === 1 ? 0 : Math.trunc(0.6 * M), 0, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(), action: defaultAction(),
    condition: defaultCondition(), injury: defaultInjury(),
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
  };
  if (spec.physiology) entity.physiology = spec.physiology;
  if (spec.bodyPlan)   entity.bodyPlan   = spec.bodyPlan;
  return entity;
}

// ── Combat trial ─────────────────────────────────────────────────────────────

function runTrial(specA: SpeciesDefinition, specB: SpeciesDefinition, seed: number): "A" | "B" | "draw" {
  const world: WorldState = {
    tick: 0, seed,
    entities: [
      makeSpeciesEntity(1, 1, seed,     specA),
      makeSpeciesEntity(2, 2, seed + 1, specB),
    ],
  };

  const alive = (e: Entity) => !e.injury.dead && e.injury.consciousness > 0;

  for (let t = 0; t < MAX_TICKS; t++) {
    const e1 = world.entities[0]!;
    const e2 = world.entities[1]!;
    if (!alive(e1) && !alive(e2)) return "draw";
    if (!alive(e1)) return "B";
    if (!alive(e2)) return "A";

    const idx     = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * M));
    const cmds: CommandMap = new Map();
    for (const e of world.entities) {
      if (!e.injury.dead) {
        cmds.set(e.id, decideCommandsForEntity(world, idx, spatial, e, AI_PRESETS.lineInfantry!));
      }
    }
    stepWorld(world, cmds, CTX);
  }

  const e1 = world.entities[0]!;
  const e2 = world.entities[1]!;
  if (e1.injury.shock < e2.injury.shock) return "A";
  if (e2.injury.shock < e1.injury.shock) return "B";
  return "draw";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const pct  = (v: number) => ((v / SCALE.Q) * 100).toFixed(0).padStart(4) + "%";
const pad  = (s: string, n: number) => s.padEnd(n);

// ── Attribute profiles ────────────────────────────────────────────────────────

console.log(`\nAnanke — Species Lab Reference Build  (${N_SEEDS} seeds per matchup${QUICK ? ", quick mode" : ""})\n`);
console.log("Demonstrates: species · generate · extended-senses · combat outcome distribution\n");

console.log("Species Attribute Profiles");
console.log("─".repeat(100));
console.log(
  `${pad("Species", 12)}` +
  `${pad("Mass(kg)", 10)}` +
  `${pad("Force(kN)", 10)}` +
  `${pad("Speed(m/s)", 12)}` +
  `${pad("Fatigue", 10)}` +
  `${pad("Dominant Sense", 18)}` +
  `${pad("Senses", 20)}`,
);
console.log("─".repeat(100));

for (const species of SPECIES_POOL) {
  const spec   = generateSpeciesIndividual(species, 1);
  const attrs  = spec.attributes;
  const entity = makeSpeciesEntity(1, 1, 1, species);
  const mass_kg   = (attrs.morphology.mass_kg / SCALE.kg).toFixed(0);
  const forceN    = (attrs.performance.peakForce_N / SCALE.kg).toFixed(0); // kN, proxy for strength
  const groundMode = attrs.locomotionModes?.find(m => m.mode === "ground");
  const speed     = groundMode ? (groundMode.maxSpeed_mps / SCALE.mps).toFixed(1) : "—";
  const fatigue   = pct(attrs.resilience.fatigueRate);
  const sense     = dominantSense(entity);
  const senses    = [
    hasEcholocation(entity)    ? "echo"  : "",
    hasElectroreception(entity)? "elec"  : "",
    hasThermalVision(entity)   ? "therm" : "",
    hasOlfaction(entity)       ? "olf"   : "",
  ].filter(Boolean).join("+") || "vision";
  const thermalSig = pct(thermalSignature(entity));

  console.log(
    `${pad(species.name, 12)}` +
    `${pad(mass_kg + "kg", 10)}` +
    `${pad(forceN + "kN", 10)}` +
    `${pad(speed === "—" ? "—" : speed + "m/s", 12)}` +
    `${pad(fatigue, 10)}` +
    `${pad(sense, 18)}` +
    `${pad(senses, 20)}` +
    `  thermal=${thermalSig}`,
  );
}
console.log("─".repeat(100));

// ── Tournament ────────────────────────────────────────────────────────────────

console.log(`\nCombat Tournament  (${N_SEEDS} seeds, longsword vs longsword or natural weapons)`);
console.log("─".repeat(70));
console.log(`${pad("Matchup", 26)} ${pad("A wins", 8)} ${pad("B wins", 8)} ${pad("Draws", 6)} Physics insight`);
console.log("─".repeat(70));

const perf_start = performance.now();

// Round-robin: each species vs each other
for (let i = 0; i < SPECIES_POOL.length; i++) {
  for (let j = i + 1; j < SPECIES_POOL.length; j++) {
    const specA = SPECIES_POOL[i]!;
    const specB = SPECIES_POOL[j]!;
    let aWins = 0, bWins = 0, draws = 0;

    for (let seed = 1; seed <= N_SEEDS; seed++) {
      const result = runTrial(specA, specB, seed);
      if (result === "A") aWins++;
      else if (result === "B") bWins++;
      else draws++;
    }

    const matchup   = `${specA.name} vs ${specB.name}`;
    const aWinPct   = ((aWins  / N_SEEDS) * 100).toFixed(0) + "%";
    const bWinPct   = ((bWins  / N_SEEDS) * 100).toFixed(0) + "%";
    const drawPct   = ((draws  / N_SEEDS) * 100).toFixed(0) + "%";

    // Physics insight: explain dominant factor
    const specASpec  = generateSpeciesIndividual(specA, 1).attributes;
    const specBSpec  = generateSpeciesIndividual(specB, 1).attributes;
    const massA = specASpec.morphology.mass_kg;
    const massB = specBSpec.morphology.mass_kg;
    const strA  = specASpec.performance.peakForce_N;
    const strB  = specBSpec.performance.peakForce_N;
    let insight = "";
    if (massA > massB * 1.3) insight = `${specA.name} mass advantage`;
    else if (massB > massA * 1.3) insight = `${specB.name} mass advantage`;
    else if (strA > strB * 1.2) insight = `${specA.name} strength advantage`;
    else if (strB > strA * 1.2) insight = `${specB.name} strength advantage`;
    else insight = "closely matched";

    console.log(
      `${pad(matchup, 26)} ${pad(aWinPct, 8)} ${pad(bWinPct, 8)} ${pad(drawPct, 6)} ${insight}`,
    );
  }
}

const perf_total_ms = performance.now() - perf_start;
const totalTrials   = (SPECIES_POOL.length * (SPECIES_POOL.length - 1) / 2) * N_SEEDS;

console.log("─".repeat(70));

// ── Performance envelope ──────────────────────────────────────────────────────

console.log(`\nPerformance:`);
console.log(`  Species:          ${SPECIES_POOL.length}`);
console.log(`  Matchups:         ${SPECIES_POOL.length * (SPECIES_POOL.length - 1) / 2}`);
console.log(`  Total trials:     ${totalTrials}`);
console.log(`  Total time:       ${perf_total_ms.toFixed(0)} ms`);
console.log(`  Avg per trial:    ${(perf_total_ms / totalTrials).toFixed(2)} ms`);
console.log(`  Max ticks/trial:  ${MAX_TICKS}`);

// ── Architecture note ─────────────────────────────────────────────────────────

console.log(`\nPackages used in this build:`);
console.log(`  @ananke/content    species definitions (ELF, DWARF, ORC, GOBLIN, TROLL, HALFLING)`);
console.log(`  @ananke/combat     combat, injury, equipment`);
console.log(`  extended-senses.ts dominantSense, thermalSignature, sensory predicates`);
console.log(`  @ananke/core       stepWorld, AI, fixed-point units\n`);
console.log(`  Note: species outcome distributions emerge purely from physics (`);
console.log(`  mass × velocity = kinetic energy; no "damage rolls" or "hit points").\n`);
