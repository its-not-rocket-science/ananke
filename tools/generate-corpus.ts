// tools/generate-corpus.ts
// PM-8: Generate scenario corpus entries
//
// Runs each hardcoded scenario definition, records the deterministic output hash,
// generates replay fixtures where required, and writes corpus/{id}/corpus.json.
//
// Usage:
//   npm run build && npm run generate-corpus

import * as fs   from "node:fs";
import * as path from "node:path";

import { q, SCALE }                  from "../src/units.js";
import { mkWorld, mkHumanoidEntity } from "../src/sim/testing.js";
import { stepWorld }                 from "../src/sim/kernel.js";
import { buildWorldIndex }           from "../src/sim/indexing.js";
import { buildSpatialIndex }         from "../src/sim/spatial.js";
import { buildAICommands }           from "../src/sim/ai/system.js";
import { AI_PRESETS }                from "../src/sim/ai/presets.js";
import { STARTER_WEAPONS, STARTER_ARMOUR } from "../src/equipment.js";
import { hashWorldState }            from "../src/netcode.js";
import { ReplayRecorder, serializeReplay } from "../src/replay.js";
import { serializeBridgeFrame }      from "../src/host-loop.js";
import { noMove }                    from "../src/sim/commands.js";
import type { KernelContext }        from "../src/sim/context.js";
import type { WorldState }           from "../src/sim/world.js";
import type { Entity }               from "../src/sim/entity.js";
import type { CommandMap }           from "../src/sim/commands.js";
import type { Q }                    from "../src/units.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CorpusTag =
  | "tutorial"
  | "benchmark"
  | "validation"
  | "networking"
  | "bridge"
  | "content-pack";

export interface CorpusEntitySpec {
  id:     number;
  teamId: number;
  /** Position in metres (real-world). */
  x_m:    number;
  weapon: string;
  armour?: string;
}

export interface CorpusScenario {
  seed:            number;
  tractionCoeff_Q: number;
  entities:        CorpusEntitySpec[];
  /** "lineInfantry" | "noMove" */
  aiPolicy:        "lineInfantry" | "noMove";
  tickCount:       number;
}

export interface CorpusPerformanceClass {
  entityCount:          number;
  /** Expected wall-clock budget for the full scenario in milliseconds. */
  expectedTickBudgetMs: number;
}

