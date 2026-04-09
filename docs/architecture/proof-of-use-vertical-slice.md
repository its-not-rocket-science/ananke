# Proof-of-use vertical slice (first-party)

## Goal
Demonstrate Ananke as a coherent host-facing product while making the import contract explicit:

- **Stable proof-of-use:** Tier 1 root + clearly labeled optional Tier 2.
- **Extended proof-of-use:** richer behavior that intentionally uses internal modules.

## Entrypoints

- `tools/proof-of-use-stable.ts` — stable-host path reference implementation.
- `tools/proof-of-use-extended.ts` — richer internal-demo implementation.
- `tools/proof-of-use-slice.ts` — backward-compatible alias that runs the stable tool.

## Run commands

```bash
npm run build
npm run run:proof-of-use
npm run run:proof-of-use:extended
```

Artifacts are written to:

- `artifacts/proof-of-use/stable/`
- `artifacts/proof-of-use/extended/`

---

## What “stable proof-of-use” means

A proof-of-use counts as **stable** when it:

1. uses Tier 1 root exports (`src/index.ts`) for world creation/stepping/replay,
2. treats any non-root usage as **explicitly optional Tier 2**,
3. avoids silent internal imports from `src/sim/*`, and
4. documents any unavoidable non-Tier-1 dependency in output + docs.

In `proof-of-use-stable.ts`:

- Tier 1 root is used for `loadScenario`, `stepWorld`, `q`, `SCALE`, replay utilities, and host types.
- `serializeBridgeFrame` comes from `src/host-loop.ts` and is called out as optional Tier 2.
- command policy is host-authored (`nearest-enemy`) rather than internal AI imports.

---

## Stable vs extended behavior

| Capability | Stable tool | Extended tool |
|---|---|---|
| Scenario loading | Tier 1 root | Tier 1 root |
| Simulation stepping | Tier 1 root | Tier 1 root |
| Replay capture + replay verification | Tier 1 root | Tier 1 root |
| Bridge frame serialization | Optional Tier 2 (`host-loop`) | Optional Tier 2 (`host-loop`) |
| Command policy | Host-authored nearest-enemy policy | Internal tactical AI presets |
| Internal `src/sim/*` imports | No | Yes (intentional) |
| Routing morale end-condition | No (casualty/KO/maxTicks) | Yes (`isRouting`) |

For full import-level audit details, see:

- `docs/architecture/proof-of-use-import-classification.md`

---

## Why keep an extended version

The extended runner is useful for first-party experimentation and richer demos, but it is **not** a stable host contract exemplar. Keeping both tools makes the tradeoff explicit:

- stable tool = migration-safe onboarding reference,
- extended tool = feature-rich internal experimentation.
