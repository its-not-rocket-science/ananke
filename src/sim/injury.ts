import type { Q } from "../units";
import { q, clampQ, SCALE, qMul } from "../units";
import type { BodyRegion } from "./body";
import { ALL_REGIONS } from "./body";

export interface RegionInjury {
  surfaceDamage: Q;     // 0..1
  internalDamage: Q;    // 0..1
  structuralDamage: Q;  // 0..1
  bleedingRate: Q;      // 0..1
}

export interface InjuryState {
  byRegion: Record<BodyRegion, RegionInjury>;

  fluidLoss: Q;       // 0..1
  shock: Q;           // 0..1
  consciousness: Q;   // 0..1

  dead: boolean;
}

export const defaultRegionInjury = (): RegionInjury => ({
  surfaceDamage: q(0),
  internalDamage: q(0),
  structuralDamage: q(0),
  bleedingRate: q(0),
});

export const defaultInjury = (): InjuryState => {
  const byRegion = {} as Record<BodyRegion, RegionInjury>;
  for (const r of ALL_REGIONS) byRegion[r] = defaultRegionInjury();
  return {
    byRegion,
    fluidLoss: q(0),
    shock: q(0),
    consciousness: q(1.0),
    dead: false,
  };
};

export type DamageType = 'surfaceDamage' | 'internalDamage' | 'structuralDamage' | 'bleedingRate';

function totalRegionDamage(i: InjuryState, type: DamageType): Q {
  const r = i.byRegion;
  return clampQ(
    (r.head[type] + r.torso[type] + r.leftArm[type] + 
     r.rightArm[type] + r.leftLeg[type] + r.rightLeg[type]) as any,
    0, 6 * SCALE.Q
  );
}

export function totalSurfaceDamage(i: InjuryState): Q {
  return totalRegionDamage(i, 'surfaceDamage');
}

export function totalInternalDamage(i: InjuryState): Q {
  return totalRegionDamage(i, 'internalDamage');
}

export function totalStructuralDamage(i: InjuryState): Q {
  return totalRegionDamage(i, 'structuralDamage');
}

// If this name already exists in injury.ts, DO NOT duplicate it.
// Either keep your existing export, or replace it with this implementation.
export function totalBleedingRate(i: InjuryState): Q {
  return totalRegionDamage(i, 'bleedingRate');
}

export function regionKOFactor(i: InjuryState): Q {
  const head = i.byRegion.head.internalDamage;
  const torso = i.byRegion.torso.internalDamage;
  return clampQ(qMul(head, q(1.2)) + qMul(torso, q(0.6)), 0, SCALE.Q);
}
