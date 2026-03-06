import type { Entity } from "./entity.js";
import type { FieldEffect } from "./capability.js";
import { SensoryEnvironment } from "./sensory.js";
import { FactionRegistry } from "../faction.js";

export interface WorldState {
  tick: number;
  seed: number;        // deterministic RNG seed

  entities: Entity[];

  /** Phase 12: active suppression zones and field modifiers. */
  activeFieldEffects?: FieldEffect[];

  __sensoryEnv?: SensoryEnvironment
  __factionRegistry?: FactionRegistry;
  __nutritionAccum?:number;
}