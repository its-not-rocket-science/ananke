# Determinism host pitfalls (integrator checklist)

This checklist documents practical ways host/integration code can introduce divergence even when the kernel itself is deterministic.

## 1) Using host randomness (`Math.random`) in simulation decisions

### Failure mode
If command generation, targeting, or state mutation uses host RNG instead of deterministic seeds, different runs diverge.

### Safer pattern
Derive event randomness from deterministic tuple inputs via `eventSeed` and deterministic PRNG usage in kernel-facing paths.【F:src/sim/seeds.ts†L1-L13】

### Existing evidence
Seed determinism is covered in `test/seeds.test.ts`.【F:test/seeds.test.ts†L1-L19】

## 2) Using wall-clock time during simulation decisions

### Failure mode
Reading `Date.now()`, real-time clocks, or non-replayable timers in command logic causes replay mismatch.

### Safer pattern
Drive simulation by tick/frame input only; use replay frame/tick contracts (`ReplayRecorder`, `replayTo`) as authority for deterministic advancement.【F:src/replay.ts†L14-L88】

### Existing evidence
Replay/diff checks in `test/netcode.test.ts` catch divergence when replay inputs differ.【F:test/netcode.test.ts†L127-L217】

## 3) Unstable command ordering from host containers

### Failure mode
Commands sourced from unordered maps/objects without canonical ordering can apply in different orders across hosts.

### Safer pattern
Sort commands deterministically before stepping/replay (for example by `(tick, entityId, sequence)`) and keep ordering explicit.

### Existing evidence
Kernel/event ordering expectations are explicit (`STEP_PHASE_ORDER`, deterministic event sort).【F:src/sim/step/pipeline.ts†L1-L14】【F:src/sim/events.ts†L1-L30】

## 4) Floating-point boundary churn in deterministic state

### Failure mode
Repeated float↔fixed conversions in hot paths can produce drift or inconsistent rounding behavior in host code.

### Safer pattern
Keep authoritative simulation state in integer/fixed-point, and isolate float conversions at IO/render boundaries (`q`, `to.*`).【F:src/units.ts†L1-L52】

### Existing evidence
Determinism guards assert integer invariants on core world surfaces in strict mode paths.【F:src/determinism.ts†L1-L34】

## 5) Mutating world state outside the step/replay contract

### Failure mode
Out-of-band mutation between ticks (debug hooks, UI side effects, async callbacks) can desynchronize lockstep peers.

### Safer pattern
Treat `stepWorld`/replay command application as the only mutation entry points for authoritative state.

### Existing evidence
Core stepping contract and phase sequencing are centralized in kernel/step pipeline code.【F:src/sim/kernel.ts†L30-L220】【F:src/sim/step/pipeline.ts†L1-L14】

## 6) Ignoring skipped determinism suites in local runs

### Failure mode
If wasm artifacts are missing, TS-vs-WASM determinism suites can skip in local runs, which can hide conformance regressions.

### Safer pattern
Build wasm artifacts before determinism runs locally, and treat any missing/skipped required determinism suite as a hard failure in CI/release.

### Existing evidence
`describe.skipIf(!hasBuiltWasmKernel())` guards the WASM-coupled suites; CI/release now run all required suites (`fuzz-against-wasm`, regression, and scenario corpus) and explicitly fail if any suite is skipped or missing.

## 7) Version skew across peers/services

### Failure mode
Peers running different engine versions or fixture baselines may both be deterministic internally but disagree with each other.

### Safer pattern
Pin exact package/runtime versions and fixture sets across all lockstep participants.

### Existing evidence
Golden fixtures are explicit and version-controlled; regression checks assert current behavior against committed fixture cases.【F:fixtures/determinism/golden-masters.json†L1-L22】【F:test/determinism/regression.spec.ts†L20-L43】

## 8) Assuming deterministic hash equality without canonicalization

### Failure mode
Hashing raw JS objects without canonical key ordering can produce false divergence across equivalent states.

### Safer pattern
Use canonicalization before hashing (`canonicalValue`, sorted map/object handling) as implemented in netcode helpers.【F:src/netcode.ts†L8-L81】

### Existing evidence
Hash stability/divergence behavior is tested in `test/netcode.test.ts`.【F:test/netcode.test.ts†L27-L125】

---

If you need an auditable machine-readable signal for CI runs, consume `determinism-report/status.json` from determinism workflows artifacts.
