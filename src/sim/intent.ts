import type { Q } from "../units";
import { q } from "../units";
import type { Vec3 } from "./vec3";

export interface MoveIntent {
  dir: Vec3;
  intensity: Q; // 0..1
  mode: "walk" | "run" | "sprint";
}

export interface DefenceIntent {
  mode: "none" | "block" | "parry" | "dodge";
  intensity: Q; // 0..1
}

export interface IntentState {
  move: MoveIntent;
  defence: DefenceIntent;
  prone: boolean;
}

export interface AIState {
  // last chosen target (for stickiness / focus fire)
  focusTargetId: number; // 0 = none
  // cooldown to prevent retargeting every tick
  retargetCooldownTicks: number;
}

export const defaultIntent = (): IntentState => ({
  move: { dir: { x: 0, y: 0, z: 0 }, intensity: q(0), mode: "walk" },
  defence: { mode: "none", intensity: q(0) },
  prone: false,
});
