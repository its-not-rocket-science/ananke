import type { Q } from "../units";
import { q } from "../units";
import type { Vec3 } from "./vec3";

export type Command =
  | MoveCommand
  | SetProneCommand
  | DefendCommand
  | AttackCommand;

export interface MoveCommand {
  kind: "move";
  dir: Vec3;
  intensity: Q; // 0..1
  mode: "walk" | "run" | "sprint";
}

export interface SetProneCommand {
  kind: "setProne";
  prone: boolean;
}

export interface DefendCommand {
  kind: "defend";
  mode: "none" | "block" | "parry" | "dodge";
  intensity: Q; // 0..1
}

export interface AttackCommand {
  kind: "attack";
  targetId: number;
  weaponId?: string;
  intensity?: Q;
  mode?: "strike";
}

export const noMove = (): MoveCommand => ({
  kind: "move",
  dir: { x: 0, y: 0, z: 0 },
  intensity: q(0),
  mode: "walk",
});

export type CommandMap = Map<number, readonly Command[]>;
