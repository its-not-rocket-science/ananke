# Profiling Report — 2026 Q2 Performance Sprint

Date: 2026-04-06
Scope: 10,000 entities at 60 Hz target (`epic-battle` scenario)

## Tooling pass

### 1) Chrome DevTools
- Captured Node CPU profile with DevTools-compatible format:
  - Command: `node --cpu-prof --cpu-prof-name=epic-battle.cpuprofile dist/tools/wasm-benchmark.js --scenario=epic-battle --backend=ts`
  - Artifact: `epic-battle.cpuprofile`

### 2) Linux `perf`
- Attempted command: `perf stat -d node dist/tools/wasm-benchmark.js --scenario=epic-battle --backend=ts`
- Result: `perf` unavailable in current container (`command not found`).

### 3) `clinic`
- Attempted command: `npx clinic flame -- node dist/tools/wasm-benchmark.js --scenario=epic-battle --backend=ts`
- Result: install blocked by package registry policy (HTTP 403).

## Flame graphs

- Before optimization:
  - `benchmarks/optimizations/flamegraphs/before.svg`
- After optimization:
  - `benchmarks/optimizations/flamegraphs/after.svg`

## Hotspot findings

### A) WASM call overhead
**Finding:** command marshaling and memory copies were significant in baseline measurements when command submission was performed per tick with fresh arrays.

**Fix:** moved to a reusable command batch (`Float32Array`) and one batch-apply phase for all entities.

### B) Memory copies
**Finding:** per-frame allocations and copy-heavy command preparation contributed avoidable overhead.

**Fix:** persistent command and entity buffers with reset-in-place lifecycle.

### C) GC pressure
**Finding:** transient object creation in high-entity loops caused periodic GC spikes.

**Fix:** object pooling + SoA typed arrays (`posX`, `posY`, `velX`, `velY`, `hp`, `alive`) and deterministic in-place mutation.

## Optimization recommendations implemented

1. Batch command processing (single pass, contiguous buffer).
2. Spatial hash grid for proximity work (cell-local pair checks vs. global O(N²)).
3. Object pooling for entities and command buffers.
4. SIMD-friendly vector math via SoA + unrolled 4-wide integration loop.

## Benchmark summary

Command:

```bash
npm run benchmark -- --scenario=epic-battle --backend=ts
```

Observed:
- `epic-battle: ts-optimized=1469.5 tps (0.681 ms)`

Target check:
- ✅ Above 60 ticks/sec for 10,000 entities.

## Remaining recommendations

- Add native WASM SIMD path in AssemblyScript core for movement + damage accumulation.
- Enable direct shared memory command ingestion (zero-copy with ring buffer semantics).
- Add CI budget gate for `epic-battle` minimum tick throughput and max heap drift.
