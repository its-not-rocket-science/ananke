import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  validatePack,
  loadPack,
  getLoadedPack,
  listLoadedPacks,
  getPackScenario,
  instantiatePackScenario,
  clearPackRegistry,
  type AnankePackManifest,
} from "../src/content-pack.js";
import { clearCatalog } from "../src/catalog.js";
import { clearWorldExtensions } from "../src/world-factory.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const UNIQUE = `test_${Date.now()}`;

function uid(name: string) { return `${UNIQUE}_${name}`; }

function makeWeapon(id: string) {
  return {
    id,
    name: "Test Weapon",
    mass_kg: 1.0,
    bulk: 0.3,
    damage: {
      surfaceFrac:     0.30,
      internalFrac:    0.20,
      structuralFrac:  0.05,
      bleedFactor:     0.30,
      penetrationBias: 0.40,
    },
  };
}

function makeArmour(id: string) {
  return {
    id,
    name: "Test Armour",
    mass_kg: 5.0,
    bulk: 0.25,
    resist_J: 100,
    protectedDamageMul: 0.4,
    coverageByRegion: { torso: 0.90 },
    protects: ["Kinetic"],
  };
}

function makeArchetype(id: string) {
  return { id, base: "HUMAN_BASE" };
}

function makeScenario(id: string, archetypeId: string, weaponId: string) {
  return {
    id,
    seed: 1,
    maxTicks: 50,
    entities: [
      { id: 1, teamId: 1, archetype: archetypeId, weapon: weaponId },
      { id: 2, teamId: 2, archetype: archetypeId, weapon: weaponId },
    ],
  };
}

function makePack(suffix: string): AnankePackManifest {
  return {
    name:    `test-pack-${suffix}`,
    version: "1.0.0",
    weapons: [makeWeapon(uid(`w_${suffix}`))],
    armour:  [makeArmour(uid(`a_${suffix}`))],
    archetypes: [makeArchetype(uid(`arch_${suffix}`))],
  };
}

afterEach(() => {
  clearPackRegistry();
  clearCatalog();
  clearWorldExtensions();
});

// ── validatePack ──────────────────────────────────────────────────────────────

describe("validatePack", () => {
  it("returns no errors for a minimal valid pack", () => {
    const errors = validatePack({ name: "p", version: "1.0.0" });
    expect(errors).toHaveLength(0);
  });

  it("returns error when manifest is not an object", () => {
    expect(validatePack(null)).toHaveLength(1);
    expect(validatePack([])).toHaveLength(1);
    expect(validatePack("string")).toHaveLength(1);
  });

  it("returns error when name is missing", () => {
    const errors = validatePack({ version: "1.0.0" });
    expect(errors.some(e => e.path === "$.name")).toBe(true);
  });

  it("returns error when name is empty string", () => {
    const errors = validatePack({ name: "", version: "1.0.0" });
    expect(errors.some(e => e.path === "$.name")).toBe(true);
  });

  it("returns error when version is missing", () => {
    const errors = validatePack({ name: "p" });
    expect(errors.some(e => e.path === "$.version")).toBe(true);
  });

  it("returns error when version is not semver-like", () => {
    const errors = validatePack({ name: "p", version: "latest" });
    expect(errors.some(e => e.path === "$.version")).toBe(true);
  });

  it("accepts version with patch number", () => {
    expect(validatePack({ name: "p", version: "1.2.3" })).toHaveLength(0);
  });

  it("returns error when weapons is not an array", () => {
    const errors = validatePack({ name: "p", version: "1.0", weapons: "oops" });
    expect(errors.some(e => e.path === "$.weapons")).toBe(true);
  });

  it("validates weapon entry fields", () => {
    const badWeapon = { id: "w", name: "W", mass_kg: -1 };
    const errors = validatePack({ name: "p", version: "1.0", weapons: [badWeapon] });
    expect(errors.some(e => e.path === "$.weapons[0].mass_kg")).toBe(true);
  });

  it("returns error when weapon is missing damage object", () => {
    const badWeapon = { id: "w", name: "W", mass_kg: 1.0 };
    const errors = validatePack({ name: "p", version: "1.0", weapons: [badWeapon] });
    expect(errors.some(e => e.path === "$.weapons[0].damage")).toBe(true);
  });

  it("validates armour entry fields", () => {
    const badArmour = { id: "a", name: "A", mass_kg: 5.0 }; // missing resist_J
    const errors = validatePack({ name: "p", version: "1.0", armour: [badArmour] });
    expect(errors.some(e => e.path === "$.armour[0].resist_J")).toBe(true);
  });

  it("validates archetype entry has id", () => {
    const errors = validatePack({ name: "p", version: "1.0", archetypes: [{ base: "HUMAN_BASE" }] });
    expect(errors.some(e => e.path === "$.archetypes[0].id")).toBe(true);
  });

  it("validates embedded scenarios", () => {
    const badScenario = { id: "s" }; // missing seed, maxTicks, entities
    const errors = validatePack({ name: "p", version: "1.0", scenarios: [badScenario] });
    expect(errors.some(e => e.path === "$.scenarios[0]")).toBe(true);
  });

  it("each error has path and message fields", () => {
    const errors = validatePack({ version: "1.0" });
    expect(errors[0]).toHaveProperty("path");
    expect(errors[0]).toHaveProperty("message");
  });
});

