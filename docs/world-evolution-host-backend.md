# World Evolution Host Backend (Additive Facade)

## Why this exists

`@its-not-rocket-science/ananke/world-evolution-host-backend` is an additive integration facade for external host platforms (e.g. OpenWorldBuilder-style generators) that want a single deterministic call path without bypassing existing authoritative subsystems.

It **does not replace** core modules. It composes:

- host schema adapter + validator (`world-evolution-backend`)
- deterministic step engine (`world-evolution-backend`)
- session/checkpoint/branch orchestration (`world-evolution`)

## Stability boundary

- Root Tier-1 API (`@its-not-rocket-science/ananke`) remains unchanged.
- This facade is a dedicated additive subpath for host integrations.
- Existing backend/orchestration APIs remain authoritative and fully usable directly.

## Architecture (composition points)

1. Host input enters as `WorldEvolutionInput`.
2. `normalizeHostWorldInput` / `toAnankeEvolutionState` canonicalize and validate deterministically.
3. `toWorldEvolutionRunRequest` maps host input into canonical evolution snapshots.
4. `runWorldEvolution` executes deterministic N-step simulation.
5. `buildEvolutionTimeline` projects host-friendly timeline/history events.
6. Optional orchestration wrappers expose:
   - sessions
   - checkpoints/resume
   - branch sandbox runs

This keeps deterministic simulation logic in existing subsystem modules while providing a smaller host-facing operational surface.

## Example import

```ts
import {
  runHostDeterministicEvolution,
  createHostEvolutionSession,
  runHostEvolutionSession,
  resumeHostEvolutionSessionFromCheckpoint,
  createHostEvolutionBranch,
  runHostEvolutionBranch,
} from "@its-not-rocket-science/ananke/world-evolution-host-backend";
```

## Reproducibility contract

For identical normalized host input + ruleset/profile + seed + steps + engine version, outputs are deterministic:

- final snapshot
- timeline/history projection
- metrics
- deltas/checkpoints (when enabled)

Resume and branch flows preserve deterministic behavior because they route through existing checkpoint and branch orchestration primitives.
