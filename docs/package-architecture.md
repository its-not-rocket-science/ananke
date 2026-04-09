# Ananke — Modular Package Architecture

> **Status: Enforced in CI (incremental)** — package boundaries are now checked from source imports via `tools/check-package-boundaries.ts`, with hard-fail on `@ananke/core` upward dependencies and a generated report at `docs/package-boundary-report.md`.
>
> Remaining non-core boundary drift is tracked in warning mode and is remediated in batches.

---

## Problem

`@its-not-rocket-science/ananke` ships 41 subpath exports in a single package.
A host that only needs tactical combat transitively depends on feudal succession,
epidemic simulation, and monetary policy.  A renderer integration author has no
clean way to depend only on the bridge layer.

---

## Package Overview

| Package | Stability | Description | Key entry point(s) |
|---------|-----------|-------------|-------------------|
| `@ananke/core` | **Stable** | Kernel, entity model, fixed-point units, RNG, replay, shared damage channels | `"@ananke/core"` |
| `@ananke/combat` | Experimental | Combat resolution, anatomy, grapple, ranged, competence | `"@ananke/combat"` |
| `@ananke/campaign` | Experimental | World simulation — polity, economy, social, demography | `"@ananke/campaign"` |
| `@ananke/content` | Experimental | Species, equipment catalogue, archetypes, crafting | `"@ananke/content"` |
| `@ananke/bridge` | Experimental | Renderer bridge, interpolation, animation hints *(Phase 2)* | `"@ananke/bridge"` |
| `@its-not-rocket-science/ananke` | **Meta-package** | Re-exports all of the above for backwards compatibility | unchanged |

> `@ananke/bridge` is not yet a standalone stub — bridge exports are part of
> `@ananke/core` until Phase 2 adds a dedicated `"./bridge"` subpath to the
> monolith.



## Enforcement (source of truth)

- **Config:** `tools/package-boundaries.config.json` defines file ownership and allowed package edges.
- **Checker:** `tools/check-package-boundaries.ts` parses TypeScript AST imports (`import`, `export ... from`, dynamic `import()`, `require()`, and `import("...")` types).
- **Reports:** `npm run check-boundaries:report` updates `docs/package-boundary-report.md`.
- **CI gate:** `npm run check-boundaries:ci` regenerates the report and enforces regression caps (`--max-hard`, `--max-suspicious`) so drift fails fast while remediation is in progress.

Strict modes:
- `--strict`: fail on hard violations only (used in CI for immediate anti-drift).
- `--strict-all`: fail on any disallowed cross-package import (used when tightening migration phases).

---

## Package Dependency Graph

```
@ananke/core
    │
    ├── @ananke/combat      (peer: @ananke/core)
    ├── @ananke/campaign    (peer: @ananke/core)
    ├── @ananke/content     (peer: @ananke/core)
    └── @ananke/bridge      (peer: @ananke/core)   [Phase 2]

@its-not-rocket-science/ananke  (meta: re-exports all four)
```

---

## Monolith Subpath → Package Mapping

### @ananke/core

| Monolith subpath | Notes |
|-----------------|-------|
| `"."` | Entire main export — kernel, entity, units, RNG, replay, bridge |

### @ananke/combat

| Monolith subpath | Notes |
|-----------------|-------|
| `"./combat"` | resolveHit, resolveBlock, CombatContext |
| `"./anatomy"` | BodyPlan, AnatomyRegion, injury regions |
| `"./competence"` | skill contest resolution, interspecies signalling |
| `"./wasm-kernel"` | WASM-accelerated combat math |

### @ananke/campaign

| Monolith subpath | Notes |
|-----------------|-------|
| `"./campaign"` | Campaign layer, strategic tick |
| `"./polity"` | Polity, stepPolityDay, tech diffusion |
| `"./social"` | Social relationships |
| `"./narrative"` | Narrative event system |
| `"./narrative-prose"` | Prose generation |
| `"./renown"` | Fame and reputation |
| `"./kinship"` | Family trees, genealogy |
| `"./succession"` | Inheritance rules |
| `"./calendar"` | In-world calendar and date tracking |
| `"./feudal"` | Feudal hierarchy |
| `"./diplomacy"` | Treaties and diplomatic acts |
| `"./migration"` | Population movement |
| `"./espionage"` | Espionage and spycraft |
| `"./trade-routes"` | Trade route simulation |
| `"./siege"` | Siege warfare mechanics |
| `"./faith"` | Religion and doctrine |
| `"./demography"` | Population simulation |
| `"./granary"` | Food storage and distribution |
| `"./epidemic"` | Disease spread |
| `"./infrastructure"` | Buildings and construction |
| `"./unrest"` | Civil unrest |
| `"./research"` | Technology research |
| `"./taxation"` | Tax collection |
| `"./military-campaign"` | Military campaign mechanics |
| `"./governance"` | Governance and edicts |
| `"./resources"` | Resource management |
| `"./climate"` | Climate and weather effects |
| `"./famine"` | Famine simulation |
| `"./containment"` | Disease containment |
| `"./mercenaries"` | Mercenary companies |
| `"./wonders"` | Wonders and monuments |
| `"./monetary"` | Monetary policy and currency |

### @ananke/content

| Monolith subpath | Notes |
|-----------------|-------|
| `"./species"` | Species definitions, stat profiles |
| `"./catalog"` | Equipment and item catalogue |
| `"./character"` | Character generation and archetypes |
| `"./crafting"` | Crafting recipes, workshops, manufacturing |

---

## Source File → Package Mapping (Phase 2 migration)

