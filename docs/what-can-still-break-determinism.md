# What can still break determinism?

This page lists bounded failure modes that can still break deterministic outcomes, even when current determinism tests pass.

## 1) Hidden floating-point values entering core state

**Example**

- A host mutates an entity position directly with a non-integer (for example, `123.5`) before calling `stepWorld`.
- In production, `assertNoFloatUsageInProduction` checks only once per process (`asserted` guard), so later host-side invalid writes can evade that one-time gate if additional checks are not run by the host/test harness.

Why this can break determinism:

- Float intermediates can round/truncate differently depending on where they are consumed, especially when mixed with fixed-point assumptions.

Relevant code: `src/determinism.ts`.【F:src/determinism.ts†L1-L34】

## 2) Non-deterministic ordering from unsorted collections

**Example**

- A new subsystem emits an event list and consumes it without a deterministic sort key.
- If iteration order can vary (or is affected by insertion timing), side effects become order-sensitive.

Why this can break determinism:

- Determinism requires stable order for logically commutative but implementation-order-sensitive operations.

Relevant deterministic sort helper: `sortEventsDeterministic`.【F:src/sim/events.ts†L23-L30】

## 3) Use of host randomness in deterministic paths

**Example**

- A kernel-adjacent function uses `Math.random()` instead of deriving outcomes from `eventSeed`.

Why this can break determinism:

- `Math.random()` is process/runtime dependent and not reproducible from simulation seed/tick contracts.

Relevant deterministic seed function: `eventSeed`.【F:src/sim/seeds.ts†L1-L7】

## 4) Divergent TS/WASM logic introduced during feature work

**Example**

- TS implementation gets a formula change while WASM mirror code (or bridge) does not.
- Parity tests may not cover the exact new edge case space yet.

Why this can break determinism:

- Backends may produce different per-tick snapshots for specific inputs.

Current coverage location: determinism fuzz/regression specs and shared harness.【F:test/determinism/fuzz-against-wasm.spec.ts†L1-L45】【F:test/determinism/regression.spec.ts†L1-L45】【F:test/determinism/shared.ts†L1-L240】

## 5) Replay inputs not matching the replay contract

**Example**

- Replay frames are reordered, dropped, or modified after recording.
- Initial snapshot is changed before `replayTo` runs.

Why this can break determinism:

- Replay determinism assumes identical initial state plus identical ordered per-tick commands.

Replay contract source: `src/replay.ts`.【F:src/replay.ts†L10-L88】

## 6) Hash checksumming used outside documented canonical surface

**Example**

- A host assumes `hashWorldState` covers extension/runtime fields that are intentionally excluded.
- Two peers differ in excluded fields and believe they are in-sync from hash alone.

Why this can break operational assumptions:

- Hash parity can pass while host-owned non-core state still differs.

Hash scope source: `src/netcode.ts`.【F:src/netcode.ts†L54-L81】

## 7) Environment/config mismatch between peers

**Example**

- Different command streams, seed values, or determinism test env settings (`DETERMINISM_*`) between environments.

Why this can break determinism:

- Determinism only promises same outputs for same inputs and same algorithm.

Config-driven determinism test entrypoint: `tools/run-determinism-tests.mjs`.【F:tools/run-determinism-tests.mjs†L1-L44】

## Practical mitigation checklist

- Keep kernel state integer-only at boundaries.
- Use `eventSeed` (or equivalent seeded deterministic derivation) for all pseudo-random decisions in deterministic paths.
- Enforce deterministic sorting for any order-sensitive batched effects.
- Extend TS vs WASM parity fixtures when adding new deterministic logic.
- Treat replay payloads as immutable test artifacts; hash and version them in CI when possible.
