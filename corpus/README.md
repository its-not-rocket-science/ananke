# Ananke — Scenario Corpus

Each subdirectory contains a `corpus.json` manifest describing a canonical
deterministic scenario.  Run `npm run verify-corpus` to verify all entries
against the reference engine.

## Entries

| ID | Tags | Ticks | Description |
|----|------|-------|-------------|
| `basic-duel` | `tutorial` | 30 | Basic 1v1 Duel (No AI) |
| `armoured-combat` | `validation`, `content-pack` | 50 | Armoured 1v1 Combat (Line Infantry AI) |
| `lockstep-replay` | `networking` | 10 | Lockstep Replay Parity (10 Ticks) |
| `bridge-snapshot` | `bridge` | 0 | Renderer Bridge Snapshot |
| `ai-benchmark` | `benchmark` | 20 | AI Skirmish Benchmark (20 Ticks) |

## Tag meanings

| Tag | Purpose |
|-----|---------|
| `tutorial` | Entry-level; no prior knowledge required |
| `benchmark` | Stable timing baseline; detect performance regressions |
| `validation` | Compared against empirical data |
| `networking` | Exercises replay, hash, lockstep |
| `bridge` | Exercises the renderer bridge |
| `content-pack` | Exercises equipment loading and composition |

## Verifying

```bash
npm run build
npm run verify-corpus              # all entries
npm run verify-corpus -- --id=basic-duel   # single entry
npm run verify-corpus -- --json    # machine-readable
```

## Regenerating

Re-run after any change to `stepWorld`, `hashWorldState`, or equipment constants:

```bash
npm run build && npm run generate-corpus
```

## Corpus format version

All manifests carry `"version": "corpus/v1"`.
