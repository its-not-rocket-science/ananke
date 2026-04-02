# API Surface: @ananke/core

> **Auto-generated** by `tools/extract-api.ts` — 2026-03-31  
> Do not edit by hand. Re-run `npm run extract-api` to refresh.

**Kernel, entity model, fixed-point units, RNG, replay, bridge**

Total exported symbols: **125**

---

## Source files (19)

- `src/derive.ts` — 9 exports
- `src/describe.ts` — 6 exports
- `src/generate.ts` — 2 exports
- `src/host-loop.ts` — 16 exports
- `src/metrics.ts` — 5 exports
- `src/netcode.ts` — 4 exports
- `src/presets.ts` — 5 exports
- `src/replay.ts` — 6 exports
- `src/rng.ts` — 4 exports
- `src/sim/commandBuilders.ts` — 5 exports
- `src/sim/commands.ts` — 15 exports
- `src/sim/context.ts` — 1 export
- `src/sim/entity.ts` — 5 exports
- `src/sim/events.ts` — 2 exports
- `src/sim/kernel.ts` — 10 exports
- `src/sim/world.ts` — 1 export
- `src/types.ts` — 13 exports
- `src/units.ts` — 13 exports
- `src/wasm-kernel.ts` — 3 exports

---

## Types & Interfaces (57)

