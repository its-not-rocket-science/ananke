# Ananke — Stable API Reference

This document defines Ananke's stability tiers and the **only** symbols considered Tier 1.

Source of truth for Tier 1 symbol names: `docs/stable-api-manifest.json`.

---

## Tier 1 (stable): root import only

```ts
import { ... } from "@its-not-rocket-science/ananke";
```

Tier 1 is intentionally minimal and host-facing:

1. Fixed-point utilities
2. Core host-required types
3. World creation / scenario loading
4. Stepping
5. Replay / serialization
6. Bridge extraction

### 1) Fixed-point utilities (`src/units.ts`)

- Types: `I32`, `Q`
- Constants: `SCALE`, `G_mps2`
- Functions: `q`, `clampQ`, `qMul`, `qDiv`, `mulDiv`, `sqrtQ`
- Conversion helpers: `to`, `from`

### 2) Core host-required types

- `IndividualAttributes` (`src/types.ts`)
- `Entity` (`src/sim/entity.ts`)
- `WorldState` (`src/sim/world.ts`)
- `KernelContext` (`src/sim/context.ts`)
- `Command`, `CommandMap` (`src/sim/commands.ts`)

### 3) World creation / scenario loading

- `createWorld`, `EntitySpec` (`src/world-factory.ts`)
- `loadScenario`, `validateScenario`, `AnankeScenario`, `AnankeScenarioEntity` (`src/scenario.ts`)

### 4) Stepping

- `stepWorld` (`src/sim/kernel.ts`)

### 5) Replay / serialization

- `Replay`, `ReplayFrame`, `ReplayRecorder`, `replayTo`, `serializeReplay`, `deserializeReplay` (`src/replay.ts`)

### 6) Bridge extraction

- `RigSnapshot`, `AnimationHints`, `extractRigSnapshots`, `deriveAnimationHints` (`src/model3d.ts`)

---

## Tier 2 (experimental): explicit subpaths

Tier 2 modules are tested but may change across **minor** versions.

Preferred entrypoints:

- `@its-not-rocket-science/ananke/tier2`
- domain subpaths such as:
  - `/character`
  - `/combat`
  - `/campaign`
  - `/social`
  - `/narrative`
  - `/anatomy`
  - `/crafting`
  - `/competence`
  - `/species`
  - `/polity`
  - `/catalog`

---

## Tier 3 (internal): explicit subpaths only

Tier 3 exports are internal/advanced and can change without semver guarantees.

Use:

- `@its-not-rocket-science/ananke/tier3`
- other dedicated internal subpaths when present.

---

## Versioning and migration

- Breaking Tier 1 changes require semver breaking release behavior and a migration guide in `CHANGELOG.md`.
- See `docs/versioning.md` for the full policy.
