import { q, type Q } from "../../../units.js";
import type { CapabilityEffect } from "../../capability.js";
import type { Entity } from "../../entity.js";
import { TraceKinds } from "../../kinds.js";
import { stepConcentration } from "../concentration.js";
import type { TraceSink } from "../../trace.js";
import type { WorldState } from "../../world.js";

const CAST_INTERRUPT_SHOCK: Q = q(0.30) as Q;

export interface CapabilityPhaseDeps {
  applyCapabilityEffect: (
    world: WorldState,
    actor: Entity,
    targetId: number | undefined,
    effect: CapabilityEffect,
    trace: TraceSink,
    tick: number,
  ) => void;
}

export function runCapabilityPhase(
  world: WorldState,
  trace: TraceSink,
  deps: CapabilityPhaseDeps,
): void {
  for (const e of world.entities) {
    if (!e.pendingActivation || e.injury.dead) continue;
    if (e.injury.shock >= CAST_INTERRUPT_SHOCK) {
      trace.onEvent({ kind: TraceKinds.CastInterrupted, tick: world.tick, entityId: e.id });
      delete e.pendingActivation;
    } else if (world.tick >= e.pendingActivation.resolveAtTick) {
      const src = e.capabilitySources?.find(s => s.id === e.pendingActivation!.sourceId);
      const eff = src?.effects.find(ef => ef.id === e.pendingActivation!.effectId);
      if (src && eff) {
        deps.applyCapabilityEffect(world, e, e.pendingActivation.targetId, eff, trace, world.tick);
        trace.onEvent({ kind: TraceKinds.CapabilityActivated, tick: world.tick, entityId: e.id, sourceId: src.id, effectId: eff.id });
        if (eff.sustainedTicks && eff.sustainedTicks > 1) {
          e.action.sustainedEmission = {
            sourceId: src.id,
            effectId: eff.id,
            ...(e.pendingActivation.targetId !== undefined ? { targetId: e.pendingActivation.targetId } : {}),
            remainingTicks: eff.sustainedTicks - 1,
          };
        }
      }
      delete e.pendingActivation;
    }
  }

  for (const e of world.entities) {
    if (!e.activeConcentration || e.injury.dead) continue;
    stepConcentration(e, world, trace, world.tick);
  }

  for (const e of world.entities) {
    if (!e.action.sustainedEmission || e.injury.dead) continue;
    const em = e.action.sustainedEmission;
    if (e.injury.shock >= CAST_INTERRUPT_SHOCK) {
      trace.onEvent({ kind: TraceKinds.CastInterrupted, tick: world.tick, entityId: e.id });
      delete e.action.sustainedEmission;
      continue;
    }
    const src = e.capabilitySources?.find(s => s.id === em.sourceId);
    const eff = src?.effects.find(ef => ef.id === em.effectId);
    if (!src || !eff) {
      delete e.action.sustainedEmission;
      continue;
    }
    const isBoundless = src.regenModel.type === "boundless";
    if (!isBoundless) {
      if (src.reserve_J < eff.cost_J) {
        delete e.action.sustainedEmission;
        continue;
      }
      src.reserve_J -= eff.cost_J;
    }
    deps.applyCapabilityEffect(world, e, em.targetId, eff, trace, world.tick);
    em.remainingTicks -= 1;
    if (em.remainingTicks <= 0) {
      delete e.action.sustainedEmission;
    }
  }
}