| Name | Source | Notes |
|------|--------|-------|
| `ActivateCommand` | `src/sim/commands.ts` |  |
| `AttackCommand` | `src/sim/commands.ts` |  |
| `AttackNearestCommand` | `src/sim/commands.ts` |  |
| `AttributeRating` | `src/describe.ts` |  |
| `BreakBindCommand` | `src/sim/commands.ts` |  |
| `BreakGrappleCommand` | `src/sim/commands.ts` |  |
| `BridgeAnimation` | `src/host-loop.ts` | Animation blend weights and state flags for a renderer character controller. All Q-values are [0, 1] floats. Locomotive blends are mutually exclusive; typically only one is nonzero. |
| `BridgeCondition` | `src/host-loop.ts` | Entity physiological condition (Q-values as [0, 1] floats). Divide the underlying Q value by SCALE.Q (10 000) to get floats. |
| `BridgeEntitySnapshot` | `src/host-loop.ts` | Complete per-entity snapshot for one simulation tick. |
| `BridgeFrame` | `src/host-loop.ts` | Complete serialized frame for one simulation tick. JSON-encoded and sent over WebSocket / HTTP. |
| `BridgeGrappleConstraint` | `src/host-loop.ts` | Grapple constraint describing hold/held relationships between entities. |
| `BridgePoseModifier` | `src/host-loop.ts` | Per-body-segment pose modifier — drives deformation or damage blend shapes. Q-values are [0, 1] floats. |
| `BridgeVec3` | `src/host-loop.ts` | 3D vector in real metres (float). Converts from fixed-point SCALE.m: `x_m = x_Sm / SCALE.m`. |
| `CharacterDescription` | `src/describe.ts` |  |
| `CognitiveProfile` | `src/types.ts` |  |
| `CombatMetrics` | `src/metrics.ts` | Accumulated metrics derived from a sequence of trace events. |
| `Command` | `src/sim/commands.ts` |  |
| `CommandMap` | `src/sim/commands.ts` |  |
| `ConcentrationState` | `src/sim/entity.ts` | Phase 12B: state for an active concentration aura (castTime_ticks = -1 effect). |
| `Control` | `src/types.ts` |  |
| `DefendCommand` | `src/sim/commands.ts` |  |
| `DeriveContext` | `src/derive.ts` |  |
| `EnergyState` | `src/types.ts` |  |
| `Entity` | `src/sim/entity.ts` | Core entity shape. Fields are annotated with one of three stability tiers: - **`@core`** — Required by `stepWorld` on every tick.  Always present; never optional. Removing or renaming any `@core` field is a Tier 1 breaking change. - **`@subsystem(name)`** — Optional state consumed only by a specific sub-module (`src/sim/sleep.ts`, `src/sim/aging.ts`, etc.).  Omitting a subsystem field disables that module's behaviour for this entity; the kernel continues to run correctly without it. Adding new optional subsystem fields is never a breaking change. - **`@extension`** — Not consumed by Ananke at all.  Reserved for host-application data that travels alongside entities (e.g. renderer-side metadata, network session IDs). Currently no built-in fields carry this tag; hosts may add their own `?` fields freely. |
| `GrappleCommand` | `src/sim/commands.ts` |  |
| `GrappleMode` | `src/sim/commands.ts` |  |
| `GrapplePosition` | `src/sim/entity.ts` |  |
| `GrappleState` | `src/sim/entity.ts` |  |
| `HostLoopConfig` | `src/host-loop.ts` | Sidecar configuration — passed to `serializeBridgeFrame` and used by host loop implementations. |
| `I32` | `src/units.ts` |  |
| `ImpactEvent` | `src/sim/events.ts` |  |
| `IndividualAttributes` | `src/types.ts` |  |
| `KernelContext` | `src/sim/context.ts` |  |
| `LanguageCapacity` | `src/types.ts` |  |
| `LocomotionCapacity` | `src/types.ts` |  |
| `LocomotionMode` | `src/types.ts` |  |
| `Morphology` | `src/types.ts` |  |
| `MoveCommand` | `src/sim/commands.ts` |  |
| `MovementCaps` | `src/derive.ts` |  |
| `NarrativeBias` | `src/generate.ts` | Signed bias applied to a character-generation axis, range [−1, 1]. `+1` strongly skews toward the high end of the archetype's natural spread; `−1` toward the low end.  Values outside [−1, 1] are clamped internally. A biased character is still drawn from the population — just from a different part of the tail — so physical plausibility is preserved. Fields map to these generation axes: `strength`   peakForce_N, peakPower_W, continuousPower_W, actuatorScale `speed`      reactionTime_s  (positive bias → faster; i.e. lower time) `resilience` distressTolerance, shockTolerance, concussionTolerance, surface/bulk/structureIntegrity, recoveryRate (positive bias also reduces fatigueRate) `agility`    controlQuality, fineControl, stability `size`       stature_m, mass_kg  (also influences reach) Note: per-individual cognitive variance (`intellect` bias) is reserved for a future phase once `Archetype.cognition` gains per-individual draws. |
| `Perception` | `src/types.ts` |  |
| `Performance` | `src/types.ts` |  |
| `PersonalityId` | `src/types.ts` |  |
| `PersonalityTraits` | `src/types.ts` | Four orthogonal behavioural axes that modulate decisions on top of the base AIPolicy. All fields are Q-coded [0, SCALE.Q]; q(0.50) is neutral (no change from baseline). |
| `Q` | `src/units.ts` |  |
| `Replay` | `src/replay.ts` | A complete replay: the initial world snapshot plus one frame per recorded tick. Replaying from `initialState` and re-applying `frames` in order deterministically reproduces the original simulation. |
| `ReplayDiff` | `src/netcode.ts` | Result of comparing two replay traces. |
| `ReplayFrame` | `src/replay.ts` | One recorded tick: the tick number and the commands dispatched that tick. |
| `Resilience` | `src/types.ts` |  |
| `SetProneCommand` | `src/sim/commands.ts` |  |
| `ShootCommand` | `src/sim/commands.ts` |  |
| `Tier` | `src/describe.ts` |  |
| `TreatCommand` | `src/sim/commands.ts` |  |
| `U32` | `src/rng.ts` |  |
| `WasmEntityReport` | `src/wasm-kernel.ts` |  |
| `WasmStepReport` | `src/wasm-kernel.ts` |  |
| `WorldState` | `src/sim/world.ts` | Top-level simulation container. Fields are annotated with stability tiers identical to `Entity`: - **`@core`** — required by `stepWorld` every tick. - **`@subsystem(name)`** — optional state consumed only by a specific sub-module. |

## Functions (47)

