import { Q } from "./units";
import type { IndividualAttributes, EnergyState } from "./types";
import type { Loadout } from "./equipment";
import { type CarryRules } from "./equipment";
export interface MovementCaps {
    maxSprintSpeed_mps: number;
    maxAcceleration_mps2: number;
    jumpHeight_m: number;
}
export interface DeriveContext {
    tractionCoeff: Q;
    carryRules?: CarryRules;
}
export declare function derivePeakForceEff_N(a: IndividualAttributes): number;
export declare function deriveMaxAcceleration_mps2(a: IndividualAttributes, tractionCoeff: Q): number;
export declare function deriveMaxSprintSpeed_mps(a: IndividualAttributes): number;
export declare function deriveJumpHeight_m(a: IndividualAttributes, reserveSpend_J: number): number;
export declare function deriveMovementCaps(a: IndividualAttributes, loadout: Loadout, ctx: DeriveContext): MovementCaps;
export declare function stepEnergyAndFatigue(a: IndividualAttributes, state: EnergyState, loadout: Loadout, demandedPower_W: number, dt_s: number, ctx: DeriveContext): void;
