# OpenWorldBuilder Host Integration — Deterministic Evolution Backend (Reference Demo)

This reference demo shows Ananke used as a **deterministic world evolution backend** for an OpenWorldBuilder-style platform.

It demonstrates a host flow where:

1. The host world generator emits a fixture in host schema (`generated-world-host-fixture.json`).
2. Ananke adapter translates that fixture into deterministic world evolution input.
3. The simulation stack runs long-horizon world evolution (540 steps).
4. The host receives normalized simulation artifacts:
   - final world state
   - timeline/history events
   - metrics dashboard payload
   - checkpoint metadata
5. The host runs branchable “what-if” variants and compares divergence.

## What this proves

- **Ananke is not world generation**: generation remains in host pipeline.
- **Ananke is not lore storage**: lore and metadata remain host-owned passthrough.
- **Ananke is deterministic evolution**: given the same snapshot + profile, output is stable and replayable.

## Files

- Fixture input: `fixtures/world-evolution-open-worldbuilder/generated-world-host-fixture.json`
- Demo runner: `examples/reference/open-worldbuilder-backend/index.ts`
- Demo orchestration helper: `src/world-evolution-backend/open-worldbuilder-reference-demo.ts`

## Run

```bash
npm run build
node dist/examples/reference/open-worldbuilder-backend/index.js
```

The script prints a single JSON payload containing:

- `adapterSummary`
- `baseline`
- `altered`
- `divergence`

## Host integration pattern (real platform)

### 1) Generation phase (host-owned)

OpenWorldBuilder (or equivalent) generates world topology, regions, factions, settlements, and lore storage pointers.

### 2) Adaptation phase (boundary)

The host sends the generated state to Ananke via the OpenWorld adapter (`mapOpenWorldHostToEvolutionInput` / `toAnankeEvolutionStateFromOpenWorld`).

### 3) Deterministic simulation phase (Ananke-owned)

Ananke runs deterministic evolution and emits:

- world snapshot at end tick
- deterministic timeline events for UX/feeds
- dashboard-ready metrics series
- checkpoint metadata for saves/replays

### 4) Persistence + storytelling phase (host-owned)

Host stores snapshots, checkpoints, lore updates, and player-facing narrative content in its own systems.

### 5) Branching / what-if phase

Host forks from same initial snapshot with changed parameters (policy, climate pressure, trade assumptions, etc.) and compares divergences for analytics or gameplay.
