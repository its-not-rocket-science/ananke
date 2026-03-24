/**
 * CE-7 — Multi-threading / WebWorker Support tests
 */

import { describe, it, expect } from "vitest";
import {
  partitionWorld,
  mergePartitions,
  detectBoundaryPairs,
  assignEntitiesToPartitions,
  canonicaliseBoundaryPairs,
  type PartitionSpec,
} from "../src/parallel.js";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ── canonicaliseBoundaryPairs ─────────────────────────────────────────────────

describe("canonicaliseBoundaryPairs", () => {
  it("normalises [b, a] to [a, b] when b > a", () => {
    const result = canonicaliseBoundaryPairs([[5, 2]]);
    expect(result).toEqual([[2, 5]]);
  });

  it("leaves already-canonical pairs unchanged", () => {
    const result = canonicaliseBoundaryPairs([[1, 3], [2, 4]]);
    expect(result).toEqual([[1, 3], [2, 4]]);
  });

  it("sorts by first element then second", () => {
    const result = canonicaliseBoundaryPairs([[3, 7], [1, 9], [2, 5]]);
    expect(result).toEqual([[1, 9], [2, 5], [3, 7]]);
  });

  it("handles equal first elements by second element", () => {
    const result = canonicaliseBoundaryPairs([[2, 9], [2, 3]]);
    expect(result).toEqual([[2, 3], [2, 9]]);
  });

  it("returns empty array for empty input", () => {
    expect(canonicaliseBoundaryPairs([])).toEqual([]);
  });

  it("normalises and sorts a mixed array", () => {
    const result = canonicaliseBoundaryPairs([[10, 1], [5, 3], [2, 8]]);
    expect(result).toEqual([[1, 10], [2, 8], [3, 5]]);
  });
});

// ── partitionWorld ─────────────────────────────────────────────────────────────

describe("partitionWorld", () => {
  it("splits entities into two disjoint partitions", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e2 = mkHumanoidEntity(2, 2, 10_000, 0);
    const e3 = mkHumanoidEntity(3, 1, 20_000, 0);
    const world = mkWorld(1, [e1, e2, e3]);

    const specs: PartitionSpec[] = [
      { regionIds: ["left"],  entities: [1, 2] },
      { regionIds: ["right"], entities: [3] },
    ];
    const slices = partitionWorld(world, specs);

    expect(slices).toHaveLength(2);
    expect(slices[0]!.entities.map(e => e.id)).toEqual([1, 2]);
    expect(slices[1]!.entities.map(e => e.id)).toEqual([3]);
  });

  it("preserves world-level fields in each partition", () => {
    const world = mkWorld(42, [mkHumanoidEntity(1, 1, 0, 0)]);
    const slices = partitionWorld(world, [
      { regionIds: ["all"], entities: [1] },
    ]);
    expect(slices[0]!.seed).toBe(42);
    expect(slices[0]!.tick).toBe(world.tick);
  });

  it("sorts entities within partition by id ascending", () => {
    const e3 = mkHumanoidEntity(3, 1, 0, 0);
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e1, e3]);
    const slices = partitionWorld(world, [
      { regionIds: ["a"], entities: [3, 1] },
    ]);
    expect(slices[0]!.entities.map(e => e.id)).toEqual([1, 3]);
  });

  it("ignores entity ids not in world", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    const slices = partitionWorld(world, [
      { regionIds: ["a"], entities: [1, 99] }, // 99 doesn't exist
    ]);
    expect(slices[0]!.entities).toHaveLength(1);
    expect(slices[0]!.entities[0]!.id).toBe(1);
  });

  it("throws for empty specs array", () => {
    const world = mkWorld(1, []);
    expect(() => partitionWorld(world, [])).toThrow(/at least one/);
  });

  it("allows an entity to appear in only one partition (non-overlapping)", () => {
    const entities = [1, 2, 3, 4].map(id => mkHumanoidEntity(id, 1, id * 10_000, 0));
    const world = mkWorld(1, entities);
    const specs: PartitionSpec[] = [
      { regionIds: ["A"], entities: [1, 2] },
      { regionIds: ["B"], entities: [3, 4] },
    ];
    const slices = partitionWorld(world, specs);
    const allIds = slices.flatMap(s => s.entities.map(e => e.id));
    // Each id appears exactly once
    expect(allIds.sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it("handles empty partition spec (no assigned entities)", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    const slices = partitionWorld(world, [
      { regionIds: ["full"], entities: [1] },
      { regionIds: ["empty"], entities: [] },
    ]);
    expect(slices[1]!.entities).toHaveLength(0);
  });
});

// ── mergePartitions ────────────────────────────────────────────────────────────

