
import { applyCapabilityEffect } from "../kernel.js";
import type { WorldState } from "../world.js";
import type { TraceSink } from "../trace.js";
import { TraceKinds } from "../kinds.js";
import { q, type Q } from "../../units.js";
import type { Entity } from "../entity.js";

/**
 * Phase 12B: advance a concentration aura for one tick.
 * Deducts cost_J from the source and applies the effect payload.
 * Clears activeConcentration if reserve is exhausted or entity is shocked.
 */
export function stepConcentration(e: Entity, world: WorldState, trace: TraceSink, tick: number): void {
  const { sourceId, effectId, targetId } = e.activeConcentration!;
  const source = e.capabilitySources?.find(s => s.id === sourceId);
  const effect = source?.effects.find(ef => ef.id === effectId);
  const isBoundless = source?.regenModel.type === "boundless";

  const interrupted =
    !source || !effect ||
    (!isBoundless && source.reserve_J < effect.cost_J) ||
    e.injury.shock >= (q(0.30) as Q);

  if (interrupted) {
    delete e.activeConcentration;
    trace.onEvent({ kind: TraceKinds.CastInterrupted, tick, entityId: e.id });
    return;
  }

  if (!isBoundless) source!.reserve_J -= effect!.cost_J;
  applyCapabilityEffect(world, e, targetId, effect!, trace, tick);
}
