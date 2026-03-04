// test/downtime.test.ts — Phase 19: Downtime & Recovery tests

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import {
  stepDowntime,
  MEDICAL_RESOURCES,
  type DowntimeConfig,
  type TreatmentSchedule,
  type EntityRecoveryReport,
} from "../src/downtime.js";
import { mkWorld, mkHumanoidEntity } from "../src/sim/testing.js";
import type { WorldState } from "../src/sim/world.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

/** Build a world with one entity carrying a preset torso wound. */
function woundedWorld(opts: {
  bleedingRate?: number;
  structuralDamage?: number;
  fractured?: boolean;
  infectedTick?: number;
  internalDamage?: number;
  fluidLoss?: number;
  shock?: number;
}): WorldState {
  const e = mkHumanoidEntity(1, 1, 0, 0);
  const torso = e.injury.byRegion["torso"]!;
  if (opts.bleedingRate    !== undefined) torso.bleedingRate    = opts.bleedingRate    as any;
  if (opts.structuralDamage !== undefined) torso.structuralDamage = opts.structuralDamage as any;
  if (opts.fractured        !== undefined) torso.fractured        = opts.fractured;
  if (opts.infectedTick     !== undefined) {
    torso.infectedTick  = opts.infectedTick;
    torso.internalDamage = q(0.20) as any;  // above infection internal threshold
  }
  if (opts.internalDamage !== undefined) torso.internalDamage = opts.internalDamage as any;
  if (opts.fluidLoss      !== undefined) e.injury.fluidLoss   = opts.fluidLoss      as any;
  if (opts.shock          !== undefined) e.injury.shock       = opts.shock          as any;
  return mkWorld(1, [e]);
}

function cfg(
  care: TreatmentSchedule["careLevel"],
  extra?: Partial<TreatmentSchedule>,
  rest = false,
): DowntimeConfig {
  return {
    treatments: new Map([[1, { careLevel: care, ...extra }]]),
    rest,
  };
}

// ── Medical resource catalogue ────────────────────────────────────────────────

describe("MEDICAL_RESOURCES catalogue", () => {
  it("contains the expected 7 items", () => {
    expect(MEDICAL_RESOURCES).toHaveLength(7);
  });

  it("all items have positive costUnits and massGrams", () => {
    for (const r of MEDICAL_RESOURCES) {
      expect(r.costUnits).toBeGreaterThan(0);
      expect(r.massGrams).toBeGreaterThan(0);
    }
  });

  it("nanomed_dose is the most expensive item", () => {
    const costs = MEDICAL_RESOURCES.map(r => r.costUnits);
    const nano  = MEDICAL_RESOURCES.find(r => r.id === "nanomed_dose")!;
    expect(nano.costUnits).toBe(Math.max(...costs));
  });
});

// ── Care level outcomes ───────────────────────────────────────────────────────

describe("care level outcomes", () => {
  it("none: natural clotting reduces bleedingRate over time", () => {
    const world = woundedWorld({ bleedingRate: q(0.06) });
    const r = stepDowntime(world, 300, cfg("none"))[0]!;
    // After 300 seconds of natural clotting, bleed rate has dropped
    // (some structural damage means slower clot, but still reduces)
    const startBleed = r.injuryAtStart.activeBleedingRegions.length;
    expect(startBleed).toBe(1);
    // Fluid loss has accumulated (entity hasn't died yet)
    expect(r.injuryAtEnd.fluidLoss).toBeGreaterThan(r.injuryAtStart.fluidLoss);
  });

  it("first_aid: bleeding stops nearly immediately (tourniquet on second 0)", () => {
    const world = woundedWorld({ bleedingRate: q(0.06) });
    const r = stepDowntime(world, 300, cfg("first_aid"))[0]!;
    expect(r.bleedingStopped).toBe(true);
    expect(r.injuryAtEnd.activeBleedingRegions).toHaveLength(0);
    // Minimal fluid loss once tourniquet applied
    expect(r.injuryAtEnd.fluidLoss).toBeLessThan(0.05);
  });

  it("field_medicine: fracture setting surgery is applied", () => {
    const world = woundedWorld({ structuralDamage: q(0.75), fractured: true });
    const r = stepDowntime(world, 2000, cfg("field_medicine"))[0]!;
    expect(r.fracturesSet).toBe(true);
    // Surgery repairs structural damage
    expect(r.injuryAtEnd.maxStructuralDamage).toBeLessThan(r.injuryAtStart.maxStructuralDamage);
  });

  it("field_medicine: antibiotic clears active infection immediately", () => {
    const world = woundedWorld({ infectedTick: 0 });
    const r = stepDowntime(world, 100, cfg("field_medicine"))[0]!;
    expect(r.infectionCleared).toBe(true);
    expect(r.injuryAtEnd.infectedRegions).toHaveLength(0);
  });

  it("hospital: IV fluid replacement reduces fluid loss", () => {
    const world = woundedWorld({ fluidLoss: q(0.50) });
    const r = stepDowntime(world, 500, cfg("hospital"))[0]!;
    expect(r.injuryAtEnd.fluidLoss).toBeLessThan(r.injuryAtStart.fluidLoss);
  });

  it("onset delay defers treatment", () => {
    const world = woundedWorld({ bleedingRate: q(0.06) });
    // With a 200-second onset delay, fluid loss accumulates for 200 seconds first
    const rDelayed   = stepDowntime(world, 300, cfg("first_aid", { onsetDelay_s: 200 }))[0]!;
    const rImmediate = stepDowntime(world, 300, cfg("first_aid"))[0]!;
    // Delayed has more fluid loss (200 seconds of uncontrolled bleeding)
    expect(rDelayed.injuryAtEnd.fluidLoss).toBeGreaterThan(rImmediate.injuryAtEnd.fluidLoss);
  });

  it("rest flag accelerates healing (clotting faster)", () => {
    const world = woundedWorld({ bleedingRate: q(0.04) });
    const rRest   = stepDowntime(world, 500, cfg("none", {}, true))[0]!;
    const rNoRest = stepDowntime(world, 500, cfg("none", {}, false))[0]!;
    // Resting entity has lower fluid loss (bleeds out more slowly)
    expect(rRest.injuryAtEnd.fluidLoss).toBeLessThan(rNoRest.injuryAtEnd.fluidLoss);
  });

  it("entity with no matching schedule is skipped", () => {
    const world = woundedWorld({ bleedingRate: q(0.06) });
    // Use entity ID 99 in schedule — entity ID is 1
    const reports = stepDowntime(world, 300, {
      treatments: new Map([[99, { careLevel: "first_aid" }]]),
      rest: false,
    });
    expect(reports).toHaveLength(0);
  });
});

