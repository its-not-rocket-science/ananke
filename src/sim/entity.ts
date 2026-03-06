import type { IndividualAttributes, EnergyState } from "../types.js";
import type { Loadout } from "../equipment.js";
import type { TraitId } from "../traits.js";
import type { SpeciesPhysiology } from "../species.js";

import type { Vec3 } from "./vec3.js";
import type { ConditionState } from "./condition.js";
import type { InjuryState } from "./injury.js";
import type { IntentState, AIState } from "./intent.js";
import type { ActionState } from "./action.js";
import type { SkillMap } from "./skills.js";
import type { BodyPlan } from "./bodyplan.js";
import type { ActiveSubstance } from "./substance.js";
import type { CapabilitySource, PendingActivation } from "./capability.js";
import type { ActiveVenom } from "./toxicology.js";
import type { LimbState } from "./limb.js";

/** Phase 12B: state for an active concentration aura (castTime_ticks = -1 effect). */
export interface ConcentrationState {
  sourceId: string;
  effectId: string;
  targetId?: number;
}

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

  foodInventory?: Map<string, number> | undefined; // optional Phase 12: tracks consumable food items and counts

  /**
   * Phase 8B: molting state for arthropod-type entities.
   * Active molt: segments in `softeningSegments` take reduced kinetic structural damage.
   * When `ticksRemaining` reaches 0, `active` is set to false and `regeneratesViaMolting`
   * segments receive partial structural repair (−q(0.10) per cycle).
   */
  molting?: {
    active: boolean;
    ticksRemaining: number;
    /** Segment IDs currently softening — these take reduced kinetic structural damage (×q(0.70)). */
    softeningSegments: string[];
  };

  position_m: Vec3;
  velocity_mps: Vec3;

  intent: IntentState;
  action: ActionState;

  condition: ConditionState;
  injury: InjuryState;

  grapple: GrappleState;

  ai?: AIState;

  /** Phase 12: attached capability sources (mana pools, fusion cells, divine reserves, …). */
  capabilitySources?: CapabilitySource[];

  /**
   * Phase 11C: mutable resist state for ablative armour items.
   * Key = item id; value = remaining resist in joules.
   * Initialized automatically by stepWorld for entities with ablative items.
   */
  armourState?: Map<string, { resistRemaining_J: number }>;

  /** Phase 12: in-flight cast — cleared on completion or concentration break. */
  pendingActivation?: PendingActivation;

  /** Phase 12B: active concentration aura — cleared when reserve depletes or shock interrupts. */
  activeConcentration?: ConcentrationState;

  /** Phase 24: faction this entity belongs to (factionId string). */
  faction?: string;

  /**
   * Phase 24: entity-level standing overrides toward specific factions.
   * Map<factionId, Q> — takes priority over faction-default standings when set.
   */
  reputations?: Map<string, number>;

  /** Phase 31: species-level physiological overrides (thermoregulation, nutrition). */
  physiology?: SpeciesPhysiology | undefined;

  /** Phase 32C: active venom/toxin injections — ticked at 1 Hz by stepToxicology. */
  activeVenoms?: ActiveVenom[];

  /** Phase 32B: per-limb state for multi-limb entities (octopoids, arachnids, etc.). */
  limbStates?: LimbState[];
}
