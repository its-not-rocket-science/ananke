# Determinism adopter assurance package

This document is a technical assurance package for integrators. It states:

- what determinism guarantees are currently made,
- how each guarantee is checked,
- what is intentionally excluded,
- and which portability limits are known.

It is not a formal proof and should be read as an implementation-and-tests contract for the current repository state.

## 1) Guarantee scope

### Guaranteed in scope

For the deterministic oracle model exercised by the determinism test harness:

1. **TypeScript oracle and WASM kernel produce equal traces** for tested seeds/configurations in CI, including per-tick snapshots and final state comparisons.【F:test/determinism/fuzz-against-wasm.spec.ts†L18-L45】【F:test/determinism/regression.spec.ts†L22-L43】
2. **Golden fixture seeds remain stable** unless intentionally changed; fixture drift causes a failing regression test.【F:test/determinism/regression.spec.ts†L20-L43】【F:fixtures/determinism/golden-masters.json†L1-L22】
3. **Replay reconstruction applies commands in deterministic tick order** when replay inputs are identical.【F:src/replay.ts†L14-L88】【F:test/netcode.test.ts†L127-L217】
4. **Canonical replay/state hashing is stable** for equivalent states with canonical key ordering, enabling first-divergence diagnosis.【F:src/netcode.ts†L8-L220】【F:test/netcode.test.ts†L27-L125】

### Evidence surfaces (where assertions are enforced)

- Determinism fuzz test (`test/determinism/fuzz-against-wasm.spec.ts`).【F:test/determinism/fuzz-against-wasm.spec.ts†L18-L45】
- Golden regression test (`test/determinism/regression.spec.ts`) + fixture (`fixtures/determinism/golden-masters.json`).【F:test/determinism/regression.spec.ts†L20-L43】【F:fixtures/determinism/golden-masters.json†L1-L22】
- Shared trace/harness implementation (`test/determinism/shared.ts`).【F:test/determinism/shared.ts†L1-L344】
- Determinism CI workflows and generated status artifact (`.github/workflows/determinism.yml`, `.github/workflows/determinism-nightly.yml`).【F:.github/workflows/determinism.yml†L1-L31】【F:.github/workflows/determinism-nightly.yml†L1-L48】

## 2) Arithmetic guarantees

### Guarantee

The deterministic path uses integer/fixed-point arithmetic primitives and deterministic seed derivation:

- `SCALE.Q` fixed-point representation and integer arithmetic helpers (`qMul`, `qDiv`, `mulDiv`, integer roots).【F:src/units.ts†L1-L101】
- Determinism assertions for integer-only core state (`assertDeterministicWorldLike`) in strict mode paths.【F:src/determinism.ts†L1-L34】
- Deterministic event seed generation via stable tuple inputs (`eventSeed(worldSeed, tick, a, b, salt)`).【F:src/sim/seeds.ts†L1-L13】

### How it is tested

- Unit tests covering seed determinism and sensitivity (`test/seeds.test.ts`).【F:test/seeds.test.ts†L1-L19】
- Oracle-vs-WASM determinism comparisons that would fail on arithmetic drift (`test/determinism/fuzz-against-wasm.spec.ts`, `test/determinism/regression.spec.ts`).【F:test/determinism/fuzz-against-wasm.spec.ts†L18-L45】【F:test/determinism/regression.spec.ts†L22-L43】

## 3) Ordering guarantees

### Guarantee

Ordering-sensitive paths are explicit and deterministic where declared:

- Fixed kernel phase order is declared in `STEP_PHASE_ORDER` and executed in that sequence by `stepWorld`.【F:src/sim/step/pipeline.ts†L1-L14】【F:src/sim/kernel.ts†L30-L220】
- Impact event ordering uses deterministic sort keys (`attackerId`, then `targetId`).【F:src/sim/events.ts†L1-L30】
- Canonical hash serialization sorts keys/collections before hashing to avoid host object insertion-order drift affecting hashes.【F:src/netcode.ts†L8-L81】

### How it is tested

