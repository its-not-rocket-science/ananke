/**
 * CE-7 — Multi-threading / WebWorker Support
 *
 * Spatial partitioning utilities for running `stepWorld` in parallel Workers.
 *
 * ## Threading Model
 *
 * ```
 * Host thread
 *   1.  partitionWorld(world, specs) → N WorldState slices
 *   2.  postMessage(slice_i, commandSubset_i) to Worker i
 *
 * Worker i
 *   3.  stepWorld(slice_i, commands_i, ctx) → stepped WorldState
 *   4.  postMessage(steppedSlice_i) back to host
 *
 * Host thread
 *   5.  mergePartitions([steppedSlice_0, …, steppedSlice_N-1], boundaryPairs)
 *         → merged WorldState
 *   6.  (optional) run a cross-partition boundary-pair resolution pass using
 *         the sorted boundary pairs returned by canonicaliseBoundaryPairs()
 * ```
 *
 * ## Determinism guarantee
 *
 * Each partition is fully deterministic in isolation: same seed + same commands
 * always produces the same output. Cross-partition boundary pairs **must** be
 * resolved in canonical order (lower entity id first) after merging to avoid
 * seed divergence. Use `canonicaliseBoundaryPairs()` before any boundary
 * resolution step.
 *
 * ## Partition sizing guidelines
 *
 * | Entity count | Suggested partitions |
 * |-------------|---------------------|
 * | < 200       | 1 (no benefit)      |
 * | 200–500     | 2                   |
 * | 500–2 000   | 4                   |
 * | > 2 000     | 8                   |
 *
 * Keep each partition roughly equal in entity count for best load balance.
 * Avoid partitions with < 25 entities (thread-overhead exceeds compute savings).
 */

import type { WorldState } from "./sim/world.js";
import type { Entity }     from "./sim/entity.js";

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * Specification for a single spatial partition.
 *
 * `regionIds` are arbitrary string labels used to identify the geographic
 * region(s) this partition covers (e.g. `["north-west", "north-centre"]`).
 * They are metadata only — they do not affect computation.
 *
 * `entities` lists the entity ids that belong to this partition.
 * An entity id must appear in **at most one** partition; duplicate ids across
 * partitions cause undefined behaviour in `mergePartitions`.
 */
export interface PartitionSpec {
  /** Human-readable region labels (metadata only). */
  regionIds: string[];
  /** Entity ids assigned to this partition. */
  entities: number[];
}

/**
 * Result summary returned by `mergePartitions`.
 * The merged `WorldState` is the primary payload; `unresolvedBoundaryPairs` are
 * the boundary pairs sorted in canonical order and ready for an optional
 * post-merge resolution pass (e.g. cross-partition push/repulsion).
 */
export interface MergeResult {
  /** Merged world state with all entities from all partitions. */
  world: WorldState;
  /**
   * Boundary pairs sorted in canonical order (a < b) for post-merge
   * cross-partition resolution.  Pass these to your boundary-resolution step
   * to preserve determinism.
   */
  sortedBoundaryPairs: [number, number][];
}

// ── partitionWorld ─────────────────────────────────────────────────────────────

/**
 * Split a `WorldState` into N independent partition slices.
 *
 * Each partition slice contains:
 * - All world-level scalar / subsystem fields (shared, copy-on-write).
 * - Only the entities whose ids appear in `spec.entities`.
 *
 * Entity ids not referenced in any spec are silently dropped from all slices.
 * If you need unassigned entities preserved, include them in one of the specs.
 *
 * @param world  The current world state to partition.
 * @param specs  One spec per desired partition.  Must have at least one entry.
 * @returns      Array of `WorldState` slices, one per spec, in the same order.
 */
export function partitionWorld(world: WorldState, specs: PartitionSpec[]): WorldState[] {
  if (specs.length === 0) {
    throw new RangeError("parallel: partitionWorld requires at least one PartitionSpec");
  }

  // Build O(1) entity lookup
  const entityMap = new Map<number, Entity>(world.entities.map(e => [e.id, e]));

  return specs.map(spec => {
    // Collect entities for this partition; skip unknown ids
    const entities: Entity[] = [];
    for (const id of spec.entities) {
      const e = entityMap.get(id);
      if (e !== undefined) entities.push(e);
    }
    // Maintain canonical ascending-id sort within partition
    entities.sort((a, b) => a.id - b.id);

    return {
      ...(world as object),
      entities,
    } as WorldState;
  });
}

// ── mergePartitions ────────────────────────────────────────────────────────────

/**
 * Merge N independently-stepped partition slices back into a single
 * `WorldState`, and return the boundary pairs sorted in canonical order.
 *
 * **Entity ownership rule:** If an entity id appears in multiple partition
 * results (which can happen if a host intentionally duplicated a boundary
 * entity as a read-only context ghost), the entity state from the
 * **last partition** in the array wins.  To avoid ambiguity, ensure each
 * entity id appears in at most one partition before stepping.
 *
 * World-level fields (`tick`, `seed`, subsystems) are taken from the first
 * non-empty partition.  All partitions should have been stepped with the same
 * seed and world-level state; mixing partitions stepped at different ticks
 * produces undefined behaviour.
 *
 * @param partitions     Stepped WorldState slices, one per worker.
 * @param boundaryPairs  Pairs of entity ids that span partition boundaries.
 *                       Order within each pair does not matter — they are
 *                       normalised to `[min, max]` internally.
 * @returns              Merged world state + canonically sorted boundary pairs.
 */
