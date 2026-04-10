# Ananke subsystem maturity matrix

This matrix replaces legacy "COMPLETE" status language with explicit maturity levels and evidence-backed status labels while preserving historical phase context.

## Maturity levels

| Level | Name | Meaning | Typical evidence |
|---|---|---|---|
| M0 | Concept | Scope is planned but unimplemented. | Roadmap scope only. |
| M1 | Prototype | Initial code exists, partial behaviour. | Module + at least one focused test. |
| M2 | Integrated | Wired into runtime/API and used by adjacent systems. | Integration/contract tests. |
| M3 | Hardened | Stable behaviour across many scenarios with broad automated coverage. | Multiple subsystem tests. |
| M4 | Validated | Hardened plus explicit validation/conformance/benchmark artifacts. | Validation docs, conformance fixtures, release/benchmark artifacts. |

## Subsystem matrix

| Subsystem | Maturity | Evidence-backed status | Evidence summary | Historical note |
|---|---|---|---|---|
| Deterministic combat kernel | M4 | verified | `src/sim/kernel.ts`, kernel determinism and phase-order tests, lockstep conformance fixture. | Previously tagged COMPLETE across combat phases. |
| Injury, medical, survivability | M4 | verified | Injury/medical modules, medical tests, first-aid validation report. | Previously tagged COMPLETE in injury/medical phases. |
| Environment, hazards, climate | M4 | verified | Hazard/climate modules, hazards + climate tests, thermoregulation validation report. | Previously tagged COMPLETE in hazard/environment phases. |
| AI, perception, cognition | M3 | partially verified | AI/perception modules plus system/perception tests. | Previously tagged COMPLETE; now classified as hardened pending dedicated validation publication. |
| Campaign/world simulation | M3 | partially verified | Campaign/world-generation modules plus campaign/world-generation tests. | Previously tagged COMPLETE; kept as hardened until broader external validation is complete. |
| Bridge, replay, integration surfaces | M4 | verified | Bridge + replay modules, bridge integration tests, replay conformance fixture, bridge contract docs. | Historically COMPLETE in integration milestones. |
| Tooling, benchmarks, release checks | M4 | verified | Release/benchmark tools, release report artifact, performance test suite. | Historically COMPLETE in hardening milestones. |

> Machine-readable source of truth: `docs/maturity-matrix.json`.
