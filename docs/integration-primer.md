# Ananke Integration Primer

*Integration & Adoption Milestone 2 — Deep Integration & Technical Onboarding*

---

## Purpose

> **New to Ananke?** Start with [`docs/host-contract.md`](host-contract.md) — it covers the
> complete stable integration surface with working code examples.  Return here for
> architecture diagrams, type glossary, and integration gotchas.

This document captures the technical insights, data‑flow diagrams, type glossaries, and gotchas discovered during the 2–4 week evaluation spike described in the ROADMAP’s **Deep Integration & Technical Onboarding** milestone. It is intended as an internal reference for engineers who will be integrating Ananke into a production game or simulation.

The spike consisted of three concrete experiments:

1. **Tracing the data flow of a simple melee attack** — from `Command` input through the kernel to injury output (`tools/trace‑attack.ts`).
2. **Building a minimal observer** that reads `WorldState` after each `stepWorld` call and prints entity positions, condition, and injury summaries (`tools/observer.ts`).
3. **Experimenting with saving and loading a complete `WorldState`** to understand the serialisation format and any Map/BigInt round‑trip concerns (`tools/serialize.ts`).

Each experiment is documented below, followed by a glossary of critical types and a list of integration gotchas.

---

## 1. Architecture Overview

Ananke is a deterministic, lockstep‑friendly simulation kernel that models entities using **real physical quantities** stored as **fixed‑point integers** (Q‑scaled values). The simulation proceeds in discrete ticks (default 20 Hz). Each tick, the host supplies a `CommandMap` keyed by entity ID; the kernel advances the `WorldState` and returns the updated state.

### Core data structures

```typescript
interface WorldState {
  tick: number;
  seed: number;
  entities: Entity[];
  activeFieldEffects?: FieldEffect[];
  __sensoryEnv?: any; // internal side‑channel
}

interface Entity {
  id: number;
  teamId: number;
  attributes: IndividualAttributes; // physical capabilities
  energy: { reserveEnergy_J: number; fatigue: Q };
  loadout: { items: EquipmentItem[] };
  position_m: Vec3;
  velocity_mps: Vec3;
  intent: IntentState;          // derived from previous tick’s commands
  action: ActionState;          // cooldowns, active binds, etc.
  condition: ConditionState;    // fear, morale, sensory modifiers
  injury: InjuryState;          // per‑region damage, shock, consciousness
  grapple: GrappleState;
  // optional maps (foodInventory, armourState, reputations)
}

type CommandMap = Map<number, Command[]>;
```

### Kernel entry point

```typescript
function stepWorld(
  world: WorldState,
  commands: CommandMap,
  ctx: KernelContext
): void;
```

The kernel **mutates** `world` in place. All randomness is derived from `world.seed` and the current tick, ensuring determinism across runs.

---

## 2. Data Flow of a Melee Attack

The file `tools/trace‑attack.ts` instruments a single tick with a `CollectingTrace` sink and prints every event emitted by the kernel. The following pipeline is observed (events appear in this order):

1. **`TickStart`** — kernel clears the internal `ImpactEvent` queue.
2. **`Intent`** — entity’s intent state (derived from previous tick’s commands) is captured before movement.
3. **`Move`** — movement resolved; position and velocity updated.
4. **`AttackAttempt`** — `resolveAttack` performs the hit roll, block/parry check, area selection, and hit‑quality computation.
5. **`Attack`** — `resolveHit` delivers energy to the selected region, accounts for armour/shield penetration, and accumulates injury.
6. **`Injury`** — `stepConditionsToInjury` updates shock, fluid‑loss, and consciousness from the accumulated damage.
7. **`TickEnd`** — all queued `ImpactEvent`s are applied and the tick’s state is finalised.

> **Key insight:** Injury accumulation is deferred until the `Injury` event; multiple attacks in the same tick are queued and resolved together, preserving ordering determinism.

### Example trace output (abridged)

```
[attackAttempt] tick=0 attackerId=1 targetId=2 hit=true blocked=false area="torso"
[attack] tick=0 attackerId=1 targetId=2 weaponId="wpn_club" region="torso" energy_J=285
[injury] tick=0 entityId=2 dead=false shockQ=74 consciousnessQ=9977
```

The trace shows that a club strike delivering 285 J to the torso raised the target’s shock by 0.74 % (74 Q) and lowered consciousness by 0.23 %.

---

## 3. Observing WorldState Each Tick

The observer (`tools/observer.ts`) demonstrates how to hook into the `stepWorld` loop, extract per‑tick entity state, and format it for debugging or visualisation. It uses two pure data‑extraction functions from `src/debug.ts`:

- `extractMotionVectors(world)` → `{ entityId, position_m, velocity_mps, facing }`
- `extractConditionSamples(world)` → `{ entityId, shock, consciousness, fearQ, fluidLoss, dead }`

