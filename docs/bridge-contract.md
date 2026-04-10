# Ananke Bridge Contract

> **This file is the source-of-truth contract for bridge-related symbols and import paths.**
> The package name is `@its-not-rocket-science/ananke`.

For versioning policy see [`docs/versioning.md`](versioning.md) and [`STABLE_API.md`](../STABLE_API.md).

---

## 1) Stability and import-path truth table

The previous revision of this file overstated Tier-1 status. The table below reflects actual exports in `src/index.ts`, `src/tier2.ts`, and `src/bridge/index.ts`.

| Symbol | Import path | Tier | Notes |
|---|---|---|---|
| `extractRigSnapshots` | `@its-not-rocket-science/ananke` | Tier 1 | Root export (stable). |
| `deriveAnimationHints` | `@its-not-rocket-science/ananke` | Tier 1 | Root export (stable). |
| `AnimationHints` | `@its-not-rocket-science/ananke` | Tier 1 | Type export. |
| `RigSnapshot` | `@its-not-rocket-science/ananke` | Tier 1 | Type export. |
| `SCALE`, `q`, `stepWorld`, `createWorld` | `@its-not-rocket-science/ananke` | Tier 1 | Used by runnable root quickstart below. |
| `BridgeEngine` | `@its-not-rocket-science/ananke/tier2` | shipped-but-not-Tier-1 (Tier 2) | **Not** exported from root path. |
| `BridgeConfig`, `BodyPlanMapping`, `SegmentMapping` | `@its-not-rocket-science/ananke/tier2` | shipped-but-not-Tier-1 (Tier 2) | Bridge config types. |
| `InterpolatedState` | `@its-not-rocket-science/ananke/tier2` | shipped-but-not-Tier-1 (Tier 2) | Bridge interpolated output type. |
| `derivePoseModifiers` | `@its-not-rocket-science/ananke/tier2` | shipped-but-not-Tier-1 (Tier 2) | From `model3d` via tier2 barrel. |
| `deriveGrappleConstraint` | `@its-not-rocket-science/ananke/tier2` | shipped-but-not-Tier-1 (Tier 2) | From `model3d` via tier2 barrel. |
| `deriveMassDistribution` | `@its-not-rocket-science/ananke/tier2` | shipped-but-not-Tier-1 (Tier 2) | From `model3d` via tier2 barrel. |
| `deriveInertiaTensor` | `@its-not-rocket-science/ananke/tier2` | shipped-but-not-Tier-1 (Tier 2) | From `model3d` via tier2 barrel. |
| `GrapplePoseConstraint`, `PoseModifier` | `@its-not-rocket-science/ananke/tier2` | shipped-but-not-Tier-1 (Tier 2) | Types from `model3d` via tier2 barrel. |
| `MappedPoseModifier` | `@its-not-rocket-science/ananke/tier2` | shipped-but-not-Tier-1 (Tier 2) | Bridge mapped pose type. |
| `validateMappingCoverage` | `@its-not-rocket-science/ananke/tier2` | shipped-but-not-Tier-1 (Tier 2) | Mapping helper via `bridge/index`. |
| `mkWorld`, `mkKnight` | _No package export path_ | Internal/test-only | Available in source (`src/sim/testing.ts`, `src/presets.ts`) but not package exports. |

### Tier promise

- **Tier 1 promise:** only root import symbols listed in `docs/stable-api-manifest.json`.
- **shipped-but-not-Tier-1 (Tier 2) promise:** usable, but may change across minor versions; import explicitly from `/tier2`.

---

## 2) Behaviour contract (verified against source)

### `BridgeEngine` lifecycle (shipped-but-not-Tier-1 (Tier 2))

- `update(snapshots, motion?, condition?)` shifts `curr -> prev`, ingests a new `curr`, and advances internal tick/time bookkeeping.
- `getInterpolatedState(entityId, renderTime_s)` returns `null` when no snapshot exists, otherwise an `InterpolatedState` built from `prev/curr`.
- If only one snapshot exists, bridge holds that snapshot.
- If render time is older than previous tick, bridge holds previous.
- If render time is newer than current tick:
  - `extrapolationAllowed: false` => hold current.
  - `extrapolationAllowed: true` => velocity-based extrapolated position.

### Interpolation details

- Numeric tracks are lerped in fixed-point Q-space.
- `animation` booleans and `condition.dead` snap to `curr` at midpoint (`t >= SCALE.Q / 2`).
- `grapple` also snaps at midpoint.

### `InterpolatedState` shape (shipped-but-not-Tier-1 (Tier 2))

`entityId`, `teamId`, `position_m`, `velocity_mps`, `facing`, `animation`, `poseModifiers`, `grapple`, `condition`, `interpolationFactor`, `fromTick`, `toTick`.

Note: `condition` fields are `shockQ`, `fearQ`, `consciousness`, `fluidLoss`, and `dead`.

---

## 3) Runnable quickstarts

## 3.1 Tier-1 root quickstart (stable)

```ts pseudocode
import {
  createWorld,
  stepWorld,
  extractRigSnapshots,
  deriveAnimationHints,
  q,
  SCALE,
} from "@its-not-rocket-science/ananke";

const world = createWorld(42, [
  { id: 1, teamId: 1, seed: 101, archetype: "KNIGHT_INFANTRY", weaponId: "arming_sword" },
  { id: 2, teamId: 2, seed: 202, archetype: "KNIGHT_INFANTRY", weaponId: "arming_sword", x_m: 1.0 },
]);

stepWorld(world, new Map(), { tractionCoeff: q(0.8) });

const snapshots = extractRigSnapshots(world);
const anim = deriveAnimationHints(world.entities[0]!);

console.log(snapshots.length, anim.idle / SCALE.Q);
```

## 3.2 Tier-2 bridge quickstart (explicitly unstable)

```ts pseudocode
import { createWorld, stepWorld, extractRigSnapshots, q, SCALE } from "@its-not-rocket-science/ananke";
import { BridgeEngine, type BridgeConfig } from "@its-not-rocket-science/ananke/tier2";

const cfg: BridgeConfig = {
  mappings: [],
  defaultBoneName: "root",
  extrapolationAllowed: false,
};

const world = createWorld(42, [
  { id: 1, teamId: 1, seed: 101, archetype: "KNIGHT_INFANTRY", weaponId: "arming_sword" },
]);

const engine = new BridgeEngine(cfg);
engine.setEntityBodyPlan(1, "humanoid");

stepWorld(world, new Map(), { tractionCoeff: q(0.8) });
engine.update(extractRigSnapshots(world));

stepWorld(world, new Map(), { tractionCoeff: q(0.8) });
engine.update(extractRigSnapshots(world));

const renderTime = engine.getLatestSimTime() - (1 / 40);
const state = engine.getInterpolatedState(1, renderTime);

if (state) {
  const idle01 = state.animation.idle / SCALE.Q;
  console.log(state.position_m.x, idle01);
}
```

---

## 4) Non-contract symbols that appear in source but are not package contract

These symbols are useful in repo-internal tests/examples but are **not** package exports and must not be treated as stable integration surface:

- `mkWorld` (`src/sim/testing.ts`)
- `mkKnight` (`src/presets.ts`)

If you need a public constructor path for integrations, use Tier-1 `createWorld`.
