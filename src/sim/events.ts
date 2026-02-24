import type { Weapon } from "../equipment.js";
import type { Q } from "../units.js";

export interface ImpactEvent {
  kind: "impact";
  attackerId: number;
  targetId: number;
  /** Segment id of the struck region (BodyRegion string for humanoid; arbitrary string for other body plans). */
  region: string;
  energy_J: number;
  protectedByArmour: boolean;
  blocked: boolean;
  parried: boolean;
  weaponId: string;
  wpn: Weapon;
  hitQuality: Q;
  shieldBlocked: boolean;
}

export function sortEventsDeterministic<T extends { attackerId: number; targetId: number }>(ev: T[]): void {
  ev.sort((a, b) =>
    a.attackerId !== b.attackerId ? a.attackerId - b.attackerId :
    a.targetId !== b.targetId ? a.targetId - b.targetId :
    0
  );
}
