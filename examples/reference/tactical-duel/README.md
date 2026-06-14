# Tactical Duel — Reference App

Interactive keyboard-driven 1v1 duel demonstrating `combat`, `anatomy`, `sensory`,
`AI`, `bridge`, and `replay` working end-to-end.

A first-time evaluator can clone the repo, run one of the commands below in under
5 minutes, and see physics-grounded outcomes without reading any Ananke source.

## Modes

| Mode | Command | Description |
|------|---------|-------------|
| Auto (CI) | `npm run ref:tactical-duel` | Knight vs Brawler, runs to completion, prints summary |
| Auto with seed | `npm run ref:tactical-duel -- 7` | Same, different seed |
| Interactive | `npm run ref:tactical-duel -- --interactive` | Keyboard-driven terminal game |
| Interactive + seed | `npm run ref:tactical-duel -- 7 --interactive` | Interactive with chosen seed |

Interactive mode falls back to auto mode when stdout is not a TTY.

## Interactive controls

```
[A]     Attack nearest
[B]     Block (raise guard)
[H / ←] Move left
[L / →] Move right
[Space] Wait (stand still)
[P]     Pause / resume
[Q]     Quit and print summary
```

## Architecture

```
index.ts
├── createWorld(seed, [Knight spec, Brawler spec])
│
├── Auto mode: buildAutoCommands(world)
│   └── move toward enemy + attackNearest every tick
│
└── Interactive mode: runTacticalDuelInteractive()
    ├── stdin raw mode — keypress → pendingCmd queue
    ├── setInterval(130ms) — one sim tick per game tick
    │
    ├── AI: buildAICommands(world, buildWorldIndex, buildSpatialIndex, policyFor)
    │   └── policyFor(id=2) → BERSERKER_POLICY; policyFor(id=1) → undefined (player)
    │
    ├── Bridge: deriveAnimationHints(entity) → motion/guard/attack state per fighter
    ├── Sensory: canDetect(observer, subject, DEFAULT_SENSORY_ENV) → Q
    │
    ├── stepWorld(world, cmds, ctx)
    │
    ├── diffEvents(world, prevStates) → event log entries
    └── renderFrame() → ANSI terminal display
```

## Internal imports used

Auto mode uses **Tier-1 stable API only** (root imports). Interactive mode also uses
these internal modules (acceptable for a monorepo reference app):

| Module | Purpose |
|--------|---------|
| `src/sim/indexing` | `buildWorldIndex` — entity lookup table for AI |
| `src/sim/spatial`  | `buildSpatialIndex` — spatial grid for AI proximity queries |
| `src/sim/ai/system` | `buildAICommands` — AI command generation |
| `src/sim/ai/types`  | `AIPolicy` type |
| `src/model3d`       | `deriveAnimationHints` — bridge: pose/animation state |
| `src/sim/sensory`   | `canDetect`, `DEFAULT_SENSORY_ENV` — sensory detection |

## Display anatomy

```
 ANANKE — TACTICAL DUEL  seed:42  tick:87
──────────────────────────────────────────────────────────────────────────
 KNIGHT (you)                          BRAWLER (AI)
  Con ██████████  99%                   Con ██████░░░░  59%
  Shk ░░░░░░░░░░   0%                   Shk ████░░░░░░  38%
  Fld ░░░░░░░░░░   0%                   Fld ██░░░░░░░░  17%
  [RUN] Grd:  0% Atk:  0%              [IDLE] Grd:  0% Atk:  0%

  K→B detect: ████████  85%   B→K detect: ████████  85%

  ┌────────────────────────────────────────────┐
  │K───────────────────────────────────────────│ B
  └────────────────────────────────────────────┘
  Distance: 1.60m
```

- **Con** — consciousness (0% = unconscious)
- **Shk** — cumulative shock (>80% → incapacitated)
- **Fld** — fluid loss (>80% → fatal without treatment)
- **Motion** — IDLE / WALK / RUN / SPRT / PRNE / OUT / DEAD (from `deriveAnimationHints`)
- **Grd** — guarding intensity (from `AnimationHints.guardingQ`)
- **Atk** — attack blend weight (from `AnimationHints.attackingQ`)
- **K→B detect** — Knight's detection of Brawler via `canDetect`
- **Arena** — K and B positions on a fixed 5m arena bar

## Performance envelope

- Tested up to seed 99 — all complete within 500 ticks at 130ms/tick (< 65 seconds)
- `buildWorldIndex` + `buildSpatialIndex` called once per tick (microseconds; negligible for 2 entities)
- `ReplayRecorder` accumulates frame snapshots in memory; written on exit

## Known pain points

- **No projectile weapons**: both fighters are melee-only (longsword vs club)
- **1D arena**: positions tracked on X axis only; Y always zero
- **No terrain**: flat ground, no cover
- **No status effects**: disease, sleep debt, and environmental hazards not wired in (available in `src/sim/`)
- **AI policy is static**: BERSERKER_POLICY is hard-coded; real hosts would derive policy from entity attributes or game state

## Replay

Replay written to `dist/examples/reference/tactical-duel/replay-seed<seed>.json`
on every run (both modes). Pass `writeReplay: false` to `runTacticalDuel()` to skip.

## Run

```bash
npm run build
npm run ref:tactical-duel                      # auto mode, seed 42
npm run ref:tactical-duel -- 7                 # auto mode, seed 7
npm run ref:tactical-duel -- --interactive     # interactive, seed 42
npm run ref:tactical-duel -- 7 --interactive   # interactive, seed 7
```
