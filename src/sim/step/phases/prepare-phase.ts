import { SCALE, type Q } from "../../../units.js";
import { buildWorldIndex, type WorldIndex } from "../../indexing.js";
import { buildSpatialIndex, type SpatialIndex } from "../../spatial.js";
import { computeDensityField } from "../../density.js";
import { DEFAULT_SENSORY_ENV } from "../../sensory.js";
import { deriveWeatherModifiers } from "../../weather.js";
import type { KernelContext } from "../../context.js";
import type { WorldState } from "../../world.js";

export interface PreparedKernelFrame {
  cellSize_m: number;
  index: WorldIndex;
  spatial: SpatialIndex;
}

export function runPreparePhase(world: WorldState, ctx: KernelContext): PreparedKernelFrame {
  const runtimeState = world.runtimeState ?? (world.runtimeState = {});
  runtimeState.sensoryEnv = ctx.sensoryEnv ?? DEFAULT_SENSORY_ENV;

  if (ctx.weather) {
    const wMod = deriveWeatherModifiers(ctx.weather);

    ctx.tractionCoeff = Math.trunc((ctx.tractionCoeff * wMod.tractionMul_Q) / SCALE.Q) as Q;

    const baseEnv = runtimeState.sensoryEnv;
    runtimeState.sensoryEnv = {
      ...baseEnv,
      lightMul: Math.trunc((baseEnv.lightMul * wMod.lightMul_Q) / SCALE.Q) as Q,
      smokeMul: Math.trunc((baseEnv.smokeMul * wMod.precipVisionMul_Q) / SCALE.Q) as Q,
    };

    if (ctx.thermalAmbient_Q !== undefined && wMod.thermalOffset_Q !== 0) {
      ctx.thermalAmbient_Q = (ctx.thermalAmbient_Q + wMod.thermalOffset_Q) as Q;
    }
  }

  world.entities.sort((a, b) => a.id - b.id);

  const index = buildWorldIndex(world);
  const cellSize_m = ctx.cellSize_m ?? Math.trunc(4 * SCALE.m);
  const spatial = buildSpatialIndex(world, cellSize_m);

  ctx.density = computeDensityField(world, index, spatial, {
    personalRadius_m: Math.trunc(0.45 * SCALE.m),
    maxNeighbours: 12,
    crowdingAt: 6,
  });

  return { cellSize_m, index, spatial };
}
