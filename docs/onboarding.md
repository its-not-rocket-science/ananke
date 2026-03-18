# Ananke — New Engineer Onboarding

*Integration & Adoption Milestone 5 — Community & Ecosystem Development*

Goal: ship a working prototype that drives Ananke from your host environment within **two weeks**.

---

## Week 1 — Understand the kernel

### Day 1 — Read first, write later

Read these in order:

1. `README.md` — core design principles and current implementation status
2. `docs/integration-primer.md` — architecture overview, data-flow diagram for a melee attack, type glossary, and integration gotchas
3. `src/units.ts` — all scale constants; internalize `SCALE.Q = 10000`, `q()`, `mulDiv()`
4. `src/types.ts` — `Entity`, `WorldState`, `IndividualAttributes`

Run the existing demos to see what a working integration looks like:

```bash
npm install
npm run build
npm run run:trace-attack    # prints every kernel event for one tick of a melee fight
npm run run:observer        # prints entity state after each tick for 5 ticks
npm run run:vertical-slice  # Knight vs Brawler duel to outcome across 3 seeds
```

### Day 2 — Trace a tick end-to-end

Open `tools/trace-attack.ts` and read it alongside `src/kernel.ts`.  Identify:

- Where `CommandMap` is built
- Where `stepWorld` is called
- How the `CollectingTrace` sink captures events
- What fields on `Entity` change between tick N and tick N+1 after an attack lands

Now write your own 10-line script that:
1. Creates two entities with `generateIndividual` and `HUMAN_BASE`
2. Calls `stepWorld` for one tick with a `MeleeAttack` command from entity 1 to entity 2
3. Prints `entity2.injury.torso.shock` before and after

### Day 3 — Build a minimal game loop

```typescript
import { stepWorld } from "ananke/src/kernel.js";
import { WorldState, CommandMap } from "ananke/src/types.js";
import { generateIndividual } from "ananke/src/generate.js";
import { HUMAN_BASE } from "ananke/src/archetypes.js";

const world: WorldState = {
  tick: 0,
  seed: 42,
  entities: [
    makeEntity(1, generateIndividual(1, HUMAN_BASE)),
    makeEntity(2, generateIndividual(2, HUMAN_BASE)),
  ],
};

for (let i = 0; i < 100; i++) {
  const commands: CommandMap = buildYourCommands(world);
  stepWorld(world, commands, {});
}
```

The kernel mutates `world` in place.  After each tick, read back `world.entities` to observe
the updated state.

### Day 4 — Understand fixed-point arithmetic

Every numeric attribute is a fixed-point integer, not a float.  Failing to account for this
is the most common source of off-by-many-orders-of-magnitude bugs.

```typescript
import { SCALE, q, qMul, mulDiv } from "ananke/src/units.js";

// Physical: entity has peak force of 1.84 kN
// Stored:   peakForce_N = 1840  (1840 * SCALE.N / SCALE.N = 1840 N; SCALE.N = 1000)

// Physical: entity is moving at 2.5 m/s
// Stored:   velocity_mps = 25000  (25000 / SCALE.mps = 2.5 m/s; SCALE.mps = 10000)

// Multiply two Q fractions: q(0.80) * q(0.90) = q(0.72)
const result: Q = qMul(q(0.80), q(0.90));
// result = 7200 = q(0.72) ✓

// Scale an integer by a Q fraction: 80 kg at 75% efficiency
const effective_kg = mulDiv(80_000, q(0.75), SCALE.Q);
// = Math.trunc(80000 * 7500 / 10000) = 60000 → 60 kg ✓
```

Reference: `docs/integration-primer.md` §5 "Type glossary and gotchas".

### Day 5 — Read the body plan and archetype systems

```bash
# How body plans work
cat src/sim/bodyplan.ts | head -100

# How an archetype is defined
grep -A 30 "export const HUMAN_BASE" src/archetypes.ts

# How an individual is generated from an archetype
cat src/generate.ts
```

Key insight: `generateIndividual(seed, archetype)` produces a deterministic `IndividualAttributes`
from a uint32 seed.  The same seed + archetype always produces the same individual.  Use
this to create reproducible test characters.

---

## Week 2 — Build your prototype

### Day 6 — Connect your renderer (if applicable)

Read `docs/bridge-api.md`.  The bridge module (`src/bridge/`) provides:

- `extractRigSnapshots(entity)` — per-segment position/rotation/blend-weight data
- `derivePoseModifiers(entity)` — lean, crouch, and aim-direction hints
- `deriveGrappleConstraint(pair)` — IK constraint data for grappling animations
- `deriveAnimationHints(entity)` — high-level state flags (attacking, fleeing, prone, etc.)

Run the demo:

```bash
npm run run:bridge-demo
```

