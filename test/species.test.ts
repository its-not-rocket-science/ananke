/**
 * Phase 31 — Species & Race System tests
 *
 * Groups:
 *   Data integrity       (8) — ALL_SPECIES completeness, archetype validity
 *   Generation           (5) — generateSpeciesIndividual determinism and spec content
 *   Thermoregulation     (5) — coldBlooded skip, naturalInsulation_m2KW effect
 *   Nutrition            (4) — bmrMultiplier effect on hunger timing
 *   Species characteristics (4) — ordering guarantees across species
 *   Natural weapons & caps  (4) — dragon/satyr natural weapons, fire breath
 */

import { describe, it, expect } from "vitest";
import { SCALE, q, to, type Q } from "../src/units";
import {
  generateSpeciesIndividual,
  ALL_SPECIES, FANTASY_HUMANOID_SPECIES, SCIFI_HUMANOID_SPECIES,
  MYTHOLOGICAL_SPECIES, FICTIONAL_SPECIES,
  ELF_SPECIES, DWARF_SPECIES, HALFLING_SPECIES, ORC_SPECIES, GOBLIN_SPECIES,
  OGRE_SPECIES, TROLL_SPECIES, VULCAN_SPECIES, KLINGON_SPECIES,
  HEECHEE_SPECIES, DRAGON_SPECIES, SATYR_SPECIES,
} from "../src/species";
import { HUMAN_BASE } from "../src/archetypes";
import { AVIAN_PLAN, CENTAUR_PLAN, HUMANOID_PLAN } from "../src/sim/bodyplan";
import { computeBMR, stepNutrition } from "../src/sim/nutrition";
import { stepCoreTemp, cToQ, CORE_TEMP_NORMAL_Q } from "../src/sim/thermoregulation";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";

// ── Data integrity ────────────────────────────────────────────────────────────

describe("data integrity", () => {
  it("ALL_SPECIES has exactly 14 entries", () => {
    expect(ALL_SPECIES.length).toBe(14);
  });

  it("every species has positive mass, force, and non-empty id", () => {
    for (const s of ALL_SPECIES) {
      expect(s.id.length).toBeGreaterThan(0);
      expect(s.archetype.mass_kg).toBeGreaterThan(0);
      expect(s.archetype.peakForce_N).toBeGreaterThan(0);
    }
  });

  it("all archetype variance values are in [0, SCALE.Q]", () => {
    const varFields = [
      "statureVar", "massVar", "reachVar", "actuatorScaleVar", "structureScaleVar",
      "actuatorMassVar", "peakForceVar", "peakPowerVar", "continuousPowerVar",
      "reserveEnergyVar", "efficiencyVar", "reactionTimeVar", "controlVar",
      "stabilityVar", "fineControlVar", "surfaceVar", "bulkVar", "structVar",
      "distressVar", "shockVar", "concVar", "heatVar", "coldVar",
      "fatigueVar", "recoveryVar",
    ] as const;
    for (const s of ALL_SPECIES) {
      for (const field of varFields) {
        const v = (s.archetype as any)[field] as number;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(SCALE.Q);
      }
    }
  });

  it("each group array has the correct size", () => {
    expect(FANTASY_HUMANOID_SPECIES.length).toBe(7);
    expect(SCIFI_HUMANOID_SPECIES.length).toBe(3);
    expect(MYTHOLOGICAL_SPECIES.length).toBe(3);
    expect(FICTIONAL_SPECIES.length).toBe(1);
  });

  it("DRAGON is heavier than OGRE which is heavier than TROLL", () => {
    expect(DRAGON_SPECIES.archetype.mass_kg).toBeGreaterThan(OGRE_SPECIES.archetype.mass_kg);
    expect(OGRE_SPECIES.archetype.mass_kg).toBeGreaterThan(TROLL_SPECIES.archetype.mass_kg);
  });

  it("HALFLING is shorter than GOBLIN", () => {
    expect(HALFLING_SPECIES.archetype.stature_m).toBeLessThan(GOBLIN_SPECIES.archetype.stature_m);
  });

  it("VULCAN is stronger than HUMAN_BASE", () => {
    expect(VULCAN_SPECIES.archetype.peakForce_N).toBeGreaterThan(HUMAN_BASE.peakForce_N);
  });

  it("ELF has longer vision range than HUMAN_BASE", () => {
    expect(ELF_SPECIES.archetype.visionRange_m).toBeGreaterThan(HUMAN_BASE.visionRange_m);
  });
});

