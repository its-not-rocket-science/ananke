/**
 * CE-9 — World-State Diffing + Incremental Snapshots tests
 */

import { describe, it, expect } from "vitest";
import {
  diffWorldState,
  applyDiff,
  packDiff,
  unpackDiff,
  isDiffEmpty,
  diffStats,
  type WorldStateDiff,
} from "../src/snapshot.js";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing.js";
import { q } from "../src/units.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ── diffWorldState ────────────────────────────────────────────────────────────

describe("diffWorldState", () => {
  it("produces empty diff for identical states", () => {
    const w = mkWorld(42, [mkHumanoidEntity(1, 1, 0, 0)]);
    const diff = diffWorldState(w, deepClone(w));
    expect(isDiffEmpty(diff)).toBe(true);
  });

  it("captures tick change in worldChanges", () => {
    const prev = mkWorld(42, []);
    const next = deepClone(prev);
    next.tick = 10;
    const diff = diffWorldState(prev, next);
    expect(diff.worldChanges["tick"]).toBe(10);
    expect(diff.tick).toBe(10);
  });

  it("captures seed change in worldChanges", () => {
    const prev = mkWorld(42, []);
    const next = deepClone(prev);
    next.seed = 99;
    const diff = diffWorldState(prev, next);
    expect(diff.worldChanges["seed"]).toBe(99);
  });

  it("omits unchanged world fields", () => {
    const prev = mkWorld(42, []);
    const next = deepClone(prev);
    next.tick = 5;
    const diff = diffWorldState(prev, next);
    expect(Object.keys(diff.worldChanges)).toEqual(["tick"]);
  });

  it("detects added entity", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e2 = mkHumanoidEntity(2, 2, 10_000, 0);
    const prev = mkWorld(1, [e1]);
    const next  = mkWorld(1, [e1, e2]);
    next.tick = 1;
    const diff = diffWorldState(prev, next);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]!.id).toBe(2);
    expect(diff.removed).toHaveLength(0);
  });

  it("detects removed entity", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e2 = mkHumanoidEntity(2, 2, 10_000, 0);
    const prev = mkWorld(1, [e1, e2]);
    const next  = mkWorld(1, [e1]);
    next.tick = 1;
    const diff = diffWorldState(prev, next);
    expect(diff.removed).toContain(2);
    expect(diff.added).toHaveLength(0);
  });

  it("detects modified entity field", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const prev = mkWorld(1, [e]);
    const next  = deepClone(prev);
    next.tick = 1;
    next.entities[0]!.energy.fatigue = q(0.5);
    const diff = diffWorldState(prev, next);
    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0]!.id).toBe(1);
    expect(diff.modified[0]!.changes).toHaveProperty("energy");
  });

  it("does NOT include unchanged entity fields in patch", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const prev = mkWorld(1, [e]);
    const next  = deepClone(prev);
    next.tick = 1;
    next.entities[0]!.energy.fatigue = q(0.5);
    const diff = diffWorldState(prev, next);
    const changes = diff.modified[0]!.changes;
    // Only `energy` changed — `attributes`, `injury`, etc. should be absent
    expect(Object.keys(changes)).toEqual(["energy"]);
  });

  it("handles simultaneous add, remove, and modify", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e2 = mkHumanoidEntity(2, 2, 10_000, 0);
    const prev = mkWorld(1, [e1, e2]);
    const next  = deepClone(prev);
    next.tick = 1;
    // Modify e1
    next.entities[0]!.energy.fatigue = q(0.3);
    // Remove e2 (replace with e3)
    const e3 = mkHumanoidEntity(3, 1, 20_000, 0);
    next.entities = [next.entities[0]!, e3];

    const diff = diffWorldState(prev, next);
    expect(diff.removed).toContain(2);
    expect(diff.added[0]!.id).toBe(3);
    expect(diff.modified[0]!.id).toBe(1);
  });
});

// ── applyDiff ─────────────────────────────────────────────────────────────────

