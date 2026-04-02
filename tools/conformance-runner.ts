// tools/conformance-runner.ts
// PM-5: Deterministic Conformance Suite runner
//
// Reads fixtures from conformance/*.json and verifies the reference TypeScript
// engine produces the expected outputs.  Any conforming host SDK must pass all
// fixtures to be considered deterministically compatible.
//
// Usage:
//   npm run build && npm run conformance-runner
//   npm run conformance-runner -- --json     (machine-readable output)
//   npm run conformance-runner -- --fixture=state-hash  (single fixture)
//
// Exit codes:
//   0 — all fixtures passed
//   1 — one or more fixtures failed

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
import { WORLD_STEP_PHASE_ORDER }    from "../src/sim/step/world-phases.js";
import type { KernelContext }        from "../src/sim/context.js";
import type { WorldState }           from "../src/sim/world.js";
import type { Entity }               from "../src/sim/entity.js";
import type { CommandMap }           from "../src/sim/commands.js";
import type { Q }                    from "../src/units.js";

const ROOT        = process.cwd();
const CONFORMANCE = path.join(ROOT, "conformance");
const JSON_OUT    = process.argv.includes("--json");
const SINGLE      = process.argv.find(a => a.startsWith("--fixture="))?.split("=")[1];

const CTX: KernelContext = { tractionCoeff: q(0.90) as Q };
const M = SCALE.m;

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexHash(h: bigint): string {
  return "0x" + h.toString(16).padStart(16, "0");
}

function makeEntity(id: number, teamId: number, x_frac: number): Entity {
  const sword  = STARTER_WEAPONS.find(w => w.id === "wpn_longsword")!;
  const mail   = STARTER_ARMOUR.find(a => a.id === "arm_chainmail");
  const entity = mkHumanoidEntity(id, teamId, Math.trunc(x_frac * M), 0);
  entity.loadout = { items: [sword, ...(mail ? [mail] : [])] };
  return entity;
}

// ── Runner result type ────────────────────────────────────────────────────────

interface FixtureResult {
  id:       string;
  kind:     string;
  status:   "pass" | "fail" | "skip" | "error";
  checks:   number;
  failures: string[];
  durationMs: number;
}

// ── Fixture runners ───────────────────────────────────────────────────────────

function runStateHash(fix: Record<string, unknown>): FixtureResult {
  const start  = Date.now();
  const cases  = fix["cases"] as Array<{ tick: number; hashHex: string; description: string }>;
  const failures: string[] = [];

  const world: WorldState = mkWorld(42, [makeEntity(1, 1, -0.5), makeEntity(2, 2, 0.5)]);
  const commandSource = (fix["commandSource"] as string | undefined) ?? "idle";

  for (const c of cases) {
    while (world.tick < c.tick) {
      const cmds: CommandMap = commandSource === "lineInfantry"
        ? buildAICommands(
          world,
          buildWorldIndex(world),
          buildSpatialIndex(world, Math.trunc(4 * M)),
          (eId) => world.entities.find(e => e.id === eId && !e.injury.dead)
            ? AI_PRESETS.lineInfantry : undefined,
        )
        : new Map([[1, [noMove()]], [2, [noMove()]]]);
      stepWorld(world, cmds, CTX);
    }
    const got  = hexHash(hashWorldState(world));
    const want = c.hashHex;
    if (got !== want) {
      failures.push(`tick ${c.tick}: expected hash ${want}, got ${got}`);
    }
  }

  return {
    id: fix["id"] as string, kind: fix["kind"] as string,
    status: failures.length === 0 ? "pass" : "fail",
    checks: cases.length, failures, durationMs: Date.now() - start,
  };
}

function runReplayParity(fix: Record<string, unknown>): FixtureResult {
  const start     = Date.now();
  const failures: string[] = [];
  const hashTrace = fix["hashTrace"] as Array<{
    recordedAtTick: number; expectedWorldTick: number; hashHex: string;
  }>;
  const replayJson = fix["replayJson"] as string;

  try {
    const replay = deserializeReplay(replayJson);
    let checks   = 0;

    for (const expected of hashTrace) {
      // replayTo(replay, recordedAtTick) applies the frame recorded at that tick and steps once.
      const world = replayTo(replay, expected.recordedAtTick, CTX);
      if (world.tick !== expected.expectedWorldTick) {
        failures.push(`recordedAtTick ${expected.recordedAtTick}: world.tick expected ${expected.expectedWorldTick}, got ${world.tick}`);
      }
      const got = hexHash(hashWorldState(world));
      if (got !== expected.hashHex) {
        failures.push(`recordedAtTick ${expected.recordedAtTick}: expected hash ${expected.hashHex}, got ${got}`);
      }
      checks++;
      if (failures.length >= 3) { failures.push("…further failures omitted"); break; }
    }

    return {
      id: fix["id"] as string, kind: fix["kind"] as string,
      status: failures.length === 0 ? "pass" : "fail",
      checks, failures, durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      id: fix["id"] as string, kind: fix["kind"] as string,
      status: "error", checks: 0,
      failures: [String(err)], durationMs: Date.now() - start,
    };
  }
}

