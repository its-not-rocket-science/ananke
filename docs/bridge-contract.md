# Ananke Bridge Contract

> **Source-of-truth for renderer bridge imports and stability.**
> Package name: `@its-not-rocket-science/ananke`.

For versioning policy see [`docs/versioning.md`](versioning.md) and [`STABLE_API.md`](../STABLE_API.md).

Maintainer support boundary details are in [`docs/support-boundaries.md`](support-boundaries.md).

<!-- CONTRACT:STABILITY_LABELS:start -->
```json
[
  { "kind": "subpath", "subject": ".", "status": "Tier 1 stable", "notes": "Root host API and stable bridge extraction helpers" },
  { "kind": "subpath", "subject": "./tier2", "status": "Experimental", "notes": "Bridge runtime and mapping APIs" }
]
```
<!-- CONTRACT:STABILITY_LABELS:end -->

## 1) Import-path and stability truth table

| Symbol | Import path | Stability |
|---|---|---|
| `createWorld`, `stepWorld`, `q`, `SCALE` | `@its-not-rocket-science/ananke` | Tier 1 stable |
| `extractRigSnapshots`, `deriveAnimationHints` | `@its-not-rocket-science/ananke` | Tier 1 stable |
| `RigSnapshot`, `AnimationHints` | `@its-not-rocket-science/ananke` | Tier 1 stable |
| `BridgeEngine` | `@its-not-rocket-science/ananke/tier2` | Experimental |
| `BridgeConfig`, `BodyPlanMapping`, `SegmentMapping`, `InterpolatedState`, `MappedPoseModifier` | `@its-not-rocket-science/ananke/tier2` | Experimental |
| `validateMappingCoverage` | `@its-not-rocket-science/ananke/tier2` | Experimental |
| `derivePoseModifiers`, `deriveGrappleConstraint`, `deriveMassDistribution`, `deriveInertiaTensor` | `@its-not-rocket-science/ananke/tier2` | Experimental |
| `PoseModifier`, `GrapplePoseConstraint` | `@its-not-rocket-science/ananke/tier2` | Experimental |
| `mkWorld`, `mkKnight` | _No package export path_ | Internal/test-only |

`BridgeEngine` is **not Tier-1 root**. Use `@its-not-rocket-science/ananke/tier2` and treat it as experimental.

If bridge correctness is production-critical, pin exact patch versions and re-run interpolation/mapping regression tests on every upgrade.

## 2) Minimum bridge integration (Tier 1 stable)

This is the lowest-friction, stable path: run simulation, extract rig snapshots, and derive animation hints.

```ts
import {
  createWorld,
  stepWorld,
  extractRigSnapshots,
  deriveAnimationHints,
  q,
  SCALE,
} from "@its-not-rocket-science/ananke";

const world = createWorld(42, [
  { id: 1, teamId: 1, seed: 101, archetype: "KNIGHT_INFANTRY", weaponId: "wpn_longsword" },
  { id: 2, teamId: 2, seed: 202, archetype: "KNIGHT_INFANTRY", weaponId: "wpn_longsword", x_m: 1.0 },
]);

stepWorld(world, new Map(), { tractionCoeff: q(0.8) });

const snapshots = extractRigSnapshots(world);
const hints = deriveAnimationHints(world.entities[0]!);

console.log({
  snapshotCount: snapshots.length,
  idle01: hints.idle / SCALE.Q,
});
```

## 3) Advanced bridge runtime (Experimental tier2)

Use `BridgeEngine` when you need interpolation/extrapolation between simulation ticks.

```ts
import { createWorld, stepWorld, extractRigSnapshots, q, SCALE } from "@its-not-rocket-science/ananke";
import {
  BridgeEngine,
  type BridgeConfig,
  type BodyPlanMapping,
  validateMappingCoverage,
} from "@its-not-rocket-science/ananke/tier2";

const humanoidMapping: BodyPlanMapping = {
  bodyPlanId: "humanoid",
  segments: [{ segmentId: "head", boneName: "Head" }],
};

const missing = validateMappingCoverage(humanoidMapping, ["head", "torso"]);
console.log("missingSegments", missing);

const config: BridgeConfig = {
  mappings: [humanoidMapping],
  defaultBoneName: "root",
  extrapolationAllowed: false,
};

const world = createWorld(7, [
  { id: 1, teamId: 1, seed: 11, archetype: "KNIGHT_INFANTRY", weaponId: "wpn_longsword" },
]);

const engine = new BridgeEngine(config);
engine.setEntityBodyPlan(1, "humanoid");

stepWorld(world, new Map(), { tractionCoeff: q(0.8) });
engine.update(extractRigSnapshots(world));

stepWorld(world, new Map(), { tractionCoeff: q(0.8) });
engine.update(extractRigSnapshots(world));

const renderTime_s = engine.getLatestSimTime() - 1 / 40;
const state = engine.getInterpolatedState(1, renderTime_s);

if (state) {
  console.log({
    x_m: state.position_m.x / SCALE.m,
    idle01: state.animation.idle / SCALE.Q,
    fromTick: state.fromTick,
    toTick: state.toTick,
  });
}
```

### BridgeEngine behavior contract (Experimental)

- `update(snapshots, motion?, condition?)` shifts per-entity `curr` to `prev`, ingests new `curr`, and advances tick/time state.
- `getInterpolatedState(entityId, renderTime_s)` returns `null` if the entity has no snapshots.
- With only one snapshot for an entity, returned state is held (no interpolation).
- If `renderTime_s <= prevTime_s`, previous snapshot is held.
- If `renderTime_s >= currTime_s`:
  - `extrapolationAllowed: false` => current snapshot is held.
  - `extrapolationAllowed: true` => position extrapolates from current velocity.
- Numeric tracks interpolate in fixed-point Q-space.
- `animation.prone|unconscious|dead`, `condition.dead`, and `grapple` snap at midpoint (`t < SCALE.Q / 2` uses previous, otherwise current).

## 4) Compile-tested reference example

- `examples/bridge-minimal.ts` is a compile-tested bridge example that uses only package export paths.
- Run it after build:

```bash
npm run build
node dist/examples/bridge-minimal.js
```