describe("applyDiff", () => {
  it("round-trips: applyDiff(prev, diff(prev,next)) ≈ next", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const prev = mkWorld(42, [e1]);
    const next  = deepClone(prev);
    next.tick = 5;
    next.entities[0]!.energy.fatigue = q(0.4);

    const diff = diffWorldState(prev, next);
    const reconstructed = applyDiff(prev, diff);

    expect(JSON.stringify(reconstructed)).toBe(JSON.stringify(next));
  });

  it("does not mutate base state", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const prev  = mkWorld(1, [e]);
    const next  = deepClone(prev);
    next.tick = 1;
    next.entities[0]!.energy.fatigue = q(0.8);

    const prevJSON = JSON.stringify(prev);
    const diff = diffWorldState(prev, next);
    applyDiff(prev, diff);

    expect(JSON.stringify(prev)).toBe(prevJSON);
  });

  it("adds new entities and sorts by id", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e3 = mkHumanoidEntity(3, 1, 0, 0);
    const prev = mkWorld(1, [e1]);
    const next  = mkWorld(1, [e1, e3]);
    next.tick = 1;

    const diff  = diffWorldState(prev, next);
    const result = applyDiff(prev, diff);

    expect(result.entities.map(e => e.id)).toEqual([1, 3]);
  });

  it("removes entities", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e2 = mkHumanoidEntity(2, 2, 0, 0);
    const prev = mkWorld(1, [e1, e2]);
    const next  = mkWorld(1, [e1]);
    next.tick = 1;

    const diff   = diffWorldState(prev, next);
    const result = applyDiff(prev, diff);

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.id).toBe(1);
  });

  it("applies empty diff without changes", () => {
    const w = mkWorld(42, [mkHumanoidEntity(1, 1, 0, 0)]);
    const diff = diffWorldState(w, deepClone(w));
    const result = applyDiff(w, diff);
    expect(JSON.stringify(result)).toBe(JSON.stringify(w));
  });

  it("chain of diffs: prev→mid→next round-trips correctly", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const prev = mkWorld(1, [e]);
    const mid  = deepClone(prev); mid.tick = 1;
    mid.entities[0]!.energy.fatigue = q(0.2);
    const next = deepClone(mid);  next.tick = 2;
    next.entities[0]!.energy.fatigue = q(0.5);

    const d1 = diffWorldState(prev, mid);
    const d2 = diffWorldState(mid,  next);
    const r1 = applyDiff(prev, d1);
    const r2 = applyDiff(r1,   d2);

    expect(JSON.stringify(r2)).toBe(JSON.stringify(next));
  });

  it("world-level subsystem changes are applied", () => {
    const prev = mkWorld(1, []);
    const next  = deepClone(prev);
    next.tick = 1;
    (next as { __nutritionAccum?: number }).__nutritionAccum = 500;

    const diff   = diffWorldState(prev, next);
    const result = applyDiff(prev, diff);
    expect((result as { __nutritionAccum?: number }).__nutritionAccum).toBe(500);
  });
});

// ── isDiffEmpty / diffStats ───────────────────────────────────────────────────

describe("isDiffEmpty", () => {
  it("returns true for identical states", () => {
    const w = mkWorld(1, []);
    expect(isDiffEmpty(diffWorldState(w, deepClone(w)))).toBe(true);
  });

  it("returns false when tick changes", () => {
    const prev = mkWorld(1, []);
    const next  = deepClone(prev); next.tick = 1;
    expect(isDiffEmpty(diffWorldState(prev, next))).toBe(false);
  });

  it("returns false when entity is added", () => {
    const prev = mkWorld(1, []);
    const next  = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    expect(isDiffEmpty(diffWorldState(prev, next))).toBe(false);
  });
});

describe("diffStats", () => {
  it("reports correct counts", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e2 = mkHumanoidEntity(2, 2, 0, 0);
    const e3 = mkHumanoidEntity(3, 1, 0, 0);
    const prev = mkWorld(1, [e1, e2]);
    const next  = deepClone(prev); next.tick = 1;
    next.entities[0]!.energy.fatigue = q(0.5);
    // Remove e2, add e3
    next.entities = [next.entities[0]!, deepClone(e3)];

    const diff  = diffWorldState(prev, next);
    const stats = diffStats(diff);

    expect(stats.worldChangedFields).toBe(1);   // tick
    expect(stats.addedEntities).toBe(1);         // e3
    expect(stats.removedEntities).toBe(1);       // e2
    expect(stats.modifiedEntities).toBe(1);      // e1
    expect(stats.totalEntityChanges).toBe(1);    // energy field
  });
});

