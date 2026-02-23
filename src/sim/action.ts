import type { I32 } from "../units.js";

export interface ActionState {
  attackCooldownTicks: I32;
  defenceCooldownTicks: I32;
  grappleCooldownTicks: I32;  // Phase 2A
  facingDirQ: { x: I32; y: I32; z: I32 };

  // Phase 2C: weapon bind state
  weaponBindPartnerId: number;  // 0 if not bound
  weaponBindTicks: number;      // ticks remaining in bind
}

export const defaultAction = (): ActionState => ({
  attackCooldownTicks: 0,
  defenceCooldownTicks: 0,
  grappleCooldownTicks: 0,
  facingDirQ: { x: 10_000, y: 0, z: 0 },
  weaponBindPartnerId: 0,
  weaponBindTicks: 0,
});
