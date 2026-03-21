// test/catalog.test.ts
//
// CE-12 — Data-Driven Entity Catalog
//
// Verifies:
//   1. registerArchetype — base inheritance, unit conversion, overrides, error handling
//   2. registerWeapon    — required/optional fields, unit conversion, validation
//   3. registerArmour   — coverageByRegion, channel mask, optional fields
//   4. getCatalogEntry  — lookup, missing entry
//   5. listCatalog      — by kind, all
//   6. unregister / clear
//   7. Duplicate id rejection

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  registerArchetype,
  registerWeapon,
  registerArmour,
  getCatalogEntry,
  listCatalog,
  unregisterCatalogEntry,
  clearCatalog,
} from "../src/catalog.js";

import { SCALE, to, q } from "../src/units.js";
import { HUMAN_BASE, AMATEUR_BOXER, SERVICE_ROBOT } from "../src/archetypes.js";
import { DamageChannel, hasChannel } from "../src/channels.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Unique id helper to avoid cross-test collisions when clearCatalog is not called. */
let _uid = 0;
function uid(prefix: string): string { return `${prefix}_${++_uid}`; }

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => clearCatalog());
afterEach(()  => clearCatalog());

// ── 1 · registerArchetype ─────────────────────────────────────────────────────

describe("registerArchetype", () => {

  it("inherits all fields from HUMAN_BASE by default", () => {
    const id = uid("arch");
    const arch = registerArchetype({ id, base: "HUMAN_BASE", overrides: {} });
    expect(arch.mass_kg).toBe(HUMAN_BASE.mass_kg);
    expect(arch.peakForce_N).toBe(HUMAN_BASE.peakForce_N);
  });

  it("overrides mass_kg with kg unit conversion", () => {
    const id = uid("arch");
    const arch = registerArchetype({ id, overrides: { mass_kg: 110 } });
    // 110 real kg → to.kg(110) = 110 * SCALE.kg
    expect(arch.mass_kg).toBe(to.kg(110));
  });

  it("overrides stature_m with metre unit conversion", () => {
    const id = uid("arch");
    const arch = registerArchetype({ id, overrides: { stature_m: 2.1 } });
    expect(arch.stature_m).toBe(to.m(2.1));
  });

  it("overrides peakForce_N with Newton unit conversion", () => {
    const id = uid("arch");
    const arch = registerArchetype({ id, overrides: { peakForce_N: 3200 } });
    expect(arch.peakForce_N).toBe(to.N(3200));
  });

  it("overrides reserveEnergy_J with Joule conversion (SCALE.J=1, trivial)", () => {
    const id = uid("arch");
    const arch = registerArchetype({ id, overrides: { reserveEnergy_J: 25000 } });
    expect(arch.reserveEnergy_J).toBe(to.J(25000));
  });

  it("overrides reactionTime_s with seconds conversion", () => {
    const id = uid("arch");
    const arch = registerArchetype({ id, overrides: { reactionTime_s: 0.22 } });
    expect(arch.reactionTime_s).toBe(to.s(0.22));
  });

  it("overrides Q field distressTolerance as ratio [0..1]", () => {
    const id = uid("arch");
    const arch = registerArchetype({ id, overrides: { distressTolerance: 0.65 } });
    expect(arch.distressTolerance).toBe(q(0.65));
  });

  it("overrides visionArcDeg as plain integer", () => {
    const id = uid("arch");
    const arch = registerArchetype({ id, overrides: { visionArcDeg: 180 } });
    expect(arch.visionArcDeg).toBe(180);
  });

  it("overrides cognition profile with Q conversion", () => {
    const id = uid("arch");
    const arch = registerArchetype({
      id,
      overrides: {
        cognition: {
          linguistic: 0.70, logicalMathematical: 0.80, spatial: 0.75,
          bodilyKinesthetic: 0.65, musical: 0.40,
          interpersonal: 0.60, intrapersonal: 0.62, naturalist: 0.45, interSpecies: 0.30,
        },
      },
    });
    expect(arch.cognition?.linguistic).toBe(q(0.70));
    expect(arch.cognition?.bodilyKinesthetic).toBe(q(0.65));
  });

  it("multiple overrides applied together", () => {
    const id = uid("arch");
    const arch = registerArchetype({
      id,
      base: "HUMAN_BASE",
      overrides: { mass_kg: 110, peakForce_N: 3200, distressTolerance: 0.65 },
    });
    expect(arch.mass_kg).toBe(to.kg(110));
    expect(arch.peakForce_N).toBe(to.N(3200));
    expect(arch.distressTolerance).toBe(q(0.65));
    // Un-overridden fields preserve base
    expect(arch.stature_m).toBe(HUMAN_BASE.stature_m);
  });

  it("uses AMATEUR_BOXER as base", () => {
    const id = uid("arch");
    const arch = registerArchetype({ id, base: "AMATEUR_BOXER" });
    expect(arch.peakForce_N).toBe(AMATEUR_BOXER.peakForce_N);
  });

  it("uses SERVICE_ROBOT as base (structureIntegrity > q(1.0))", () => {
    const id = uid("arch");
    const arch = registerArchetype({ id, base: "SERVICE_ROBOT" });
    expect(arch.structureIntegrity).toBe(SERVICE_ROBOT.structureIntegrity);
    expect(arch.structureIntegrity).toBeGreaterThan(SCALE.Q);
  });

  it("registers and returns from getCatalogEntry", () => {
    const id = uid("arch");
    registerArchetype({ id });
    const entry = getCatalogEntry(id);
    expect(entry?.kind).toBe("archetype");
    if (entry?.kind === "archetype") {
      expect(entry.archetype.mass_kg).toBe(HUMAN_BASE.mass_kg);
    }
  });

  it("throws on duplicate id", () => {
    const id = uid("arch");
    registerArchetype({ id });
    expect(() => registerArchetype({ id })).toThrow(/already registered/);
  });

  it("throws on unknown base", () => {
    expect(() => registerArchetype({ id: uid("arch"), base: "DRAGON" }))
      .toThrow(/unknown base/);
  });

  it("throws on unknown override field", () => {
    expect(() => registerArchetype({ id: uid("arch"), overrides: { flyingSpeed: 99 } }))
      .toThrow(/unknown archetype field/);
  });

  it("throws when id is missing", () => {
    expect(() => registerArchetype({ base: "HUMAN_BASE" })).toThrow(/must be a string/);
  });

  it("throws when Q field exceeds 5", () => {
    expect(() => registerArchetype({ id: uid("arch"), overrides: { distressTolerance: 10 } }))
      .toThrow(/must be ≤ 5/);
  });

  it("throws when Q field is negative", () => {
    expect(() => registerArchetype({ id: uid("arch"), overrides: { distressTolerance: -0.1 } }))
      .toThrow(/must be ≥ 0/);
  });
});

