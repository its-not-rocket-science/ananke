# Ananke — Contribution Guide

*Integration & Adoption Milestone 5 — Community & Ecosystem Development*

---

## Who this guide is for

Anyone who wants to:

- Fix a bug or add a feature in the core kernel
- Author a new body plan, archetype, or weapon profile
- Extend the validation framework with new empirical scenarios
- Publish companion tooling (renderer bridges, body-plan packs, scenario libraries)

---

## What belongs in the engine vs. outside it

### In the engine (`src/`)

The engine is the authoritative source for:

- **Physical simulation logic** — injury mechanics, movement, combat resolution, morale, thermoregulation, etc.
- **Pure data types** — `Entity`, `WorldState`, `IndividualAttributes`, `InjuryState`, `EquipmentItem`, etc.
- **Determinism infrastructure** — `makeRng`, `eventSeed`, fixed-point arithmetic (`src/units.ts`)
- **Built-in species/archetypes** — `HUMAN_BASE`, `LARGE_PACIFIC_OCTOPUS`, etc., when they are broadly useful reference points
- **Built-in weapon/equipment profiles** — `src/weapons.ts`, `src/equipment.ts`

The bar for engine inclusion is high: the addition must be general-purpose, must not introduce
float arithmetic in the simulation path, and must come with tests that keep coverage above the
project thresholds (statements 90 %, branches 80 %, functions 85 %, lines 90 %).

### Outside the engine

Prefer external (companion repository) placement for:

- **Project-specific species** — your game's elves, robots, or alien fauna that have no relevance to other consumers
- **Renderer bridges** — Unity, Unreal, Godot, and custom WebGL bridges; see `docs/bridge-api.md`
- **Game-layer logic** — XP curves, quest systems, dialogue trees; these belong on top of Ananke, not inside it
- **Alternative AI decision layers** — `src/sim/ai/` provides a reference AI; game-specific AI belongs in the host
- **Custom `KernelContext` extensions** — add your own context fields in the host; do not widen the shared interface without broad applicability

---

## Code conventions

### No floating-point in the simulation path

Every value that flows through `stepWorld` must use fixed-point integers:

```typescript pseudocode
// CORRECT — fixed-point
const speed_Smps: number = mulDiv(baseSpeed, modifier, SCALE.Q);

// WRONG — float in sim path
const speed = baseSpeed * 1.5;
```

The generation path (`src/generate.ts`), tool scripts (`tools/`), and test helpers may use floats
where needed, but never in `src/sim/` or `src/kernel.ts`.

### No `Math.random()` anywhere in `src/`

All randomness must flow through `makeRng` seeded by `eventSeed`:

```typescript pseudocode
import { eventSeed, makeRng } from "./rng.js";

const seed = eventSeed(world.seed, tick, entityA.id, entityB.id, SALT_MY_SYSTEM);
const rng  = makeRng(seed >>> 0, SCALE.Q);
const roll = rng(); // Q value in [0, SCALE.Q)
```

### SI units, fixed-point, named suffixes

Every numeric field carries a unit suffix:

| Suffix | Unit | Scale constant |
|--------|------|----------------|
| `_m`   | metres | `SCALE.m` (10 000) |
| `_kg`  | kilograms | `SCALE.kg` (1 000) |
| `_N`   | newtons | `SCALE.N` (1 000) |
| `_J`   | joules | `SCALE.J` (1 000) |
| `_W`   | watts | `SCALE.W` (1 000) |
| `_s`   | seconds | `SCALE.s` (1 000) |
| `_mps` | metres per second | `SCALE.mps` (10 000) |
| `_Q`   | dimensionless fraction [0, 1] | `SCALE.Q` (10 000) |

`q(0.60)` is shorthand for `Math.round(0.60 * SCALE.Q)` and should be used in all constant
declarations.

### `exactOptionalPropertyTypes` is enabled

TypeScript's `exactOptionalPropertyTypes` flag is on.  Never assign `undefined` to an optional
field — use a conditional spread instead:

```typescript pseudocode
// CORRECT
return {
  ...base,
  ...(extra ? { cognition: extra } : {}),
};

// WRONG — fails to compile
return { ...base, cognition: undefined };
```

### Pure modules in `src/sim/`

Every file in `src/sim/` must be a **pure computation module**: it may import types but must not
import `Entity`, `WorldState`, or any mutable kernel state.  Callers extract values and pass
plain numbers or maps.  This keeps each module independently testable without wiring up a full
world state.

---

## Pull-request checklist

Before opening a PR against the main branch, verify each item:

- [ ] `npm run build` exits with no errors
- [ ] `npm run test:coverage` passes all thresholds (statements 90 %, branches 80 %, functions 85 %, lines 90 %)
- [ ] No `Math.random()` added to `src/`
- [ ] No floating-point arithmetic added to `src/sim/` or `src/kernel.ts`
- [ ] Every new numeric field has an SI unit suffix
- [ ] New constants are exported and have a JSDoc comment explaining the physical basis
- [ ] New `src/sim/` module has a corresponding `test/<module>.test.ts` file
- [ ] The snapshot file (`test/snapshots/kernel_behaviour_snapshot.json`) is regenerated if any generation constants changed — delete it and re-run `npm test` to regenerate
- [ ] ROADMAP.md is updated if a phase is completed
- [ ] README.md "Current implementation status" paragraph is updated if the public API changed

---

## Adding a new simulation module

The canonical structure for a new pure module (e.g. Phase N — Widget System):

```
src/sim/widget.ts          Pure computation; types, constants, functions
test/widget.test.ts        Unit tests; all exported functions covered
```

Minimal module skeleton:

```typescript pseudocode
// src/sim/widget.ts

import { type Q, SCALE, q, clampQ, mulDiv } from "../../src/units.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WidgetState { /* ... */ }

// ─── Constants ──────────────────────────────────────────────────────────────

/** Physical basis note. */
export const WIDGET_CONSTANT: Q = q(0.50);

// ─── Functions ──────────────────────────────────────────────────────────────

export function computeWidget(/* ... */): WidgetState { /* ... */ }
```

---

## Versioning and breaking changes

See `docs/versioning.md` for the full versioning contract.  In brief: there is no semver
automation; breaking changes to `Entity`, `WorldState`, or exported type shapes are noted
in `CHANGELOG.md` with a migration note.  Pin to a commit hash in your dependency manifest
and audit the changelog on each upgrade.

---

## Licensing and upstream contributions

Ananke is MIT licensed.  By submitting a PR you agree that your contribution is also MIT
licensed and that you have the right to grant that licence.

Companion repositories (renderer bridges, species packs) may use any licence compatible with
MIT.  If you build something useful please consider linking it from `docs/ecosystem.md` so
other adopters can find it.
