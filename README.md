# Ananke — Programmer's Guide

![CI](../../actions/workflows/ci.yml/badge.svg)

> **Package:** `@its-not-rocket-science/ananke`
> **Full project overview:** [`docs/project-overview.md`](docs/project-overview.md)

---

## What is Ananke?

Ananke is a **deterministic, physics-grounded simulation engine** for characters, combat,
and survivability.  It models entities using real physical quantities — mass in kg, force
in newtons, energy in joules — rather than abstract hit points or dice rolls.

Same seed + same inputs → identical results, every time.  No floating-point drift.
Suitable for lockstep multiplayer, reproducible research, and offline AI training.

---

## Installation

```bash
npm install @its-not-rocket-science/ananke
```

Requires Node ≥ 18.  ESM-only.  TypeScript declarations included — no `@types/` package
needed.  Zero runtime dependencies.

> **Versioning:** pin to a specific version in production.  The `0.x` series may include
> minor-version breaking changes to Tier 2 (experimental) APIs; Tier 1 (Stable) APIs follow
> full semver.  See [`STABLE_API.md`](STABLE_API.md) for the tier breakdown and
> [`docs/versioning.md`](docs/versioning.md) for the upgrade policy.

---

## Core concepts

### Fixed-point arithmetic

All simulation values use `Q` — a fixed-point integer where `SCALE.Q = 16384` represents
`1.0`.  Never use raw `number` for simulation values; always use `q()` to construct them.

```typescript
import { q, SCALE } from "@its-not-rocket-science/ananke";

const half   = q(0.50);   // 8192  — 50%
const full   = q(1.00);   // 16384 — 100%
const eighty = q(0.80);   // 13107 — 80%

// SI unit scales
SCALE.m;    // 1000  — 1 metre in fixed-point units
SCALE.kg;   // 1000  — 1 kilogram
SCALE.mps;  // 1000  — 1 m/s
SCALE.J;    // 1     — 1 joule (energy is stored at 1:1)
```

You will see values like `position_m: { x: 3000, y: 0, z: 0 }` — that is 3 metres on the
x-axis (`3000 / SCALE.m = 3`).  The `_m`, `_kg`, `_J`, `_s` suffixes on field names tell
you the unit.

### The Entity

An `Entity` is any simulated object.  Required fields at creation:

```typescript
import type { Entity } from "@its-not-rocket-science/ananke";
```

| Field | Type | Meaning |
|---|---|---|
| `id` | `number` | Unique integer; used as RNG salt |
| `teamId` | `number` | Entities attack those on different teams |
| `position_m` | `Vec3` | World-space position in fixed-point metres |
| `attributes` | `IndividualAttributes` | Physical stats (force, power, mass…) |
| `energy` | `{ current_J, max_J }` | Stamina pool in joules |
| `injury` | `InjuryState` | Per-region damage accumulation |
| `condition` | `ConditionSnapshot` | Shock, fear, fatigue |
| `loadout` | `{ items: Item[] }` | Equipped weapons and armour |

Use a factory instead of constructing these manually — see **Quick starts** below.

### The simulation loop

```typescript
import { mkWorld, stepWorld } from "@its-not-rocket-science/ananke";

const world = mkWorld(seed, entities);     // create world with deterministic seed

for (let tick = 0; tick < 2000; tick++) {
  const commands = buildCommands(world);   // your AI / player input
  stepWorld(world, commands, ctx);         // mutates world in-place
}
```

`stepWorld` is the only function that mutates state.  Everything else is pure computation.
Call it at 20 Hz for real-time simulation; 1 Hz or lower for campaign-scale time.

Not sure which entry point to use?  See the **[Recipes Matrix](docs/recipes-matrix.md)** — use case → package → stability → runnable example → performance in one table.

For task-oriented walkthroughs, see the **[Simulation Cookbook](docs/cookbook.md)** — 12 recipes
from "Simulate a duel" to "Load a content pack", each with step-by-step code and expected output.

---

## Quick start A — Melee combat

Two fighters, one fight, three seeds:

```typescript
import {
  mkWorld, stepWorld, generateIndividual, q,
  SCALE, STARTER_WEAPONS, STARTER_ARMOUR,
  buildAICommands, buildWorldIndex, buildSpatialIndex,
  AI_PRESETS,
} from "@its-not-rocket-science/ananke";
import type { Q } from "@its-not-rocket-science/ananke";

const LONGSWORD = STARTER_WEAPONS[2]!;
const LEATHER   = STARTER_ARMOUR[0]!;

function makeEntity(id: number, teamId: number, x_m: number) {
  const e = generateIndividual("KNIGHT_INFANTRY", id, teamId);
  e.position_m = { x: x_m * SCALE.m, y: 0, z: 0 };
  e.loadout    = { items: [LONGSWORD, LEATHER] };
  return e;
}

const policy = AI_PRESETS["lineInfantry"]!;

for (const seed of [1, 42, 99]) {
  const a = makeEntity(1, 1, -2);
  const b = makeEntity(2, 2, +2);
  const world = mkWorld(seed, [a, b]);
  const ctx   = { tractionCoeff: q(0.85) as Q };

  let tick = 0;
  while (tick < 2000 && !a.injury.dead && !b.injury.dead) {
    tick++;
    const idx  = buildWorldIndex(world);
    const spat = buildSpatialIndex(world, 40_000);
    const cmds = buildAICommands(world, idx, spat, () => policy);
    stepWorld(world, cmds, ctx);
  }

  const winner = a.injury.dead ? "B" : b.injury.dead ? "A" : "draw";
  console.log(`seed=${seed}  winner=${winner}  ticks=${tick}`);
}
```

### Reading injury state

```typescript
for (const [region, inj] of Object.entries(entity.injury.regions)) {
  const pct = (inj.surfaceDamage / SCALE.Q * 100).toFixed(0);
  if (inj.surfaceDamage > 0)
    console.log(`  ${region}: ${pct}% surface damage${inj.infected ? " [infected]" : ""}`);
}
console.log(`  dead:  ${entity.injury.dead}`);
console.log(`  shock: ${(entity.condition.shockQ / SCALE.Q * 100).toFixed(0)}%`);
```

### Using the narrative layer

```typescript
import {
  CollectingTrace, renderChronicle,
} from "@its-not-rocket-science/ananke";

const trace = new CollectingTrace();
stepWorld(world, commands, { ...ctx, trace });

const log = renderChronicle(trace.events, world.entities, { verbosity: "normal" });
console.log(log);
// → "Knight strikes Brawler in the torso for 340 J. Brawler staggers."
```

---

## Quick start B — Campaign and world simulation

Advance two polities through 90 days with tech diffusion and emotional contagion:

```typescript
import {
  createPolityRegistry, stepPolityDay,
  applyEmotionalContagion, stepTechDiffusion,
  createEmotionalWave, FEAR_WAVE, q, SCALE,
} from "@its-not-rocket-science/ananke";

const WORLD_SEED = 1;

const registry = createPolityRegistry([
  { id: 1, name: "Ironhold", population: 50_000, techEra: 2, moraleQ: q(0.70) /* ... */ },
  { id: 2, name: "Ashfeld",  population: 30_000, techEra: 1, moraleQ: q(0.55) /* ... */ },
]);

const pairs = [{ polityA: 1, polityB: 2, routeQuality_Q: q(0.60), atWar: false /* ... */ }];

for (let day = 1; day <= 90; day++) {
  stepPolityDay(registry, WORLD_SEED, day);
  stepTechDiffusion(registry, pairs, WORLD_SEED, day);
  applyEmotionalContagion(registry, [createEmotionalWave(FEAR_WAVE, 1)], pairs);
}

for (const p of registry.polities) {
  console.log(`${p.name}: pop=${p.population}  era=${p.techEra}  morale=${(p.moraleQ / SCALE.Q).toFixed(2)}`);
}
```

---

## Quick start C — Species and character generation

Generate individuals from a body-plan archetype, apply aging, and describe them:

