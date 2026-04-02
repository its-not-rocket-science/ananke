# Package Boundary Remediation Plan

This plan audits `docs/package-boundary-report.md` and proposes an incremental migration that drives hard violations toward zero without widening dependency allowances or breaking runtime behavior.

## 1) Violation classification (all hard violations)

Total hard violations classified: **86**.

| # | Violation | Classification | Concrete fix |
|---:|---|---|---|
| 1 | `src/bridge/bridge-engine.ts:4` (core → content) | **leaky abstraction** | **extract interface** — Introduce `@ananke/core/bridge-contracts` (AnimationHints, PoseModifier, RigSnapshot) and consume it from bridge + content model adapters. |
| 2 | `src/bridge/interpolation.ts:5` (core → content) | **leaky abstraction** | **extract interface** — Introduce `@ananke/core/bridge-contracts` (AnimationHints, PoseModifier, RigSnapshot) and consume it from bridge + content model adapters. |
| 3 | `src/bridge/interpolation.ts:5` (core → content) | **leaky abstraction** | **extract interface** — Introduce `@ananke/core/bridge-contracts` (AnimationHints, PoseModifier, RigSnapshot) and consume it from bridge + content model adapters. |
| 4 | `src/bridge/interpolation.ts:5` (core → content) | **leaky abstraction** | **extract interface** — Introduce `@ananke/core/bridge-contracts` (AnimationHints, PoseModifier, RigSnapshot) and consume it from bridge + content model adapters. |
| 5 | `src/bridge/interpolation.ts:5` (core → content) | **leaky abstraction** | **extract interface** — Introduce `@ananke/core/bridge-contracts` (AnimationHints, PoseModifier, RigSnapshot) and consume it from bridge + content model adapters. |
| 6 | `src/bridge/mapping.ts:4` (core → content) | **leaky abstraction** | **extract interface** — Introduce `@ananke/core/bridge-contracts` (AnimationHints, PoseModifier, RigSnapshot) and consume it from bridge + content model adapters. |
| 7 | `src/bridge/types.ts:5` (core → content) | **leaky abstraction** | **extract interface** — Introduce `@ananke/core/bridge-contracts` (AnimationHints, PoseModifier, RigSnapshot) and consume it from bridge + content model adapters. |
| 8 | `src/derive.ts:3` (core → combat) | **leaky abstraction** | **extract interface** — Replace direct Equipment import with `LoadoutItemView` contract in core; adapt combat equipment to that contract. |
| 9 | `src/derive.ts:3` (core → combat) | **leaky abstraction** | **extract interface** — Replace direct Equipment import with `LoadoutItemView` contract in core; adapt combat equipment to that contract. |
| 10 | `src/generate.ts:22` (core → content) | **leaky abstraction** | **extract interface** — Move `Archetype` type contract into core (`src/contracts/archetype.ts`) and have content export data implementing it. |
| 11 | `src/presets.ts:16` (core → content) | **misplaced logic** | **move file** — Move preset factories into `packages/combat` (e.g. `combat/presets.ts`) and keep root `src/presets.ts` as compatibility re-export. |
| 12 | `src/presets.ts:17` (core → combat) | **misplaced logic** | **move file** — Move preset factories into `packages/combat` (e.g. `combat/presets.ts`) and keep root `src/presets.ts` as compatibility re-export. |
| 13 | `src/presets.ts:21` (core → combat) | **misplaced logic** | **move file** — Move preset factories into `packages/combat` (e.g. `combat/presets.ts`) and keep root `src/presets.ts` as compatibility re-export. |
| 14 | `src/sim/body.ts:3` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 15 | `src/sim/bodyplan.ts:10` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 16 | `src/sim/bodyplan.ts:11` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 17 | `src/sim/capability.ts:11` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 18 | `src/sim/capability.ts:12` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 19 | `src/sim/capability.ts:13` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 20 | `src/sim/capability.ts:14` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 21 | `src/sim/capability.ts:15` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 22 | `src/sim/commands.ts:6` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 23 | `src/sim/context.ts:4` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 24 | `src/sim/context.ts:7` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 25 | `src/sim/context.ts:8` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 26 | `src/sim/context.ts:10` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 27 | `src/sim/entity.ts:2` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 28 | `src/sim/entity.ts:3` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 29 | `src/sim/entity.ts:5` (core → content) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 30 | `src/sim/entity.ts:9` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 31 | `src/sim/entity.ts:14` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 32 | `src/sim/entity.ts:16` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 33 | `src/sim/entity.ts:19` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 34 | `src/sim/entity.ts:20` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 35 | `src/sim/entity.ts:21` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 36 | `src/sim/entity.ts:22` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 37 | `src/sim/entity.ts:23` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 38 | `src/sim/entity.ts:24` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 39 | `src/sim/entity.ts:34` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 40 | `src/sim/entity.ts:35` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 41 | `src/sim/entity.ts:36` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 42 | `src/sim/events.ts:1` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 43 | `src/sim/kernel.ts:8` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 44 | `src/sim/kernel.ts:9` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 45 | `src/sim/kernel.ts:11` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 46 | `src/sim/kernel.ts:12` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 47 | `src/sim/kernel.ts:15` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 48 | `src/sim/kernel.ts:20` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 49 | `src/sim/kernel.ts:21` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 50 | `src/sim/kernel.ts:22` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 51 | `src/sim/kernel.ts:15` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 52 | `src/sim/kernel.ts:31` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 53 | `src/sim/kernel.ts:32` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 54 | `src/sim/kernel.ts:33` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 55 | `src/sim/kernel.ts:35` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 56 | `src/sim/kernel.ts:41` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 57 | `src/sim/kernel.ts:48` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 58 | `src/sim/kernel.ts:49` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 59 | `src/sim/kernel.ts:50` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 60 | `src/sim/kernel.ts:52` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 61 | `src/sim/kernel.ts:53` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 62 | `src/sim/kernel.ts:54` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 63 | `src/sim/kernel.ts:55` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 64 | `src/sim/kernel.ts:60` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 65 | `src/sim/kernel.ts:69` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 66 | `src/sim/kernel.ts:78` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 67 | `src/sim/kernel.ts:87` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 68 | `src/sim/limb.ts:14` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 69 | `src/sim/step/energy.ts:8` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 70 | `src/sim/step/injury.ts:5` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 71 | `src/sim/step/injury.ts:8` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 72 | `src/sim/step/injury.ts:10` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 73 | `src/sim/step/morale.ts:23` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 74 | `src/sim/step/movement.ts:13` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 75 | `src/sim/step/movement.ts:14` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 76 | `src/sim/step/substances.ts:4` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 77 | `src/sim/team.ts:3` (core → combat) | **misplaced logic** | **split package** — Split `sim/world` into pure-core world state + combat campaign adapters (`world-combat.ts`, `world-campaign.ts`). |
| 78 | `src/sim/team.ts:4` (core → combat) | **misplaced logic** | **split package** — Split `sim/world` into pure-core world state + combat campaign adapters (`world-combat.ts`, `world-campaign.ts`). |
| 79 | `src/sim/testing.ts:2` (core → content) | **misplaced logic** | **move file** — Move test factories to `packages/combat/src/testing` and expose core-safe harness interfaces only. |
| 80 | `src/sim/testing.ts:6` (core → combat) | **misplaced logic** | **move file** — Move test factories to `packages/combat/src/testing` and expose core-safe harness interfaces only. |
| 81 | `src/sim/testing.ts:7` (core → combat) | **misplaced logic** | **move file** — Move test factories to `packages/combat/src/testing` and expose core-safe harness interfaces only. |
| 82 | `src/sim/trace.ts:6` (core → combat) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 83 | `src/sim/world.ts:4` (core → combat) | **misplaced logic** | **split package** — Split `sim/world` into pure-core world state + combat campaign adapters (`world-combat.ts`, `world-campaign.ts`). |
| 84 | `src/sim/world.ts:5` (core → combat) | **misplaced logic** | **split package** — Split `sim/world` into pure-core world state + combat campaign adapters (`world-combat.ts`, `world-campaign.ts`). |
| 85 | `src/sim/world.ts:6` (core → campaign) | **leaky abstraction** | **invert dependency** — Define `SimulationSystem` plugin interfaces in core and register combat/campaign systems from owning packages at bootstrap. |
| 86 | `src/traits.ts:1` (core → campaign) | **leaky abstraction** | **extract interface** — Extract `ChannelPublisher` interface to core contracts; campaign implements channel transport. |

