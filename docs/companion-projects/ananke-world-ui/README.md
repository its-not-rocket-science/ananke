# ananke-world-ui

![Ananke version](https://img.shields.io/badge/ananke-0.1.0-6366f1)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![SvelteKit](https://img.shields.io/badge/SvelteKit-2.x-ff3e00?logo=svelte&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-r165%2B-000000?logo=threedotjs&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.x-646cff?logo=vite&logoColor=white)
![Status](https://img.shields.io/badge/status-wanted-lightgrey)

The complete application layer for Ananke: world map editor, entity editor, simulation runner, replay viewer, and outcome dashboard. This is the separate product described in Ananke's ROADMAP — a full UI for world creation, combat authoring, and campaign analysis.

---

## Table of contents

1. [Purpose](#purpose)
2. [Why separate from Ananke](#why-separate-from-ananke)
3. [Prerequisites](#prerequisites)
4. [Architecture](#architecture)
5. [The five panels](#the-five-panels)
6. [Quick start](#quick-start)
7. [File layout](#file-layout)
8. [Ananke API surface used](#ananke-api-surface-used)
9. [Multiplayer / world server](#multiplayer--world-server)
10. [Contributing](#contributing)

---

## Purpose

Ananke is a headless kernel. It has no opinion about how you create worlds, author entities, run simulations, or visualise outcomes. That is intentional — the kernel stays small and focused.

`ananke-world-ui` is the product layer that makes Ananke accessible to designers, writers, and players who do not want to write TypeScript. It provides five integrated panels:

1. **World builder** — polity placement and location graph editing
2. **Entity editor** — archetype and equipment authoring
3. **Simulation runner** — live tick loop with playback controls
4. **Replay viewer** — scrub through recorded fights
5. **Outcome dashboard** — statistics across many seeds

---

## Why separate from Ananke

The kernel has no runtime dependencies and must stay that way. A UI application requires:

- A UI framework (SvelteKit, React, etc.) — a significant dependency
- A 3D renderer (Three.js, Babylon.js, etc.)
- Local file system access for save files
- Potentially a server for multiplayer

These are product decisions with their own release cycle and UX opinions. Coupling them to the kernel would force UI framework upgrades on all headless integrators. Keeping them separate lets each evolve independently.

---

## Prerequisites

| Dependency | Minimum version | Notes |
|-----------|----------------|-------|
| Node.js | 18 | |
| npm | 9 | |
| Ananke | 0.1.0 | Cloned alongside this repo |

Clone Ananke into a sibling directory before cloning this project:

```
workspace/
  ananke/           ← https://github.com/its-not-rocket-science/ananke
  ananke-world-ui/  ← this repo
```

---

## Architecture

```
ananke-world-ui (SvelteKit + Vite)
│
├── lib/
│   ├── sim/           Thin wrapper around Ananke kernel APIs
│   ├── replay/        ReplayRecorder + serialize/deserialize helpers
│   └── bridge/        Re-exports ananke-threejs-bridge for 3D panel
│
├── panels/
│   ├── WorldBuilder/   CampaignState editor (polities, locations)
│   ├── EntityEditor/   Archetype + equipment loadout editor
│   ├── SimRunner/      Tick loop UI with pause/step/speed controls
│   ├── ReplayViewer/   Replay scrubber + 3D playback
│   └── Dashboard/      Outcome charts, survival curves, casualty stats
│
└── server/            Optional world-server integration (multiplayer)
```

The UI communicates with Ananke exclusively through Tier 1 and Tier 2 stable APIs. No imports from `src/sim/kernel.ts` internals. This means the UI can update to new Ananke minor versions without breaking.

### Recommended tech stack

The stack below has no strong opinion baked into the repo — fork and change it. These are the recommended defaults:

| Layer | Choice | Rationale |
|-------|--------|-----------|
| App framework | SvelteKit 2 | Small bundle, excellent TypeScript support, SSR optional |
| 3D preview | ananke-threejs-bridge | Already wired to Ananke bridge APIs; zero duplication |
| Charts | Chart.js or D3 | Lightweight; works server-side for SSR |
| State management | Svelte stores | Reactive without an external library |
| Styling | Tailwind CSS + dark theme | Consistent with existing `docs/editors/` tools |

If you prefer React + Vite, the architecture above maps cleanly. The panel structure is framework-agnostic.

---

## The five panels

### 1. World builder

Builds a `CampaignState` from scratch:

- Place polities on a 2D map (pixel coordinates mapped to Ananke `x_Sm`, `y_Sm` positions)
- Connect polities with location edges (roads, rivers, mountain passes)
- Set initial faction standings (Phase 24)
- Export as `CampaignState` JSON for use in the sim runner

The map editor is a canvas-based drag-and-drop tool. No GIS library required for the reference implementation — a simple SVG canvas is sufficient.

### 2. Entity editor

Authors `Archetype` and equipment loadouts:

- Wraps the concepts from `docs/editors/species-forge.html` and `docs/editors/culture-forge.html`
- Numeric sliders for all archetype fields (mass, peakForce, controlQuality, etc.)
- Dropdown for species body plan (humanoid, quadruped, custom)
- Equipment picker (weapon + armour from `STARTER_WEAPONS`, `STARTER_ARMOUR`, custom entries)
- Live preview: calls `generateIndividual` on every change and shows the resulting entity stats
- Export as `Archetype` + `EquipmentLoadout` JSON

The entity editor supersedes the standalone HTML tools in `docs/editors/`. Those tools remain as prior-art reference; this panel is the canonical replacement.

### 3. Simulation runner

Runs the Ananke tick loop in the browser (or Node.js server for large campaigns):

- Pause / resume / step-one-tick controls
- Speed multiplier: 0.5×, 1×, 5×, 50× (max speed limited by device performance)
- Live entity state display: health bars for shock, fluid loss, consciousness
- 3D preview panel (via ananke-threejs-bridge) showing current tick
- Command builder: issue `move`, `attack`, `flee` commands to selected entities
- Session log: tick-by-tick event feed (attacks, injuries, deaths, status changes)

For campaigns larger than ~20 entities, the sim runner can optionally delegate `stepWorld` to a Web Worker to keep the UI responsive.

### 4. Replay viewer

Loads a serialised replay (from `serializeReplay`) and lets you scrub through it:

- Timeline scrubber (drag to any tick)
- Play / pause / reverse playback
- 3D preview synced to scrubber position (via ananke-threejs-bridge)
- Per-tick entity state inspector (click an entity to see all fields at that tick)
- Export clip: select a tick range and export as a sub-replay JSON

Replay files are produced by the sim runner (auto-save) or by any tool that wraps `ReplayRecorder`.

### 5. Outcome dashboard

Runs the same scenario across N seeds and shows aggregate statistics:

- Win rate by faction / archetype
- Casualty distribution (histogram of deaths per fight)
- Survival curves (time-to-death distribution)
- Shock progression chart (average shock over time for winners vs losers)
- Export as CSV or PNG chart

The dashboard calls `runArenaScenario` (Tier 2) internally. For large N (>1000 seeds), it batches runs in a Web Worker to avoid blocking the UI thread.

---

## Quick start

```bash
# 1. Clone Ananke and build it
git clone https://github.com/its-not-rocket-science/ananke.git
cd ananke && npm install && npm run build && cd ..

# 2. Clone this repo
git clone https://github.com/its-not-rocket-science/ananke-world-ui.git
cd ananke-world-ui

# 3. Install dependencies
npm install

# 4. Start dev server
npm run dev
# Opens http://localhost:5173

# 5. Build for production
npm run build
```

---

## File layout

```
ananke-world-ui/
├── src/
│   ├── lib/
│   │   ├── sim/
│   │   │   ├── SimSession.ts        Wraps stepWorld + ReplayRecorder
│   │   │   └── WorkerBridge.ts      Web Worker proxy for large campaigns
│   │   ├── replay/
│   │   │   ├── ReplaySession.ts     Wraps deserializeReplay + replayTo
│   │   │   └── ReplayExporter.ts    Sub-clip extraction
│   │   └── bridge/
│   │       └── index.ts             Re-exports from ananke-threejs-bridge
│   │
│   ├── panels/
│   │   ├── WorldBuilder/
│   │   │   ├── WorldBuilder.svelte
│   │   │   ├── MapCanvas.svelte
│   │   │   └── PolityEditor.svelte
│   │   ├── EntityEditor/
│   │   │   ├── EntityEditor.svelte
│   │   │   ├── ArchetypeSliders.svelte
│   │   │   └── EquipmentPicker.svelte
│   │   ├── SimRunner/
│   │   │   ├── SimRunner.svelte
│   │   │   ├── PlaybackControls.svelte
│   │   │   ├── EntityHealthBars.svelte
│   │   │   └── CommandBuilder.svelte
│   │   ├── ReplayViewer/
│   │   │   ├── ReplayViewer.svelte
│   │   │   ├── TimelineScrubber.svelte
│   │   │   └── EntityInspector.svelte
│   │   └── Dashboard/
│   │       ├── Dashboard.svelte
│   │       ├── WinRateChart.svelte
│   │       ├── SurvivalCurve.svelte
│   │       └── OutcomeExporter.svelte
│   │
│   ├── routes/
│   │   └── +page.svelte             Single-page layout with panel switcher
│   │
│   └── app.html
│
├── static/
│   └── models/                      Character models for 3D preview
│
├── server/
│   └── world-server-adapter.ts      Wraps world-server.ts for multiplayer
│
├── svelte.config.js
├── vite.config.ts
├── tsconfig.json
└── README.md
```

---

## Ananke API surface used

| Ananke export | Panel | Tier |
|--------------|-------|------|
| `stepWorld(world, cmds, ctx)` | Sim Runner | Tier 1 |
| `generateIndividual(seed, archetype)` | Entity Editor | Tier 1 |
| `WorldState`, `KernelContext` | Sim Runner | Tier 1 |
| `ReplayRecorder` | Sim Runner | Tier 1 |
| `serializeReplay(replay)` | Sim Runner | Tier 1 |
| `deserializeReplay(json)` | Replay Viewer | Tier 1 |
| `replayTo(replay, tick, ctx)` | Replay Viewer | Tier 1 |
| `runArenaScenario` | Dashboard | Tier 2 |
| `extractRigSnapshots` | Sim Runner (via bridge) | Tier 2 |
| `deriveAnimationHints` | Sim Runner (via bridge) | Tier 2 |
| `SCALE`, `q()` | Entity Editor | Tier 1 |

---

## Multiplayer / world server

Ananke ships a `world-server.ts` reference implementation (run with `npm run run:world-server`). `ananke-world-ui` can optionally connect to it for multiplayer or server-authoritative simulation:

```
Browser A ──► WebSocket ──► world-server.ts ──► stepWorld
Browser B ──► WebSocket ──►                       │
                                                  ▼
                                        broadcast WorldState to all clients
```

`server/world-server-adapter.ts` wraps the world-server's WebSocket protocol. When the adapter is connected, the sim runner panel becomes a view-only client; all `stepWorld` calls happen on the server.

For single-player use, the adapter is not needed — the sim runner runs the kernel in-browser.

---

## Contributing

1. Fork this repository and create a feature branch.
2. Each panel is independently testable — prefer unit tests for data-layer logic in `src/lib/`.
3. Use Svelte's `$state` rune (Svelte 5) or stores (Svelte 4) — do not reach into Ananke internals from component files.
4. The 3D preview panel must be lazy-loaded (it is large); use `import()` dynamic import in SvelteKit.
5. Run `npm run typecheck` and `npm run check` (SvelteKit type checker) before opening a PR.
