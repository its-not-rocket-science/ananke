import type { Entity } from "../entity";
import type { WorldIndex } from "../indexing";
import type { SpatialIndex } from "../spatial";
import { perceiveLocal } from "./perception";
import type { AIPolicy } from "./types";
import { SCALE } from "../../units";
import { eventSeed } from "../seeds";

export function pickTarget(
  worldSeed: number,
  tick: number,
  self: Entity,
  index: WorldIndex,
  spatial: SpatialIndex,
  policy: AIPolicy
): Entity | undefined {
  const ai = self.ai ?? { focusTargetId: 0, retargetCooldownTicks: 0 };

  const focused = ai.focusTargetId !== 0 ? index.byId.get(ai.focusTargetId) : undefined;

  // keep focus if still valid and cooldown active
  if (focused && !focused.injury.dead && ai.retargetCooldownTicks > 0) return focused;

  const p = perceiveLocal(self, index, spatial, Math.trunc(6 * SCALE.m), 24);
  if (p.enemies.length === 0) return undefined;

  // Stickiness: prefer keeping previous target if present and alive
  if (focused && !focused.injury.dead) {
    const seed = eventSeed(worldSeed, tick, self.id, ai.focusTargetId, 0xF0C05);
    const rollQ = (seed % SCALE.Q) as any;
    if (rollQ < policy.focusStickinessQ) return focused;
  }

  // Otherwise choose nearest (already sorted)
  return p.enemies[0];
}

export function updateFocus(self: Entity, target: Entity | undefined, policy: AIPolicy): void {
  if (!self.ai) self.ai = { focusTargetId: 0, retargetCooldownTicks: 0 };

  if (!target) {
    self.ai.focusTargetId = 0;
    self.ai.retargetCooldownTicks = 0;
    return;
  }

  self.ai.focusTargetId = target.id;
  self.ai.retargetCooldownTicks = policy.retargetCooldownTicks;
}