// ── loadPack ──────────────────────────────────────────────────────────────────

describe("loadPack", () => {
  it("returns errors without loading when manifest is invalid", () => {
    const result = loadPack({ name: "", version: "1.0.0" });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.registeredIds).toHaveLength(0);
  });

  it("registers weapons into the catalog", () => {
    const pack = makePack("w_reg");
    const result = loadPack(pack);
    expect(result.errors).toHaveLength(0);
    expect(result.registeredIds.some(id => id.startsWith("weapon:"))).toBe(true);
  });

  it("registers armour into the catalog", () => {
    const pack = makePack("a_reg");
    const result = loadPack(pack);
    expect(result.registeredIds.some(id => id.startsWith("armour:"))).toBe(true);
  });

  it("registers archetypes into the catalog", () => {
    const pack = makePack("arch_reg");
    const result = loadPack(pack);
    expect(result.registeredIds.some(id => id.startsWith("archetype:"))).toBe(true);
  });

  it("returns a non-empty fingerprint on success", () => {
    const result = loadPack(makePack("fp"));
    expect(result.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it("returns the packId as name@version", () => {
    const result = loadPack(makePack("pid"));
    expect(result.packId).toBe(`test-pack-pid@1.0.0`);
  });

  it("is idempotent — loading the same pack twice returns success with no errors", () => {
    const pack = makePack("idem");
    loadPack(pack);
    const second = loadPack(pack);
    expect(second.errors).toHaveLength(0);
    expect(second.packId).toBe(`test-pack-idem@1.0.0`);
  });

  it("stores scenarios in the pack registry", () => {
    const archId = uid("arch_scen");
    const weapId = uid("w_scen");
    const pack: AnankePackManifest = {
      name: "test-pack-scen",
      version: "1.0.0",
      archetypes: [makeArchetype(archId)],
      weapons: [makeWeapon(weapId)],
      scenarios: [makeScenario("duel_test", archId, weapId)],
    };
    const result = loadPack(pack);
    expect(result.scenarioIds).toContain("duel_test");
  });
});

// ── getLoadedPack ──────────────────────────────────────────────────────────────

describe("getLoadedPack", () => {
  it("returns undefined for unloaded pack", () => {
    expect(getLoadedPack("unknown@1.0.0")).toBeUndefined();
  });

  it("returns result after loading", () => {
    const pack = makePack("get");
    const { packId } = loadPack(pack);
    const entry = getLoadedPack(packId);
    expect(entry).toBeDefined();
    expect(entry!.packId).toBe(packId);
  });
});

// ── listLoadedPacks ────────────────────────────────────────────────────────────

describe("listLoadedPacks", () => {
  it("returns empty array when no packs loaded", () => {
    expect(listLoadedPacks()).toHaveLength(0);
  });

  it("returns packId after loading", () => {
    const { packId } = loadPack(makePack("list"));
    expect(listLoadedPacks()).toContain(packId);
  });
});

// ── getPackScenario / instantiatePackScenario ──────────────────────────────────

describe("getPackScenario", () => {
  it("returns undefined for unknown pack", () => {
    expect(getPackScenario("ghost@1.0.0", "duel")).toBeUndefined();
  });

  it("returns undefined for unknown scenario in a loaded pack", () => {
    const { packId } = loadPack(makePack("no_scen"));
    expect(getPackScenario(packId, "missing")).toBeUndefined();
  });

  it("returns the scenario JSON when present", () => {
    const archId = uid("arch_gs");
    const weapId = uid("w_gs");
    const scenId = "duel_gs";
    const pack: AnankePackManifest = {
      name: "test-pack-gs",
      version: "1.0.0",
      archetypes: [makeArchetype(archId)],
      weapons: [makeWeapon(weapId)],
      scenarios: [makeScenario(scenId, archId, weapId)],
    };
    const { packId } = loadPack(pack);
    const raw = getPackScenario(packId, scenId);
    expect(raw).toBeDefined();
    expect((raw as Record<string, unknown>)["id"]).toBe(scenId);
  });
});

describe("instantiatePackScenario", () => {
  it("throws for unknown pack", () => {
    expect(() => instantiatePackScenario("ghost@1.0.0", "duel")).toThrow(/not found/);
  });

  it("returns a WorldState from a valid scenario", () => {
    const archId = uid("arch_inst");
    const weapId = uid("w_inst");
    const scenId = "duel_inst";
    const pack: AnankePackManifest = {
      name: "test-pack-inst",
      version: "1.0.0",
      archetypes: [makeArchetype(archId)],
      weapons: [makeWeapon(weapId)],
      scenarios: [makeScenario(scenId, archId, weapId)],
    };
    const { packId } = loadPack(pack);
    const world = instantiatePackScenario(packId, scenId);
    expect(world.tick).toBe(0);
    expect(world.entities).toHaveLength(2);
  });
});

// ── clearPackRegistry ──────────────────────────────────────────────────────────

describe("clearPackRegistry", () => {
  it("empties the registry", () => {
    loadPack(makePack("clr"));
    clearPackRegistry();
    expect(listLoadedPacks()).toHaveLength(0);
  });
});
