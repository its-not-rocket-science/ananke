import type { I32, Q } from "./units.js";
import type { Material } from "./crafting/materials.js";
import { SCALE, q, clampQ, qMul, mulDiv, to } from "./units.js";
import type { ChannelMask } from "./channels.js";
import { DamageChannel, channelMask } from "./channels.js";
import type { IndividualAttributes } from "./types.js";
import type { BodyRegion } from "./sim/body.js";
import { ALL_REGIONS, DEFAULT_REGION_WEIGHTS, weightedMean01 } from "./sim/body.js";
import type { TechCapability, TechContext } from "./sim/tech.js";
import { HitArea } from "./sim/kinds.js";

export type ItemId = string;

export interface ItemBase {
  id: ItemId;
  name: string;
  mass_kg: I32;
  bulk: Q;
  /** Phase 11: capabilities that must be in TechContext.available for this item to be usable. */
  requiredCapabilities?: readonly TechCapability[];
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
  reach_m?: I32 | undefined;  // optional for legacy items; if undefined, use default based on category and morphology
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

  /** Phase 11C: energy weapon type — routes damage through DamageChannel.Energy; resisted by reflectivity. */
  energyType?: "plasma" | "laser" | "sonic";

  /** Phase 17: flexible/chain weapons (flail, morning star) that loop around shields.
   *  q(0) = no bypass; q(0.50) = 50% reduction in effective shield coverageQ. */
  shieldBypassQ?: Q;

  /** Phase 25: cumulative use-wear (0 = new, q(1.0) = broken). Updated by applyWear(). */
  wear_Q?: Q;

}

export interface Shield extends ItemBase {
  kind: "shield";

  // defensive physics
  coverageQ: Q;            // chance to interpose when blocking (0..1)
  blockResist_J: number;   // energy absorbed before passing through
  deflectQ: Q;             // proportion of remaining energy deflected (0..1)

  // geometry
  arcDeg: number;          // e.g., 120° front arc
  regions: BodyRegion[];   // which regions it can cover (typically torso/arm/head)

  // penalties
  manipulationMul: Q;
  mobilityMul: Q;
  fatigueMul: Q;

  covers?: HitArea[];
  coverageProfileId?: string;
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

  /** Phase 11C: fraction of energy-weapon damage reflected (0..1); q(0.40) = deflects 40%. */
  reflectivity?: Q;
  /** Phase 11C: ablative plating — resist_J degrades each time the armour absorbs a hit. */
  ablative?: boolean;

  /** Phase 29: thermal insulation value (m²K/W).
   *  0 = none; 0.02 = plate metal; 0.15 = heavy wool; 0.25 = heavy fur.
   *  Added to the 0.09 baseline in the heat-balance equation. */
  insulation_m2KW?: number;
}

export interface Gear extends ItemBase {
  kind: "gear";
}

/** Phase 11: powered exoskeleton — boosts speed and strike force at a continuous energy cost. */
export interface Exoskeleton extends ItemBase {
  kind: "exoskeleton";
  /** Multiplier on effective sprint speed (e.g. q(1.25) = +25%). */
  speedMultiplier: Q;
  /** Multiplier on melee strike energy delivered (e.g. q(1.40) = +40%). */
  forceMultiplier: Q;
  /** Continuous power draw added to metabolic demand (watts). */
  powerDrain_W: number;
}

/** Phase 3 extension: ammo type — overrides projectile properties per shot. */
export interface AmmoType {
  id: string;
  name: string;
  /** Override projectile mass (SCALE.kg). Omit to use weapon default. */
  projectileMass_kg?: number;
  /** Override drag coefficient per metre. Omit to use weapon default. */
  dragCoeff_perM?: Q;
  /** Override damage channel distribution. Omit to use weapon default. */
  damage?: WeaponDamageProfile;
  /** Multiplier on weapon's launchEnergy_J (Q). Default q(1.0). */
  launchEnergyMul?: Q;
}

