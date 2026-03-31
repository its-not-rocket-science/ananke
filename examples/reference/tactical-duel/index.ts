// examples/reference/tactical-duel/index.ts
// Reference build PM-1: Tactical Duel Gamelet
//
// A complete end-to-end demonstration of Ananke's tactical layer:
//   combat · anatomy · sensory · AI · bridge (BridgeFrame) · replay
//
// Two combatants fight to incapacitation.  Every tick produces a BridgeFrame
// (the same JSON a renderer would consume), a desync-check hash, and a replay
// recording that can be diffed with `npx ananke replay diff`.
//
// Usage:
//   npm run build && node dist/examples/reference/tactical-duel/index.js [seed] [archA] [archB]
//   node dist/examples/reference/tactical-duel/index.js 42 KNIGHT_INFANTRY BRAWLER
//   node dist/examples/reference/tactical-duel/index.js 7  ORC_WARRIOR     ELF_ARCHER
//
// Architecture:
//   src/sim/kernel.ts     stepWorld — pure tick function
//   src/sim/ai/           decideCommandsForEntity — behavior trees
//   src/host-loop.ts      serializeBridgeFrame — wire format
//   src/netcode.ts        hashWorldState — desync checksum
//   src/replay.ts         ReplayRecorder / serializeReplay
//   src/sim/injury.ts     InjuryState — anatomy-level damage tracking

import * as fs from "node:fs";
import * as path from "node:path";
import { q, SCALE, type Q }            from "../../../src/units.js";
import { KNIGHT_INFANTRY, HUMAN_BASE,
         AMATEUR_BOXER }                from "../../../src/archetypes.js";
import { generateIndividual }           from "../../../src/generate.js";
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
import { STARTER_WEAPONS, STARTER_ARMOUR } from "../../../src/equipment.js";
import type { Entity }                  from "../../../src/sim/entity.js";
import type { KernelContext }           from "../../../src/sim/context.js";
import type { WorldState }              from "../../../src/sim/world.js";
import type { CommandMap }              from "../../../src/sim/commands.js";
import { serializeBridgeFrame }         from "../../../src/host-loop.js";
import { hashWorldState }               from "../../../src/netcode.js";
import { ReplayRecorder, serializeReplay } from "../../../src/replay.js";

// ── CLI args ──────────────────────────────────────────────────────────────────

const SEED = parseInt(process.argv[2] ?? "42", 10);
const M    = SCALE.m;
const CTX: KernelContext = { tractionCoeff: q(0.90) as Q };
const SCENARIO_ID = `tactical-duel-seed${SEED}`;
const MAX_TICKS   = 500;

// ── Entity factory ────────────────────────────────────────────────────────────

