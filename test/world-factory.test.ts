/**
 * CE-2: Tests for createWorld() convenience factory (src/world-factory.ts).
 */
import { describe, it, expect } from "vitest";
import { SCALE } from "../src/units";
import {
  createWorld,
  ARCHETYPE_MAP,
  ITEM_MAP,
  type EntitySpec,
} from "../src/world-factory";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeSpec(overrides: Partial<EntitySpec> & Pick<EntitySpec, "id" | "teamId">): EntitySpec {
  return {
    seed:      overrides.id,
    archetype: "HUMAN_BASE",
    weaponId:  "wpn_longsword",
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("createWorld", () => {
  it("produces tick=0 with correct seed for two entities", () => {
    const world = createWorld(42, [
      makeSpec({ id: 1, teamId: 1 }),
      makeSpec({ id: 2, teamId: 2 }),
    ]);
    expect(world.tick).toBe(0);
    expect(world.seed).toBe(42);
    expect(world.entities).toHaveLength(2);
  });

  it("sorts entities by id regardless of input order", () => {
    const world = createWorld(1, [
      makeSpec({ id: 5, teamId: 2 }),
      makeSpec({ id: 1, teamId: 1 }),
      makeSpec({ id: 3, teamId: 2 }),
    ]);
    const ids = world.entities.map(e => e.id);
    expect(ids).toEqual([1, 3, 5]);
  });

  it("throws on duplicate entity ids", () => {
    expect(() =>
      createWorld(1, [
        makeSpec({ id: 1, teamId: 1 }),
        makeSpec({ id: 1, teamId: 2 }),
      ]),
    ).toThrow(/duplicate entity IDs/);
  });

  it("throws on unknown archetype", () => {
    expect(() =>
      createWorld(1, [makeSpec({ id: 1, teamId: 1, archetype: "DOES_NOT_EXIST" })]),
    ).toThrow(/unknown archetype/);
  });

  it("throws on unknown weaponId", () => {
    expect(() =>
      createWorld(1, [makeSpec({ id: 1, teamId: 1, weaponId: "no_such_weapon" })]),
    ).toThrow(/unknown weaponId/);
  });

  it("throws on unknown armourId when provided", () => {
    expect(() =>
      createWorld(1, [makeSpec({ id: 1, teamId: 1, armourId: "arm_nonexistent" })]),
    ).toThrow(/unknown armourId/);
  });

  it("includes valid armourId in entity loadout", () => {
    const world = createWorld(1, [
      makeSpec({ id: 1, teamId: 1, armourId: "arm_plate" }),
    ]);
    const entity = world.entities[0]!;
    const armourIds = entity.loadout.items.map(i => i.id);
    expect(armourIds).toContain("arm_plate");
    expect(armourIds).toContain("wpn_longsword");
    expect(entity.loadout.items).toHaveLength(2);
  });

  it("team 1 entity defaults to x=0", () => {
    const world = createWorld(1, [makeSpec({ id: 1, teamId: 1 })]);
    expect(world.entities[0]!.position_m.x).toBe(0);
  });

  it("team 2 entity defaults to x=0.6m in fixed-point", () => {
    const world = createWorld(1, [makeSpec({ id: 2, teamId: 2 })]);
    const expectedX = Math.round(0.6 * SCALE.m);
    expect(world.entities[0]!.position_m.x).toBe(expectedX);
  });

  it("explicit x_m and y_m override defaults", () => {
    const world = createWorld(1, [
      makeSpec({ id: 1, teamId: 1, x_m: 1.5, y_m: 2.0 }),
    ]);
    const entity = world.entities[0]!;
    expect(entity.position_m.x).toBe(Math.round(1.5 * SCALE.m));
    expect(entity.position_m.y).toBe(Math.round(2.0 * SCALE.m));
  });

  it("energy.reserveEnergy_J comes from generated attributes", () => {
    const world = createWorld(1, [makeSpec({ id: 1, teamId: 1 })]);
    const entity = world.entities[0]!;
    expect(entity.energy.reserveEnergy_J).toBe(
      entity.attributes.performance.reserveEnergy_J,
    );
  });

  it("entity has zero fatigue and zero velocity at creation", () => {
    const world = createWorld(1, [makeSpec({ id: 1, teamId: 1 })]);
    const entity = world.entities[0]!;
    expect(entity.energy.fatigue).toBe(0);
    expect(entity.velocity_mps.x).toBe(0);
    expect(entity.velocity_mps.y).toBe(0);
    expect(entity.velocity_mps.z).toBe(0);
  });

  it("entity has grapple state with standing position", () => {
    const world = createWorld(1, [makeSpec({ id: 1, teamId: 1 })]);
    const entity = world.entities[0]!;
    expect(entity.grapple.position).toBe("standing");
    expect(entity.grapple.holdingTargetId).toBe(0);
  });

  it("uses different archetype correctly — ELF has different stature from HUMAN_BASE", () => {
    const worldHuman = createWorld(1, [makeSpec({ id: 1, teamId: 1, archetype: "HUMAN_BASE" })]);
    const worldElf   = createWorld(1, [makeSpec({ id: 1, teamId: 1, archetype: "ELF" })]);
    // Elf stature_m is 1.85m vs human 1.75m — morphology will differ
    const humanStature = worldHuman.entities[0]!.attributes.morphology.stature_m;
    const elfStature   = worldElf.entities[0]!.attributes.morphology.stature_m;
    expect(elfStature).toBeGreaterThan(humanStature);
  });
});

describe("ARCHETYPE_MAP", () => {
  it("contains HUMAN_BASE", () => {
    expect(ARCHETYPE_MAP.has("HUMAN_BASE")).toBe(true);
  });

  it("contains KNIGHT_INFANTRY", () => {
    expect(ARCHETYPE_MAP.has("KNIGHT_INFANTRY")).toBe(true);
  });

  it("contains ELF (species archetype)", () => {
    expect(ARCHETYPE_MAP.has("ELF")).toBe(true);
  });

  it("contains all 14 species keys", () => {
    const speciesKeys = [
      "ELF", "DWARF", "HALFLING", "ORC", "OGRE", "GOBLIN", "TROLL",
      "VULCAN", "KLINGON", "ROMULAN", "DRAGON", "CENTAUR", "SATYR", "HEECHEE",
    ];
    for (const key of speciesKeys) {
      expect(ARCHETYPE_MAP.has(key), `Missing key: ${key}`).toBe(true);
    }
  });
});

describe("ITEM_MAP", () => {
  it("contains wpn_longsword", () => {
    expect(ITEM_MAP.has("wpn_longsword")).toBe(true);
  });

  it("contains arm_plate", () => {
    expect(ITEM_MAP.has("arm_plate")).toBe(true);
  });

  it("contains items from historical weapons (ALL_HISTORICAL_MELEE)", () => {
    // wpn_hand_axe is the first item in PREHISTORIC_MELEE
    expect(ITEM_MAP.has("wpn_hand_axe")).toBe(true);
  });

  it("contains items from STARTER_ARMOUR_11C", () => {
    expect(ITEM_MAP.has("arm_reflective")).toBe(true);
  });
});