// ── 2 · registerWeapon ────────────────────────────────────────────────────────

const SWORD_JSON = {
  type: "weapon",
  id: "",  // filled per-test
  name: "Iron Sword",
  mass_kg: 1.2,
  bulk: 0.30,
  reach_m: 0.85,
  damage: {
    surfaceFrac:    0.30,
    internalFrac:   0.40,
    structuralFrac: 0.30,
    bleedFactor:    0.60,
    penetrationBias:0.40,
  },
};

describe("registerWeapon", () => {

  it("converts mass_kg to internal kg scale", () => {
    const id = uid("wpn");
    const wpn = registerWeapon({ ...SWORD_JSON, id });
    expect(wpn.mass_kg).toBe(to.kg(1.2));
  });

  it("converts reach_m to internal metre scale", () => {
    const id = uid("wpn");
    const wpn = registerWeapon({ ...SWORD_JSON, id });
    expect(wpn.reach_m).toBe(to.m(0.85));
  });

  it("converts bulk as Q", () => {
    const id = uid("wpn");
    const wpn = registerWeapon({ ...SWORD_JSON, id });
    expect(wpn.bulk).toBe(q(0.30));
  });

  it("converts all damage profile fields to Q", () => {
    const id = uid("wpn");
    const wpn = registerWeapon({ ...SWORD_JSON, id });
    expect(wpn.damage.surfaceFrac).toBe(q(0.30));
    expect(wpn.damage.internalFrac).toBe(q(0.40));
    expect(wpn.damage.structuralFrac).toBe(q(0.30));
    expect(wpn.damage.bleedFactor).toBe(q(0.60));
    expect(wpn.damage.penetrationBias).toBe(q(0.40));
  });

  it("sets kind to 'weapon'", () => {
    const id = uid("wpn");
    const wpn = registerWeapon({ ...SWORD_JSON, id });
    expect(wpn.kind).toBe("weapon");
  });

  it("converts optional readyTime_s to internal scale", () => {
    const id = uid("wpn");
    const wpn = registerWeapon({ ...SWORD_JSON, id, readyTime_s: 0.8 });
    expect(wpn.readyTime_s).toBe(to.s(0.8));
  });

  it("stores momentArm_m as raw float", () => {
    const id = uid("wpn");
    const wpn = registerWeapon({ ...SWORD_JSON, id, momentArm_m: 0.6 });
    expect(wpn.momentArm_m).toBeCloseTo(0.6);
  });

  it("accepts handedness 'twoHand'", () => {
    const id = uid("wpn");
    const wpn = registerWeapon({ ...SWORD_JSON, id, handedness: "twoHand" });
    expect(wpn.handedness).toBe("twoHand");
  });

  it("converts shieldBypassQ as Q", () => {
    const id = uid("wpn");
    const wpn = registerWeapon({ ...SWORD_JSON, id, shieldBypassQ: 0.50 });
    expect(wpn.shieldBypassQ).toBe(q(0.50));
  });

  it("stores entry retrievable via getCatalogEntry", () => {
    const id = uid("wpn");
    registerWeapon({ ...SWORD_JSON, id });
    const entry = getCatalogEntry(id);
    expect(entry?.kind).toBe("weapon");
  });

  it("throws on duplicate id", () => {
    const id = uid("wpn");
    registerWeapon({ ...SWORD_JSON, id });
    expect(() => registerWeapon({ ...SWORD_JSON, id })).toThrow(/already registered/);
  });

  it("throws when damage object is missing", () => {
    const id = uid("wpn");
    expect(() => registerWeapon({ ...SWORD_JSON, id, damage: undefined }))
      .toThrow(/expected object/);
  });

  it("throws when id is missing", () => {
    expect(() => registerWeapon({ name: "No id", mass_kg: 1, bulk: 0.3, damage: {} }))
      .toThrow(/must be a string/);
  });

  it("throws on invalid handedness", () => {
    const id = uid("wpn");
    expect(() => registerWeapon({ ...SWORD_JSON, id, handedness: "tentacle" }))
      .toThrow(/must be one of/);
  });
});

