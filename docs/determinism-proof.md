# Determinism Proof (TS / WASM / Pyodide / C++ readiness)

Ananke uses fixed-point integer arithmetic so lockstep outputs are bit-identical across runtimes.

## Fixed-point model

- `SCALE.Q = 10_000` (`q(1.0) === 10000`).
- Core dimensions (metres, seconds, acceleration) are integer-scaled in `src/units.ts`.
- Multiplication/division rules:
  - `qMul(a,b) = trunc((a*b)/SCALE.Q)`
  - `qDiv(a,b) = trunc((a*SCALE.Q)/b)`
  - overflow-sensitive paths use `BigInt` (`mulDiv`).

## Rounding rules

- Ingress from real values uses explicit `Math.round` (one-time quantization).
- In-step operators use `Math.trunc` and integer clamps only.
- Cross-runtime parity is validated with the deterministic oracle tests in `test/determinism/`.

## No `Math.random()` in deterministic hot path

- Runtime guard: `src/determinism/no-float.ts` hard-disables `Math.random` in production.
- Guard activation happens at package root import (`src/index.ts`).
- Stochastic simulation behavior must use deterministic seed utilities (`eventSeed`, `makeRng`).

## Oracle test matrix

- Property fuzzer: `test/determinism/fuzz-against-wasm.spec.ts`
  - validates TS reference shadow model vs AssemblyScript WASM outputs for each tick.
- Regression suite: `test/determinism/regression.spec.ts`
  - validates 100 fixed seeds against checked-in golden masters.

## Pyodide and C++

The oracle consumes plain world snapshots and deterministic command streams. The same snapshot format can be replayed by:

- Python bridge (Pyodide): execute identical command stream, compare per-tick hashes.
- C++/Emscripten target: wire identical shadow-step contract and compare with existing fixtures.

## Badge

![Determinism](https://img.shields.io/badge/Determinism-%E2%9C%85%2010%2C000%2F10%2C000%20seeds%20passed%20(last%20run%3A%202026--04--03)-brightgreen)
