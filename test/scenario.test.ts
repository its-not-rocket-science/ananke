/**
 * CE-3: Tests for validateScenario() and loadScenario() (src/scenario.ts).
 */
import { describe, it, expect } from "vitest";
import { validateScenario, loadScenario, type AnankeScenario } from "../src/scenario";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeValidScenario(overrides: Partial<AnankeScenario> = {}): AnankeScenario {
  return {
    id:       "test_scenario",
    seed:     42,
    maxTicks: 1000,
    entities: [
      { id: 1, teamId: 1, archetype: "HUMAN_BASE", weapon: "wpn_longsword" },
      { id: 2, teamId: 2, archetype: "HUMAN_BASE", weapon: "wpn_knife" },
    ],
    ...overrides,
  };
}

// ── validateScenario ──────────────────────────────────────────────────────────

describe("validateScenario", () => {
  it("returns empty array for a valid scenario", () => {
    const errors = validateScenario(makeValidScenario());
    expect(errors).toEqual([]);
  });

  it("errors when input is not a plain object (null)", () => {
    const errors = validateScenario(null);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/plain object/);
  });

  it("errors when input is not a plain object (array)", () => {
    const errors = validateScenario([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("errors on missing id field", () => {
    const { id: _omit, ...noId } = makeValidScenario();
    const errors = validateScenario(noId);
    expect(errors.some(e => e.includes("id"))).toBe(true);
  });

  it("errors on empty string id", () => {
    const errors = validateScenario(makeValidScenario({ id: "" }));
    expect(errors.some(e => e.includes("id"))).toBe(true);
  });

  it("errors on missing seed field", () => {
    const { seed: _omit, ...noSeed } = makeValidScenario();
    const errors = validateScenario(noSeed);
    expect(errors.some(e => e.includes("seed"))).toBe(true);
  });

  it("errors on non-positive seed", () => {
    const errors = validateScenario(makeValidScenario({ seed: 0 }));
    expect(errors.some(e => e.includes("seed"))).toBe(true);
  });

  it("errors on missing maxTicks field", () => {
    const { maxTicks: _omit, ...noMax } = makeValidScenario();
    const errors = validateScenario(noMax);
    expect(errors.some(e => e.includes("maxTicks"))).toBe(true);
  });

  it("errors on non-positive maxTicks", () => {
    const errors = validateScenario(makeValidScenario({ maxTicks: -1 }));
    expect(errors.some(e => e.includes("maxTicks"))).toBe(true);
  });

  it("errors on empty entities array", () => {
    const errors = validateScenario(makeValidScenario({ entities: [] }));
    expect(errors.some(e => e.includes("entities"))).toBe(true);
  });

  it("errors on missing entities field", () => {
    const { entities: _omit, ...noEntities } = makeValidScenario();
    const errors = validateScenario(noEntities);
    expect(errors.some(e => e.includes("entities"))).toBe(true);
  });

  it("errors on duplicate entity ids", () => {
    const errors = validateScenario(
      makeValidScenario({
        entities: [
          { id: 1, teamId: 1, archetype: "HUMAN_BASE", weapon: "wpn_longsword" },
          { id: 1, teamId: 2, archetype: "HUMAN_BASE", weapon: "wpn_knife" },
        ],
      }),
    );
    expect(errors.some(e => e.includes("duplicate"))).toBe(true);
  });

  it("errors when entity is missing weapon field", () => {
    const errors = validateScenario(
      makeValidScenario({
        entities: [
          { id: 1, teamId: 1, archetype: "HUMAN_BASE" } as unknown as AnankeScenario["entities"][number],
        ],
      }),
    );
    expect(errors.some(e => e.includes("weapon"))).toBe(true);
  });

  it("accumulates multiple errors at once", () => {
    const errors = validateScenario({ id: "", seed: -1, maxTicks: 0, entities: [] });
    expect(errors.length).toBeGreaterThan(1);
  });
});

// ── loadScenario ──────────────────────────────────────────────────────────────

describe("loadScenario", () => {
  it("returns a WorldState for valid JSON", () => {
    const world = loadScenario(makeValidScenario());
    expect(world.tick).toBe(0);
    expect(world.entities).toHaveLength(2);
  });

  it("passes seed through to WorldState", () => {
    const world = loadScenario(makeValidScenario({ seed: 99 }));
    expect(world.seed).toBe(99);
  });

  it("throws when validateScenario fails", () => {
    expect(() => loadScenario(null)).toThrow(/invalid scenario/);
  });

  it("throws with descriptive message listing all errors", () => {
    expect(() => loadScenario({ id: "", seed: -1, maxTicks: 0, entities: [] })).toThrow(
      /invalid scenario/,
    );
  });

  it("does not throw when tractionCoeff is omitted", () => {
    const scenario = makeValidScenario();
    expect(() => loadScenario(scenario)).not.toThrow();
  });

  it("does not throw when optional $schema is present", () => {
    const scenario = makeValidScenario({ $schema: "https://example.com/schema.json" });
    expect(() => loadScenario(scenario)).not.toThrow();
  });

  it("loads scenario with armour field on entity", () => {
    const world = loadScenario(
      makeValidScenario({
        entities: [
          { id: 1, teamId: 1, archetype: "KNIGHT_INFANTRY", weapon: "wpn_longsword", armour: "arm_plate" },
          { id: 2, teamId: 2, archetype: "HUMAN_BASE",      weapon: "wpn_knife" },
        ],
      }),
    );
    const knight = world.entities.find(e => e.id === 1)!;
    expect(knight.loadout.items.map(i => i.id)).toContain("arm_plate");
  });

  it("loads scenario with explicit x_m and y_m positions", () => {
    const world = loadScenario(
      makeValidScenario({
        entities: [
          { id: 1, teamId: 1, archetype: "HUMAN_BASE", weapon: "wpn_knife", x_m: 1.0, y_m: 0.5 },
        ],
      }),
    );
    const entity = world.entities[0]!;
    // Just verify it didn't throw and position was set (not 0)
    expect(entity.position_m.x).toBeGreaterThan(0);
    expect(entity.position_m.y).toBeGreaterThan(0);
  });

  it("throws when archetype is unknown (simulation lookup)", () => {
    expect(() =>
      loadScenario(
        makeValidScenario({
          entities: [
            { id: 1, teamId: 1, archetype: "MADE_UP_RACE", weapon: "wpn_longsword" },
          ],
        }),
      ),
    ).toThrow(/unknown archetype/);
  });

  it("throws when weapon is unknown (simulation lookup)", () => {
    expect(() =>
      loadScenario(
        makeValidScenario({
          entities: [
            { id: 1, teamId: 1, archetype: "HUMAN_BASE", weapon: "wpn_does_not_exist" },
          ],
        }),
      ),
    ).toThrow(/unknown weaponId/);
  });
});
