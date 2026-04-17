# World Evolution Backend (Host Integration)

## Purpose

`world-evolution-backend` is an additive, deterministic composition layer for host platforms (for example OpenWorldBuilder) that need reproducible world-scale progression runs.

It does **not** replace existing systems. It orchestrates existing modules and emits host-facing outputs:

- final world snapshot
- per-step timeline/event log
- summary metrics
- optional deltas/checkpoints

## Stable import path

Use the dedicated subpath export:

```ts
import {
  runWorldEvolution,
  listAvailableWorldEvolutionProfiles,
} from "@its-not-rocket-science/ananke/world-evolution-backend";
```

No Tier-1 root exports were changed.

## Host flow

1. Build an initial `WorldEvolutionSnapshot` (canon state).
2. Pick a profile (`minimal_world_history`, `polity_dynamics`, `conflict_heavy`, `climate_and_migration`, `full_world_evolution`) and optionally layer deterministic host overrides on top.
3. Run `runWorldEvolution({ snapshot, steps, ... })`.
4. Read:
   - `finalSnapshot`
   - `timeline`
   - `metrics`
   - optional `deltas`/`checkpoints`

## Canon vs derived timelines

- `initialSnapshot` is treated as canonical input.
- simulation mutations occur on an isolated runtime clone.
- `finalSnapshot` and timeline artifacts are derived outputs.

This keeps lore/canon source state separate from generated timeline projections.

## Composition architecture (additive)

The backend composes existing systems in deterministic order per step:

1. **Polity core**: `stepPolityDay` (trade, war, morale/stability baseline)
2. **Governance**: `stepGovernanceCooldown`, `stepGovernanceStability`, `computeGovernanceModifiers`
3. **Diplomacy**: treaty strength/expiry progression
4. **Trade routes**: efficiency step + `applyDailyTrade`
5. **Migration**: `resolveMigration` + `applyMigrationFlows`
6. **Climate**: deterministic `generateClimateEvent`, aggregate effects, lifecycle stepping
7. **Epidemic**: `stepEpidemic` + death pressure application

All sequencing is deterministic and order-stable (sorted IDs, no `Math.random`).

## Deterministic profile presets

Profiles are explicit additive controls over existing modules and all share the same explicit pipeline order:

1. `polity`
2. `governance`
3. `diplomacy`
4. `trade`
5. `migration`
6. `climate`
7. `epidemic`

Preset intent:

- `minimal_world_history`: only core polity day stepping.
- `polity_dynamics`: polity + governance + diplomacy + trade.
- `conflict_heavy`: polity/governance/diplomacy/trade/migration with no climate/epidemic load.
- `climate_and_migration`: polity + migration + climate + epidemic pressure.
- `full_world_evolution`: all currently integrated world-scale subsystems enabled.

Legacy IDs (`balanced`, `resilience`, `expansion`) are kept as deterministic aliases to `full_world_evolution` for compatibility.

### Profile matrix (explicit ruleset behavior)

| Profile | Polity | Governance | Diplomacy | Trade | Migration | Climate | Epidemic | Intended host use |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `minimal_world_history` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Lowest-cost long-horizon history baselines |
| `polity_dynamics` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | Political/economic simulation without environmental load |
| `conflict_heavy` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | War/mobility-driven scenarios with reduced overhead |
| `climate_and_migration` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | Environmental stress, displacement, and disease pressure studies |
| `full_world_evolution` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Full-stack world simulation for maximal systemic richness |

All presets preserve the same deterministic subsystem execution order and only enable/disable or tune existing mechanics.

## Host overrides layered on profile

Hosts can provide:

- `profileId` to select a preset
- `ruleOverrides` to override specific fields deterministically

Overrides are applied additively to the resolved profile; no random behavior is introduced.

Example:

```ts
const result = runWorldEvolution({
  snapshot,
  steps: 90,
  profileId: "polity_dynamics",
  profile: {
    governanceStabilityDaysPerStep: 2,
    routeEfficiencyBoost_Q: q(0.001),
  },
});
```

The resolved profile remains deterministic for a fixed snapshot/seed + override object.

## Profile comparison example

See `examples/world-evolution-profiles-comparison.ts` for a side-by-side run comparing multiple profiles over the same input state and seed.

## Determinism notes

- Uses fixed-point arithmetic and existing deterministic world primitives.
- Iteration order is normalized by IDs before applying updates.
- same snapshot + same profile + same step count => byte-for-byte equal result object.

## Minimal API

- `createWorldEvolutionSnapshot(snapshot)`
- `runWorldEvolution(request)`
- `listAvailableWorldEvolutionProfiles()`
- plus profile helpers/types via the same subpath.

## Session orchestration layer

For hosts that need a session-oriented API (`createEvolutionSession`, `stepEvolution`, serialization helpers), use `@its-not-rocket-science/ananke/world-evolution` and see `docs/world-evolution-orchestration.md`.


## Host canonical schema

For external platform integrators, see `docs/host-world-evolution-schema.md` and `schema/world-evolution-input.schema.json`.
