// tools/generate-conformance-fixtures.ts
// PM-5: Generate conformance fixture JSON files
//
// Runs minimal deterministic simulations and records input→output pairs
// that any host SDK can use to verify their implementation is correct.
//
// Usage:
//   npm run build && node dist/tools/generate-conformance-fixtures.js
//
// Output: conformance/*.json

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

const ROOT        = process.cwd();
const CONFORMANCE = path.join(ROOT, "conformance");
const M           = SCALE.m;

if (!fs.existsSync(CONFORMANCE)) fs.mkdirSync(CONFORMANCE);

// ── Shared context ────────────────────────────────────────────────────────────

const CTX: KernelContext = { tractionCoeff: q(0.90) as Q };
const SCENARIO_SEED = 42;

// ── Entity factory ────────────────────────────────────────────────────────────

function makeEntity(id: number, teamId: number, x_frac: number): Entity {
  const sword  = STARTER_WEAPONS.find(w => w.id === "wpn_longsword")!;
  const mail   = STARTER_ARMOUR.find(a => a.id === "arm_chainmail");
  const entity = mkHumanoidEntity(id, teamId, Math.trunc(x_frac * M), 0);
  entity.loadout = { items: [sword, ...(mail ? [mail] : [])] };
  return entity;
}

// ── Bigint → hex serialisation ────────────────────────────────────────────────

function hexHash(h: bigint): string {
  return "0x" + h.toString(16).padStart(16, "0");
}

// ── Safe JSON replacer (handle bigint) ───────────────────────────────────────

function safeStringify(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    typeof val === "bigint" ? "0x" + val.toString(16) : val, 2);
}

// ── Fixture 1: State-hash parity ─────────────────────────────────────────────
// Minimal WorldState → expected hashWorldState hex.
// A conforming host must produce the same hash given this world state.

function genStateHashFixture() {
  const world: WorldState = mkWorld(SCENARIO_SEED, [
    makeEntity(1, 1, -0.5),
    makeEntity(2, 2,  0.5),
  ]);

  const hash0 = hashWorldState(world);

  // Step once with no commands (idle tick)
  const cmds: CommandMap = new Map([
    [1, [noMove()]],
    [2, [noMove()]],
  ]);
  stepWorld(world, cmds, CTX);
  const hash1 = hashWorldState(world);

  const fixture = {
    version:     "conformance/v1",
    id:          "state-hash-01",
    description: "Given a canonical WorldState, hashWorldState must return the specified hex value.",
    kind:        "state-hash",
    notes: [
      "seed=42; two humanoid entities at ±0.5 m with chainmail and longsword.",
      "hash is FNV-64 over canonical JSON (sorted keys, Map→sorted entries).",
      "A conforming implementation must produce identical hashes.",
    ],
    cases: [
      {
        tick:        0,
        description: "Initial world state before any tick",
        hashHex:     hexHash(hash0),
      },
      {
        tick:        1,
        description: "World state after one idle tick (noMove commands)",
        hashHex:     hexHash(hash1),
      },
    ],
  };

  const out = path.join(CONFORMANCE, "state-hash.json");
  fs.writeFileSync(out, safeStringify(fixture), "utf8");
  console.log(`✓  conformance/state-hash.json  (${fixture.cases.length} cases)`);
}

// ── Fixture 2: Replay parity ──────────────────────────────────────────────────
// Reference replay → expected hash at each tick.
// A conforming host re-simulating this replay must reproduce the same hashes.

function genReplayParityFixture() {
  const world: WorldState = mkWorld(SCENARIO_SEED, [
    makeEntity(1, 1, -0.5),
    makeEntity(2, 2,  0.5),
  ]);

  const recorder  = new ReplayRecorder(world);
  // hashTrace: for each frame recorded at `recordedAtTick`, hashWorldState after
  // replayTo(replay, recordedAtTick) must equal hashHex.
  // replayTo applies the frame (tick <= recordedAtTick), steps once, returns post-step world.
  const hashTrace: Array<{ recordedAtTick: number; expectedWorldTick: number; hashHex: string }> = [];

  // IMPORTANT: Use fixed commands (noMove) rather than buildAICommands.
  // buildAICommands mutates entity.ai state (focusTargetId, decisionCooldownTicks) as a side
  // effect of computing commands.  Those mutations are NOT part of the recorded initial state,
  // so replayTo — which starts from the clean initial state — would diverge.
  // noMove commands avoid this: they carry no AI state mutations and the replay is exact.
  const N_TICKS = 10;
  for (let t = 0; t < N_TICKS; t++) {
    const cmds: CommandMap = new Map([[1, [noMove()]], [2, [noMove()]]]);
    const preTick = world.tick;
    recorder.record(preTick, cmds);
    stepWorld(world, cmds, CTX);
    // After step: world.tick === preTick + 1
    // replayTo(replay, preTick) applies frame[preTick] and steps → returns world at preTick+1
    hashTrace.push({
      recordedAtTick:   preTick,
      expectedWorldTick: world.tick,
      hashHex:           hexHash(hashWorldState(world)),
    });
  }

  const replayJson = serializeReplay(recorder.toReplay());

  const fixture = {
    version:     "conformance/v1",
    id:          "replay-parity-01",
    description: "Re-simulating this replay must reproduce the hash after each recorded frame.",
    kind:        "replay-parity",
    notes: [
      "seed=42; 2 entities; 10 ticks of noMove commands.",
      "Fixed commands are used (not AI) so replayTo starts from a clean initial state.",
      "For each entry: call replayTo(replay, recordedAtTick, ctx).",
      "The returned world.tick must equal expectedWorldTick.",
      "hashWorldState(world) must equal hashHex.",
    ],
    replayJson,
    hashTrace,
  };

  const out = path.join(CONFORMANCE, "replay-parity.json");
  fs.writeFileSync(out, safeStringify(fixture), "utf8");
  console.log(`✓  conformance/replay-parity.json  (${hashTrace.length} ticks)`);
}

