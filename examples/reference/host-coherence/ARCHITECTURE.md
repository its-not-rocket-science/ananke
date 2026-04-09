# Architecture Note — Reference Host Coherence

## Components

- **Scenario Loader** (`loadScenarioFromPath`)
  - Loads `scenario.json` through stable `loadScenario`.
- **Host Step Loop** (`stepOnce`, `runUntilTerminal`)
  - Builds deterministic command maps and advances with `stepWorld`.
- **Replay Capture** (`ReplayRecorder`, `exportReplayJson`)
  - Records every tick and exports deterministic replay JSON.
- **Bridge Extraction** (`extractRigSnapshots`, `deriveAnimationHints`)
  - Produces renderer-facing snapshot summaries each inspect call.
- **Inspection Surface** (`inspect` + `web/main.js`)
  - Renders entity state, tick/replay metadata, bridge summary, and event log.
- **Persistence** (`saveSession`, `loadSession`)
  - Saves scenario + replay + event history; restores a session from replay.

## Data flow

1. User loads scenario.
2. Host initializes world + recorder.
3. Each step:
   - select commands
   - record frame
   - step world
   - update logs
4. Inspect path reads world and bridge snapshots into UI payload.
5. Save persists a portable JSON blob; load rebuilds world from replay.
