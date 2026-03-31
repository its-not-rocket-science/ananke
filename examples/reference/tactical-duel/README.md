# Tactical Duel — Reference Build

A complete end-to-end demonstration of Ananke's tactical simulation layer.  A Knight in mail
armour fights an Amateur Boxer armed with a club.  Every tick produces a `BridgeFrame` (the
same JSON a renderer would consume), a desync-check hash, and a replay file.

## What it demonstrates

| System | What you see |
|---|---|
| **Combat** | Longsword vs. club — kinetic energy → impact → injury accumulation |
| **Anatomy** | Per-region damage: `head`, `torso`, `left_arm`, etc. |
| **AI** | `lineInfantry` behavior tree drives both combatants |
| **BridgeFrame** | `serializeBridgeFrame` — the exact JSON a Unity/Godot renderer would read |
| **Replay** | `ReplayRecorder` writes a `.json` file; compare with `npx ananke replay diff` |
| **Desync hash** | `hashWorldState` produces a per-tick checksum for multiplayer parity checks |

## Run

```bash
npm run build
npm run ref:tactical-duel            # seed 42 (default)
npm run ref:tactical-duel -- 7       # seed 7
npm run ref:tactical-duel -- 99      # seed 99
```

## Architecture

```
examples/reference/tactical-duel/index.ts
  └─ src/sim/kernel.ts         stepWorld          (pure tick function)
  └─ src/sim/ai/decide.ts      decideCommandsForEntity
  └─ src/sim/ai/presets.ts     AI_PRESETS.lineInfantry
  └─ src/host-loop.ts          serializeBridgeFrame → BridgeFrame (wire format)
  └─ src/netcode.ts            hashWorldState     (desync checksum)
  └─ src/replay.ts             ReplayRecorder, serializeReplay
  └─ src/sim/injury.ts         InjuryState.byRegion  (anatomy-level damage)
  └─ src/equipment.ts          STARTER_WEAPONS, STARTER_ARMOUR
```

## Package choices

| Package | Why |
|---|---|
| `@ananke/core` | `stepWorld`, `Entity`, fixed-point units, RNG |
| `@ananke/combat` | Injury model, anatomy regions, weapon profiles |
| `host-loop.ts` | Wire format — same JSON a renderer receives |
| `netcode.ts` | Desync detection — same checksum a multiplayer server would verify |
| `replay.ts` | Replay recording — for post-mortem diff and test fixture generation |

## Performance envelope

Measured on a 2024 laptop (Apple M3, Node 22):

| Metric | Typical value |
|---|---|
| Entities | 2 |
| Ticks per fight | 20–200 (seed-dependent) |
| Time per tick | < 1 ms |
| 20 Hz budget (50 ms) | Well within budget |

## Pain points resolved

- **`BRAWLER` archetype doesn't exist** — no `BRAWLER` export; used `AMATEUR_BOXER` instead.
  The archetypes module exposes `HUMAN_BASE`, `AMATEUR_BOXER`, `PRO_BOXER`, `GRECO_WRESTLER`,
  `KNIGHT_INFANTRY`, and body-plan exotics.  Check `src/archetypes.ts` for the full list.
- **`InjuryState.regions` doesn't exist** — injury is stored as `InjuryState.byRegion`
  (`Record<string, RegionInjury>`), not an array.  Use `Object.entries(entity.injury.byRegion)`.
- **`import.meta.url` for replay path** — works in ESM (`"type": "module"`) but requires
  `--experimental-vm-modules` in some Node versions.  The replay write is wrapped in a
  try/catch for environments where filesystem access is restricted.

## Replay diff workflow

After running two seeds, compare their replays:

```bash
npm run ref:tactical-duel -- 42
npm run ref:tactical-duel -- 43
npx ananke replay diff \
  examples/reference/tactical-duel/replay-seed42.json \
  examples/reference/tactical-duel/replay-seed43.json
# Expected: ✗ Divergence at tick N (different seeds → different outcomes)
```

To verify determinism, run the same seed twice — the diff should report identical:

```bash
npm run ref:tactical-duel -- 42
cp examples/reference/tactical-duel/replay-seed42.json /tmp/replay-a.json
npm run ref:tactical-duel -- 42
npx ananke replay diff /tmp/replay-a.json examples/reference/tactical-duel/replay-seed42.json
# Expected: ✓ Replays are identical
```
