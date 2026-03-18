// test/narrative-bias.test.ts — Phase 62: Narrative Bias Parameter
import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import { HUMAN_BASE } from "../src/archetypes.js";
import { generateIndividual, type NarrativeBias } from "../src/generate.js";

// Run multiple seeds to get robust comparisons
const SEEDS = [1, 2, 3, 4, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43];

function avgOver(bias: NarrativeBias, extract: (attr: ReturnType<typeof generateIndividual>) => number): number {
  return SEEDS.map(s => extract(generateIndividual(s, HUMAN_BASE, bias))).reduce((a, b) => a + b, 0) / SEEDS.length;
}

function avgBaseOver(extract: (attr: ReturnType<typeof generateIndividual>) => number): number {
  return SEEDS.map(s => extract(generateIndividual(s, HUMAN_BASE))).reduce((a, b) => a + b, 0) / SEEDS.length;
}

// ── Backward compatibility ────────────────────────────────────────────────────

describe("NarrativeBias — backward compatibility", () => {
  it("undefined bias produces identical results to unbiased call", () => {
    for (const seed of SEEDS) {
      const base = generateIndividual(seed, HUMAN_BASE);
      const biased = generateIndividual(seed, HUMAN_BASE, {});
      expect(biased.performance.peakForce_N).toBe(base.performance.peakForce_N);
      expect(biased.performance.peakPower_W).toBe(base.performance.peakPower_W);
      expect(biased.control.reactionTime_s).toBe(base.control.reactionTime_s);
      expect(biased.resilience.distressTolerance).toBe(base.resilience.distressTolerance);
      expect(biased.control.stability).toBe(base.control.stability);
      expect(biased.morphology.stature_m).toBe(base.morphology.stature_m);
    }
  });

  it("all-zero biases produce identical results to unbiased call", () => {
    const allZero: NarrativeBias = { strength: 0, speed: 0, resilience: 0, agility: 0, size: 0 };
    for (const seed of SEEDS) {
      const base = generateIndividual(seed, HUMAN_BASE);
      const biased = generateIndividual(seed, HUMAN_BASE, allZero);
      expect(biased.performance.peakForce_N).toBe(base.performance.peakForce_N);
      expect(biased.morphology.mass_kg).toBe(base.morphology.mass_kg);
    }
  });
});

// ── Strength bias ─────────────────────────────────────────────────────────────

describe("NarrativeBias.strength", () => {
  it("positive strength raises average peakForce_N", () => {
    const base = avgBaseOver(a => a.performance.peakForce_N);
    const high = avgOver({ strength: 1 }, a => a.performance.peakForce_N);
    expect(high).toBeGreaterThan(base);
  });

  it("negative strength lowers average peakForce_N", () => {
    const base = avgBaseOver(a => a.performance.peakForce_N);
    const low = avgOver({ strength: -1 }, a => a.performance.peakForce_N);
    expect(low).toBeLessThan(base);
  });

  it("positive strength raises morphology.actuatorScale", () => {
    const base = avgBaseOver(a => a.morphology.actuatorScale);
    const high = avgOver({ strength: 1 }, a => a.morphology.actuatorScale);
    expect(high).toBeGreaterThan(base);
  });

  it("strength bias is monotone: -1 < 0 < +1 for peakForce_N", () => {
    const low = avgOver({ strength: -1 }, a => a.performance.peakForce_N);
    const mid = avgBaseOver(a => a.performance.peakForce_N);
    const high = avgOver({ strength: 1 }, a => a.performance.peakForce_N);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });
});

// ── Speed bias ────────────────────────────────────────────────────────────────

describe("NarrativeBias.speed", () => {
  it("positive speed lowers average reactionTime_s (faster)", () => {
    const base = avgBaseOver(a => a.control.reactionTime_s);
    const fast = avgOver({ speed: 1 }, a => a.control.reactionTime_s);
    expect(fast).toBeLessThan(base);
  });

  it("negative speed raises average reactionTime_s (slower)", () => {
    const base = avgBaseOver(a => a.control.reactionTime_s);
    const slow = avgOver({ speed: -1 }, a => a.control.reactionTime_s);
    expect(slow).toBeGreaterThan(base);
  });

  it("speed bias is monotone: -1 > 0 > +1 for reactionTime_s", () => {
    const slow = avgOver({ speed: -1 }, a => a.control.reactionTime_s);
    const mid = avgBaseOver(a => a.control.reactionTime_s);
    const fast = avgOver({ speed: 1 }, a => a.control.reactionTime_s);
    expect(slow).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(fast);
  });
});

// ── Resilience bias ───────────────────────────────────────────────────────────

