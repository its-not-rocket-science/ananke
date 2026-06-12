# Repo Discipline Audit Summary

- Generated at: 2026-04-16T18:23:59.055Z
- Final verdict: **FAIL**
- Trust-critical verified: 4/7

## Area results

| Area | Status | Command | Artifact issues |
|---|---|---|---|
| Public contract checks | PASS | `npm run check-public-contract` | none |
| Docs semantic consistency | PASS | `npm run check-doc-semantic-consistency` | none |
| Doc examples | PASS | `npm run check:doc-examples` | none |
| Link/reference checks | PASS | `node dist/tools/check-doc-links-and-references.js` | none |
| Trust dashboard artifact checks | FAIL | `npm run check-trust-dashboard-artifacts` | none |
| Release-check quick mode | FAIL | `npm run release-check:quick` | none |
| Determinism artifact validation | FAIL | `npm run check-determinism-release-artifacts` | none |

## Artifact freshness and existence

### Public contract checks
- ✅ docs/public-contract.md (fresh, 0.01d old, max 90d; modified 2026-04-16T18:03:03.994Z)
- ✅ docs/stable-api-manifest.json (fresh, 0.01d old, max 90d; modified 2026-04-16T18:03:03.994Z)
- ✅ STABLE_API.md (fresh, 0.01d old, max 90d; modified 2026-04-16T18:03:03.978Z)

### Docs semantic consistency
- ✅ docs/doc-consistency-report.json (fresh, 0d old, max 30d; modified 2026-04-16T18:24:03.488Z)

### Trust dashboard artifact checks
- ✅ docs/trust-dashboard.md (fresh, 0.01d old, max 30d; modified 2026-04-16T18:03:03.994Z)
- ✅ docs/dashboard/ci-trust-report.json (fresh, 0.01d old, max 30d; modified 2026-04-16T18:03:03.986Z)
- ✅ docs/dashboard/verification-check-inventory.json (fresh, 0.01d old, max 30d; modified 2026-04-16T18:03:03.986Z)

### Release-check quick mode
- ✅ docs/release-readiness-bundle.md (fresh, 0d old, max 30d; modified 2026-04-16T18:24:47.173Z)
- ✅ docs/releases/v1.0.0-beta.1-readiness-checklist.md (fresh, 0.01d old, max 365d; modified 2026-04-16T18:03:03.994Z)

### Determinism artifact validation
- ✅ docs/dashboard/determinism-release-status.json (fresh, 0.01d old, max 30d; modified 2026-04-16T18:03:03.986Z)
- ✅ docs/dashboard/determinism-matrix-summary.json (fresh, 0.01d old, max 30d; modified 2026-04-16T18:03:03.986Z)
- ✅ docs/determinism-status.md (fresh, 0.01d old, max 30d; modified 2026-04-16T18:03:03.986Z)

