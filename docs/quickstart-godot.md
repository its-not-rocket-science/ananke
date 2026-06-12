# Ananke Godot 4 Integration — 15-Minute Quickstart

This guide takes you from zero to a running duel simulation displayed in Godot 4 in about 15 minutes.  You will run an Ananke **sidecar** (a small Node.js server) alongside your Godot project.  Godot receives deterministic snapshots over WebSocket and drives character rigs from them.

---

## Prerequisites

- **Godot 4.2+** with C# support (Mono build) OR pure GDScript variant
- **Node.js 18+**
- A copy of [`ananke-godot-reference`](https://github.com/its-not-rocket-science/ananke-godot-reference)

---

## Step 1 — Start the sidecar (2 minutes)

```bash
cd ananke-godot-reference/sidecar
npm install
npm start
```

You should see:

```
Ananke sidecar ready — HTTP http://127.0.0.1:7373
  WebSocket stream: ws://127.0.0.1:7373/stream
  Simulation tick rate: 20 Hz
```

Verify: `http://127.0.0.1:7373/health` → `{ "ok": true, … }`.

---

## Step 2 — Open the Godot project (1 minute)

Open `ananke-godot-reference/` as a Godot 4 project.  The demo scene `scenes/demo.tscn` is pre-configured with:

| Node | Script | Purpose |
|---|---|---|
| `AnankeReceiver` | `AnankeReceiver.cs` | WebSocket client + frame parser |
| `AnankeController` | `AnankeController.gd` | Dispatches snapshots to character nodes |
| `Knight` / `Brawler` | `AnankeCharacter.gd` | Interpolation + rig control |

Press **F5** (Run Project).  The two placeholder rigs should begin animating.  The Output panel will confirm `[AnankeReceiver] Connected`.

---

## Step 3 — Inspect a frame (2 minutes)

Hit `http://127.0.0.1:7373/state` in a browser to see the current `BridgeFrame`:

```json
{
  "schema": "ananke.bridge.frame.v1",
  "tick": 37,
  "entities": [
    {
      "entityId": 1,
      "position_m": { "x": 1.8, "y": 0.0, "z": 0.0 },
      "facing":     { "x": 1.0, "y": 0.0, "z": 0.0 },
      "animation": {
        "primaryState": "idle",
        "locomotionBlend": 0.0,
        "guardingQ": 0.85,
        "dead": false
      }
    }
  ]
}
```

All values are in real SI units.  `facing` is a normalised unit vector for character orientation.

---

## Step 4 — Connect a GLTF character (5 minutes)

Replace the placeholder capsule with your GLTF character:

1. **Import your `.glb` / `.gltf`** into `assets/characters/`.
2. **Instance it** in `scenes/demo.tscn` as a child of the existing character node.
3. **Configure `SkeletonMapper`** (C# or GDScript) with your bone names:

```gdscript
# GDScript variant — SkeletonMapper.gd
var segment_to_bone = {
  "head":     "Bip01_Head",
  "thorax":   "Bip01_Spine2",
  "leftArm":  "Bip01_L_UpperArm",
  "rightArm": "Bip01_R_UpperArm",
  "leftLeg":  "Bip01_L_Thigh",
  "rightLeg": "Bip01_R_Thigh",
}
```

4. **Connect the `FrameReceived` signal** from `AnankeReceiver` to your character's `apply_snapshot()` method:

```gdscript
func _ready():
    $AnankeReceiver.FrameReceived.connect(_on_frame)

func _on_frame(frame: Dictionary) -> void:
    for entity in frame["entities"]:
        if entity["entityId"] == my_entity_id:
            apply_snapshot(entity)
```

5. **Press F5** — your mesh now tracks simulation state.

---

## Step 5 — Using the C# addon variant (optional)

The `addons/ananke_bridge/` addon provides typed C# components for production use:

```csharp
// In your character script:
using AnankeGodot;

public partial class MyCharacter : Node3D
{
    [Export] public AnankeReceiver Receiver { get; set; }

    public override void _Ready()
    {
        Receiver.FrameReceived += OnFrame;
    }

    private void OnFrame(BridgeFrame frame)
    {
        var snap = frame.Entities.Find(e => e.EntityId == EntityId);
        if (snap is null) return;
        // snap.Animation.PrimaryState, snap.Position_m, etc.
    }
}
```

The `BridgeFrame` and `BridgeEntitySnapshot` types mirror the wire format exactly.

---

## Wire format reference

The sidecar uses `serializeBridgeFrame` from `@its-not-rocket-science/ananke/host-loop`:

```typescript pseudocode
import { serializeBridgeFrame } from "@its-not-rocket-science/ananke/host-loop";

const frame = serializeBridgeFrame(world, { scenarioId: "my-scene", tickHz: 20 });
ws.send(JSON.stringify(frame));
```

Key `BridgeEntitySnapshot` fields:

| Field | Type | Description |
|---|---|---|
| `position_m` | `{x, y, z}` | World position in metres |
| `facing` | `{x, y, z}` | Normalised facing direction |
| `animation.primaryState` | `string` | `"idle"` \| `"attack"` \| `"flee"` \| `"prone"` \| `"unconscious"` \| `"dead"` |
| `animation.locomotionBlend` | `[0,1]` | Drive blend tree speed parameter |
| `pose[].impairmentQ` | `[0,1]` | Drive injury deformation blend shape |
| `condition.dead` | `bool` | True on entity death |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Output shows `[AnankeReceiver] Connection failed` | Check `http://127.0.0.1:7373/health`; verify port matches `AnankeReceiver.Port` export |
| Characters stuck in T-pose | Confirm `SkeletonMapper.segment_to_bone` matches your skeleton bone names |
| Jittery movement | Reduce `_physics_process` call rate or increase interpolation buffer in `AnankeInterpolator` |
| Signal not firing | Verify `FrameReceived.connect()` is called before the first WebSocket message |

---

## Next steps

- **Content packs** — load custom species and weapons: [docs/integration-primer.md](integration-primer.md)
- **Unity integration** — see [docs/quickstart-unity.md](quickstart-unity.md)
- **Web integration** — see [docs/quickstart-web.md](quickstart-web.md)
- **Validation** — compare outcomes against real data: [docs/emergent-validation-report.md](emergent-validation-report.md)
