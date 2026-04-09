# Proof-of-use import classification

This note audits `tools/proof-of-use-slice.ts` (pre-refactor) and documents how imports map to Ananke stability tiers.

## Classification table

| Import | Classification | Action in new tools |
|---|---|---|
| `../src/index.js` (`loadScenario`, `stepWorld`, `q`, `SCALE`) | Tier 1 root | Kept in both `proof-of-use-stable.ts` and `proof-of-use-extended.ts`. |
| `../src/replay.js` (`ReplayRecorder`, `serializeReplay`, `replayTo`) | **Tier 1 root available; previous path was unnecessary deep import** | Replaced with root import from `../src/index.js` in both tools. |
| `../src/host-loop.js` (`serializeBridgeFrame`) | Tier 2 acceptable (explicit subpath export) | Kept, but explicitly labeled optional Tier 2 in stable tool output/docs. |
| `../src/sim/indexing.js` (`buildWorldIndex`) | Internal leakage | Removed from stable tool; retained only in extended tool for richer AI demo. |
| `../src/sim/spatial.js` (`buildSpatialIndex`) | Internal leakage | Removed from stable tool; retained only in extended tool for richer AI demo. |
| `../src/sim/ai/decide.js` (`decideCommandsForEntity`) | Internal leakage | Removed from stable tool; retained only in extended tool where internal AI is intentional. |
| `../src/sim/ai/presets.js` (`AI_PRESETS`) | Internal leakage | Removed from stable tool; retained only in extended tool. |
| `../src/sim/morale.js` (`isRouting`) | Internal leakage | Removed from stable tool end-condition checks; retained in extended tool. |
| `../src/sim/commands.js` (`CommandMap` type) | Internal leakage (type available via Tier 1 root) | Replaced with root type import from `../src/index.js`. |
| `../src/sim/context.js` (`KernelContext` type) | Internal leakage (type available via Tier 1 root) | Replaced with root type import from `../src/index.js`. |

## Why some internal usage remains in `proof-of-use-extended.ts`

`proof-of-use-extended.ts` is intentionally a **non-stable showcase**. It keeps internal AI/indexing imports to demonstrate higher-fidelity tactical behavior that is not yet covered by Tier 1/Tier 2 host-facing APIs.

Specifically, the internal imports are needed for:

1. **Per-tick tactical indexing** (`buildWorldIndex`, `buildSpatialIndex`) to support efficient neighborhood queries.
2. **Preset-driven command synthesis** (`decideCommandsForEntity`, `AI_PRESETS`) for richer autonomous behavior.
3. **Routing-based termination signal** (`isRouting`) as an additional morale outcome beyond casualty/KO checks.

These are explicitly listed in the extended summary output (`internalImports`) so consumers can see the contract risk.
