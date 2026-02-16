import type { AttackCommand, DefendCommand } from "./commands";
import { q, type Q } from "../units";

export function makeAttackCommand(
  targetId: number,
  opts: {
    weaponId?: string;
    intensity?: Q;
    mode?: "strike";
  } = {}
): AttackCommand {
  return {
    kind: "attack",
    targetId,
    ...(opts.weaponId !== undefined ? { weaponId: opts.weaponId } : {}),
    ...(opts.intensity !== undefined ? { intensity: opts.intensity } : {}),
    ...(opts.mode !== undefined ? { mode: opts.mode } : {}),
  };
}

export function defendNone(): DefendCommand {
  return {
    kind: "defend",
    mode: "none",
    intensity: q(0),
  };
}

export function defendBlock(intensity: Q = q(1.0)): DefendCommand {
  return {
    kind: "defend",
    mode: "block",
    intensity,
  };
}

export function defendParry(intensity: Q = q(1.0)): DefendCommand {
  return {
    kind: "defend",
    mode: "parry",
    intensity,
  };
}

export function defendDodge(intensity: Q = q(1.0)): DefendCommand {
  return {
    kind: "defend",
    mode: "dodge",
    intensity,
  };
}