describe("mergePartitions", () => {
  it("merges entities from two partitions into one world, sorted by id", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e3 = mkHumanoidEntity(3, 1, 20_000, 0);
    const world = mkWorld(1, [e1, e3]);
    const specs: PartitionSpec[] = [
      { regionIds: ["a"], entities: [1] },
      { regionIds: ["b"], entities: [3] },
    ];
    const slices = partitionWorld(world, specs);
    const { world: merged } = mergePartitions(slices, []);

    expect(merged.entities.map(e => e.id)).toEqual([1, 3]);
  });

  it("preserves world-level fields from first partition", () => {
    const world = mkWorld(77, [mkHumanoidEntity(1, 1, 0, 0)]);
    const slices = partitionWorld(world, [
      { regionIds: ["a"], entities: [1] },
    ]);
    const { world: merged } = mergePartitions(slices, []);
    expect(merged.seed).toBe(77);
  });

  it("last partition wins for duplicate entity ids", () => {
    const e1a = mkHumanoidEntity(1, 1, 0, 0);
    const e1b = { ...deepClone(e1a), teamId: 2 }; // same id, different teamId
    const world1 = mkWorld(1, [e1a]);
    const world2 = mkWorld(1, [e1b]);
    const { world: merged } = mergePartitions([world1, world2], []);
    expect(merged.entities[0]!.teamId).toBe(2); // last partition wins
  });

  it("returns canonically sorted boundary pairs", () => {
    const world = mkWorld(1, [
      mkHumanoidEntity(1, 1, 0, 0),
      mkHumanoidEntity(2, 2, 10_000, 0),
    ]);
    const slices = partitionWorld(world, [
      { regionIds: ["a"], entities: [1] },
      { regionIds: ["b"], entities: [2] },
    ]);
    const { sortedBoundaryPairs } = mergePartitions(slices, [[2, 1]]);
    expect(sortedBoundaryPairs).toEqual([[1, 2]]); // normalised
  });

  it("throws for empty partitions array", () => {
    expect(() => mergePartitions([], [])).toThrow(/at least one/);
  });

  it("round-trip: partitionWorld + mergePartitions gives same entity count", () => {
    const entities = [1, 2, 3, 4, 5].map(id => mkHumanoidEntity(id, 1, id * 10_000, 0));
    const world = mkWorld(1, entities);
    const specs = assignEntitiesToPartitions(world, 2);
    const slices = partitionWorld(world, specs);
    const { world: merged } = mergePartitions(slices, []);
    expect(merged.entities).toHaveLength(5);
    expect(merged.entities.map(e => e.id)).toEqual([1, 2, 3, 4, 5]);
  });
});

// ── detectBoundaryPairs ────────────────────────────────────────────────────────

describe("detectBoundaryPairs", () => {
  it("detects pairs of entities in different partitions within range", () => {
    // e1 in partition 0 at x=0; e2 in partition 1 at x=5000 (0.5 m) — within 10 000 m (1 m)
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e2 = mkHumanoidEntity(2, 2, 5_000, 0);
    const w1 = mkWorld(1, [e1]);
    const w2 = mkWorld(1, [e2]);
    const pairs = detectBoundaryPairs([w1, w2], 10_000);
    expect(pairs).toContainEqual([1, 2]);
  });

  it("does not detect pairs within the same partition", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e2 = mkHumanoidEntity(2, 2, 5_000, 0);
    const w1 = mkWorld(1, [e1, e2]);
    const pairs = detectBoundaryPairs([w1], 10_000);
    expect(pairs).toHaveLength(0);
  });

  it("does not detect cross-partition pairs beyond range", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e2 = mkHumanoidEntity(2, 2, 100_000, 0); // 10 m away
    const w1 = mkWorld(1, [e1]);
    const w2 = mkWorld(1, [e2]);
    const pairs = detectBoundaryPairs([w1, w2], 50_000); // 5 m range
    expect(pairs).toHaveLength(0);
  });

  it("returns pairs in canonical order (lower id first)", () => {
    const e5 = mkHumanoidEntity(5, 1, 0, 0);
    const e2 = mkHumanoidEntity(2, 2, 5_000, 0);
    const w1 = mkWorld(1, [e5]);
    const w2 = mkWorld(1, [e2]);
    const pairs = detectBoundaryPairs([w1, w2], 10_000);
    expect(pairs[0]![0]).toBeLessThan(pairs[0]![1]!);
  });

  it("skips dead entities", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e2 = mkHumanoidEntity(2, 2, 5_000, 0);
    e1.injury.dead = true;
    const w1 = mkWorld(1, [e1]);
    const w2 = mkWorld(1, [e2]);
    const pairs = detectBoundaryPairs([w1, w2], 10_000);
    expect(pairs).toHaveLength(0);
  });
});