// ── Generation ────────────────────────────────────────────────────────────────

describe("generateSpeciesIndividual", () => {
  it("returns valid attributes for ELF_SPECIES", () => {
    const spec = generateSpeciesIndividual(ELF_SPECIES, 1);
    expect(spec.attributes.morphology.mass_kg).toBeGreaterThan(0);
    expect(spec.attributes.performance.peakForce_N).toBeGreaterThan(0);
  });

  it("is deterministic — same species + same seed → same attributes", () => {
    const a = generateSpeciesIndividual(VULCAN_SPECIES, 42);
    const b = generateSpeciesIndividual(VULCAN_SPECIES, 42);
    expect(a.attributes.performance.peakForce_N).toBe(b.attributes.performance.peakForce_N);
    expect(a.attributes.morphology.mass_kg).toBe(b.attributes.morphology.mass_kg);
  });

  it("different seeds → different peakForce_N", () => {
    const a = generateSpeciesIndividual(ELF_SPECIES, 1);
    const b = generateSpeciesIndividual(ELF_SPECIES, 999);
    expect(a.attributes.performance.peakForce_N).not.toBe(b.attributes.performance.peakForce_N);
  });

  it("DRAGON spec uses AVIAN_PLAN and has one innate capability", () => {
    const spec = generateSpeciesIndividual(DRAGON_SPECIES, 1);
    expect(spec.bodyPlan).toBe(AVIAN_PLAN);
    expect(spec.innateCapabilities.length).toBe(1);
  });

  it("TROLL spec has reinforcedStructure in innateTraits and no natural weapons", () => {
    const spec = generateSpeciesIndividual(TROLL_SPECIES, 1);
    expect(spec.innateTraits).toContain("reinforcedStructure");
    expect(spec.naturalWeapons.length).toBe(0);
  });
});

// ── Thermoregulation ──────────────────────────────────────────────────────────

describe("thermoregulation — species physiology", () => {
  const ARCTIC = cToQ(-20) as Q;  // −20°C ambient

  it("cold-blooded entity: coreTemp_Q unchanged after stepWorld with thermalAmbient_Q", () => {
    const e = mkHumanoidEntity(1, 1, 0);
    (e as any).physiology = { coldBlooded: true };
    const initialCoreQ = (e.condition as any).coreTemp_Q;  // undefined before first step
    const world = mkWorld(1, [e]);
    for (let i = 0; i < 20; i++) {
      stepWorld(world, new Map(), { thermalAmbient_Q: ARCTIC, tractionCoeff: q(0.9) });
    }
    // coldBlooded skips stepCoreTemp — coreTemp_Q stays at initial (undefined)
    expect((e.condition as any).coreTemp_Q).toBe(initialCoreQ);
  });

  it("non-cold-blooded entity: coreTemp_Q moves toward arctic ambient", () => {
    const e = mkHumanoidEntity(2, 1, 0);
    const world = mkWorld(1, [e]);
    for (let i = 0; i < 40; i++) {
      stepWorld(world, new Map(), { thermalAmbient_Q: ARCTIC, tractionCoeff: q(0.9) });
    }
    const coreQ = (e.condition as any).coreTemp_Q as number;
    // coreTemp should have been set and moved below normal q(0.500) toward cold ambient
    expect(coreQ).toBeLessThan(q(0.500));
  });

  it("TROLL natural insulation (0.08) slows cooling vs. entity without insulation", () => {
    // Two identical entities (same seed) except one has naturalInsulation_m2KW: 0.08
    const eNoInsul = mkHumanoidEntity(1, 1, 0);
    const eInsul   = mkHumanoidEntity(1, 2, 100);  // same seed → same mass
    (eInsul as any).physiology = { naturalInsulation_m2KW: 0.08 };

    // Set same starting temp
    (eNoInsul.condition as any).coreTemp_Q = CORE_TEMP_NORMAL_Q;
    (eInsul.condition   as any).coreTemp_Q = CORE_TEMP_NORMAL_Q;

    for (let i = 0; i < 200; i++) {
      stepCoreTemp(eNoInsul, ARCTIC, 1 / 20);
      stepCoreTemp(eInsul,   ARCTIC, 1 / 20);
    }

    const qNoInsul = (eNoInsul.condition as any).coreTemp_Q as number;
    const qInsul   = (eInsul.condition   as any).coreTemp_Q as number;
    // Insulated entity should be warmer (higher Q)
    expect(qInsul).toBeGreaterThan(qNoInsul);
  });

  it("dragon natural insulation (0.05) slows cooling vs. no insulation", () => {
    const eDragon = mkHumanoidEntity(1, 1, 0);
    const ePlain  = mkHumanoidEntity(1, 2, 100);  // same seed → same mass
    (eDragon as any).physiology = { naturalInsulation_m2KW: 0.05 };

    (eDragon.condition as any).coreTemp_Q = CORE_TEMP_NORMAL_Q;
    (ePlain.condition  as any).coreTemp_Q = CORE_TEMP_NORMAL_Q;

    for (let i = 0; i < 200; i++) {
      stepCoreTemp(eDragon, ARCTIC, 1 / 20);
      stepCoreTemp(ePlain,  ARCTIC, 1 / 20);
    }

    const qDragon = (eDragon.condition as any).coreTemp_Q as number;
    const qPlain  = (ePlain.condition  as any).coreTemp_Q as number;
    expect(qDragon).toBeGreaterThan(qPlain);
  });

  it("entity without physiology behaves identically to entity with physiology: undefined", () => {
    // Run same entity twice to eliminate mass/velocity differences
    const e = mkHumanoidEntity(1, 1, 0);
    (e.condition as any).coreTemp_Q = CORE_TEMP_NORMAL_Q;

    // First run: no physiology set
    delete (e as any).physiology;
    for (let i = 0; i < 20; i++) stepCoreTemp(e, ARCTIC, 1 / 20);
    const withoutPhysiology = (e.condition as any).coreTemp_Q as number;

    // Reset core temp, set physiology = undefined explicitly
    (e.condition as any).coreTemp_Q = CORE_TEMP_NORMAL_Q;
    (e as any).physiology = undefined;
    for (let i = 0; i < 20; i++) stepCoreTemp(e, ARCTIC, 1 / 20);
    expect((e.condition as any).coreTemp_Q).toBe(withoutPhysiology);
  });
});

