# Release Dashboard — v0.1.62

> Generated 2026-04-01T09:38:54.447Z (quick mode).
> Run `npm run release-check` to refresh.

## Verdict: ✅ RELEASABLE

| Metric | Value |
|--------|-------|
| Version | `0.1.62` |
| Date | 2026-04-01 |
| Gates passed | 3 |
| Gates failed | 0 |
| Gates warned | 0 |
| Gates skipped | 3 |

## Gate Results

| # | Gate | Status | Duration | Summary |
|---|------|--------|----------|---------|
| 1 | Schema migration tests | ✅ PASS | 2598 ms | Schema migration tests passed |
| 2 | Golden replay / fixture round-trip | ⏭ SKIP | 0 ms | No fixtures directory — run `npm run generate-fixtures` to create |
| 3 | Bridge contract type-check (tsc --noEmit) | ✅ PASS | 7253 ms | No TypeScript errors |
| 4 | Benchmark regression check | ⏭ SKIP | 0 ms | Skipped in --quick mode |
| 5 | Emergent behaviour validation | ⏭ SKIP | 0 ms | Skipped in --quick mode |
| 6 | Module-index freshness (idempotent diff) | ✅ PASS | 90 ms | Module index is up-to-date |

## Gate Details

### ✅ Schema migration tests

**Status:** PASS  **Duration:** 2598 ms

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

**Status:** PASS  **Duration:** 7253 ms

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

### ✅ Module-index freshness (idempotent diff)

**Status:** PASS  **Duration:** 90 ms

Module index is up-to-date

```
Re-generated output matches committed docs/module-index.md
```

---

*To reach releasable state: fix all ❌ failures, then re-run `npm run release-check`.*