// ── 3 · registerArmour ────────────────────────────────────────────────────────

const MAIL_JSON = {
  type: "armour",
  id: "",  // filled per-test
  name: "Chainmail Hauberk",
  mass_kg: 15,
  bulk: 0.50,
  resist_J: 80,
  protectedDamageMul: 0.40,
  protects: ["Kinetic", "Thermal"],
  coverageByRegion: {
    torso:    0.90,
    head:     0.70,
    leftArm:  0.60,
    rightArm: 0.60,
  },
};

describe("registerArmour", () => {

  it("converts mass_kg to internal kg scale", () => {
    const id = uid("arm");
    const arm = registerArmour({ ...MAIL_JSON, id });
    expect(arm.mass_kg).toBe(to.kg(15));
  });

  it("converts resist_J (SCALE.J=1, trivial)", () => {
    const id = uid("arm");
    const arm = registerArmour({ ...MAIL_JSON, id });
    expect(arm.resist_J).toBe(to.J(80));
  });

  it("converts protectedDamageMul as Q", () => {
    const id = uid("arm");
    const arm = registerArmour({ ...MAIL_JSON, id });
    expect(arm.protectedDamageMul).toBe(q(0.40));
  });

  it("converts coverageByRegion values as Q", () => {
    const id = uid("arm");
    const arm = registerArmour({ ...MAIL_JSON, id });
    expect(arm.coverageByRegion["torso"]).toBe(q(0.90));
    expect(arm.coverageByRegion["head"]).toBe(q(0.70));
  });

  it("sets Kinetic channel in protects mask from 'Kinetic' string", () => {
    const id = uid("arm");
    const arm = registerArmour({ ...MAIL_JSON, id, protects: ["Kinetic"] });
    expect(hasChannel(arm.protects, DamageChannel.Kinetic)).toBe(true);
  });

  it("sets multiple channels from string array", () => {
    const id = uid("arm");
    const arm = registerArmour({ ...MAIL_JSON, id, protects: ["Kinetic", "Thermal"] });
    expect(hasChannel(arm.protects, DamageChannel.Kinetic)).toBe(true);
    expect(hasChannel(arm.protects, DamageChannel.Thermal)).toBe(true);
    expect(hasChannel(arm.protects, DamageChannel.Chemical)).toBe(false);
  });

  it("defaults to Kinetic-only when protects is omitted", () => {
    const id = uid("arm");
    const { protects: _, ...noProtects } = MAIL_JSON;
    const arm = registerArmour({ ...noProtects, id });
    expect(hasChannel(arm.protects, DamageChannel.Kinetic)).toBe(true);
  });

  it("converts optional mobilityMul and fatigueMul as Q", () => {
    const id = uid("arm");
    const arm = registerArmour({ ...MAIL_JSON, id, mobilityMul: 0.85, fatigueMul: 1.10 });
    expect(arm.mobilityMul).toBe(q(0.85));
    expect(arm.fatigueMul).toBe(q(1.10));
  });

  it("stores insulation_m2KW as raw float", () => {
    const id = uid("arm");
    const arm = registerArmour({ ...MAIL_JSON, id, insulation_m2KW: 0.02 });
    expect(arm.insulation_m2KW).toBeCloseTo(0.02);
  });

  it("sets ablative flag", () => {
    const id = uid("arm");
    const arm = registerArmour({ ...MAIL_JSON, id, ablative: true });
    expect(arm.ablative).toBe(true);
  });

  it("stores entry retrievable via getCatalogEntry", () => {
    const id = uid("arm");
    registerArmour({ ...MAIL_JSON, id });
    const entry = getCatalogEntry(id);
    expect(entry?.kind).toBe("armour");
  });

  it("throws on duplicate id", () => {
    const id = uid("arm");
    registerArmour({ ...MAIL_JSON, id });
    expect(() => registerArmour({ ...MAIL_JSON, id })).toThrow(/already registered/);
  });

  it("throws on unknown damage channel", () => {
    const id = uid("arm");
    expect(() => registerArmour({ ...MAIL_JSON, id, protects: ["Magic"] }))
      .toThrow(/unknown damage channel/);
  });

  it("throws when coverageByRegion is missing", () => {
    const id = uid("arm");
    expect(() => registerArmour({
      id, name: "No Coverage", mass_kg: 10, bulk: 0.5, resist_J: 50, protectedDamageMul: 0.5,
      protects: ["Kinetic"],
      // coverageByRegion intentionally omitted
    })).toThrow(/expected object/);
  });
});

