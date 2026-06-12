# Kernel refactor responsibility map

## Before (pre-cleanup in `src/sim/kernel.ts`)

`kernel.ts` mixed orchestration with duplicated command implementations.

- **Tick orchestration**
  - phase ordering, movement, impact sorting, systems progression, morale, tick increment.
- **Apply/intents glue**
  - command intake + functional gating.
- **Resolver dispatch (active path)**
  - attack, shoot, grapple, breakBind, treat, activate dispatched through resolver modules.
- **Large `_legacy` resolver bodies (dead weight)**
  - `resolveAttack_legacy`
  - `resolveGrappleCommand_legacy`
  - `resolveBreakBind_legacy`
  - `resolveShoot_legacy`
  - `resolveTreat_legacy`
  - `applyPayload_legacy`
  - `applyCapabilityEffect_legacy`
  - `resolveActivation_legacy`
- **Kernel-local damage/effects primitives**
  - `applyImpactToInjury`, `applyFallDamage`, `applyExplosion`, armour helper utilities.

## After (this refactor)

`kernel.ts` now keeps orchestration and shared primitives only.

- **Orchestration (retained in kernel)**
  - `stepWorld` pipeline ordering and phase-to-phase data flow.
  - lightweight resolver dispatch wrappers (`resolveAttack`, `resolveShoot`, `resolveGrappleCommand`, `resolveBreakBind`, `resolveTreat`, `resolveActivation`).
- **Delegated logic (authoritative path)**
  - melee: `src/sim/resolvers/attack-resolver.ts`
  - ranged: `src/sim/resolvers/shoot-resolver.ts`
  - grapple / breakBind: `src/sim/resolvers/grapple-resolver.ts`
  - treatment: `src/sim/resolvers/treat-resolver.ts`
  - capabilities payload/effect/activation: `src/sim/resolvers/capability-resolver.ts`
  - impact application phase: `src/sim/step/resolvers/impact-resolver.ts`
  - command-intent application: `src/sim/step/apply/intents.ts`
  - prepare/cooldown/capability phases: `src/sim/step/phases/*`
- **Removed from kernel**
  - all `_legacy` implementations listed above.

## Intentionally retained kernel-local helpers

Kept local because they are cross-cutting primitives reused by multiple phases and tests:

- `resolveTargetHitSegment`, `regionCoverageQ`, `shieldBlocksSegment`, `resolveCapabilityHitSegment`
- exported movement/util helpers used by step modules: `clampSpeed`, `scaleDirToSpeed`, `clampI32`
- injury/damage primitives and hazards API surface:
  - `armourCoversHit`, `applyImpactToInjury`, `applyFallDamage`, `applyExplosion`
