import type { Entity } from "./entity";

export interface WorldState {
  tick: number;
  seed: number;        // deterministic RNG seed

  entities: Entity[];
}