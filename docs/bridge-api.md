# Ananke Bridge API — Renderer Integration

*Integration Milestone 3 — Asset Pipeline & Renderer Bridge*

---

## Purpose

The bridge module (`src/bridge/`) provides a **double‑buffered, tick‑rate‑independent interpolation layer** that connects the deterministic 20 Hz simulation kernel to a real‑time renderer running at 60 Hz or higher. It translates simulation‑side segment‑based injury and pose data into renderer‑side bone names, interpolates all visual state between simulation ticks, and guarantees deterministic output across runs.

This document is the tutorial-oriented integration guide. It assumes familiarity with the core simulation concepts described in the [Integration Primer](./integration-primer.md).

> **Stability contract and field-by-field type reference:** see [`docs/bridge-contract.md`](bridge-contract.md).

---

## 1. Architecture Overview

The bridge follows a **producer‑consumer** pattern:

- **Producer** (simulation thread, 20 Hz): calls `extractRigSnapshots`, `extractMotionVectors`, `extractConditionSamples` after each `stepWorld` and feeds the data to `BridgeEngine.update()`.
- **Consumer** (render thread, 60 Hz): calls `BridgeEngine.getInterpolatedState(entityId, renderTime_s)` for each visible entity every frame.

### Double‑buffered storage

The bridge retains exactly two simulation snapshots per entity: the **previous tick** (`prev`) and the **current tick** (`curr`). When a new tick arrives, `curr` moves to `prev` and the new data becomes `curr`. This allows smooth linear interpolation between ticks and a small amount of extrapolation when the render thread runs ahead of the simulation.

### Mapping system

Because the simulation works with **segment IDs** (e.g., `"leftArm"`, `"torso"`) while a 3D skeleton uses **bone names** (e.g., `"arm_L"`, `"spine_02"`), the bridge includes a configurable mapping layer. The host supplies a `BridgeConfig` with one `BodyPlanMapping` per body‑plan ID (`"humanoid"`, `"quadruped"`, etc.). Each mapping lists which segment ID maps to which bone name, plus optional positional offsets.

### Deterministic interpolation

All interpolation uses **fixed‑point arithmetic** (Q scale) and the same deterministic helper functions as the simulation kernel. Interpolation factors are derived from wall‑clock render times, but the resulting visual state is fully reproducible: the same simulation seed and the same render‑time sequence produce identical interpolated poses.

---

## 2. Data Flow

```
Simulation (20 Hz)
    │
    ▼
extractRigSnapshots(world)      → RigSnapshot[]
extractMotionVectors(world)     → MotionVector[]
extractConditionSamples(world)  → ConditionSample[]
    │
    ▼
BridgeEngine.update(snapshots, motion, condition)
    │
    ├── Stores TickSnapshot per entity (double‑buffered)
    ├── Updates simulation‑time bookkeeping
    └── Applies segment‑to‑bone mapping
    │
    │   Render (60 Hz)
    │       │
    │       ▼
    └──► getInterpolatedState(entityId, renderTime_s)
            │
            ├── Determine interpolation factor t ∈ [0, SCALE.Q]
            ├── Linear interpolation of position, velocity, facing, animation, pose, condition
            ├── Apply mapping to pose modifiers (segmentId → boneName)
            └── Return InterpolatedState
```

The bridge does **not** perform any rendering; it only transforms simulation data into a renderer‑ready format. The host is responsible for applying the returned `InterpolatedState` to its 3D skeleton, blending animations, and drawing the scene.

---

## 3. Mapping Configuration

### Core types

```typescript pseudocode
// One segment‑to‑bone correspondence
interface SegmentMapping {
  segmentId: string;      // matches BodySegment.id (e.g., "leftArm")
  boneName: string;       // renderer bone name (e.g., "arm_L")
  positionOffset?: Vec3;  // optional offset in fixed‑point metres (SCALE.m)
  rotationOffset?: Vec3;  // reserved for future use
}

// Complete mapping for one body plan
interface BodyPlanMapping {
  bodyPlanId: string;     // matches BodyPlan.id ("humanoid", "quadruped", …)
  segments: SegmentMapping[];
}

// Global bridge configuration
interface BridgeConfig {
  mappings: BodyPlanMapping[];
  extrapolationAllowed?: boolean;   // allow extrapolation beyond curr tick (default false)
  defaultBoneName?: string;         // bone name for unmapped segments (default "root")
}
```

### Mapping philosophy

The simulation defines several canonical body plans (see `src/sim/bodyplan.ts`). Each plan has a set of segment IDs that correspond to injury regions. The host must author a mapping that connects those segment IDs to the bone names used in its 3D skeleton.

**Example:** a humanoid skeleton might map:

| Segment ID | Bone name   | Notes                          |
|------------|-------------|--------------------------------|
| `head`     | `head`      |                                |
| `torso`    | `spine_02`  | Approximate torso centre       |
| `leftArm`  | `arm_L`     |                                |
| `rightArm` | `arm_R`     |                                |
| `leftLeg`  | `leg_L`     |                                |
| `rightLeg` | `leg_R`     |                                |

