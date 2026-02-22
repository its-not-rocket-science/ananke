import type { IndividualAttributes, EnergyState } from "../types.js";
import type { Loadout } from "../equipment.js";
import type { TraitId } from "../traits.js";

import type { Vec3 } from "./vec3.js";
import type { ConditionState } from "./condition.js";
import type { InjuryState } from "./injury.js";
import type { IntentState, AIState } from "./intent.js";
import type { ActionState } from "./action.js";

import { Q } from "../units.js";

export interface GrappleState {
  holdingTargetId: number;   // 0 if none
  heldByIds: number[];       // sorted ascending for determinism
  gripQ: Q;                  // 0..1
}

export interface Entity {
  id: number;
  teamId: number;

  attributes: IndividualAttributes;
  energy: EnergyState;

  loadout: Loadout;
  traits: TraitId[];

  position_m: Vec3;
  velocity_mps: Vec3;

  intent: IntentState;
  action: ActionState;

  condition: ConditionState;
  injury: InjuryState;

  grapple: GrappleState;

  ai?: AIState;
}
