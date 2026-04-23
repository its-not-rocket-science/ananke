# Trust Dashboard

> GENERATED FILE: produced by `npm run generate-trust-dashboard`.
> Do not edit manually; update source artifacts and regenerate.

_Last updated: 2026-04-13T19:44:52.475Z_

## Status rules (machine-derived)

- **verified**: all required artifacts exist and all checks pass.
- **partially verified**: required artifacts exist, checks are runnable, and coverage is below threshold.
- **unverified**: one or more required artifacts are missing or required checks fail.

## Thresholds

- docs coherence: semantic inconsistencies must equal **0**.
- test coverage: line coverage must be **>= 85%**.
- determinism: CI matrix must pass, wasm coverage must meet threshold (default **90%** unless CI output overrides), and fuzz executions must meet threshold (default **2000** unless CI output overrides).

## Inputs

- CI outputs: `docs/dashboard/ci-trust-report.json`
- Test coverage: `coverage/coverage-summary.json`
- Doc validation reports: `docs/doc-consistency-report.json`

## Status matrix

| Area | Status | Computed summary | Evidence |
| --- | --- | --- | --- |
| docs coherence | verified | semantic inconsistencies = 0/0 | doc validation report: `docs/doc-consistency-report.json` |
| test coverage | verified | line coverage 95.22% (32347/33969, threshold 85%) | coverage summary: `coverage/coverage-summary.json` |
| determinism | verified | ci matrix passes=true; wasm coverage 90.00%/90%; fuzz executions 2000/2000 | ci output: `docs/dashboard/ci-trust-report.json` |

## CI stale-file rule

- CI must run `npm run check-trust-dashboard-artifacts`.
- The check re-renders `docs/trust-dashboard.md` in-memory and fails if the committed file differs.
