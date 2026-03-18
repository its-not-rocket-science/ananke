// tools/narrative-stress-test.ts — Phase 63: Narrative Stress Test CLI demo
//
// Runs three illustrative scenarios and prints a formatted report for each:
//
//   1. "Knight defeats Guard"      — high-plausibility baseline
//   2. "Lone Knight defeats Squad" — tests narrative push for outnumbered hero
//   3. "Hero survives ambush"      — combined survival + high-shock beat
//
// Run:  npm run build && node dist/tools/narrative-stress-test.js
// Seeds: SEEDS=<n>  node dist/tools/narrative-stress-test.js  (default: 50)

import { q } from "../src/units.js";
import { mkKnight } from "../src/presets.js";
import { mkWorld } from "../src/sim/testing.js";
import { buildWorldIndex } from "../src/sim/indexing.js";
import { buildSpatialIndex } from "../src/sim/spatial.js";
import { buildAICommands } from "../src/sim/ai/system.js";
import { AI_PRESETS } from "../src/sim/ai/presets.js";
import type { WorldState } from "../src/sim/world.js";
import {
  runNarrativeStressTest,
  formatStressTestReport,
  beatEntityDefeated,
  beatEntitySurvives,
  beatTeamDefeated,
  beatEntityShockExceeds,
  type NarrativeScenario,
} from "../src/narrative-stress.js";

// ─── CLI args ─────────────────────────────────────────────────────────────────

declare const process: { argv?: string[] } | undefined;
const N_SEEDS = parseInt(
  (typeof process !== "undefined" ? process.argv?.[2] : undefined) ?? "50",
  10,
);
const seeds = Array.from({ length: N_SEEDS }, (_, i) => i + 1);

// ─── Shared command provider ──────────────────────────────────────────────────

const lineInfantry = AI_PRESETS["lineInfantry"]!;
const policyFor = () => lineInfantry;

function aiCommands(world: WorldState) {
  const index   = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, 40000);  // 4 m cells
  return buildAICommands(world, index, spatial, policyFor);
}

// ─── Scenario 1: Knight defeats Guard ────────────────────────────────────────
// A fully armoured knight (id=1, team=1) fights a lightly armoured guard
// (id=2, team=2) at close range.  Expected: high success rate (plausible).

const SCENARIO_KNIGHT_VS_GUARD: NarrativeScenario = {
  name: "Knight defeats Guard",
  description:
    "Armoured knight vs. lightly equipped guard — baseline plausibility check.",
  setup() {
    const knight = mkKnight(1, 1, 0, 0);
    const guard  = mkKnight(2, 2, 15000, 0);   // 1.5 m apart
    return mkWorld(1, [knight, guard]);
  },
  commands: aiCommands,
  beats: [
    {
      tickWindow: [1, 600],
      predicate: beatEntityDefeated(2),
      description: "Guard is defeated within 30 s",
    },
    {
      tickWindow: [1, 600],
      predicate: beatEntitySurvives(1),
      description: "Knight survives",
    },
  ],
  maxTicks: 600,
};

// ─── Scenario 2: Lone Knight defeats a three-man squad ───────────────────────
// Knight (id=1, team=1) vs. three guards (ids 2-4, team=2).
// Expected: moderate-to-heavy narrative push — hard but not impossible.

const SCENARIO_OUTNUMBERED: NarrativeScenario = {
  name: "Lone Knight defeats Squad",
  description:
    "1 vs. 3 — measures how much authorial effort an outnumbered-hero beat costs.",
  setup() {
    const knight = mkKnight(1, 1,      0,      0);
    const guardA = mkKnight(2, 2,  15000,      0);  //  1.5 m right
    const guardB = mkKnight(3, 2, -15000,      0);  //  1.5 m left
    const guardC = mkKnight(4, 2,      0,  15000);  //  1.5 m forward
    return mkWorld(1, [knight, guardA, guardB, guardC]);
  },
  commands: aiCommands,
  beats: [
    {
      tickWindow: [1, 1200],
      predicate: beatTeamDefeated(2),
      description: "All three guards defeated within 60 s",
    },
    {
      tickWindow: [1, 1200],
      predicate: beatEntitySurvives(1),
      description: "Knight still standing",
    },
  ],
  maxTicks: 1200,
};

// ─── Scenario 3: Hero survives ambush (takes serious hit, lives) ──────────────
// Knight (id=1, team=1) must both absorb significant shock AND still be alive
// at the end.  Two beats that may be in tension with each other.

const SCENARIO_SURVIVES_AMBUSH: NarrativeScenario = {
  name: "Hero survives ambush",
  description:
    "Hero takes a serious hit (shock > 40 %) but defeats the ambusher and survives.",
  setup() {
    const hero     = mkKnight(1, 1,     0, 0);
    const ambusher = mkKnight(2, 2, 15000, 0);  // 1.5 m away
    return mkWorld(1, [hero, ambusher]);
  },
  commands: aiCommands,
  beats: [
    {
      tickWindow: [1, 600],
      predicate: beatEntityShockExceeds(1, q(0.40)),
      description: "Hero reaches shock > 40 % (feels the blow)",
    },
    {
      tickWindow: [1, 600],
      predicate: beatEntityDefeated(2),
      description: "Ambusher is defeated",
    },
    {
      tickWindow: [1, 600],
      predicate: beatEntitySurvives(1),
      description: "Hero survives",
    },
  ],
  maxTicks: 600,
};

// ─── Run & print ──────────────────────────────────────────────────────────────

const scenarios: NarrativeScenario[] = [
  SCENARIO_KNIGHT_VS_GUARD,
  SCENARIO_OUTNUMBERED,
  SCENARIO_SURVIVES_AMBUSH,
];

console.log(`\nNarrative Stress Test — ${N_SEEDS} seeds per scenario\n`);
console.log("=".repeat(54));

for (const scenario of scenarios) {
  const result = runNarrativeStressTest(scenario, seeds);
  console.log("\n" + formatStressTestReport(result));
}