// ── Nutrition ─────────────────────────────────────────────────────────────────
//
// Design note: hunger state thresholds scale as (HUNGRY_SECONDS × effectiveBMR).
// The drain rate is also (effectiveBMR × delta_s). These cancel out when starting
// from caloricBalance = 0, so both transition at 12h regardless of bmrMultiplier.
//
// The multiplier becomes meaningful when starting from a positive caloric buffer
// (e.g. just ate a ration bar). Higher BMR burns through the buffer faster.
//
// With +2 MJ starting buffer and 75 kg mass:
//   human (BMR 80W): hungry at 43200 + 2,000,000/80  = 68 200 s (~18.9 h)
//   vulcan (BMR 58W): hungry at 43200 + 2,000,000/58  = 77 683 s (~21.6 h)
//   orc    (BMR 92W): hungry at 43200 + 2,000,000/92  = 64 939 s (~18.0 h)

describe("nutrition — bmrMultiplier", () => {
  it("effectiveBMR with q(0.72) multiplier is less than base BMR for 75 kg entity", () => {
    const baseBMR    = computeBMR(75_000);   // 80 W
    const vulcanBMR  = Math.round(baseBMR * q(0.72) / SCALE.Q);
    expect(vulcanBMR).toBeLessThan(baseBMR);
  });

  it("VULCAN bmrMul q(0.72): stays sated longer when starting from positive balance", () => {
    // At t = 70 000 s with +2 MJ start: human crosses hungry (68 200s), Vulcan hasn't (77 683s)
    const eHuman  = mkHumanoidEntity(1, 1, 0);
    const eVulcan = mkHumanoidEntity(2, 2, 0);
    eHuman.attributes.morphology.mass_kg  = 75_000;
    eVulcan.attributes.morphology.mass_kg = 75_000;
    (eHuman.condition  as any).caloricBalance_J = 2_000_000;
    (eVulcan.condition as any).caloricBalance_J = 2_000_000;
    (eVulcan as any).physiology = { bmrMultiplier: VULCAN_SPECIES.physiology!.bmrMultiplier };

    stepNutrition(eHuman,  70_000, q(0) as Q);
    stepNutrition(eVulcan, 70_000, q(0) as Q);

    expect((eHuman.condition  as any).hungerState).not.toBe("sated");
    expect((eVulcan.condition as any).hungerState).toBe("sated");
  });

  it("ORC bmrMul q(1.15): reaches hungry before HUMAN_BASE at same starting balance", () => {
    // At t = 66 000 s with +2 MJ start: Orc crosses hungry (64 939s), human hasn't (68 200s)
    const eHuman = mkHumanoidEntity(1, 1, 0);
    const eOrc   = mkHumanoidEntity(2, 2, 0);
    eHuman.attributes.morphology.mass_kg = 75_000;
    eOrc.attributes.morphology.mass_kg   = 75_000;
    (eHuman.condition as any).caloricBalance_J = 2_000_000;
    (eOrc.condition   as any).caloricBalance_J = 2_000_000;
    (eOrc as any).physiology = { bmrMultiplier: ORC_SPECIES.physiology!.bmrMultiplier };

    stepNutrition(eHuman, 66_000, q(0) as Q);
    stepNutrition(eOrc,   66_000, q(0) as Q);

    expect((eHuman.condition as any).hungerState).toBe("sated");
    expect((eOrc.condition   as any).hungerState).not.toBe("sated");
  });

  it("bmrMultiplier q(1.0) produces same caloricBalance drain as no physiology", () => {
    const eBase = mkHumanoidEntity(1, 1, 0);
    const eMul1 = mkHumanoidEntity(1, 2, 0);  // same seed → same attrs
    eBase.attributes.morphology.mass_kg = 75_000;
    eMul1.attributes.morphology.mass_kg = 75_000;
    (eMul1 as any).physiology = { bmrMultiplier: SCALE.Q as Q };  // q(1.0) = 10000

    stepNutrition(eBase, 8 * 3600, q(0) as Q);
    stepNutrition(eMul1, 8 * 3600, q(0) as Q);

    expect((eBase.condition as any).caloricBalance_J).toBeCloseTo(
      (eMul1.condition as any).caloricBalance_J, 0,
    );
  });
});