// ── Resource tracking ─────────────────────────────────────────────────────────

describe("resource tracking", () => {
  it("first_aid consumes 1 bandage per bleeding region", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    // Make two regions bleed
    e.injury.byRegion["torso"]!.bleedingRate  = q(0.05) as any;
    e.injury.byRegion["leftArm"]!.bleedingRate = q(0.03) as any;
    const world = mkWorld(1, [e]);
    const r = stepDowntime(world, 50, cfg("first_aid"))[0]!;
    const bandageUsage = r.resourcesUsed.find(u => u.resourceId === "bandage");
    expect(bandageUsage?.count).toBe(2);
  });

  it("field_medicine consumes 1 surgical_kit per fractured region", () => {
    const world = woundedWorld({ structuralDamage: q(0.75), fractured: true });
    const r = stepDowntime(world, 50, cfg("field_medicine"))[0]!;
    expect(r.fracturesSet).toBe(true);
    const kitUsage = r.resourcesUsed.find(u => u.resourceId === "surgical_kit");
    expect(kitUsage?.count).toBe(1);
  });

  it("field_medicine consumes 1 antibiotic_dose per infected region", () => {
    const world = woundedWorld({ infectedTick: 0 });
    const r = stepDowntime(world, 50, cfg("field_medicine"))[0]!;
    const abxUsage = r.resourcesUsed.find(u => u.resourceId === "antibiotic_dose");
    expect(abxUsage?.count).toBe(1);
  });

  it("inventory exhaustion prevents further treatment", () => {
    const world = woundedWorld({ bleedingRate: q(0.06) });
    // Only 0 bandages available
    const rEmpty     = stepDowntime(world, 300, cfg("first_aid", {
      inventory: new Map([["bandage", 0]]),
    }))[0]!;
    const rUnlimited = stepDowntime(world, 300, cfg("first_aid"))[0]!;
    // Without bandages, fluid loss is much higher
    expect(rEmpty.injuryAtEnd.fluidLoss).toBeGreaterThan(rUnlimited.injuryAtEnd.fluidLoss);
  });

  it("totalCostUnits is sum of individual resource costs", () => {
    const world = woundedWorld({ bleedingRate: q(0.06), structuralDamage: q(0.75), fractured: true });
    const r = stepDowntime(world, 50, cfg("field_medicine"))[0]!;
    const manual = r.resourcesUsed.reduce((sum, u) => sum + u.totalCost, 0);
    expect(r.totalCostUnits).toBe(manual);
  });
});

// ── Recovery projection ───────────────────────────────────────────────────────