export interface RangedWeapon extends ItemBase {  // Phase 3
  kind: "ranged";
  category: "thrown" | "bow" | "firearm";
  launchEnergy_J: I32;      // 0 = derive from thrower (thrown category)
  projectileMass_kg: I32;   // projectile mass for reference
  dragCoeff_perM: Q;        // q(0.007) → 0.7% energy loss per metre
  dispersionQ: Q;           // base angular error at 1m (radians in Q)
  recycleTime_s: I32;       // time between shots (reload + ready); used for reload when mag empties
  /** Phase 17: rounds per magazine; undefined = muzzle-loader (no tracking). */
  magCapacity?: number;
  /** Phase 17: SCALE.s — cooldown between shots within magazine; recycleTime_s used only when mag empties. */
  shotInterval_s?: I32;
  damage: WeaponDamageProfile;
  /** Phase 11C: energy weapon type — routes damage through DamageChannel.Energy; resisted by reflectivity. */
  energyType?: "plasma" | "laser" | "sonic";
  /** Phase 3 extension: available ammo types for this weapon. */
  ammo?: AmmoType[];
  /** Phase 5 extension: scales per-tick suppression fear (default q(1.0)). */
  suppressionFearMul?: Q;

  shieldBypassQ?: Q;  // chainshot or flechette rounds that bypass shields to some extent (0..1)
}

/** Phase 11C: electronic sensor suite — boosts vision and hearing range while worn. */
export interface Sensor extends ItemBase {
  kind: "sensor";
  /** Multiplier on effective vision range (e.g. q(2.0) = double range). */
  visionRangeMul: Q;
  /** Multiplier on effective hearing range (e.g. q(1.5) = +50%). */
  hearingRangeMul: Q;
}

export type Item = Weapon | Armour | Gear | Shield | RangedWeapon | Exoskeleton | Sensor | Material;
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

  /** Phase 11C: max reflectivity across all armour items (for energy-weapon mitigation). */
  reflectivity: Q;
}

function emptyCoverage(): Record<BodyRegion, Q> {
  const out = {} as Record<BodyRegion, Q>;
  for (const r of ALL_REGIONS) out[r] = q(0);
  return out;
}

export function deriveArmourProfile(
  loadout: Loadout,
  armourState?: Map<string, { resistRemaining_J: number }>,
): ProtectionProfile {
  const items = [...loadout.items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let protects: ChannelMask = 0;
  let protectedMul = q(1.0);
  let mobilityMul = q(1.0);
  let fatigueMul = q(1.0);

  const coverageByRegion = emptyCoverage();
  let resist_J = 0;
  let reflectivity: Q = q(0);

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

    // Phase 11C: ablative — use remaining resist if tracked, else full
    const effectiveResist = (it.ablative && armourState?.has(it.id))
      ? armourState.get(it.id)!.resistRemaining_J
      : it.resist_J;
    resist_J += effectiveResist;

    // Phase 11C: reflectivity — take the maximum across all items
    if (it.reflectivity && it.reflectivity > reflectivity) {
      reflectivity = it.reflectivity;
    }

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
    coverageByRegion: coverageByRegion as Record<BodyRegion, Q>,
    coverageOverall: weightedMean01(coverageByRegion, DEFAULT_REGION_WEIGHTS),
    resist_J: Math.max(0, resist_J),
    protectedDamageMul: clampQ(protectedMul, q(0.05), q(1.0)),
    mobilityMul: clampQ(mobilityMul, q(0.30), q(1.0)),
    fatigueMul: clampQ(fatigueMul, q(0.80), q(3.0)),
    channelResistMul,
    reflectivity,
  };
}

export function findWeapon(loadout: Loadout, weaponId?: string): Weapon | null {
  const weapons = loadout.items
    .filter((x): x is Weapon => x.kind === "weapon");
  if (weapons.length === 0) return null;
  if (!weaponId) return weapons[0]!;
  return weapons.find(w => w.id === weaponId) ?? weapons[0]!;
}

export function findRangedWeapon(loadout: Loadout, weaponId?: string): RangedWeapon | null {  // Phase 3
  const ranged = loadout.items.filter((x): x is RangedWeapon => x.kind === "ranged");
  if (ranged.length === 0) return null;
  if (!weaponId) return ranged[0]!;
  return ranged.find(w => w.id === weaponId) ?? ranged[0]!;
}


export function findShield(loadout: Loadout): Shield | undefined {
  return loadout.items.find(item => item?.kind === "shield");
}

export function findExoskeleton(loadout: Loadout): Exoskeleton | null {
  return (loadout.items.find((it): it is Exoskeleton => it.kind === "exoskeleton") ?? null);
}

/** Phase 11C: return the first Sensor in the loadout, or null. */
export function findSensor(loadout: Loadout): Sensor | null {
  return (loadout.items.find((it): it is Sensor => it.kind === "sensor") ?? null);
}

/**
 * Phase 11: check that every item in a loadout is usable in the given TechContext.
 * Returns an array of error messages; empty array means the loadout is valid.
 */
