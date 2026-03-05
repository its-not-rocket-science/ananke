import type { Q } from "../units.js";
import { q } from "../units.js";
import { DefenceMode, DefenceModes, MoveMode, MoveModes } from "./kinds.js";
import type { Vec3 } from "./vec3.js";
import type { LocomotionMode } from "../types.js";

export interface MoveIntent {
  dir: Vec3;
  intensity: Q; // 0..1
  mode: MoveMode;
}

export interface DefenceIntent {
  mode: DefenceMode;
  intensity: Q; // 0..1
}

export interface IntentState {
  move: MoveIntent;
  defence: DefenceIntent;
  prone: boolean;
  /** Phase 32A: requested locomotion mode. Validated against entity.attributes.locomotionModes. */
  locomotionMode?: LocomotionMode;
}

export interface AIState {
  // last chosen target (for stickiness / focus fire)
  focusTargetId: number; // 0 = none
  // cooldown to prevent retargeting every tick
  retargetCooldownTicks: number;
  // Phase 4: decision latency — ticks remaining before plan revision allowed
  decisionCooldownTicks: number;
}

export const defaultIntent = (): IntentState => ({
  move: { dir: { x: 0, y: 0, z: 0 }, intensity: q(0), mode: MoveModes.Walk },
  defence: { mode: DefenceModes.None, intensity: q(0) },
  
  prone: false,
});
