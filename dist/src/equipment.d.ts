import type { I32, Q } from "./units";
import type { ChannelMask } from "./channels";
import type { IndividualAttributes } from "./types";
export type ItemId = string;
export interface ItemBase {
    id: ItemId;
    name: string;
    mass_kg: I32;
    bulk: Q;
}
export interface Weapon extends ItemBase {
    kind: "weapon";
    reach_m?: I32;
    handlingMul?: Q;
    readyTime_s?: I32;
    strikeEffectiveMassFrac?: Q;
    strikeSpeedMul?: Q;
}
export interface Armour extends ItemBase {
    kind: "armour";
    protects: ChannelMask;
    protectedDamageMul: Q;
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
export declare const DEFAULT_CARRY_RULES: CarryRules;
export declare function computeLoadoutTotals(loadout: Loadout, armourIsWorn?: boolean): EncumbranceTotals;
export declare function deriveCarryCapacityMass_kg(a: IndividualAttributes, rules?: CarryRules): I32;
export declare function computeEncumbrance(a: IndividualAttributes, loadout: Loadout, rules?: CarryRules): {
    totals: EncumbranceTotals;
    penalties: EncumbrancePenalties;
};
export interface ProtectionProfile {
    protects: ChannelMask;
    protectedDamageMul: Q;
    mobilityMul: Q;
    fatigueMul: Q;
}
export declare function deriveArmourProfile(loadout: Loadout): ProtectionProfile;
export declare const STARTER_WEAPONS: Weapon[];
export declare const STARTER_ARMOUR: Armour[];