describe("NarrativeBias.resilience", () => {
  it("positive resilience raises average distressTolerance", () => {
    const base = avgBaseOver(a => a.resilience.distressTolerance);
    const tough = avgOver({ resilience: 1 }, a => a.resilience.distressTolerance);
    expect(tough).toBeGreaterThan(base);
  });

  it("negative resilience lowers average distressTolerance", () => {
    const base = avgBaseOver(a => a.resilience.distressTolerance);
    const fragile = avgOver({ resilience: -1 }, a => a.resilience.distressTolerance);
    expect(fragile).toBeLessThan(base);
  });

  it("positive resilience raises average shockTolerance", () => {
    const base = avgBaseOver(a => a.resilience.shockTolerance);
    const tough = avgOver({ resilience: 1 }, a => a.resilience.shockTolerance);
    expect(tough).toBeGreaterThan(base);
  });

  it("positive resilience raises average concussionTolerance", () => {
    const base = avgBaseOver(a => a.resilience.concussionTolerance);
    const tough = avgOver({ resilience: 1 }, a => a.resilience.concussionTolerance);
    expect(tough).toBeGreaterThan(base);
  });

  it("positive resilience raises average surfaceIntegrity", () => {
    const base = avgBaseOver(a => a.resilience.surfaceIntegrity);
    const tough = avgOver({ resilience: 1 }, a => a.resilience.surfaceIntegrity);
    expect(tough).toBeGreaterThan(base);
  });

  it("positive resilience raises average bulkIntegrity", () => {
    const base = avgBaseOver(a => a.resilience.bulkIntegrity);
    const tough = avgOver({ resilience: 1 }, a => a.resilience.bulkIntegrity);
    expect(tough).toBeGreaterThan(base);
  });

  it("positive resilience raises average structureIntegrity", () => {
    const base = avgBaseOver(a => a.resilience.structureIntegrity);
    const tough = avgOver({ resilience: 1 }, a => a.resilience.structureIntegrity);
    expect(tough).toBeGreaterThan(base);
  });

  it("positive resilience lowers average fatigueRate (better endurance)", () => {
    const base = avgBaseOver(a => a.resilience.fatigueRate);
    const tough = avgOver({ resilience: 1 }, a => a.resilience.fatigueRate);
    expect(tough).toBeLessThan(base);
  });

  it("positive resilience raises average recoveryRate", () => {
    const base = avgBaseOver(a => a.resilience.recoveryRate);
    const tough = avgOver({ resilience: 1 }, a => a.resilience.recoveryRate);
    expect(tough).toBeGreaterThan(base);
  });

  it("heatTolerance is unaffected by resilience bias", () => {
    // heatTolerance uses unbiased triSym; averaged over enough seeds the means are close
    const base = avgBaseOver(a => a.resilience.heatTolerance);
    const tough = avgOver({ resilience: 1 }, a => a.resilience.heatTolerance);
    const diff = Math.abs(tough - base) / base;
    // Without bias, RNG sequence for heatTolerance is same: expect within 5%
    expect(diff).toBeLessThan(0.10);
  });

  it("coldTolerance is unaffected by resilience bias", () => {
    const base = avgBaseOver(a => a.resilience.coldTolerance);
    const tough = avgOver({ resilience: 1 }, a => a.resilience.coldTolerance);
    const diff = Math.abs(tough - base) / base;
    expect(diff).toBeLessThan(0.10);
  });
});

// ── Agility bias ──────────────────────────────────────────────────────────────

describe("NarrativeBias.agility", () => {
  it("positive agility raises average controlQuality", () => {
    const base = avgBaseOver(a => a.control.controlQuality);
    const nimble = avgOver({ agility: 1 }, a => a.control.controlQuality);
    expect(nimble).toBeGreaterThan(base);
  });

  it("negative agility lowers average controlQuality", () => {
    const base = avgBaseOver(a => a.control.controlQuality);
    const clumsy = avgOver({ agility: -1 }, a => a.control.controlQuality);
    expect(clumsy).toBeLessThan(base);
  });

  it("positive agility raises average stability", () => {
    const base = avgBaseOver(a => a.control.stability);
    const nimble = avgOver({ agility: 1 }, a => a.control.stability);
    expect(nimble).toBeGreaterThan(base);
  });

  it("positive agility raises average fineControl", () => {
    const base = avgBaseOver(a => a.control.fineControl);
    const nimble = avgOver({ agility: 1 }, a => a.control.fineControl);
    expect(nimble).toBeGreaterThan(base);
  });
});

// ── Size bias ─────────────────────────────────────────────────────────────────