## 2) Target dependency graph (allowed imports only)

```text
@ananke/core
  ├─ owns deterministic primitives, entity state, tick loop, interfaces only
  ├─ defines ports: CombatPort, CampaignPort, ContentPort, BridgePort
  └─ does NOT import combat/campaign/content implementation files

@ananke/content
  ├─ may import @ananke/core contracts
  └─ exports data + adapters implementing ContentPort

@ananke/combat
  ├─ may import @ananke/core contracts
  ├─ may import @ananke/content contracts/data (read-only)
  └─ exports combat systems implementing CombatPort

@ananke/campaign
  ├─ may import @ananke/core contracts
  ├─ may import @ananke/content contracts/data (read-only)
  └─ exports campaign systems implementing CampaignPort

@ananke/bridge (or bridge module under core until extracted)
  ├─ may import @ananke/core + BridgePort contracts
  └─ no direct import from content model implementations

@its-not-rocket-science/ananke (meta package)
  └─ composition/re-exports only; wires ports to implementations
```

Allowed edge matrix (strict):

```text
core -> (none)
content -> core
combat -> core, content
campaign -> core, content
bridge -> core
meta-runtime -> core, combat, campaign, content, bridge
```

## 3) Ordered migration plan (safe, no broken builds)

| Step | Change | Why safe |
|---:|---|---|
| 1 | Create contract modules in `src/contracts/*` for all cross-domain types currently imported by core (e.g., `Archetype`, `EquipmentView`, `ChannelPublisher`, `PoseModifier`). Keep old exports as type aliases for compatibility. | Backwards-compatible adapters/re-exports preserve API and runtime wiring during transition. |
| 2 | Add adapter shims in owning packages (`combat`, `campaign`, `content`) that implement these contracts while preserving current runtime behavior. | Backwards-compatible adapters/re-exports preserve API and runtime wiring during transition. |
| 3 | Refactor core files with the highest fan-out (`src/sim/kernel.ts`, `src/sim/entity.ts`, `src/sim/context.ts`) to depend on port interfaces + injected registries instead of concrete imports. | Backwards-compatible adapters/re-exports preserve API and runtime wiring during transition. |
| 4 | Introduce a composition root (meta runtime bootstrap) that registers combat/campaign systems into core kernel at startup. | Backwards-compatible adapters/re-exports preserve API and runtime wiring during transition. |
| 5 | Move clearly misplaced composition/test files (`src/presets.ts`, `src/sim/testing.ts`) into owning packages; keep compatibility re-export stubs in original paths. | Backwards-compatible adapters/re-exports preserve API and runtime wiring during transition. |
| 6 | Split mixed modules (`src/sim/world.ts`, `src/sim/team.ts`) into pure-core state + domain adapters so core no longer imports faction/party/relationships directly. | Backwards-compatible adapters/re-exports preserve API and runtime wiring during transition. |
| 7 | Extract bridge contracts from `src/model3d.ts` and switch bridge files to contract imports; add model3d adapter in content package. | Backwards-compatible adapters/re-exports preserve API and runtime wiring during transition. |
| 8 | Re-run `npm run check-boundaries:strict`, then address remaining one-off imports by either extracting minimal interfaces or relocating file ownership. | Backwards-compatible adapters/re-exports preserve API and runtime wiring during transition. |
| 9 | After hard violations reach zero, tighten CI gate to fail on current warning-mode edges in scoped batches (combat↔campaign, content↔combat, content↔campaign). | Backwards-compatible adapters/re-exports preserve API and runtime wiring during transition. |

