import type { Entity } from "./entity";

export function isEnemy(a: Entity, b: Entity): boolean {
  return a.teamId !== b.teamId;
}