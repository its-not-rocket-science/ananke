import type { I32, Q } from "./units";
import { SCALE, q, clampQ, qMul, mulDiv } from "./units";
import type { ChannelMask } from "./channels";
import { DamageChannel, channelMask } from "./channels";
import type { IndividualAttributes } from "./types";
import type { BodyRegion } from "./sim/body";
import { ALL_REGIONS, DEFAULT_REGION_WEIGHTS, weightedMean01 } from "./sim/body";

export type ItemId = string;

export interface ItemBase {
  id: ItemId;
  name: string;
  mass_kg: I32;
  bulk: Q;
}

export interface WeaponDamageProfile {
  surfaceFrac: Q;
  internalFrac: Q;
  structuralFrac: Q;

  bleedFactor: Q;
  penetrationBias: Q;
}

export type Handedness = "oneHand" | "twoHand" | "mounted" | "natural";

export interface Weapon extends ItemBase {
  kind: "weapon";
  reach_m?: I32;
  handlingMul?: Q;
  readyTime_s?: I32;

  strikeEffectiveMassFrac?: Q;
  strikeSpeedMul?: Q;

  damage: WeaponDamageProfile;

  handedness?: Handedness;

  /** Lever advantage (m). Used for parry/block effectiveness and control. */
  momentArm_m?: number;

  /** how tiring it is to wield (dimensionless Q multiplier). */
  handlingLoadMul?: Q;
}

export type CoverageByRegion = Partial<Record<BodyRegion, Q>>;

export interface Armour extends ItemBase {
  kind: "armour";

  protects: ChannelMask;

  coverageByRegion: CoverageByRegion;

  resist_J: I32;
  protectedDamageMul: Q;

  channelResistMul?: Partial<Record<DamageChannel, Q>>;

  mobilityMul?: Q;
  fatigueMul?: Q;
}

export interface Gear extends ItemBase {
  kind: "gear";
}

export type Item = Weapon | Armour | Gear;

export interface Loadout {
  items: Item[];
}

/* ------------------ Encumbrance ------------------ */

export interface EncumbranceTotals {
  carriedMass_kg: I32;
  carriedBulk: Q;

  wornMass_kg: I32;
  wornBulk: Q;

  carriedMassFracOfBody: Q;
}

export interface EncumbrancePenalties {
  speedMul: Q;
  accelMul: Q;
  jumpMul: Q;
  energyDemandMul: Q;
  controlMul: Q;
  stabilityMul: Q;
  encumbranceRatio: Q;
  overloaded: boolean;
}

export interface CarryRules {
  capacityFactor: Q;
  bulkToMassFactor: Q;
}

export const DEFAULT_CARRY_RULES: CarryRules = {
  capacityFactor: q(0.25),
  bulkToMassFactor: q(0.06),
};

export function computeLoadoutTotals(loadout: Loadout, armourIsWorn = true): EncumbranceTotals {
  let mass = 0;
  let bulk = 0;
  let wornMass = 0;
  let wornBulk = 0;

  for (const it of loadout.items) {
    mass += it.mass_kg;
    bulk = (bulk + it.bulk) | 0;
    if (armourIsWorn && it.kind === "armour") {
      wornMass += it.mass_kg;
      wornBulk = (wornBulk + it.bulk) | 0;
    }
  }

  return {
    carriedMass_kg: mass,
    carriedBulk: bulk as Q,
    wornMass_kg: wornMass,
    wornBulk: wornBulk as Q,
    carriedMassFracOfBody: q(0),
  };
}

export function deriveCarryCapacityMass_kg(a: IndividualAttributes, rules: CarryRules = DEFAULT_CARRY_RULES): I32 {
  const peakForceScaled = a.performance.peakForce_N;
  const numerator = BigInt(peakForceScaled) * BigInt(SCALE.kg) * BigInt(rules.capacityFactor);
  const denom = BigInt(SCALE.N) * BigInt(SCALE.Q) * 9810n;
  const kgScaled = Number(numerator / denom);
  return Math.max(1, kgScaled);
}

