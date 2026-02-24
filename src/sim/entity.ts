import type { IndividualAttributes, EnergyState } from "../types.js";
import type { Loadout } from "../equipment.js";
import type { TraitId } from "../traits.js";

import type { Vec3 } from "./vec3.js";
import type { ConditionState } from "./condition.js";
import type { InjuryState } from "./injury.js";
import type { IntentState, AIState } from "./intent.js";
import type { ActionState } from "./action.js";
import type { SkillMap } from "./skills.js";
import type { BodyPlan } from "./bodyplan.js";
import type { ActiveSubstance } from "./substance.js";

import { Q } from "../units.js";

export type GrapplePosition = "standing" | "prone" | "pinned";

export interface GrappleState {
  holdingTargetId: number;   // 0 if none
  heldByIds: number[];       // sorted ascending for determinism
  gripQ: Q;                  // 0..1
  position: GrapplePosition; // Phase 2A: positional control
}

export interface Entity {
  id: number;
  teamId: number;

  attributes: IndividualAttributes;
  energy: EnergyState;

  loadout: Loadout;
  traits: TraitId[];

  /** Phase 7: optional skill map — consumes values from the host application. */
  skills?: SkillMap;

  /** Phase 8: optional body plan — enables data-driven injury and impairment. */
  bodyPlan?: BodyPlan;

  /** Phase 10: active pharmacological substances (ingested/injected by the host application). */
  substances?: ActiveSubstance[];

  position_m: Vec3;
  velocity_mps: Vec3;

  intent: IntentState;
  action: ActionState;

  condition: ConditionState;
  injury: InjuryState;

  grapple: GrappleState;

  ai?: AIState;
}
