# Ananke Bridge Contract

*Platform Hardening PH-5 — Bridge as First-Class Supported Surface*

> **Stability:** All symbols in this document are **Tier 1 (Stable)**.
> They will not change in a breaking way without a major semver bump and a migration guide.
> See [`docs/versioning.md`](versioning.md) and [`STABLE_API.md`](../STABLE_API.md) for the full
> stability policy.
>
> For the tutorial-oriented integration guide (step-by-step setup, mapping configuration,
> performance tips) see [`docs/bridge-api.md`](bridge-api.md).

---

## Purpose

This document is the authoritative **integration contract** for the Ananke renderer bridge.
A renderer developer can implement a correct, forwards-compatible bridge consumer using only
this document and the [quickstart example](#quickstart-example) below — no source reading required.

---

## 1. Overview: Double-Buffer Protocol

The bridge operates as a **double-buffered producer-consumer**:

| Role | Caller | Rate | Entry point |
|------|--------|------|-------------|
| **Write side** (simulation) | host simulation thread | 20 Hz | `BridgeEngine.update(snapshots)` |
| **Read side** (renderer) | host render thread | 60 Hz+ | `BridgeEngine.getInterpolatedState(id, t)` |

**Write-side contract:**

1. After each `stepWorld(world, cmds, ctx)` call, extract the current state:
   ```typescript
   const snapshots = extractRigSnapshots(world);   // RigSnapshot[] — one per entity
   ```
2. Call `engine.update(snapshots)` exactly once per simulation tick.
3. The bridge stores the two most recent snapshots per entity (previous and current).
   On the next `update`, `curr` becomes `prev` and the new snapshot becomes `curr`.

**Read-side contract:**

1. Call `engine.getInterpolatedState(entityId, renderTime_s)` once per entity per render frame.
2. `renderTime_s` is a monotonic real-time clock in seconds (e.g., `performance.now() / 1000`).
3. The bridge returns `null` if no snapshots exist for the entity yet; always null-check the result.
4. The returned `InterpolatedState` is a **snapshot** — do not hold references between frames.

---

## 2. Interpolation and Extrapolation Semantics

The interpolation factor **t** is computed from `renderTime_s` relative to the two stored
simulation timestamps (`prevTime_s`, `currTime_s`):

| Condition | Behaviour | t value |
|-----------|-----------|---------|
| `renderTime < prevTime` | Hold previous snapshot | `0` |
| `prevTime ≤ renderTime ≤ currTime` | Normal linear interpolation | `(renderTime - prevTime) / (currTime - prevTime)` |
| `renderTime > currTime`, `extrapolationAllowed: false` | Hold current snapshot | `SCALE.Q` |
| `renderTime > currTime`, `extrapolationAllowed: true` | Velocity-based extrapolation | `> SCALE.Q` |

**Determinism guarantee:** For a given simulation seed and command sequence, calling
`getInterpolatedState(id, t)` with the same `t` value always returns identical output.
This guarantee holds only when `extrapolationAllowed` is `false` (the default).

**Extrapolation warning:** Extrapolation uses linear velocity projection. It can produce
artefacts if entities are accelerating or turning. Enable it only if your simulation tick rate
reliably keeps up with render time.

---

## 3. Body-Plan Segment ID Mapping Conventions

### Canonical segment IDs

Segment IDs are **camelCase** strings matching Ananke's injury region keys:

| Segment ID  | Body location                |
|-------------|------------------------------|
| `head`      | Head and skull               |
| `torso`     | Thorax and upper trunk       |
| `leftArm`   | Left arm (shoulder to hand)  |
| `rightArm`  | Right arm                    |
| `leftLeg`   | Left leg (hip to foot)       |
| `rightLeg`  | Right leg                    |

Additional segments appear in non-humanoid body plans (e.g., `tail`, `wing`, `midleg`).
Use `segmentIds(bodyPlan)` to enumerate a plan's canonical segment IDs at runtime.

### Supplying a mapping

```typescript
const humanoidMapping: BodyPlanMapping = {
  bodyPlanId: "humanoid",
  segments: [
    { segmentId: "head",     boneName: "head"     },
    { segmentId: "torso",    boneName: "spine_02" },
    { segmentId: "leftArm",  boneName: "arm_L"    },
    { segmentId: "rightArm", boneName: "arm_R"    },
    { segmentId: "leftLeg",  boneName: "leg_L"    },
    { segmentId: "rightLeg", boneName: "leg_R"    },
  ],
};
```

Unmapped segments fall back to `defaultBoneName` (default `"root"`). Use
`validateMappingCoverage(mapping, segmentIds(plan))` during development to catch gaps.

---

## 4. `AnimationHints` Field-by-Field Contract

`AnimationHints` is derived by `deriveAnimationHints(entity)` and embedded in every
`RigSnapshot`. All Q values are integers in `[0, SCALE.Q]` where `SCALE.Q = 10 000` ≡ 1.0.

### Locomotion blend weights (mutually exclusive)

Exactly one of `idle`, `walk`, `run`, `sprint`, `crawl` equals `SCALE.Q` when the entity is
mobile. All five are `0` when the entity is dead or unconscious.

| Field    | Type | Value | Usage |
|----------|------|-------|-------|
| `idle`   | `Q`  | `SCALE.Q` when standing still; `0` otherwise | Blend in idle animation clip |
| `walk`   | `Q`  | `SCALE.Q` when walking; `0` otherwise | Blend in walk clip |
| `run`    | `Q`  | `SCALE.Q` when running; `0` otherwise | Blend in run clip |
| `sprint` | `Q`  | `SCALE.Q` when sprinting; `0` otherwise | Blend in sprint clip |
| `crawl`  | `Q`  | `SCALE.Q` when crawling (prone movement); `0` otherwise | Blend in crawl clip |

### Combat blend weights

| Field        | Type | Value | Usage |
|--------------|------|-------|-------|
| `guardingQ`  | `Q`  | `0`–`SCALE.Q` — derived from `intent.defence.intensity` | Blend in guard/parry pose; `0` when not defending or dead |
| `attackingQ` | `Q`  | `SCALE.Q` while attack cooldown is active; `0` otherwise | Blend in swing/recovery animation; snaps off when cooldown expires |

### Physiological condition

| Field    | Type | Value | Usage |
|----------|------|-------|-------|
| `shockQ` | `Q`  | `0`–`SCALE.Q` — direct pass-through of `entity.injury.shock` | Drive screen shake, stagger blend, vignette intensity |
| `fearQ`  | `Q`  | `0`–`SCALE.Q` — direct pass-through of `entity.condition.fearQ` | Drive breathing rate, idle fidget blend, visual effects |

### Boolean state flags

| Field         | Type      | True when | Usage |
|---------------|-----------|-----------|-------|
| `prone`       | `boolean` | `intent.prone` is true, OR grapple position is `"prone"` or `"pinned"` | Switch to prone animation layer |
| `unconscious` | `boolean` | `!dead` AND `consciousness < 0.20` (2000/10 000) | Switch to unconscious pose; suppress all locomotion |
| `dead`        | `boolean` | `entity.injury.dead === true` | Switch to death pose; freeze all animation |

**Priority:** `dead` overrides `unconscious`; `unconscious` overrides locomotion.
When `dead` is `true`, all locomotion weights are `0` and `unconscious` is `false`.

### Interpolation behaviour

When interpolated by `BridgeEngine`, locomotion weights and condition Q values are lerped
linearly. Boolean flags (`prone`, `unconscious`, `dead`) snap to the new value when the
interpolation factor `t ≥ SCALE.Q / 2` (the midpoint of the tick interval).

---

## 5. `GrapplePoseConstraint` Usage Contract

`GrapplePoseConstraint` is derived by `deriveGrappleConstraint(entity)` and embedded in every
`RigSnapshot`. Use it to drive IK constraints or bone locks in your renderer when two entities
are grappling.

### Fields

| Field              | Type              | Description |
|--------------------|-------------------|-------------|
| `isHolder`         | `boolean`         | `true` when this entity is actively holding another |
| `holdingEntityId`  | `number?`         | ID of the entity being held; **present only when `isHolder === true`** |
| `isHeld`           | `boolean`         | `true` when this entity is being held by one or more others |
| `heldByIds`        | `number[]`        | IDs of entities currently holding this entity; empty array when `isHeld === false` |
| `position`         | `GrapplePosition` | Current positional state: `"standing"` \| `"prone"` \| `"pinned"` \| `"mounted"` |
| `gripQ`            | `Q`               | Grip strength `[0, SCALE.Q]`; `0` when not grappling |

### Usage patterns

**Non-grappling entity (default state):**
```
isHolder: false
isHeld:   false
heldByIds: []
position: "standing"
gripQ:    0
```

**Holder entity:**
```
isHolder:        true
holdingEntityId: <target entity ID>
isHeld:          false  (unless simultaneously held by someone else)
position:        "standing" | "mounted" | etc.
gripQ:           > 0
```

**Held entity:**
```
isHolder: false  (unless simultaneously holding someone else)
isHeld:   true
heldByIds: [<holder entity ID>, ...]
position: "prone" | "pinned" | "standing" | etc.
gripQ:    0
```

### Renderer usage

1. For each render frame, call `deriveGrappleConstraint` (or read it from `RigSnapshot.grapple`).
2. If `isHolder === true` and `isHeld === false`: the holder drives the constraint; lock the
   held entity's root to the holder's grip anchor point.
3. If `isHeld === true`: this entity's root is constrained; disable its root transform update
   and apply the holder's transform instead.
4. `position` drives the animation layer: `"prone"` or `"pinned"` → floor-level pose.
5. `gripQ` can drive a blend towards a "full grip" animation pose for the holder.

**Important:** `holdingEntityId` is an optional property and is absent (not `undefined`)
when `isHolder === false` — do not read it without checking `isHolder` first.

**Interpolation behaviour:** Grapple constraints snap at `t ≥ SCALE.Q / 2` (no smooth
transition between grapple states).

---

## 6. `InterpolatedState` Shape

`BridgeEngine.getInterpolatedState(id, t)` returns `InterpolatedState | null`.

| Field               | Type            | Description |
|---------------------|-----------------|-------------|
| `entityId`          | `number`        | Entity ID |
| `tick`              | `number`        | Most recent simulation tick |
| `interpolationFactor` | `number`      | The computed `t` value `[0, SCALE.Q]` |
| `position_m`        | `{ x, y, z }`  | World-space position in **real metres** (already divided by `SCALE.m`) |
| `velocity_mps`      | `{ x, y, z }`  | Velocity in metres per second |
| `facing`            | `{ x, y, z }`  | Unit facing vector (normalised) |
| `animation`         | `AnimationHints` | Interpolated animation hints (see §4) |
| `poseModifiers`     | `PoseModifier[]` | Per-segment injury deformation weights (one per mapped segment) |
| `grapple`           | `GrapplePoseConstraint` | Grapple state (snaps at midpoint; see §5) |
| `condition`         | `{ shockQ, fearQ, consciousnessQ, fluidLossQ }` | Interpolated condition scalars |

---

## 7. Scale Conventions

All lengths in the simulation are stored as **fixed-point integers** with `SCALE.m = 10 000`
(10 000 units = 1 metre). `InterpolatedState.position_m` has already been converted to real
metres by the bridge.

| What you receive | Unit | Conversion if needed |
|-----------------|------|----------------------|
| `position_m` from `InterpolatedState` | Real metres (float) | Already converted |
| `position_m` from raw `Entity` | `SCALE.m` units (integer) | Divide by `SCALE.m` |
| Q values (`shockQ`, `fearQ`, etc.) | `[0, SCALE.Q]` integer | Divide by `SCALE.Q` for `[0, 1]` float |

Always import and use `SCALE.m` / `SCALE.Q` rather than hardcoding `10000`:
```typescript
import { SCALE } from "ananke";
const shockFloat = hints.shockQ / SCALE.Q; // → [0, 1]
```

---

## 8. Quickstart Example

```typescript
import { mkWorld, mkKnight, stepWorld, q,
         extractRigSnapshots, BridgeEngine } from "ananke";

// --- Setup ---
const world  = mkWorld(42, [mkKnight(1, 1, 0, 0), mkKnight(2, 2, 10000, 0)]);
const engine = new BridgeEngine({ mappings: [], defaultBoneName: "root" });
const ctx    = { tractionCoeff: q(0.80) };

engine.setEntityBodyPlan(1, "humanoid");
engine.setEntityBodyPlan(2, "humanoid");

// --- Simulation loop (20 Hz) ---
function simTick(): void {
  const snapshots = extractRigSnapshots(world);
  stepWorld(world, new Map(), ctx);
  engine.update(snapshots);
}

// --- Render loop (60 Hz) ---
function renderFrame(renderTime_s: number): void {
  const state = engine.getInterpolatedState(1, renderTime_s);
  if (!state) return;                       // no snapshots yet

  // state.position_m is already in metres
  myRenderer.setPosition(state.position_m.x, state.position_m.y);

  // Drive animations from AnimationHints
  myAnimator.setIdleWeight(state.animation.idle   / SCALE.Q);
  myAnimator.setWalkWeight(state.animation.walk   / SCALE.Q);
  myAnimator.setRunWeight (state.animation.run    / SCALE.Q);
  myAnimator.setDead      (state.animation.dead);
  myAnimator.setProne     (state.animation.prone);

  // Drive per-region deformation
  for (const mod of state.poseModifiers) {
    myRenderer.setInjuryBlend(mod.boneName, mod.impairmentQ / SCALE.Q);
  }
}
```

---

## 9. Stability Promise

All types and functions listed in this document are **Tier 1 (Stable)**. See
[`STABLE_API.md`](../STABLE_API.md) for the full tier table and breaking-change policy.

| Export | Source module |
|--------|---------------|
| `extractRigSnapshots` | `src/model3d.ts` |
| `deriveAnimationHints` | `src/model3d.ts` |
| `derivePoseModifiers` | `src/model3d.ts` |
| `deriveGrappleConstraint` | `src/model3d.ts` |
| `deriveMassDistribution` | `src/model3d.ts` |
| `deriveInertiaTensor` | `src/model3d.ts` |
| `BridgeEngine` | `src/bridge/bridge-engine.ts` |
| `BridgeConfig`, `BodyPlanMapping`, `SegmentMapping` | `src/bridge/types.ts` |
| `InterpolatedState` | `src/bridge/types.ts` |
| `AnimationHints` | `src/model3d.ts` |
| `GrapplePoseConstraint` | `src/model3d.ts` |
| `PoseModifier` | `src/model3d.ts` |
| `RigSnapshot` | `src/model3d.ts` |

*Generated by Claude Code during Platform Hardening PH-5, March 2026.*
