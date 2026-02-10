import type { I32, Q } from "./units";
export interface Morphology {
    stature_m: I32;
    mass_kg: I32;
    actuatorMass_kg: I32;
    actuatorScale: Q;
    structureScale: Q;
    reachScale: Q;
}
export interface Performance {
    peakForce_N: I32;
    peakPower_W: I32;
    continuousPower_W: I32;
    reserveEnergy_J: I32;
    conversionEfficiency: Q;
}
export interface Control {
    controlQuality: Q;
    reactionTime_s: I32;
    stability: Q;
    fineControl: Q;
}
export interface Resilience {
    surfaceIntegrity: Q;
    bulkIntegrity: Q;
    structureIntegrity: Q;
    distressTolerance: Q;
    shockTolerance: Q;
    concussionTolerance: Q;
    heatTolerance: Q;
    coldTolerance: Q;
    fatigueRate: Q;
    recoveryRate: Q;
}
export interface IndividualAttributes {
    morphology: Morphology;
    performance: Performance;
    control: Control;
    resilience: Resilience;
}
export interface EnergyState {
    reserveEnergy_J: I32;
    fatigue: Q;
}
