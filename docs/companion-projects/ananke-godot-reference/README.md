# ananke-godot-reference

![Ananke version](https://img.shields.io/badge/ananke-0.1.0-6366f1)
![Godot](https://img.shields.io/badge/Godot-4.2%2B-478cbf?logo=godotengine&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![Status](https://img.shields.io/badge/status-developer--ready%20starter%20kit-brightgreen)

Developer-ready starter kit for rendering Ananke encounters in Godot 4 with a stable sidecar/bridge contract.

---

## What this starter kit gives you

- **One deterministic simulated encounter** (Knight vs Brawler) stepped at 20 Hz.
- **One polished starter scene** (`StarterArena.tscn`) with:
  - locomotion
  - combat state transitions
  - injury / condition-driven visual changes
  - replay scrub support
- **Stable contract integration**, pinned to Ananke Tier 1 + bridge/host contracts (no internal imports).
- **Replay/bridge inspection path** through JSON frame and replay artifact files.

---

## Fast path (first render in ~10 minutes)

### 1) Install dependencies

```bash
# from ananke root
npm install
npm run build

# in companion project
cd ananke-godot-reference/sidecar
npm install
```

### 2) Run the simulated encounter

```bash
npm run sidecar
```

Expected startup output:

- `Ananke sidecar listening on ws://127.0.0.1:7373`
- `Scenario: starter-arena-knight-vs-brawler`
- `Tick rate: 20 Hz`

### 3) See rendered result in Godot

1. Open `godot/project.godot`.
2. Open `scenes/StarterArena.tscn`.
3. Press **F5**.

Expected visible behavior:

- Entities move into engagement range (locomotion).
- `idle` → `attack` / `guard` transitions are visible.
- Injury progression affects animation blend and condition HUD.

### 4) Inspect replay and bridge data

- Live frame stream: `ws://127.0.0.1:7373`
- Optional snapshot endpoint (if enabled): `http://127.0.0.1:7373/state`
- Replay artifact: `sidecar/out/replay/latest.replay.json`

Use the demo scrub bar to jump between recorded ticks and compare current render state against serialized bridge frames.

---

## Starter scene: `StarterArena.tscn`

### Included gameplay slices

1. **Locomotion slice**
   - Start distance is wide enough to show run/blend before contact.
   - Uses interpolated `position_m` and facing vectors from bridge frame.

2. **Combat slice**
   - `attackNearest` commands on both entities.
   - AnimationTree state transitions are driven from `animation.primaryState`.

3. **Injury/condition slice**
   - Uses `condition.shockQ`, `condition.fluidLossQ`, `condition.consciousnessQ`.
   - Injury blend lane in UI and material overlay tracks deterioration.

4. **Replay/scrub slice**
   - Sidecar records deterministic replay stream.
   - Godot scrub UI seeks to arbitrary tick and reapplies snapshots.

---

## Stable API and bridge/host assumptions

This starter kit intentionally depends only on Ananke’s stable integration contract.

### Allowed Ananke import surface (Tier 1)

- `createWorld`, `stepWorld`
- `extractRigSnapshots`, `deriveAnimationHints`
- `ReplayRecorder`, `serializeReplay`
- `q`, `SCALE`

### Contract references

- Host loop guarantees: `docs/host-contract.md`
- Bridge frame schema: `docs/bridge-contract.md`
- Stable export policy: `STABLE_API.md`

### Bridge assumptions (explicit)

- Sidecar is authoritative for simulation progression.
- Godot is render-only and never mutates sim state.
- Frame cadence is 20 Hz; renderer interpolates at display rate.
- All positional values are metres after fixed-point normalization.
- Replay is deterministic when seed + command stream are unchanged.

### Out of scope

- Direct imports from `src/**` or Tier 3/internal APIs.
- Engine-side physics authority diverging from Ananke state.

---

## Integration flow (tightened)

1. **Boot sidecar** → create world + start deterministic tick loop.
2. **Step world** → `stepWorld(world, commands, ctx)`.
3. **Build bridge frame** from stable snapshot/hints exports.
4. **Stream frame** over sidecar transport.
5. **Render/interpolate** in Godot only.
6. **Record replay** in sidecar and expose for scrub.

If a helper cannot be mapped to Tier 1/root exports, treat it as non-starter-kit and remove it.

---

## Known limitations

- Uses loopback IPC (WebSocket/HTTP) rather than in-process native plugin.
- Demo focuses on two-entity duel and does not include navmesh/crowd control.
- Replay scrub is tick-based (not sub-tick interpolation in reverse path).
- Placeholder rigs/materials are intentionally minimal and non-production.

---

## Why this is now a starter kit (vs reference-only)

- Onboarding path is linear and verifiable (install → run → render → inspect).
- Demo scene is explicitly scoped to locomotion/combat/injury/replay.
- API and contract assumptions are documented as requirements.
- Limitations are transparent so teams can plan production hardening.