// ── assignEntitiesToPartitions ────────────────────────────────────────────────

describe("assignEntitiesToPartitions", () => {
  it("assigns all live entities across partitions", () => {
    const entities = [1, 2, 3, 4].map(id => mkHumanoidEntity(id, 1, id * 10_000, 0));
    const world = mkWorld(1, entities);
    const specs = assignEntitiesToPartitions(world, 2);
    const allIds = specs.flatMap(s => s.entities).sort((a, b) => a - b);
    expect(allIds).toEqual([1, 2, 3, 4]);
  });

  it("produces the requested number of partitions", () => {
    const entities = [1, 2, 3, 4, 5, 6].map(id => mkHumanoidEntity(id, 1, id * 10_000, 0));
    const world = mkWorld(1, entities);
    const specs = assignEntitiesToPartitions(world, 3);
    expect(specs).toHaveLength(3);
  });

  it("dead entities go to first partition", () => {
    const dead = mkHumanoidEntity(99, 1, 0, 0);
    dead.injury.dead = true;
    const live = mkHumanoidEntity(1, 1, 10_000, 0);
    const world = mkWorld(1, [dead, live]);
    const specs = assignEntitiesToPartitions(world, 2);
    expect(specs[0]!.entities).toContain(99);
  });

  it("single partition returns all entities in one spec", () => {
    const entities = [1, 2, 3].map(id => mkHumanoidEntity(id, 1, id * 10_000, 0));
    const world = mkWorld(1, entities);
    const specs = assignEntitiesToPartitions(world, 1);
    expect(specs).toHaveLength(1);
    expect(specs[0]!.entities.sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("throws for partition count < 1", () => {
    const world = mkWorld(1, []);
    expect(() => assignEntitiesToPartitions(world, 0)).toThrow();
  });

  it("regionIds use strip-N naming", () => {
    const entities = [1, 2].map(id => mkHumanoidEntity(id, 1, id * 10_000, 0));
    const world = mkWorld(1, entities);
    const specs = assignEntitiesToPartitions(world, 2);
    expect(specs[0]!.regionIds[0]).toBe("strip-0");
    expect(specs[1]!.regionIds[0]).toBe("strip-1");
  });

  it("no entity appears in two partitions (non-overlapping)", () => {
    const entities = [1, 2, 3, 4, 5, 6, 7, 8].map(id => mkHumanoidEntity(id, 1, id * 10_000, 0));
    const world = mkWorld(1, entities);
    const specs = assignEntitiesToPartitions(world, 4);
    const allIds = specs.flatMap(s => s.entities);
    const unique = new Set(allIds);
    expect(unique.size).toBe(allIds.length); // no duplicates
  });

  it("roughly balances entity counts across partitions", () => {
    const entities = Array.from({ length: 100 }, (_, i) =>
      mkHumanoidEntity(i + 1, 1, i * 10_000, 0)
    );
    const world = mkWorld(1, entities);
    const specs = assignEntitiesToPartitions(world, 4);
    const counts = specs.map(s => s.entities.length);
    const maxCount = Math.max(...counts);
    const minCount = Math.min(...counts);
    // No partition should have more than 2× another's count
    expect(maxCount).toBeLessThanOrEqual(minCount * 2 + 5);
  });
});

// ── Integration: partitionWorld + mergePartitions round-trip ──────────────────

describe("partition/merge round-trip", () => {
  it("all entity states are preserved through split + merge (no stepping)", () => {
    const entities = [1, 2, 3, 4, 5].map(id =>
      mkHumanoidEntity(id, id % 2 + 1, id * 10_000, 0)
    );
    const world = mkWorld(1, entities);

    const specs   = assignEntitiesToPartitions(world, 2);
    const slices  = partitionWorld(world, specs);
    const { world: merged } = mergePartitions(slices, []);

    expect(merged.entities).toHaveLength(5);
    for (let i = 0; i < entities.length; i++) {
      const orig = world.entities.find(e => e.id === i + 1)!;
      const back = merged.entities.find(e => e.id === i + 1)!;
      expect(JSON.stringify(back)).toBe(JSON.stringify(orig));
    }
  });

  it("world seed and tick survive split + merge", () => {
    const world = mkWorld(99, [mkHumanoidEntity(1, 1, 0, 0)]);
    const specs   = assignEntitiesToPartitions(world, 1);
    const slices  = partitionWorld(world, specs);
    const { world: merged } = mergePartitions(slices, []);
    expect(merged.seed).toBe(99);
    expect(merged.tick).toBe(world.tick);
  });
});