// ── 4 · getCatalogEntry ───────────────────────────────────────────────────────

describe("getCatalogEntry", () => {

  it("returns undefined for unknown id", () => {
    expect(getCatalogEntry("no_such_thing")).toBeUndefined();
  });

  it("returns the correct kind after registration", () => {
    const archId = uid("a");
    const wpnId  = uid("w");
    const armId  = uid("r");
    registerArchetype({ id: archId });
    registerWeapon({ ...SWORD_JSON, id: wpnId });
    registerArmour({ ...MAIL_JSON, id: armId });
    expect(getCatalogEntry(archId)?.kind).toBe("archetype");
    expect(getCatalogEntry(wpnId)?.kind).toBe("weapon");
    expect(getCatalogEntry(armId)?.kind).toBe("armour");
  });
});

// ── 5 · listCatalog ───────────────────────────────────────────────────────────

describe("listCatalog", () => {

  it("lists all registered ids when no kind filter", () => {
    const archId = uid("la");
    const wpnId  = uid("lw");
    registerArchetype({ id: archId });
    registerWeapon({ ...SWORD_JSON, id: wpnId });
    const ids = listCatalog();
    expect(ids).toContain(archId);
    expect(ids).toContain(wpnId);
  });

  it("filters by kind 'archetype'", () => {
    const archId = uid("fa");
    const wpnId  = uid("fw");
    registerArchetype({ id: archId });
    registerWeapon({ ...SWORD_JSON, id: wpnId });
    const ids = listCatalog("archetype");
    expect(ids).toContain(archId);
    expect(ids).not.toContain(wpnId);
  });

  it("filters by kind 'weapon'", () => {
    const archId = uid("ga");
    const wpnId  = uid("gw");
    registerArchetype({ id: archId });
    registerWeapon({ ...SWORD_JSON, id: wpnId });
    const ids = listCatalog("weapon");
    expect(ids).toContain(wpnId);
    expect(ids).not.toContain(archId);
  });

  it("returns empty list when catalog is empty", () => {
    expect(listCatalog()).toHaveLength(0);
  });
});

