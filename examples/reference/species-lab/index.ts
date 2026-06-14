// examples/reference/species-lab/index.ts
// Reference build PM-1: Species / Xenobiology Lab
//
// Generates individuals from six species, profiles their attributes and senses,
// benchmarks competence across cognitive domains, demonstrates character
// progression (XP + training), validates a custom content pack, and runs a
// round-robin combat tournament to show physics-grounded outcome distributions.
//
// Usage:
//   npm run build && node dist/examples/reference/species-lab/index.js [--quick]
//   node dist/examples/reference/species-lab/index.js --quick   (10 seeds, faster)
//
// Systems demonstrated:
//   species          generateSpeciesIndividual, SpeciesDefinition
//   extended-senses  dominantSense, thermalSignature, sensory predicates
//   competence       resolveCompetence (naturalist, spatial, bodilyKinesthetic, interSpecies)
//   character        awardXP, applyTrainingSession, createProgressionState
//   content-pack     validatePack, loadPack
//   combat           stepWorld, AI, injury model

import { q, SCALE, to, type Q }          from "../../../src/units.js";
import {
  ELF_SPECIES, DWARF_SPECIES, ORC_SPECIES,
  GOBLIN_SPECIES, TROLL_SPECIES, HALFLING_SPECIES,
  generateSpeciesIndividual,
  type SpeciesDefinition,
}                                         from "../../../src/species.js";
import { defaultIntent }                  from "../../../src/sim/intent.js";
import { defaultAction }                  from "../../../src/sim/action.js";
import { defaultCondition }               from "../../../src/sim/condition.js";
import { defaultInjury }                  from "../../../src/sim/injury.js";
import { v3 }                             from "../../../src/sim/vec3.js";
import { stepWorld }                      from "../../../src/sim/kernel.js";
import { buildWorldIndex }                from "../../../src/sim/indexing.js";
import { buildSpatialIndex }              from "../../../src/sim/spatial.js";
import { decideCommandsForEntity }        from "../../../src/sim/ai/decide.js";
import { AI_PRESETS }                     from "../../../src/sim/ai/presets.js";
import { STARTER_WEAPONS }                from "../../../src/equipment.js";
import type { Entity }                    from "../../../src/sim/entity.js";
import type { KernelContext }             from "../../../src/sim/context.js";
import type { WorldState }                from "../../../src/sim/world.js";
import type { CommandMap }                from "../../../src/sim/commands.js";
import {
  dominantSense, thermalSignature,
  hasEcholocation, hasElectroreception, hasThermalVision, hasOlfaction,
}                                         from "../../../src/extended-senses.js";
import { resolveCompetence }              from "../../../src/competence/framework.js";
import type { CompetenceAction }          from "../../../src/competence/framework.js";
import {
  createProgressionState, awardXP, applyTrainingSession,
  type TrainingPlan, type TrainingSession,
}                                         from "../../../src/progression.js";
import {
  validatePack, loadPack, clearPackRegistry,
  type AnankePackManifest,
}                                         from "../../../src/content-pack.js";

// ── CLI args ──────────────────────────────────────────────────────────────────

const QUICK     = process.argv.includes("--quick");
const N_SEEDS   = QUICK ? 10 : 100;
const MAX_TICKS = 400;
const M         = SCALE.m;
const CTX: KernelContext = { tractionCoeff: q(0.90) as Q };

// Species under study
const SPECIES_POOL: SpeciesDefinition[] = [
  ELF_SPECIES,
  DWARF_SPECIES,
  ORC_SPECIES,
  GOBLIN_SPECIES,
  TROLL_SPECIES,
  HALFLING_SPECIES,
];

const WEAPON_ID = "wpn_longsword";

// ── Helpers ───────────────────────────────────────────────────────────────────

const pct  = (v: number) => ((v / SCALE.Q) * 100).toFixed(0).padStart(4) + "%";
const pad  = (s: string, n: number) => s.padEnd(n);
const sep  = (n = 90) => "─".repeat(n);

// ── Entity factory ────────────────────────────────────────────────────────────

