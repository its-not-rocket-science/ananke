// test/hydrostatic.test.ts — Phase 27: Hydrostatic Shock & Cavitation tests

import { describe, it, expect } from "vitest";
import {
  computeTemporaryCavityMul,
  computeCavitationBleed,
  HYDROSTATIC_THRESHOLD_mps,
  CAVITATION_THRESHOLD_mps,
  TISSUE_COMPLIANCE,
  DEFAULT_COMPLIANCE,
} from "../src/sim/hydrostatic";
import { SCALE, q } from "../src/units";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import type { CommandMap } from "../src/sim/commands";
import { ALL_HISTORICAL_RANGED } from "../src/weapons";

// ── Constants ─────────────────────────────────────────────────────────────────

describe("hydrostatic — constants", () => {
  it("HYDROSTATIC_THRESHOLD_mps is 600 m/s in SCALE", () => {
    expect(HYDROSTATIC_THRESHOLD_mps).toBe(Math.trunc(600 * SCALE.mps));
  });

  it("CAVITATION_THRESHOLD_mps is 900 m/s in SCALE", () => {
    expect(CAVITATION_THRESHOLD_mps).toBe(Math.trunc(900 * SCALE.mps));
  });
});

// ── Tissue compliance ordering ─────────────────────────────────────────────────

describe("hydrostatic — tissue compliance ordering", () => {
  it("bone < brain < lung < torso < DEFAULT_COMPLIANCE (muscle)", () => {
    expect(TISSUE_COMPLIANCE["bone"]).toBeLessThan(TISSUE_COMPLIANCE["brain"]!);
    expect(TISSUE_COMPLIANCE["brain"]!).toBeLessThan(TISSUE_COMPLIANCE["lung"]!);
    expect(TISSUE_COMPLIANCE["lung"]!).toBeLessThan(TISSUE_COMPLIANCE["torso"]!);
    expect(TISSUE_COMPLIANCE["torso"]!).toBeLessThan(DEFAULT_COMPLIANCE);
  });

  it("DEFAULT_COMPLIANCE is q(0.60) — elastic muscle baseline", () => {
    expect(DEFAULT_COMPLIANCE).toBe(q(0.60));
  });

  it("limb regions (leftArm, rightLeg) equal DEFAULT_COMPLIANCE", () => {
    expect(TISSUE_COMPLIANCE["leftArm"]).toBe(DEFAULT_COMPLIANCE);
    expect(TISSUE_COMPLIANCE["rightLeg"]).toBe(DEFAULT_COMPLIANCE);
  });
});

// ── computeTemporaryCavityMul ─────────────────────────────────────────────────

describe("computeTemporaryCavityMul", () => {
  it("returns q(1.0) below threshold (9mm at ~370 m/s)", () => {
    const v = Math.trunc(370 * SCALE.mps);
    expect(computeTemporaryCavityMul(v, "torso")).toBe(q(1.0));
  });

  it("returns q(1.0) at exactly threshold (600 m/s)", () => {
    expect(computeTemporaryCavityMul(HYDROSTATIC_THRESHOLD_mps, "torso")).toBe(q(1.0));
  });

  it("returns > q(1.0) just above threshold (700 m/s)", () => {
    const v = Math.trunc(700 * SCALE.mps);
    expect(computeTemporaryCavityMul(v, "torso")).toBeGreaterThan(q(1.0));
  });

  it("5.56mm in liver (~960 m/s) → clamped to maximum q(3.0)", () => {
    const v = Math.trunc(960 * SCALE.mps);
    expect(computeTemporaryCavityMul(v, "liver")).toBe(3 * SCALE.Q);
  });

  it("5.56mm in muscle (~960 m/s) → between q(1.0) and q(3.0) (compliance absorbs stretch)", () => {
    const v = Math.trunc(960 * SCALE.mps);
    const mul = computeTemporaryCavityMul(v, "leftArm");
    expect(mul).toBeGreaterThan(q(1.0));
    expect(mul).toBeLessThan(3 * SCALE.Q);
  });

  it("very high velocity (2000 m/s) → clamped to q(3.0)", () => {
    const v = Math.trunc(2000 * SCALE.mps);
    expect(computeTemporaryCavityMul(v, "liver")).toBe(3 * SCALE.Q);
  });

  it("low-compliance tissue (bone) → higher multiplier than high-compliance (leftArm) at same velocity", () => {
    const v = Math.trunc(700 * SCALE.mps);
    const boneMul = computeTemporaryCavityMul(v, "bone");
    const armMul  = computeTemporaryCavityMul(v, "leftArm");
    expect(boneMul).toBeGreaterThan(armMul);
  });

  it("unknown region falls back to DEFAULT_COMPLIANCE (same as leftArm)", () => {
    const v = Math.trunc(700 * SCALE.mps);
    const unknownMul = computeTemporaryCavityMul(v, "unknown_organ");
    const armMul     = computeTemporaryCavityMul(v, "leftArm");
    expect(unknownMul).toBe(armMul);
  });

  it("never returns below q(1.0) for any region above threshold", () => {
    const v = Math.trunc(601 * SCALE.mps);
    for (const region of ["bone", "brain", "lung", "torso", "leftArm"]) {
      expect(computeTemporaryCavityMul(v, region)).toBeGreaterThanOrEqual(q(1.0));
    }
  });

  it("head region (brain compliance) gives same result as brain", () => {
    const v = Math.trunc(800 * SCALE.mps);
    expect(computeTemporaryCavityMul(v, "head")).toBe(computeTemporaryCavityMul(v, "brain"));
  });
});

