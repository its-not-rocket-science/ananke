# Trust Dashboard

_Last updated: 2026-04-10 (UTC)_

This dashboard is intentionally evidence-first: every status row must cite at least one measurable artifact that exists in-repo.

## Status legend

- **verified**: claim has direct automated or artifact evidence in this repository.
- **partially verified**: some objective evidence exists, but coverage scope is incomplete.
- **unverified**: claim exists but no sufficient artifact-backed proof is currently committed.
- **planned**: evidence path is defined, but implementation/artifacts are not yet landed.

## Status matrix

| Area | Status | Artifact-backed evidence |
| --- | --- | --- |
| API stability | verified | test: `test/version-sync.test.ts`<br>ci workflow: `.github/workflows/api-diff.yml`<br>ci workflow: `.github/workflows/semver-check.yml` |
| docs coherence | partially verified | ci workflow: `.github/workflows/ci.yml`<br>doc-example compile check: `tools/check-doc-ts-examples.mjs`<br>doc-example compile check: `tools/check-doc-examples.ts` |
| protocol status | verified | fixture: `conformance/bridge-snapshot.json`<br>test: `test/protocol-formats-roundtrip.test.ts`<br>example: `examples/reference/host-coherence/index.ts` |
| determinism | partially verified | ci workflow: `.github/workflows/determinism.yml`<br>test: `test/determinism/regression.spec.ts`<br>fixture: `conformance/lockstep-sequence.json` |
| examples health | verified | test: `test/reference-tactical-duel-smoke.test.ts`<br>example: `examples/reference/tactical-duel/index.ts`<br>example: `examples/reference/species-lab/index.ts` |
| package architecture reality | verified | test: `test/smoke_modules.test.ts`<br>ci workflow: `.github/workflows/ci.yml`<br>doc-example compile check: `tools/check-package-boundaries.ts` |

## Evidence audit notes

- This page intentionally avoids binary phrasing like "ready" or "complete"; status is constrained to the four labels in the legend.
- CI must run `npm run check-trust-dashboard-artifacts`; missing artifacts or invalid status labels are blocking failures.
