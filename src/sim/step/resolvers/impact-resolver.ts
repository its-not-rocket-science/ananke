import { computeKnockback, applyKnockback } from "../../knockback.js";
import { computeTemporaryCavityMul, computeCavitationBleed } from "../../hydrostatic.js";
import { TraceKinds } from "../../kinds.js";
import type { TraceSink } from "../../trace.js";
import type { WorldState } from "../../world.js";
import type { WorldIndex } from "../../indexing.js";
import type { ImpactEvent } from "../../events.js";
import type { Weapon } from "../../../equipment.js";

export interface ImpactResolverDeps {
  applyImpactToInjury: (
    target: import("../../entity.js").Entity,
    wpn: Weapon,
    energy_J: number,
    region: string,
    armoured: boolean,
    trace: TraceSink,
    tick: number,
    tempCavityMul_Q?: number,
  ) => void;
}

export function applyResolvedImpacts(
  world: WorldState,
  index: WorldIndex,
  impacts: readonly ImpactEvent[],
  trace: TraceSink,
  deps: ImpactResolverDeps,
): void {
  for (const ev of impacts) {
    const target = index.byId.get(ev.targetId);
    if (!target || target.injury.dead) continue;

    let effectiveEnergy = ev.energy_J;
    if ((target.condition.shieldReserve_J ?? 0) > 0 &&
        target.condition.shieldExpiry_tick !== undefined &&
        world.tick <= target.condition.shieldExpiry_tick) {
      const absorbed = Math.min(target.condition.shieldReserve_J!, effectiveEnergy);
      target.condition.shieldReserve_J! -= absorbed;
      effectiveEnergy -= absorbed;
    }

    if (effectiveEnergy > 0) {
      const region = ev.region;
      const tempCavMul = ev.v_impact_mps
        ? computeTemporaryCavityMul(ev.v_impact_mps, region)
        : undefined;
      deps.applyImpactToInjury(
        target,
        ev.wpn,
        effectiveEnergy,
        region,
        ev.protectedByArmour,
        trace,
        world.tick,
        tempCavMul,
      );
      if (ev.v_impact_mps) {
        const rs = target.injury.byRegion[region];
        if (rs) {
          rs.bleedingRate = computeCavitationBleed(ev.v_impact_mps, rs.bleedingRate, region);
        }
      }
    }

    if (effectiveEnergy > 0 && (ev.massEff_kg ?? 0) > 0) {
      const attacker = index.byId.get(ev.attackerId);
      if (attacker) {
        const kbResult = computeKnockback(effectiveEnergy, ev.massEff_kg!, target);
        applyKnockback(target, kbResult, {
          dx: target.position_m.x - attacker.position_m.x,
          dy: target.position_m.y - attacker.position_m.y,
        });
      }
    }

    trace.onEvent({
      kind: TraceKinds.Attack,
      tick: world.tick,
      attackerId: ev.attackerId,
      targetId: ev.targetId,
      weaponId: ev.weaponId,
      region: ev.region,
      energy_J: ev.energy_J,
      blocked: ev.blocked,
      parried: ev.parried,
      shieldBlocked: ev.shieldBlocked,
      armoured: ev.protectedByArmour,
      hitQuality: ev.hitQuality,
    });
  }
}