### @ananke/core
```
src/units.ts
src/rng.ts
src/types.ts
src/replay.ts
src/channels.ts
src/sim/entity.ts
src/sim/kernel.ts
src/sim/seeds.ts
src/sim/world.ts
src/sim/kinds.ts
src/sim/condition.ts
src/sim/body.ts
src/sim/bodyplan.ts
src/sim/limb.ts
src/sim/tick.ts
src/sim/indexing.ts
src/sim/events.ts
src/sim/commands.ts
src/sim/commandBuilders.ts
src/sim/context.ts
src/sim/intent.ts
src/sim/vec3.ts
src/sim/spatial.ts
src/sim/skills.ts
src/sim/traits.ts
src/sim/terrain.ts
src/sim/action.ts
src/sim/step/           (all 10 step files)
src/bridge/             (all 5 bridge files)
src/presets.ts
src/generate.ts
src/derive.ts
src/describe.ts
src/traits.ts
src/metrics.ts
src/dist.ts
src/wasm-kernel.ts
```

### @ananke/combat
```
src/sim/combat.ts
src/sim/injury.ts
src/sim/wound-aging.ts
src/sim/medical.ts
src/sim/morale.ts
src/sim/grapple.ts
src/sim/ranged.ts
src/sim/stamina.ts      (if present)
src/sim/impairment.ts
src/sim/knockback.ts
src/sim/cover.ts
src/sim/cone.ts
src/sim/formation.ts
src/sim/formation-combat.ts
src/sim/formation-unit.ts
src/sim/frontage.ts
src/sim/density.ts
src/sim/occlusion.ts
src/sim/ai/             (all 8 AI files)
src/combat.ts
src/equipment.ts
src/weapons.ts
src/anatomy/            (all 5 anatomy files)
src/competence/         (all 13 competence files)
src/arena.ts
src/dialogue.ts
src/party.ts
src/faction.ts
src/downtime.ts
```

### @ananke/campaign
```
src/campaign.ts
src/campaign-layer.ts
src/polity.ts
src/polity-vassals.ts
src/social.ts
src/relationships.ts
src/relationships-effects.ts
src/emotional-contagion.ts
src/narrative.ts
src/narrative-layer.ts
src/narrative-prose.ts
src/narrative-render.ts
src/narrative-stress.ts
src/story-arcs.ts
src/quest.ts
src/quest-generators.ts
src/chronicle.ts
src/legend.ts
src/mythology.ts
src/renown.ts
src/kinship.ts
src/succession.ts
src/calendar.ts
src/feudal.ts
src/diplomacy.ts
src/migration.ts
src/espionage.ts
src/trade-routes.ts
src/siege.ts
src/faith.ts
src/demography.ts
src/granary.ts
src/epidemic.ts
src/infrastructure.ts
src/unrest.ts
src/research.ts
src/taxation.ts
src/military-campaign.ts
src/governance.ts
src/resources.ts
src/climate.ts
src/famine.ts
src/containment.ts
src/mercenaries.ts
src/wonders.ts
src/monetary.ts
src/collective-activities.ts
src/economy.ts
src/economy-gen.ts
src/tech-diffusion.ts
src/culture.ts
src/settlement.ts
src/settlement-services.ts
src/channels.ts
src/inheritance.ts
src/progression.ts
src/sim/disease.ts
src/sim/aging.ts
src/sim/sleep.ts
src/sim/mount.ts
src/sim/hazard.ts
src/sim/nutrition.ts
src/sim/thermoregulation.ts
src/sim/toxicology.ts
src/sim/systemic-toxicology.ts
src/sim/substance.ts
src/sim/weather.ts
src/sim/biome.ts
src/sim/tech.ts
```

### @ananke/content
```
src/species.ts
src/catalog.ts
src/character.ts
src/archetypes.ts
src/crafting/           (all 5 crafting files)
src/inventory.ts
src/item-durability.ts
src/snapshot.ts
src/world-generation.ts
src/world-factory.ts
src/scenario.ts
src/modding.ts
src/lod.ts
src/model3d.ts
```

---

## Phase 2: Source Migration Plan

1. **Create workspace package directories** with their own `tsconfig.build.json`.
2. **Move source files** from `src/` into `packages/NAME/src/` following the table above.
3. **Update internal imports** — use `@ananke/core` etc. instead of relative paths that cross
   package boundaries.
4. **Wire inter-package dependencies** — `@ananke/combat` lists `@ananke/core` as a dependency.
5. **Update the monolith meta-package** (`@its-not-rocket-science/ananke`) to re-export from
   the five sub-packages instead of from `src/`.
6. **Verify** that all existing tests pass without modification (test paths remain unchanged).

The most complex step is (3) — identifying which imports cross package boundaries.  A planned
tool (`tools/check-package-boundaries.ts`) will analyse the import graph and report violations.

---

## What Changes for Package Consumers

### Phase 1 (now — stubs)
```typescript
// Before (monolith)
import { resolveHit } from "@its-not-rocket-science/ananke/combat";

// After (modular stub — same bundle size, cleaner import path)
import { resolveHit } from "@ananke/combat";
```

### Phase 2 (source migration — smaller bundles)
```typescript
// Same import — but now @ananke/combat has no campaign dependency
import { resolveHit } from "@ananke/combat";
```

The import path is the same in Phase 1 and Phase 2; only the bundle contents change.

---

## Backwards Compatibility

`@its-not-rocket-science/ananke` will remain published indefinitely as a meta-package.
All 41 subpath exports will continue to work.  Existing hosts do not need to migrate.