/** Manifest written to corpus/{id}/corpus.json. */
export interface CorpusManifest {
  version:          "corpus/v1";
  id:               string;
  title:            string;
  description:      string;
  tags:             CorpusTag[];
  stabilityStatus:  "stable" | "experimental";
  scenario:         CorpusScenario;
  /** FNV-64 hex hash of the final WorldState (after tickCount steps). */
  expectedOutputHash: string;
  performanceClass: CorpusPerformanceClass;
  /** Path relative to corpus/{id}/ directory, or null. */
  replayFixture:    string | null;
  /**
   * Bridge-frame invariants (only present for `bridge`-tagged entries).
   * Verified by verify-corpus in addition to the world-state hash.
   */
  bridgeExpected?:  {
    schema:      string;
    tick:        number;
    entityCount: number;
    scenarioId:  string;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROOT    = process.cwd();
const CORPUS  = path.join(ROOT, "corpus");
const M       = SCALE.m;

function hexHash(h: bigint): string {
  return "0x" + h.toString(16).padStart(16, "0");
}

function makeEntity(spec: CorpusEntitySpec): Entity {
  const sword  = STARTER_WEAPONS.find(w => w.id === spec.weapon)!;
  const armour = spec.armour ? STARTER_ARMOUR.find(a => a.id === spec.armour) : undefined;
  const entity = mkHumanoidEntity(spec.id, spec.teamId, Math.trunc(spec.x_m * M), 0);
  entity.loadout = { items: [sword, ...(armour ? [armour] : [])] };
  return entity;
}

function buildCtx(sc: CorpusScenario): KernelContext {
  return { tractionCoeff: sc.tractionCoeff_Q as Q };
}

function runScenario(
  sc: CorpusScenario,
  recorder?: ReplayRecorder,
): { world: WorldState; hashes: string[] } {
  const world = mkWorld(sc.seed, sc.entities.map(makeEntity));
  const ctx   = buildCtx(sc);
  const hashes: string[] = [];

  for (let t = 0; t < sc.tickCount; t++) {
    let cmds: CommandMap;
    if (sc.aiPolicy === "lineInfantry") {
      const idx     = buildWorldIndex(world);
      const spatial = buildSpatialIndex(world, Math.trunc(4 * M));
      cmds = buildAICommands(world, idx, spatial,
        (eId) => world.entities.find(e => e.id === eId && !e.injury.dead)
                 ? AI_PRESETS.lineInfantry : undefined);
    } else {
      cmds = new Map(sc.entities.map(e => [e.id, [noMove()]]));
    }
    if (recorder) recorder.record(world.tick, cmds);
    stepWorld(world, cmds, ctx);
    hashes.push(hexHash(hashWorldState(world)));
  }

  return { world, hashes };
}

// ── Scenario definitions ───────────────────────────────────────────────────────

interface ScenarioDef {
  id:              string;
  title:           string;
  description:     string;
  tags:            CorpusTag[];
  stabilityStatus: "stable" | "experimental";
  scenario:        CorpusScenario;
  performanceClass: CorpusPerformanceClass;
  withReplay:      boolean;
  bridgeScenarioId?: string;
}

const DEFS: ScenarioDef[] = [
  {
    id:    "basic-duel",
    title: "Basic 1v1 Duel (No AI)",
    description:
      "Two entities face off with longswords and no AI commands. " +
      "Entry-level tutorial: demonstrates combat resolution, injury accumulation, " +
      "and deterministic world-state hashing over 30 ticks.",
    tags:            ["tutorial"],
    stabilityStatus: "stable",
    scenario: {
      seed:            42,
      tractionCoeff_Q: 9000,
      entities: [
        { id: 1, teamId: 1, x_m: -0.5, weapon: "wpn_longsword" },
        { id: 2, teamId: 2, x_m:  0.5, weapon: "wpn_longsword" },
      ],
      aiPolicy:  "noMove",
      tickCount: 30,
    },
    performanceClass: { entityCount: 2, expectedTickBudgetMs: 100 },
    withReplay: false,
  },
  {
    id:    "armoured-combat",
    title: "Armoured 1v1 Combat (Line Infantry AI)",
    description:
      "Two entities equipped with chainmail armour and longswords, driven by " +
      "lineInfantry AI. Validation scenario: armour damage absorption, " +
      "shock accumulation, and equipment interaction over 50 ticks.",
    tags:            ["validation", "content-pack"],
    stabilityStatus: "stable",
    scenario: {
      seed:            42,
      tractionCoeff_Q: 9000,
      entities: [
        { id: 1, teamId: 1, x_m: -0.5, weapon: "wpn_longsword", armour: "arm_chainmail" },
        { id: 2, teamId: 2, x_m:  0.5, weapon: "wpn_longsword", armour: "arm_chainmail" },
      ],
      aiPolicy:  "lineInfantry",
      tickCount: 50,
    },
    performanceClass: { entityCount: 2, expectedTickBudgetMs: 200 },
    withReplay: false,
  },
  {
    id:    "lockstep-replay",
    title: "Lockstep Replay Parity (10 Ticks)",
    description:
      "Two entities with noMove commands over 10 ticks. " +
      "Networking scenario: records a reference replay and verifies that " +
      "replayTo() reproduces identical world-state hashes at each tick. " +
      "Use as a correctness check when porting to a new host environment.",
    tags:            ["networking"],
    stabilityStatus: "stable",
    scenario: {
      seed:            42,
      tractionCoeff_Q: 9000,
      entities: [
        { id: 1, teamId: 1, x_m: -0.5, weapon: "wpn_longsword" },
        { id: 2, teamId: 2, x_m:  0.5, weapon: "wpn_longsword" },
      ],
      aiPolicy:  "noMove",
      tickCount: 10,
    },
    performanceClass: { entityCount: 2, expectedTickBudgetMs: 200 },
    withReplay: true,
  },
  {
    id:              "bridge-snapshot",
    bridgeScenarioId: "corpus-bridge",
    title:           "Renderer Bridge Snapshot",
    description:
      "Two entities at tick 0 serialized through serializeBridgeFrame. " +
      "Bridge scenario: verifies the BridgeFrame schema version, tick, " +
      "entity count, and entity IDs. Baseline for renderer integration testing.",
    tags:            ["bridge"],
    stabilityStatus: "stable",
    scenario: {
      seed:            42,
      tractionCoeff_Q: 9000,
      entities: [
        { id: 1, teamId: 1, x_m: -0.5, weapon: "wpn_longsword" },
        { id: 2, teamId: 2, x_m:  0.5, weapon: "wpn_longsword" },
      ],
      aiPolicy:  "noMove",
      tickCount: 0,
    },
    performanceClass: { entityCount: 2, expectedTickBudgetMs: 10 },
    withReplay: false,
  },
  {
    id:    "ai-benchmark",
    title: "AI Skirmish Benchmark (20 Ticks)",
    description:
      "Two line-infantry entities engaging over 20 ticks. " +
      "Benchmark scenario: exercises the full AI decision + physics + injury path. " +
      "Use the timing result to detect performance regressions between engine versions.",
    tags:            ["benchmark"],
    stabilityStatus: "stable",
    scenario: {
      seed:            42,
      tractionCoeff_Q: 9000,
      entities: [
        { id: 1, teamId: 1, x_m: -0.5, weapon: "wpn_longsword" },
        { id: 2, teamId: 2, x_m:  0.5, weapon: "wpn_longsword" },
      ],
      aiPolicy:  "lineInfantry",
      tickCount: 20,
    },
    performanceClass: { entityCount: 2, expectedTickBudgetMs: 150 },
    withReplay: false,
  },
];

// ── Generator ─────────────────────────────────────────────────────────────────

if (!fs.existsSync(CORPUS)) fs.mkdirSync(CORPUS);

console.log("\nAnanke — Generating scenario corpus …\n");

for (const def of DEFS) {
  const dir = path.join(CORPUS, def.id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  // Run simulation
  const recorder = def.withReplay ? new ReplayRecorder(mkWorld(def.scenario.seed, def.scenario.entities.map(makeEntity))) : undefined;
  // For replay, re-run scenario with a fresh recorder
  let replayJson: string | null = null;
  if (def.withReplay) {
    const world2   = mkWorld(def.scenario.seed, def.scenario.entities.map(makeEntity));
    const rec2     = new ReplayRecorder(world2);
    const ctx2     = buildCtx(def.scenario);
    for (let t = 0; t < def.scenario.tickCount; t++) {
      const cmds2: CommandMap = new Map(def.scenario.entities.map(e => [e.id, [noMove()]]));
      rec2.record(world2.tick, cmds2);
      stepWorld(world2, cmds2, ctx2);
    }
    replayJson = serializeReplay(rec2.toReplay());
  }

  const { world } = runScenario(def.scenario);
  const finalHash  = hexHash(hashWorldState(world));

  // Bridge frame for bridge-tagged entries
  let bridgeExpected: CorpusManifest["bridgeExpected"] | undefined;
  if (def.tags.includes("bridge")) {
    const bridgeWorld = mkWorld(def.scenario.seed, def.scenario.entities.map(makeEntity));
    const frame = serializeBridgeFrame(bridgeWorld, {
      scenarioId: def.bridgeScenarioId ?? def.id,
      tickHz:     20,
    });
    bridgeExpected = {
      schema:      frame.schema,
      tick:        frame.tick,
      entityCount: frame.entities.length,
      scenarioId:  frame.scenarioId,
    };
  }

  // Write replay fixture
  if (replayJson !== null) {
    fs.writeFileSync(path.join(dir, "replay.json"), replayJson, "utf8");
  }

  const manifest: CorpusManifest = {
    version:            "corpus/v1",
    id:                 def.id,
    title:              def.title,
    description:        def.description,
    tags:               def.tags,
    stabilityStatus:    def.stabilityStatus,
    scenario:           def.scenario,
    expectedOutputHash: finalHash,
    performanceClass:   def.performanceClass,
    replayFixture:      replayJson !== null ? "replay.json" : null,
    ...(bridgeExpected ? { bridgeExpected } : {}),
  };

  fs.writeFileSync(
    path.join(dir, "corpus.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  const replayNote = replayJson ? " + replay.json" : "";
  const bridgeNote = bridgeExpected ? " + bridge-expected" : "";
  console.log(`✓  corpus/${def.id}/corpus.json  [${def.tags.join(", ")}]${replayNote}${bridgeNote}`);
  console.log(`   hash=${finalHash}  ticks=${def.scenario.tickCount}`);
}

// ── Write corpus README ────────────────────────────────────────────────────────

const readme = `# Ananke — Scenario Corpus

Each subdirectory contains a \`corpus.json\` manifest describing a canonical
deterministic scenario.  Run \`npm run verify-corpus\` to verify all entries
against the reference engine.

## Entries

| ID | Tags | Ticks | Description |
|----|------|-------|-------------|
${DEFS.map(d =>
  `| \`${d.id}\` | ${d.tags.map(t => `\`${t}\``).join(", ")} | ${d.scenario.tickCount} | ${d.title} |`
).join("\n")}

## Tag meanings

| Tag | Purpose |
|-----|---------|
| \`tutorial\` | Entry-level; no prior knowledge required |
| \`benchmark\` | Stable timing baseline; detect performance regressions |
| \`validation\` | Compared against empirical data |
| \`networking\` | Exercises replay, hash, lockstep |
| \`bridge\` | Exercises the renderer bridge |
| \`content-pack\` | Exercises equipment loading and composition |

## Verifying

\`\`\`bash
npm run build
npm run verify-corpus              # all entries
npm run verify-corpus -- --id=basic-duel   # single entry
npm run verify-corpus -- --json    # machine-readable
\`\`\`

## Regenerating

Re-run after any change to \`stepWorld\`, \`hashWorldState\`, or equipment constants:

\`\`\`bash
npm run build && npm run generate-corpus
\`\`\`

## Corpus format version

All manifests carry \`"version": "corpus/v1"\`.
`;

fs.writeFileSync(path.join(CORPUS, "README.md"), readme, "utf8");
console.log(`✓  corpus/README.md`);
console.log(`\nAll corpus entries written to corpus/`);
