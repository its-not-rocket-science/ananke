# Ananke project status

Status: active engineering project.

Ananke is not a finished game engine. It is a deterministic simulation kernel intended to be embedded inside host applications.

## Current strengths

- Reproducible world stepping from a defined initial state and command stream.
- Stable root package API for long-lived integrations.
- Replay helpers for deterministic testing and inspection.
- Clear separation between simulation and host-owned rendering, persistence, networking, and tooling.
- First-hour example and smoke test for new adopters.

## Stable enough for

- experiments requiring deterministic simulation;
- replayable test fixtures;
- prototype host integrations;
- research and narrative-simulation tooling;
- internal tools where consumers can pin versions and run regression tests.

## Not yet suitable for

- teams expecting a full game engine;
- visual editing workflows;
- no-code simulation building;
- turnkey networking or persistence;
- integrations that rely on every subpath export remaining stable across minor releases.

## Public API rule

Use the package root for stable imports:

```ts
import { createWorld, stepWorld, q } from "@its-not-rocket-science/ananke";
```

Subpath modules may be useful, but should be treated as version-pinned or experimental unless explicitly documented otherwise.

## What would improve the public presentation next

- Add one screenshot or GIF showing a replay or deterministic scenario.
- Publish a tagged release when the current root API boundary is ready to advertise.
- Add a short `examples/README.md` explaining which example a first visitor should run first.
