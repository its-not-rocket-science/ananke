import type { BodyRegion } from "./body";
import type { Weapon } from "../equipment";

export interface ImpactEvent {
  kind: "impact";
  attackerId: number;
  targetId: number;
  region: BodyRegion;
  energy_J: number;
  protectedByArmour: boolean;
  weaponId: string;
  wpn: Weapon;
}

export function sortEventsDeterministic<T extends { attackerId: number; targetId: number }>(ev: T[]): void {
  ev.sort((a, b) =>
    a.attackerId !== b.attackerId ? a.attackerId - b.attackerId :
    a.targetId !== b.targetId ? a.targetId - b.targetId :
    0
  );
}