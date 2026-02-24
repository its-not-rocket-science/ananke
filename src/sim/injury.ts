import type { Q } from "../units.js";
import { q, clampQ, SCALE, qMul } from "../units.js";
import { ALL_REGIONS } from "./body.js";

export interface RegionInjury {
  surfaceDamage: Q;     // 0..1
  internalDamage: Q;    // 0..1
  structuralDamage: Q;  // 0..1
  bleedingRate: Q;      // 0..1
}

export interface InjuryState {
  /** Keyed by segment id (BodyRegion strings for humanoid, or custom ids for other body plans). */
  byRegion: Record<string, RegionInjury>;

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

/**
 * Create a default InjuryState for the given segment ids.
 * When omitted, defaults to the standard humanoid six regions.
 */
export const defaultInjury = (segmentIds?: readonly string[]): InjuryState => {
  const ids = segmentIds ?? ALL_REGIONS;
  const byRegion: Record<string, RegionInjury> = {};
  for (const r of ids) byRegion[r] = defaultRegionInjury();
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
  const segs = Object.values(i.byRegion);
  let sum = 0;
  for (const r of segs) sum += r[type];
  return clampQ(sum as any, 0, segs.length * SCALE.Q);
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

/**
 * Compute KO risk from CNS-critical region damage.
 * For humanoid and any plan that uses "head"/"torso" segment ids.
 * For other body plans, falls back gracefully to q(0) for absent segments.
 */
export function regionKOFactor(i: InjuryState): Q {
  const head = i.byRegion["head"]?.internalDamage ?? q(0);
  const torso = i.byRegion["torso"]?.internalDamage ?? q(0);
  return clampQ(qMul(head, q(1.2)) + qMul(torso, q(0.6)), 0, SCALE.Q);
}