| Name | Source | Notes |
|------|--------|-------|
| `applyCapabilityEffect` | `src/sim/kernel.ts` | Resolve all payloads of a capability effect for the appropriate target set. AoE: all living entities within aoeRadius_m of target/actor position. Single-target: targetId entity, or self if absent. |
| `applyExplosion` | `src/sim/kernel.ts` | Apply a point-source explosion to all living entities within the blast radius (Phase 10). Features: - Blast wave delivered to torso; entities facing away take −30% blast damage. - Stochastic fragment hits to random regions. - Blast throw: entities are pushed outward; velocity proportional to blast energy / mass. - Emits a BlastHit trace event for each affected entity. |
| `applyFallDamage` | `src/sim/kernel.ts` | Apply fall damage to a single entity (Phase 10). KE = mass × g × height; 85% absorbed by controlled landing. Remaining 15% distributed: locomotion-primary regions × 70%, others × 30%. Any fall ≥ 1 m forces prone. |
| `applyImpactToInjury` | `src/sim/kernel.ts` |  |
| `applyPayload` | `src/sim/kernel.ts` | Apply a single EffectPayload to target on behalf of actor. All payloads route to existing engine primitives — the engine does not distinguish magical from technological effects at this level. |
| `armourCoversHit` | `src/sim/kernel.ts` |  |
| `clampI32` | `src/sim/kernel.ts` |  |
| `clampSpeed` | `src/sim/kernel.ts` |  |
| `collectMetrics` | `src/metrics.ts` | Derive combat metrics from a flat array of trace events. Events from any number of ticks may be mixed; ordering is not required. |
| `defendBlock` | `src/sim/commandBuilders.ts` |  |
| `defendDodge` | `src/sim/commandBuilders.ts` |  |
| `defendNone` | `src/sim/commandBuilders.ts` |  |
| `defendParry` | `src/sim/commandBuilders.ts` |  |
| `deriveJumpHeight_m` | `src/derive.ts` |  |
| `deriveMaxAcceleration_mps2` | `src/derive.ts` |  |
| `deriveMaxSprintSpeed_mps` | `src/derive.ts` |  |
| `deriveMovementCaps` | `src/derive.ts` |  |
| `derivePeakForceEff_N` | `src/derive.ts` |  |
| `derivePoseOffset` | `src/host-loop.ts` | Anatomical local-space offset for a body segment at maximum impairment. Applied as: `bone.localPosition += poseOffset * impairmentQ`. Values are in real metres (float). @param segmentId   Canonical segment identifier (e.g. `"head"`, `"leftArm"`). @param impairmentQ Impairment blend weight [0, 1] float. @returns Local-space offset in real metres. |
| `derivePrimaryState` | `src/host-loop.ts` | Derive a single animation state string from `AnimationHints`. Priority: dead > unconscious > prone/crawl > attack > flee (run/sprint) > idle. Renderer character controllers use this to drive top-level state machines when a detailed blend tree is not available. @returns One of: `"dead"` | `"unconscious"` | `"prone"` | `"attack"` | `"flee"` | `"idle"` |
| `describeCharacter` | `src/describe.ts` |  |
| `deserializeReplay` | `src/replay.ts` | Deserialize a JSON string produced by `serializeReplay` back into a Replay. |
| `diffReplayJson` | `src/netcode.ts` | Parse two replay JSON strings and diff them. Convenience wrapper over `diffReplays` for CLI use. |
| `diffReplays` | `src/netcode.ts` | Compare two replay traces tick-by-tick and find the first divergence. Steps both replays from their initial states in lock-step, computing `hashWorldState` after each tick.  O(N) in replay length. @param replayA  First replay (e.g. client A's recording). @param replayB  Second replay (e.g. client B's recording). @param ctx      KernelContext forwarded to `stepWorld`. |
| `ensureAnatomyRuntime` | `src/sim/entity.ts` |  |
| `formatCharacterSheet` | `src/describe.ts` |  |
| `formatOneLine` | `src/describe.ts` |  |
| `generateIndividual` | `src/generate.ts` |  |
| `hashWorldState` | `src/netcode.ts` | Compute a deterministic 64-bit hash of the simulation's core state. Covers `tick`, `seed`, and all entity data sorted by `id`.  Optional subsystem fields (`runtimeState.sensoryEnv`, `runtimeState.factionRegistry`, etc.) are excluded — they are host concerns and do not affect simulation determinism. Use this as a desync checksum in multiplayer loops: ```ts const hash = hashWorldState(world); socket.emit("tick-ack", { tick: world.tick, hash: hash.toString() }); ``` @returns An unsigned 64-bit bigint. |
| `makeAttackCommand` | `src/sim/commandBuilders.ts` |  |
| `makeRng` | `src/rng.ts` |  |
| `meanTimeToIncapacitation` | `src/metrics.ts` | Mean tick-to-incapacitation across the given entities. Entities that were never incapacitated contribute `totalTicks` to the average (i.e. they survived the full duration). Returns `totalTicks` if no entity was incapacitated. |
| `mkBoxer` | `src/presets.ts` | Create an amateur or pro boxer at the given position. Loadout: boxing gloves. Skills: meleeCombat, meleeDefence, athleticism — scaled by level. |
| `mkKnight` | `src/presets.ts` | Create a medieval knight at the given position. Loadout: longsword + plate armour (heaviest available, resist_J=800). Skills: meleeCombat q(1.25), meleeDefence q(1.25). |
| `mkOctopus` | `src/presets.ts` | Create a large Pacific octopus at the given position. Loadout: none (grapple only via arms). Body plan: OCTOPOID_PLAN (mantle + 8 arms). Skills: grappling q(1.60) — 8 arm-suckers provide extreme leverage bonus. |
| `mkScubaDiver` | `src/presets.ts` | Create a baseline scuba diver (unarmed, no special skills) at the given position. Used as a reference opponent for octopus scenarios. |
| `mkWrestler` | `src/presets.ts` | Create a Greco-Roman wrestler at the given position. Loadout: none (grapple only). Skills: grappling q(1.50), athleticism fatigueRateMul q(0.85). |
| `replayTo` | `src/replay.ts` | Replay a recorded simulation up to (and including) `targetTick`. Returns the reconstructed WorldState at that tick. Does NOT mutate the Replay. Pass `ctx.trace` to collect all replayed events for analysis. |
| `scaleDirToSpeed` | `src/sim/kernel.ts` |  |
| `serializeBridgeFrame` | `src/host-loop.ts` | Serialize a complete simulation tick into the stable bridge wire format. This is the canonical sidecar serializer.  Replaces per-project `serialiseFrame` implementations in Unity and Godot sidecars. @param world   Current world state after `stepWorld()`. @param config  Sidecar configuration. @returns       A `BridgeFrame` safe to `JSON.stringify` and send over WebSocket. @example ```ts import { serializeBridgeFrame } from "@its-not-rocket-science/ananke/host-loop"; function tick() { stepWorld(world, commands, ctx); const frame = serializeBridgeFrame(world, { scenarioId: "my-duel", tickHz: 20 }); broadcast(JSON.stringify(frame)); } ``` |
| `serializeReplay` | `src/replay.ts` | Serialize a Replay to a JSON string (handles Maps). |
| `sfc32` | `src/rng.ts` |  |
| `sortEventsDeterministic` | `src/sim/events.ts` |  |
| `splitmix32` | `src/rng.ts` |  |
| `stepEnergyAndFatigue` | `src/derive.ts` |  |
| `stepWorld` | `src/sim/kernel.ts` |  |
| `survivalRate` | `src/metrics.ts` | Fraction of `entityIds` that were never incapacitated (KO or death) in `events`. Returns 1.0 if `entityIds` is empty. |

