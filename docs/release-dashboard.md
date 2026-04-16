# Release Dashboard — v0.3.0

> Generated 2026-04-16T18:08:53.639Z.
> Run `npm run release-check` to refresh.

## Verdict: ❌ NOT RELEASABLE

| Metric | Value |
|--------|-------|
| Version | `0.3.0` |
| Date | 2026-04-16 |
| Gates passed | 7 |
| Gates failed | 4 |
| Gates warned | 1 |
## Gate Results

| # | Gate | Status | Duration | Summary |
|---|------|--------|----------|---------|
| 1 | Schema migration tests | ✅ PASS | 2771 ms | Schema migration tests passed |
| 2 | Golden replay / fixture round-trip | ✅ PASS | 3445 ms | Fixture round-trips passed |
| 3 | Bridge contract type-check (tsc --noEmit) | ✅ PASS | 9345 ms | No TypeScript errors |
| 4 | Coverage artifact contract (coverage/coverage-summary.json) | ❌ FAIL | 110 ms | Coverage artifact generation/verification failed |
| 5 | Required determinism suites (WASM parity + corpus + regression) | ✅ PASS | 3521 ms | Required determinism suites executed with no skips |
| 6 | Determinism release artifacts | ❌ FAIL | 109 ms | Determinism artifacts are missing or below threshold |
| 7 | Trust-critical evidence freshness & completeness | ❌ FAIL | 2 ms | 4 trust-critical release blocker(s) |
| 8 | Required example verification suite | ✅ PASS | 6464 ms | Example verification suite executed with no skips |
| 9 | Required protocol round-trip suites | ✅ PASS | 4309 ms | Protocol round-trip suites executed with no skips |
| 10 | Benchmark regression check | ✅ PASS | 7379 ms | All scenarios within threshold |
| 11 | Emergent behaviour validation | ❌ FAIL | 180051 ms | Emergent validation passed |
| 12 | Module-index freshness (idempotent diff) | ⚠️ WARN | 113 ms | Module index is stale — run `npm run generate-module-index` |

## Gate Details

### ✅ Schema migration tests

**Status:** PASS  **Duration:** 2771 ms

Schema migration tests passed

```
2 passed
```

### ✅ Golden replay / fixture round-trip

**Status:** PASS  **Duration:** 3445 ms

Fixture round-trips passed

```

 RUN  v2.1.9 /workspace/ananke

 ✓ test/golden-fixtures.test.ts > golden replay — Knight vs Brawler > fixture version is current engine version
 ✓ test/golden-fixtures.test.ts > golden replay — Knight vs Brawler > replay reaches the recorded final tick
 ✓ test/golden-fixtures.test.ts > golden replay — Knight vs Brawler > knight survival matches fixture
 ✓ test/golden-fixtures.test.ts > golden rep
```

### ✅ Bridge contract type-check (tsc --noEmit)

**Status:** PASS  **Duration:** 9345 ms

No TypeScript errors

```
Clean compile
```

### ❌ Coverage artifact contract (coverage/coverage-summary.json)

**Status:** FAIL  **Duration:** 110 ms

Coverage artifact generation/verification failed

```
Coverage summary is missing: coverage/coverage-summary.json
```

### ✅ Required determinism suites (WASM parity + corpus + regression)

**Status:** PASS  **Duration:** 3521 ms

Required determinism suites executed with no skips

```
Required vitest suites verified (/workspace/ananke/determinism-report/results.release-check.json).
```

### ❌ Determinism release artifacts

**Status:** FAIL  **Duration:** 109 ms

Determinism artifacts are missing or below threshold

```
Determinism artifact check failed:
 - scenario corpus suite did not pass
```

### ❌ Trust-critical evidence freshness & completeness

**Status:** FAIL  **Duration:** 2 ms

4 trust-critical release blocker(s)

```
trust dashboard is stale (2.9d old); determinism artifact is stale (2.8d old); doc-consistency report is stale (5.7d old); coverage summary is missing | trust dashboard 2.9d old; determinism artifact 2.8d old; doc-consistency report 5.7d old; export-status matrix 0.8h old
```

### ✅ Required example verification suite

**Status:** PASS  **Duration:** 6464 ms

Example verification suite executed with no skips

```
Required vitest suites verified (/workspace/ananke/determinism-report/results.examples.json).
```

### ✅ Required protocol round-trip suites

**Status:** PASS  **Duration:** 4309 ms

Protocol round-trip suites executed with no skips

```
Required vitest suites verified (/workspace/ananke/determinism-report/results.protocol-roundtrip.json).
```

### ✅ Benchmark regression check

**Status:** PASS  **Duration:** 7379 ms

All scenarios within threshold

```
  [PASS] 10 entities, melee skirmish             ↓ 37.7%  (baseline=0.57ms  current=0.35ms);   [PASS] 100 entities, mixed ranged/melee        ↓ 40.4%  (baseline=8.03ms  current=4.78ms);   [PASS] 500 entities, formation combat          ↓ 35.9%  (baseline=35.22ms  current=22.57ms); ✓  All scenarios within 50% threshold.
```

### ❌ Emergent behaviour validation

**Status:** FAIL  **Duration:** 180051 ms

Emergent validation passed

```
) ...

  Claim 1 — 10v10 Open-Ground Skirmish  (ref: Ardant du Picq)
    Team A wins:   0/100   Team B wins: 100/100   Draws:   0/100
    Winner avg survivors  : 100.0%  (threshold ≥ 20%) ✓
    Loser avg survivors   : 41.3%  (threshold ≤ 50%) ✓
    Duration p50 / p90    :  1250 /  2000 ticks  (mean 1299)  p90 ≤ 2000 ✓
    Result                : ✓ PASS

  Running Scenario 2 (10v10 rain + fog) ...

```

### ⚠️ Module-index freshness (idempotent diff)

**Status:** WARN  **Duration:** 113 ms

Module index is stale — run `npm run generate-module-index`

```
Committed: 104 lines. Re-generated: 96 lines. Diff found.
```

---

*To reach releasable state: fix all ❌ failures, then re-run `npm run release-check`.*
