import type { BodyRegion } from "./body.js";
import type { Weapon } from "../equipment.js";
import type { Q } from "../units.js";

export interface ImpactEvent {
  kind: "impact";
  attackerId: number;
  targetId: number;
  region: BodyRegion;
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