// ── packDiff / unpackDiff ─────────────────────────────────────────────────────

describe("packDiff / unpackDiff", () => {
  function roundTrip(diff: WorldStateDiff): WorldStateDiff {
    return unpackDiff(packDiff(diff));
  }

  it("round-trips an empty diff", () => {
    const w    = mkWorld(42, []);
    const diff = diffWorldState(w, deepClone(w));
    const rt   = roundTrip(diff);
    expect(JSON.stringify(rt)).toBe(JSON.stringify(diff));
  });

  it("round-trips a diff with modified entity", () => {
    const e    = mkHumanoidEntity(1, 1, 0, 0);
    const prev = mkWorld(1, [e]);
    const next  = deepClone(prev); next.tick = 1;
    next.entities[0]!.energy.fatigue = q(0.4);
    const diff = diffWorldState(prev, next);
    const rt   = roundTrip(diff);
    expect(JSON.stringify(rt)).toBe(JSON.stringify(diff));
  });

  it("round-trips a diff with added and removed entities", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e2 = mkHumanoidEntity(2, 2, 10_000, 0);
    const prev = mkWorld(1, [e1, e2]);
    const next  = mkWorld(1, [e1, mkHumanoidEntity(3, 1, 20_000, 0)]);
    next.tick = 1;
    const diff = diffWorldState(prev, next);
    const rt   = roundTrip(diff);
    expect(JSON.stringify(rt)).toBe(JSON.stringify(diff));
  });

  it("returns a Uint8Array", () => {
    const w    = mkWorld(1, []);
    const diff = diffWorldState(w, deepClone(w));
    expect(packDiff(diff)).toBeInstanceOf(Uint8Array);
  });

  it("throws on bad magic bytes", () => {
    const bad = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x01]);
    expect(() => unpackDiff(bad)).toThrow(/magic/);
  });

  it("throws on unsupported version", () => {
    const w    = mkWorld(1, []);
    const bytes = packDiff(diffWorldState(w, deepClone(w)));
    // Mutate version byte (offset 4) to 99
    bytes[4] = 99;
    expect(() => unpackDiff(bytes)).toThrow(/version/);
  });

  it("binary size is smaller than full JSON for unchanged state", () => {
    const entities = Array.from({ length: 5 }, (_, i) => mkHumanoidEntity(i + 1, 1, i * 10_000, 0));
    const prev = mkWorld(1, entities);
    const next  = deepClone(prev); next.tick = 1;
    // Only one entity changes
    next.entities[0]!.energy.fatigue = q(0.3);

    const diff = diffWorldState(prev, next);
    const binary = packDiff(diff);
    const fullJson = new TextEncoder().encode(JSON.stringify(next));

    // Binary diff of one entity change << full state JSON
    expect(binary.length).toBeLessThan(fullJson.length);
  });

  it("applyDiff(prev, unpackDiff(packDiff(diff))) round-trips correctly", () => {
    const e    = mkHumanoidEntity(1, 1, 0, 0);
    const prev = mkWorld(42, [e]);
    const next  = deepClone(prev); next.tick = 7;
    next.entities[0]!.energy.fatigue = q(0.6);

    const diff        = diffWorldState(prev, next);
    const binary      = packDiff(diff);
    const decoded     = unpackDiff(binary);
    const reconstructed = applyDiff(prev, decoded);

    expect(JSON.stringify(reconstructed)).toBe(JSON.stringify(next));
  });

  it("round-trips boolean, null, float, large int values", () => {
    const w    = mkWorld(1, []);
    const next  = deepClone(w); next.tick = 1;
    (next as Record<string, unknown>).__nutritionAccum = 3.14159;
    const diff = diffWorldState(w, next);
    const rt   = roundTrip(diff);
    expect(rt.worldChanges["__nutritionAccum"]).toBeCloseTo(3.14159, 5);
  });

  it("round-trips negative integers", () => {
    const w    = mkWorld(1, []);
    const next  = deepClone(w); next.tick = -5;
    const diff = diffWorldState(w, next);
    const rt   = roundTrip(diff);
    expect(rt.tick).toBe(-5);
  });
});