- Event sorting behavior test (`test/events.test.ts`).【F:test/events.test.ts†L1-L15】
- Spatial/query deterministic ordering tests where applicable (`test/spatial.test.ts`).【F:test/spatial.test.ts†L1-L15】
- Replay/hash equivalence and divergence tests (`test/netcode.test.ts`).【F:test/netcode.test.ts†L27-L217】

## 4) Replay guarantees

### Guarantee

Given identical replay inputs (`initialState`, ordered `frames`, and deterministic kernel semantics):

- `replayTo` replays commands in frame order up to `targetTick` deterministically.【F:src/replay.ts†L14-L88】
- `diffReplays` reports first divergence tick/hash, including initial-state divergence (`tick = -1`).【F:src/netcode.ts†L83-L220】

### How it is tested

- Replay serialization/reconstruction and divergence checks (`test/netcode.test.ts`).【F:test/netcode.test.ts†L27-L217】
- Additional replay-oriented coverage (`test/replay.test.ts`).【F:test/replay.test.ts†L1-L121】

## 5) TypeScript vs WASM conformance method

Conformance uses two complementary lanes:

1. **Fuzz lane**: randomized world states + command streams, then exact trace/final-state equality between TS and WASM backends.【F:test/determinism/fuzz-against-wasm.spec.ts†L18-L45】
2. **Golden lane**: fixed seed fixtures to lock expected behavior and detect drift at known scenarios.【F:test/determinism/regression.spec.ts†L20-L43】【F:fixtures/determinism/golden-masters.json†L1-L22】

Harness and execution details:

- Shared deterministic generators/runners/comparators in `test/determinism/shared.ts`.【F:test/determinism/shared.ts†L1-L344】
- Determinism runner entrypoint in `tools/run-determinism-tests.mjs`.【F:tools/run-determinism-tests.mjs†L1-L44】
- CI regression/nightly workflows produce JSON output and generate a machine-readable status artifact (`determinism-report/status.json`).【F:.github/workflows/determinism.yml†L20-L31】【F:.github/workflows/determinism-nightly.yml†L24-L48】
- Status artifact generator: `tools/generate-determinism-status.mjs`.【F:tools/generate-determinism-status.mjs†L1-L114】

## 6) Exclusions (explicitly not guaranteed)

The assurance package does **not** guarantee:

1. Determinism for every module/export in the repository; coverage is limited to tested lanes/surfaces.
2. Determinism for host-integrator code outside replay/kernel contracts.
3. Determinism across arbitrary version upgrades without fixture/version coordination.
4. Determinism when hosts mutate world state outside documented kernel/replay entry points.
5. Determinism for non-kernel features that use host randomness or wall-clock state unless explicitly constrained and tested.

These exclusions are intentional boundaries of current automated evidence.

## 7) Known portability limits

Known limits and caveats for adopters:

- **WASM-dependent conformance tests are conditional**: determinism suites skip when wasm build artifacts are absent; CI builds wasm first to avoid false confidence from local skips.【F:test/determinism/fuzz-against-wasm.spec.ts†L18-L18】【F:test/determinism/regression.spec.ts†L22-L22】【F:.github/workflows/determinism.yml†L16-L22】
- **Coverage is repository-controlled, not platform-matrix complete**: current determinism workflows run on `ubuntu-latest` only, so this package is not yet a full OS/browser matrix attestation.【F:.github/workflows/determinism.yml†L10-L10】【F:.github/workflows/determinism-nightly.yml†L14-L14】
- **Cross-version equality is fixture-scoped**: golden fixtures detect drift relative to committed fixtures; they do not imply semantic equivalence across all historical commits/releases.【F:test/determinism/regression.spec.ts†L20-L43】

## 8) Ways to accidentally break determinism in host code

Common host-side mistakes are documented in a separate checklist:

- [Determinism host pitfalls](./determinism-host-pitfalls.md)

The checklist focuses on accidental sources of divergence (iteration order, wall-clock dependence, float conversions, side-channel mutation, inconsistent command ordering, and version skew) and links each pitfall to a code/test surface where possible.
