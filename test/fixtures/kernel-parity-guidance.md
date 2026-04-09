# Kernel parity fixture guidance

This suite is the canonical parity harness for kernel refactors and resolver extraction.

## What to add when extending parity coverage

1. Add a new scenario object in `test/fixtures/kernel-parity-scenarios.ts`.
2. Keep fixture setup deterministic:
   - fixed seed,
   - fixed entity IDs,
   - deterministic command generation from `(tick, world)`.
3. Prefer one subsystem focus per scenario (`melee`, `ranged`, `grapple`, etc.).
4. Set `compareTraceOrder: true` when the feature emits deterministic traces whose order is semantically relevant.
5. Keep scenario tick count only as long as needed to exercise the transition being protected.

## Scenario authoring checklist

- Include the minimal entities needed to trigger the subsystem.
- Use explicit command fields (`weaponId`, `mode`, `intensity`) to avoid implicit defaults changing under refactor.
- Exercise at least one state transition (cooldown, morale threshold crossing, capability reserve spend, hunger stage shift, etc.).
- Verify your new scenario passes with current `stepWorld` and candidate extraction (`stepWorldRefactor`) if present.

## Why this harness is extraction-safe

`test/kernel-parity.test.ts` runs each scenario twice:
- baseline: `stepWorld` from `src/sim/kernel.ts`,
- candidate: `stepWorldRefactor` from `src/sim/kernel-refactor.ts` (fallback to baseline if absent).

Parity requires exact end-state equality for world snapshots and ordered trace equality when enabled.