```typescript
import {
  generateIndividual, applyAgingToAttributes,
  describeCharacter, formatCharacterSheet,
} from "@its-not-rocket-science/ananke";

// Generate a 45-year-old knight
const base = generateIndividual("KNIGHT_INFANTRY", 1, 1);
const aged = applyAgingToAttributes(base.attributes, 45);

console.log(formatCharacterSheet({ ...base, attributes: aged }));
// → Strength: 1840 N  [above average]
//   Reaction: 0.21 s  [average]
//   ...

// Fantasy species
const elf = generateIndividual("ELF_ARCHER", 2, 2);
console.log(describeCharacter(elf));
```

Available built-in archetypes: `KNIGHT_INFANTRY`, `PRO_BOXER`, `GRECO_WRESTLER`,
`AMATEUR_BOXER`, `LARGE_PACIFIC_OCTOPUS`, and all species defined in
[`src/species.ts`](src/species.ts) — humans, elves, dwarves, orcs, dragons,
Vulcans, Klingons, and more.

---

## The command system

`stepWorld` takes a `CommandMap` — a `Map<entityId, EntityCommand>`.  You build it
manually, from your AI layer, or from the built-in AI system:

```typescript
import type { EntityCommand } from "@its-not-rocket-science/ananke";

// Attack
const commands = new Map<number, EntityCommand>([
  [entityId, { kind: "attack", targetId: opponentId, weapon: LONGSWORD }],
]);

// Move to a position
commands.set(entityId, {
  kind:        "move",
  destination: { x: 5 * SCALE.m, y: 0, z: 0 },
});

// Treat a wounded ally
commands.set(medicId, {
  kind:     "treat",
  targetId: woundedId,
  schedule: { care: "field_surgery", equipmentTier: 2 },
});
```

Valid `kind` values: `"attack"`, `"move"`, `"grapple"`, `"treat"`, `"use_capability"`,
`"signal"`, `"idle"`.

---

## Determinism

Ananke guarantees that `mkWorld(seed, entities)` followed by identical commands produces
identical `WorldState` at every tick, regardless of platform, JS engine, or execution time.

**Rules to preserve determinism in your host:**

1. Never use `Math.random()` — use `makeRng(eventSeed(...))` from the package instead
2. Iterate `world.entities` in insertion order (it is a stable array, not a Map)
3. Keep entity `id` values stable across ticks — IDs are used as RNG salts
4. Do not rely on wall-clock time inside the simulation loop

```typescript
import { makeRng, eventSeed } from "@its-not-rocket-science/ananke";

// Deterministic RNG inside your AI or event code:
const rng  = makeRng(eventSeed(world.seed, world.tick, entityId, 0, 42));
const roll = rng();  // float in [0, 1) — deterministic from inputs
```

---

## Replay and serialisation

```typescript
import {
  ReplayRecorder, serializeReplay, deserializeReplay, replayTo,
} from "@its-not-rocket-science/ananke";

// Record
const recorder = new ReplayRecorder();
for (let tick = 0; tick < N; tick++) {
  const cmds = buildCommands(world);
  recorder.record(tick, cmds);
  stepWorld(world, cmds, ctx);
}
const json = serializeReplay(recorder.replay);  // stable JSON string

// Replay to any tick
const replay = deserializeReplay(json);
const state  = replayTo(replay, initialWorld, targetTick, ctx);
```

---

## 3D renderer bridge

Extract per-segment pose data for driving a humanoid rig at renderer frame rate:

```typescript
import {
  extractRigSnapshots, deriveAnimationHints, BridgeEngine,
} from "@its-not-rocket-science/ananke";

// Per-tick: get bone transforms
const snapshots = extractRigSnapshots(world.entities, bodyPlan);
// snapshots[entityId] → RigSnapshot { segments: Map<segmentId, { position_m, rotation }> }

// Per-tick: get animation state machine hints
const hints = deriveAnimationHints(entity);
// hints → { idle, walk, run, attacking, prone, unconscious, dead, shockQ, fearQ, ... }

// Or use BridgeEngine for double-buffered interpolation at renderer frame rate:
const bridge = new BridgeEngine(config);
bridge.writeSimFrame(world.tick, world.entities);
const interp = bridge.readInterpolated(rendererTimestamp);
```

See [`docs/bridge-contract.md`](docs/bridge-contract.md) for the full double-buffer
protocol and `AnimationHints` field-by-field contract.

---

## API stability tiers

