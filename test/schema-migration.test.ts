import { describe, it, expect } from "vitest";
import {
  SCHEMA_VERSION,
  stampSnapshot,
  validateSnapshot,
  migrateWorld,
  registerMigration,
  detectVersion,
  isValidSnapshot,
} from "../src/schema-migration.js";

// ── Minimal valid world snapshot ───────────────────────────────────────────────

function makeEntity(id: number) {
  return {
    id,
    teamId: 1,
    attributes: { performance: {}, resilience: {} },
    energy:     { stamina_J: 10000 },
    loadout:    { weapon: null, armour: [] },
    traits:     [],
  };
}

function makeWorld() {
  return {
    tick:     0,
    seed:     42,
    entities: [makeEntity(1), makeEntity(2)],
  };
}

// ── stampSnapshot ──────────────────────────────────────────────────────────────

describe("stampSnapshot", () => {
  it("adds _ananke_version to the snapshot", () => {
    const world = makeWorld();
    const stamped = stampSnapshot(world, "world");
    expect(stamped._ananke_version).toBe(SCHEMA_VERSION);
  });

  it("adds _schema to the snapshot", () => {
    const world = makeWorld();
    const stamped = stampSnapshot(world, "world");
    expect(stamped._schema).toBe("world");
  });

  it("does not mutate the original object", () => {
    const world = makeWorld();
    stampSnapshot(world, "world");
    expect((world as Record<string, unknown>)["_ananke_version"]).toBeUndefined();
  });

  it("preserves all original fields", () => {
    const world = makeWorld();
    const stamped = stampSnapshot(world, "world");
    expect(stamped.tick).toBe(0);
    expect(stamped.seed).toBe(42);
    expect(stamped.entities).toHaveLength(2);
  });

  it("stamps replay schema kind", () => {
    const replay = { initialState: makeWorld(), frames: [] };
    const stamped = stampSnapshot(replay, "replay");
    expect(stamped._schema).toBe("replay");
  });

  it("stamps campaign schema kind", () => {
    const stamped = stampSnapshot({ tick: 0 }, "campaign");
    expect(stamped._schema).toBe("campaign");
  });
});

// ── validateSnapshot ───────────────────────────────────────────────────────────

describe("validateSnapshot", () => {
  it("returns no errors for a minimal valid snapshot", () => {
    const errors = validateSnapshot(makeWorld());
    expect(errors).toHaveLength(0);
  });

  it("returns no errors for a stamped snapshot", () => {
    const errors = validateSnapshot(stampSnapshot(makeWorld(), "world"));
    expect(errors).toHaveLength(0);
  });

  it("returns error when snapshot is null", () => {
    const errors = validateSnapshot(null);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.path).toBe("$");
  });

  it("returns error when snapshot is a primitive", () => {
    expect(validateSnapshot("string")).toHaveLength(1);
    expect(validateSnapshot(42)).toHaveLength(1);
  });

  it("returns error when snapshot is an array", () => {
    const errors = validateSnapshot([]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.path).toBe("$");
  });

  it("returns error when tick is missing", () => {
    const snap = { seed: 1, entities: [] };
    const errors = validateSnapshot(snap);
    expect(errors.some(e => e.path === "$.tick")).toBe(true);
  });

  it("returns error when tick is negative", () => {
    const snap = { tick: -1, seed: 1, entities: [] };
    const errors = validateSnapshot(snap);
    expect(errors.some(e => e.path === "$.tick")).toBe(true);
  });

  it("returns error when tick is a float", () => {
    const snap = { tick: 1.5, seed: 1, entities: [] };
    const errors = validateSnapshot(snap);
    expect(errors.some(e => e.path === "$.tick")).toBe(true);
  });

  it("returns error when seed is missing", () => {
    const snap = { tick: 0, entities: [] };
    const errors = validateSnapshot(snap);
    expect(errors.some(e => e.path === "$.seed")).toBe(true);
  });

  it("returns error when entities is not an array", () => {
    const snap = { tick: 0, seed: 1, entities: "oops" };
    const errors = validateSnapshot(snap);
    expect(errors.some(e => e.path === "$.entities")).toBe(true);
  });

  it("returns error when an entity is missing id", () => {
    const world = makeWorld();
    delete (world.entities[0] as Record<string, unknown>)["id"];
    const errors = validateSnapshot(world);
    expect(errors.some(e => e.path === "$.entities[0].id")).toBe(true);
  });

  it("returns error when an entity id is negative", () => {
    const world = makeWorld();
    (world.entities[0] as Record<string, unknown>)["id"] = -1;
    const errors = validateSnapshot(world);
    expect(errors.some(e => e.path === "$.entities[0].id")).toBe(true);
  });

  it("returns error when an entity is missing teamId", () => {
    const world = makeWorld();
    delete (world.entities[0] as Record<string, unknown>)["teamId"];
    const errors = validateSnapshot(world);
    expect(errors.some(e => e.path === "$.entities[0].teamId")).toBe(true);
  });

  it("returns error when entity attributes is not an object", () => {
    const world = makeWorld();
    (world.entities[0] as Record<string, unknown>)["attributes"] = null;
    const errors = validateSnapshot(world);
    expect(errors.some(e => e.path === "$.entities[0].attributes")).toBe(true);
  });

  it("returns error when entity energy is not an object", () => {
    const world = makeWorld();
    (world.entities[0] as Record<string, unknown>)["energy"] = 42;
    const errors = validateSnapshot(world);
    expect(errors.some(e => e.path === "$.entities[0].energy")).toBe(true);
  });

  it("returns error when entity loadout is missing", () => {
    const world = makeWorld();
    delete (world.entities[0] as Record<string, unknown>)["loadout"];
    const errors = validateSnapshot(world);
    expect(errors.some(e => e.path === "$.entities[0].loadout")).toBe(true);
  });

  it("returns error when entity traits is not an array", () => {
    const world = makeWorld();
    (world.entities[0] as Record<string, unknown>)["traits"] = "warrior";
    const errors = validateSnapshot(world);
    expect(errors.some(e => e.path === "$.entities[0].traits")).toBe(true);
  });

  it("accepts snapshots with extra subsystem fields", () => {
    const world = {
      ...makeWorld(),
      __factionRegistry: { standings: {} },
      __nutritionAccum:  0,
      _host_custom_field: "any value is allowed",
    };
    const errors = validateSnapshot(world);
    expect(errors).toHaveLength(0);
  });

  it("errors include a path and message", () => {
    const errors = validateSnapshot({ seed: 1, entities: [] });
    expect(errors[0]).toHaveProperty("path");
    expect(errors[0]).toHaveProperty("message");
  });
});

