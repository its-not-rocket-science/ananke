import type { IndividualAttributes, EnergyState, PersonalityTraits } from "../types.js";
import type { WillpowerState } from "../competence/willpower.js";
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
import type { ExtendedSenses } from "./sensory-extended.js";
import type { ActiveIngestedToxin, CumulativeExposureRecord, WithdrawalState } from "./systemic-toxicology.js";
import type { TraumaState } from "./wound-aging.js";
import type { DiseaseState, ImmunityRecord, VaccinationRecord } from "./disease.js";
import type { AgeState } from "./aging.js";
import type { SleepState } from "./sleep.js";
import type { MountState } from "./mount.js";

/** Phase 12B: state for an active concentration aura (castTime_ticks = -1 effect). */
export interface ConcentrationState {
  sourceId: string;
  effectId: string;
  targetId?: number;
}

import { Q } from "../units.js";
import { CompiledAnatomyModel } from "../anatomy/anatomy-contracts.js";
import { AnatomyHelperRegistry, createAnatomyHelpers } from "../anatomy/anatomy-helpers.js";
import { compileAnatomyDefinition } from "../anatomy/anatomy-compiler.js";

export type GrapplePosition = "standing" | "prone" | "pinned";

export interface GrappleState {
  holdingTargetId: number;   // 0 if none
  heldByIds: number[];       // sorted ascending for determinism
  gripQ: Q;                  // 0..1
  position: GrapplePosition; // Phase 2A: positional control
}

/**
 * Core entity shape.
 *
 * Fields are annotated with one of three stability tiers:
 *
 * - **`@core`** — Required by `stepWorld` on every tick.  Always present; never optional.
 *   Removing or renaming any `@core` field is a Tier 1 breaking change.
 *
 * - **`@subsystem(name)`** — Optional state consumed only by a specific sub-module
 *   (`src/sim/sleep.ts`, `src/sim/aging.ts`, etc.).  Omitting a subsystem field disables that
 *   module's behaviour for this entity; the kernel continues to run correctly without it.
 *   Adding new optional subsystem fields is never a breaking change.
 *
 * - **`@extension`** — Not consumed by Ananke at all.  Reserved for host-application data
 *   that travels alongside entities (e.g. renderer-side metadata, network session IDs).
 *   Currently no built-in fields carry this tag; hosts may add their own `?` fields freely.
 */
export interface Entity {
  /** @core Unique entity identifier — must be stable across ticks. */
  id: number;
  /** @core Combat team / allegiance used by attack resolution and AI targeting. */
  teamId: number;

  /** @core Physical and cognitive capabilities (mass, force, reaction time, etc.). */
  attributes: IndividualAttributes;
  /** @core Energy reserve and fatigue accumulator — drained by movement and combat. */
  energy: EnergyState;

  /**
   * @subsystem(willpower) Cognitive stamina reserve — depleted by sustained concentration,
   * replenished by rest.  Consumed by `src/competence/willpower.ts`.
   */
  willpower?: WillpowerState;

  /** @core Equipped items: weapons, armour, held objects. */
  loadout: Loadout;
  /** @core Permanent trait flags that modify combat and skill outcomes. */
  traits: TraitId[];

  /**
   * @subsystem(skills) Per-skill proficiency map.
   * Consumed by skill-contest resolution in `src/sim/combat.ts` and `src/sim/ai/`.
   */
  skills?: SkillMap;

  /**
   * @subsystem(anatomy) Body plan defining injury segments, mass distribution, and
   * data-driven impairment tables.  Consumed by `src/sim/injury.ts`, `src/model3d.ts`,
   * and the anatomy compiler.
   */
  bodyPlan?: BodyPlan;

  /**
   * @subsystem(pharmacology) Active pharmacological substances currently in the bloodstream.
   * Consumed by `src/sim/substance.ts`.
   */
  substances?: ActiveSubstance[];

  /**
   * @subsystem(nutrition) Consumable food items and counts.
   * Consumed by the nutrition accumulator in `src/sim/kernel.ts` when present.
   */
  foodInventory?: Map<string, number> | undefined;

  /**
   * @subsystem(anatomy) Molting state for arthropod-type entities.
   * Active molt: segments in `softeningSegments` take reduced kinetic structural damage.
   * When `ticksRemaining` reaches 0, `regeneratesViaMolting` segments receive partial repair.
   * Consumed by `src/sim/injury.ts`.
   */
  molting?: {
    active: boolean;
    ticksRemaining: number;
    /** Segment IDs currently softening — take reduced kinetic structural damage (×q(0.70)). */
    softeningSegments: string[];
  };

  /** @core World-space position in fixed-point metres (`SCALE.m` = 1 m). */
  position_m: Vec3;
  /** @core Velocity in fixed-point metres per second (`SCALE.mps` = 1 m/s). */
  velocity_mps: Vec3;

  /** @core Movement and defence intent derived from the previous tick's commands. */
  intent: IntentState;
  /** @core Attack cooldowns, swing momentum, weapon-bind state. */
  action: ActionState;

  /** @core Physiological condition: fear, morale, sensory modifiers, fatigue, thermal. */
  condition: ConditionState;
  /** @core Per-region damage, shock, consciousness, fluid loss, death flag. */
  injury: InjuryState;

  /** @core Active grapple relationships, grip strength, positional lock. */
  grapple: GrappleState;

  /**
   * @subsystem(ai) AI decision state (target selection, last-seen position, threat map).
   * Consumed by `src/sim/ai/system.ts`; absent for player-controlled or scripted entities.
   */
  ai?: AIState;

  /**
   * @subsystem(capability) Attached capability sources (mana pools, fusion cells, divine
   * reserves).  Consumed by `src/sim/capability.ts`.
   */
  capabilitySources?: CapabilitySource[];

