import type { I32, Q } from "../units.js";

export interface ActionState {
  attackCooldownTicks: I32;
  defenceCooldownTicks: I32;
  grappleCooldownTicks: I32;  // Phase 2A
  facingDirQ: { x: I32; y: I32; z: I32 };

  // Phase 2C: weapon bind state
  weaponBindPartnerId: number;  // 0 if not bound
  weaponBindTicks: number;      // ticks remaining in bind

  // Phase 2 extension: swing momentum carry
  swingMomentumQ: Q;            // 0..q(0.80); decays per tick; boosts strike energy

  // Phase 3: ranged combat
  shootCooldownTicks: I32;      // ticks until next shot can be fired

  // Phase 3 extension: aiming time
  aimTicks: number;             // ticks spent aiming at current target (0..20)
  aimTargetId: number;          // entity ID currently being aimed at (0 = none)

  // Phase 12B: per-capability cooldown. Key = "sourceId:effectId"; value = ticks remaining.
  capabilityCooldowns?: Map<string, number>;

  // Phase 12B: previous terrain cell key — used for terrain-entry trigger detection.
  lastCellKey?: string;
}

export const defaultAction = (): ActionState => ({
  attackCooldownTicks: 0,
  defenceCooldownTicks: 0,
  grappleCooldownTicks: 0,
  facingDirQ: { x: 10_000, y: 0, z: 0 },
  weaponBindPartnerId: 0,
  weaponBindTicks: 0,
  swingMomentumQ: 0 as Q,
  shootCooldownTicks: 0,
  aimTicks: 0,
  aimTargetId: 0,
});