export function validateLoadout(loadout: Loadout, ctx: TechContext): string[] {
  const errors: string[] = [];
  for (const item of loadout.items) {
    if (!item.requiredCapabilities) continue;
    for (const cap of item.requiredCapabilities) {
      if (!ctx.available.has(cap)) {
        errors.push(`"${item.id}" requires capability "${cap}"`);
      }
    }
  }
  return errors;
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
  {
    id: "wpn_longsword",
    kind: "weapon",
    name: "Longsword",
    mass_kg: Math.round(1.5 * SCALE.kg),
    bulk: q(1.5),
    reach_m: Math.round(0.90 * SCALE.m),
    handedness: "twoHand",
    momentArm_m: Math.round(0.55 * SCALE.m),
    handlingMul: q(1.05),
    strikeEffectiveMassFrac: q(0.15),
    strikeSpeedMul: q(1.00),
    readyTime_s: to.s(0.75),
    damage: {
      surfaceFrac: q(0.35),
      internalFrac: q(0.45),
      structuralFrac: q(0.20),
      bleedFactor: q(0.70),
      penetrationBias: q(0.40),
    },
  },
  // Phase 15: boxing gloves — concussive, minimal cutting, fast punches
  {
    id: "wpn_boxing_gloves",
    kind: "weapon",
    name: "Boxing Gloves",
    mass_kg: Math.round(0.28 * SCALE.kg),  // 10 oz ≈ 0.28 kg
    bulk: q(0.9),
    reach_m: Math.trunc(0.32 * SCALE.m),   // 0.32 m effective reach
    handedness: "oneHand",
    momentArm_m: Math.trunc(0.22 * SCALE.m),
    handlingMul: q(0.95),
    strikeEffectiveMassFrac: q(0.07),       // padding distributes force over larger area
    strikeSpeedMul: q(1.20),                // fast punches
    damage: {
      surfaceFrac: q(0.10),                 // padding minimises cuts
      internalFrac: q(0.60),               // concussive — brain/organ shock dominates
      structuralFrac: q(0.08),
      bleedFactor: q(0.04),                // almost no bleeding
      penetrationBias: q(0.03),
    },
  },
];