export function computeEncumbrance(
  a: IndividualAttributes,
  loadout: Loadout,
  rules: CarryRules = DEFAULT_CARRY_RULES,
): { totals: EncumbranceTotals; penalties: EncumbrancePenalties } {
  const totals = computeLoadoutTotals(loadout);
  const bodyMass = Math.max(1, a.morphology.mass_kg);

  totals.carriedMassFracOfBody = mulDiv(totals.carriedMass_kg * SCALE.Q, SCALE.kg, bodyMass) as Q;

  const capacity_kg = Math.max(1, deriveCarryCapacityMass_kg(a, rules));
  const massRatio = mulDiv(totals.carriedMass_kg * SCALE.Q, 1, capacity_kg) as Q;

  const bulkAbove1 = Math.max(0, totals.carriedBulk - SCALE.Q);
  const bulkTerm = qMul(bulkAbove1 as Q, rules.bulkToMassFactor);

  const r = clampQ((massRatio + bulkTerm) as Q, 0, 5 * SCALE.Q);
  const penalties = encumbranceCurve(r, a);
  return { totals, penalties };
}

function encumbranceCurve(r: Q, a: IndividualAttributes): EncumbrancePenalties {
  const overloaded = r > q(1.5);

  const speedMul = piecewiseMul(r, q(1.0), q(0.92), q(0.78), q(0.55));
  const accelMul = piecewiseMul(r, q(1.0), q(0.88), q(0.70), q(0.45));
  const jumpMul = piecewiseMul(r, q(1.0), q(0.90), q(0.68), q(0.40));

  const baseDemand = piecewiseMul(r, q(1.0), q(1.10), q(1.30), q(1.65));
  const energyDemandMul = clampQ(qMul(baseDemand, a.resilience.fatigueRate), q(0.5), q(3.0));

  const controlMul = piecewiseMul(r, q(1.0), q(0.96), q(0.88), q(0.75));
  const stabilityMul = piecewiseMul(r, q(1.0), q(0.94), q(0.82), q(0.65));

  return { speedMul, accelMul, jumpMul, energyDemandMul, controlMul, stabilityMul, encumbranceRatio: r, overloaded };
}

function piecewiseMul(r: Q, a: Q, b: Q, c: Q, d: Q): Q {
  const r05 = q(0.5), r10 = q(1.0), r15 = q(1.5);

  if (r <= r05) return a;
  if (r <= r10) {
    const t = mulDiv((r - r05), SCALE.Q, (r10 - r05)) as Q;
    return (a + mulDiv((b - a), t, SCALE.Q)) as Q;
  }
  if (r <= r15) {
    const t = mulDiv((r - r10), SCALE.Q, (r15 - r10)) as Q;
    return (b + mulDiv((c - b), t, SCALE.Q)) as Q;
  }
  return d;
}

/* ------------------ Armour aggregation ------------------ */

export interface ProtectionProfile {
  protects: ChannelMask;

  coverageByRegion: Record<BodyRegion, Q>;
  coverageOverall: Q;

  resist_J: I32;

  protectedDamageMul: Q;
  mobilityMul: Q;
  fatigueMul: Q;

  channelResistMul: Partial<Record<DamageChannel, Q>>;
}

function emptyCoverage(): Record<BodyRegion, Q> {
  const out: any = {};
  for (const r of ALL_REGIONS) out[r] = q(0);
  return out;
}