## 4) Diff-level recommendations for first 10 violations

> These are concrete starter patches (minimal churn) for the first 10 hard-violation entries in the report.

### Violation 1: `src/bridge/bridge-engine.ts:4` importing `src/model3d.ts` (core → content)
```diff
- import type { PoseModifier | AnimationHints | RigSnapshot } from "../model3d.js"
+ import type { PoseModifier | AnimationHints | RigSnapshot } from "../contracts/bridge-model.js"
```
- Add `src/contracts/bridge-model.ts` with minimal structural types used by bridge interpolation/mapping.
- In `src/model3d.ts`, export adapter types implementing `bridge-model` contracts (no behavior change).

### Violation 2: `src/bridge/interpolation.ts:5` importing `src/model3d.ts` (core → content)
```diff
- import type { PoseModifier | AnimationHints | RigSnapshot } from "../model3d.js"
+ import type { PoseModifier | AnimationHints | RigSnapshot } from "../contracts/bridge-model.js"
```
- Add `src/contracts/bridge-model.ts` with minimal structural types used by bridge interpolation/mapping.
- In `src/model3d.ts`, export adapter types implementing `bridge-model` contracts (no behavior change).

### Violation 3: `src/bridge/interpolation.ts:5` importing `src/model3d.ts` (core → content)
```diff
- import type { PoseModifier | AnimationHints | RigSnapshot } from "../model3d.js"
+ import type { PoseModifier | AnimationHints | RigSnapshot } from "../contracts/bridge-model.js"
```
- Add `src/contracts/bridge-model.ts` with minimal structural types used by bridge interpolation/mapping.
- In `src/model3d.ts`, export adapter types implementing `bridge-model` contracts (no behavior change).