## Constants (18)

| Name | Source | Notes |
|------|--------|-------|
| `BRIDGE_SCHEMA_VERSION` | `src/host-loop.ts` | Wire schema identifier — included in every BridgeFrame. |
| `cbrtQ` | `src/units.ts` |  |
| `clampQ` | `src/units.ts` |  |
| `DEFAULT_BRIDGE_HOST` | `src/host-loop.ts` | Default sidecar host. |
| `DEFAULT_BRIDGE_PORT` | `src/host-loop.ts` | Default sidecar WebSocket/HTTP port. |
| `DEFAULT_STREAM_PATH` | `src/host-loop.ts` | Default WebSocket stream path. |
| `DEFAULT_TICK_HZ` | `src/host-loop.ts` | Default sidecar tick rate (Hz). |
| `from` | `src/units.ts` |  |
| `G_mps2` | `src/units.ts` |  |
| `JUMP_ENERGY_FRACTION` | `src/derive.ts` | Fraction of reserve energy that can be spent on a single jump (~0.0283). |
| `mulDiv` | `src/units.ts` |  |
| `noMove` | `src/sim/commands.ts` |  |
| `q` | `src/units.ts` |  |
| `qDiv` | `src/units.ts` |  |
| `qMul` | `src/units.ts` |  |
| `SCALE` | `src/units.ts` |  |
| `sqrtQ` | `src/units.ts` |  |
| `to` | `src/units.ts` |  |

## Classes (3)

| Name | Source | Notes |
|------|--------|-------|
| `CollectingTrace` | `src/metrics.ts` | A TraceSink that accumulates all events into an array for later analysis. Usage: const tracer = new CollectingTrace(); stepWorld(world, cmds, { ...ctx, trace: tracer }); const metrics = collectMetrics(tracer.events); |
| `ReplayRecorder` | `src/replay.ts` | Records commands applied each tick so the simulation can be replayed later. Usage: const recorder = new ReplayRecorder(world);        // snapshot before first step recorder.record(world.tick, cmds);                 // call once per tick stepWorld(world, cmds, ctx); const replay = recorder.toReplay(); |
| `WasmKernel` | `src/wasm-kernel.ts` |  |

