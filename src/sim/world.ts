import type { Entity } from "./entity.js";
import type { FieldEffect } from "./capability.js";
import { SensoryEnvironment } from "./sensory.js";
import { FactionRegistry } from "../faction.js";
import { PartyRegistry } from "../party.js";
import { RelationshipGraph } from "../relationships.js";

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
   * @subsystem(sensory) Ambient lighting and visibility environment.
   * Consumed by `src/sim/sensory.ts` when provided.  Prefixed `__` to discourage
   * direct access — use the sensory API instead.
   */
  __sensoryEnv?: SensoryEnvironment;

  /**
   * @subsystem(faction) Global faction-standing registry.
   * Consumed by `src/faction.ts` and AI targeting.
   */
  __factionRegistry?: FactionRegistry;

  /**
   * @subsystem(party) Global party registry.
   * Consumed by `src/party.ts` for morale and formation bonuses.
   */
  __partyRegistry?: PartyRegistry;

  /**
   * @subsystem(relationships) Inter-entity relationship graph.
   * Consumed by `src/relationships.ts`.
   */
  __relationshipGraph?: RelationshipGraph;

  /**
   * @subsystem(nutrition) Cross-tick nutrition accumulator.
   * Consumed by the nutrition sub-step in `src/sim/kernel.ts`.
   */
  __nutritionAccum?: number;
}