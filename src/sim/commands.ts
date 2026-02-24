import type { Q } from "../units.js";
import { q } from "../units.js";
import type { Vec3 } from "./vec3.js";

import { CommandKinds, DefenceMode, EngageModes, EngageMode, MoveMode, MoveModes } from "./kinds.js";
import type { MedicalAction, MedicalTier } from "./medical.js";

export type Command =
  | MoveCommand
  | SetProneCommand
  | DefendCommand
  | AttackCommand
  | AttackNearestCommand
  | GrappleCommand
  | BreakGrappleCommand
  | BreakBindCommand
  | ShootCommand
  | TreatCommand;

export interface MoveCommand {
  kind: typeof CommandKinds.Move;
  dir: Vec3;
  intensity: Q; // 0..1
  mode: MoveMode;
}

export interface SetProneCommand {
  kind: typeof CommandKinds.SetProne;
  prone: boolean;
}

export interface DefendCommand {
  kind: typeof CommandKinds.Defend;
  mode: DefenceMode;
  intensity: Q; // 0..1
}

export interface AttackCommand {
  kind: typeof CommandKinds.Attack;
  targetId: number;
  weaponId?: string;
  intensity?: Q;
  mode?: typeof EngageModes.Strike;
}

export const noMove = (): MoveCommand => ({
  kind: CommandKinds.Move,
  dir: { x: 0, y: 0, z: 0 },
  intensity: q(0),
  mode: MoveModes.Walk as MoveMode,
});

export interface AttackNearestCommand {
  kind: typeof CommandKinds.AttackNearest;
  weaponId?: string;
  intensity?: Q;
  mode: typeof EngageModes.Strike;
}

export type GrappleMode = "grapple" | "throw" | "choke" | "jointLock";

export interface GrappleCommand {
  kind: typeof CommandKinds.Grapple;
  targetId: number;
  intensity: Q;
  mode?: GrappleMode;  // default "grapple"
}
export interface BreakGrappleCommand { kind: typeof CommandKinds.BreakGrapple; intensity: Q; }
export interface BreakBindCommand    { kind: typeof CommandKinds.BreakBind;    intensity: Q; }  // Phase 2C

export interface ShootCommand {           // Phase 3
  kind: typeof CommandKinds.Shoot;
  targetId: number;
  weaponId?: string;
  intensity?: Q;   // aiming effort; default q(1.0)
}

export interface TreatCommand {           // Phase 9
  kind: typeof CommandKinds.Treat;
  targetId: number;
  action: MedicalAction;
  tier: MedicalTier;
  /** Region to treat. Required for tourniquet/bandage/surgery; omit for fluidReplacement. */
  regionId?: string;
}

export type CommandMap = Map<number, readonly Command[]>;
