import type { Entity } from "./entity.js";

export interface WorldState {
  tick: number;
  seed: number;        // deterministic RNG seed

  entities: Entity[];
}