# Kernel Combat Resolver Call Graph (Before / After)

## Before

`stepWorld` in `src/sim/kernel.ts` directly called:

- `resolveAttack`
- `resolveShoot`
- `resolveGrappleCommand`
- `resolveBreakBind`
- `resolveTreat`
- `resolveActivation`
- `applyCapabilityEffect`
- `applyPayload`

All heavy implementation logic lived in `kernel.ts`.

## After

`stepWorld` in `src/sim/kernel.ts` still calls the same kernel-level function names, but they now delegate to resolver modules:

- `resolveAttack` -> `resolvers/attack-resolver.ts::resolveAttack`
- `resolveShoot` -> `resolvers/shoot-resolver.ts::resolveShoot`
- `resolveGrappleCommand` / `resolveBreakBind` -> `resolvers/grapple-resolver.ts`
- `resolveTreat` -> `resolvers/treat-resolver.ts::resolveTreat`
- `resolveActivation` / `applyCapabilityEffect` / `applyPayload` -> `resolvers/capability-resolver.ts`

The legacy kernel implementations are retained as `_legacy` functions to preserve easy parity diffing while migration completes.

## Hidden coupling flagged

1. Resolver logic still depends on kernel-owned helpers (`resolveTargetHitSegment`, `shieldBlocksSegment`, `armourCoversHit`, `applyImpactToInjury`).
2. Capability activation and immediate payload dispatch are coupled through callback wiring in `resolveActivation`.
3. Deterministic seeded-roll behavior currently depends on preserving exact seed salts across both kernel and resolver layers.