If a segment is not listed in the mapping, the bridge falls back to `defaultBoneName` (default `"root"`). This allows a minimal mapping that covers only the segments that need special bone names.

### Validation

Use `validateMappingCoverage(mapping, segmentIds)` (exported from `src/bridge/mapping.ts`) to verify that a mapping covers all segment IDs of a body plan. Missing segments will be logged as warnings; they will still work, but will be attached to the default bone.

---

## 4. Interpolation Details

All interpolation is performed with fixed‑point arithmetic (Q scale). The following components are interpolated:

| Component | Interpolation method | Notes |
|-----------|----------------------|-------|
| Position (`Vec3`) | Component‑wise linear (`lerpVec3`) | Uses `mulDiv` for fixed‑point correctness. |
| Velocity (`Vec3`) | Component‑wise linear | Same as position. |
| Facing direction (`Vec3`) | Cheap spherical interpolation (`slerpFacing`) | Linear interpolation followed by re‑normalisation; accurate for small angles. |
| Animation hints (`AnimationHints`) | Scalar weights lerped; boolean flags snap at `t >= SCALE.Q/2` | `prone`, `unconscious`, `dead` snap to `curr` value after halfway point. |
| Pose modifiers (`PoseModifier[]`) | Per‑segment interpolation of `structuralQ`, `surfaceQ`, `impairmentQ` | Segments missing in one snapshot are held constant. |
| Condition (`shockQ`, `fearQ`, …) | Scalar lerp; `dead` flag snaps at halfway point | `consciousness` and `fluidLoss` interpolated smoothly. |
| Grapple constraint | Snaps at halfway point | No smooth transition between grapple states. |

The interpolation factor **t** is computed as:

- **Normal interpolation** (`renderTime_s` between `prevTime_s` and `currTime_s`):
  `t = round((renderTime_s - prevTime_s) / (currTime_s - prevTime_s) * SCALE.Q)`
- **Hold** (render time before `prevTime_s` or after `currTime_s` with extrapolation disabled):
  `t = 0` (hold previous) or `t = SCALE.Q` (hold current).
- **Extrapolation** (render time after `currTime_s` with `extrapolationAllowed: true`):
  `t = SCALE.Q` plus velocity‑based position extrapolation.

Extrapolation is **disabled by default** because it can cause visible artefacts if the simulation stalls. Enable it only if your simulation tick rate is guaranteed to keep up with render time.

---

## 5. BridgeEngine API Reference

### Construction

```typescript pseudocode
import { BridgeEngine } from "ananke";

const config: BridgeConfig = {
  mappings: [humanoidMapping, quadrupedMapping],
  extrapolationAllowed: false,
  defaultBoneName: "root",
};
const engine = new BridgeEngine(config);
```

### Ingestion (simulation thread)

```typescript pseudocode
// After each stepWorld()
const snapshots = extractRigSnapshots(world);
const motion = extractMotionVectors(world);
const condition = extractConditionSamples(world);
engine.update(snapshots, motion, condition);
```

**Important:** call `update` **exactly once per simulation tick**, with data from that tick. The bridge uses the first snapshot’s `tick` field to advance its internal clock.

### Entity registration

If you know an entity’s body plan before its first snapshot arrives, register it:

```typescript pseudocode
engine.setEntityBodyPlan(entityId, "humanoid");
```

If not registered, the bridge assumes `"humanoid"` when the first snapshot arrives. You can change the body plan at any time; the mapping will apply to future snapshots.

### Retrieval (render thread)

```typescript pseudocode
// In your render loop, for each visible entity
const state = engine.getInterpolatedState(entityId, renderTime_s);
if (state) {
  // Apply state.position_m, state.facing, state.poseModifiers, etc.
}
```

`renderTime_s` is a monotonic real‑time clock (seconds). The bridge converts it to simulation time using the tick‑to‑second conversion defined in `DT_S` and `SCALE.s`.

### Utility methods

- `engine.updateConfig(config)` – change configuration at runtime (does not affect stored snapshots).
- `engine.hasEntity(entityId)` – check if the bridge has any snapshots for this entity.
- `engine.removeEntity(entityId)` – delete all stored snapshots (e.g., after entity death).
- `engine.clear()` – reset the entire bridge (all entities, all snapshots).
- `engine.getLatestSimTime()` – simulation time (seconds) of the most recent tick.
- `engine.getLatestTick()` – tick number of the most recent snapshot.

---

## 6. Integration Guide

### Step‑by‑step setup

1. **Author mappings** for each body plan your game uses. Start with the humanoid plan; use `segmentIds(HUMANOID_PLAN)` to get the canonical segment IDs.

2. **Create the bridge engine** early in your application lifecycle, before the simulation starts.

3. **In the simulation loop**, after `stepWorld`, call the three extractor functions and pass the results to `engine.update()`.

