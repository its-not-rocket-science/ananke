import { type ChannelMask } from "./channels";
import { Q } from "./units";
import type { IndividualAttributes } from "./types";
export type TraitId = "sealed" | "nonConductive" | "distributedControl" | "noSurfaceLayer" | "noBulkMedium" | "highThermalMass" | "fragileStructure" | "reinforcedStructure" | "chemicalImmune" | "radiationHardened";
export interface TraitEffect {
    id: TraitId;
    name: string;
    description: string;
    immuneTo?: ChannelMask;
    resistantTo?: ChannelMask;
    mult?: Partial<{
        actuatorScale: Q;
        structureScale: Q;
        conversionEfficiency: Q;
        controlQuality: Q;
        stability: Q;
        surfaceIntegrity: Q;
        bulkIntegrity: Q;
        structureIntegrity: Q;
        concussionTolerance: Q;
        shockTolerance: Q;
        heatTolerance: Q;
        coldTolerance: Q;
        fatigueRate: Q;
        recoveryRate: Q;
    }>;
}
export declare const TRAITS: Record<TraitId, TraitEffect>;
export interface TraitProfile {
    traits: TraitId[];
    immuneMask: ChannelMask;
    resistantMask: ChannelMask;
}
export declare function buildTraitProfile(traits: TraitId[]): TraitProfile;
export declare function applyTraitsToAttributes(a: IndividualAttributes, traits: TraitId[]): IndividualAttributes;