  /**
   * @subsystem(armour) Mutable resist state for ablative armour items.
   * Key = item id; value = remaining resist in joules.
   * Initialised automatically by `stepWorld` for entities with ablative items.
   */
  armourState?: Map<string, { resistRemaining_J: number }>;

  /**
   * @subsystem(capability) In-flight capability activation — cleared on completion or
   * concentration break.  Consumed by `src/sim/capability.ts`.
   */
  pendingActivation?: PendingActivation;

  /**
   * @subsystem(capability) Active concentration aura — cleared when willpower reserve
   * depletes or shock interrupts.  Consumed by `src/sim/capability.ts`.
   */
  activeConcentration?: ConcentrationState;

  /**
   * @subsystem(faction) Faction membership identifier.
   * Consumed by `src/faction.ts` and AI targeting.
   */
  faction?: string;

  /**
   * @subsystem(party) Adventuring party membership identifier.
   * Consumed by `src/party.ts` for morale and formation bonuses.
   */
  party?: string | undefined;

  /**
   * @subsystem(faction) Entity-level faction-standing overrides.
   * Map<factionId, Q> — takes priority over faction-default standings when set.
   * Consumed by `src/faction.ts`.
   */
  reputations?: Map<string, number>;

  /**
   * @subsystem(thermoregulation) Species-level physiological overrides.
   * Consumed by `src/sim/thermoregulation.ts` for heat/cold stress modelling.
   */
  physiology?: SpeciesPhysiology | undefined;

  /**
   * @subsystem(toxicology) Active venom/toxin injections — ticked at 1 Hz.
   * Consumed by `src/sim/toxicology.ts`.
   */
  activeVenoms?: ActiveVenom[];

  /**
   * @subsystem(anatomy) Per-limb state for multi-limb entities (octopoids, arachnids).
   * Consumed by `src/sim/limb.ts`.
   */
  limbStates?: LimbState[];

  /**
   * @subsystem(ai) Individual AI personality traits (aggression, caution, loyalty).
   * Consumed by `src/sim/ai/personality.ts`.
   */
  personality?: PersonalityTraits;

  /**
   * @subsystem(sensory) Extended sensory modalities (echolocation, electroreception,
   * olfaction).  Consumed by `src/sim/sensory-extended.ts`.
   */
  extendedSenses?: ExtendedSenses;

  /**
   * @subsystem(toxicology) Active ingested toxins (alcohol, sedatives, alkaloids, heavy
   * metals, radiation).  Consumed by `src/sim/systemic-toxicology.ts`.
   */
  activeIngestedToxins?: ActiveIngestedToxin[];

  /**
   * @subsystem(toxicology) Cumulative lifetime dose records for heavy metals and radiation.
   * Consumed by `src/sim/systemic-toxicology.ts`.
   */
  cumulativeExposure?: CumulativeExposureRecord[];

  /**
   * @subsystem(toxicology) Active withdrawal states from addictive toxin removal.
   * Consumed by `src/sim/systemic-toxicology.ts`.
   */
  withdrawal?: WithdrawalState[];

  /**
   * @subsystem(wound-aging) PTSD-like trauma state accumulated from severe shock events.
   * Reduces effective fear threshold via `deriveFearThresholdMul`.
   * Consumed by `src/sim/wound-aging.ts`.
   */
  traumaState?: TraumaState;

  /**
   * @subsystem(disease) Active systemic disease states (incubating or symptomatic).
   * Consumed by `src/sim/disease.ts`.
   */
  activeDiseases?: DiseaseState[];

  /**
   * @subsystem(disease) Post-recovery immunity records preventing re-infection.
   * Consumed by `src/sim/disease.ts`.
   */
  immunity?: ImmunityRecord[];

  /**
   * @subsystem(disease/seir) Phase 73: vaccination records granting partial-efficacy protection.
   * Consumed by `computeTransmissionRisk` in `src/sim/disease.ts`.
   */
  vaccinations?: VaccinationRecord[];

  /**
   * @subsystem(aging) Elapsed life-seconds for aging calculations.
   * Consumed by `src/sim/aging.ts`.
   */
  age?: AgeState;

  /**
   * @subsystem(sleep) Sleep-phase state, debt accumulator, and continuous wake time.
   * Consumed by `src/sim/sleep.ts`.
   */
  sleep?: SleepState;

  /**
   * @subsystem(mount) Rider/mount pair state for cavalry and mounted combat.
   * Consumed by `src/sim/mount.ts`.
   */
  mount?: MountState;

  /**
   * @subsystem(anatomy) Compiled anatomy model — cached on first access by
   * `ensureAnatomyRuntime`.  Do not set manually.
   */
  compiledAnatomy?: CompiledAnatomyModel;

  /**
   * @subsystem(anatomy) Anatomy helper registry — cached on first access by
   * `ensureAnatomyRuntime`.  Do not set manually.
   */
  anatomyHelpers?: AnatomyHelperRegistry;
}

export function ensureAnatomyRuntime(e: Entity): {
  model?: CompiledAnatomyModel;
  helpers?: AnatomyHelperRegistry;
} {
  if (!e.bodyPlan) return {};

  if (!e.compiledAnatomy) {
    const compiled = compileAnatomyDefinition(e.bodyPlan);
    if (!compiled.ok) return {};
    e.compiledAnatomy = compiled.model!;
  }

  if (!e.anatomyHelpers) {
    e.anatomyHelpers = createAnatomyHelpers(e.compiledAnatomy);
  }

  return {
    model: e.compiledAnatomy,
    helpers: e.anatomyHelpers,
  };
}