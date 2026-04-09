# Proof-of-use vertical slice (first-party)

## Goal
This slice demonstrates Ananke as a coherent host-facing product by connecting six user-visible stages in one flow:

1. world creation
2. scenario loading
3. simulation stepping
4. bridge output
5. replay capture
6. outcome summary + basic inspection UI

Run it with:

```bash
npm run build
npm run run:proof-of-use
```

Artifacts are written to `artifacts/proof-of-use/`.

---

## Architecture (stable-path first)

The slice intentionally uses the stable host path where possible.

- **Scenario input**: `examples/scenarios/proof-of-use-duel.json`.
- **Scenario loading**: `loadScenario()` from `src/index.ts`.
- **World creation**: `loadScenario()` calls `createWorld()` internally from the stable host surface.
- **Stepping**: `stepWorld()` from `src/index.ts`.
- **Bridge frame extraction**: `serializeBridgeFrame()` from `src/host-loop.ts` (stable bridge contract).
- **Replay capture**: `ReplayRecorder` + `serializeReplay()` from `src/replay.ts`.
- **Replay verification**: `replayTo()` used to confirm deterministic reconstruction at final tick.
- **Inspection UI**: generated static HTML with a tick slider + table over serialized bridge frames.

Execution entrypoint: `tools/proof-of-use-slice.ts`.

---

## Friction points encountered and how they were solved

1. **`loadScenario()` derives per-entity seed from `id`, not scenario-level seed.**
   - Friction: It is not obvious from scenario JSON that entity randomness comes from `id` values.
   - Resolution in slice: entity IDs are fixed and explicit; architecture note calls this out.

2. **No single host-level orchestrator that bundles step + bridge + replay in one API.**
   - Friction: host code repeats loop glue (commands, recorder, bridge serialization).
   - Resolution in slice: the tool composes these pieces explicitly and emits one output folder.

3. **Scenario-level AI policy configuration is not part of schema.**
   - Friction: AI presets currently live in runner code instead of scenario data.
   - Resolution in slice: fixed rule (`lineInfantry` vs `skirmisher`) is embedded in the runner.

4. **Inspection UI primitives are absent in the package.**
   - Friction: bridge frames exist but no built-in inspector to navigate ticks.
   - Resolution in slice: generate a tiny self-contained HTML inspector from captured frames.

5. **Replay parity checks require manual comparison strategy.**
   - Friction: no helper that returns parity diagnostics across key state domains.
   - Resolution in slice: simple injury-state comparison is performed and surfaced in summary end reason.

---

## Missing platform affordances revealed by the slice

1. Host-facing `runScenarioSlice()` API that accepts scenario + command policy and returns frames/replay/summary.
2. Declarative scenario schema support for AI policy selection.
3. Built-in deterministic replay parity utility with structured diff output.
4. Built-in inspection UI package (or JSON-to-UI adapter) for bridge frames.
5. Stronger artifact manifest format for multi-file run outputs.

---

## Follow-up tasks (ranked by leverage)

1. **High leverage**: Add `runScenarioSlice()` to stable host API (single call to run and capture all artifacts).
2. **High leverage**: Extend scenario schema with optional team/entity policy fields so behavior is data-driven.
3. **Medium leverage**: Add `verifyReplayParity(replay, targetTick)` helper returning machine-readable diffs.
4. **Medium leverage**: Publish a first-party `@ananke/inspector` static viewer consuming bridge frames.
5. **Lower leverage**: Standardize artifact manifest JSON (`artifacts.json`) for CI and tooling pickup.

