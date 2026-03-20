# ananke-unity-reference

![Ananke version](https://img.shields.io/badge/ananke-0.1.0-6366f1)
![Unity](https://img.shields.io/badge/Unity-6%2B-000000?logo=unity&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![C#](https://img.shields.io/badge/C%23-11-239120?logo=csharp&logoColor=white)
![Status](https://img.shields.io/badge/status-reference%20implementation-orange)

Minimal runnable Unity 6 plugin that drives a humanoid character rig from Ananke's physics simulation. This is the canonical reference implementation for Unity integrators. Once complete, it will be listed in [Ananke's ecosystem.md](https://github.com/its-not-rocket-science/ananke/blob/master/docs/ecosystem.md).

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

Ananke is a headless simulation kernel that outputs structured data at 20 Hz: entity positions, injury state, animation hints, and grapple constraints. This project wires that data to a Unity 6 humanoid skeleton.

It is deliberately minimal: one demo scene, one C# receiver, one TypeScript sidecar. No custom physics override, no editor extension, no asset pipeline. The goal is a working Knight vs Brawler duel that any Unity developer can clone and play within five minutes.

---

## Prerequisites

| Dependency | Minimum version | Notes |
|-----------|----------------|-------|
| Unity | 6 (6000.0 LTS) | Universal Render Pipeline recommended |
| Ananke | 0.1.0 | Cloned alongside this repo |
| Node.js | 18 | For the TypeScript sidecar |
| npm | 9 | Bundled with Node.js 18 |
| .NET | 8 | Comes with Unity 6 |

Clone Ananke into a sibling directory before cloning this project:

```
workspace/
  ananke/                      ← https://github.com/its-not-rocket-science/ananke
  ananke-unity-reference/      ← this repo
```

The sidecar imports from `../ananke/dist/src/...` until Ananke is published to npm.

---

## Architecture

The integration uses a **TypeScript sidecar ↔ Unity** channel. The sidecar owns the simulation; Unity owns the renderer. Unity does not have a built-in WebSocket server, so the sidecar runs an HTTP server and Unity polls it via `UnityWebRequest`, or the sidecar and Unity communicate over a named pipe.

```
┌──────────────────────────────────────────────────────────┐
│  TypeScript sidecar (Node.js, 20 Hz)                     │
│                                                          │
│  stepWorld() ──► extractRigSnapshots()                   │
│               ──► deriveAnimationHints()                 │
│               ──► derivePoseModifiers()                  │
│               ──► deriveGrappleConstraint()              │
│               ──► serializeReplay() [optional]           │
│                                 │                        │
│              HTTP POST /frame   │   OR named pipe        │
│              http://127.0.0.1:7374                       │
└─────────────────────────────────┼────────────────────────┘
                                  │
┌─────────────────────────────────▼────────────────────────┐
│  Unity 6 (C#, FixedUpdate 50 Hz / Update display Hz)     │
│                                                          │
│  AnankeReceiver.cs     HTTP/pipe client + JSON parse     │
│  AnankeInterpolator.cs Snapshot buffer + lerp            │
│  SkeletonMapper.cs     Segment ID → HumanBodyBones       │
│  AnimationDriver.cs    AnimationHints → Animator params  │
│  GrappleApplicator.cs  GrappleConstraint → constraints   │
└──────────────────────────────────────────────────────────┘
```

### Why HTTP and not WebSocket?

Unity 6 supports `ClientWebSocket` in C# but requires careful threading to avoid blocking the main thread. HTTP polling with `UnityWebRequest` is simpler to set up for a reference implementation. The sidecar queues the latest frame; Unity fetches it at `FixedUpdate` rate. The latency is one HTTP round-trip (~0.5 ms on loopback), negligible for visual fidelity.

If you need lower latency or bidirectional commands (e.g., for player input), replace the HTTP channel with a named pipe or a dedicated WebSocket pair.

---

## What gets built

### Skeleton bone mapping

`SkeletonMapper.cs` maps Ananke's segment IDs to Unity's `HumanBodyBones` enum:

| Ananke segment | Unity HumanBodyBones |
|---------------|---------------------|
| `head`        | `HumanBodyBones.Head` |
| `torso`       | `HumanBodyBones.Spine` |
| `leftArm`     | `HumanBodyBones.LeftUpperArm` |
| `rightArm`    | `HumanBodyBones.RightUpperArm` |
| `leftLeg`     | `HumanBodyBones.LeftUpperLeg` |
| `rightLeg`    | `HumanBodyBones.RightUpperLeg` |

```csharp
// SkeletonMapper.cs
public static HumanBodyBones Resolve(string segmentId) => segmentId switch {
    "head"     => HumanBodyBones.Head,
    "torso"    => HumanBodyBones.Spine,
    "leftArm"  => HumanBodyBones.LeftUpperArm,
    "rightArm" => HumanBodyBones.RightUpperArm,
    "leftLeg"  => HumanBodyBones.LeftUpperLeg,
    "rightLeg" => HumanBodyBones.RightUpperLeg,
    _          => HumanBodyBones.LastBone, // unmapped
};
```

Override this mapping in the `AnankeSkeletonConfig` ScriptableObject if your rig uses different bone names.

### Animator state machine

`AnimationDriver.cs` reads `primaryState` from `AnimationHints` and sets an `Animator` parameter. Wire this parameter to a state machine in your `AnimatorController`:

```csharp
// AnimationDriver.cs
void ApplyHints(AnankeAnimationHints hints) {
    _animator.SetTrigger(hints.primaryState); // "idle", "attack", "flee", "prone", etc.
    _animator.SetFloat("injuryBlend", hints.injuryWeight);
    _animator.SetBool("isConscious",  hints.consciousness > 0.1f);
}
```

### Physics Rigidbody (optional)

Ananke computes world-space positions. Unity's `Rigidbody` is not needed for rendering — simply set `transform.position` from the interpolated snapshot. If your game needs Unity physics collision (e.g., for player camera blocking), attach a kinematic `Rigidbody` and use `MovePosition`:

```csharp
_rigidbody.MovePosition(interpolatedPosition);
```

Do not give the Rigidbody `isKinematic = false` — Ananke owns all simulation physics.

---

## Quick start

```bash
# 1. Clone Ananke
git clone https://github.com/its-not-rocket-science/ananke.git
cd ananke && npm install && npm run build && cd ..

# 2. Clone this repo
git clone https://github.com/its-not-rocket-science/ananke-unity-reference.git
cd ananke-unity-reference

# 3. Install sidecar dependencies
cd sidecar && npm install && cd ..

# 4. Start the sidecar
npm run sidecar
# Prints: "Ananke sidecar ready at http://127.0.0.1:7374"

# 5. Open the Unity project
# Unity Hub → Open → select unity/ folder
# Open Scenes/Demo.unity → Press Play
```

The demo scene opens a viewport with two characters. The sidecar runs the Knight vs Brawler scenario and serves frames to Unity.

---

## File layout

```
ananke-unity-reference/
├── sidecar/                        TypeScript sidecar (Node.js)
│   ├── src/
│   │   ├── main.ts                 Entry: sim loop + HTTP server
│   │   ├── scenario.ts             Knight vs Brawler setup
│   │   ├── serialiser.ts           Frame → JSON for Unity
│   │   └── replay.ts               Optional replay recording
│   ├── package.json
│   └── tsconfig.json
│
├── unity/                          Unity 6 project
│   ├── Assets/
│   │   ├── AnankePlugin/
│   │   │   ├── Runtime/
│   │   │   │   ├── AnankeReceiver.cs        HTTP client + JSON parse
│   │   │   │   ├── AnankeInterpolator.cs    Snapshot buffer + lerp
│   │   │   │   ├── SkeletonMapper.cs        Segment → HumanBodyBones
│   │   │   │   ├── AnimationDriver.cs       Hints → Animator params
│   │   │   │   ├── GrappleApplicator.cs     Constraint → joint locks
│   │   │   │   └── AnankeSkeletonConfig.cs  ScriptableObject override
│   │   │   └── Editor/
│   │   │       └── AnankePluginEditor.cs    Inspector helpers
│   │   ├── Scenes/
│   │   │   └── Demo.unity                   Knight vs Brawler arena
│   │   ├── Prefabs/
│   │   │   └── AnankeCharacter.prefab       Rig + driver components
│   │   └── Models/
│   │       └── placeholder_humanoid.fbx     CC0 placeholder mesh
│   └── Packages/
│       └── manifest.json
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
| `SCALE` | `sidecar/src/serialiser.ts` | Tier 1 |

The complete field-by-field contract for `AnimationHints`, `GrapplePoseConstraint`, and
`InterpolatedState` is documented in
[`docs/bridge-contract.md`](https://github.com/its-not-rocket-science/ananke/blob/master/docs/bridge-contract.md).

---

## Tick interpolation strategy

Unity's `FixedUpdate` runs at 50 Hz (0.02 s) by default, which aligns conveniently with Ananke's 20 Hz (every 2.5 FixedUpdate calls). The interpolator stores the two most recent simulation frames and computes a blend factor `t` in `Update`:

```csharp
// AnankeInterpolator.cs
void Update() {
    float elapsed = Time.time - _prevFrameTime;
    float interval = _currFrameTime - _prevFrameTime;
    _t = interval > 0f ? Mathf.Clamp01(elapsed / interval) : 1f;
}

Vector3 GetPosition(string segmentId) {
    var prev = _prevFrame.bones[segmentId].position;
    var curr = _currFrame.bones[segmentId].position;
    return Vector3.Lerp(prev, curr, _t);
}
```

Positions arrive from the sidecar in metres (already divided by `SCALE.m = 10000`). Boolean flags (`dead`, `unconscious`) snap to the new value when `_t >= 0.5f`. The sidecar does not extrapolate.

---

## Demo scene

The demo scene replicates the Knight vs Brawler scenario from `tools/vertical-slice.ts`:

- **Knight**: plate armour, longsword, high structural integrity
- **Brawler**: no armour, bare hands, high stamina
- **Outcome display**: winner, tick count, entity state (shock, fluid loss, consciousness)
- **Controls**: Space = new seed, R = replay last fight, Escape = quit

The scene is a visual proof, not a game. It shows that Ananke produces physically differentiated outcomes visible in a renderer: armour slows shock accumulation, energy depletes, per-region injury, emergent fight end, consciousness degrades independently.

---

## API compliance checklist

When submitting this project to the Ananke ecosystem, verify the following:

- [ ] No direct imports from `src/sim/kernel.ts` internals (only Stable/Experimental tier exports)
- [ ] Positions already in metres when they reach C# (divided by `SCALE.m = 10000` in the sidecar)
- [ ] Interpolation factor `_t` clamped to `[0.0, 1.0]`; no extrapolation unless explicitly opted in
- [ ] `deriveGrappleConstraint` result checked for `null` before applying joint locks
- [ ] Boolean flags (`dead`, `unconscious`) snap at `_t >= 0.5f`, not lerped
- [ ] `serializeReplay` output can be deserialized and replayed deterministically
- [ ] Demo scene runs 200 ticks without exception on seeds 1, 42, and 99
- [ ] HTTP connection failure is handled gracefully (Unity shows "waiting for sidecar" overlay)
- [ ] No `Rigidbody` with `isKinematic = false` on Ananke-controlled entities

---

## Contributing

1. Fork this repository and create a feature branch.
2. The sidecar must stay under 500 lines of TypeScript. Keep simulation complexity in Ananke.
3. All new C# files must have an XML summary comment on the class.
4. Run `npm run typecheck` in `sidecar/` before opening a PR.
5. If you add a new bone mapping preset, add a corresponding test scene.

To list this project in Ananke's `docs/ecosystem.md`, open a PR to the Ananke repository adding a row to the Renderer Bridges table with a link and a one-line description.