// Phase 11: powered exoskeletons
export const STARTER_EXOSKELETONS: Exoskeleton[] = [
  {
    id: "exo_combat",
    kind: "exoskeleton",
    name: "Combat exoskeleton",
    mass_kg: Math.round(25.0 * SCALE.kg),
    bulk: q(2.5),
    requiredCapabilities: ["PoweredExoskeleton"],
    speedMultiplier: q(1.25),   // +25% effective sprint speed
    forceMultiplier: q(1.40),   // +40% melee strike energy
    powerDrain_W: 200,           // equivalent to a second continuous-power budget
  },
  {
    id: "exo_heavy",
    kind: "exoskeleton",
    name: "Heavy assault exoskeleton",
    mass_kg: Math.round(45.0 * SCALE.kg),
    bulk: q(3.0),
    requiredCapabilities: ["PoweredExoskeleton"],
    speedMultiplier: q(1.10),   // heavy — modest speed gain
    forceMultiplier: q(1.80),   // massive force amplification
    powerDrain_W: 400,
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
    requiredCapabilities: ["MetallicArmour"],
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
  {
    id: "arm_plate",
    kind: "armour",
    name: "Plate armour",
    mass_kg: Math.round(20.0 * SCALE.kg),
    bulk: q(2.2),
    requiredCapabilities: ["MetallicArmour"],
    protects: channelMask(DamageChannel.Kinetic, DamageChannel.Thermal),
    coverageByRegion: {
      head: q(0.75),
      torso: q(0.90),
      leftArm: q(0.80),
      rightArm: q(0.80),
      leftLeg: q(0.70),
      rightLeg: q(0.70),
    },
    resist_J: 800,
    protectedDamageMul: q(0.60),
    mobilityMul: q(0.82),
    fatigueMul: q(1.25),
  },
];

export const STARTER_SHIELDS: Shield[] = [
  {
    id: "shd_small",
    kind: "shield",
    name: "Small shield",
    mass_kg: Math.round(3.0 * SCALE.kg),
    bulk: q(1.2),
    coverageQ: q(0.65),
    blockResist_J: 120,
    deflectQ: q(0.30),
    arcDeg: 90,
    regions: ["torso", "leftArm", "rightArm"],
    covers: ["torso", "arm", "head"],
    coverageProfileId: "shield_small_default",
    manipulationMul: q(0.95),
    mobilityMul: q(0.98),
    fatigueMul: q(1.05),
  },
];

// Phase 3: starter ranged weapons
// damage profile: projectiles are penetrating; surface fraction is low.
const PROJECTILE_DAMAGE: WeaponDamageProfile = {
  surfaceFrac: q(0.20),
  internalFrac: q(0.55),
  structuralFrac: q(0.25),
  bleedFactor: q(0.75),
  penetrationBias: q(0.70),
};

export const STARTER_RANGED_WEAPONS: RangedWeapon[] = [
  {
    id: "rng_sling",
    kind: "ranged",
    name: "Sling",
    category: "thrown",
    mass_kg: Math.round(0.1 * SCALE.kg),
    bulk: q(0.8),
    launchEnergy_J: 0,                  // derived from thrower peakPower_W
    projectileMass_kg: Math.round(0.08 * SCALE.kg),
    dragCoeff_perM: q(0.012),           // 1.2% energy loss per metre
    dispersionQ: q(0.012),             // 12 mrad base
    recycleTime_s: to.s(2.0),
    damage: PROJECTILE_DAMAGE,
    suppressionFearMul: q(0.5),
  },
  {
    id: "rng_shortbow",
    kind: "ranged",
    name: "Short bow",
    category: "bow",
    mass_kg: Math.round(0.8 * SCALE.kg),
    bulk: q(1.3),
    launchEnergy_J: 60,
    projectileMass_kg: Math.round(0.025 * SCALE.kg),
    dragCoeff_perM: q(0.007),           // 0.7% loss/m
    dispersionQ: q(0.012),
    recycleTime_s: to.s(1.5),
    damage: PROJECTILE_DAMAGE,
    suppressionFearMul: q(1.0),
  },
  {
    id: "rng_longbow",
    kind: "ranged",
    name: "Long bow",
    category: "bow",
    mass_kg: Math.round(1.2 * SCALE.kg),
    bulk: q(1.6),
    launchEnergy_J: 90,
    projectileMass_kg: Math.round(0.025 * SCALE.kg),
    dragCoeff_perM: q(0.005),           // 0.5% loss/m
    dispersionQ: q(0.008),
    recycleTime_s: to.s(2.0),
    damage: PROJECTILE_DAMAGE,
    suppressionFearMul: q(1.5),
  },
  {
    id: "rng_crossbow",
    kind: "ranged",
    name: "Crossbow",
    category: "bow",
    mass_kg: Math.round(3.5 * SCALE.kg),
    bulk: q(2.0),
    launchEnergy_J: 120,
    projectileMass_kg: Math.round(0.040 * SCALE.kg),
    dragCoeff_perM: q(0.004),
    dispersionQ: q(0.006),
    recycleTime_s: to.s(5.0),
    damage: PROJECTILE_DAMAGE,
    suppressionFearMul: q(1.5),
  },
  {
    id: "rng_pistol",
    kind: "ranged",
    name: "Pistol",
    category: "firearm",
    mass_kg: Math.round(1.2 * SCALE.kg),
    bulk: q(1.1),
    requiredCapabilities: ["FirearmsPropellant"],
    launchEnergy_J: 400,
    projectileMass_kg: Math.round(0.015 * SCALE.kg),
    dragCoeff_perM: q(0.002),
    dispersionQ: q(0.015),
    recycleTime_s: to.s(12.0),
    damage: PROJECTILE_DAMAGE,
    suppressionFearMul: q(2.0),
  },
  {
    id: "rng_musket",
    kind: "ranged",
    name: "Musket",
    category: "firearm",
    mass_kg: Math.round(4.5 * SCALE.kg),
    bulk: q(2.2),
    requiredCapabilities: ["FirearmsPropellant"],
    launchEnergy_J: 600,
    projectileMass_kg: Math.round(0.030 * SCALE.kg),
    dragCoeff_perM: q(0.0015),          // 0.15% loss/m
    dispersionQ: q(0.010),
    recycleTime_s: to.s(18.0),
    damage: PROJECTILE_DAMAGE,
    suppressionFearMul: q(3.0),
  },
  {
    id: "rng_plasma_rifle",
    kind: "ranged",
    name: "Plasma rifle",
    category: "firearm",
    mass_kg: Math.round(3.8 * SCALE.kg),
    bulk: q(1.8),
    requiredCapabilities: ["EnergyWeapons"],
    launchEnergy_J: 2000,
    projectileMass_kg: Math.round(0.001 * SCALE.kg),
    dragCoeff_perM: q(0.0005),          // near-negligible beam divergence
    dispersionQ: q(0.004),
    recycleTime_s: to.s(2.0),
    energyType: "plasma",               // Phase 11C: Energy channel; resisted by reflectivity
    suppressionFearMul: q(1.0),
    damage: {
      surfaceFrac: q(0.35),
      internalFrac: q(0.45),
      structuralFrac: q(0.20),
      bleedFactor: q(0.15),            // plasma cauterises, low bleed
      penetrationBias: q(0.90),
    },
  },
];

// ── Phase 11C starter items ────────────────────────────────────────────────────

/** Reflective/ablative armour items for energy and kinetic threats. */
export const STARTER_ARMOUR_11C: Armour[] = [
  {
    id: "arm_reflective",
    kind: "armour",
    name: "Reflective coating",
    mass_kg: Math.round(0.5 * SCALE.kg),
    bulk: q(0.3),
    requiredCapabilities: ["EnergyWeapons"],
    protects: channelMask(DamageChannel.Energy),
    coverageByRegion: {
      head: q(0.50), torso: q(0.80),
      leftArm: q(0.50), rightArm: q(0.50),
      leftLeg: q(0.30), rightLeg: q(0.30),
    },
    resist_J: 0 as I32,
    protectedDamageMul: q(1.0),
    reflectivity: q(0.40) as Q,         // deflects 40% of energy weapon damage
  },
  {
    id: "arm_reactive",
    kind: "armour",
    name: "Reactive plating",
    mass_kg: Math.round(3.0 * SCALE.kg),
    bulk: q(1.5),
    requiredCapabilities: ["ReactivePlating"],
    protects: channelMask(DamageChannel.Kinetic),
    coverageByRegion: {
      head: q(0.40), torso: q(0.85),
      leftArm: q(0.40), rightArm: q(0.40),
      leftLeg: q(0.20), rightLeg: q(0.20),
    },
    resist_J: 1500 as I32,
    protectedDamageMul: q(0.65),
    ablative: true,                     // degrades with use; tracked in entity.armourState
  },
];

/** Phase 11C: sensor suites that boost vision and hearing range. */
export const STARTER_SENSORS: Sensor[] = [
  {
    id: "sens_nightvision",
    kind: "sensor",
    name: "Night-vision goggles",
    mass_kg: Math.round(0.3 * SCALE.kg),
    bulk: q(1.1),
    requiredCapabilities: ["BallisticArmour"],
    visionRangeMul: q(1.5) as Q,        // +50% vision range
    hearingRangeMul: q(1.0) as Q,
  },
  {
    id: "sens_tactical",
    kind: "sensor",
    name: "Tactical sensor suite",
    mass_kg: Math.round(0.8 * SCALE.kg),
    bulk: q(1.3),
    requiredCapabilities: ["PoweredExoskeleton"],
    visionRangeMul: q(2.0) as Q,        // double vision range
    hearingRangeMul: q(1.5) as Q,       // +50% hearing range
  },
];

// ── Phase 3 extension: starter ammo types ─────────────────────────────────────

/** Armour-piercing projectile damage profile: increased penetration, lower energy. */
const AP_DAMAGE: WeaponDamageProfile = {
  surfaceFrac: q(0.10),
  internalFrac: q(0.60),
  structuralFrac: q(0.30),
  bleedFactor: q(0.50),
  penetrationBias: q(0.95),
};

/** Hollow-point projectile damage profile: maximum bleeding, lower penetration. */
const HP_DAMAGE: WeaponDamageProfile = {
  surfaceFrac: q(0.40),
  internalFrac: q(0.55),
  structuralFrac: q(0.05),
  bleedFactor: q(0.95),
  penetrationBias: q(0.20),
};

export const STARTER_AMMO: AmmoType[] = [
  {
    id: "ammo_ap",
    name: "Armour-Piercing",
    damage: AP_DAMAGE,
    launchEnergyMul: q(0.90) as Q,   // slightly lower velocity than ball
  },
  {
    id: "ammo_hv",
    name: "High-Velocity",
    launchEnergyMul: q(1.20) as Q,   // +20% muzzle energy
    dragCoeff_perM: q(0.002) as Q,   // streamlined projectile
  },
  {
    id: "ammo_hollow",
    name: "Hollow-Point",
    damage: HP_DAMAGE,
    launchEnergyMul: q(0.95) as Q,   // slightly heavier
  },
];