### Observer pattern

```typescript
for (let tick = 0; tick < maxTicks; tick++) {
  // 1. Build indexes (required for AI decisions, but we hard‑code commands)
  const index   = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, 4 * SCALE.m);

  // 2. Generate commands (hard‑coded in this example)
  const cmds: CommandMap = new Map();
  cmds.set(1, [makeAttackCommand(2, ...)]);
  cmds.set(2, [defendBlock(...)]);

  // 3. Extract and print state BEFORE the tick
  const motion = extractMotionVectors(world);
  const condition = extractConditionSamples(world);
  // … format and log …

  // 4. Execute the tick
  stepWorld(world, cmds, ctx);

  // 5. Stop early if a termination condition is met
  if (target.injury.dead || target.injury.consciousness <= 0) break;
}
```

> **Key insight:** The observer must call `buildWorldIndex` and `buildSpatialIndex` before generating commands, because the AI decision functions (`decideCommandsForEntity`) depend on those indexes. If you hard‑code commands, the indexes are not strictly needed for `stepWorld` itself.

---

## 4. Serialization and Deterministic Replay

The serialisation demo (`tools/serialize.ts`) shows how to round‑trip a `WorldState` through JSON while preserving determinism.

### Map fields

Optional Map fields on `Entity` (`foodInventory`, `armourState`, `reputations`) must be explicitly converted to an array of entries for JSON serialisation:

```typescript
function serializeEntity(e: Entity): unknown {
  const obj: any = { ...e };
  if (e.foodInventory instanceof Map) {
    obj.foodInventory = Array.from(e.foodInventory.entries());
  }
  // … similarly for armourState, reputations
  return obj;
}
```

On deserialisation, reconstruct the Map from the array:

```typescript
function deserializeEntity(e: any): Entity {
  const entity = { ...e } as Entity;
  if (Array.isArray(e.foodInventory)) {
    entity.foodInventory = new Map(e.foodInventory);
  }
  // …
  return entity;
}
```

### Deterministic equality

After deserialisation, the simulation can be continued from the saved state and will produce **identical results** to the original run, provided the same seed and commands are used. This is a direct consequence of the kernel’s pure‑deterministic design.

> **Gotcha:** The `__sensoryEnv` and `activeFieldEffects` side‑channel fields are not required for basic combat simulation; they can be omitted during serialisation if not needed.

---

## 5. Connecting to a Renderer (Bridge API)

Milestone 3 delivers a complete bridge module (`src/bridge/`) that handles tick‑rate conversion, segment‑to‑bone mapping, and deterministic interpolation between simulation ticks. The bridge is a double‑buffered engine that ingests simulation snapshots at 20 Hz and provides smooth interpolated state at render frequency (60 Hz or higher).

### Key features

- **Mapping system** – connect simulation segment IDs (`"leftArm"`, `"torso"`) to your skeleton’s bone names (`"arm_L"`, `"spine_02"`).
- **Fixed‑point interpolation** – deterministic linear interpolation of positions, velocities, animation weights, pose modifiers, and condition.
- **Extrapolation control** – optional velocity‑based prediction when render time runs ahead of simulation.
- **Full API documentation** – see [`bridge‑api.md`](./bridge‑api.md) for detailed reference and examples.

### Minimal setup example

```typescript
import { BridgeEngine } from "ananke";
import { extractRigSnapshots, extractMotionVectors, extractConditionSamples } from "ananke";

const config = {
  mappings: [{
    bodyPlanId: "humanoid",
    segments: [
      { segmentId: "head",    boneName: "head" },
      { segmentId: "torso",   boneName: "spine_02" },
      // … map all segments your skeleton uses
    ],
  }],
};
const engine = new BridgeEngine(config);

// Simulation thread (20 Hz)
const snapshots = extractRigSnapshots(world);
const motion = extractMotionVectors(world);
const condition = extractConditionSamples(world);
engine.update(snapshots, motion, condition);

// Render thread (60 Hz)
const state = engine.getInterpolatedState(entityId, renderTime_s);
if (state) {
  // Apply state.position_m, state.facing, state.poseModifiers, etc.
}
```

### Working demo

Run `npm run run:bridge‑demo` to see a complete bridge workflow with humanoid and quadruped body plans, simulation loop, render‑loop simulation, and determinism verification.

### Integration steps

1. Read the [bridge API documentation](./bridge‑api.md) to understand mapping and interpolation details.
2. Author mappings for each body plan your game uses (humanoid, quadruped, avian, etc.).
3. Integrate the bridge into your simulation and render threads as shown above.
4. Use the `poseModifiers` array to drive vertex‑shader weights or morph targets for injury visualisation.
5. Use `animation` hints (`idle`, `walk`, `run`, `sprint`) to blend animation clips.

---

## 6. Type Glossary

