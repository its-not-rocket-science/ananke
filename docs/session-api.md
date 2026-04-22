# Session API (Tier 2 / experimental)

`@its-not-rocket-science/ananke/session` is a **host-oriented facade** over existing public simulation APIs.

> Stability: this subpath is **Tier 2 / experimental**. It is shipped, but it is not covered by Tier 1 stability guarantees.

## Why this API exists

Most hosts need a consistent lifecycle (`create`, `run`, `fork`, save/load) across different simulation modes.
The session API wraps that lifecycle so hosts can use one integration shape instead of hand-wiring separate tactical and world-evolution loops.

## When to use this vs. low-level functions

Use `@its-not-rocket-science/ananke/session` when you want:

- a mode-aware session handle (`tactical` or `world_evolution`),
- a common run/fork/serialize flow,
- host-level orchestration with minimal glue code.

Use low-level functions from `@its-not-rocket-science/ananke` (and other subpaths) when you need:

- full control over each tick and command map internals,
- mode-specific custom scheduling,
- direct access to domain primitives without facade constraints.

## Supported modes

- `"tactical"`
- `"world_evolution"`

## Lifecycle

1. **create** — `createSession(config)`
2. **run** — `runSession(session, { steps, ... })` (or single-step via `stepSession`)
3. **fork** — `forkSession(session, { ... })`
4. **pack load** — `loadSessionPack(packJson, { ... })`
5. **serialize** — `serializeSession(session)`
6. **deserialize** — `deserializeSession(serialized)`

## Tactical example

```ts no-check-example
import { createSession, runSession, forkSession, serializeSession, deserializeSession } from "@its-not-rocket-science/ananke/session";

const tactical = createSession({
  mode: "tactical",
  worldSeed: 7,
  entities: [
    { id: 1, teamId: 1, seed: 11, archetype: "AMATEUR_BOXER", weaponId: "fists" },
    { id: 2, teamId: 2, seed: 22, archetype: "AMATEUR_BOXER", weaponId: "fists" },
  ],
  enableReplay: true,
});

runSession(tactical, { steps: 10 });
const branch = forkSession(tactical, { id: "what-if-branch" });

const snapshot = serializeSession(branch);
const restored = deserializeSession(snapshot);
runSession(restored, { steps: 5 });
```

## World-evolution example

```ts no-check-example
import { createSession, runSession, serializeSession, deserializeSession } from "@its-not-rocket-science/ananke/session";

const worldEvolution = createSession({
  mode: "world_evolution",
  canonicalSnapshot: {
    tick: 0,
    worldSeed: 42,
    settlements: [],
    actors: [],
    metrics: {},
    activeEvents: [],
  },
  rulesetId: "standard",
  checkpointInterval: 25,
});

runSession(worldEvolution, {
  steps: 50,
  evolution: { includeDeltas: true },
});

const packed = serializeSession(worldEvolution);
const resumed = deserializeSession(packed);
runSession(resumed, { steps: 10 });
```
