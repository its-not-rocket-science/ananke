# Determinism assurance package

This document states what the repository currently verifies about determinism, how it is verified, and what is explicitly out of scope.

## Deterministic invariants

The deterministic simulation path relies on the following invariants:

1. **Integer-only core state**
   - Core runtime state fields (`tick`, `seed`, integer-scaled vectors, core injury counters) are finite integers; production assertions fail if non-integers are observed in this surface.【F:src/determinism.ts†L1-L34】
2. **Fixed-point arithmetic contract**
   - Dimensionless values use `SCALE.Q = 10_000`.
   - Deterministic multiply/divide paths use truncating integer math (`qMul`, `qDiv`) and integer-safe `mulDiv` for large intermediates via `BigInt`.
   - Host/API conversion helpers (`q`, `to.*`) are boundary conversions using `Math.round` and are distinct from per-tick deterministic kernel arithmetic.【F:src/units.ts†L1-L41】
3. **Stable seed derivation for pseudo-random outcomes**
   - Random-like outcomes in deterministic code are derived from `(worldSeed, tick, ids, salt)` using `eventSeed`, not `Math.random()` in kernel logic.【F:src/sim/seeds.ts†L1-L13】
4. **Stable step phase order**
   - The kernel uses a fixed phase pipeline contract (`prepare` … `finalize`) documented in `STEP_PHASE_ORDER` and wired by `stepWorld`.
   - This constrains side-effect ordering between subsystems across hosts/backends.【F:src/sim/step/pipeline.ts†L1-L14】【F:src/sim/kernel.ts†L1-L220】
5. **Deterministic event ordering where event lists are sorted**
   - Impact/event lists that require deterministic ordering use explicit sort keys (`attackerId`, then `targetId`).【F:src/sim/events.ts†L1-L30】

## Exact deterministic scope (what is covered)

Current automated determinism evidence covers:

- **TS oracle vs WASM shadow parity for the deterministic oracle model**
  - Property-based fuzzer compares per-tick snapshots and final state for generated world states/command sequences.
  - Configurable by `DETERMINISM_WORLD_STATES`, `DETERMINISM_COMMANDS_PER_STATE`, and `DETERMINISM_SEED`.
  - Test file: [`test/determinism/fuzz-against-wasm.spec.ts`](../test/determinism/fuzz-against-wasm.spec.ts).【F:test/determinism/fuzz-against-wasm.spec.ts†L1-L45】
- **Golden regression lock for known seeds**
  - Replays seeded cases from fixture and fails on first divergence with tick/entity diagnostics.
  - Test file: [`test/determinism/regression.spec.ts`](../test/determinism/regression.spec.ts).
  - Fixture: [`fixtures/determinism/golden-masters.json`](../fixtures/determinism/golden-masters.json).【F:test/determinism/regression.spec.ts†L1-L45】【F:fixtures/determinism/golden-masters.json†L1-L15】
- **Replay hash-based equivalence tooling**
  - `hashWorldState` canonicalizes state and computes a deterministic 64-bit checksum, enabling first-divergence diagnosis across replays.
  - `diffReplays` performs lockstep replay comparison.
  - Source: [`src/netcode.ts`](../src/netcode.ts).【F:src/netcode.ts†L1-L220】
- **Replay reconstruction path**
  - `ReplayRecorder` + `replayTo` provide deterministic reconstruction from initial snapshot + per-tick commands.
  - Source: [`src/replay.ts`](../src/replay.ts).【F:src/replay.ts†L1-L129】

## Known exclusions (what this does **not** prove)

This package does **not** claim all of the following are proven:

- **All repository modules are in deterministic CI parity against WASM**.
  - Current oracle parity coverage is the determinism harness model and included kernel surfaces under test, not every exported subsystem API.
- **Determinism for host-only/non-kernel features using host randomness**.
  - The policy is deterministic kernels should avoid `Math.random()`, but non-kernel features may remain out of scope unless they are explicitly bound into deterministic replay/testing paths.
- **Cross-version determinism without fixture/version agreement**.
  - Golden fixtures detect behavioral drift; they do not assert semantic compatibility across arbitrary historical versions.
- **Determinism when host code mutates world state outside the documented step/replay contracts**.

See also: [What can still break determinism?](./what-can-still-break-determinism.md).

## Arithmetic and ordering guarantees

### Arithmetic guarantees (in-scope)

- Deterministic arithmetic primitives are integer/fixed-point based (`qMul`, `qDiv`, `mulDiv`, integer roots).【F:src/units.ts†L1-L80】
- Kernel deterministic assertions can fail fast in production when core integer invariants are violated before stepping progresses.【F:src/determinism.ts†L1-L34】

### Ordering guarantees (in-scope)

- Step phases execute in a fixed declared order (`STEP_PHASE_ORDER`).【F:src/sim/step/pipeline.ts†L1-L14】
- Determinism-sensitive event batches that are explicitly sorted use deterministic keys (`sortEventsDeterministic`).【F:src/sim/events.ts†L23-L30】
- Replay state hashing uses canonical sort/canonical serialization of entities/maps/keys for stable hashes independent of object insertion order.【F:src/netcode.ts†L30-L81】

## Replay guarantees

For replay recorded via `ReplayRecorder` and re-simulated via `replayTo`:

- Given the same `initialState`, same ordered frames/commands, and same kernel context semantics, `replayTo` applies commands in frame order up to `targetTick` deterministically.【F:src/replay.ts†L10-L88】
- `diffReplays` can identify the first divergence tick/hash pair when two recordings diverge, including divergence at initial state (`-1`).【F:src/netcode.ts†L83-L220】

These statements are operational guarantees of the implemented contract, not a proof that all possible host integrations are deterministic.

## TS vs WASM conformance method

Conformance is established by two complementary tests:

1. **Fuzz oracle (`fuzz-against-wasm`)**
   - Generate random deterministic world states and deterministic command streams.
   - Execute TS reference and WASM backend.
   - Assert exact equality of per-tick snapshots and final state.
2. **Golden regression (`regression`)**
   - Load committed deterministic seed fixtures.
   - Re-run both paths and fail on first observed divergence.

Shared harness code:

- [`test/determinism/shared.ts`](../test/determinism/shared.ts) (state/command generators, TS runner, WASM runner, divergence detector).【F:test/determinism/shared.ts†L1-L240】

Execution entrypoint:

- [`tools/run-determinism-tests.mjs`](../tools/run-determinism-tests.mjs).【F:tools/run-determinism-tests.mjs†L1-L44】

## CI machine-readable determinism summary

CI now emits a machine-readable summary artifact in `determinism-report/summary.json` by parsing Vitest JSON output and recording run metadata.

- Generator: [`tools/generate-determinism-summary.mjs`](../tools/generate-determinism-summary.mjs)
- Workflows:
  - [`.github/workflows/determinism.yml`](../.github/workflows/determinism.yml)
  - [`.github/workflows/determinism-nightly.yml`](../.github/workflows/determinism-nightly.yml)
