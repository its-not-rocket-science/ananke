# Verification Check Inventory (Required vs Optional)

This inventory separates **local developer convenience checks** from **required CI/release verification checks**.

## Required checks (trust claims must not skip)

| Check area | Required in CI | Required in release-check | Failure mode |
| --- | --- | --- | --- |
| WASM-dependent determinism (`fuzz-against-wasm`, regression, scenario corpus) | Yes | Yes | Missing/failed/skipped suite is a hard failure. |
| Example verification (`test/examples-integration.test.ts`) | Yes (covered by full test lane) | Yes (explicit gate) | Missing/failed/skipped suite is a hard failure. |
| Protocol round-trips (`test/protocol-formats-roundtrip.test.ts`, `test/serialization/roundtrip.spec.ts`) | Yes (covered by full test lane) | Yes (explicit gate) | Missing/failed/skipped suite is a hard failure. |
| Coverage artifact generation (`coverage/coverage-summary.json`, `docs/dashboard/coverage-status.md`) | Yes | Yes | Missing/invalid artifact generation is a hard failure. |
| Determinism release artifacts (`docs/dashboard/determinism-release-status.json`) | Yes | Yes | Artifact check failure is a hard failure. |

## Optional/local-convenience checks

These are useful but can be intentionally omitted during local iteration.

| Check area | Local behavior | CI/release behavior |
| --- | --- | --- |
| `npm run release-check -- --quick` benchmark gate | Marked warning (`not run in --quick mode`) | Full `npm run release-check` used for release verification. |
| `npm run release-check -- --quick` emergent validation gate | Marked warning (`not run in --quick mode`) | Full `npm run release-check` used for release verification. |

## Notes

- Any check that supports a local shortcut must still produce an explicit **failure** in CI/release when it is part of a trust claim.
- CI trust report generation now requires determinism status input rather than defaulting to optimistic pass values.
