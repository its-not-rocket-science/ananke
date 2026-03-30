// src/netcode.ts — PA-10: Deterministic Networking Kit
//
// Utilities for authoritative lockstep and desync diagnosis.
//
// Core guarantee: two clients running identical commands from identical seeds
// must produce identical hashWorldState() outputs at every tick.  A mismatch
// pinpoints the first tick where state diverged.

import type { WorldState } from "./sim/world.js";
import type { CommandMap, Command } from "./sim/commands.js";
import type { KernelContext } from "./sim/context.js";
import { stepWorld } from "./sim/kernel.js";
import { deserializeReplay, type Replay } from "./replay.js";

// ── FNV-64 hash ───────────────────────────────────────────────────────────────
// 64-bit Fowler–Noll–Vo (FNV-1a) over UTF-16 code units.  Pure arithmetic,
// no external dependencies, portable across Node and browsers.

const FNV64_OFFSET = 14695981039346656037n;
const FNV64_PRIME  = 1099511628211n;
const UINT64_MASK  = 0xFFFFFFFFFFFFFFFFn;

function fnv64(data: string): bigint {
  let hash = FNV64_OFFSET;
  for (let i = 0; i < data.length; i++) {
    hash ^= BigInt(data.charCodeAt(i));
    hash  = (hash * FNV64_PRIME) & UINT64_MASK;
  }
  return hash;
}

// ── Stable JSON serialiser ────────────────────────────────────────────────────
// JSON.stringify with sorted object keys so property insertion order does not
// affect the hash.  Maps (armourState, foodInventory, reputations) are
// serialised as sorted entry arrays to guarantee a canonical form.

function stableReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    const entries = [...value.entries()]
      .sort(([a], [b]) => String(a).localeCompare(String(b)));
    return { __map__: entries };
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

/**
 * Compute a deterministic 64-bit hash of the simulation's core state.
 *
 * Covers `tick`, `seed`, and all entity data sorted by `id`.  Optional
 * subsystem fields (`__sensoryEnv`, `__factionRegistry`, etc.) are excluded —
 * they are host concerns and do not affect simulation determinism.
 *
 * Use this as a desync checksum in multiplayer loops:
 *
 * ```ts
 * const hash = hashWorldState(world);
 * socket.emit("tick-ack", { tick: world.tick, hash: hash.toString() });
 * ```
 *
 * @returns An unsigned 64-bit bigint.
 */
export function hashWorldState(world: WorldState): bigint {
  const sorted = [...world.entities].sort((a, b) => a.id - b.id);
  const canonical = JSON.stringify(
    { tick: world.tick, seed: world.seed, entities: sorted },
    stableReplacer,
  );
  return fnv64(canonical);
}

// ── Replay diff ───────────────────────────────────────────────────────────────

/** Result of comparing two replay traces. */
export interface ReplayDiff {
  /** Tick at which the two replays first diverge. `-1` means the initial
   *  states differ before any step.  `undefined` means the replays are
   *  identical up to the last compared tick. */
  divergeAtTick: number | undefined;
  /** Hash from replay A at the divergence tick (`undefined` when identical). */
  hashA: bigint | undefined;
  /** Hash from replay B at the divergence tick (`undefined` when identical). */
  hashB: bigint | undefined;
  /** Total ticks compared (including the initial-state check). */
  ticksCompared: number;
}

/**
 * Compare two replay traces tick-by-tick and find the first divergence.
 *
 * Steps both replays from their initial states in lock-step, computing
 * `hashWorldState` after each tick.  O(N) in replay length.
 *
 * @param replayA  First replay (e.g. client A's recording).
 * @param replayB  Second replay (e.g. client B's recording).
 * @param ctx      KernelContext forwarded to `stepWorld`.
 */
export function diffReplays(
  replayA: Replay,
  replayB: Replay,
  ctx: KernelContext,
): ReplayDiff {
  const worldA: WorldState = structuredClone(replayA.initialState);
  const worldB: WorldState = structuredClone(replayB.initialState);

  // Check initial state before any steps.
  const initA = hashWorldState(worldA);
  const initB = hashWorldState(worldB);
  if (initA !== initB) {
    return { divergeAtTick: -1, hashA: initA, hashB: initB, ticksCompared: 0 };
  }

  const maxFrames = Math.min(replayA.frames.length, replayB.frames.length);

  for (let i = 0; i < maxFrames; i++) {
    const frameA = replayA.frames[i]!;
    const frameB = replayB.frames[i]!;

    const cmdsA: CommandMap = new Map(
      frameA.commands.map(([id, cmds]) => [id, cmds] as [number, readonly Command[]]),
    );
    const cmdsB: CommandMap = new Map(
      frameB.commands.map(([id, cmds]) => [id, cmds] as [number, readonly Command[]]),
    );

    stepWorld(worldA, cmdsA, ctx);
    stepWorld(worldB, cmdsB, ctx);

    const hA = hashWorldState(worldA);
    const hB = hashWorldState(worldB);

    if (hA !== hB) {
      return {
        divergeAtTick: worldA.tick,
        hashA: hA,
        hashB: hB,
        ticksCompared: i + 1,
      };
    }
  }

  // If one replay has more frames, that's not a divergence — just a shorter
  // recording on one side.
  return { divergeAtTick: undefined, hashA: undefined, hashB: undefined, ticksCompared: maxFrames };
}

/**
 * Parse two replay JSON strings and diff them.
 *
 * Convenience wrapper over `diffReplays` for CLI use.
 */
export function diffReplayJson(
  jsonA: string,
  jsonB: string,
  ctx: KernelContext,
): ReplayDiff {
  const replayA = deserializeReplay(jsonA);
  const replayB = deserializeReplay(jsonB);
  return diffReplays(replayA, replayB, ctx);
}
