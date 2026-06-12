# OpenWorldBuilder Deterministic Backend Reference Demo

This reference demo shows Ananke in the exact role a generated-world host needs:

- **OpenWorldBuilder (or similar host generator)** creates the world graph, regions, settlements, factions, and lore pointers.
- **Ananke** consumes that generated world as simulation input and deterministically evolves it over long horizons.
- **Host platform** keeps ownership of world generation and lore storage; Ananke returns deterministic evolution outputs.

## What this demo includes

1. Load a generated-world fixture in a host-friendly schema (`openworldbuilder-generated-world.fixture.json`).
2. Adapt it into Ananke world-evolution input via the open-world adapter.
3. Run deterministic world evolution for a substantial duration (**720 steps**).
4. Emit host-facing outputs for each run:
   - final world state
   - timeline/history events
   - metrics dashboard payload
   - checkpoint metadata
5. Demonstrate branchable what-if simulation:
   - baseline run (full world evolution)
   - altered run (`trade-shock` profile overrides)
   - divergence/comparison payload

## Run

```bash
npm run build
node dist/examples/reference/openworldbuilder-deterministic-backend/index.js
```

## Artifacts generated

The script writes JSON artifacts to:

`dist/examples/reference/openworldbuilder-deterministic-backend/artifacts/`

Baseline outputs:
- `baseline.final-world-state.json`
- `baseline.timeline.json`
- `baseline.metrics-dashboard.json`
- `baseline.checkpoint-metadata.json`

Altered outputs:
- `altered.final-world-state.json`
- `altered.timeline.json`
- `altered.metrics-dashboard.json`
- `altered.checkpoint-metadata.json`

Cross-run comparison:
- `branch-divergence-comparison.json`
- `host-platform-payload.json`

## Host integration flow (real platform)

A real generated-world host can follow this integration contract:

1. **Generation phase (host-owned)**
   - Host generator creates world graph + lore pointers.
   - Host stores canonical lore/documents in its own DB/object store.
2. **Adaptation phase (bridge layer)**
   - Host maps generated world entities into `OpenWorldHostInput`.
   - Host passes simulation metadata fields in `metadata.simulation` buckets and preserves opaque data in `metadata.opaque`.
3. **Evolution phase (Ananke-owned deterministic execution)**
   - Convert host input via `mapOpenWorldHostToEvolutionInput` / `toAnankeEvolutionStateFromOpenWorld`.
   - Execute deterministic runs using `createEvolutionBranch` + `runEvolutionOnBranch`.
   - Use checkpoints to resume or fork runs for planning and what-if analysis.
4. **Persistence/reporting phase (host-owned)**
   - Host persists final snapshots, timelines, and checkpoint metadata.
   - Host renders metrics dashboard payloads and branch comparisons in its own analytics UX.
   - Host links evolved facts back to lore records without moving lore storage into Ananke.

## Key message proven by this demo

Ananke is a **deterministic world evolution backend**, not a replacement for host world generation or lore systems.
It evolves generated worlds predictably using the existing simulation stack and returns host-ready artifacts for persistence, analytics, and branch comparison.