4. **In the render loop**, for each visible entity, call `engine.getInterpolatedState()` with the current render time (typically `performance.now() / 1000`).

5. **Apply the interpolated state** to your skeleton:
   - Position and facing go directly to the root transform.
   - Map each `poseModifiers` entry to its bone (using `boneName`) and adjust vertex shader weights or morph targets accordingly.
   - Use `animation` weights to blend between idle/walk/run/etc. animations.
   - Use `condition.shockQ` and `condition.fearQ` to drive post‑processing effects (screen shake, colour grading).

### Example: minimal humanoid mapping

```typescript pseudocode
import { HUMANOID_PLAN, segmentIds } from "ananke";

const humanoidMapping: BodyPlanMapping = {
  bodyPlanId: "humanoid",
  segments: [
    { segmentId: "head",    boneName: "head" },
    { segmentId: "torso",   boneName: "spine_02" },
    { segmentId: "leftArm", boneName: "arm_L" },
    { segmentId: "rightArm", boneName: "arm_R" },
    { segmentId: "leftLeg", boneName: "leg_L" },
    { segmentId: "rightLeg", boneName: "leg_R" },
  ],
};

// Validate
const missing = validateMappingCoverage(humanoidMapping, segmentIds(HUMANOID_PLAN));
if (missing.length > 0) console.warn("Unmapped segments:", missing);
```

### Tick‑rate independence

The bridge is designed for a simulation running at `TICK_HZ` (20 Hz) and a renderer at any higher frequency. If your simulation runs at a different tick rate, adjust `DT_S` in `src/sim/tick.ts` **before building the engine**. The bridge reads `DT_S` once at module load.

If the simulation stalls (e.g., a long blocking operation), the render thread will eventually run out of extrapolation buffer. With `extrapolationAllowed: false` the entity will simply hold its last known pose until a new tick arrives. This is usually preferable to visual jitter.

---

## 7. Performance Considerations

- **Memory**: two `TickSnapshot`s per entity, each containing position, velocity, facing, animation hints, pose array, condition, and grapple state. For 1000 entities this is about 2 MB.
- **CPU**: interpolation is O(segments) per entity per render frame. Pose‑modifier interpolation uses a `Map` lookup per segment; consider caching the bone‑name mapping on the renderer side.
- **Determinism overhead**: the bridge uses fixed‑point `mulDiv` for all interpolations, which is slower than floating‑point multiplication but guarantees deterministic results. Profile if you see performance issues with thousands of entities.

### Optimisation tips

- Call `getInterpolatedState` only for **visible entities**. Use frustum culling or LOD distance checks.
- If your renderer runs at a fixed 60 Hz, you can pre‑compute interpolation factors once per frame and reuse them for all entities.
- For entities with identical body plans, share the same `BodyPlanMapping` object.

---

## 8. Gotchas

### Exact optional property types

As with the rest of Ananke, `exactOptionalPropertyTypes` is enabled. When constructing `BridgeConfig`, do **not** set `extrapolationAllowed: undefined`; omit the property entirely if you want the default `false`.

### Default bone name

If a segment is not mapped, its pose modifiers will be attached to the `defaultBoneName` bone (`"root"` by default). This can cause unexpected visual effects if you forget to map a segment. Always call `validateMappingCoverage` during development.

### Extrapolation artefacts

Extrapolation uses linear velocity projection. If an entity is accelerating (e.g., turning), the extrapolated position will drift. Keep extrapolation disabled unless your simulation tick rate is high enough that extrapolation intervals are shorter than a few milliseconds.

### Grapple and boolean snapping

Grapple constraints and boolean flags (`prone`, `unconscious`, `dead`) snap at the midpoint of interpolation (`t >= SCALE.Q/2`). This can cause a visible “pop” if the simulation tick rate is low. Consider blending grapple states on the renderer side if smooth transitions are required.

### Mapping changes at runtime

Changing a mapping via `updateConfig` does **not** affect already stored snapshots; only new snapshots will use the new mapping. If you need to re‑map existing data, call `clear()` and re‑ingest snapshots (requires keeping a history of past ticks, which the bridge does not provide).

---

## 9. Example Code

A complete working example is available in `tools/bridge‑demo.ts`. It demonstrates:

- Setting up mappings for humanoid and quadruped body plans.
- Creating a simple world with two entities.
- Running a 20 Hz simulation loop and feeding the bridge.
- Simulating a 60 Hz render loop and printing interpolated states.
- Verifying determinism across runs.

Run the demo with `npm run run:bridge‑demo`.

---

## 10. Conclusion

The bridge module completes the pipeline from deterministic simulation to real‑time visualisation. It handles tick‑rate conversion, segment‑to‑bone mapping, and deterministic interpolation, allowing the host renderer to focus on asset‑specific rendering tasks.

With the bridge in place, an integration team can proceed to **Milestone 4 (Systematic Validation)** with a fully visualised simulation, ready for calibration against real‑world data.

*Generated by Claude Code during Integration Milestone 3, March 2026.*