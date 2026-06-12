# Kernel step refactor: architecture note

## Boundaries after refactor

`src/sim/kernel.ts` keeps:
- `stepWorld` as the single entry point.
- deterministic phase ordering and all orchestration loops.
- command resolver implementations (`resolveAttack`, `resolveShoot`, `resolveTreat`, `resolveActivation`, grapple dispatch) and shared combat math.
- exported public helpers (`applyImpactToInjury`, `applyFallDamage`, `applyExplosion`, capability payload/effect application).

Extracted seams:
- `src/sim/step/pipeline.ts`
  - canonical phase-order contract (`STEP_PHASE_ORDER`) used by orchestration and tests.
- `src/sim/step/apply/intents.ts`
  - intent mutation and gating (`applyCommands`, `applyFunctionalGating`, `applyStandAndKO`).
- `src/sim/step/phases/capability-phase.ts`
  - capability lifecycle stepping (pending cast resolution, concentration tick, sustained emission).
- `src/sim/step/resolvers/impact-resolver.ts`
  - resolved impact application to injury/knockback/trace in deterministic event order.

## Determinism invariants preserved

1. Entity iteration order is unchanged (always `for (const e of world.entities)`).
2. Impact ordering still uses `sortEventsDeterministic` before application.
3. Seeded rolls still use existing `eventSeed` call sites in unchanged resolver code.
4. Fixed-point and integer math paths are unchanged; no floating rewrite introduced.
5. Trace emission order remains phase-stable.

## Phased extraction plan (executed)

1. Extract intent application/gating functions into `step/apply/intents.ts`.
2. Extract capability lifecycle phase into `step/phases/capability-phase.ts`.
3. Extract impact application loop into `step/resolvers/impact-resolver.ts`.
4. Introduce explicit phase-order constant in `step/pipeline.ts`.
5. Add ordering regression test and rerun determinism-focused tests.
