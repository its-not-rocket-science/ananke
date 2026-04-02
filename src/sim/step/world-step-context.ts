import type { CommandMap } from "../commands.js";
import type { KernelContext } from "../context.js";
import type { ImpactEvent } from "../events.js";
import type { WorldIndex } from "../indexing.js";
import type { SpatialIndex } from "../spatial.js";
import type { TraceSink } from "../trace.js";
import type { SimulationTuning } from "../tuning.js";
import type { WorldState } from "../world.js";

export interface WorldStepContext {
  world: WorldState;
  cmds: CommandMap;
  ctx: KernelContext;
  tuning: SimulationTuning;
  trace: TraceSink;
  cellSize_m: number;
  index: WorldIndex;
  spatial: SpatialIndex;
  spatialAfterMove: SpatialIndex;
  impacts: ImpactEvent[];
  finalImpacts: ImpactEvent[];
  aliveBeforeTick: Set<number>;
  teamRoutingFrac: Map<number, number>;
}
