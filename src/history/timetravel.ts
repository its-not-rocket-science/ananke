import type { WorldState } from "../sim/world.js";
import type { Command, CommandMap } from "../sim/commands.js";
import type { KernelContext } from "../sim/context.js";
import { stepWorld } from "../sim/kernel.js";

export interface TimeTravelOptions {
  bufferSizeTicks?: number;
}

export interface TickRecord {
  tick: number;
  state: WorldState;
  commands: Array<readonly [entityId: number, commands: readonly Command[]]>;
}

export interface TimeTravelWorld extends WorldState {
  rewind(ticks: number): void;
  fork(): WorldState;
}

export class TimeTravelController {
  private readonly records: TickRecord[] = [];
  private readonly bufferSizeTicks: number;

  constructor(private readonly world: WorldState, private readonly ctx: KernelContext, opts: TimeTravelOptions = {}) {
    const configured = opts.bufferSizeTicks ?? 600;
    this.bufferSizeTicks = Math.max(60, Math.min(3600, configured));
    this.records.push({ tick: world.tick, state: structuredClone(world), commands: [] });
    attachMethods(world, this);
  }

  recordTick(commands: CommandMap): void {
    const record: TickRecord = {
      tick: this.world.tick,
      state: structuredClone(this.world),
      commands: [...commands.entries()].map(([id, cmds]) => [id, [...cmds]] as const),
    };
    this.records.push(record);
    while (this.records.length > this.bufferSizeTicks) this.records.shift();
  }

  step(commands: CommandMap): void {
    this.recordTick(commands);
    stepWorld(this.world, commands, this.ctx);
  }

  rewind(ticks: number): void {
    if (ticks <= 0) return;
    const targetTick = this.world.tick - ticks;
    const candidate = [...this.records].reverse().find(r => r.tick <= targetTick);
    if (!candidate) {
      throw new Error(`timetravel: cannot rewind ${ticks} ticks with buffer size ${this.bufferSizeTicks}`);
    }
    mutateWorld(this.world, structuredClone(candidate.state));
  }

  fork(): WorldState {
    return structuredClone(this.world);
  }

  getHistory(): readonly TickRecord[] {
    return this.records;
  }
}

export function enableTimeTravel(world: WorldState, ctx: KernelContext, opts: TimeTravelOptions = {}): TimeTravelController {
  return new TimeTravelController(world, ctx, opts);
}

function attachMethods(world: WorldState, controller: TimeTravelController): asserts world is TimeTravelWorld {
  const mutable = world as unknown as TimeTravelWorld;
  mutable.rewind = (ticks: number) => controller.rewind(ticks);
  mutable.fork = () => controller.fork();
}

function mutateWorld(target: WorldState, source: WorldState): void {
  for (const key of Object.keys(target)) {
    if (!(key in source)) {
      delete (target as unknown as Record<string, unknown>)[key];
    }
  }
  Object.assign(target as object, source as object);
}
