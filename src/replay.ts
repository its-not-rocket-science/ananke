// src/replay.ts — Phase 13: deterministic replay system
//
// Deterministic replays work because stepWorld is a pure function of:
//   (WorldState, CommandMap, KernelContext)
//
// Recording: snapshot the initial WorldState, then log commands per tick.
// Replaying: restore the snapshot, apply logged commands in order.

import type { WorldState } from "./sim/world.js";
import type { CommandMap, Command } from "./sim/commands.js";
import type { KernelContext } from "./sim/kernel.js";
import { stepWorld } from "./sim/kernel.js";

/** One recorded tick: the tick number and the commands dispatched that tick. */
export interface ReplayFrame {
  tick: number;
  commands: ReadonlyArray<readonly [entityId: number, cmds: ReadonlyArray<Command>]>;
}

/**
 * A complete replay: the initial world snapshot plus one frame per recorded tick.
 * Replaying from `initialState` and re-applying `frames` in order deterministically
 * reproduces the original simulation.
 */
export interface Replay {
  /** Deep clone of the WorldState before the first stepWorld call. */
  initialState: WorldState;
  frames: readonly ReplayFrame[];
}

/**
 * Records commands applied each tick so the simulation can be replayed later.
 *
 * Usage:
 *   const recorder = new ReplayRecorder(world);        // snapshot before first step
 *   recorder.record(world.tick, cmds);                 // call once per tick
 *   stepWorld(world, cmds, ctx);
 *   const replay = recorder.toReplay();
 */
export class ReplayRecorder {
  private readonly _initialState: WorldState;
  private readonly _frames: ReplayFrame[] = [];

  constructor(world: WorldState) {
    // structuredClone handles Maps (armourState, capabilityCooldowns) correctly.
    this._initialState = structuredClone(world);
  }

  /** Record the commands dispatched for one tick. Call once per tick, before or after stepWorld. */
  record(tick: number, commands: CommandMap): void {
    this._frames.push({
      tick,
      commands: [...commands.entries()].map(([id, cmds]) => [id, [...cmds]] as const),
    });
  }

  toReplay(): Replay {
    return {
      initialState: structuredClone(this._initialState),
      frames: this._frames.map(f => ({ ...f })),
    };
  }
}

/**
 * Replay a recorded simulation up to (and including) `targetTick`.
 * Returns the reconstructed WorldState at that tick.
 * Does NOT mutate the Replay.
 *
 * Pass `ctx.trace` to collect all replayed events for analysis.
 */
export function replayTo(replay: Replay, targetTick: number, ctx: KernelContext): WorldState {
  const world: WorldState = structuredClone(replay.initialState);
  for (const frame of replay.frames) {
    if (frame.tick > targetTick) break;
    const cmds: CommandMap = new Map(
      frame.commands.map(([id, cmds]) => [id, cmds] as [number, readonly Command[]]),
    );
    stepWorld(world, cmds, ctx);
  }
  return world;
}

// ── JSON serialisation ────────────────────────────────────────────────────────
//
// WorldState contains Map fields (entity.armourState, action.capabilityCooldowns).
// Standard JSON.stringify drops Map entries. We use a marker-based replacer/reviver.

const MAP_MARKER = "__ananke_map__";

function mapAwareReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return { [MAP_MARKER]: true, entries: [...value.entries()] };
  }
  return value;
}

function mapAwareReviver(_key: string, value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    (value as Record<string, unknown>)[MAP_MARKER] === true
  ) {
    return new Map((value as { entries: Array<[unknown, unknown]> }).entries);
  }
  return value;
}

/** Serialize a Replay to a JSON string (handles Maps). */
export function serializeReplay(replay: Replay): string {
  return JSON.stringify(replay, mapAwareReplacer);
}

/** Deserialize a JSON string produced by `serializeReplay` back into a Replay. */
export function deserializeReplay(json: string): Replay {
  return JSON.parse(json, mapAwareReviver) as Replay;
}