The bridge outputs JSON that maps directly onto a hypothetical renderer's per-bone API.  Adapt
the output format to your engine's skeleton and animation system.

### Day 7 — Serialisation and save/load

Run:

```bash
npm run run:serialize
```

Read `tools/serialize.ts` to understand the Map → array round-trip pattern:

```typescript
// WorldState contains Map fields that don't survive JSON.stringify directly.
// Use the helper:
import { serializeWorldState, deserializeWorldState } from "ananke/src/campaign.js";

const json = JSON.stringify(serializeWorldState(world));
const restored = deserializeWorldState(JSON.parse(json));
```

`Map<number, V>` fields are serialised as `[number, V][]` arrays.  BigInt fields (none in the
current kernel, but check your version) require a custom replacer/reviver.

### Day 8 — Narrative and character sheets

For UI integration:

```typescript
import { formatCharacterSheet, formatOneLine } from "ananke/src/describe.ts";
import { generateCombatNarrative } from "ananke/src/narrative.ts";

// One-line summary for a unit card:
// "A powerful, quick fighter with high pain tolerance."
console.log(formatOneLine(entity.attributes));

// Full character sheet with tier labels:
console.log(formatCharacterSheet(entity.attributes));

// Human-readable combat log from a trace event array:
const log = generateCombatNarrative(traceEvents, { verbosity: "normal" });
```

### Day 9 — Validation and tuning

Run the validation suite to confirm your configuration matches real-world benchmarks:

```bash
npm run run:validation
```

If a scenario fails, check the generated report in `docs/validation-<scenario>-<timestamp>.md`
for the direction and magnitude of the deviation.  Adjust `TUNING` constants in
`src/sim/tuning.ts` and re-run.  See `docs/integration-primer.md` §6 for a worked tuning
example.

### Day 10 — Your first vertical slice

Assemble the pieces into a minimal playable loop:

1. Generate two characters (`generateIndividual`) with archetypes appropriate to your game
2. Place them in a `WorldState` with positions 2 m apart
3. Run `stepWorld` until one entity's `injury.consciousness_Q < q(0.10)` or 30 seconds of
   sim time have elapsed (600 ticks at 20 Hz)
4. Print the narrative log and the winner's remaining `injury.shock`

This is exactly what `tools/vertical-slice.ts` does — read it as a reference.

---

## Common pitfalls (quick reference)

| Symptom | Likely cause |
|---------|--------------|
| Entities never move | `velocity_mps` is in fixed-point — a value of `1` is 0.0001 m/s, not 1 m/s |
| Damage seems too small | Energy passed as raw joules not scaled by `SCALE.J` |
| RNG produces same sequence every tick | Using `Math.random()` instead of `makeRng(eventSeed(...))` |
| TypeScript error on optional field | `exactOptionalPropertyTypes` is on — use conditional spread, not `field: undefined` |
| Snapshot test breaks | A generation constant changed — delete and regenerate the snapshot |
| `stepWorld` gives different results in two environments | Float arithmetic leaked into the sim path |
| Coverage drops below threshold | A new function is untested — add at least one test per export |

For a deeper catalogue, see `docs/integration-primer.md` §7 "Integration gotchas".

---

## Key files at a glance

```
src/
  units.ts          Scale constants, q(), qMul(), mulDiv(), clampQ()
  types.ts          Entity, WorldState, IndividualAttributes, all core types
  kernel.ts         stepWorld() — the main simulation entry point
  generate.ts       generateIndividual(seed, archetype) → IndividualAttributes
  archetypes.ts     HUMAN_BASE and all built-in species archetypes
  presets.ts        mkKnight(), mkBoxer(), mkOctopus() — ready-made test entities
  describe.ts       formatCharacterSheet(), formatOneLine()
  narrative.ts      generateCombatNarrative()
  campaign.ts       serializeWorldState(), deserializeWorldState()
  bridge/           extractRigSnapshots(), derivePoseModifiers(), etc.
  sim/
    kernel.ts        stepConditionsToInjury() and related sub-steps
    combat.ts        resolveAttack(), resolveHit()
    movement.ts      stepMovement()
    morale.ts        stepMoraleForEntity()
    formation-unit.ts  Formation system (shield walls, rank split, cohesion)

docs/
  integration-primer.md   Deep technical onboarding (architecture, gotchas)
  bridge-api.md           Renderer bridge API reference
  contributing.md         Contribution guide
  versioning.md           Versioning contract and upgrade cadence

tools/
  trace-attack.ts   Annotated single-tick trace demo
  observer.ts       Multi-tick entity state observer
  vertical-slice.ts Knight vs Brawler duel to outcome
  validation.ts     Empirical validation suite (run via npm run run:validation)
```