export function mergePartitions(
  partitions: WorldState[],
  boundaryPairs: [number, number][],
): MergeResult {
  if (partitions.length === 0) {
    throw new RangeError("parallel: mergePartitions requires at least one partition");
  }

  // Merge entities — last-partition-wins for duplicates
  const entityMap = new Map<number, Entity>();
  for (const partition of partitions) {
    for (const e of partition.entities) {
      entityMap.set(e.id, e);
    }
  }

  // Restore canonical ascending-id sort
  const entities = [...entityMap.values()].sort((a, b) => a.id - b.id);

  // World-level fields from first partition (tick, seed, subsystems)
  const base = partitions[0]!;
  const world: WorldState = {
    ...(base as object),
    entities,
  } as WorldState;

  // Canonical boundary pairs: normalise order + sort
  const sortedBoundaryPairs = canonicaliseBoundaryPairs(boundaryPairs);

  return { world, sortedBoundaryPairs };
}

// ── canonicaliseBoundaryPairs ─────────────────────────────────────────────────

/**
 * Normalise and sort an array of entity-id pairs into canonical form.
 *
 * Each pair is normalised to `[min(a, b), max(a, b)]` and the array is sorted
 * lexicographically by `[a, b]`.  Duplicate pairs are preserved (callers may
 * de-duplicate if needed).
 *
 * Use this before any cross-partition resolution step to guarantee the same
 * pair-processing order regardless of how the host partitioned the world.
 *
 * @param pairs  Boundary pairs in any order.
 * @returns      New sorted array with each pair normalised.
 */
export function canonicaliseBoundaryPairs(pairs: [number, number][]): [number, number][] {
  return pairs
    .map(([a, b]): [number, number] => a <= b ? [a, b] : [b, a])
    .sort(([a1, b1], [a2, b2]) => (a1 - a2) || (b1 - b2));
}

// ── detectBoundaryPairs ────────────────────────────────────────────────────────

/**
 * Automatically detect cross-partition entity pairs within a given range.
 *
 * Scans all entity pairs `(e_i from partition_A, e_j from partition_B)` where
 * `A ≠ B`, and returns any pair whose entities are within `range_m` of each
 * other (using 2-D Euclidean distance).  Results are canonically sorted.
 *
 * Useful for building the `boundaryPairs` argument to `mergePartitions` without
 * manually specifying which pairs cross boundaries.
 *
 * Complexity: O(E²) — only suitable for boundary detection (not the hot path).
 * For large entity counts, build boundary pairs from the spatial index instead.
 *
 * @param partitions  Post-step (or pre-step) partition slices.
 * @param range_m     Maximum inter-entity distance to consider a boundary pair
 *                    (in fixed-point metres, same scale as `entity.position_m`).
 * @returns           Canonically sorted cross-partition boundary pairs.
 */
export function detectBoundaryPairs(
  partitions: WorldState[],
  range_m: number,
): [number, number][] {
  const range2 = range_m * range_m;

  // Build (entityId → partitionIndex) map
  const ownerMap = new Map<number, number>();
  for (let pi = 0; pi < partitions.length; pi++) {
    for (const e of partitions[pi]!.entities) {
      ownerMap.set(e.id, pi);
    }
  }

  // Flat entity list for pair scanning
  const all: Entity[] = partitions.flatMap(p => p.entities);

  const pairs: [number, number][] = [];

  for (let i = 0; i < all.length; i++) {
    const ei = all[i]!;
    if (ei.injury.dead) continue;
    const piOwner = ownerMap.get(ei.id)!;

    for (let j = i + 1; j < all.length; j++) {
      const ej = all[j]!;
      if (ej.injury.dead) continue;
      if (ownerMap.get(ej.id) === piOwner) continue; // same partition — skip

      const dx = ei.position_m.x - ej.position_m.x;
      const dy = ei.position_m.y - ej.position_m.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 <= range2) {
        const a = Math.min(ei.id, ej.id);
        const b = Math.max(ei.id, ej.id);
        pairs.push([a, b]);
      }
    }
  }

  return canonicaliseBoundaryPairs(pairs);
}

// ── assignEntitiesToPartitions ────────────────────────────────────────────────

/**
 * Simple spatial partitioning helper — assigns entities to N partitions based
 * on their X position (vertical strip partitioning).
 *
 * Entities are sorted by ascending `position_m.x` and divided into `n` roughly
 * equal buckets.  This is suitable for combat scenarios where combatants are
 * spread along the X axis.  For 2-D grid layouts, call this function twice
 * (once per axis) and intersect the results.
 *
 * @param world     World state whose entities should be partitioned.
 * @param n         Number of partitions (≥ 1).
 * @returns         `PartitionSpec` array ready for `partitionWorld`.
 */
export function assignEntitiesToPartitions(world: WorldState, n: number): PartitionSpec[] {
  if (n < 1) throw new RangeError("parallel: partition count must be ≥ 1");

  const live = world.entities
    .filter(e => !e.injury.dead)
    .sort((a, b) => a.position_m.x - b.position_m.x);

  const specs: PartitionSpec[] = Array.from({ length: n }, (_, i) => ({
    regionIds: [`strip-${i}`],
    entities: [],
  }));

  // Assign dead entities to first partition so they're not dropped
  const dead = world.entities.filter(e => e.injury.dead);
  for (const e of dead) {
    specs[0]!.entities.push(e.id);
  }

  // Round-robin striped assignment for live entities
  const bucketSize = Math.ceil(live.length / n);
  for (let i = 0; i < live.length; i++) {
    const bucket = Math.min(Math.trunc(i / bucketSize), n - 1);
    specs[bucket]!.entities.push(live[i]!.id);
  }

  return specs;
}
