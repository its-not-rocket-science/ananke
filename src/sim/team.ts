import type { Entity } from "./entity.js";

export function isEnemy(a: Entity, b: Entity): boolean {
  return a.teamId !== b.teamId;
}