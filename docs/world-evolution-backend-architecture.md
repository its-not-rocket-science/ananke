# World Evolution Backend Composition Architecture

This note documents how the deterministic world-evolution backend composes existing Ananke systems additively for host-platform integration.

## Goals

- Preserve existing subsystem authority (polity, governance, diplomacy, migration, epidemic, climate, trade).
- Keep root Tier-1 API stable by exposing host/backend surfaces via additive subpaths.
- Support deterministic reproducibility and branchable orchestration for external hosts.

## Composition points

1. **Host adaptation layer** (`src/world-evolution-backend/host-schema.ts`, `src/world-evolution-backend/open-world-host-adapter.ts`)
   - Accept host-friendly payloads.
   - Normalize/canonicalize deterministic ordering.
   - Validate schema constraints and map to canonical Ananke snapshot.

2. **Deterministic engine layer** (`src/world-evolution-backend/engine.ts`)
   - Orchestrates existing domain modules without replacing them.
   - Emits timeline step events, metrics, optional deltas, optional checkpoints.

3. **Timeline projection layer** (`src/world-evolution-backend/timeline.ts`)
   - Converts per-step outputs into host-facing chronological history events.

4. **Session/checkpoint orchestration layer** (`src/world-evolution.ts`, `src/world-evolution-host-backend.ts`)
   - Provides deterministic run loops, checkpoint resume, and branch/what-if flows.

5. **Reproducibility utilities (additive)**
   - Compute deterministic run fingerprints for request and output payloads.
   - Intended for host-side caching, replay verification, and auditability.

## Stability boundary

- Tier-1 root exports remain unchanged.
- Host-facing world-evolution integration remains additive via:
  - `@its-not-rocket-science/ananke/world-evolution-engine`
  - `@its-not-rocket-science/ananke/world-evolution-host-backend`

