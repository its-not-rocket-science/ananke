import type { Weapon } from "../equipment.js";
import type { Q } from "../units.js";
import { BodyRegion } from "./body.js";
import { BodySegmentId } from "./bodyplan.js";

export interface ImpactEvent {
  kind: "impact";
  attackerId: number;
  targetId: number;
  /** Segment id of the struck region (BodyRegion string for humanoid; arbitrary string for other body plans). */
  region: BodyRegion | BodySegmentId;
  energy_J: number;
  protectedByArmour: boolean;
  blocked: boolean;
  parried: boolean;
  weaponId: string;
  wpn: Weapon;
  hitQuality: Q;
  shieldBlocked: boolean;
  /** Phase 26: effective striking mass (weapon head + body fraction, or projectile mass) in SCALE.kg units. */
  massEff_kg?: number;
  /** Phase 27: projectile velocity at impact point (pre-armour, post-drag) in SCALE.mps units. */
  v_impact_mps?: number;
}

export function sortEventsDeterministic<T extends { attackerId: number; targetId: number }>(ev: T[]): void {
  ev.sort((a, b) =>
    a.attackerId !== b.attackerId ? a.attackerId - b.attackerId :
    a.targetId !== b.targetId ? a.targetId - b.targetId :
    0
  );
}
