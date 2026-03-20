# ananke-godot-reference

![Ananke version](https://img.shields.io/badge/ananke-0.1.0-6366f1)
![Godot](https://img.shields.io/badge/Godot-4.2%2B-478cbf?logo=godotengine&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![Status](https://img.shields.io/badge/status-reference%20implementation-orange)

Minimal runnable Godot 4 plugin that drives a humanoid character rig from Ananke's physics simulation. This is the canonical reference implementation proving that Ananke integrates with a production 3D engine. Once complete, it will be listed in [Ananke's ecosystem.md](https://github.com/its-not-rocket-science/ananke/blob/master/docs/ecosystem.md).

---

## Table of contents

1. [Purpose](#purpose)
2. [Prerequisites](#prerequisites)
3. [Architecture](#architecture)
4. [What gets built](#what-gets-built)
5. [Quick start](#quick-start)
6. [File layout](#file-layout)
7. [Ananke API surface used](#ananke-api-surface-used)
8. [Tick interpolation strategy](#tick-interpolation-strategy)
9. [Demo scene](#demo-scene)
10. [API compliance checklist](#api-compliance-checklist)
11. [Contributing](#contributing)

---

## Purpose

Ananke is a headless simulation kernel. It knows nothing about bones, shaders, or render loops — it outputs structured data at 20 Hz describing entity position, injury state, animation hints, and grapple constraints. Someone has to wire that data to a skeleton.

This project is that wire for Godot 4. It is deliberately minimal: a single demo scene, one GDScript receiver, one TypeScript sidecar. No physics engine override, no editor plugin, no asset importer. The goal is a working Knight vs Brawler duel that any Godot developer can clone and play within five minutes.

---

## Prerequisites

| Dependency | Minimum version | Notes |
|-----------|----------------|-------|
| Godot | 4.2 | Editor + export templates |
| Ananke | 0.1.0 | Cloned alongside this repo |
| Node.js | 18 | For the TypeScript sidecar |
| npm | 9 | Bundled with Node.js 18 |

Clone Ananke into a sibling directory before cloning this project:

```
workspace/
  ananke/          ← https://github.com/its-not-rocket-science/ananke
  ananke-godot-reference/   ← this repo
```

The sidecar imports from `../ananke/dist/src/...` until Ananke is published to npm.

---

## Architecture

The integration uses a **TypeScript sidecar ↔ Godot** channel. The sidecar owns the simulation; Godot owns the renderer. They communicate over a local WebSocket (or named pipe on Windows).

```
┌────────────────────────────────────────────────────────┐
│  TypeScript sidecar (Node.js, 20 Hz)                   │
│                                                        │
│  stepWorld() ──► extractRigSnapshots()                 │
│               ──► deriveAnimationHints()               │
│               ──► derivePoseModifiers()                │
│               ──► deriveGrappleConstraint()            │
│               ──► serializeReplay() [optional]         │
│                                 │                      │
│                          JSON over WebSocket           │
│                          ws://127.0.0.1:7373           │
└─────────────────────────────────┼──────────────────────┘
                                  │
┌─────────────────────────────────▼──────────────────────┐
│  Godot 4 (GDScript, 60 Hz display)                     │
│                                                        │
│  WebSocketClient ──► AnankeReceiver.gd                 │
│  AnankeReceiver  ──► SkeletonMapper.gd                 │
│  SkeletonMapper  ──► Skeleton3D bone poses             │
│  AnimationHints  ──► AnimationTree state machine       │
│  GrappleConstraint ──► two-character bone locks        │
└────────────────────────────────────────────────────────┘
```

### Why a sidecar and not GDExtension?

GDExtension requires compiled C/C++ bindings. The Ananke kernel is TypeScript with fixed-point arithmetic that has no C equivalent yet. A JSON-over-WebSocket sidecar trades some latency (sub-millisecond on loopback) for zero build complexity.

---

## What gets built

### Skeleton bone mapping

A `SkeletonMapper` resource maps Ananke's canonical segment IDs to Godot bone names:

| Ananke segment | Default Godot bone name |
|---------------|------------------------|
| `head`        | `head`                 |
| `torso`       | `spine_02`             |
| `leftArm`     | `arm_L`                |
| `rightArm`    | `arm_R`                |
| `leftLeg`     | `leg_L`                |
| `rightLeg`    | `leg_R`                |

Bone names depend on your character rig. Override them in `res://addons/ananke_bridge/mappings/humanoid.tres`.

### 20 Hz → 60 Hz interpolation

The sidecar sends a simulation frame every 50 ms. Godot's `_process(delta)` runs at display rate (60+ Hz). `AnankeInterpolator.gd` retains the previous and current simulation frames and performs linear interpolation:

```gdscript
# AnankeInterpolator.gd
func get_bone_position(segment_id: String) -> Vector3:
    var prev = _prev_frame.bones[segment_id].position
    var curr = _curr_frame.bones[segment_id].position
    return prev.lerp(curr, _t)  # _t updated each _process() call
```

Positions arrive in Ananke's fixed-point units (SCALE.m = 10000 = 1 metre). The interpolator divides by 10000 before passing values to Godot.

### AnimationHints → AnimationTree

`deriveAnimationHints` returns a `primaryState` string (`"idle"`, `"attack"`, `"flee"`, `"prone"`, `"unconscious"`, `"dead"`) plus blend weights. These drive a `AnimationTree` state machine:

```gdscript
# AnimationDriver.gd
func apply_hints(hints: Dictionary) -> void:
    $AnimationTree["parameters/StateMachine/playback"].travel(hints["primaryState"])
    $AnimationTree["parameters/InjuryBlend/blend_amount"] = hints["injuryWeight"]
```

### GrapplePoseConstraint

When two entities are in a grapple, `deriveGrappleConstraint` returns attachment point pairs. `GrappleApplicator.gd` uses `BoneAttachment3D` nodes to lock the relevant bones together for the duration of the grapple.

---

## Quick start

```bash
# 1. Clone Ananke
git clone https://github.com/its-not-rocket-science/ananke.git
cd ananke && npm install && npm run build && cd ..

# 2. Clone this repo
git clone https://github.com/its-not-rocket-science/ananke-godot-reference.git
cd ananke-godot-reference

# 3. Install sidecar dependencies
cd sidecar && npm install && cd ..

# 4. Start the sidecar
npm run sidecar
# Prints: "Ananke sidecar listening on ws://127.0.0.1:7373"

# 5. Open the Godot project
# In Godot Editor: File → Open Project → select godot/project.godot
# Press F5 to run the demo scene
```

The demo scene opens a viewport with two characters. The sidecar runs the Knight vs Brawler scenario from `tools/vertical-slice.ts` and streams frames to Godot.

---

## File layout

```
ananke-godot-reference/
├── sidecar/                   TypeScript sidecar (Node.js)
│   ├── src/
│   │   ├── main.ts            Entry point: sim loop + WebSocket server
│   │   ├── scenario.ts        Knight vs Brawler setup (mirrors vertical-slice.ts)
│   │   ├── serialiser.ts      Frame → JSON for Godot
│   │   └── replay.ts          Optional replay recording
│   ├── package.json
│   └── tsconfig.json
│
├── godot/                     Godot 4 project
│   ├── project.godot
│   ├── addons/
│   │   └── ananke_bridge/
│   │       ├── plugin.cfg
│   │       ├── AnankeReceiver.gd      WebSocket client + frame parser
│   │       ├── AnankeInterpolator.gd  Snapshot buffer + lerp
│   │       ├── SkeletonMapper.gd      Segment ID → bone name resolution
│   │       ├── AnimationDriver.gd     AnimationHints → AnimationTree
│   │       ├── GrappleApplicator.gd   GrappleConstraint → BoneAttachment3D
│   │       └── mappings/
│   │           └── humanoid.tres      Default humanoid bone name map
│   ├── scenes/
│   │   ├── Demo.tscn                  Knight vs Brawler arena
│   │   ├── CharacterRig.tscn          Reusable character rig scene
│   │   └── UI.tscn                    Outcome overlay
│   └── assets/
│       └── characters/                Placeholder humanoid meshes + skeletons
│
├── docs/
│   └── bone-mapping-guide.md
└── README.md
```

---

## Ananke API surface used

All imports are from Ananke's **Tier 1 (Stable)** surface as documented in
[`docs/bridge-contract.md`](https://github.com/its-not-rocket-science/ananke/blob/master/docs/bridge-contract.md)
and [`STABLE_API.md`](https://github.com/its-not-rocket-science/ananke/blob/master/STABLE_API.md).

| Ananke export | Used in | Tier |
|--------------|---------|------|
| `stepWorld(world, cmds, ctx)` | `sidecar/src/main.ts` | Tier 1 |
| `generateIndividual(seed, archetype)` | `sidecar/src/scenario.ts` | Tier 1 |
| `extractRigSnapshots(world)` | `sidecar/src/main.ts` | Tier 1 |
| `deriveAnimationHints(entity)` | `sidecar/src/serialiser.ts` | Tier 1 |
| `derivePoseModifiers(entity)` | `sidecar/src/serialiser.ts` | Tier 1 |
| `deriveGrappleConstraint(entity, world)` | `sidecar/src/serialiser.ts` | Tier 1 |
| `serializeReplay(replay)` | `sidecar/src/replay.ts` | Tier 1 |
| `q()`, `qMul()`, `clampQ()` | `sidecar/src/serialiser.ts` | Tier 1 |
| `SCALE` | `sidecar/src/serialiser.ts` | Tier 1 |

Tier 3 (Internal) exports are never used. If you find yourself importing from `src/sim/kernel.ts` directly, open an issue requesting a Tier 1 wrapper.

The complete field-by-field contract for `AnimationHints`, `GrapplePoseConstraint`, and
`InterpolatedState` is documented in
[`docs/bridge-contract.md`](https://github.com/its-not-rocket-science/ananke/blob/master/docs/bridge-contract.md).

---

## Tick interpolation strategy

Ananke ticks at 20 Hz (50 ms per tick). Godot renders at display rate (typically 60–144 Hz). The sidecar timestamps each frame with `performance.now()`. The interpolator computes a blend factor `t` on every `_process` call:

```
t = (renderTimeMs - prevFrameMs) / (currFrameMs - prevFrameMs)
t = clamp(t, 0.0, 1.0)
```

All scalar values (shock, fear, fluid loss, consciousness) are lerped with this `t`. Boolean flags (`prone`, `unconscious`, `dead`) snap to the new value when `t >= 0.5`. Positions are lerped in world space after converting from fixed-point to metres.

The sidecar does not extrapolate. If the sidecar stalls, Godot holds the last known pose until the next frame arrives. This avoids position jitter at the cost of occasional micro-freezes under heavy CPU load.

---

## Demo scene

The demo scene replicates the Knight vs Brawler scenario from `tools/vertical-slice.ts`:

- **Knight**: plate armour, longsword, high structural integrity
- **Brawler**: no armour, bare hands, high stamina
- **Outcome display**: winner, tick count, surviving entity state (shock, fluid loss, consciousness)
- **Controls**: Space = new seed, R = replay last fight, Escape = quit

The scene is not a game. It is a visual proof that Ananke produces physically differentiated outcomes visible in a renderer: armour slows shock accumulation, energy depletes, per-region injury, emergent fight end, consciousness degrades independently of health.

---

## API compliance checklist

When submitting a renderer plugin PR to the Ananke ecosystem, verify the following:

- [ ] No direct imports from `src/sim/kernel.ts` internals (only Stable/Experimental tier exports)
- [ ] Positions divided by `SCALE.m` (10000) before passing to renderer
- [ ] `t` interpolation factor clamped to `[0.0, 1.0]`; no extrapolation unless explicitly opted in
- [ ] `deriveGrappleConstraint` result checked for `null` before applying bone locks
- [ ] Boolean flags (`dead`, `unconscious`) snap at `t >= 0.5`, not lerped
- [ ] Replay recording works: `serializeReplay` output can be deserialized and replayed deterministically
- [ ] Demo scene runs 200 ticks without crash on seeds 1, 42, and 99
- [ ] WebSocket/pipe connection failure is handled gracefully (Godot shows "waiting for sidecar" overlay)

---

## Contributing

1. Fork this repository and create a feature branch.
2. The sidecar must stay under 500 lines of TypeScript. Keep complexity in Ananke, not here.
3. All new GDScript files need a `## AnankeDoc:` comment at the top describing their role.
4. Run `npm run typecheck` in `sidecar/` before opening a PR.
5. If you add a new bone mapping preset (quadruped, centaur, etc.), add a corresponding test scene.

To list this project in Ananke's `docs/ecosystem.md`, open a PR to the Ananke repository adding a row to the Renderer Bridges table with a link and a one-line description.
