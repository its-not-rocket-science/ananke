import type { I32 } from "../units.js";

export interface ActionState {
  attackCooldownTicks: I32;
  defenceCooldownTicks: I32;
  grappleCooldownTicks: I32;  // Phase 2A
  facingDirQ: { x: I32; y: I32; z: I32 };

  // Phase 2C: weapon bind state
  weaponBindPartnerId: number;  // 0 if not bound
  weaponBindTicks: number;      // ticks remaining in bind

  // Phase 3: ranged combat
  shootCooldownTicks: I32;      // ticks until next shot can be fired

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
  shootCooldownTicks: 0,
});