// ── Fixture 3: Command round-trip ─────────────────────────────────────────────
// Reference command encodings that any host must serialise identically.

function genCommandRoundTripFixture() {
  const fixture = {
    version:     "conformance/v1",
    id:          "command-round-trip-01",
    description: "CommandMap entries must serialise to and from JSON without loss.",
    kind:        "command-round-trip",
    notes: [
      "CommandMap is Map<entityId, Command[]>.",
      "For wire transport, serialise as [[entityId, commands[]], ...].",
      "All numeric fields are fixed-point integers (SCALE.Q = 10000).",
    ],
    scale: {
      Q:   SCALE.Q,
      kg:  SCALE.kg,
      m:   SCALE.m,
      mps: SCALE.mps,
    },
    commands: [
      {
        entityId: 1,
        kind:     "attack",
        mode:     "strike",
        targetId: 2,
        intensity_Q: SCALE.Q,
        description: "Full-intensity strike at entity 2",
      },
      {
        entityId: 2,
        kind:     "move",
        direction_x: Math.trunc(0.5 * SCALE.mps),
        direction_y: 0,
        direction_z: 0,
        mode:     "walk",
        description: "Walk toward +x at 0.5 m/s",
      },
      {
        entityId: 1,
        kind:     "defend",
        mode:     "active",
        description: "Active defence stance",
      },
      {
        entityId: 2,
        kind:     "idle",
        description: "No action this tick",
      },
    ],
  };

  const out = path.join(CONFORMANCE, "command-round-trip.json");
  fs.writeFileSync(out, safeStringify(fixture), "utf8");
  console.log(`✓  conformance/command-round-trip.json  (${fixture.commands.length} command types)`);
}

// ── Fixture 4: Bridge snapshot compatibility ──────────────────────────────────
// WorldState → expected BridgeFrame shape (schema, tick, entity count, positions).

function genBridgeSnapshotFixture() {
  const world: WorldState = mkWorld(SCENARIO_SEED, [
    makeEntity(1, 1, -0.5),
    makeEntity(2, 2,  0.5),
  ]);

  const frame = serializeBridgeFrame(world, {
    scenarioId: "conformance-test",
    tickHz:     20,
  });

  const fixture = {
    version:     "conformance/v1",
    id:          "bridge-snapshot-01",
    description: "serializeBridgeFrame must produce a BridgeFrame with these invariants.",
    kind:        "bridge-snapshot",
    notes: [
      "Check: frame.schema === 'ananke-bridge/v1'.",
      "Check: frame.tick === 0.",
      "Check: frame.entities.length === 2.",
      "Check: entity positions match input WorldState positions.",
      "The generatedAt timestamp is non-deterministic — do not compare it.",
    ],
    input: {
      seed: SCENARIO_SEED,
      tick: 0,
      entityCount: world.entities.length,
      entityPositions: world.entities.map(e => ({
        id: e.id,
        x_m: e.position_m.x / SCALE.m,
        y_m: e.position_m.y / SCALE.m,
      })),
    },
    expected: {
      schema:       frame.schema,
      tick:         frame.tick,
      entityCount:  frame.entities.length,
      scenarioId:   frame.scenarioId,
      entityIds:    frame.entities.map(e => e.entityId).sort((a, b) => a - b),
    },
  };

  const out = path.join(CONFORMANCE, "bridge-snapshot.json");
  fs.writeFileSync(out, safeStringify(fixture), "utf8");
  console.log(`✓  conformance/bridge-snapshot.json`);
}

// ── Fixture 5: Lockstep tick sequence ─────────────────────────────────────────
// Reference tick sequence → expected entity positions and shock at tick N.

