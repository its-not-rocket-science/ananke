# Ananke — Host Integration Contract

*Platform Hardening PH-3 — Minimal Host Integration Contract*

> **Scope:** This document covers only **Tier 1 (Stable)** exports.  Every symbol listed
> here will not change in a breaking way without a major semver bump and a migration guide.
> See [`STABLE_API.md`](../STABLE_API.md) and [`docs/versioning.md`](versioning.md) for
> the full tier table and stability guarantees.
>
> An engineer can embed Ananke in a host process using only this document and the three
> [quickstart examples](#quickstart-examples) below — no `src/` reading required.

---

## 1 · World creation

```typescript
import { mkWorld } from "ananke"; // src/sim/testing — Tier 3 helper, quickstart-safe

const world = mkWorld(seed, entities);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `seed` | `number` | World RNG seed.  Same seed + same commands → identical output forever |
| `entities` | `Entity[]` | Initial entity list.  IDs must be unique; `mkWorld` throws on duplicates |

`mkWorld` returns a `WorldState` with `tick: 0`.  Entities are sorted by `id` ascending.

**`WorldState` shape (stable fields):**

```typescript
interface WorldState {
  tick:     number;   // current tick; incremented by stepWorld
  seed:     number;   // RNG seed passed at creation
  entities: Entity[]; // all live and dead entities; do not splice manually
}
```

> **Note on `createWorld`:** A `createWorld()` function will replace `mkWorld` when the
> companion ecosystem ships (CE-2).  Until then, use `mkWorld(seed, entities)`.

---

## 2 · Command injection (input protocol)

Commands tell entities what to do next tick.  They are **consumed and cleared** by
`stepWorld`; you rebuild the map every tick.

```typescript
import type { CommandMap, Command } from "ananke";

// One entity can have multiple commands in priority order.
const cmds: CommandMap = new Map<number, readonly Command[]>();

cmds.set(entityId, [
  { kind: "attack",  targetId: 2, weaponSlot: "mainHand" },
]);

stepWorld(world, cmds, ctx);
```

**Common command kinds** (all Tier 1):

| `kind` | Required fields | Effect |
|--------|----------------|--------|
| `"move"` | `direction: Vec3, speed_mps: I32` | Move entity in direction at speed |
| `"attack"` | `targetId: number, weaponSlot: string` | Initiate a weapon attack |
| `"defend"` | `style: "block"\|"parry"\|"dodge"` | Adopt a defensive posture |
| `"grapple"` | `targetId: number, mode: GrappleMode` | Initiate or advance a grapple |
| `"treat"` | `targetId: number` | Apply first aid to a target |
| `"set_prone"` | `prone: boolean` | Go prone or stand up |

Entities without a command in the map are idle (continue any ongoing action or stand still).

---

## 3 · `stepWorld` — call contract

```typescript
import { stepWorld } from "ananke";
import type { KernelContext } from "ananke";

const ctx: KernelContext = {
  tractionCoeff: q(0.80),   // ground friction, typically q(0.75)–q(1.0)
};

stepWorld(world, cmds, ctx); // mutates world in place, returns void
```

**Contract:**

| Property | Value |
|----------|-------|
| Return value | `void` — world is mutated in place |
| `world.tick` after call | incremented by 1 |
| Determinism | `stepWorld(clone(world), cmds, ctx)` ≡ `stepWorld(world, cmds, ctx)` for identical inputs |
| Thread safety | Not thread-safe.  Call from one thread; snapshot with `structuredClone` for parallel reads |
| `cmds` after call | Map entries are not modified; safe to reuse or discard |
| `ctx` after call | `ctx.tractionCoeff` may be modified if `ctx.weather` applies weather modifiers |

**`KernelContext` required fields:**

| Field | Type | Notes |
|-------|------|-------|
| `tractionCoeff` | `Q` | Ground friction for movement.  Use `q(0.80)` as a safe default |

**`KernelContext` optional fields (all Tier 2 or Tier 3):**

| Field | Effect when provided |
|-------|---------------------|
| `tuning` | Override default tuning constants (tactical / campaign / downtime preset) |
| `sensoryEnv` | Ambient lighting, visibility range — defaults to full daylight |
| `weather` | Applies rain/snow/wind modifiers to traction and senses |
| `terrainGrid` | Per-cell traction lookup by entity position |
| `obstacleGrid` | Impassable and partial-cover cells |
| `elevationGrid` | Height above ground — affects reach and projectile range |
| `ambientTemperature_Q` | Drives thermoregulation (heat/cold stress) |
| `techCtx` | Technology era gate for era-appropriate item validation |
| `trace` | Attach a `TraceSink` to receive per-tick debug events |

---

## 4 · Replay and serialization

Replays work because `stepWorld` is a **pure function** of `(WorldState, CommandMap, KernelContext)`.
Recording snapshots the initial world and logs commands; replaying re-applies them in order.

### Recording

```typescript
import { ReplayRecorder } from "ananke/replay"; // src/replay.ts (Tier 2)

const recorder = new ReplayRecorder(world); // deep-clones world at tick 0

for (let i = 0; i < N; i++) {
  const cmds = buildCommands(world);
  recorder.record(world.tick, cmds);     // log before step
  stepWorld(world, cmds, ctx);
}

const replay = recorder.toReplay(); // { initialState, frames }
```

### Serialization

```typescript
import { serializeReplay, deserializeReplay } from "ananke/replay";

const json   = serializeReplay(replay);   // → string (JSON)
const replay2 = deserializeReplay(json);  // → Replay
```

`serializeReplay` / `deserializeReplay` round-trip is a **Tier 1 contract**: a serialized
replay from version `0.x.y` must deserialize and replay identically on version `0.x.z` (same
minor, higher patch).

### Replaying to a target tick

```typescript
import { replayTo } from "ananke/replay";

const worldAtTick50 = replayTo(replay, 50, ctx);
// Returns a fresh WorldState cloned from the replay; does not mutate replay.
```

---

## 5 · Bridge data extraction (3D renderer integration)

The bridge layer converts simulation state into renderer-friendly types.  Extract each tick
after `stepWorld` and pass to `BridgeEngine.update()`.

```typescript
import { extractRigSnapshots, deriveAnimationHints } from "ananke"; // src/model3d.ts (Tier 2)
import { BridgeEngine } from "ananke";                              // src/bridge/index.ts (Tier 2)

// --- simulation side ---
const snapshots = extractRigSnapshots(world);       // RigSnapshot[] — one per entity
stepWorld(world, cmds, ctx);

// --- renderer side (may run at higher frame rate) ---
engine.update(snapshots, motionVectors);
const state = engine.getInterpolatedState(entityId, renderTime_s);
// state: { position_m, velocity_mps, facing, animation, poseModifiers, … }
```

**Key types:**

| Type | Source | Description |
|------|--------|-------------|
| `RigSnapshot` | `extractRigSnapshots(world)[i]` | Per-entity rig data at one tick |
| `AnimationHints` | `deriveAnimationHints(entity)` | State flags: `isMoving`, `isGrappling`, `shockQ`, etc. |
| `PoseModifier[]` | `derivePoseModifiers(entity)` | Per-segment injury weight for bone deformation |
| `GrapplePoseConstraint` | `deriveGrappleConstraint(entity)` | IK constraint for grappling pairs |

See [`docs/bridge-contract.md`](bridge-api.md) for the full double-buffer protocol and
interpolation/extrapolation semantics.

---

## 6 · Quickstart-safe helpers

These Tier 3 functions are **safe to use in quickstarts** despite being officially internal.
They are small, stable in practice, and documented here to avoid source-diving.

| Helper | Signature | Notes |
|--------|-----------|-------|
| `mkWorld(seed, entities)` | `(number, Entity[]) → WorldState` | Create a world from entity array |
| `mkHumanoidEntity(id, attrs?)` | `(number, Partial<IndividualAttributes>?) → Entity` | Build a humanoid entity with defaults |
| `generateIndividual(seed, archetype)` | `(number, Archetype) → IndividualAttributes` | Stat-rolled entity attributes (Tier 1) |

---

## Quickstart examples

### Minimal 1v1 duel loop

```typescript
import { mkWorld, mkHumanoidEntity, stepWorld, q } from "ananke";
import type { CommandMap } from "ananke";

const a = mkHumanoidEntity(1);
const b = mkHumanoidEntity(2);
const world = mkWorld(42, [a, b]);

const ctx = { tractionCoeff: q(0.80) };

for (let tick = 0; tick < 200 && !a.dead && !b.dead; tick++) {
  const cmds: CommandMap = new Map([
    [1, [{ kind: "attack", targetId: 2, weaponSlot: "mainHand" }]],
    [2, [{ kind: "attack", targetId: 1, weaponSlot: "mainHand" }]],
  ]);
  stepWorld(world, cmds, ctx);
}

console.log(`a.dead=${a.dead}  b.dead=${b.dead}  ticks=${world.tick}`);
```

### Record and replay

```typescript
import { mkWorld, mkHumanoidEntity, stepWorld, q } from "ananke";
import { ReplayRecorder, serializeReplay, deserializeReplay, replayTo } from "ananke/replay";

const world = mkWorld(99, [mkHumanoidEntity(1), mkHumanoidEntity(2)]);
const ctx   = { tractionCoeff: q(0.80) };
const rec   = new ReplayRecorder(world);

for (let tick = 0; tick < 50; tick++) {
  const cmds = new Map([[1, [{ kind: "attack", targetId: 2, weaponSlot: "mainHand" }]]]);
  rec.record(world.tick, cmds);
  stepWorld(world, cmds, ctx);
}

const json    = serializeReplay(rec.toReplay());
const replay2 = deserializeReplay(json);
const world50 = replayTo(replay2, 50, ctx);

console.log("replay deterministic:", world50.entities[0]!.shock === world.entities[0]!.shock);
```

### 3D renderer integration (bridge)

```typescript
import { mkWorld, mkHumanoidEntity, stepWorld, q } from "ananke";
import { extractRigSnapshots } from "ananke";
import { BridgeEngine } from "ananke";

const world  = mkWorld(1, [mkHumanoidEntity(1), mkHumanoidEntity(2)]);
const engine = new BridgeEngine({ mappings: [], defaultBoneName: "root" });
const ctx    = { tractionCoeff: q(0.80) };

engine.setEntityBodyPlan(1, "humanoid");
engine.setEntityBodyPlan(2, "humanoid");

function gameLoop(renderTime_s: number) {
  const snaps = extractRigSnapshots(world);
  stepWorld(world, new Map(), ctx);
  engine.update(snaps);

  // Renderer queries at any sub-tick time
  const state = engine.getInterpolatedState(1, renderTime_s);
  if (state) {
    // state.position_m, state.facing, state.animation, state.poseModifiers…
  }
}
```

---

## Error handling

`stepWorld` does not throw under normal operation.  Errors you may encounter:

| Situation | Error | Fix |
|-----------|-------|-----|
| Duplicate entity IDs passed to `mkWorld` | `Error: mkWorld: duplicate entity IDs` | Ensure each entity has a unique `id` |
| `deserializeReplay(json)` called with malformed JSON | `SyntaxError` | Validate JSON before deserializing |
| `replayTo(replay, tick, ctx)` with `tick > replay.frames.length` | Returns world at final recorded tick | Check `replay.frames.length` before calling |

---

## What this document does NOT cover

- **Subsystem APIs** (disease, sleep, aging, mount, hazard) — see [`STABLE_API.md`](../STABLE_API.md) §Tier 2
- **Bridge internals** — see [`docs/bridge-api.md`](bridge-api.md)
- **Validation and calibration** — see [`tools/validation.ts`](../tools/validation.ts)
- **Downtime and campaign simulation** — see [`src/downtime.ts`](../src/downtime.ts)
- **Quest, settlement, narrative subsystems** — see [`STABLE_API.md`](../STABLE_API.md) §Tier 2
