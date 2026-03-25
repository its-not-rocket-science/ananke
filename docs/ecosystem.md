# Ananke — Ecosystem & Community Resources

*Integration & Adoption Milestone 5 — Community & Ecosystem Development*

---

## Purpose

This document serves as the living index of companion resources, worked examples, body-plan
packs, renderer bridges, and integration templates built around Ananke.  It covers:

1. Worked examples (included in this repository)
2. Species and body-plan authoring templates
3. Renderer bridge boilerplate
4. Suggested companion repositories for the community to build
5. Contribution and linking guide

---

## Worked examples (in this repository)

These runnable tools are part of the core repository and serve as reference implementations.

| Script | Command | What it shows |
|--------|---------|---------------|
| `tools/vertical-slice.ts` | `npm run run:vertical-slice` | End-to-end Knight vs Brawler duel — entity creation, command loop, outcome logging |
| `tools/trace-attack.ts` | `npm run run:trace-attack` | Single-tick melee attack traced through every kernel event |
| `tools/observer.ts` | `npm run run:observer` | Multi-tick entity position and condition observer |
| `tools/serialize.ts` | `npm run run:serialize` | WorldState save/load round-trip via JSON |
| `tools/bridge-demo.ts` | `npm run run:bridge-demo` | Renderer bridge — extractRigSnapshots, derivePoseModifiers, deriveGrappleConstraint output |
| `tools/validation.ts` | `npm run run:validation` | Full empirical validation suite against real-world datasets |

---

## Body-plan authoring guide

A body plan is a plain data object (`BodyPlan`) that describes a species' segment topology,
joint relationships, and movement parameters.  No kernel changes are required to add a new
species — only a `BodyPlan` and a matching `Archetype` baseline.

### Minimal humanoid-variant template

```typescript
// my-species/bodyplan.ts
import type { BodyPlan } from "ananke/src/sim/bodyplan.js";

export const MY_SPECIES_BODY_PLAN: BodyPlan = {
  id: "my_species",
  name: "My Species",
  segments: [
    { id: "torso",    parent: null,     massShare_Q: q(0.43), length_m: 600  },
    { id: "head",     parent: "torso",  massShare_Q: q(0.08), length_m: 230  },
    { id: "leftArm",  parent: "torso",  massShare_Q: q(0.05), length_m: 650  },
    { id: "rightArm", parent: "torso",  massShare_Q: q(0.05), length_m: 650  },
    { id: "leftLeg",  parent: "torso",  massShare_Q: q(0.17), length_m: 900  },
    { id: "rightLeg", parent: "torso",  massShare_Q: q(0.17), length_m: 900  },
  ],
  // Locomotion: which segments provide ground contact
  locomotionSegments: ["leftLeg", "rightLeg"],
  // Manipulation: which segments can hold items
  manipulationSegments: ["leftArm", "rightArm"],
};
```

### Matching archetype baseline

```typescript
// my-species/archetype.ts
import type { Archetype } from "ananke/src/archetypes.js";
import { q } from "ananke/src/units.js";

export const MY_SPECIES_BASE: Archetype = {
  // Morphology
  stature_m: 18000,           // 1.80 m
  mass_kg: 75_000,            // 75 kg
  statureVar: q(0.05),
  massVar: q(0.08),

  // Actuator (muscle/motor)
  actuatorMassFrac: q(0.42),
  actuatorMassVar: q(0.08),
  actuatorScaleVar: q(0.06),

  peakForce_N: 1840,
  peakForceVar: q(0.74),
  peakPower_W: 1200,
  peakPowerVar: q(0.12),
  continuousPower_W: 200,
  continuousPowerVar: q(0.10),
  reserveEnergy_J: 20_000,
  reserveEnergyVar: q(0.15),
  conversionEfficiency: q(0.25),
  efficiencyVar: q(0.05),

  // Structure
  structureScaleVar: q(0.06),
  reachVar: q(0.04),
  surfaceIntegrity: q(1.0),
  surfaceVar: q(0.08),
  bulkIntegrity: q(1.0),
  bulkVar: q(0.08),
  structureIntegrity: q(1.0),
  structVar: q(0.06),

  // Control
  controlQuality: q(0.72),
  controlVar: q(0.10),
  reactionTime_s: 200,       // 0.20 s
  reactionTimeVar: q(0.15),
  stability: q(0.68),
  stabilityVar: q(0.10),
  fineControl: q(0.65),
  fineControlVar: q(0.10),

  // Resilience
  distressTolerance: q(0.55),
  distressVar: q(0.12),
  shockTolerance: q(0.50),
  shockVar: q(0.10),
  concussionTolerance: q(0.55),
  concVar: q(0.10),
  heatTolerance: q(0.55),
  heatVar: q(0.10),
  coldTolerance: q(0.45),
  coldVar: q(0.10),
  fatigueRate: q(1.0),
  fatigueVar: q(0.10),
  recoveryRate: q(1.0),
  recoveryVar: q(0.10),

  // Perception
  visionRange_m: 150_000,    // 150 m
  visionArcDeg: 200,
  hearingRange_m: 30_000,
  decisionLatency_s: 500,
  attentionDepth: q(0.60),
  threatHorizon_m: 20_000,
};
```

### Quadruped variant notes

For quadrupeds (wolves, horses, etc.), set `locomotionSegments` to all four legs and
`manipulationSegments` to `[]` (or `["jaws"]` for bite attacks).  See `src/archetypes.ts`
for the built-in `HORSE_BASE` and `WOLF_BASE` archetypes as reference.

### Octopoid / distributed manipulation variant notes

