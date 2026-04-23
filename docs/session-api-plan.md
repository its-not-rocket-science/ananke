# Session API plan (`@its-not-rocket-science/ananke/session`)

## Goals

Design an additive Tier-2, host-facing session facade that:

- keeps Tier-1 root exports unchanged,
- is JSON-first and embedder-oriented,
- composes existing tactical + world-evolution primitives,
- centralizes scenario/content-pack/replay/checkpoint workflows,
- avoids renderer/transport/engine bridge concerns.

This plan intentionally proposes thin wrappers over existing modules, not new simulation logic.

## Current capability map (what already exists)

### Tactical world/session primitives

- `createWorld(seed, entities)` creates `WorldState` from declarative entity specs.  
  Source: `src/world-factory.ts`.
- `validateScenario(json)` performs structural scenario validation and returns error strings.  
  Source: `src/scenario.ts`.
- `loadScenario(json)` validates + converts scenario JSON into a `WorldState`.  
  Source: `src/scenario.ts`.
- `stepWorld(world, cmds, ctx)` mutates world state by one tick.  
  Source: `src/sim/kernel.ts`.

### Replay + serialization primitives

- `ReplayRecorder` records per-tick command frames from an initial snapshot.
- `replayTo(replay, targetTick, ctx)` reconstructs deterministic state.
- `serializeReplay(replay)` / `deserializeReplay(json)` provide map-aware replay JSON I/O.
- Source: `src/replay.ts`.

### Content-pack loading primitives

- `validatePack(manifest)`, `loadPack(manifest)`, `getPackScenario(packId, scenarioId)`, `instantiatePackScenario(packId, scenarioId)`.
- Source: `src/content-pack.ts`.

### World-evolution session/orchestration primitives

- Session lifecycle: `createEvolutionSession`, `runEvolution`, `stepEvolution`, `getEvolutionSummary`.
- Branching: `createEvolutionBranch`, `forkEvolutionBranch`, `runEvolutionOnBranch`, `diffBranchAgainstBase`.
- Checkpoint/result serialization: `serializeEvolutionCheckpoint`, `deserializeEvolutionCheckpoint`, `serializeEvolutionResult`, `deserializeEvolutionResult`, `serializeEvolutionIntermediateState`, `serializeEvolutionFinalState`.
- Resume: `resumeEvolutionSessionFromCheckpoint`.
- Source: `src/world-evolution.ts`.

### Existing host-oriented world-evolution wrapper

- `runHostDeterministicEvolution`, `createHostEvolutionSession`, `runHostEvolutionSession`, `resumeHostEvolutionSessionFromCheckpoint`, `createHostEvolutionBranch`, `runHostEvolutionBranch`.
- Source: `src/world-evolution-host-backend.ts`.

## Proposed Tier-2 subpath

Add a new export subpath:

- `@its-not-rocket-science/ananke/session`

Implementation target files (proposed):

- `src/session.ts` (new facade)
- `package.json` exports entry `"./session"`
- optional: document subpath in `docs/subpath-reference.md`

No changes to `src/index.ts` Tier-1 exports.

## Proposed host-facing facade model

## 1) Unified session shape

Introduce a discriminated JSON-first envelope:

- `SessionHandle` (runtime object returned by API)
- `SessionSnapshot` (pure JSON serializable payload)
- `SessionKind = "tactical" | "world-evolution"`

Proposed runtime shape:

- `kind`: session kind discriminator
- `id`: deterministic/session id for host tracking
- `createdAtTickOrStep`: numeric cursor start
- `state`: wrapped existing session state object
- `metadata`: optional host labels/tags/schema versions

The API should expose snapshots for persistence and host transport; host code should not need to touch engine internals.

## 2) Minimum new functions + delegates

### `createSession(input)`

Creates a tactical or world-evolution session using a tagged input union.

Delegate map:

- Tactical from scenario JSON: `validateScenario` + `loadScenario`.
- Tactical from entity specs: `createWorld`.
- World-evolution: `createEvolutionSession` (or host-schema path via `createHostEvolutionSession` when input is host-world schema).

### `runSession(session, request)`

Runs multiple ticks/steps.

Delegate map:

- Tactical: loop `stepWorld` for `request.steps`, optionally recording replay frames with `ReplayRecorder`.
- World-evolution: `runEvolution`.

### `stepSession(session, request?)`

Single-step convenience wrapper.

Delegate map:

- Tactical: one `stepWorld`.
- World-evolution: `stepEvolution`.

### `getSessionSummary(session)`

Returns host-friendly summary object.

Delegate map:

- Tactical: compute thin summary from `WorldState` (tick, entity count, optional terminal flags from host context).
- World-evolution: `getEvolutionSummary`.

### `forkSession(session, options)`

Creates independent branch/fork.

Delegate map:

- Tactical: clone current world snapshot (`structuredClone`) + replay recorder branch state.
- World-evolution: `forkEvolutionBranch` (or branch-from-session via `createEvolutionBranch` + current snapshot).

### `loadSessionPack(manifestOrDescriptor)`

Loads pack content for sessions and optional scenario bootstrapping.

Delegate map:

- `validatePack`, `loadPack`, `getPackScenario`, `instantiatePackScenario`.

### `serializeSession(session)`

Serializes a session into JSON payload with explicit schema marker.

Delegate map:

- Tactical world + replay: `serializeReplay` for replay component; plain JSON for world snapshot (using same map-aware handling strategy from replay module if needed).
- World-evolution: `serializeEvolutionIntermediateState` (session checkpoint) and/or `serializeEvolutionResult` when serializing run output.