| Type | Purpose | Module |
|:---|:---|:---|
| `Q` | Fixed‑point scale factor (default `SCALE.Q = 10 000`). All dimensionless multipliers are stored as integers where `q(1.0) = 10 000`. | `src/units.ts` |
| `Vec3` | Three‑dimensional vector with components in `SCALE.m` (position) or `SCALE.mps` (velocity). | `src/sim/vec3.ts` |
| `IndividualAttributes` | Physical and cognitive capabilities of an entity (peak force, power, reaction time, etc.). | `src/generate.ts` |
| `IntentState` | What the entity intends to do this tick (move direction/pace, defence mode, prone flag). Derived from previous tick’s commands. | `src/sim/intent.ts` |
| `ActionState` | Cooldowns, weapon‑bind state, swing momentum, etc. | `src/sim/action.ts` |
| `ConditionState` | Fear, morale, sensory modifiers, fatigue, thermal state, etc. | `src/sim/condition.ts` |
| `InjuryState` | Per‑region damage (surface, internal, structural, permanent), shock, consciousness, fluid loss, death flag. | `src/sim/injury.ts` |
| `GrappleState` | Active grapple relationships, grip strength, positional lock. | `src/sim/entity.ts` |
| `Command` | Instruction issued by the host (attack, defend, move, use item, etc.). | `src/sim/commands.ts` |
| `KernelContext` | Environmental coefficients (traction, weather, etc.) passed to `stepWorld`. | `src/sim/context.ts` |
| `CollectingTrace` | Sink that records all kernel events for debugging. | `src/metrics.ts` |

---

## 7. Integration Gotchas

### Exact optional property types

TypeScript’s `exactOptionalPropertyTypes` is enabled in the project. This means an optional property set to `undefined` is **not** the same as omitting the property. For example:

```typescript
// ❌ Wrong – will cause type errors
entity.cognition = undefined;

// ✅ Correct – use conditional spread
const updated = {
  ...entity,
  ...(entity.cognition ? { cognition: { ... } } : {})
};
```

This pattern appears throughout the codebase (e.g., `applyAgingToAttributes`, `applySleepToAttributes`).

### Map fields are optional

The `foodInventory`, `armourState`, and `reputations` fields are optional `Map`s. Always check `instanceof Map` before using them, and be prepared for them to be missing.

### Fixed‑point arithmetic

All dimensionless multipliers are stored as Q‑scaled integers. Use the helpers in `src/units.ts`:

- `q(v: number): Q` — convert a decimal to fixed‑point.
- `to(v: Q): number` — convert fixed‑point back to decimal.
- `qMul(a: Q, b: Q): Q` — multiply two Q values (result stays in Q scale).
- `clampQ(v: Q, min?: Q, max?: Q): Q` — clamp a Q value.

Never use floating‑point multiplication on raw Q values; the scaling will be wrong.

### Deterministic RNG

Randomness is derived from `eventSeed(worldSeed, tick, idA, idB, salt)`, which returns a 32‑bit integer. The kernel uses `makeRng(seed)` to create a deterministic PRNG for that specific event. **Do not** replace `eventSeed` with `Math.random()`.

### Tick‑rate mismatch

The simulation runs at `TICK_HZ` (20 Hz). The host renderer typically runs at 60 Hz or higher. Interpolate entity positions and animation blends between simulation ticks; extrapolation can cause temporal artefacts if the simulation stalls.

### Body‑plan segmentation

When mapping injury regions to a 3D skeleton, note that region IDs are **camelCase** (e.g., `"leftArm"`, `"rightLeg"`), not snake_case. The `model3d.ts` module provides canonical offsets for common segment names.

---

## 8. Recommended Integration Steps

1. **Start with the vertical slice** (`npm run run:vertical-slice`) to see a complete 1v1 duel.
2. **Trace a single attack** (`npm run run:trace-attack`) to internalise the data flow.
3. **Build an observer** that logs the state of your own entities each tick (copy `observer.ts`).
4. **Implement save/load** using the serialisation pattern (`serialize.ts`).
5. **Connect the 3D rig** using the bridge API (`npm run run:bridge‑demo`). See [Bridge API documentation](./bridge‑api.md).
6. **Profile performance** with many entities (100+) to ensure your bridge does not become a bottleneck.

---

## 9. Conclusion

The evaluation spike confirms that Ananke’s deterministic, physics‑first simulation is **technically integrable** into a host application. The kernel’s data flow is transparent, state observation is straightforward, and serialisation round‑trips work as expected. The main challenges are the **fixed‑point arithmetic** and **exact optional property types**, which require disciplined coding patterns.

With this primer, a team can proceed to **Milestone 3 (Asset Pipeline & Renderer Bridge)** with a solid understanding of the kernel’s internals and the gotchas to avoid.

*Generated by Claude Code during Integration Milestone 2, March 2026.*