// ── 6 · unregister / clear ────────────────────────────────────────────────────

describe("unregisterCatalogEntry / clearCatalog", () => {

  it("unregisterCatalogEntry removes an entry and returns true", () => {
    const id = uid("ur");
    registerArchetype({ id });
    expect(unregisterCatalogEntry(id)).toBe(true);
    expect(getCatalogEntry(id)).toBeUndefined();
  });

  it("unregisterCatalogEntry returns false for unknown id", () => {
    expect(unregisterCatalogEntry("ghost")).toBe(false);
  });

  it("clearCatalog removes all entries", () => {
    registerArchetype({ id: uid("ca") });
    registerWeapon({ ...SWORD_JSON, id: uid("cw") });
    clearCatalog();
    expect(listCatalog()).toHaveLength(0);
  });

  it("re-registration is possible after unregister", () => {
    const id = uid("re");
    registerArchetype({ id });
    unregisterCatalogEntry(id);
    expect(() => registerArchetype({ id })).not.toThrow();
  });
});

// ── 7 · End-to-end: JSON.parse round-trip ─────────────────────────────────────

describe("JSON round-trip", () => {

  it("registerArchetype from JSON.parse produces correct internal values", () => {
    const json = JSON.parse(JSON.stringify({
      id: uid("rt_arch"),
      base: "HUMAN_BASE",
      overrides: { mass_kg: 110, peakForce_N: 3200, distressTolerance: 0.65 },
    }));
    const arch = registerArchetype(json);
    expect(arch.mass_kg).toBe(to.kg(110));
    expect(arch.peakForce_N).toBe(to.N(3200));
    expect(arch.distressTolerance).toBe(q(0.65));
  });

  it("registerWeapon from JSON.parse produces correct internal values", () => {
    const json = JSON.parse(JSON.stringify({ ...SWORD_JSON, id: uid("rt_wpn") }));
    const wpn = registerWeapon(json);
    expect(wpn.mass_kg).toBe(to.kg(1.2));
    expect(wpn.reach_m).toBe(to.m(0.85));
    expect(wpn.damage.bleedFactor).toBe(q(0.60));
  });

  it("registerArmour from JSON.parse produces correct internal values", () => {
    const json = JSON.parse(JSON.stringify({ ...MAIL_JSON, id: uid("rt_arm") }));
    const arm = registerArmour(json);
    expect(arm.mass_kg).toBe(to.kg(15));
    expect(arm.coverageByRegion["torso"]).toBe(q(0.90));
    expect(hasChannel(arm.protects, DamageChannel.Kinetic)).toBe(true);
  });
});
