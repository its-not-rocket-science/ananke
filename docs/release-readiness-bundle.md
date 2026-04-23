# Release Readiness Bundle

> Generated 2026-04-23T14:51:50.075Z.
> Source command: `npm run release-check`.

| Artifact | Status | Stale | Summary | Source |
|---|---|---|---|---|
| trust dashboard | ✅ pass | ⚠️ yes | no unverified rows | `docs/trust-dashboard.md` |
| determinism status | ✅ pass | no | overall=pass | `docs/dashboard/determinism-release-status.json` |
| doc consistency report | ✅ pass | ⚠️ yes | issues=0 | `docs/doc-consistency-report.json` |
| public contract status | ❌ fail | no | public contract check failed | `dist/tools/check-public-contract.js` |
| coverage status | ✅ pass | no | line coverage 95.22% (32347/33969) | `coverage/coverage-summary.json` |

Final verdict: **RELEASE BLOCKED: trust-critical evidence is not fully green and fresh.**