| Tier | Guarantee | Examples |
|------|-----------|---------|
| **Tier 1 — Stable** | Breaking changes require major semver bump + migration guide | `stepWorld`, `generateIndividual`, `Entity`, `q`, `SCALE`, bridge module |
| **Tier 2 — Experimental** | May change in minor versions; CHANGELOG will note it | Campaign, polity, dialogue, faction, quest subsystems |
| **Tier 3 — Internal** | No stability guarantee; may change at any time | `makeRng`, `eventSeed`, kernel tuning constants, `mkHumanoidEntity` |

Full tier table: [`STABLE_API.md`](STABLE_API.md)

---

## TypeScript

The package ships full `.d.ts` declarations.  Key types to know:

```typescript
import type {
  Entity,               // the simulated object
  WorldState,           // world.entities + world.tick + world.seed
  KernelContext,        // tractionCoeff, weather, etc. — passed to stepWorld
  EntityCommand,        // what an entity does this tick
  IndividualAttributes, // physical stats (SI units)
  InjuryState,          // per-region damage
  ConditionSnapshot,    // shock, fear, fatigue
  Q,                    // fixed-point number alias (just `number` at runtime)
  Vec3,                 // { x, y, z } in fixed-point metres
} from "@its-not-rocket-science/ananke";
```

`Q` is a nominal alias for `number` — it carries no runtime overhead, but the `q()`
constructor and `SCALE` constants make the intent clear in every formula.

---

## Performance guidance

| Scenario | Recommended tick rate | Practical entity cap |
|---|---|---|
| Duel / 1v1 | 20 Hz | Unlimited |
| Skirmish (squads) | 20 Hz | ~300 |
| Battle (formations) | 10 Hz | ~500 |
| Siege / campaign | 1 Hz | ~1 000 |
| World simulation | 0.01 Hz (once/day) | ~10 000 |

Enable `buildSpatialIndex` when entities exceed ~50 and distances matter.  Disable
expensive subsystems (disease O(n²) spread, thermoregulation) at high entity counts
unless required.

Full benchmark methodology and operational guide: [`docs/performance.md`](docs/performance.md)

---

## Validation and trust

Ananke's outputs are validated against historical and experimental sources:

- **Isolated sub-system validation** — compares physical constants against sport-science
  and biomechanics datasets: `npm run run:validation`
- **Emergent validation** — four historical combat scenarios (du Picq, Keegan, Lanchester,
  Raudzens) across 100 seeds each: `npm run run:emergent-validation`
- **Pinned baseline** — committed result summaries that CI guards against regression:
  [`docs/emergent-validation-report.md`](docs/emergent-validation-report.md)

---

## Further reading

| Document | What's in it |
|---|---|
| [`docs/recipes-matrix.md`](docs/recipes-matrix.md) | **Start here** — use case → package → stability → example → performance in one table |
| [`docs/cookbook.md`](docs/cookbook.md) | Task-oriented recipes — duel, 500-agent battle, species, renderer, campaign, replay, and more |
| [`corpus/README.md`](corpus/README.md) | Scenario corpus — 5 canonical deterministic scenarios (tutorial, benchmark, validation, networking, bridge); run `npm run verify-corpus` |
| [`docs/module-index.md`](docs/module-index.md) | All 41 entry points — stability tier, use case, key exports, doc links |
| [`docs/host-contract.md`](docs/host-contract.md) | Stable integration surface — everything needed to embed Ananke without reading `src/` |
| [`docs/integration-primer.md`](docs/integration-primer.md) | Data-flow diagrams, type glossary, gotchas |
| [`docs/bridge-contract.md`](docs/bridge-contract.md) | 3D renderer bridge protocol (AnimationHints, GrapplePoseConstraint) |
| [`STABLE_API.md`](STABLE_API.md) | Full tier table for every export |
| [`docs/versioning.md`](docs/versioning.md) | Semver policy, breaking-change tiers, upgrade cadence |
| [`docs/performance.md`](docs/performance.md) | Benchmark results, operational guide, entity caps |
| [`docs/emergent-validation-report.md`](docs/emergent-validation-report.md) | Historical scenario validation report |
| [`docs/project-overview.md`](docs/project-overview.md) | Full project overview — implementation status, entity model reference, design principles, architecture |