// ── detectVersion ──────────────────────────────────────────────────────────────

describe("detectVersion", () => {
  it("returns the version from a stamped snapshot", () => {
    const stamped = stampSnapshot(makeWorld(), "world");
    expect(detectVersion(stamped)).toBe(SCHEMA_VERSION);
  });

  it("returns undefined for a legacy snapshot without version", () => {
    expect(detectVersion(makeWorld())).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(detectVersion(null)).toBeUndefined();
  });

  it("returns undefined for a primitive", () => {
    expect(detectVersion(42)).toBeUndefined();
  });
});

// ── isValidSnapshot ────────────────────────────────────────────────────────────

describe("isValidSnapshot", () => {
  it("returns true for a valid stamped snapshot", () => {
    expect(isValidSnapshot(stampSnapshot(makeWorld(), "world"))).toBe(true);
  });

  it("returns false when version stamp is missing", () => {
    expect(isValidSnapshot(makeWorld())).toBe(false);
  });

  it("returns false when snapshot is structurally invalid", () => {
    const bad = stampSnapshot({ tick: -1, seed: 1, entities: [] }, "world");
    expect(isValidSnapshot(bad)).toBe(false);
  });
});

// ── migrateWorld ───────────────────────────────────────────────────────────────

describe("migrateWorld", () => {
  it("returns snapshot unchanged when already at current version", () => {
    const world = stampSnapshot(makeWorld(), "world") as Record<string, unknown>;
    const result = migrateWorld(world);
    expect(result).toBe(world); // same reference
  });

  it("returns snapshot unchanged when toVersion matches _ananke_version", () => {
    const world = stampSnapshot(makeWorld(), "world") as Record<string, unknown>;
    const result = migrateWorld(world, SCHEMA_VERSION);
    expect(result).toBe(world);
  });

  it("treats snapshots without _ananke_version as version 0.0", () => {
    registerMigration("0.0", "0.1-test", snap => ({ ...snap, migrated: true }));
    const world = makeWorld() as Record<string, unknown>;
    const result = migrateWorld(world, "0.1-test");
    expect((result as Record<string, unknown>)["migrated"]).toBe(true);
  });

  it("throws when no migration path exists", () => {
    const world = stampSnapshot(makeWorld(), "world") as Record<string, unknown>;
    expect(() => migrateWorld(world, "99.99")).toThrow(/No migration/);
  });

  it("executes a registered migration function", () => {
    registerMigration("0.0", "migration-test", snap => ({ ...snap, extra: "added" }));
    const world = makeWorld() as Record<string, unknown>;
    const result = migrateWorld(world, "migration-test");
    expect((result as Record<string, unknown>)["extra"]).toBe("added");
  });

  it("does not mutate the original snapshot", () => {
    registerMigration("0.0", "no-mutate-test", snap => ({ ...snap, x: 1 }));
    const world = makeWorld() as Record<string, unknown>;
    migrateWorld(world, "no-mutate-test");
    expect((world as Record<string, unknown>)["x"]).toBeUndefined();
  });

  it("error message includes registered paths when migration is missing", () => {
    registerMigration("0.1", "0.2-registered", snap => snap);
    const world = stampSnapshot(makeWorld(), "world") as Record<string, unknown>;
    try {
      migrateWorld(world, "0.9-never");
    } catch (e) {
      expect(String(e)).toContain("0.1->0.2-registered");
    }
  });
});