### Violation 4: `src/bridge/interpolation.ts:5` importing `src/model3d.ts` (core → content)
```diff
- import type { PoseModifier | AnimationHints | RigSnapshot } from "../model3d.js"
+ import type { PoseModifier | AnimationHints | RigSnapshot } from "../contracts/bridge-model.js"
```
- Add `src/contracts/bridge-model.ts` with minimal structural types used by bridge interpolation/mapping.
- In `src/model3d.ts`, export adapter types implementing `bridge-model` contracts (no behavior change).

### Violation 5: `src/bridge/interpolation.ts:5` importing `src/model3d.ts` (core → content)
```diff
- import type { PoseModifier | AnimationHints | RigSnapshot } from "../model3d.js"
+ import type { PoseModifier | AnimationHints | RigSnapshot } from "../contracts/bridge-model.js"
```
- Add `src/contracts/bridge-model.ts` with minimal structural types used by bridge interpolation/mapping.
- In `src/model3d.ts`, export adapter types implementing `bridge-model` contracts (no behavior change).

### Violation 6: `src/bridge/mapping.ts:4` importing `src/model3d.ts` (core → content)
```diff
- import type { PoseModifier | AnimationHints | RigSnapshot } from "../model3d.js"
+ import type { PoseModifier | AnimationHints | RigSnapshot } from "../contracts/bridge-model.js"
```
- Add `src/contracts/bridge-model.ts` with minimal structural types used by bridge interpolation/mapping.
- In `src/model3d.ts`, export adapter types implementing `bridge-model` contracts (no behavior change).

### Violation 7: `src/bridge/types.ts:5` importing `src/model3d.ts` (core → content)
```diff
- import type { PoseModifier | AnimationHints | RigSnapshot } from "../model3d.js"
+ import type { PoseModifier | AnimationHints | RigSnapshot } from "../contracts/bridge-model.js"
```
- Add `src/contracts/bridge-model.ts` with minimal structural types used by bridge interpolation/mapping.
- In `src/model3d.ts`, export adapter types implementing `bridge-model` contracts (no behavior change).

### Violation 8: `src/derive.ts:3` importing `src/equipment.ts` (core → combat)
- Apply extract interface: Replace direct Equipment import with `LoadoutItemView` contract in core; adapt combat equipment to that contract.

### Violation 9: `src/derive.ts:3` importing `src/equipment.ts` (core → combat)
- Apply extract interface: Replace direct Equipment import with `LoadoutItemView` contract in core; adapt combat equipment to that contract.

### Violation 10: `src/generate.ts:22` importing `src/archetypes.ts` (core → content)
- Apply extract interface: Move `Archetype` type contract into core (`src/contracts/archetype.ts`) and have content export data implementing it.
