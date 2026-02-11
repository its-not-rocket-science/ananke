import type { I32 } from "../units";

export interface ActionState {
  attackCooldownTicks: I32;
  defenceCooldownTicks: I32;
  facingDirQ: { x: I32; y: I32; z: I32 };
}

export const defaultAction = (): ActionState => ({
  attackCooldownTicks: 0,
  defenceCooldownTicks: 0,
  facingDirQ: { x: 10_000, y: 0, z: 0 },
});