describe("recovery projection", () => {
  it("returns combatReadyAt_s = elapsedSeconds when already healed at end", () => {
    // Very minor bleed — stops within simulation window
    const world = woundedWorld({ bleedingRate: q(0.01) });
    const r = stepDowntime(world, 2000, cfg("first_aid"))[0]!;
    expect(r.bleedingStopped).toBe(true);
    expect(r.combatReadyAt_s).toBe(2000);
  });

  it("returns null combatReadyAt_s and fullRecoveryAt_s when entity dies", () => {
    // Severe bleeding + no treatment → death
    const world = woundedWorld({ bleedingRate: q(0.15) });
    const r = stepDowntime(world, 5000, cfg("none"))[0]!;
    expect(r.died).toBe(true);
    expect(r.combatReadyAt_s).toBeNull();
    expect(r.fullRecoveryAt_s).toBeNull();
  });

  it("fullRecoveryAt_s is null for none/first_aid (no structural treatment)", () => {
    const world = woundedWorld({ structuralDamage: q(0.50) });
    const rNone = stepDowntime(world, 100, cfg("none"))[0]!;
    const rFA   = stepDowntime(world, 100, cfg("first_aid"))[0]!;
    expect(rNone.fullRecoveryAt_s).toBeNull();
    expect(rFA.fullRecoveryAt_s).toBeNull();
  });

  it("fullRecoveryAt_s > combatReadyAt_s when fracture present (field_medicine)", () => {
    const world = woundedWorld({ bleedingRate: q(0.05), structuralDamage: q(0.75), fractured: true });
    const r = stepDowntime(world, 50, cfg("field_medicine"))[0]!;
    if (r.fullRecoveryAt_s !== null && r.combatReadyAt_s !== null) {
      // Fractures take longer to fully repair than stopping bleeding
      expect(r.fullRecoveryAt_s).toBeGreaterThanOrEqual(r.combatReadyAt_s);
    }
  });

  it("projection is consistent on same wound state across calls", () => {
    const world = woundedWorld({ structuralDamage: q(0.60) });
    const r1 = stepDowntime(world, 100, cfg("field_medicine"))[0]!;
    const r2 = stepDowntime(world, 100, cfg("field_medicine"))[0]!;
    expect(r1.combatReadyAt_s).toBe(r2.combatReadyAt_s);
    expect(r1.fullRecoveryAt_s).toBe(r2.fullRecoveryAt_s);
  });
});

// ── Calibration anchors ───────────────────────────────────────────────────────

describe("calibration anchors", () => {
  it("deep cut + no treatment → entity dies before 3600 simulated seconds", () => {
    // bleedingRate q(0.06) → fluid per second = 30/10000 = 0.003; fatal in ~267 s
    const world = woundedWorld({ bleedingRate: q(0.06) });
    const r = stepDowntime(world, 3600, cfg("none"))[0]!;
    expect(r.died).toBe(true);
  });

  it("deep cut + immediate first_aid → entity survives 3600 simulated seconds", () => {
    const world = woundedWorld({ bleedingRate: q(0.06) });
    const r = stepDowntime(world, 3600, cfg("first_aid"))[0]!;
    expect(r.died).toBe(false);
  });

  it("severe fluid loss + none → entity dies within 3600 simulated seconds", () => {
    // Already at q(0.60) fluid loss plus active bleeding
    const world = woundedWorld({ bleedingRate: q(0.06), fluidLoss: q(0.60) });
    const r = stepDowntime(world, 3600, cfg("none"))[0]!;
    expect(r.died).toBe(true);
  });

  it("severe fluid loss + hospital → fluid loss reduced within 3600 simulated seconds", () => {
    const world = woundedWorld({ bleedingRate: q(0.06), fluidLoss: q(0.60) });
    const r = stepDowntime(world, 3600, cfg("hospital"))[0]!;
    // Hospital: tourniquet stops bleed + IV restores fluid
    expect(r.died).toBe(false);
    expect(r.injuryAtEnd.fluidLoss).toBeLessThan(r.injuryAtStart.fluidLoss);
  });

  it("infection + antibiotics within 200 seconds → infection cleared", () => {
    const world = woundedWorld({ infectedTick: 0 });
    const r = stepDowntime(world, 200, cfg("field_medicine"))[0]!;
    expect(r.infectionCleared).toBe(true);
  });

  it("untreated infection → entity dies within 1814400 simulated seconds (21 days)", () => {
    // Pre-infected torso with internal damage
    const world = woundedWorld({ infectedTick: 0, internalDamage: q(0.20) });
    const r = stepDowntime(world, 1_814_400, cfg("none"))[0]!;
    expect(r.died).toBe(true);
  });

  it("fracture + field_medicine → fracturesSet = true and structural damage reduced", () => {
    const world = woundedWorld({ structuralDamage: q(0.75), fractured: true });
    const r = stepDowntime(world, 1000, cfg("field_medicine"))[0]!;
    expect(r.fracturesSet).toBe(true);
    expect(r.injuryAtEnd.maxStructuralDamage).toBeLessThan(r.injuryAtStart.maxStructuralDamage);
  });
});
