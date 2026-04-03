import type { Entity } from "./entity.js";
import type { FieldEffect } from "./capability.js";
import { SensoryEnvironment } from "./sensory.js";
import { FactionRegistry } from "../faction.js";
import { PartyRegistry } from "../party.js";
import { RelationshipGraph } from "../relationships.js";

export interface WorldRuntimeState {
  sensoryEnv?: SensoryEnvironment;
  factionRegistry?: FactionRegistry;
  partyRegistry?: PartyRegistry;
  relationshipGraph?: RelationshipGraph;
  nutritionAccum?: number;
  contentRegistry?: {
    packs: Map<string, unknown>;
    archetypes: Map<string, unknown>;
    weapons: Map<string, unknown>;
    armour: Map<string, unknown>;
    terrain: Map<string, unknown>;
  };
}

/**
 * Top-level simulation container.
 *
 * Fields are annotated with stability tiers identical to `Entity`:
 * - **`@core`** — required by `stepWorld` every tick.
 * - **`@subsystem(name)`** — optional state consumed only by a specific sub-module.
 */
export interface WorldState {
  /** @core Current tick count; incremented by `stepWorld`. */
  tick: number;
  /** @core Deterministic RNG seed — same seed + same commands → identical output. */
  seed: number;

  /** @core All live and dead entities.  Do not splice manually; use `stepWorld`. */
  entities: Entity[];

  /**
   * @subsystem(capability) Active suppression zones and field-effect modifiers
   * (e.g., mana-null zones, buff auras).  Consumed by `src/sim/capability.ts`.
   */
  activeFieldEffects?: FieldEffect[];

  /**
   * @subsystem(runtime) Explicit host/runtime state consumed by optional subsystems.
   * Kept separate from core deterministic world data.
   */
  runtimeState?: WorldRuntimeState;
}
