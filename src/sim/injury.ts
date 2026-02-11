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

export function totalBleedingRate(i: InjuryState): Q {
  let acc = 0;
  for (const r of ALL_REGIONS) acc += i.byRegion[r].bleedingRate;
  return clampQ(acc as any, 0, q(1.0));
}

export function regionKOFactor(i: InjuryState): Q {
  const head = i.byRegion.head.internalDamage;
  const torso = i.byRegion.torso.internalDamage;
  return clampQ(qMul(head, q(1.2)) + qMul(torso, q(0.6)), 0, SCALE.Q);
}