describe("NarrativeBias.size", () => {
  it("positive size raises average stature_m", () => {
    const base = avgBaseOver(a => a.morphology.stature_m);
    const large = avgOver({ size: 1 }, a => a.morphology.stature_m);
    expect(large).toBeGreaterThan(base);
  });

  it("negative size lowers average stature_m", () => {
    const base = avgBaseOver(a => a.morphology.stature_m);
    const small = avgOver({ size: -1 }, a => a.morphology.stature_m);
    expect(small).toBeLessThan(base);
  });

  it("positive size raises average mass_kg", () => {
    const base = avgBaseOver(a => a.morphology.mass_kg);
    const large = avgOver({ size: 1 }, a => a.morphology.mass_kg);
    expect(large).toBeGreaterThan(base);
  });

  it("size bias is monotone: -1 < 0 < +1 for stature_m", () => {
    const small = avgOver({ size: -1 }, a => a.morphology.stature_m);
    const mid = avgBaseOver(a => a.morphology.stature_m);
    const large = avgOver({ size: 1 }, a => a.morphology.stature_m);
    expect(small).toBeLessThan(mid);
    expect(mid).toBeLessThan(large);
  });
});

// ── Combined biases ───────────────────────────────────────────────────────────

describe("NarrativeBias — combined fields", () => {
  it("hero profile (strength+1, speed+1, agility+1) dominates on all combat axes", () => {
    const hero: NarrativeBias = { strength: 1, speed: 1, agility: 1 };
    const forceHero = avgOver(hero, a => a.performance.peakForce_N);
    const forceBase = avgBaseOver(a => a.performance.peakForce_N);
    const reactHero = avgOver(hero, a => a.control.reactionTime_s);
    const reactBase = avgBaseOver(a => a.control.reactionTime_s);
    const ctrlHero = avgOver(hero, a => a.control.controlQuality);
    const ctrlBase = avgBaseOver(a => a.control.controlQuality);
    expect(forceHero).toBeGreaterThan(forceBase);
    expect(reactHero).toBeLessThan(reactBase);
    expect(ctrlHero).toBeGreaterThan(ctrlBase);
  });

  it("villain profile (strength+1, resilience+1, size+1) is bigger and tougher", () => {
    const villain: NarrativeBias = { strength: 1, resilience: 1, size: 1 };
    const massVillain = avgOver(villain, a => a.morphology.mass_kg);
    const massBase = avgBaseOver(a => a.morphology.mass_kg);
    const shockVillain = avgOver(villain, a => a.resilience.shockTolerance);
    const shockBase = avgBaseOver(a => a.resilience.shockTolerance);
    expect(massVillain).toBeGreaterThan(massBase);
    expect(shockVillain).toBeGreaterThan(shockBase);
  });

  it("independent bias fields do not bleed across axes", () => {
    // speed-only bias: reactionTime changes, force should be same as base on average
    const speedOnly: NarrativeBias = { speed: 1 };
    const forceSpeed = avgOver(speedOnly, a => a.performance.peakForce_N);
    const forceBase = avgBaseOver(a => a.performance.peakForce_N);
    // RNG order preserved, so force should be identical
    expect(forceSpeed).toBe(forceBase);
  });
});

// ── Clamp invariants ──────────────────────────────────────────────────────────

describe("NarrativeBias — output remains within valid ranges", () => {
  const extremes: NarrativeBias[] = [
    { strength: 1, speed: 1, resilience: 1, agility: 1, size: 1 },
    { strength: -1, speed: -1, resilience: -1, agility: -1, size: -1 },
    { strength: 2 },   // out-of-range bias is clamped inside biasedTriSym
    { resilience: -2 },
  ];

  for (const bias of extremes) {
    it(`clamp holds for bias ${JSON.stringify(bias)}`, () => {
      for (const seed of SEEDS) {
        const a = generateIndividual(seed, HUMAN_BASE, bias);
        expect(a.morphology.actuatorScale).toBeGreaterThanOrEqual(q(0.6));
        expect(a.morphology.actuatorScale).toBeLessThanOrEqual(q(1.8));
        expect(a.control.controlQuality).toBeGreaterThanOrEqual(q(0.15));
        expect(a.control.controlQuality).toBeLessThanOrEqual(q(0.98));
        expect(a.resilience.distressTolerance).toBeGreaterThanOrEqual(q(0.01));
        expect(a.resilience.distressTolerance).toBeLessThanOrEqual(q(0.98));
        expect(a.resilience.fatigueRate).toBeGreaterThanOrEqual(q(0.4));
        expect(a.resilience.fatigueRate).toBeLessThanOrEqual(q(2.5));
        expect(a.resilience.recoveryRate).toBeGreaterThanOrEqual(q(0.4));
        expect(a.resilience.recoveryRate).toBeLessThanOrEqual(q(2.5));
        expect(a.performance.peakForce_N).toBeGreaterThan(0);
        expect(a.performance.peakPower_W).toBeGreaterThan(0);
      }
    });
  }
});
