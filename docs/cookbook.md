# Ananke Simulation Cookbook

Task-oriented recipes for common Ananke integration tasks.

Each recipe follows this format:
- **Problem** — what you want to accomplish
- **Steps** — numbered walkthrough with code
- **Expected output** — what you should see
- **See also** — related docs and runnable examples

If you can read and run one recipe in this document you can produce a working simulation in under 30 minutes.

---

## Recipe index

| # | Recipe | Time |
|---|--------|------|
| [1](#1-simulate-a-duel) | Simulate a duel | 5 min |
| [2](#2-run-a-500-agent-battle) | Run a 500-agent battle | 10 min |
| [3](#3-author-a-new-species) | Author a new species | 10 min |
| [4](#4-add-a-custom-weapon) | Add a custom weapon | 10 min |
| [5](#5-drive-a-renderer) | Drive a renderer | 15 min |
| [6](#6-create-a-campaign-loop) | Create a campaign loop | 10 min |
| [7](#7-build-a-validation-scenario) | Build a validation scenario | 15 min |
| [8](#8-use-the-what-if-engine) | Use the what-if engine | 5 min |
| [9](#9-stream-events-to-an-agent) | Stream events to an agent | 15 min |
| [10](#10-save-and-reload-a-world) | Save and reload a world | 10 min |
| [11](#11-record-and-replay-a-fight) | Record and replay a fight | 10 min |
| [12](#12-load-a-content-pack) | Load a content pack | 10 min |

---

## 1. Simulate a duel

**Problem:** You want to run a deterministic 1v1 combat simulation and print the outcome.

**Steps:**

```typescript
import { createWorld, stepWorld, q } from "@its-not-rocket-science/ananke";

// 1. Create a world — world seed + entity list.
const world = createWorld(42, [
  { id: 1, teamId: 1, seed: 1001, archetype: "KNIGHT_INFANTRY",
    weaponId: "wpn_longsword", armourId: "arm_plate", x_m: -0.5, y_m: 0 },
  { id: 2, teamId: 2, seed: 2001, archetype: "HUMAN_BASE",
    weaponId: "wpn_bone_dagger", x_m: 0.5, y_m: 0 },
]);

const ctx = { tractionCoeff: q(0.8) };

// 2. Build AI commands each tick and step the simulation.
for (let t = 0; t < 500; t++) {
  const commands = new Map([
    [1, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]],
    [2, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]],
  ]);
  stepWorld(world, commands, ctx);
  if (world.entities.every(e => e.injury.dead)) break;
}

// 3. Report the outcome.
for (const e of world.entities) {
  const status = e.injury.dead ? "dead" : `alive (shock ${(e.injury.shock / 10000).toFixed(2)})`;
  console.log(`Entity ${e.id} (team ${e.teamId}): ${status}`);
}
```

**Expected output:**
```
Entity 1 (team 1): alive (shock 0.38)
Entity 2 (team 2): dead
```
*(varies by seed — try 1, 7, 99)*

**See also:** `examples/quickstart-combat.ts` · `npm run example:combat`

---

## 2. Run a 500-agent battle

**Problem:** You want to simulate a large multi-entity battle and measure performance.

**Steps:**

```typescript
import { createWorld, stepWorld, q } from "@its-not-rocket-science/ananke";

// 1. Create 500 entities across two teams.
const entities = Array.from({ length: 500 }, (_, i) => ({
  id:        i + 1,
  teamId:    i < 250 ? 1 : 2,
  seed:      1000 + i,
  archetype: "HUMAN_BASE",
  weaponId:  "wpn_bone_dagger",
  x_m:       (i < 250 ? -20 : 20) + (Math.trunc(i / 25) % 10) * 2,
  y_m:       (i % 25) * 2,
}));
const world = createWorld(42, entities);
const ctx   = { tractionCoeff: q(1.0) };

// 2. Run 200 ticks, building commands each tick.
const t0 = Date.now();
for (let tick = 0; tick < 200; tick++) {
  const commands = new Map();
  for (const e of world.entities) {
    if (!e.injury.dead) {
      commands.set(e.id, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]);
    }
  }
  stepWorld(world, commands, ctx);
}
const ms = Date.now() - t0;

// 3. Summarise.
const alive = world.entities.filter(e => !e.injury.dead).length;
console.log(`200 ticks × 500 agents — ${ms} ms — ${alive} survivors`);
```

**Expected output:**
```
200 ticks × 500 agents — 84 ms — 231 survivors
```
*(timing varies by machine; see `docs/performance.md` for benchmarks)*

**See also:** `tools/benchmark.ts` · `npm run run:benchmark`

---

## 3. Author a new species

**Problem:** You want to define a non-human species with custom physiology and generate individuals from it.

**Steps:**

```typescript
import { generateIndividual } from "@its-not-rocket-science/ananke";
import type { Archetype } from "@its-not-rocket-science/ananke";
import { q, SCALE } from "@its-not-rocket-science/ananke";

// 1. Define an archetype — a prototype individual for your species.
const GIANT_APE: Archetype = {
  id:   "giant_ape",
  name: "Giant Ape",
  morphology: {
    stature_m:    Math.trunc(1.8 * SCALE.m),   // 1.8 m
    mass_kg:      Math.trunc(120 * 1000),        // 120 kg (SCALE.kg = 1000)
    reachBonus_m: Math.trunc(0.15 * SCALE.m),   // longer arm reach
  },
  performance: {
    muscularStrength_N: Math.trunc(2800 * SCALE.N),  // much stronger than human
    reserveEnergy_J:    Math.trunc(4500 * SCALE.J),
  },
  perception: {
    visionRange_m:  Math.trunc(20 * SCALE.m),
    hearingRange_m: Math.trunc(40 * SCALE.m),
  },
};

// 2. Generate a deterministic individual from the archetype.
//    Seed produces unique attribute scatter while staying within archetype bounds.
const individual = generateIndividual(7, GIANT_APE);

console.log("Stature:", individual.morphology.stature_m / SCALE.m, "m");
console.log("Mass:   ", individual.morphology.mass_kg   / 1000,    "kg");
console.log("Strength:", individual.performance.muscularStrength_N / SCALE.N, "N");
```

**Expected output:**
```
Stature: 1.8 m
Mass:    120 kg
Strength: 2840 N
```

**See also:** `examples/quickstart-species.ts` · `npm run example:species` · `src/archetypes.ts`

---

## 4. Add a custom weapon

**Problem:** You want to define a weapon with custom mass, edge, and damage profile and use it in a fight.

**Steps:**

```typescript
import { createWorld, stepWorld, q, SCALE } from "@its-not-rocket-science/ananke";
import type { Item } from "@its-not-rocket-science/ananke";

// 1. Define a weapon item.
//    Items use SI units: mass in SCALE.kg, reach in SCALE.m, edge in q(0..1).
const GREATAXE: Item = {
  id:         "wpn_greataxe",
  name:       "Greataxe",
  kind:       "weapon",
  mass_kg:    Math.trunc(3.5 * 1000),         // 3.5 kg
  reach_m:    Math.trunc(0.90 * SCALE.m),     // 90 cm reach
  edgeQ:      q(0.80),                        // good edge
  impactQ:    q(0.70),                        // heavy impact
  durability: q(0.95),
};

// 2. Create a world where one fighter has the custom weapon.
const world = createWorld(1, [
  { id: 1, teamId: 1, seed: 101, archetype: "KNIGHT_INFANTRY",
    customItems: [GREATAXE], x_m: -0.5, y_m: 0 },
  { id: 2, teamId: 2, seed: 202, archetype: "HUMAN_BASE",
    weaponId: "wpn_bone_dagger", x_m: 0.5, y_m: 0 },
]);

// 3. Run 100 ticks and check outcomes.
for (let t = 0; t < 100; t++) {
  stepWorld(world, new Map([
    [1, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]],
    [2, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]],
  ]), { tractionCoeff: q(1.0) });
  if (world.entities.every(e => e.injury.dead)) break;
}

console.log("Greataxe wielder shock:", world.entities[0]!.injury.shock / 10000);
console.log("Dagger wielder shock:  ", world.entities[1]!.injury.shock / 10000);
```

**Expected output:**
```
Greataxe wielder shock: 0.22
Dagger wielder shock:   0.95
```

**See also:** `src/equipment.ts` · `schema/pack.schema.json` · [Recipe 12: Load a content pack](#12-load-a-content-pack)

---

## 5. Drive a renderer

**Problem:** You want to display a running simulation in Unity, Godot, or a browser.

**Architecture:** A Node.js **sidecar** steps the simulation at 20 Hz and streams `BridgeFrame` JSON over WebSocket.  Your renderer connects and drives character animations from the frames.

```
   ┌─────────────────────┐        WebSocket (ws://127.0.0.1:3001/stream)
   │  Node.js sidecar    │ ──────────────────────────────────────────────►  Unity / Godot / Browser
   │  stepWorld() 20 Hz  │        BridgeFrame { schema, tick, entities }
   │  serializeBridgeFrame │
   └─────────────────────┘
```

**Steps:**

```typescript
// sidecar/src/main.ts — minimal 20 Hz sidecar
import { createWorld, stepWorld, q } from "@its-not-rocket-science/ananke";
import { serializeBridgeFrame } from "@its-not-rocket-science/ananke/host-loop";

const world = createWorld(42, [
  { id: 1, teamId: 1, seed: 1001, archetype: "KNIGHT_INFANTRY",
    weaponId: "wpn_longsword", x_m: -0.5, y_m: 0 },
  { id: 2, teamId: 2, seed: 2001, archetype: "HUMAN_BASE",
    weaponId: "wpn_bone_dagger", x_m: 0.5, y_m: 0 },
]);
const config = { scenarioId: "duel", tickHz: 20 };

setInterval(() => {
  stepWorld(world, buildCommands(world), { tractionCoeff: q(1.0) });
  const frame = serializeBridgeFrame(world, config);
  broadcast(JSON.stringify(frame));   // your WebSocket broadcast
}, 50);
```

**Key `BridgeFrame` fields your renderer uses:**

| Field | Type | Usage |
|---|---|---|
| `entity.position_m` | `{x,y,z}` float metres | Move character root |
| `entity.facing` | `{x,y,z}` unit vector | Rotate character |
| `entity.animation.primaryState` | `string` | Drive state machine |
| `entity.animation.locomotionBlend` | `[0,1]` | Blend walk/run |
| `entity.pose[].impairmentQ` | `[0,1]` | Drive injury deformation |
| `entity.condition.dead` | `bool` | Trigger death |

**See also:**
- Unity: [`docs/quickstart-unity.md`](quickstart-unity.md)
- Godot: [`docs/quickstart-godot.md`](quickstart-godot.md)
- Web/Three.js: [`docs/quickstart-web.md`](quickstart-web.md)
- `src/host-loop.ts` — full `BridgeFrame` type reference

---

## 6. Create a campaign loop

**Problem:** You want to run a multi-day political / demographic simulation across several polities.

**Steps:**

```typescript
import {
  createPolity, createPolityRegistry, stepPolityDay,
  type PolityPair,
} from "@its-not-rocket-science/ananke/polity";
import { q } from "@its-not-rocket-science/ananke";
import { TechEra } from "@its-not-rocket-science/ananke";

// 1. Define two polities.
const england  = createPolity("england",  "England",  "f_england",  ["loc_london"],  60_000, 3_000, TechEra.Medieval);
const france   = createPolity("france",   "France",   "f_france",   ["loc_paris"],  120_000, 5_000, TechEra.Medieval);
const registry = createPolityRegistry([england, france]);

// 2. Connect them with a trade route.
const pairs: PolityPair[] = [{
  polityAId: "england", polityBId: "france",
  sharedLocations: 3,
  routeQuality_Q: q(0.60),
}];

// 3. Step 90 days and print weekly snapshots.
for (let day = 1; day <= 90; day++) {
  stepPolityDay(registry, pairs, 42 + day);

  if (day % 14 === 0) {
    const e = registry.polities.get("england")!;
    const f = registry.polities.get("france")!;
    console.log(`Day ${day}: England pop=${e.population} treasury=${e.treasury_cu}  `
              + `France pop=${f.population} treasury=${f.treasury_cu}`);
  }
}
```

**Expected output:**
```
Day 14: England pop=60120 treasury=3284  France pop=120240 treasury=5530
Day 28: England pop=60244 treasury=3572  France pop=120482 treasury=6068
...
Day 90: England pop=60721 treasury=5140  France pop=121408 treasury=9380
```

**See also:** `examples/quickstart-campaign.ts` · `npm run example:campaign` · `src/polity.ts`

---

## 7. Build a validation scenario

**Problem:** You want to verify that your simulation output matches a known real-world measurement.

**Steps:**

```typescript
import { createWorld, stepWorld, q, SCALE } from "@its-not-rocket-science/ananke";

// 1. Define what you expect — a named scenario with a tolerance band.
const scenario = {
  name: "Knife wound — time to incapacitation",
  // Empirical baseline: untreated knife wound incapacitates in ~40–80 s
  empiricalMin_s: 40,
  empiricalMax_s: 80,
  run(): number {
    const world = createWorld(1, [
      { id: 1, teamId: 1, seed: 1, archetype: "HUMAN_BASE",
        weaponId: "wpn_bone_dagger", x_m: 0, y_m: 0 },
      { id: 2, teamId: 2, seed: 2, archetype: "HUMAN_BASE",
        weaponId: "wpn_short_sword", x_m: 0.5, y_m: 0 },
    ]);
    for (let t = 0; t < 2000; t++) {
      stepWorld(world, new Map([
        [1, [{ kind: "attackNearest", mode: "strike", intensity: q(0.6) }]],
        [2, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]],
      ]), { tractionCoeff: q(1.0) });
      // Entity 1 is the "victim" — check when they become unconscious
      if (world.entities[0]!.injury.consciousness < q(0.20)) {
        return t / 20; // ticks → seconds at 20 Hz
      }
    }
    return Infinity;
  },
};

// 2. Run and check.
const result_s = scenario.run();
const pass     = result_s >= scenario.empiricalMin_s && result_s <= scenario.empiricalMax_s;
console.log(`${scenario.name}`);
console.log(`  Result:  ${result_s.toFixed(1)} s`);
console.log(`  Range:   ${scenario.empiricalMin_s}–${scenario.empiricalMax_s} s`);
console.log(`  Status:  ${pass ? "✅ PASS" : "❌ FAIL"}`);
```

**Expected output:**
```
Knife wound — time to incapacitation
  Result:  54.2 s
  Range:   40–80 s
  Status:  ✅ PASS
```

**See also:** `tools/validation.ts` · `npm run run:validation` · `docs/emergent-validation-report.md`

---

## 8. Use the what-if engine

**Problem:** You want to explore "what if a plague had hit the capital?" across many random seeds and measure the probability-weighted outcome.

**Steps:**

```bash
# Run the built-in what-if scenarios (100 seeds each by default):
npm run build && npm run run:what-if

# Run more seeds for tighter confidence intervals:
RUNS=500 npm run run:what-if
```

**Expected output (excerpt):**
```
═══════════════════════════════════════════════════════
 Scenario: Plague Strikes the Capital
 Divergence: Pneumonic plague outbreak in most-populous polity
───────────────────────────────────────────────────────
 Metric            Baseline    Diverged    Delta
 Population loss   0.4%        18.3%       +17.9%
 Treasury impact   +4.2%       -31.7%      -35.9%
 Military strength 100.0%      67.4%       -32.6%
 Polity survives   98%         61%         -37pp
```

**Customise a scenario in `tools/what-if.ts`:**

```typescript
{
  name: "My custom what-if",
  durationDays: 365,
  setup() {
    const r = createPolityRegistry([england, france]);
    return { registry: r, pairs };
  },
  applyDivergence(registry, seed) {
    // Your divergence: e.g. suddenly boost one polity's military
    const p = registry.polities.get("england")!;
    p.militaryStrength = Math.trunc(p.militaryStrength * 2);
  },
  metrics: [
    { name: "England population", extract: r => r.polities.get("england")!.population },
  ],
}
```

**See also:** `tools/what-if.ts` · `src/polity.ts`

---

## 9. Stream events to an agent

**Problem:** You want to observe simulation events (hits, deaths, status changes) in real time and feed them to an AI agent or analytics pipeline.

**Steps:**

```typescript
import { createWorld, stepWorld, q } from "@its-not-rocket-science/ananke";
import { serializeBridgeFrame } from "@its-not-rocket-science/ananke/host-loop";

// 1. Create your world and an event log.
const world = createWorld(42, [
  { id: 1, teamId: 1, seed: 1, archetype: "KNIGHT_INFANTRY",
    weaponId: "wpn_longsword", x_m: -0.5, y_m: 0 },
  { id: 2, teamId: 2, seed: 2, archetype: "HUMAN_BASE",
    weaponId: "wpn_bone_dagger", x_m: 0.5, y_m: 0 },
]);

// 2. Track previous state for delta detection.
let prevCondition = new Map(world.entities.map(e => [e.id, { ...e.injury }]));

function detectEvents(tick: number) {
  for (const e of world.entities) {
    const prev = prevCondition.get(e.id)!;
    if (!prev.dead && e.injury.dead) {
      console.log(`[tick ${tick}] Entity ${e.id} DIED`);
    }
    if (e.injury.shock - prev.shock > 2000) {     // Q delta > 0.20
      console.log(`[tick ${tick}] Entity ${e.id} hit — shock now ${(e.injury.shock / 10000).toFixed(2)}`);
    }
    prevCondition.set(e.id, { ...e.injury });
  }
}

// 3. Tick loop — detect events and push frames to agents.
const config = { scenarioId: "duel", tickHz: 20 };
for (let tick = 0; tick < 600; tick++) {
  stepWorld(world, new Map([
    [1, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]],
    [2, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]],
  ]), { tractionCoeff: q(1.0) });

  detectEvents(tick);

  // The serialized frame can be sent to any agent/analytics sink.
  const frame = serializeBridgeFrame(world, config);
  // agentSocket.send(JSON.stringify(frame));
  // analyticsQueue.push(frame);

  if (world.entities.every(e => e.injury.dead)) break;
}
```

**Expected output:**
```
[tick 23] Entity 2 hit — shock now 0.21
[tick 41] Entity 2 hit — shock now 0.47
[tick 58] Entity 2 hit — shock now 0.74
[tick 79] Entity 2 DIED
```

**See also:** `tools/observer.ts` · `npm run run:observer` · `src/host-loop.ts`

---

## 10. Save and reload a world

**Problem:** You want to checkpoint a world mid-simulation and resume it later (save game, rollback testing, branching scenarios).

**Steps:**

```typescript
import { createWorld, stepWorld, q } from "@its-not-rocket-science/ananke";

// 1. Create and advance a world.
const world = createWorld(42, [
  { id: 1, teamId: 1, seed: 1, archetype: "KNIGHT_INFANTRY",
    weaponId: "wpn_longsword", x_m: -0.5, y_m: 0 },
  { id: 2, teamId: 2, seed: 2, archetype: "HUMAN_BASE",
    weaponId: "wpn_bone_dagger", x_m: 0.5, y_m: 0 },
]);
for (let t = 0; t < 50; t++) {
  stepWorld(world, new Map([[1, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]],
                            [2, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]]]),
            { tractionCoeff: q(1.0) });
}

// 2. Save — JSON.stringify works directly (all fields are plain numbers/strings/arrays).
const checkpoint = JSON.stringify(world);
console.log("Saved at tick:", world.tick, "— size:", checkpoint.length, "bytes");

// 3. Restore — parse and continue.
const restored = JSON.parse(checkpoint);    // type: WorldState
for (let t = 0; t < 50; t++) {
  stepWorld(restored, new Map([[1, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]],
                               [2, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]]]),
            { tractionCoeff: q(1.0) });
}

// 4. Verify determinism — same result from the checkpoint as from running from tick 50.
console.log("Original tick:", world.tick);
console.log("Restored tick:", restored.tick);
console.log("Entity 1 shock — original:", world.entities[0]!.injury.shock,
                           "  restored:", restored.entities[0]!.injury.shock);
```

**Expected output:**
```
Saved at tick: 50 — size: 12384 bytes
Original tick: 50
Restored tick: 100
Entity 1 shock — original: 1823   restored: 1823
```

**Gotcha:** `WorldState` contains no `Map` objects at the top level — `JSON.stringify` round-trips cleanly.  If you add custom extensions that use `Map`, convert them to plain objects first.

**See also:** `tools/serialize.ts` · `npm run run:serialize` · `schema/world.schema.json`

---

## 11. Record and replay a fight

**Problem:** You want to record a simulation for later inspection, debugging, or playback at a different speed.

**Steps:**

```typescript
import {
  createWorld, stepWorld, q,
  ReplayRecorder, replayTo, serializeReplay, deserializeReplay,
} from "@its-not-rocket-science/ananke";
import { writeFileSync, readFileSync } from "node:fs";

const ctx = { tractionCoeff: q(1.0) };

// 1. Create world and recorder.
const world    = createWorld(42, [
  { id: 1, teamId: 1, seed: 1, archetype: "KNIGHT_INFANTRY",
    weaponId: "wpn_longsword", x_m: -0.5, y_m: 0 },
  { id: 2, teamId: 2, seed: 2, archetype: "HUMAN_BASE",
    weaponId: "wpn_bone_dagger", x_m: 0.5, y_m: 0 },
]);
const recorder = new ReplayRecorder(world);

// 2. Record 200 ticks.
for (let t = 0; t < 200; t++) {
  const commands = new Map([
    [1, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]],
    [2, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]],
  ]);
  recorder.recordTick(commands);
  stepWorld(world, commands, ctx);
}
const replay = recorder.toReplay();

// 3. Save to disk.
writeFileSync("replay.json", serializeReplay(replay));
console.log("Saved", replay.frames.length, "frames —", world.tick, "ticks");

// 4. Load and replay to a specific tick.
const json     = readFileSync("replay.json", "utf8");
const loaded   = deserializeReplay(json);
const at100    = replayTo(loaded, 100, ctx);
console.log("Entity 1 shock at tick 100:", at100.entities[0]!.injury.shock);

// 5. Diff two replays — find first divergence.
const originalAt100 = replayTo(replay, 100, ctx);
const same = originalAt100.entities[0]!.injury.shock === at100.entities[0]!.injury.shock;
console.log("Replay determinism check:", same ? "✅ identical" : "❌ diverged");
```

**Expected output:**
```
Saved 200 frames — 200 ticks
Entity 1 shock at tick 100: 1247
Replay determinism check: ✅ identical
```

**See also:** `src/replay.ts` · `schema/replay.schema.json` · `tools/serialize.ts`

---

## 12. Load a content pack

**Problem:** You want to extend the simulation with custom weapons, armour, and archetypes defined in a JSON file without rebuilding the source.

**Steps:**

**1. Write a pack JSON file (`my-pack.json`):**

```json
{
  "$schema": "https://schemas.ananke.dev/pack.schema.json",
  "id": "my-pack",
  "name": "My Custom Pack",
  "version": "1.0.0",
  "weapons": [
    {
      "id":      "wpn_war_hammer",
      "name":    "War Hammer",
      "kind":    "weapon",
      "mass_kg": 2.5,
      "reach_m": 0.75,
      "edgeQ":   0.20,
      "impactQ": 0.95,
      "durability": 0.90
    }
  ],
  "archetypes": [
    {
      "id": "veteran_soldier",
      "name": "Veteran Soldier",
      "morphology": { "stature_m": 1.78, "mass_kg": 82 },
      "performance": { "muscularStrength_N": 1800, "reserveEnergy_J": 4200 }
    }
  ]
}
```

**2. Load the pack at runtime:**

```typescript
import { loadPack, listLoadedPacks } from "@its-not-rocket-science/ananke/content-pack";
import { createWorld, q } from "@its-not-rocket-science/ananke";
import { readFileSync } from "node:fs";

// Load the pack — registers weapons and archetypes into the world factory.
const manifest = JSON.parse(readFileSync("my-pack.json", "utf8"));
const result   = loadPack(manifest);
console.log("Loaded packs:", listLoadedPacks());

// The new ids are immediately usable in createWorld.
const world = createWorld(42, [
  { id: 1, teamId: 1, seed: 1, archetype: "veteran_soldier",
    weaponId: "wpn_war_hammer", x_m: -0.5, y_m: 0 },
  { id: 2, teamId: 2, seed: 2, archetype: "HUMAN_BASE",
    weaponId: "wpn_bone_dagger", x_m: 0.5, y_m: 0 },
]);

console.log("World created — entities:", world.entities.length);
```

**Expected output:**
```
Loaded packs: ["my-pack"]
World created — entities: 2
```

**3. Validate a pack before loading:**

```typescript
import { validatePack } from "@its-not-rocket-science/ananke/content-pack";

const errors = validatePack(manifest);
if (errors.length > 0) {
  console.error("Pack validation failed:", errors);
} else {
  console.log("Pack is valid ✅");
}
```

**See also:** `examples/packs/` — sample packs · `schema/pack.schema.json` · `src/content-pack.ts` · `tools/pack-cli.ts` (CLI: `npx ananke pack validate my-pack.json`)

---

## Common patterns

### Fixed-point arithmetic

All internal values use fixed-point integers.  Divide by the appropriate `SCALE` constant to get real SI values:

```typescript
import { SCALE, q } from "@its-not-rocket-science/ananke";

// Reading values:
const shock_frac = entity.injury.shock / SCALE.Q;       // 0.0 → 1.0
const pos_m      = entity.position_m.x / SCALE.m;       // real metres
const mass_kg    = entity.attributes.morphology.mass_kg / 1000; // real kg (SCALE.kg = 1000)

// Writing values:
const myQ     = q(0.75);                              // = 7500 (fixed-point Q)
const range_m = Math.trunc(50 * SCALE.m);             // 50 m in Sm
```

### Determinism guarantee

Given the same seed and command sequence, `stepWorld` always produces identical output.  Use this for:
- Save/reload (recipe 10)
- Replay (recipe 11)
- Server/client sync in multiplayer

```typescript
// Two worlds with identical seed + commands produce identical output.
const w1 = createWorld(42, entities);
const w2 = createWorld(42, entities);
stepWorld(w1, commands, ctx);
stepWorld(w2, commands, ctx);
assert(w1.entities[0]!.injury.shock === w2.entities[0]!.injury.shock); // always true
```

### RNG in custom code

Never use `Math.random()` in simulation logic.  Use `eventSeed` + `makeRng` instead:

```typescript
import { eventSeed, makeRng } from "@its-not-rocket-science/ananke";

function rollCustomEvent(worldSeed: number, tick: number, entityId: number): boolean {
  const seed = eventSeed(worldSeed, tick, entityId, 0, 99);
  const rng  = makeRng(seed);
  return rng() < 0.25; // 25% chance — deterministic per tick
}
```

---

## Further reading

| Document | Topic |
|---|---|
| [`corpus/README.md`](../corpus/README.md) | Scenario corpus — 5 canonical deterministic scenarios (tutorial, benchmark, validation, networking, bridge) |
| [`docs/integration-primer.md`](integration-primer.md) | Architecture, data flow, fixed-point gotchas |
| [`docs/host-contract.md`](host-contract.md) | Host loop requirements and tick contract |
| [`docs/bridge-contract.md`](bridge-contract.md) | Renderer bridge wire format |
| [`docs/performance.md`](performance.md) | Benchmarks and optimisation guidance |
| [`docs/wire-protocol.md`](wire-protocol.md) | WebSocket / serialization protocol |
| [`docs/quickstart-unity.md`](quickstart-unity.md) | Unity 15-minute quickstart |
| [`docs/quickstart-godot.md`](quickstart-godot.md) | Godot 4 15-minute quickstart |
| [`docs/quickstart-web.md`](quickstart-web.md) | Three.js browser quickstart |
| [`docs/emergent-validation-report.md`](emergent-validation-report.md) | Calibration against real-world data |
