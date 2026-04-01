// tools/verify-corpus.ts
// PM-8: Verify scenario corpus entries against the reference engine
//
// Reads corpus/{id}/corpus.json, reconstructs each scenario, runs it, and
// compares the final world-state hash to expectedOutputHash.
// For networking entries with a replayFixture, also verifies replayTo parity.
// For bridge entries with bridgeExpected, also verifies the BridgeFrame shape.
//
// Usage:
//   npm run build && npm run verify-corpus
//   npm run verify-corpus -- --id=basic-duel     (single entry)
//   npm run verify-corpus -- --json              (machine-readable output)
//
// Exit codes:
//   0 — all entries pass
//   1 — one or more entries fail

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
import { deserializeReplay, replayTo } from "../src/replay.js";
import { serializeBridgeFrame }      from "../src/host-loop.js";
import { noMove }                    from "../src/sim/commands.js";
import type { KernelContext }        from "../src/sim/context.js";
import type { Entity }               from "../src/sim/entity.js";
import type { CommandMap }           from "../src/sim/commands.js";
import type { Q }                    from "../src/units.js";
import type { CorpusManifest, CorpusEntitySpec } from "./generate-corpus.js";

// ── Config ────────────────────────────────────────────────────────────────────

const ROOT    = process.cwd();
const CORPUS  = path.join(ROOT, "corpus");
const JSON_OUT = process.argv.includes("--json");
const SINGLE   = process.argv.find(a => a.startsWith("--id="))?.split("=")[1];
const M        = SCALE.m;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Result type ───────────────────────────────────────────────────────────────

interface CorpusResult {
  id:             string;
  title:          string;
  tags:           string[];
  status:         "pass" | "fail" | "error";
  checks:         number;
  failures:       string[];
  durationMs:     number;
  actualHash:     string;
  expectedHash:   string;
  withinBudget:   boolean;
  budgetMs:       number;
}

// ── Runner ────────────────────────────────────────────────────────────────────

function runEntry(manifest: CorpusManifest, entryDir: string): CorpusResult {
  const start    = Date.now();
  const failures: string[] = [];
  let checks     = 0;

  try {
    const sc  = manifest.scenario;
    const ctx: KernelContext = { tractionCoeff: sc.tractionCoeff_Q as Q };

    // ── Run scenario ───────────────────────────────────────────────────────────
    const world = mkWorld(sc.seed, sc.entities.map(makeEntity));

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
      stepWorld(world, cmds, ctx);
    }

    // ── Check world-state hash ─────────────────────────────────────────────────
    const actualHash = hexHash(hashWorldState(world));
    checks++;
    if (actualHash !== manifest.expectedOutputHash) {
      failures.push(
        `world hash mismatch: expected ${manifest.expectedOutputHash}, got ${actualHash}`,
      );
    }

    // ── Check replay fixture (networking entries) ──────────────────────────────
    if (manifest.replayFixture) {
      try {
        const replayPath = path.join(entryDir, manifest.replayFixture);
        const replayJson = fs.readFileSync(replayPath, "utf8");
        const replay     = deserializeReplay(replayJson);

        for (let t = 0; t < sc.tickCount; t++) {
          const replayCtx: KernelContext = { tractionCoeff: sc.tractionCoeff_Q as Q };
          const w = replayTo(replay, t, replayCtx);
          const rHash = hexHash(hashWorldState(w));
          // Compare against re-simulation at this tick
          const refWorld = mkWorld(sc.seed, sc.entities.map(makeEntity));
          const refCtx: KernelContext = { tractionCoeff: sc.tractionCoeff_Q as Q };
          for (let i = 0; i <= t; i++) {
            const cmds2: CommandMap = new Map(sc.entities.map(e => [e.id, [noMove()]]));
            stepWorld(refWorld, cmds2, refCtx);
          }
          const refHash = hexHash(hashWorldState(refWorld));
          checks++;
          if (rHash !== refHash) {
            failures.push(`replayTo(${t}): got ${rHash}, expected ${refHash}`);
            if (failures.length >= 3) { failures.push("…further replay failures omitted"); break; }
          }
        }
      } catch (err) {
        failures.push(`replay fixture error: ${String(err)}`);
      }
    }

    // ── Check bridge frame (bridge-tagged entries) ─────────────────────────────
    if (manifest.bridgeExpected) {
      const bridgeWorld = mkWorld(sc.seed, sc.entities.map(makeEntity));
      const frame = serializeBridgeFrame(bridgeWorld, {
        scenarioId: manifest.bridgeExpected.scenarioId,
        tickHz:     20,
      });
      checks++;
      if (frame.schema !== manifest.bridgeExpected.schema) {
        failures.push(`bridge schema: expected "${manifest.bridgeExpected.schema}", got "${frame.schema}"`);
      }
      if (frame.tick !== manifest.bridgeExpected.tick) {
        failures.push(`bridge tick: expected ${manifest.bridgeExpected.tick}, got ${frame.tick}`);
      }
      if (frame.entities.length !== manifest.bridgeExpected.entityCount) {
        failures.push(`bridge entityCount: expected ${manifest.bridgeExpected.entityCount}, got ${frame.entities.length}`);
      }
    }

    const durationMs  = Date.now() - start;
    const withinBudget = durationMs <= manifest.performanceClass.expectedTickBudgetMs;

    return {
      id:           manifest.id,
      title:        manifest.title,
      tags:         manifest.tags,
      status:       failures.length === 0 ? "pass" : "fail",
      checks,
      failures,
      durationMs,
      actualHash,
      expectedHash: manifest.expectedOutputHash,
      withinBudget,
      budgetMs:     manifest.performanceClass.expectedTickBudgetMs,
    };

  } catch (err) {
    return {
      id:           manifest.id,
      title:        manifest.title,
      tags:         manifest.tags,
      status:       "error",
      checks:       0,
      failures:     [String(err)],
      durationMs:   Date.now() - start,
      actualHash:   "",
      expectedHash: manifest.expectedOutputHash,
      withinBudget: false,
      budgetMs:     manifest.performanceClass.expectedTickBudgetMs,
    };
  }
}