For cephalopods and similar, all arms can be both locomotion and manipulation segments.
Set `massShare_Q` so that eight arms together account for the correct fraction of body mass
(~65% for Octopus vulgaris).  See `src/archetypes.ts` `LARGE_PACIFIC_OCTOPUS` for the
built-in reference.

---

## Renderer bridge boilerplate

The bridge module (`src/bridge/`) translates Ananke's abstract simulation state into
renderer-consumable data.  See `docs/bridge-api.md` for the full API reference.

### Minimal Unity adapter sketch

```typescript
// Not a Unity file — this is a TypeScript data-extraction layer that outputs
// a JSON blob your Unity C# code can consume via a WebSocket or named pipe.

import { extractRigSnapshots } from "ananke/src/bridge/rig.js";
import { deriveAnimationHints } from "ananke/src/bridge/animation.js";
import type { Entity } from "ananke/src/types.js";

export function buildUnityFrame(entity: Entity) {
  const rig   = extractRigSnapshots(entity);
  const hints = deriveAnimationHints(entity);

  return {
    entityId: entity.id,
    bones: rig.segments.map(s => ({
      name:     s.segmentId,          // maps to Unity bone name
      position: scaledToUnity(s.position_Sm),
      rotation: s.facingAngle_Q,      // convert to quaternion in Unity
      blendWeight: s.blendWeight_Q / 10000,
    })),
    animationState: hints.primaryState,    // "idle" | "attack" | "flee" | "prone" etc.
    fearLevel:      entity.condition.fear_Q / 10000,
    isConscious:    entity.injury.consciousness_Q > 1000,
  };
}

function scaledToUnity(v: { x: number; y: number; z?: number }) {
  // SCALE.m = 10000; Unity uses metres
  return { x: v.x / 10000, y: (v.z ?? 0) / 10000, z: v.y / 10000 };
}
```

### Minimal Godot GDScript adapter sketch

```gdscript
# ananke_bridge.gd
# Receives JSON from a TypeScript sidecar process over a local socket.

func apply_ananke_frame(frame: Dictionary) -> void:
    var skeleton: Skeleton3D = $CharacterRig/Skeleton3D
    for bone_data in frame["bones"]:
        var bone_idx = skeleton.find_bone(bone_data["name"])
        if bone_idx < 0:
            continue
        var pos = Vector3(bone_data["position"]["x"],
                          bone_data["position"]["y"],
                          bone_data["position"]["z"])
        skeleton.set_bone_pose_position(bone_idx, pos)
    # Drive animation blend tree from animationState
    $AnimationTree["parameters/StateMachine/current"] = frame["animationState"]
```

---

## Suggested companion repositories

These are gaps identified during integration milestones that the community is encouraged to fill.
If you build one, open a PR to add it to the "Community links" section below.

### Body-plan packs

| Pack | Species | Status |
|------|---------|--------|
| `ananke-fantasy-species` | Elf, dwarf, orc, halfling, troll | Wanted |
| `ananke-sf-species` | Grey alien, android, uplift-chimp | Wanted |
| `ananke-historical-fauna` | Aurochs, Pleistocene megafauna | Wanted |
| `ananke-insect-pack` | Ant (scaled), giant beetle, mantis | Wanted |

### Renderer bridges

| Bridge | Engine | Status | GitHub |
|--------|--------|--------|--------|
| `ananke-godot-reference` | Godot 4.2+ | ✅ M1–M4 complete (WebSocket sidecar, bone mapping, AnimationTree, grapple IK) | [its-not-rocket-science/ananke-godot-reference](https://github.com/its-not-rocket-science/ananke-godot-reference) |
| `ananke-unity-reference` | Unity 6 (6000.0 LTS) | ✅ M1–M4 complete (WebSocket sidecar, HumanBodyBones, AnimatorController, grapple constraint) | [its-not-rocket-science/ananke-unity-reference](https://github.com/its-not-rocket-science/ananke-unity-reference) |
| `ananke-unreal-bridge` | Unreal Engine 5 | Wanted | — |
| `ananke-threejs-bridge` | Three.js / WebGL | Wanted | — |

Both reference repos cover the full M1–M4 bridge contract:
- **M1** entity positions + animation state flags over WebSocket at 20 Hz
- **M2** `RigSnapshot.pose[].segmentId` → engine bone names (Godot `SkeletonMapper.gd` / Unity `AnankeSkeletonConfig`)
- **M3** `AnimationHints` drives locomotion blend, combat override, and shock additive layers
- **M4** `GrapplePoseConstraint` constrains held entity to holder anchor; `GripWeight` drives hand-close animation

The ananke repo also ships `tools/renderer-bridge.ts` — a zero-dependency WebSocket bridge server
(`npm run run:renderer-bridge`) that broadcasts Knight vs. Brawler tick data on `ws://localhost:3001/bridge`
in a flat SI-unit JSON format suitable for any renderer.

### Scenario and content packs

| Pack | Content | Status |
|------|---------|--------|
| `ananke-historical-battles` | Agincourt, Thermopylae, Crécy scenarios | Wanted |
| `ananke-arena-scenarios` | Colosseum matchup library | Wanted |
| `ananke-weapons-medieval` | Extended medieval weapon profiles | Wanted |
| `ananke-weapons-ww1` | WWI small-arms and artillery | Wanted |

---

## Community links

*None yet — be the first.*

To add your project here, open a pull request that appends a row to the relevant table above
with your repository URL and a one-line description.

---

## Documentation and knowledge sharing

If you write an internal wiki, tutorial, or blog post about integrating Ananke, consider:

- Linking it here so other adopters can find it
- Upstreaming any gotchas you discovered to `docs/integration-primer.md`
- Upstreaming body-plan templates to this file

The maintainer's time is finite; community documentation reduces the bus-factor risk of the
project.
