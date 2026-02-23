import type { Entity } from "../entity.js";
import type { WorldIndex } from "../indexing.js";
import type { SpatialIndex } from "../spatial.js";
import { perceiveLocal } from "./perception.js";
import type { AIPolicy } from "./types.js";
import { SCALE } from "../../units.js";
import { eventSeed } from "../seeds.js";
import { DEFAULT_PERCEPTION, DEFAULT_SENSORY_ENV, type SensoryEnvironment } from "../sensory.js";

export function pickTarget(
  worldSeed: number,
  tick: number,
  self: Entity,
  index: WorldIndex,
  spatial: SpatialIndex,
  policy: AIPolicy,
  env: SensoryEnvironment = DEFAULT_SENSORY_ENV,
): Entity | undefined {
  const ai = self.ai ?? { focusTargetId: 0, retargetCooldownTicks: 0, decisionCooldownTicks: 0 };

  const focused = ai.focusTargetId !== 0 ? index.byId.get(ai.focusTargetId) : undefined;

  // keep focus if still valid and cooldown active
  if (focused && !focused.injury.dead && ai.retargetCooldownTicks > 0) return focused;

  // Phase 4: use entity's own threat horizon as perception radius
  const perc = (self.attributes as any).perception ?? DEFAULT_PERCEPTION;
  const perceptionRadius = perc.threatHorizon_m;

  const p = perceiveLocal(self, index, spatial, perceptionRadius, perc.attentionDepth, env);
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
  if (!self.ai) self.ai = { focusTargetId: 0, retargetCooldownTicks: 0, decisionCooldownTicks: 0 };

  if (!target) {
    self.ai.focusTargetId = 0;
    self.ai.retargetCooldownTicks = 0;
    return;
  }

  self.ai.focusTargetId = target.id;
  self.ai.retargetCooldownTicks = policy.retargetCooldownTicks;
}