import { q, qMul, type Q } from "../../../units.js";
import { TraceKinds } from "../../kinds.js";
import type { TraceSink } from "../../trace.js";
import type { WorldState } from "../../world.js";

const SWING_MOMENTUM_DECAY = q(0.95) as Q;

export function runCooldownsPhase(world: WorldState, trace: TraceSink): void {
  for (const e of world.entities) {
    e.action.attackCooldownTicks = Math.max(0, e.action.attackCooldownTicks - 1);
    e.action.defenceCooldownTicks = Math.max(0, e.action.defenceCooldownTicks - 1);
    e.action.grappleCooldownTicks = Math.max(0, e.action.grappleCooldownTicks - 1);
    e.action.shootCooldownTicks = Math.max(0, e.action.shootCooldownTicks - 1);
    e.action.swingMomentumQ = qMul(e.action.swingMomentumQ, SWING_MOMENTUM_DECAY) as Q;

    if (e.action.capabilityCooldowns) {
      for (const [key, ticks] of e.action.capabilityCooldowns) {
        if (ticks <= 1) e.action.capabilityCooldowns.delete(key);
        else e.action.capabilityCooldowns.set(key, ticks - 1);
      }
    }

    e.condition.standBlockedTicks = Math.max(0, e.condition.standBlockedTicks - 1);
    e.condition.unconsciousTicks = Math.max(0, e.condition.unconsciousTicks - 1);
    e.condition.suppressedTicks = Math.max(0, e.condition.suppressedTicks - 1);
    e.condition.blindTicks = Math.max(0, e.condition.blindTicks - 1);
    if (e.action.staggerTicks) e.action.staggerTicks = Math.max(0, e.action.staggerTicks - 1);
    e.condition.rallyCooldownTicks = Math.max(0, e.condition.rallyCooldownTicks - 1);

    if (e.action.weaponBindTicks > 0) {
      e.action.weaponBindTicks = Math.max(0, e.action.weaponBindTicks - 1);
      if (e.action.weaponBindTicks === 0) {
        const partnerId = e.action.weaponBindPartnerId;
        e.action.weaponBindPartnerId = 0;
        if (partnerId !== 0 && e.id < partnerId) {
          trace.onEvent({ kind: TraceKinds.WeaponBindBreak, tick: world.tick, entityId: e.id, partnerId, reason: "timeout" });
        }
      }
    }
  }
}
