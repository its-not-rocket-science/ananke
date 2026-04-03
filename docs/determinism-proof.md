# Determinism proof sketch

## Scope

This repository enforces bit-identical fixed-point arithmetic for the deterministic simulation path used by the TS kernel and AssemblyScript/WASM kernels.

## Fixed-point format

- Core dimensionless fixed-point uses **Q = SCALE.Q = 10,000** (1.0 is represented as 10,000).
- Distances, velocities, and accelerations are integer-scaled (`SCALE.m`, `SCALE.mps`, `SCALE.mps2`).
- Multiplication uses truncating integer math (`qMul(a,b) = trunc(a*b/SCALE.Q)`).
- Division uses truncating integer math (`qDiv(a,b) = trunc(a*SCALE.Q/b)`).
- No IEEE float is used in deterministic per-tick state transitions.

## Rounding rules

- Conversion helpers (`q`, `to.*`) use `Math.round` only at host/API boundaries.
- Simulation kernels use `Math.trunc`/integer clamps (`clampQ`) for deterministic updates.
- WASM kernels mirror TS integer formulas for repulsion and injury progression.

## Mechanical verification

- Property-based oracle test: `test/determinism/fuzz-against-wasm.spec.ts`
  - Random world states and command streams.
  - Per-tick snapshots and final state must deep-equal between TS and WASM backends.
- Regression lock: `test/determinism/regression.spec.ts`
  - Replays committed seeds from `fixtures/determinism/golden-masters.json`.
  - Emits first diverging tick/entity if mismatch occurs.

## Randomness policy

Deterministic kernels do not use `Math.random()`. Non-kernel subsystems may use host randomness for non-deterministic features, but those are outside the deterministic oracle path.

You can audit with:

```bash
rg -n "Math\.random\(" src/
```

## Runtime assertion

`stepWorld` invokes:

```ts
process.env.NODE_ENV === "production" ? assertNoFloatUsage(...) : undefined;
```

Implemented by `assertNoFloatUsageInProduction()` to fail fast if non-integer core state reaches the deterministic kernel.

## Badge / report

Nightly report publication target:

- `https://its-not-rocket-science.github.io/ananke/determinism-report/`

(See `.github/workflows/determinism-nightly.yml`.)
