# Tactical Duel — Reference App

Minimal, polished reference app for a complete deterministic duel loop using **Tier-1 stable APIs only**.

## What this app covers

1. Build world (`createWorld`)
2. Generate deterministic per-tick commands
3. Step simulation (`stepWorld`) until terminal state
4. Record and serialize replay (`ReplayRecorder`, `serializeReplay`)
5. Print concise result summary

## Stable API surface used

All imports come from the root stable contract:

```ts
import {
  createWorld,
  stepWorld,
  q,
  ReplayRecorder,
  serializeReplay,
} from "@its-not-rocket-science/ananke";
```

No Tier-2/Tier-3 or internal `src/*` modules are required for this app loop.

## Run

```bash
npm run build
npm run ref:tactical-duel
npm run ref:tactical-duel -- 7
```

Replay output is written to:

- `dist/examples/reference/tactical-duel/replay-seed<seed>.json`

## Verify determinism quickly

```bash
npm run ref:tactical-duel -- 42
cp dist/examples/reference/tactical-duel/replay-seed42.json /tmp/replay-a.json
npm run ref:tactical-duel -- 42
npx ananke replay diff /tmp/replay-a.json dist/examples/reference/tactical-duel/replay-seed42.json
```