// ── computeCavitationBleed ────────────────────────────────────────────────────

describe("computeCavitationBleed", () => {
  it("returns unchanged bleed below cavitation threshold (800 m/s)", () => {
    const bleed = q(0.20);
    const v = Math.trunc(800 * SCALE.mps);
    expect(computeCavitationBleed(v, bleed, "torso")).toBe(bleed);
  });

  it("returns unchanged bleed at exactly cavitation threshold (900 m/s)", () => {
    const bleed = q(0.20);
    expect(computeCavitationBleed(CAVITATION_THRESHOLD_mps, bleed, "torso")).toBe(bleed);
  });

  it("returns unchanged bleed for non-cavitation tissue — bone", () => {
    const bleed = q(0.20);
    const v = Math.trunc(1000 * SCALE.mps);
    expect(computeCavitationBleed(v, bleed, "bone")).toBe(bleed);
  });

  it("returns unchanged bleed for non-cavitation tissue — leftArm", () => {
    const bleed = q(0.20);
    const v = Math.trunc(1000 * SCALE.mps);
    expect(computeCavitationBleed(v, bleed, "leftArm")).toBe(bleed);
  });

  it("returns unchanged bleed when currentBleed is 0", () => {
    const v = Math.trunc(1000 * SCALE.mps);
    expect(computeCavitationBleed(v, 0, "torso")).toBe(0);
  });

  it("increases bleed for fluid-saturated tissue above 900 m/s (torso)", () => {
    const bleed = q(0.20);
    const v = Math.trunc(1000 * SCALE.mps);
    expect(computeCavitationBleed(v, bleed, "torso")).toBeGreaterThan(bleed);
  });

  it("bleed is clamped to q(1.0) even at extreme velocity", () => {
    const bleed = q(0.90);
    const v = Math.trunc(2000 * SCALE.mps);
    expect(computeCavitationBleed(v, bleed, "torso")).toBeLessThanOrEqual(q(1.0));
  });

  it("higher velocity produces more bleed than lower velocity (same tissue)", () => {
    const bleed = q(0.20);
    const v1 = Math.trunc(950 * SCALE.mps);
    const v2 = Math.trunc(1200 * SCALE.mps);
    expect(computeCavitationBleed(v2, bleed, "liver"))
      .toBeGreaterThan(computeCavitationBleed(v1, bleed, "liver"));
  });

  it("applies to all six cavitation regions", () => {
    const bleed = q(0.20);
    const v = Math.trunc(1000 * SCALE.mps);
    for (const region of ["lung", "liver", "spleen", "torso", "leftLeg", "rightLeg"]) {
      expect(computeCavitationBleed(v, bleed, region)).toBeGreaterThan(bleed);
    }
  });
});

// ── Kernel integration ─────────────────────────────────────────────────────────

describe("hydrostatic — kernel integration", () => {
  const wpnRifle = ALL_HISTORICAL_RANGED.find(w => w.id === "rng_assault_rifle")!;

  it("rifle shot runs without error and target receives some damage", () => {
    // Smoke test: high-velocity rifle path exercises tempCavMul and cavitation bleed without crash
    const shooter = mkHumanoidEntity(1, 1, 0, 0);
    const target  = mkHumanoidEntity(2, 2, SCALE.m, 0); // 1 m away
    shooter.loadout.items = [{ ...wpnRifle }];
    const world = mkWorld(42, [shooter, target]);
    const cmds: CommandMap = new Map([[1, [{ kind: "shoot", weaponId: wpnRifle.id, targetId: 2, intensity: q(1.0) }]]]);
    stepWorld(world, cmds, { tractionCoeff: q(0.9) });
    const totalDamage = Object.values(target.injury.byRegion)
      .reduce((s, rs) => s + rs.internalDamage + rs.surfaceDamage, 0);
    expect(totalDamage).toBeGreaterThan(0);
  });

  it("cavitation bleed path: torso hit above 900 m/s boosts bleed; arm hit does not", () => {
    // Direct formula verification: arm is not in CAVITATION_TISSUE
    const v_hiV = Math.trunc(Math.sqrt(2 * wpnRifle.launchEnergy_J * SCALE.kg / wpnRifle.projectileMass_kg) * SCALE.mps);
    expect(v_hiV).toBeGreaterThan(CAVITATION_THRESHOLD_mps);
    const bleedBase = q(0.05);
    expect(computeCavitationBleed(v_hiV, bleedBase, "torso")).toBeGreaterThan(bleedBase);
    expect(computeCavitationBleed(v_hiV, bleedBase, "leftArm")).toBe(bleedBase);
  });

  it("no crash when weapon has no v_impact_mps (melee fallback path)", () => {
    // Melee impacts push events without v_impact_mps — kernel must handle gracefully
    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    const defender = mkHumanoidEntity(2, 2, SCALE.m * 0.3, 0); // 0.3 m away
    const world = mkWorld(100, [attacker, defender]);
    const cmds: CommandMap = new Map([[1, [{ kind: "attack", targetId: 2, intensity: q(1.0) }]]]);
    expect(() => stepWorld(world, cmds, { tractionCoeff: q(0.9) })).not.toThrow();
  });
});
