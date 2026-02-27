import type { Entity } from "../entity.js";
import type { WorldState } from "../world.js";
import { terrainKey } from "../terrain.js";
import { applyHazardDamage } from "./hazards.js";
import { type EffectPayload } from "../capability.js";
import type { TraceSink } from "../trace.js";
import { I32 } from "../../units.js";
import { applyPayload } from "../kernel.js";
import { HazardGrid } from "../terrain.js";

/**
 * Phase 12B effect chains: apply chainPayload from each active FieldEffect to every
 * living entity within its radius. Runs before expiry so the final tick still fires.
 */
export function stepChainEffects(world: WorldState, trace: TraceSink, tick: number): void {
  if (!world.activeFieldEffects?.length) return;
  for (const fe of world.activeFieldEffects) {
    if (!fe.chainPayload) continue;
    const actor = world.entities.find(e => e.id === fe.placedByEntityId);
    if (!actor) continue;
    const payloads: EffectPayload[] = Array.isArray(fe.chainPayload)
      ? fe.chainPayload
      : [fe.chainPayload];
    const radSq = fe.radius_m * fe.radius_m;
    for (const target of world.entities) {
      if (target.injury.dead) continue;
      const dx = target.position_m.x - fe.origin.x;
      const dy = target.position_m.y - fe.origin.y;
      if (dx * dx + dy * dy > radSq) continue;
      for (const p of payloads) {
        applyPayload(world, actor, target, p, trace, tick, fe.id);
      }
    }
  }
}

/**
 * Decrement duration on timed field effects; remove expired ones.
 * Permanent effects (duration_ticks === -1) are never removed.
 */
export function stepFieldEffects(world: WorldState): void {
  if (!world.activeFieldEffects?.length) return;
  world.activeFieldEffects = world.activeFieldEffects.filter(fe => {
    if (fe.duration_ticks < 0) return true; // permanent
    fe.duration_ticks -= 1;
    return fe.duration_ticks > 0;
  });
}

export function stepHazardEffects_legacy(entities: Entity[], grid: HazardGrid, cellSize_m: I32): void {
  const cs = Math.max(1, cellSize_m);
  for (const e of entities) {
    if (e.injury.dead) continue;
    const cx = Math.trunc(e.position_m.x / cs);
    const cy = Math.trunc(e.position_m.y / cs);
    const key = terrainKey(cx, cy);
    const hazard = grid.get(key);
    if (!hazard) continue;
    if (hazard.intensity > 0) {
      applyHazardDamage(e, hazard);
    }
    if (hazard.duration_ticks > 0) {
      hazard.duration_ticks -= 1;
      if (hazard.duration_ticks === 0) {
        grid.delete(key);
      }
    }
  }
}

function hazardKeyForEntity(e: Entity, cellSize_m: I32): string {
    const cx = Math.floor(e.position_m.x / cellSize_m);
    const cy = Math.floor(e.position_m.y / cellSize_m);
    return terrainKey(cx, cy);
}


export function stepHazardEffects(entities: readonly  Entity[], grid: HazardGrid, cellSize_m: I32): void {

  // 1) Apply hazards to entities (no duration ticking here)
  for (const e of entities) {
    const key = hazardKeyForEntity(e, cellSize_m); // <-- replace with your actual key computation
    const hazard = grid.get(key);
    if (!hazard) continue;

    applyHazardDamage(e, hazard); // <-- replace with your actual application call(s)
  }

  // 2) Tick/expire hazards once per cell per tick
  // Collect keys first to avoid mutating the map while iterating it.
  const keysToDelete: string[] = [];

  for (const [key, hazard] of grid) {
    if (hazard.duration_ticks > 0) {
      hazard.duration_ticks -= 1;
      if (hazard.duration_ticks === 0) keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) grid.delete(key);
}