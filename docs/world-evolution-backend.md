# World Evolution Backend (Host Integration)

## Purpose

`world-evolution-backend` is an additive, deterministic composition layer for host platforms (for example OpenWorldBuilder) that need reproducible world-scale progression runs.

It does **not** replace existing systems. It orchestrates existing modules and emits host-facing outputs:

- final world snapshot
- per-step timeline/event log
- summary metrics
- optional deltas/checkpoints

## Stable import path

Use the dedicated subpath export:

```ts
import {
  runWorldEvolution,
  listAvailableWorldEvolutionProfiles,
} from "@its-not-rocket-science/ananke/world-evolution-backend";
```

No Tier-1 root exports were changed.

## Host flow

1. Build an initial `WorldEvolutionSnapshot` (canon state).
2. Pick a profile (`balanced`, `resilience`, `expansion`) or provide a custom profile.
3. Run `runWorldEvolution({ snapshot, steps, ... })`.
4. Read:
   - `finalSnapshot`
   - `timeline`
   - `metrics`
   - optional `deltas`/`checkpoints`

## Canon vs derived timelines

- `initialSnapshot` is treated as canonical input.
- simulation mutations occur on an isolated runtime clone.
- `finalSnapshot` and timeline artifacts are derived outputs.

This keeps lore/canon source state separate from generated timeline projections.

## Composition architecture (additive)

The backend composes existing systems in deterministic order per step:

1. **Polity core**: `stepPolityDay` (trade, war, morale/stability baseline)
2. **Governance**: `stepGovernanceCooldown`, `stepGovernanceStability`, `computeGovernanceModifiers`
3. **Diplomacy**: treaty strength/expiry progression
4. **Trade routes**: efficiency step + `applyDailyTrade`
5. **Migration**: `resolveMigration` + `applyMigrationFlows`
6. **Climate**: deterministic `generateClimateEvent`, aggregate effects, lifecycle stepping
7. **Epidemic**: `stepEpidemic` + death pressure application

All sequencing is deterministic and order-stable (sorted IDs, no `Math.random`).

## Determinism notes

- Uses fixed-point arithmetic and existing deterministic world primitives.
- Iteration order is normalized by IDs before applying updates.
- same snapshot + same profile + same step count => byte-for-byte equal result object.

## Minimal API

- `createWorldEvolutionSnapshot(snapshot)`
- `runWorldEvolution(request)`
- `listAvailableWorldEvolutionProfiles()`
- plus profile helpers/types via the same subpath.
