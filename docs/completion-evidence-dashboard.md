# Completion Evidence Dashboard

_Date: 2026-04-02_

This dashboard converts maturity claims into explicit, machine-checkable evidence requirements.

## Evidence mapping table (claim → proof)

| Maturity dimension | Claim | Measurable criteria | Objective proof currently present |
|---|---|---|---|
| Deterministic combat kernel | M4 Validated | `>=3` deterministic/kernel tests, phase-order invariant test, `>=2` conformance fixtures, validation dashboard artifact. | `test/kernel_determinism.test.ts`, `test/kernel_phase_order.test.ts`, `test/determinism.test.ts`, `test/invariants.test.ts`, `conformance/lockstep-sequence.json`, `conformance/phase-order.json`, `docs/dashboard/validation-dashboard.json`. |
| Injury, medical, survivability | M4 Validated | `>=3` survivability tests, at least one published medical validation artifact. | `test/medical.test.ts`, `test/injury_totals.test.ts`, `test/wound-aging.test.ts`, `docs/validation-first-aid-saves-lives-2026-03-18T19-34-10.md`. |
| Environment, hazards, climate | M4 Validated | `>=3` hazard/climate/thermoregulation tests, at least one thermoregulation validation artifact. | `test/hazards.test.ts`, `test/climate.test.ts`, `test/thermoregulation.test.ts`, `docs/validation-thermoregulation-core-stability-2026-03-18T00-07-52.md`. |
| AI, perception, cognition | M3 Hardened | `>=3` subsystem tests plus behaviour invariant coverage (no M4 validation artifact required yet). | `test/ai_system.test.ts`, `test/perception_phase4.test.ts`, `test/cognition.test.ts`, `test/behavior-trees.test.ts`. |
| Campaign/world simulation | M3 Hardened | `>=3` campaign/world tests and at least one deterministic snapshot/fixture artifact. | `test/campaign.test.ts`, `test/world-generation.test.ts`, `test/scenarios.test.ts`, `test/snapshots/kernel_behaviour_snapshot.json`. |
| Bridge/replay/integration surfaces | M4 Validated | `>=3` bridge/replay/netcode tests, `>=2` replay/bridge conformance fixtures, bridge contract artifact. | `test/bridge/integration.test.ts`, `test/replay.test.ts`, `test/netcode.test.ts`, `conformance/replay-parity.json`, `conformance/bridge-snapshot.json`, `docs/bridge-contract.md`. |
| Tooling/benchmarks/release checks | M4 Validated | Performance regression test, release artifact(s), and coverage signal in CI. | `test/performance.test.ts`, `docs/release-report.json`, `docs/release-dashboard.md`, `npm run test:coverage`. |

## Gap list (claims that still exceed evidence quality)

1. **Coverage thresholds are still implicit**: we require `npm run test:coverage` to run, but no per-dimension minimum line/branch threshold is encoded yet.
2. **Freshness/SLA is not yet enforced**: evidence files exist, but we do not fail when validation/release artifacts become stale by date.
3. **Invariant depth is uneven**: only selected dimensions explicitly require invariant tests; some M4 areas still rely mostly on scenario tests.
4. **External reproducibility remains partial**: most evidence is in-repo and deterministic, but independent external rerun attestations are not required by CI.

## Missing tests to add next

1. Add explicit **AI decision determinism** test (fixed seed + identical action traces) to strengthen M3 AI evidence.
2. Add **campaign long-horizon regression** test (multi-turn economy/governance drift bound) for hardened campaign stability.
3. Add **bridge backward-compatibility matrix** test (current engine vs prior snapshot schema) to detect integration drift.
4. Add **release-check smoke fixture test** that validates release metadata/version freshness constraints.

## Missing validation artifacts to add next

1. Add a dedicated **AI/perception validation report** (`docs/validation-ai-perception-*.md`) so that AI can graduate from M3 to M4 on objective grounds.
2. Add a **campaign/world validation artifact** (scenario corpus or benchmark report) for M4 candidacy.
3. Add a machine-readable **artifact freshness ledger** (e.g., `docs/validation-artifact-index.json`) with `generatedAt`, producer tool, and scenario set hash.

## CI enforcement proposal

### Implemented gate

- New source of truth: `docs/maturity-evidence-map.json`.
- New CI script: `tools/check-maturity-evidence.mjs`.
- CI integration: `npm run check-maturity-evidence` is now part of `npm run ci`.

### Gate semantics (fail conditions)

The CI job fails when any of the following is true:

1. A subsystem in `docs/maturity-matrix.json` has no entry in `docs/maturity-evidence-map.json`.
2. A mapped subsystem claims a different maturity than `docs/maturity-matrix.json`.
3. Any required evidence path is missing (tests, fixtures, invariants, validation artifacts).
4. Any subsystem has zero `requiredTests` entries.
5. Any M3 subsystem has fewer than 3 required tests.
6. Any M4 subsystem lacks validation artifacts/conformance fixtures.
7. Any subsystem has fewer than 2 total evidence signals.

### Recommended next CI extensions (not yet implemented)

1. Enforce per-dimension coverage floors (`lines/branches/functions`) instead of run-only coverage.
2. Enforce artifact freshness windows (e.g., fail if release/validation artifact older than N days).
3. Enforce fixture ↔ test linkage (each required fixture must be referenced by at least one test).