// ── Species characteristics ───────────────────────────────────────────────────

describe("species characteristics", () => {
  it("GOBLIN reacts fastest, ORC slowest of the three", () => {
    expect(GOBLIN_SPECIES.archetype.reactionTime_s)
      .toBeLessThan(ELF_SPECIES.archetype.reactionTime_s);
    expect(ELF_SPECIES.archetype.reactionTime_s)
      .toBeLessThan(ORC_SPECIES.archetype.reactionTime_s);
  });

  it("OGRE is stronger than KLINGON", () => {
    expect(OGRE_SPECIES.archetype.peakForce_N)
      .toBeGreaterThan(KLINGON_SPECIES.archetype.peakForce_N);
  });

  it("TROLL recovers faster than HEECHEE", () => {
    expect(TROLL_SPECIES.archetype.recoveryRate)
      .toBeGreaterThan(HEECHEE_SPECIES.archetype.recoveryRate);
  });

  it("HEECHEE has higher fineControl than ELF", () => {
    expect(HEECHEE_SPECIES.archetype.fineControl)
      .toBeGreaterThan(ELF_SPECIES.archetype.fineControl);
  });
});

// ── Natural weapons and capabilities ─────────────────────────────────────────

describe("natural weapons and capabilities", () => {
  it("DRAGON has one natural weapon with handedness 'natural'", () => {
    expect(DRAGON_SPECIES.naturalWeapons).toBeDefined();
    expect(DRAGON_SPECIES.naturalWeapons!.length).toBe(1);
    expect(DRAGON_SPECIES.naturalWeapons![0]!.handedness).toBe("natural");
  });

  it("SATYR has one natural weapon with reach < 0.5 m", () => {
    expect(SATYR_SPECIES.naturalWeapons).toBeDefined();
    expect(SATYR_SPECIES.naturalWeapons!.length).toBe(1);
    const horn = SATYR_SPECIES.naturalWeapons![0]!;
    // reach_m is in SCALE.m units; 0.5 m = to.m(0.5) = 5000
    expect(horn.reach_m).toBeLessThan(to.m(0.5));
  });

  it("DRAGON has dragon_fire_breath as first innate capability", () => {
    expect(DRAGON_SPECIES.innateCapabilities).toBeDefined();
    expect(DRAGON_SPECIES.innateCapabilities!.length).toBeGreaterThan(0);
    expect(DRAGON_SPECIES.innateCapabilities![0]!.id).toBe("dragon_fire_breath");
  });

  it("dragon fire breath cone half-angle is approximately π/3 (60°)", () => {
    const effect = DRAGON_SPECIES.innateCapabilities![0]!.effects[0]!;
    expect(effect.coneHalfAngle_rad).toBeDefined();
    expect(Math.abs(effect.coneHalfAngle_rad! - Math.PI / 3)).toBeLessThan(0.01);
  });
});