function genLockstepSequenceFixture() {
  const world: WorldState = mkWorld(SCENARIO_SEED, [
    makeEntity(1, 1, -0.5),
    makeEntity(2, 2,  0.5),
  ]);

  const N_TICKS = 20;
  const snapshots: Array<{
    tick:     number;
    hashHex:  string;
    entities: Array<{ id: number; x_m: number; dead: boolean; shock_Q: number }>;
  }> = [];

  // Snapshot tick 0
  snapshots.push({
    tick: 0,
    hashHex: hexHash(hashWorldState(world)),
    entities: world.entities.map(e => ({
      id:      e.id,
      x_m:     e.position_m.x / SCALE.m,
      dead:    e.injury.dead,
      shock_Q: e.injury.shock,
    })),
  });

  for (let t = 0; t < N_TICKS; t++) {
    const idx     = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * M));
    const cmds    = buildAICommands(world, idx, spatial,
      (eId) => world.entities.find(e => e.id === eId && !e.injury.dead)
               ? AI_PRESETS.lineInfantry : undefined);
    stepWorld(world, cmds, CTX);

    snapshots.push({
      tick: world.tick,
      hashHex: hexHash(hashWorldState(world)),
      entities: world.entities.map(e => ({
        id:      e.id,
        x_m:     Math.round((e.position_m.x / SCALE.m) * 1000) / 1000,
        dead:    e.injury.dead,
        shock_Q: e.injury.shock,
      })),
    });
  }

  const fixture = {
    version:     "conformance/v1",
    id:          "lockstep-sequence-01",
    description: "Stepping the simulation must produce identical entity state at each tick.",
    kind:        "lockstep-sequence",
    notes: [
      "seed=42; 2 entities (lineInfantry AI); 20 ticks.",
      "tractionCoeff = q(0.90) = 9000.",
      "At each tick: verify hashWorldState === hashHex and entity fields match.",
      "x_m values are rounded to 3 decimal places for cross-language comparison.",
      "shock_Q is raw fixed-point (SCALE.Q = 10000); 10000 = 100% shock.",
    ],
    context: {
      tractionCoeff_Q: CTX.tractionCoeff,
    },
    snapshots,
  };

  const out = path.join(CONFORMANCE, "lockstep-sequence.json");
  fs.writeFileSync(out, safeStringify(fixture), "utf8");
  console.log(`✓  conformance/lockstep-sequence.json  (${snapshots.length} snapshots)`);
}

// ── Write conformance/README.md ───────────────────────────────────────────────

function writeReadme() {
  const md = `# Ananke — Conformance Fixtures

Test fixtures for verifying host-SDK determinism.  Any implementation that
passes all fixtures is guaranteed to produce the same simulation state as the
reference TypeScript engine.

## Fixture files

| File | Kind | What it tests |
|------|------|---------------|
| \`state-hash.json\` | \`state-hash\` | \`hashWorldState\` output for a known WorldState |
| \`replay-parity.json\` | \`replay-parity\` | Per-tick hash trace when re-simulating a recorded replay |
| \`command-round-trip.json\` | \`command-round-trip\` | CommandMap wire encoding and field semantics |
| \`bridge-snapshot.json\` | \`bridge-snapshot\` | \`serializeBridgeFrame\` output shape and invariants |
| \`lockstep-sequence.json\` | \`lockstep-sequence\` | Entity positions and shock at each tick of a 20-tick run |

## Running the suite

\`\`\`bash
npm run build
npm run conformance-runner          # TypeScript reference implementation
npm run conformance-runner -- --json  # machine-readable output
\`\`\`

## Integrating from a non-TypeScript host

1. Load the fixture JSON.
2. Reconstruct the initial \`WorldState\` from the fixture's \`input\` section.
3. Step the simulation exactly as described.
4. Compare your output against the \`expected\` / \`snapshots\` / \`hashTrace\` fields.
5. A mismatch means your fixed-point arithmetic or RNG seeding diverges.

## Fixture format version

All fixtures carry \`"version": "conformance/v1"\`.  A breaking change in the
hash algorithm or wire format will bump to \`v2\` with a migration note.

## Regenerating

\`\`\`bash
npm run build && npm run generate-conformance-fixtures
\`\`\`

Re-run after any change to \`hashWorldState\`, \`stepWorld\`, or \`serializeBridgeFrame\`.
`;
  fs.writeFileSync(path.join(CONFORMANCE, "README.md"), md, "utf8");
  console.log(`✓  conformance/README.md`);
}

// ── Run all generators ────────────────────────────────────────────────────────

console.log("\nAnanke — Generating conformance fixtures …\n");
genStateHashFixture();
genReplayParityFixture();
genCommandRoundTripFixture();
genBridgeSnapshotFixture();
genLockstepSequenceFixture();
writeReadme();
console.log(`\nAll fixtures written to conformance/`);
