# Ananke Unity Integration — 15-Minute Quickstart

This guide takes you from zero to a running duel simulation displayed in Unity in about 15 minutes.  You will run an Ananke **sidecar** (a small Node.js server that steps the simulation) alongside your Unity project.  Unity receives deterministic snapshots over WebSocket and drives character animations from them.

---

## Prerequisites

- **Unity 2022 LTS or Unity 6** (any rendering pipeline)
- **Node.js 18+**
- A copy of [`ananke-unity-reference`](https://github.com/its-not-rocket-science/ananke-unity-reference)

---

## Step 1 — Start the sidecar (2 minutes)

```bash
cd ananke-unity-reference/sidecar
npm install
npm start
```

You should see:

```
Ananke sidecar ready at http://127.0.0.1:3001
  WebSocket stream: ws://127.0.0.1:3001/stream
  Simulation tick rate: 20 Hz
```

Verify in a browser: `http://127.0.0.1:3001/health` → `{ "ok": true, … }`.

---

## Step 2 — Open the Unity project (1 minute)

Open `ananke-unity-reference/` as a Unity project.  The demo scene `Assets/Ananke/AnankeDemo.unity` is pre-configured with:

| GameObject | Component | Purpose |
|---|---|---|
| `SimulationReceiver` | `AnankeReceiver` | WebSocket client — connects to the sidecar |
| `SimulationController` | `AnankeController` | Dispatches snapshots to character rigs |
| `Knight` / `Brawler` | `AnankeInterpolator` | Smooth position/animation interpolation |

Press **Play**.  The two placeholder capsules should begin moving and the `AnankeReceiver` inspector will show `Connected`.

---

## Step 3 — Inspect a frame (2 minutes)

Hit `http://127.0.0.1:3001/state` in a browser.  You will see a `BridgeFrame`:

```json
{
  "schema": "ananke.bridge.frame.v1",
  "scenarioId": "knight-vs-brawler",
  "tick": 42,
  "tickHz": 20,
  "entities": [
    {
      "entityId": 1,
      "position_m": { "x": 2.3, "y": 0.0, "z": 0.0 },
      "animation": {
        "primaryState": "attack",
        "idle": 0.0, "run": 1.0,
        "shockQ": 0.12,
        "dead": false
      },
      "condition": { "shockQ": 0.12, "dead": false, … }
    }
  ]
}
```

All values are in real SI units (metres, floats).  `primaryState` is a convenience string for driving top-level state machines.

---

## Step 4 — Connect your own mesh (5 minutes)

Replace the placeholder capsule with your humanoid character:

1. **Add your FBX/GLTF** to `Assets/Ananke/Models/`.
2. **Attach `SkeletonMapper`** to the character root.  It maps Ananke segment IDs to Unity `HumanBodyBones`:

```csharp
// Default segment → bone mapping (override via AnankeSkeletonConfig ScriptableObject)
// "head"     → HumanBodyBones.Head
// "thorax"   → HumanBodyBones.Chest
// "leftArm"  → HumanBodyBones.LeftUpperArm
// "rightArm" → HumanBodyBones.RightUpperArm
// "leftLeg"  → HumanBodyBones.LeftUpperLeg
// "rightLeg" → HumanBodyBones.RightUpperLeg
```

3. **Attach `AnimationDriver`** to drive Animator parameters from `BridgeAnimation`:

| Animator Parameter | Source field |
|---|---|
| `PrimaryState` (int) | `animation.primaryState` hashed |
| `Speed` (float) | `animation.locomotionBlend` |
| `ShockBlend` (float) | `animation.shockQ` |
| `IsDead` (bool) | `animation.dead` |

4. **Press Play** — your mesh now reacts to the simulation.

---

## Step 5 — Author a new scenario (3 minutes)

Edit `sidecar/src/scenario.ts` to change who fights:

```typescript
import { createWorld, loadScenario } from "@its-not-rocket-science/ananke";

export function createScenario() {
  // Load a content pack first (optional):
  // await loadPack("./packs/my-species.ananke-pack");

  // Create your world — any archetype, any seed:
  const world = createWorld(MY_SEED, [
    { archetype: "warrior", teamId: 1, x: -2, y: 0 },
    { archetype: "rogue",   teamId: 2, x:  2, y: 0 },
  ]);
  return world;
}
```

Restart the sidecar — Unity will pick up the new scenario automatically.

---

## Wire format reference

The sidecar uses `serializeBridgeFrame` from `@its-not-rocket-science/ananke/host-loop`:

```typescript
import { serializeBridgeFrame } from "@its-not-rocket-science/ananke/host-loop";

const frame = serializeBridgeFrame(world, { scenarioId: "my-scene", tickHz: 20 });
ws.send(JSON.stringify(frame));
```

See `src/host-loop.ts` for the full `BridgeFrame` / `BridgeEntitySnapshot` type definitions.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `AnankeReceiver` shows `Disconnected` | Check sidecar is running: `http://127.0.0.1:3001/health` |
| Characters not moving | Verify `AnankeController.ReceiverId` matches the `AnankeReceiver` GameObject |
| Position lag/jitter | Increase `AnankeInterpolator.BufferSize` (default 3 frames) |
| Wrong bone assignments | Customise `AnankeSkeletonConfig` ScriptableObject on `SkeletonMapper` |

---

## Next steps

- **Content packs** — load custom species and weapons: [docs/integration-primer.md](integration-primer.md)
- **Campaign integration** — run multiple battles: [docs/bridge-contract.md](bridge-contract.md)
- **Validation** — compare outcomes against real data: [docs/emergent-validation-report.md](emergent-validation-report.md)
- **Godot integration** — see [docs/quickstart-godot.md](quickstart-godot.md)
- **Web integration** — see [docs/quickstart-web.md](quickstart-web.md)