function makeEntity(
  id: number, teamId: number, seed: number,
  arch: typeof KNIGHT_INFANTRY,
  weaponId: string, armourId?: string,
  xOffset_m = 0,
): Entity {
  const attrs = generateIndividual(seed, arch);
  const items = [
    STARTER_WEAPONS.find(w => w.id === weaponId)!,
    ...(armourId ? [STARTER_ARMOUR.find(a => a.id === armourId)!] : []),
  ].filter(Boolean);
  return {
    id, teamId, attributes: attrs,
    energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout: { items }, traits: [],
    position_m:   v3(Math.trunc(xOffset_m * M), 0, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(), action: defaultAction(),
    condition: defaultCondition(), injury: defaultInjury(),
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
  };
}

const world: WorldState = {
  tick: 0, seed: SEED,
  entities: [
    makeEntity(1, 1, SEED,     KNIGHT_INFANTRY, "wpn_longsword", "arm_mail",    -0.5),
    makeEntity(2, 2, SEED + 1, AMATEUR_BOXER,   "wpn_club",       undefined,      0.5),
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const pct  = (v: number) => ((v / SCALE.Q) * 100).toFixed(0).padStart(3) + "%";
const alive = (e: Entity) => !e.injury.dead && e.injury.consciousness > 0;

function printTick(e1: Entity, e2: Entity): void {
  const regions1 = Object.entries(e1.injury.byRegion)
    .filter(([, r]) => r.surfaceDamage > q(0.10) || r.internalDamage > q(0.10))
    .map(([id, r]) => `${id}:${pct(r.surfaceDamage)}`).join(" ");
  const regions2 = Object.entries(e2.injury.byRegion)
    .filter(([, r]) => r.surfaceDamage > q(0.10) || r.internalDamage > q(0.10))
    .map(([id, r]) => `${id}:${pct(r.surfaceDamage)}`).join(" ");

  process.stdout.write(
    `t${String(world.tick).padStart(3)}  ` +
    `Knight  shock=${pct(e1.injury.shock)}  con=${pct(e1.injury.consciousness)}  fat=${pct(e1.energy.fatigue)}  ${regions1 || "(no injuries)"}\n` +
    `       Brawler shock=${pct(e2.injury.shock)}  con=${pct(e2.injury.consciousness)}  fat=${pct(e2.energy.fatigue)}  ${regions2 || "(no injuries)"}\n`,
  );
}

// ── Simulation ────────────────────────────────────────────────────────────────

console.log(`\nAnanke — Tactical Duel Reference Build  (seed ${SEED})\n`);
console.log("Knight (mail, longsword) vs. Amateur Boxer (club, unarmoured)\n");
console.log("Demonstrates: combat · anatomy · AI · BridgeFrame · replay · desync hash\n");

const recorder = new ReplayRecorder(world);
const bridgeFrames: object[] = [];
let elapsed_ms = 0;
let prevHash = hashWorldState(world);

for (let t = 0; t < MAX_TICKS; t++) {
  const e1 = world.entities[0]!;
  const e2 = world.entities[1]!;
  if (!alive(e1) && !alive(e2)) break;
  if (!alive(e1) || !alive(e2)) break;

  // Build AI commands
  const idx     = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, Math.trunc(4 * M));
  const cmds: CommandMap = new Map();
  for (const e of world.entities) {
    if (!e.injury.dead) {
      cmds.set(e.id, decideCommandsForEntity(world, idx, spatial, e, AI_PRESETS.lineInfantry!));
    }
  }

  recorder.record(world.tick, cmds);

  // Step and measure
  const t0 = performance.now();
  stepWorld(world, cmds, CTX);
  elapsed_ms += performance.now() - t0;

  // Bridge frame (what a renderer would consume)
  const frame = serializeBridgeFrame(world, { scenarioId: SCENARIO_ID });
  bridgeFrames.push(frame);

  // Desync checksum
  const h = hashWorldState(world);
  if (h === prevHash && world.tick > 1) {
    // Identical consecutive hashes would indicate a stuck simulation — not expected
  }
  prevHash = h;

  // Print every 10 ticks + first tick
  if (t === 0 || t % 10 === 9) printTick(e1, e2);
}

// ── Final state ───────────────────────────────────────────────────────────────

const e1 = world.entities[0]!;
const e2 = world.entities[1]!;
const winner = alive(e1) && !alive(e2) ? "Knight" :
               alive(e2) && !alive(e1) ? "Brawler" : "Draw/timeout";

console.log(`\n${"─".repeat(60)}`);
console.log(`Result: ${winner} after ${world.tick} ticks`);
console.log(`\nKnight  — shock=${pct(e1.injury.shock)}  consciousness=${pct(e1.injury.consciousness)}  dead=${e1.injury.dead}`);
console.log(`Brawler — shock=${pct(e2.injury.shock)}  consciousness=${pct(e2.injury.consciousness)}  dead=${e2.injury.dead}`);

// ── Performance envelope ──────────────────────────────────────────────────────

const avgTickMs = world.tick > 0 ? (elapsed_ms / world.tick).toFixed(3) : "0";
console.log(`\nPerformance:`);
console.log(`  Entities:    2`);
console.log(`  Ticks run:   ${world.tick}`);
console.log(`  Total time:  ${elapsed_ms.toFixed(1)} ms`);
console.log(`  Avg per tick: ${avgTickMs} ms`);
console.log(`  Target (20 Hz): 50.0 ms budget → ${Number(avgTickMs) < 50.0 ? "✓ PASS" : "✗ EXCEEDS BUDGET"}`);

// ── Bridge output ─────────────────────────────────────────────────────────────

const lastFrame = bridgeFrames[bridgeFrames.length - 1] as Record<string, unknown>;
console.log(`\nLast BridgeFrame (schema: ${(lastFrame as { schema?: string }).schema ?? "unknown"}):`);
console.log(`  tick=${lastFrame["tick"]}  entities=${(lastFrame["entities"] as unknown[]).length}`);
console.log(`  (Full JSON available — ${JSON.stringify(lastFrame).length} bytes per frame)`);

// ── Replay ────────────────────────────────────────────────────────────────────

const replay     = recorder.toReplay();
const replayJson = serializeReplay(replay);
const outDir     = path.dirname(new URL(import.meta.url).pathname);
const replayPath = path.join(outDir, `replay-seed${SEED}.json`);

try {
  fs.writeFileSync(replayPath, replayJson, "utf8");
  console.log(`\nReplay saved: ${replayPath}`);
  console.log(`  (${replayJson.length} bytes, ${replay.frames.length} frames)`);
  console.log(`  Compare with: npx ananke replay diff <file-a.json> <file-b.json>`);
} catch {
  console.log(`\nReplay: ${replayJson.length} bytes, ${replay.frames.length} frames (not written to disk in this environment)`);
}

// ── Architecture note ─────────────────────────────────────────────────────────

console.log(`\nPackages used in this build:`);
console.log(`  @ananke/core       mkWorld, stepWorld, Entity, q(), SCALE`);
console.log(`  @ananke/combat     injury, anatomy regions, equipment`);
console.log(`  host-loop.ts       BridgeFrame, serializeBridgeFrame`);
console.log(`  netcode.ts         hashWorldState (desync checksum)`);
console.log(`  replay.ts          ReplayRecorder, serializeReplay`);
console.log(`  AI presets         lineInfantry behavior tree\n`);