### `deserializeSession(json)`

Rehydrates a session from serialized payload.

Delegate map:

- Tactical: revive world + optional replay via `deserializeReplay`.
- World-evolution: `deserializeEvolutionCheckpoint` + `resumeEvolutionSessionFromCheckpoint`; `deserializeEvolutionResult` for archived run payloads.

## 3) Proposed minimum types

- `SessionKind`
- `SessionId`
- `CreateSessionRequest` (tagged union: tactical/world-evolution)
- `RunSessionRequest`
- `StepSessionRequest`
- `SessionSummary` (union)
- `ForkSessionRequest`
- `LoadSessionPackRequest`
- `SerializedSessionEnvelope` (with `schemaVersion`, `kind`, `payload`)

Keep these types additive and Tier-2 only.

## JSON-first contract principles

- Inputs/outputs should accept `unknown` + validate/normalize at boundaries.
- Return structured error objects where existing APIs return arrays (`validateScenario`, `validatePack`) and throw only for unrecoverable misuse.
- Include explicit schema/version fields in serialized envelopes.
- Avoid exposing mutable internal references where host expects durable snapshots.

## API ambiguities to clean up before implementation

1. **Naming asymmetry between tactical and evolution surfaces**
   - Tactical uses `createWorld/loadScenario/stepWorld`; evolution uses `createEvolutionSession/runEvolution/stepEvolution`.
   - Session facade should normalize host verbs (`createSession`, `runSession`, `stepSession`).

2. **Scenario entity seed semantics are implicit**
   - `loadScenario` maps `entity.id -> seed`; this is surprising compared with `createWorld` where `seed` is explicit per entity.
   - Session API should document this or introduce explicit override in request.

3. **Mixed error styles across modules**
   - Scenario/pack validators return error arrays; many loaders throw.
   - Session facade should standardize host-level error shape.

4. **World-evolution naming overlap (`runEvolution`, `runEvolutionOnBranch`, host-backend wrappers)**
   - Session facade should flatten this into a single host mental model while preserving delegation.

## Implementation plan (concrete)

1. **Design + types in `src/session.ts`**
   - define request/response/session envelope types,
   - keep all internals as adapters over current modules.

2. **Tactical session adapter**
   - support creation from scenario JSON or world spec,
   - support repeated stepping and optional replay recording,
   - support summary + fork + serialization.

3. **World-evolution session adapter**
   - wrap create/run/step/summary/fork/checkpoint serialization delegates.

4. **Pack integration adapter**
   - add `loadSessionPack` wrapper over content-pack lifecycle and scenario instantiation helper.

5. **Public packaging wiring**
   - add `./session` subpath in `package.json` exports.
   - keep root Tier-1 export surface unchanged.

6. **Docs + contract updates**
   - document subpath usage and host examples.
   - mark as Tier-2/shipped-non-Tier-1 in docs.

7. **Verification**
   - unit tests for both session kinds,
   - serialization round-trip tests,
   - pack-to-session scenario bootstrap test.

## Release plan

## Existing publication path (current repo behavior)

- Maintainer release command is `npm run release` -> `scripts/tag-release.sh`.
- `scripts/tag-release.sh` bumps `package.json` version (`npm version ... --no-git-tag-version`), runs `npm run sync-version`, updates lockfile, builds, commits, tags `vX.Y.Z`, and pushes tag.
- GitHub Actions workflow `.github/workflows/release.yml` triggers on pushed tags `v*` (also release published / workflow dispatch), verifies tag matches `package.json`, runs release gates, builds artifacts, then runs `npm publish --provenance`.

Therefore npm publication is tag/CI-driven; no manual local `npm publish` should be added.

## Recommended bump level

**Minor bump** (e.g. `0.3.0` -> `0.4.0`).

Reason:

- adds a new public subpath/API surface (`./session`) without removing/breaking Tier-1,
- introduces notable new host-facing capability,
- aligns with additive-but-meaningful semver change.

## Required release edits when implementing

1. Update `CHANGELOG.md` with a new version section describing:
   - new Tier-2 `./session` facade,
   - tactical + world-evolution unified host workflow,
   - serialization/fork/checkpoint/pack integration support.
2. Bump `package.json` version and sync `src/version.ts` via existing `npm run sync-version` path.
3. Ensure lockfile and generated version artifacts are in sync (existing tag script already handles this).
4. Release by tag push via existing workflow (`release.yml`), not manual npm publishing.

## Suggested changelog entry (draft)

- **Added**: `@its-not-rocket-science/ananke/session` (Tier-2) host session facade.
- **Added**: unified `createSession/runSession/stepSession/getSessionSummary/forkSession` across tactical and world-evolution flows.
- **Added**: session serialization/deserialization and content-pack session bootstrap helpers.
- **Compatibility**: Tier-1 root API unchanged.

## Post-embedding API refinement note (2026-04-23)

After validating the minimal embedding example, we made small ergonomic refinements without expanding scope:

- `runSession` now defaults `steps` to `1` when omitted, reducing ceremony for hosts doing single-tick advancement.
- Added alias request fields for discoverability and consistency (`commandFrames`/`context`/`worldEvolution`) while keeping existing `tactical*` and `evolution` names fully supported.
- `loadSessionPack` now accepts either `{ manifest, ... }` or a raw pack manifest directly, improving JSON-first embedding ergonomics.

These are additive Tier-2 refinements only; no renderer/network/bridge functionality was added, and Tier-1 API status is unchanged.
