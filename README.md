# Ananke

A deterministic, lockstep-friendly core for simulation-first RPGs using **SI units** stored as **fixed-point integers**.
It provides:

- Fixed-point unit system (`src/units.ts`) using deterministic `bigint` mul/div
- Deterministic seeded RNG (`src/rng.ts`)
- Trait tags and channel applicability (`src/traits.ts`, `src/channels.ts`)
- Biology-agnostic individual attributes: actuation / structure / power conversion / reserve energy / control / resilience
- Deterministic individual generator (baseline humans + example robot archetype)
- Weapons, armour, encumbrance rules (mass + bulk) and penalties
- Unit tests with Vitest (`test/`)

## Quick start

```bash
npm i
npm test
npm run build
```

## Determinism notes

- Avoid `Math.random()` and floating point for authoritative simulation.
- Consume RNG in a fixed order.
- Avoid iterating over unordered map keys for gameplay logic.
- Use fixed timestep and stable ordering of entity updates.

## Layout

- `src/units.ts` fixed-point units and deterministic arithmetic
- `src/rng.ts` deterministic PRNG
- `src/archetypes.ts` baseline templates
- `src/generate.ts` deterministic individual generation
- `src/traits.ts` trait tags, channel masks, and attribute modifications
- `src/equipment.ts` weapons/armour definitions and encumbrance rules
- `src/derive.ts` derived movement/strike calculations and penalties
- `src/lod.ts` scaffolding for entity → squad → formation aggregation
