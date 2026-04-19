# World Evolution Engine Integrator Guide

## Intended audience

This guide is for **host-platform integrators** (game backend engineers, simulation platform engineers, and tooling teams) who need deterministic, long-horizon world progression with explicit adapter boundaries.

If you are building direct game logic on top of the root Tier-1 API, this is likely not your first stop.

## Import path and stability tier

Preferred additive subpath:

```ts
import {
  runWorldEvolution,
  toWorldEvolutionRunRequest,
  buildEvolutionTimeline,
} from "@its-not-rocket-science/ananke/world-evolution-engine";
```

Stability status:

- Root (`@its-not-rocket-science/ananke`) remains the only **Tier-1 stable** contract.
- `@its-not-rocket-science/ananke/world-evolution-engine` is a **shipped, non-Tier-1 additive subpath**.
- `@its-not-rocket-science/ananke/world-evolution-backend` remains supported as a compatibility alias.

## Minimal integration path

1. Construct host data using `WorldEvolutionInput`.
2. Convert to a deterministic run request via `toWorldEvolutionRunRequest(...)`.
3. Execute `runWorldEvolution(...)`.
4. Optionally project run output into host UI timelines with `buildEvolutionTimeline(...)`.

```ts
import {
  toWorldEvolutionRunRequest,
  runWorldEvolution,
  buildEvolutionTimeline,
  type WorldEvolutionInput,
} from "@its-not-rocket-science/ananke/world-evolution-engine";

const hostInput: WorldEvolutionInput = {
  worldSeed: 1337,
  entities: [
    { kind: "polity", id: "p.alpha", name: "Alpha", population: 120_000, treasury_cu: 40_000 },
    { kind: "polity", id: "p.beta", name: "Beta", population: 80_000, treasury_cu: 35_000 },
  ],
};

const runRequest = toWorldEvolutionRunRequest(hostInput, 30, {
  includeDeltas: true,
  checkpointInterval: 10,
});

const result = runWorldEvolution(runRequest);
const timeline = buildEvolutionTimeline(result, { includeSummaryText: true });
```

## Schema expectations

- Host ingress contract: `WorldEvolutionInput`.
- Adapter normalization/validation:
  - `validateWorldEvolutionInput(...)` for deterministic, path-addressed errors.
  - `normalizeHostWorldInput(...)` for canonical sorting.
- Canonical schema versions:
  - host input schema: `ananke.host-world-evolution-input.v1`
  - backend snapshot schema: `ananke.world-evolution-backend.v1`
- JSON Schema for host validation: `schema/world-evolution-input.schema.json`.

## Determinism guarantees

For identical:

- normalized input payload,
- seed,
- profile + overrides,
- step count,
- and engine version,

the engine produces deterministic outputs (snapshot/timeline/metrics/deltas/checkpoints).

Determinism is supported by:

- explicit fixed subsystem order,
- sorted iteration over IDs,
- fixed-point simulation primitives,
- no `Math.random` in the world-evolution step pipeline.

## Checkpointing and branching model

- `runWorldEvolution(...)` supports periodic checkpoints via `checkpointInterval`.
- Session/branch orchestration remains in `@its-not-rocket-science/ananke/world-evolution`.
- Typical flow:
  - evolve with checkpoints,
  - persist checkpoint payloads,
  - resume/fork using orchestration APIs,
  - diff branch output against base for host dashboards.

This separation keeps the engine focused on deterministic stepping while orchestration handles lifecycle concerns.

## First-hour integrator example

See:

- `examples/world-evolution-engine-first-hour.ts`

It shows:

- host-input normalization + validation,
- deterministic run configuration,
- timeline projection,
- checkpoint emission,
- and a lightweight deterministic re-run sanity check.

## Optional host-backend facade

For hosts that want a single higher-level wrapper combining adapter + deterministic run + orchestration helpers, use:

```ts
import { runHostDeterministicEvolution } from "@its-not-rocket-science/ananke/world-evolution-host-backend";
```

See `docs/world-evolution-host-backend.md` for lifecycle wrappers (session/checkpoint resume/branch what-if).


## Reproducibility fingerprints (additive)

Use deterministic fingerprints to verify replay identity across hosts, caches, and audit logs.

```ts
import {
  buildEvolutionRunReproducibilityRecord,
  runWorldEvolution,
  toWorldEvolutionRunRequest,
} from "@its-not-rocket-science/ananke/world-evolution-engine";

const request = toWorldEvolutionRunRequest(normalizedHostInput, 30, {
  includeDeltas: true,
  checkpointInterval: 10,
});
const result = runWorldEvolution(request);
const proof = buildEvolutionRunReproducibilityRecord(request, result);

// proof.requestFingerprint and proof.outputDigest are stable 8-hex hashes
```

