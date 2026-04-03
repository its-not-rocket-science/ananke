import type { WorldState } from "../sim/world.js";
import type { CommandMap } from "../sim/commands.js";
import type { KernelContext } from "../sim/context.js";
import { stepWorld } from "../sim/kernel.js";
import { normalizeWorldInPlace } from "../sim/normalization.js";

export interface TickRecord {
  tick: number;
  commands: Array<[entityId: number, commands: unknown[]]>;
  worldAfterTick: WorldState;
}

export interface TimeTravelConfig {
  maxTicks: number;
}

export interface TimeTravelWorld extends WorldState {
  recordTick(commands: CommandMap): void;
  rewind(ticks: number): WorldState;
  fork(): WorldState;
  getTickHistory(): readonly TickRecord[];
}

const DEFAULT_MAX_TICKS = 600;

export function enableTimeTravel(world: WorldState, config: Partial<TimeTravelConfig> = {}): TimeTravelWorld {
  const maxTicks = Math.min(3600, Math.max(60, Math.floor(config.maxTicks ?? DEFAULT_MAX_TICKS)));
  const ring: TickRecord[] = [];

  const tt = world as TimeTravelWorld;

  tt.recordTick = (commands: CommandMap): void => {
    ring.push({
      tick: tt.tick,
      commands: [...commands.entries()].map(([id, cmds]) => [id, [...cmds] as unknown[]]),
      worldAfterTick: structuredClone(tt),
    });
    if (ring.length > maxTicks) ring.shift();
  };

  tt.rewind = (ticks: number): WorldState => {
    const targetTick = Math.max(0, tt.tick - Math.max(0, Math.floor(ticks)));
    const snapshot = [...ring].reverse().find(entry => entry.tick <= targetTick);
    if (!snapshot) {
      throw new Error(`timetravel: cannot rewind ${ticks} tick(s); history only has ${ring.length} snapshots`);
    }

    const restored = normalizeWorldInPlace(structuredClone(snapshot.worldAfterTick));
    Object.assign(tt, restored);

    while (ring.length > 0 && ring[ring.length - 1]!.tick > tt.tick) {
      ring.pop();
    }

    return tt;
  };

  tt.fork = (): WorldState => normalizeWorldInPlace(structuredClone(tt));

  tt.getTickHistory = (): readonly TickRecord[] => ring.map(r => ({
    tick: r.tick,
    commands: r.commands.map(([id, cmds]) => [id, [...cmds]]),
    worldAfterTick: structuredClone(r.worldAfterTick),
  }));

  return tt;
}

export function stepAndRecord(world: TimeTravelWorld, commands: CommandMap, ctx: KernelContext): void {
  stepWorld(world, commands, ctx);
  world.recordTick(commands);
}