export function deriveArmourProfile(loadout: Loadout): ProtectionProfile {
  const items = [...loadout.items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let protects: ChannelMask = 0;
  let protectedMul = q(1.0);
  let mobilityMul = q(1.0);
  let fatigueMul = q(1.0);

  const coverageByRegion = emptyCoverage();
  let resist_J = 0;

  const channelResistMul: Partial<Record<DamageChannel, Q>> = {};

  for (const it of items) {
    if (it.kind !== "armour") continue;

    protects |= it.protects;
    protectedMul = qMul(protectedMul, it.protectedDamageMul);
    mobilityMul = qMul(mobilityMul, it.mobilityMul ?? q(1.0));
    fatigueMul = qMul(fatigueMul, it.fatigueMul ?? q(1.0));

    for (const r of ALL_REGIONS) {
      const c = it.coverageByRegion[r] ?? q(0);
      const oneMinus = q(1.0) - c;
      coverageByRegion[r] = (q(1.0) - qMul(q(1.0) - coverageByRegion[r], oneMinus)) as Q;
    }

    resist_J += it.resist_J;

    if (it.channelResistMul) {
      for (const k of Object.keys(it.channelResistMul)) {
        const ch = Number(k) as DamageChannel;
        const mul = it.channelResistMul[ch]!;
        channelResistMul[ch] = channelResistMul[ch] ? qMul(channelResistMul[ch]!, mul) : mul;
      }
    }
  }

  return {
    protects,
    coverageByRegion: coverageByRegion as any,
    coverageOverall: weightedMean01(coverageByRegion as any, DEFAULT_REGION_WEIGHTS),
    resist_J: Math.max(0, resist_J),
    protectedDamageMul: clampQ(protectedMul, q(0.05), q(1.0)),
    mobilityMul: clampQ(mobilityMul, q(0.30), q(1.0)),
    fatigueMul: clampQ(fatigueMul, q(0.80), q(3.0)),
    channelResistMul,
  };
}

export function findWeapon(loadout: Loadout, weaponId?: string): Weapon | null {
  const weapons = loadout.items
    .filter((x): x is Weapon => x.kind === "weapon");
  if (weapons.length === 0) return null;
  if (!weaponId) return weapons[0]!;
  return weapons.find(w => w.id === weaponId) ?? weapons[0]!;
}

export function deriveWeaponHandling(
  w: Weapon,
  ownerStature_m: number
): {
  handedness: Handedness;
  momentArm_m: number;
  handlingLoadMul: Q;
} {
  const reach = w.reach_m ?? Math.trunc(ownerStature_m * 0.45);

  return {
    handedness: w.handedness ?? "oneHand",
    momentArm_m: w.momentArm_m ?? Math.trunc(reach * 0.55),
    handlingLoadMul: w.handlingLoadMul ?? q(1.0),
  };
}
export const STARTER_WEAPONS: Weapon[] = [
  {
    id: "wpn_club",
    kind: "weapon",
    name: "Wooden club",
    mass_kg: Math.round(1.2 * SCALE.kg),
    bulk: q(1.4),
    reach_m: Math.round(0.7 * SCALE.m),
    handedness: "oneHand",
    momentArm_m: Math.round(0.45 * SCALE.m),
    handlingMul: q(1.10),
    strikeEffectiveMassFrac: q(0.18),
    strikeSpeedMul: q(0.95),
    damage: {
      surfaceFrac: q(0.35),
      internalFrac: q(0.20),
      structuralFrac: q(0.45),
      bleedFactor: q(0.25),
      penetrationBias: q(0.10),
    },
  },
  {
    id: "wpn_knife",
    kind: "weapon",
    name: "Knife",
    mass_kg: Math.round(0.3 * SCALE.kg),
    bulk: q(1.1),
    reach_m: Math.round(0.2 * SCALE.m),
    handedness: "oneHand",
    momentArm_m: Math.round(0.18 * SCALE.m),
    handlingMul: q(0.85),
    strikeEffectiveMassFrac: q(0.10),
    strikeSpeedMul: q(1.05),
    damage: {
      surfaceFrac: q(0.30),
      internalFrac: q(0.60),
      structuralFrac: q(0.10),
      bleedFactor: q(0.95),
      penetrationBias: q(0.85),
    },
  },
];

export const STARTER_ARMOUR: Armour[] = [
  {
    id: "arm_leather",
    kind: "armour",
    name: "Leather armour",
    mass_kg: Math.round(6.0 * SCALE.kg),
    bulk: q(1.6),
    protects: channelMask(DamageChannel.Kinetic, DamageChannel.Thermal),
    coverageByRegion: {
      head: q(0.10),
      torso: q(0.70),
      leftArm: q(0.45),
      rightArm: q(0.45),
      leftLeg: q(0.25),
      rightLeg: q(0.25),
    },
    resist_J: 150,
    protectedDamageMul: q(0.85),
    channelResistMul: { [DamageChannel.Thermal]: q(1.10) },
    mobilityMul: q(0.95),
    fatigueMul: q(1.08),
  },
  {
    id: "arm_mail",
    kind: "armour",
    name: "Mail armour",
    mass_kg: Math.round(10.0 * SCALE.kg),
    bulk: q(1.9),
    protects: channelMask(DamageChannel.Kinetic),
    coverageByRegion: {
      head: q(0.05),
      torso: q(0.78),
      leftArm: q(0.55),
      rightArm: q(0.55),
      leftLeg: q(0.20),
      rightLeg: q(0.20),
    },
    resist_J: 350,
    protectedDamageMul: q(0.75),
    mobilityMul: q(0.90),
    fatigueMul: q(1.15),
  },
];