function runPhaseOrder(fix: Record<string, unknown>): FixtureResult {
  const start = Date.now();
  const failures: string[] = [];
  const expected = fix["phases"] as string[] | undefined;

  if (!Array.isArray(expected)) {
    failures.push("fixture missing phases[]");
  } else {
    const actual = [...WORLD_STEP_PHASE_ORDER];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(`phase order mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  return {
    id: fix["id"] as string,
    kind: fix["kind"] as string,
    status: failures.length === 0 ? "pass" : "fail",
    checks: 1,
    failures,
    durationMs: Date.now() - start,
  };
}

function runCommandRoundTrip(fix: Record<string, unknown>): FixtureResult {
  const start    = Date.now();
  const failures: string[] = [];
  const scale    = fix["scale"] as Record<string, number>;
  const commands = fix["commands"] as Array<Record<string, unknown>>;

  // Verify scale constants match the engine
  if (scale["Q"] !== SCALE.Q) failures.push(`SCALE.Q mismatch: fixture=${scale["Q"]}, engine=${SCALE.Q}`);
  if (scale["kg"] !== SCALE.kg) failures.push(`SCALE.kg mismatch: fixture=${scale["kg"]}, engine=${SCALE.kg}`);
  if (scale["m"] !== SCALE.m) failures.push(`SCALE.m mismatch: fixture=${scale["m"]}, engine=${SCALE.m}`);
  if (scale["mps"] !== SCALE.mps) failures.push(`SCALE.mps mismatch: fixture=${scale["mps"]}, engine=${SCALE.mps}`);

  // Verify every command round-trips through JSON without loss
  for (const cmd of commands) {
    const json   = JSON.stringify(cmd);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    for (const [k, v] of Object.entries(cmd)) {
      if (parsed[k] !== v) {
        failures.push(`command[${cmd["kind"]}].${k}: ${JSON.stringify(v)} → ${JSON.stringify(parsed[k])}`);
      }
    }
  }

  return {
    id: fix["id"] as string, kind: fix["kind"] as string,
    status: failures.length === 0 ? "pass" : "fail",
    checks: 4 + commands.length, failures, durationMs: Date.now() - start,
  };
}

function runBridgeSnapshot(fix: Record<string, unknown>): FixtureResult {
  const start    = Date.now();
  const failures: string[] = [];
  const expected = fix["expected"] as Record<string, unknown>;

  const world = mkWorld(42, [makeEntity(1, 1, -0.5), makeEntity(2, 2, 0.5)]);
  const frame = serializeBridgeFrame(world, { scenarioId: "conformance-test", tickHz: 20 });

  if (frame.schema !== expected["schema"]) {
    failures.push(`schema: expected "${expected["schema"]}", got "${frame.schema}"`);
  }
  if (frame.tick !== expected["tick"]) {
    failures.push(`tick: expected ${expected["tick"]}, got ${frame.tick}`);
  }
  if (frame.entities.length !== expected["entityCount"]) {
    failures.push(`entityCount: expected ${expected["entityCount"]}, got ${frame.entities.length}`);
  }
  if (frame.scenarioId !== expected["scenarioId"]) {
    failures.push(`scenarioId: expected "${expected["scenarioId"]}", got "${frame.scenarioId}"`);
  }
  const gotIds    = frame.entities.map(e => e.entityId).sort((a, b) => a - b);
  const wantIds   = expected["entityIds"] as number[];
  const idsMatch  = JSON.stringify(gotIds) === JSON.stringify(wantIds);
  if (!idsMatch) failures.push(`entityIds: expected ${JSON.stringify(wantIds)}, got ${JSON.stringify(gotIds)}`);

  return {
    id: fix["id"] as string, kind: fix["kind"] as string,
    status: failures.length === 0 ? "pass" : "fail",
    checks: 5, failures, durationMs: Date.now() - start,
  };
}

function runLockstepSequence(fix: Record<string, unknown>): FixtureResult {
  const start     = Date.now();
  const failures: string[] = [];
  const snapshots = fix["snapshots"] as Array<{
    tick: number; hashHex: string;
    entities: Array<{ id: number; x_m: number; dead: boolean; shock_Q: number }>;
  }>;

  const world: WorldState = mkWorld(42, [makeEntity(1, 1, -0.5), makeEntity(2, 2, 0.5)]);
  let checks = 0;

  for (const snap of snapshots) {
    while (world.tick < snap.tick) {
      const idx     = buildWorldIndex(world);
      const spatial = buildSpatialIndex(world, Math.trunc(4 * M));
      const cmds    = buildAICommands(world, idx, spatial,
        (eId) => world.entities.find(e => e.id === eId && !e.injury.dead)
                 ? AI_PRESETS.lineInfantry : undefined);
      stepWorld(world, cmds, CTX);
    }

    const gotHash = hexHash(hashWorldState(world));
    if (gotHash !== snap.hashHex) {
      failures.push(`tick ${snap.tick}: hash mismatch (expected ${snap.hashHex}, got ${gotHash})`);
      if (failures.length >= 3) { failures.push("…further failures omitted"); break; }
    }
    checks++;

    for (const snapE of snap.entities) {
      const live = world.entities.find(e => e.id === snapE.id);
      if (!live) { failures.push(`tick ${snap.tick}: entity ${snapE.id} not found`); continue; }
      const gotX = Math.round((live.position_m.x / SCALE.m) * 1000) / 1000;
      if (gotX !== snapE.x_m) {
        failures.push(`tick ${snap.tick} entity ${snapE.id}: x_m expected ${snapE.x_m}, got ${gotX}`);
      }
      if (live.injury.dead !== snapE.dead) {
        failures.push(`tick ${snap.tick} entity ${snapE.id}: dead expected ${snapE.dead}, got ${live.injury.dead}`);
      }
    }
  }

  return {
    id: fix["id"] as string, kind: fix["kind"] as string,
    status: failures.length === 0 ? "pass" : "fail",
    checks, failures, durationMs: Date.now() - start,
  };
}

const RUNNERS: Record<string, (fix: Record<string, unknown>) => FixtureResult> = {
  "state-hash":         runStateHash,
  "phase-order":        runPhaseOrder,
  "replay-parity":      runReplayParity,
  "command-round-trip": runCommandRoundTrip,
  "bridge-snapshot":    runBridgeSnapshot,
  "lockstep-sequence":  runLockstepSequence,
};

// ── Load and run fixtures ─────────────────────────────────────────────────────

if (!fs.existsSync(CONFORMANCE)) {
  console.error("conformance/ directory not found. Run: npm run generate-conformance-fixtures");
  process.exit(1);
}

const fixtureFiles = fs.readdirSync(CONFORMANCE)
  .filter(f => f.endsWith(".json"))
  .sort();

if (fixtureFiles.length === 0) {
  console.error("No fixture JSON files found. Run: npm run generate-conformance-fixtures");
  process.exit(1);
}

const results: FixtureResult[] = [];

for (const file of fixtureFiles) {
  const fix = JSON.parse(fs.readFileSync(path.join(CONFORMANCE, file), "utf8")) as Record<string, unknown>;
  const kind = fix["kind"] as string;
  if (SINGLE && !file.includes(SINGLE) && kind !== SINGLE) continue;

  const runner = RUNNERS[kind];
  if (!runner) {
    results.push({
      id: fix["id"] as string, kind,
      status: "skip", checks: 0,
      failures: [`No runner registered for kind '${kind}'`],
      durationMs: 0,
    });
    continue;
  }
  results.push(runner(fix));
}

// ── Output ────────────────────────────────────────────────────────────────────

const passed  = results.filter(r => r.status === "pass").length;
const failed  = results.filter(r => r.status === "fail").length;
const errored = results.filter(r => r.status === "error").length;
const skipped = results.filter(r => r.status === "skip").length;

if (JSON_OUT) {
  const report = {
    _generated: new Date().toISOString(),
    summary: { passed, failed, errored, skipped, total: results.length },
    results,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(failed + errored > 0 ? 1 : 0);
}

const icons: Record<FixtureResult["status"], string> = {
  pass: "✅", fail: "❌", skip: "⏭", error: "💥",
};

console.log("\nAnanke — Conformance Suite\n" + "═".repeat(60));
for (const r of results) {
  const icon  = icons[r.status];
  const label = r.status.toUpperCase().padEnd(5);
  console.log(`  ${icon} ${label}  ${r.id}  (${r.checks} checks, ${r.durationMs} ms)`);
  for (const f of r.failures) console.log(`          ✗ ${f}`);
}
console.log("─".repeat(60));
console.log(`  Passed: ${passed}  Failed: ${failed}  Errored: ${errored}  Skipped: ${skipped}`);
const allOk = failed + errored === 0;
console.log(`  Verdict: ${allOk ? "✅ ALL FIXTURES PASS" : "❌ CONFORMANCE FAILURES"}\n`);

process.exit(allOk ? 0 : 1);
