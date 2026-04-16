# World Evolution Orchestration API (Host-facing)

## Purpose

The orchestration API adds a session-oriented host surface on top of existing deterministic world subsystems. It is designed for external tools (for example OpenWorldBuilder) that need both:

- one-shot evolution runs
- stepwise evolution loops with checkpoints/timelines

It is additive and uses the existing world-evolution backend as the deterministic subsystem pipeline.

## Import path

```ts
import {
  createEvolutionSession,
  runEvolution,
  stepEvolution,
  getEvolutionSummary,
  serializeEvolutionResult,
  deserializeEvolutionResult,
} from "@its-not-rocket-science/ananke/world-evolution";
```

## Determinism contract

For a fixed:

- canonical input snapshot
- ruleset
- seed
- step count
- engine version (`ananke.world-evolution-backend.v1`)

the API returns deterministic outputs.

## Canonical vs derived state

- `canonicalSnapshot` passed to `createEvolutionSession` is preserved as canonical input.
- mutable simulation progression happens on an internal clone.
- all returned snapshots/results are cloned host-safe copies.

## Explicit pipeline ordering

Each step uses the deterministic backend pipeline in this order:

1. polity day (trade/war baseline)
2. governance progression and tax effects
3. diplomacy treaty updates
4. trade route efficiency + trade application
5. migration resolution + flow application
6. climate event generation/aggregation/lifecycle
7. epidemic progression and death pressure

The ordering is fixed, iteration is sorted where needed, and no random host clock/source is used.

## Host integration flow

1. `createEvolutionSession(config)`
2. evolve either with:
   - `runEvolution(session, { steps })`, or
   - repeated `stepEvolution(session)`
3. call `getEvolutionSummary(session)` at any point
4. archive run artifacts via `serializeEvolutionResult(result)` / `deserializeEvolutionResult(json)`

## Types

- `EvolutionSessionConfig`
- `EvolutionRequest`
- `EvolutionRuleset`
- `EvolutionRunResult`
- `EvolutionCheckpoint`
- `EvolutionTimelineEvent`
- `EvolutionMetrics` (re-export of world metrics)
