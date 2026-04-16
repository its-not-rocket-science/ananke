# Release Readiness Bundle

> Generated 2026-04-16T18:08:53.774Z.
> Source command: `npm run release-check`.

| Artifact | Status | Stale | Summary | Source |
|---|---|---|---|---|
| trust dashboard | ✅ pass | ⚠️ yes | no unverified rows | `docs/trust-dashboard.md` |
| determinism status | ✅ pass | ⚠️ yes | overall=pass | `docs/dashboard/determinism-release-status.json` |
| doc consistency report | ✅ pass | ⚠️ yes | issues=0 | `docs/doc-consistency-report.json` |
| public contract status | ✅ pass | no | public contract check passed | `dist/tools/check-public-contract.js` |
| coverage status | ❌ fail | no | coverage summary missing | `coverage/coverage-summary.json` |

Final verdict: **RELEASE BLOCKED: trust-critical evidence is not fully green and fresh.**


## Related contract summary

See [`docs/engineering-guarantees.md`](docs/engineering-guarantees.md) for the maintained list of guarantees, enforcement mechanisms, evidence sources, and adopter-side test responsibilities.
