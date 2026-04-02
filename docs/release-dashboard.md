# Release Dashboard — v0.2.9

> Generated 2026-04-02T19:38:25.238Z (quick mode).
> Run `npm run release-check` to refresh.

## Verdict: ⚠️  REVIEW WARNINGS

| Metric | Value |
|--------|-------|
| Version | `0.2.9` |
| Date | 2026-04-02 |
| Gates passed | 2 |
| Gates failed | 0 |
| Gates warned | 1 |
| Gates skipped | 3 |

## Gate Results

| # | Gate | Status | Duration | Summary |
|---|------|--------|----------|---------|
| 1 | Schema migration tests | ✅ PASS | 2559 ms | Schema migration tests passed |
| 2 | Golden replay / fixture round-trip | ⏭ SKIP | 0 ms | No fixtures directory — run `npm run generate-fixtures` to create |
| 3 | Bridge contract type-check (tsc --noEmit) | ✅ PASS | 7608 ms | No TypeScript errors |
| 4 | Benchmark regression check | ⏭ SKIP | 0 ms | Skipped in --quick mode |
| 5 | Emergent behaviour validation | ⏭ SKIP | 0 ms | Skipped in --quick mode |
| 6 | Module-index freshness (idempotent diff) | ⚠️ WARN | 111 ms | Module index is stale — run `npm run generate-module-index` |

## Gate Details

### ✅ Schema migration tests

**Status:** PASS  **Duration:** 2559 ms

Schema migration tests passed

```
2 passed
```

### ⏭ Golden replay / fixture round-trip

**Status:** SKIP  **Duration:** 0 ms

No fixtures directory — run `npm run generate-fixtures` to create

```
test/fixtures/ does not exist or is empty. Generate fixtures first.
```

### ✅ Bridge contract type-check (tsc --noEmit)

**Status:** PASS  **Duration:** 7608 ms

No TypeScript errors

```
Clean compile
```

### ⏭ Benchmark regression check

**Status:** SKIP  **Duration:** 0 ms

Skipped in --quick mode

```
Run without --quick to include benchmark regression.
```

### ⏭ Emergent behaviour validation

**Status:** SKIP  **Duration:** 0 ms

Skipped in --quick mode

```
Run without --quick to include emergent validation (100 seeds).
```

### ⚠️ Module-index freshness (idempotent diff)

**Status:** WARN  **Duration:** 111 ms

Module index is stale — run `npm run generate-module-index`

```
Committed: 109 lines. Re-generated: 93 lines. Diff found.
```

---

*To reach releasable state: fix all ❌ failures, then re-run `npm run release-check`.*