function makeSpeciesEntity(
  id: number, teamId: number, seed: number,
  species: SpeciesDefinition,
): Entity {
  const spec   = generateSpeciesIndividual(species, seed);
  const sword  = STARTER_WEAPONS.find(w => w.id === WEAPON_ID)!;
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

// ── Section 1: Attribute profiles ─────────────────────────────────────────────

console.log(`\nAnanke — Species Lab  (${N_SEEDS} seeds per matchup${QUICK ? ", quick" : ""})\n`);
console.log("Systems: species · extended-senses · competence · character · content-pack · combat\n");

console.log("1. Species Attribute Profiles");
console.log(sep(110));
console.log(
  pad("Species", 12) + pad("Stature", 9) + pad("Mass", 8) +
  pad("Force", 9) + pad("Fatigue", 9) + pad("Dominant Sense", 18) +
  pad("Special Senses", 22) + pad("Thermal", 9),
);
console.log(sep(110));

for (const species of SPECIES_POOL) {
  const spec  = generateSpeciesIndividual(species, 1);
  const attrs = spec.attributes;
  const entity = makeSpeciesEntity(1, 1, 1, species);

  const stature  = (attrs.morphology.stature_m  / SCALE.m).toFixed(2) + "m";
  const mass     = (attrs.morphology.mass_kg     / SCALE.kg).toFixed(0) + "kg";
  const force    = (attrs.performance.peakForce_N / SCALE.kg).toFixed(0) + "kN";
  const fatigue  = pct(attrs.resilience.fatigueRate);
  const sense    = dominantSense(entity);
  const specials = [
    hasEcholocation(entity)     ? "echo"  : "",
    hasElectroreception(entity) ? "elec"  : "",
    hasThermalVision(entity)    ? "therm" : "",
    hasOlfaction(entity)        ? "olf"   : "",
  ].filter(Boolean).join("+") || "—";
  const thermal  = pct(thermalSignature(entity));

  console.log(
    pad(species.name, 12) + pad(stature, 9) + pad(mass, 8) +
    pad(force, 9) + pad(fatigue, 9) + pad(sense, 18) +
    pad(specials, 22) + pad(thermal, 9),
  );
}
console.log(sep(110));

// ── Section 2: Competence profiles ───────────────────────────────────────────

console.log("\n2. Competence Profiles  (resolveCompetence, 300s task, seed 42)");
console.log(sep(100));

const COMPETENCE_TASKS: Array<{ taskId: string; domain: CompetenceAction["domain"]; label: string }> = [
  { taskId: "forage_herbs",       domain: "naturalist",         label: "Forage herbs" },
  { taskId: "navigate_wilderness", domain: "spatial",           label: "Navigate wilds" },
  { taskId: "craft_sword_basic",  domain: "bodilyKinesthetic",  label: "Craft sword" },
  { taskId: "signal_alien_species", domain: "interSpecies",     label: "Signal alien" },
];

console.log(
  pad("Species", 12) +
  COMPETENCE_TASKS.map(t => pad(t.label, 20)).join(""),
);
console.log(sep(100));

for (const species of SPECIES_POOL) {
  const entity   = makeSpeciesEntity(1, 1, 42, species);
  const minWorld: WorldState = { tick: 0, seed: 42, entities: [entity] };

  const results = COMPETENCE_TASKS.map(t => {
    const action: CompetenceAction = {
      domain:          t.domain,
      taskId:          t.taskId,
      timeAvailable_s: 300,
      seed:            42,
      narrative:       false,
    };
    const out = resolveCompetence(entity, action, minWorld);
    return `${pct(out.quality_Q)} ${out.descriptor.slice(0, 4).padEnd(4)}`;
  });

  console.log(pad(species.name, 12) + results.map(r => pad(r, 20)).join(""));
}
console.log(sep(100));
console.log("  quality% = outcome quality Q; descriptor = exceptional/good/adequate/poor/fail");

// ── Section 3: Character progression ─────────────────────────────────────────

console.log("\n3. Character Progression  (awardXP + applyTrainingSession)");
console.log(sep(90));

// 3a — XP progression: 25 encounters @ 2 XP each → hits milestone 0 @20 XP, milestone 1 @36 XP
console.log("  XP progression — meleeCombat — 25 encounters @ 2 XP each:");
for (const species of [ELF_SPECIES, ORC_SPECIES, DWARF_SPECIES]) {
  const state = createProgressionState();
  const allMilestones: number[] = [];
  const hitAt: number[] = [];
  for (let encounter = 1; encounter <= 25; encounter++) {
    const triggered = awardXP(state, "meleeCombat", 2, encounter);
    if (triggered.length > 0) hitAt.push(encounter);
    allMilestones.push(...triggered.map(m => m.milestone));
  }
  const totalXP = state.xp.entries.get("meleeCombat") ?? 0;
  const ms = allMilestones.length > 0
    ? `milestones=[${allMilestones.join(",")}] hit at encounters ${hitAt.join(",")}`
    : "no milestones";
  console.log(`    ${species.name.padEnd(10)} XP=${totalXP}  ${ms}`);
}

// 3b — Strength training: 30 days, 3x/week, moderate intensity
console.log("  Strength training — 30 days, 3×/week, moderate intensity:");
const PLAN: TrainingPlan = {
  sessions:    [{ attribute: "peakForce_N", intensity_Q: q(0.65) as Q, duration_s: 3600 }],
  frequency_d: 3 / 7,
  ceiling:     to.N(3500),
};
const SESSION: TrainingSession = { attribute: "peakForce_N", intensity_Q: q(0.65) as Q, duration_s: 3600 };

for (const species of [ELF_SPECIES, DWARF_SPECIES, ORC_SPECIES]) {
  const spec = generateSpeciesIndividual(species, 1);
  let force   = spec.attributes.performance.peakForce_N;
  const start = force;
  const sessionsPerWeek = 3;
  // Simulate 4 weeks (28 days) of training
  for (let week = 0; week < 4; week++) {
    for (let s = 0; s < sessionsPerWeek; s++) {
      force = applyTrainingSession(force, PLAN, SESSION, s + 1);
    }
  }
  const startKN = (start / SCALE.kg).toFixed(0);
  const endKN   = (force / SCALE.kg).toFixed(0);
  const gain    = force - start;
  const gainKN  = (gain / SCALE.kg).toFixed(0);
  console.log(`    ${species.name.padEnd(10)} force ${startKN}kN → ${endKN}kN  (+${gainKN}kN in 28 days)`);
}

// ── Section 4: Content pack ───────────────────────────────────────────────────

console.log("\n4. Content Pack  (validatePack + loadPack)");
console.log(sep(90));

clearPackRegistry();

const MY_PACK: AnankePackManifest = {
  name:        "xenobiology-alpha",
  version:     "0.1.0",
  description: "Custom xenobiology species scenarios",
  registry: {
    compatRange: ">=0.5.0",
    license:     "MIT",
  },
  scenarios: [
    {
      id:       "troll-vs-goblin-horde",
      seed:     42,
      maxTicks: 300,
      entities: [
        { id: 1, teamId: 1, archetype: "TROLL_BRUTE",    weapon: "wpn_greatclub" },
        { id: 2, teamId: 2, archetype: "GOBLIN_FIGHTER", weapon: "wpn_dagger" },
        { id: 3, teamId: 2, archetype: "GOBLIN_FIGHTER", weapon: "wpn_dagger" },
        { id: 4, teamId: 2, archetype: "GOBLIN_FIGHTER", weapon: "wpn_dagger" },
      ],
    },
  ],
};

const errors = validatePack(MY_PACK);
console.log(`  Pack: "${MY_PACK.name}@${MY_PACK.version}"`);
if (errors.length === 0) {
  const result = loadPack(MY_PACK);
  console.log(`  ✓  validatePack: 0 errors`);
  console.log(`  ✓  loadPack: id="${result.packId}"  scenarios=${result.scenarioIds.length}  errors=${result.errors.length}`);
} else {
  console.log(`  ✗  validatePack errors: ${errors.map(e => e.message).join("; ")}`);
}

const INVALID_PACK = { name: "bad", version: "not-semver" } as unknown as AnankePackManifest;
const invalidErrors = validatePack(INVALID_PACK);
console.log(`  ✓  Invalid pack detected: ${invalidErrors.length} error(s) — "${invalidErrors[0]?.message ?? ""}"`);

// ── Section 5: Combat tournament ──────────────────────────────────────────────

console.log(`\n5. Combat Tournament  (${N_SEEDS} seeds per matchup, longsword or natural weapons)`);
console.log(sep(90));
console.log(`${pad("Matchup", 28)} ${pad("A wins", 8)} ${pad("B wins", 8)} ${pad("Draws", 6)} Physics insight`);
console.log(sep(90));

const perfStart = performance.now();

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

for (let i = 0; i < SPECIES_POOL.length; i++) {
  for (let j = i + 1; j < SPECIES_POOL.length; j++) {
    const specA = SPECIES_POOL[i]!;
    const specB = SPECIES_POOL[j]!;
    let aWins = 0, bWins = 0, draws = 0;

    for (let seed = 1; seed <= N_SEEDS; seed++) {
      const r = runTrial(specA, specB, seed);
      if (r === "A") aWins++;
      else if (r === "B") bWins++;
      else draws++;
    }

    const specAA = generateSpeciesIndividual(specA, 1).attributes;
    const specBA = generateSpeciesIndividual(specB, 1).attributes;
    const massA  = specAA.morphology.mass_kg;
    const massB  = specBA.morphology.mass_kg;
    const strA   = specAA.performance.peakForce_N;
    const strB   = specBA.performance.peakForce_N;
    const insight = massA > massB * 1.3  ? `${specA.name} mass advantage`
                  : massB > massA * 1.3  ? `${specB.name} mass advantage`
                  : strA  > strB  * 1.2  ? `${specA.name} strength advantage`
                  : strB  > strA  * 1.2  ? `${specB.name} strength advantage`
                  : "closely matched";

    console.log(
      `${pad(`${specA.name} vs ${specB.name}`, 28)}` +
      ` ${pad(((aWins / N_SEEDS) * 100).toFixed(0) + "%", 8)}` +
      ` ${pad(((bWins / N_SEEDS) * 100).toFixed(0) + "%", 8)}` +
      ` ${pad(((draws / N_SEEDS) * 100).toFixed(0) + "%", 6)} ${insight}`,
    );
  }
}

const perfMs     = performance.now() - perfStart;
const totalTrials = (SPECIES_POOL.length * (SPECIES_POOL.length - 1) / 2) * N_SEEDS;

console.log(sep(90));

// ── Performance + summary ─────────────────────────────────────────────────────

console.log(`\nPerformance:`);
console.log(`  Species: ${SPECIES_POOL.length}  Matchups: ${SPECIES_POOL.length * (SPECIES_POOL.length - 1) / 2}  Trials: ${totalTrials}`);
console.log(`  Tournament time: ${perfMs.toFixed(0)}ms  Avg/trial: ${(perfMs / totalTrials).toFixed(2)}ms  Max ticks/trial: ${MAX_TICKS}`);

console.log(`\nSystems used:`);
console.log(`  species          generateSpeciesIndividual (6 fantasy humanoids)`);
console.log(`  extended-senses  dominantSense, thermalSignature, echolocation/olfaction predicates`);
console.log(`  competence       resolveCompetence — naturalist/spatial/bodilyKinesthetic/interSpecies`);
console.log(`  character        awardXP + milestones, applyTrainingSession (28-day strength plan)`);
console.log(`  content-pack     validatePack, loadPack — custom xenobiology scenario pack`);
console.log(`  combat           stepWorld, AI (lineInfantry), injury model, 100-seed tournament\n`);
console.log(`  Physics insight: outcomes emerge from mass × velocity (KE) — no damage rolls.\n`);
