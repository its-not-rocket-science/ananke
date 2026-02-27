import type { Entity } from "../entity.js";
import type { WorldState } from "../world.js";
import { terrainKey } from "../terrain.js";
import { DT_S } from "../tick.js";
import { SCALE, q, type Q } from "../../units.js";
import type { KernelContext } from "../context.js";

/**
 * Per-entity per-tick regen of all capability sources.
 * Called after stepMovement so velocity is current.
 */
export function stepCapabilitySources(e: Entity, world: WorldState, ctx: KernelContext): void {
  if (!e.capabilitySources) return;
  const cellSize_m = ctx.cellSize_m ?? Math.trunc(4 * SCALE.m);

  for (const source of e.capabilitySources) {
    const model = source.regenModel;
    if (model.type === "boundless") continue;

    let regenRate_W = 0;

    switch (model.type) {
      case "constant":
        regenRate_W = model.regenRate_W;
        break;

      case "rest": {
        const speedAbs = Math.max(Math.abs(e.velocity_mps.x), Math.abs(e.velocity_mps.y));
        const isResting = speedAbs <= Math.trunc(0.05 * SCALE.mps) && e.action.attackCooldownTicks === 0;
        if (isResting) regenRate_W = model.regenRate_W;
        break;
      }

      case "ambient": {
        const cx = Math.trunc(e.position_m.x / cellSize_m);
        const cy = Math.trunc(e.position_m.y / cellSize_m);
        const key = terrainKey(cx, cy);
        const ambientVal = ctx.ambientGrid?.get(key) ?? 0;
        if (ambientVal > 0) {
          regenRate_W = Math.trunc(model.maxRate_W * ambientVal / SCALE.Q);
        }
        break;
      }

      case "event": {
        for (const trigger of model.triggers) {
          if (trigger.on === "tick") {
            if (trigger._nextTick === undefined) trigger._nextTick = world.tick + trigger.every_n;
            if (world.tick >= trigger._nextTick) {
              source.reserve_J = Math.min(source.maxReserve_J, source.reserve_J + trigger.amount_J);
              trigger._nextTick = world.tick + trigger.every_n;
            }
          }
          // kill triggers dispatched by kernel death-detection loop; terrain triggers below
        }
        break;
      }
    }

    if (regenRate_W > 0) {
      const regenThisTick = Math.trunc(regenRate_W * DT_S / SCALE.s);
      source.reserve_J = Math.min(source.maxReserve_J, source.reserve_J + regenThisTick);
    }
  }

  // Phase 12B: terrain-entry triggers — fire once per cell-boundary crossing
  if (ctx.terrainTagGrid) {
    const cx = Math.trunc(e.position_m.x / cellSize_m);
    const cy = Math.trunc(e.position_m.y / cellSize_m);
    const currentKey = terrainKey(cx, cy);
    if (currentKey !== e.action.lastCellKey) {
      const tags = ctx.terrainTagGrid.get(currentKey) ?? [];
      for (const source of e.capabilitySources) {
        if (source.regenModel.type !== "event") continue;
        for (const trig of source.regenModel.triggers) {
          if (trig.on === "terrain" && tags.includes(trig.tag)) {
            source.reserve_J = Math.min(source.maxReserve_J, source.reserve_J + trig.amount_J);
          }
        }
      }
    }
    e.action.lastCellKey = currentKey;
  }
}