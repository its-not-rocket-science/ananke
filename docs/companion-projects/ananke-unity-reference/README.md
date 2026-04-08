# ananke-unity-reference

![Ananke version](https://img.shields.io/badge/ananke-0.1.0-6366f1)
![Unity](https://img.shields.io/badge/Unity-6%2B-000000?logo=unity&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![C#](https://img.shields.io/badge/C%23-11-239120?logo=csharp&logoColor=white)
![Status](https://img.shields.io/badge/status-developer--ready%20starter%20kit-brightgreen)

Developer-ready starter kit for rendering Ananke encounters in Unity with a stable sidecar/bridge contract.

---

## What this starter kit gives you

- **One deterministic simulated encounter** (Knight vs Brawler) stepped at 20 Hz.
- **One polished starter scene** (`StarterArena.unity`) with:
  - locomotion
  - combat state transitions
  - injury / condition-driven visual changes
  - replay scrub support
- **Stable contract integration**, pinned to Ananke Tier 1 + bridge/host contracts.
- **Replay/bridge inspection path** through frame endpoint and replay artifacts.

---

## Fast path (first render in ~10 minutes)

### 1) Install dependencies

```bash
# from ananke root
npm install
npm run build

# in companion project
cd ananke-unity-reference/sidecar
npm install
```

### 2) Run the simulated encounter

```bash
npm run sidecar
```

Expected startup output:

- `Ananke sidecar ready at http://127.0.0.1:7374`
- `Scenario: starter-arena-knight-vs-brawler`
- `Tick rate: 20 Hz`

### 3) See rendered result in Unity

1. Open `unity/` in Unity Hub.
2. Open `Assets/Scenes/StarterArena.unity`.
3. Press **Play**.

Expected visible behavior:

- Characters locomote into contact range.
- `idle` / `move` / `attack` transitions are driven by bridge animation hints.
- Injury and consciousness changes appear in overlay + animator blend parameters.

### 4) Inspect replay and bridge data

- Latest bridge frame: `http://127.0.0.1:7374/state`
- Health check: `http://127.0.0.1:7374/health`
- Replay artifact: `sidecar/out/replay/latest.replay.json`

Use the starter scrub UI to seek ticks and validate renderer state against bridge snapshots.

---

## Starter scene: `StarterArena.unity`

### Included gameplay slices

1. **Locomotion slice**
   - Opening spacing demonstrates movement blend before melee range.
   - Character root motion is derived from interpolated `position_m` snapshots.

2. **Combat slice**
   - Deterministic command stream issues `attackNearest` continuously.
   - Animator transitions are sourced from `animation.primaryState`.

3. **Injury/condition slice**
   - UI and material blend react to `shockQ`, `fluidLossQ`, `consciousnessQ`.
   - Supports visibly distinct outcomes when armor differs.

4. **Replay/scrub slice**
   - Sidecar records replay while sim runs.
   - Unity scrub control seeks target tick and reapplies snapshots.

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

- Sidecar is simulation authority; Unity is render authority.
- Unity never mutates canonical world state.
- Frame cadence is 20 Hz; Unity interpolates at render rate.
- Coordinates/metrics are SI-normalized by sidecar before consumption.
- Replay determinism requires identical seed + command stream.

### Out of scope

- Internal/Tier 3 imports from `src/**`.
- Physics-authoritative Unity Rigidbody simulation of combat outcomes.

---

## Integration flow (tightened)

1. **Boot sidecar** with deterministic scenario and tick loop.
2. **Step world** through stable host surface.
3. **Derive bridge frame** from stable bridge exports.
4. **Serve frame** over starter transport (HTTP/WS).
5. **Interpolate + render** in Unity only.
6. **Record replay** and expose data for scrub/debug.

If a required helper is outside Tier 1/root exports, treat it as non-starter-kit.

---

## Known limitations

- Sidecar transport adds a small IPC boundary vs in-process native plugin.
- Starter scene is a two-entity duel, not a full game loop.
- Replay scrub is tick-granular and not reverse-simulated sub-tick.
- Placeholder art/anim rigs are intentionally minimal.

---

## Why this is now a starter kit (vs reference-only)

- Onboarding path is linear and testable (install → run → render → inspect).
- Demo is explicitly aligned to locomotion/combat/injury/replay capabilities.
- API assumptions are documented against stable host/bridge contracts.
- Known limitations are listed for production planning.
