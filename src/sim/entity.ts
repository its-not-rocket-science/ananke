import type { IndividualAttributes, EnergyState } from "../types";
import type { Loadout } from "../equipment";
import type { TraitId } from "../traits";

import type { Vec3 } from "./vec3";
import type { ConditionState } from "./condition";
import type { InjuryState } from "./injury";
import type { IntentState } from "./intent";
import type { ActionState } from "./action";

export interface Entity {
  id: number;

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
}