// ── Load and run ──────────────────────────────────────────────────────────────

if (!fs.existsSync(CORPUS)) {
  console.error("corpus/ directory not found. Run: npm run generate-corpus");
  process.exit(1);
}

const entries = fs.readdirSync(CORPUS, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name)
  .sort()
  .filter(id => !SINGLE || id === SINGLE);

if (entries.length === 0) {
  const msg = SINGLE
    ? `No corpus entry found with id "${SINGLE}"`
    : "No corpus entries found. Run: npm run generate-corpus";
  console.error(msg);
  process.exit(1);
}

const results: CorpusResult[] = [];

for (const id of entries) {
  const entryDir    = path.join(CORPUS, id);
  const manifestPath = path.join(entryDir, "corpus.json");
  if (!fs.existsSync(manifestPath)) continue;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as CorpusManifest;
  results.push(runEntry(manifest, entryDir));
}

// ── Output ────────────────────────────────────────────────────────────────────

const passed  = results.filter(r => r.status === "pass").length;
const failed  = results.filter(r => r.status === "fail").length;
const errored = results.filter(r => r.status === "error").length;
const overBudget = results.filter(r => !r.withinBudget).length;

if (JSON_OUT) {
  console.log(JSON.stringify({
    _generated: new Date().toISOString(),
    summary: { passed, failed, errored, overBudget, total: results.length },
    results,
  }, null, 2));
  process.exit(failed + errored > 0 ? 1 : 0);
}

const icons: Record<CorpusResult["status"], string> = {
  pass: "✅", fail: "❌", error: "💥",
};

console.log("\nAnanke — Scenario Corpus Verification\n" + "═".repeat(60));
for (const r of results) {
  const icon    = icons[r.status];
  const label   = r.status.toUpperCase().padEnd(5);
  const budget  = r.withinBudget ? "" : ` ⚠ over budget (${r.durationMs}ms > ${r.budgetMs}ms)`;
  const tagStr  = r.tags.join(", ");
  console.log(`  ${icon} ${label}  ${r.id}  [${tagStr}]  (${r.checks} checks, ${r.durationMs}ms)${budget}`);
  for (const f of r.failures) console.log(`          ✗ ${f}`);
}
console.log("─".repeat(60));
console.log(`  Passed: ${passed}  Failed: ${failed}  Errored: ${errored}  Over-budget: ${overBudget}`);
const allOk = failed + errored === 0;
console.log(`  Verdict: ${allOk ? "✅ ALL CORPUS ENTRIES PASS" : "❌ CORPUS FAILURES"}\n`);

process.exit(allOk ? 0 : 1);
