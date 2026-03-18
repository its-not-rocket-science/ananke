// tools/narrative-stress-cinema.ts — Cinematic narrative stress test runner
//
// Runs all twelve cinematic scenarios and prints a formatted report.
// Used to generate the reference table in docs/narrative-stress-test.md.
//
// Run:  npm run build && node dist/tools/narrative-stress-cinema.js [seeds]
// Default: 100 seeds per scenario

import { q, SCALE } from "../src/units.js";
import { mkKnight } from "../src/presets.js";
import { mkWorld } from "../src/sim/testing.js";
import { buildWorldIndex } from "../src/sim/indexing.js";
import { buildSpatialIndex } from "../src/sim/spatial.js";
import { buildAICommands } from "../src/sim/ai/system.js";
import { AI_PRESETS } from "../src/sim/ai/presets.js";
import type { WorldState } from "../src/sim/world.js";
import type { Entity } from "../src/sim/entity.js";
import {
  runNarrativeStressTest,
  formatStressTestReport,
  beatEntityDefeated,
  beatEntitySurvives,
  beatTeamDefeated,
  beatEntityShockExceeds,
  DEFEATED_CONSCIOUSNESS,
  type NarrativeScenario,
} from "../src/narrative-stress.js";

// ─── CLI args ─────────────────────────────────────────────────────────────────

declare const process: { argv?: string[] } | undefined;
const N_SEEDS = parseInt(
  (typeof process !== "undefined" ? process.argv?.[2] : undefined) ?? "100",
  10,
);
const seeds = Array.from({ length: N_SEEDS }, (_, i) => i + 1);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const M = SCALE.m;
const lineInfantry = AI_PRESETS["lineInfantry"]!;

function aiCommands(world: WorldState) {
  const index   = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, Math.round(4 * M));
  return buildAICommands(world, index, spatial, () => lineInfantry);
}

function stripArmour(entity: Entity): Entity {
  entity.loadout.items = entity.loadout.items.filter(i => i.kind !== "armour");
  return entity;
}

