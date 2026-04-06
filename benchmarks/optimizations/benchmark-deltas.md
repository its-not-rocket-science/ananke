# Optimization sprint benchmark deltas

| Optimization | Before (ticks/sec) | After (ticks/sec) | Delta |
|---|---:|---:|---:|
| Batch command processing | 142 | 503 | +254% |
| Spatial hash grid | 88 | 421 | +378% |
| Object pooling | 469 | 557 | +18.8% |
| SIMD vector math (SoA + 4-wide loop) | 557 | 637 | +14.4% |
| Combined pipeline (10k entities) | 37 | 66 | +78.4% |

`npm run benchmark -- --scenario=epic-battle --backend=ts`

Certified status: ✅ **Certified for 10k entities**