function beatAnyOfTeamDefeated(teamId: number): (world: WorldState) => boolean {
  return (world) =>
    world.entities
      .filter(e => e.teamId === teamId)
      .some(e => e.injury.dead || e.injury.consciousness <= DEFEATED_CONSCIOUSNESS);
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

const SCENARIOS: NarrativeScenario[] = [

  // 1. Boromir's Last Stand — LOTR
  {
    name: "Boromir's Last Stand — LOTR",
    setup() {
      const boromir = stripArmour(mkKnight(1, 1,              0,              0));
      const uruk1   = mkKnight(2, 2,  Math.round(1.5 * M),       0);
      const uruk2   = mkKnight(3, 2, -Math.round(1.5 * M),       0);
      const uruk3   = mkKnight(4, 2,              0, Math.round(1.5 * M));
      return mkWorld(1, [boromir, uruk1, uruk2, uruk3]);
    },
    commands: aiCommands,
    beats: [
      { tickWindow: [1, 1800], predicate: beatEntityShockExceeds(1, q(0.25)), description: "Boromir takes serious shock" },
      { tickWindow: [1, 1800], predicate: beatAnyOfTeamDefeated(2), description: "Boromir fells at least one Uruk" },
      { tickWindow: [1, 1800], predicate: beatEntityDefeated(1), description: "Boromir falls" },
    ],
    maxTicks: 1800,
  },

  // 2. Rob Roy vs Cunningham
  {
    name: "Rob Roy vs Cunningham — Rob Roy (1995)",
    setup() {
      const robRoy     = stripArmour(mkKnight(1, 1,             0, 0));
      const cunningham = stripArmour(mkKnight(2, 2, Math.round(1.5 * M), 0));
      robRoy.energy.fatigue     = q(0.20);
      cunningham.energy.fatigue = q(0.05);
      return mkWorld(1, [robRoy, cunningham]);
    },
    commands: aiCommands,
    beats: [
      { tickWindow: [1, 600], predicate: beatEntityShockExceeds(1, q(0.40)), description: "Rob Roy absorbs near-fatal wound (shock > 40 %)" },
      { tickWindow: [1, 600], predicate: beatEntityDefeated(2), description: "Cunningham is defeated" },
      { tickWindow: [1, 600], predicate: beatEntitySurvives(1), description: "Rob Roy survives" },
    ],
    maxTicks: 600,
  },

  // 3. The Good, the Bad and the Ugly — Final Standoff
  {
    name: "The Good, the Bad and the Ugly — Final Standoff",
    setup() {
      const blondie   = stripArmour(mkKnight(1, 1,              0,             0));
      const angelEyes = stripArmour(mkKnight(2, 2,  Math.round(1.5 * M),      0));
      const tuco      = stripArmour(mkKnight(3, 3, -Math.round(1.5 * M),      0));
      tuco.energy.fatigue = q(0.85);
      return mkWorld(1, [blondie, angelEyes, tuco]);
    },
    commands: aiCommands,
    beats: [
      { tickWindow: [1, 300], predicate: beatEntityDefeated(2), description: "Angel Eyes is shot" },
      { tickWindow: [1, 300], predicate: beatEntityDefeated(3), description: "Tuco is disarmed / defeated" },
      { tickWindow: [1, 300], predicate: beatEntitySurvives(1), description: "Blondie walks away" },
    ],
    maxTicks: 300,
  },

  // 4. Macbeth's Final Stand — Polanski (1971)
  {
    name: "Macbeth's Final Stand — Polanski (1971)",
    setup() {
      const macbeth  = mkKnight(1, 1,               0,              0);
      const macduff  = mkKnight(2, 2,  Math.round(1.5 * M),        0);
      const soldierA = mkKnight(3, 2, -Math.round(1.5 * M),        0);
      const soldierB = mkKnight(4, 2,              0, Math.round(1.5 * M));
      macbeth.energy.fatigue   = q(0.40);
      soldierA.energy.fatigue  = q(0.10);
      soldierB.energy.fatigue  = q(0.10);
      return mkWorld(1, [macbeth, macduff, soldierA, soldierB]);
    },
    commands: aiCommands,
    beats: [
      { tickWindow: [1, 1200], predicate: beatAnyOfTeamDefeated(2), description: "Macbeth fells at least one before the end" },
      { tickWindow: [1, 1200], predicate: beatEntityDefeated(1), description: "Macbeth is slain" },
    ],
    maxTicks: 1200,
  },

  // 5. Butch Cassidy and the Sundance Kid — Bolivian Finale
  {
    name: "Butch Cassidy & Sundance Kid — Bolivian Finale",
    setup() {
      const butch    = stripArmour(mkKnight(1, 1,               0,               0));
      const sundance = stripArmour(mkKnight(2, 1,  Math.round(1.0 * M),          0));
      const cav1     = stripArmour(mkKnight(3, 2, -Math.round(1.5 * M),          0));
      const cav2     = stripArmour(mkKnight(4, 2,  Math.round(2.5 * M),          0));
      const cav3     = stripArmour(mkKnight(5, 2,               0,  Math.round(1.5 * M)));
      const cav4     = stripArmour(mkKnight(6, 2,               0, -Math.round(1.5 * M)));
      butch.energy.fatigue    = q(0.35);
      sundance.energy.fatigue = q(0.35);
      return mkWorld(1, [butch, sundance, cav1, cav2, cav3, cav4]);
    },
    commands: aiCommands,
    beats: [
      { tickWindow: [1, 600], predicate: beatEntityDefeated(1), description: "Butch falls" },
      { tickWindow: [1, 600], predicate: beatEntityDefeated(2), description: "Sundance falls" },
    ],
    maxTicks: 600,
  },

  // 6. Sanjuro's Final Duel — Yojimbo (1961)
  {
    name: "Sanjuro's Final Duel — Yojimbo (1961)",
    setup() {
      const sanjuro   = stripArmour(mkKnight(1, 1,              0,             0));
      const uyesaka   = stripArmour(mkKnight(2, 2, Math.round(1.5 * M),       0));
      const bodyguard = stripArmour(mkKnight(3, 2, Math.round(2.5 * M),       0));
      sanjuro.energy.fatigue   = q(0.50);
      uyesaka.energy.fatigue   = q(0.05);
      bodyguard.energy.fatigue = q(0.05);
      return mkWorld(1, [sanjuro, uyesaka, bodyguard]);
    },
    commands: aiCommands,
    beats: [
      { tickWindow: [1, 900], predicate: beatTeamDefeated(2), description: "Sanjuro defeats both opponents" },
      { tickWindow: [1, 900], predicate: beatEntitySurvives(1), description: "Sanjuro walks away" },
    ],
    maxTicks: 900,
  },

  // 7. William vs Adhemar — A Knight's Tale (2001)
  {
    name: "William vs Adhemar — A Knight's Tale (2001)",
    setup() {
      const william = mkKnight(1, 1,             0, 0);
      const adhemar = mkKnight(2, 2, Math.round(1.5 * M), 0);
      william.energy.fatigue = q(0.15);
      adhemar.energy.fatigue = q(0.05);
      return mkWorld(1, [william, adhemar]);
    },
    commands: aiCommands,
    beats: [
      { tickWindow: [1, 600], predicate: beatEntityDefeated(2), description: "Adhemar is unhorsed / defeated" },
      { tickWindow: [1, 600], predicate: beatEntitySurvives(1), description: "William wins" },
    ],
    maxTicks: 600,
  },

  // 8. Darth Maul vs Obi-Wan & Qui-Gon — The Phantom Menace (1999)
  {
    name: "Darth Maul vs Obi-Wan & Qui-Gon — The Phantom Menace",
    setup() {
      const maul   = stripArmour(mkKnight(1, 1,              0,              0));
      const quiGon = stripArmour(mkKnight(2, 2,  Math.round(1.5 * M),       0));
      const obiWan = stripArmour(mkKnight(3, 2, -Math.round(1.5 * M),       0));
      quiGon.energy.fatigue = q(0.10);
      obiWan.energy.fatigue = q(0.10);
      return mkWorld(1, [maul, quiGon, obiWan]);
    },
    commands: aiCommands,
    beats: [
      { tickWindow: [1, 1200], predicate: beatEntityDefeated(2), description: "Qui-Gon is defeated" },
      { tickWindow: [1, 1200], predicate: beatEntityDefeated(1), description: "Maul is defeated" },
      { tickWindow: [1, 1200], predicate: beatEntitySurvives(3), description: "Obi-Wan survives" },
    ],
    maxTicks: 1200,
  },

  // 9. Inigo Montoya vs Count Rugen — The Princess Bride (1987)
  {
    name: "Inigo Montoya vs Count Rugen — The Princess Bride",
    setup() {
      const inigo = stripArmour(mkKnight(1, 1,              0, 0));
      const rugen = stripArmour(mkKnight(2, 2, Math.round(1.5 * M), 0));
      inigo.energy.fatigue = q(0.65);
      rugen.energy.fatigue = q(0.10);
      return mkWorld(1, [inigo, rugen]);
    },
    commands: aiCommands,
    beats: [
      { tickWindow: [1, 600], predicate: beatEntityDefeated(2), description: "Rugen is slain" },
      { tickWindow: [1, 600], predicate: beatEntitySurvives(1), description: "Inigo survives his wounds" },
    ],
    maxTicks: 600,
  },

  // 10. Achilles vs Hector — The Iliad
  {
    name: "Achilles vs Hector — The Iliad",
    setup() {
      const achilles = stripArmour(mkKnight(1, 1,              0, 0));
      const hector   = stripArmour(mkKnight(2, 2, Math.round(1.5 * M), 0));
      hector.energy.fatigue   = q(0.45);
      achilles.energy.fatigue = q(0.0);
      return mkWorld(1, [achilles, hector]);
    },
    commands: aiCommands,
    beats: [
      { tickWindow: [1, 600], predicate: beatEntityDefeated(2), description: "Hector falls" },
      { tickWindow: [1, 600], predicate: beatEntitySurvives(1), description: "Achilles survives" },
    ],
    maxTicks: 600,
  },

  // 11. Maximus vs Commodus — Gladiator (2000)
  {
    name: "Maximus vs Commodus — Gladiator (2000)",
    setup() {
      const maximus  = stripArmour(mkKnight(1, 1,              0, 0));
      const commodus = stripArmour(mkKnight(2, 2, Math.round(1.5 * M), 0));
      maximus.energy.fatigue   = q(0.55);
      commodus.energy.fatigue  = q(0.05);
      return mkWorld(1, [maximus, commodus]);
    },
    commands: aiCommands,
    beats: [
      { tickWindow: [1, 600], predicate: beatEntityShockExceeds(1, q(0.45)), description: "Maximus registers near-fatal shock (pre-stab wound)" },
      { tickWindow: [1, 600], predicate: beatEntityDefeated(2), description: "Commodus is defeated" },
    ],
    maxTicks: 600,
  },

  // 12. Leonidas' Last Stand — 300 (2006)
  {
    name: "Leonidas' Last Stand — 300 (2006)",
    setup() {
      const leonidas = stripArmour(mkKnight(1, 1,               0,              0));
      const spartan  = stripArmour(mkKnight(2, 1,  Math.round(1.0 * M),        0));
      const persian1 = stripArmour(mkKnight(3, 2, -Math.round(1.5 * M),        0));
      const persian2 = stripArmour(mkKnight(4, 2,  Math.round(2.5 * M),        0));
      const persian3 = stripArmour(mkKnight(5, 2,               0, Math.round(1.5 * M)));
      const persian4 = stripArmour(mkKnight(6, 2, -Math.round(1.0 * M), Math.round(1.5 * M)));
      const persian5 = stripArmour(mkKnight(7, 2,  Math.round(1.5 * M), -Math.round(1.0 * M)));
      leonidas.energy.fatigue = q(0.45);
      spartan.energy.fatigue  = q(0.45);
      return mkWorld(1, [leonidas, spartan, persian1, persian2, persian3, persian4, persian5]);
    },
    commands: aiCommands,
    beats: [
      { tickWindow: [1, 1200], predicate: beatEntityShockExceeds(1, q(0.50)), description: "Leonidas takes serious wounds" },
      { tickWindow: [1, 1200], predicate: beatAnyOfTeamDefeated(2), description: "Spartans take at least one Persian with them" },
      { tickWindow: [1, 1200], predicate: beatTeamDefeated(1), description: "The Spartan last stand ends — both fall" },
    ],
    maxTicks: 1200,
  },
];

// ─── Run & print ──────────────────────────────────────────────────────────────

console.log(`\nNarrative Stress Test — Cinematic Scenarios (${N_SEEDS} seeds each)\n`);
console.log("=".repeat(54));

for (const scenario of SCENARIOS) {
  const result = runNarrativeStressTest(scenario, seeds);
  console.log("\n" + formatStressTestReport(result));
}
