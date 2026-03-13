// test/aging.test.ts — Phase 57: Aging & Lifespan

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import {
  HUMAN_LIFESPAN_YEARS,
  SECONDS_PER_YEAR,
  computeAgeFrac,
  getAgePhase,
  deriveAgeMultipliers,
  applyAgingToAttributes,
  stepAging,
  entityAgeYears,
} from "../src/sim/aging.js";
import { mkHumanoidEntity } from "../src/sim/testing.js";
import { generateIndividual } from "../src/generate.js";
import { HUMAN_BASE } from "../src/archetypes.js";

// ── Constants ──────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("HUMAN_LIFESPAN_YEARS is positive", () => {
    expect(HUMAN_LIFESPAN_YEARS).toBeGreaterThan(0);
  });

  it("SECONDS_PER_YEAR is 365 × 86 400", () => {
    expect(SECONDS_PER_YEAR).toBe(365 * 86_400);
  });
});

// ── computeAgeFrac ─────────────────────────────────────────────────────────────

describe("computeAgeFrac", () => {
  it("age 0 → ageFrac = q(0)", () => {
    expect(computeAgeFrac(0)).toBe(q(0));
  });

  it("age = lifespan → ageFrac = SCALE.Q", () => {
    expect(computeAgeFrac(HUMAN_LIFESPAN_YEARS)).toBe(SCALE.Q);
  });

  it("age > lifespan is clamped to SCALE.Q", () => {
    expect(computeAgeFrac(200, 80)).toBe(SCALE.Q);
  });

  it("halfway through lifespan → ageFrac ≈ q(0.50)", () => {
    const half = computeAgeFrac(HUMAN_LIFESPAN_YEARS / 2);
    expect(half).toBeGreaterThanOrEqual(q(0.49));
    expect(half).toBeLessThanOrEqual(q(0.51));
  });

  it("elf at 187 years (lifespan 600) ≈ human at 25 years (same developmental stage)", () => {
    const humanFrac = computeAgeFrac(25, 80);
    const elfFrac   = computeAgeFrac(187, 600);
    // Both should be around q(0.31) — within q(0.02) of each other
    expect(Math.abs(humanFrac - elfFrac)).toBeLessThan(q(0.02));
  });
});

// ── getAgePhase ────────────────────────────────────────────────────────────────

describe("getAgePhase", () => {
  it("age 0 → 'infant'", () => {
    expect(getAgePhase(0)).toBe("infant");
  });

  it("age 8 (ageFrac 0.10) → 'child'", () => {
    expect(getAgePhase(8)).toBe("child");
  });

  it("age 15 (ageFrac 0.1875) → 'adolescent'", () => {
    expect(getAgePhase(15)).toBe("adolescent");
  });

  it("age 25 (ageFrac 0.3125) → 'young_adult'", () => {
    expect(getAgePhase(25)).toBe("young_adult");
  });

  it("age 40 (ageFrac 0.50) → 'adult'", () => {
    expect(getAgePhase(40)).toBe("adult");
  });

  it("age 60 (ageFrac 0.75) → 'elder'", () => {
    expect(getAgePhase(60)).toBe("elder");
  });

  it("age 75 (ageFrac 0.9375) → 'ancient'", () => {
    expect(getAgePhase(75)).toBe("ancient");
  });

  it("elf at 450 years (lifespan 600, ageFrac 0.75) → 'elder'", () => {
    expect(getAgePhase(450, 600)).toBe("elder");
  });
});

// ── deriveAgeMultipliers ───────────────────────────────────────────────────────

describe("deriveAgeMultipliers", () => {
  it("young adult (age 24): muscularStrength_Q ≥ q(0.95) — at or near peak", () => {
    const m = deriveAgeMultipliers(24);
    expect(m.muscularStrength_Q).toBeGreaterThanOrEqual(q(0.95));
  });

  it("elder (age 60): muscularStrength_Q < young adult", () => {
    const youngAdult = deriveAgeMultipliers(24).muscularStrength_Q;
    const elder      = deriveAgeMultipliers(60).muscularStrength_Q;
    expect(elder).toBeLessThan(youngAdult);
  });

  it("child (age 8): muscularStrength_Q < young adult", () => {
    const child      = deriveAgeMultipliers(8).muscularStrength_Q;
    const youngAdult = deriveAgeMultipliers(24).muscularStrength_Q;
    expect(child).toBeLessThan(youngAdult);
  });

  it("young adult: reactionTime_Q ≈ q(1.0) — minimal latency change", () => {
    const m = deriveAgeMultipliers(24);
    expect(m.reactionTime_Q).toBeGreaterThanOrEqual(q(0.98));
    expect(m.reactionTime_Q).toBeLessThanOrEqual(q(1.05));
  });

  it("elder: reactionTime_Q > young adult (slower)", () => {
    const youngAdult = deriveAgeMultipliers(24).reactionTime_Q;
    const elder      = deriveAgeMultipliers(60).reactionTime_Q;
    expect(elder).toBeGreaterThan(youngAdult);
  });

  it("infant: reactionTime_Q > q(1.5) (much slower than adult baseline)", () => {
    const m = deriveAgeMultipliers(1);
    expect(m.reactionTime_Q).toBeGreaterThan(q(1.5));
  });

  it("elder cognitionCrystal > elder cognitionFluid (wisdom outlasts processing speed)", () => {
    const m = deriveAgeMultipliers(65);
    expect(m.cognitionCrystal_Q).toBeGreaterThan(m.cognitionFluid_Q);
  });

  it("young adult cognitionFluid > elder cognitionFluid (fluid peaks young)", () => {
    const ya    = deriveAgeMultipliers(24).cognitionFluid_Q;
    const elder = deriveAgeMultipliers(65).cognitionFluid_Q;
    expect(ya).toBeGreaterThan(elder);
  });

  it("elder distressTolerance ≥ young adult distressTolerance (wisdom bonus)", () => {
    const ya    = deriveAgeMultipliers(24).distressTolerance_Q;
    const elder = deriveAgeMultipliers(55).distressTolerance_Q;
    expect(elder).toBeGreaterThanOrEqual(ya);
  });

  it("stature stable between young_adult and adult (< 2 % change)", () => {
    const ya    = deriveAgeMultipliers(24).stature_Q;
    const adult = deriveAgeMultipliers(45).stature_Q;
    expect(Math.abs(ya - adult)).toBeLessThan(q(0.02));
  });
});

// ── applyAgingToAttributes ─────────────────────────────────────────────────────

describe("applyAgingToAttributes", () => {
  const baseAttrs = generateIndividual(1, HUMAN_BASE);

  it("at peak age (24): peakForce_N within 5 % of base", () => {
    const aged = applyAgingToAttributes(baseAttrs, 24);
    const diff = Math.abs(aged.performance.peakForce_N - baseAttrs.performance.peakForce_N);
    const fivePct = Math.round(baseAttrs.performance.peakForce_N * 0.05);
    expect(diff).toBeLessThanOrEqual(fivePct);
  });

  it("at elder (65): peakForce_N significantly lower than at peak", () => {
    const peak  = applyAgingToAttributes(baseAttrs, 24).performance.peakForce_N;
    const elder = applyAgingToAttributes(baseAttrs, 65).performance.peakForce_N;
    expect(elder).toBeLessThan(peak * 0.85); // at least 15 % lower
  });

  it("at elder (65): reactionTime_s longer than at peak", () => {
    const peak  = applyAgingToAttributes(baseAttrs, 24).control.reactionTime_s;
    const elder = applyAgingToAttributes(baseAttrs, 65).control.reactionTime_s;
    expect(elder).toBeGreaterThan(peak);
  });

  it("at child (8): peakForce_N substantially lower than at peak", () => {
    const peak  = applyAgingToAttributes(baseAttrs, 24).performance.peakForce_N;
    const child = applyAgingToAttributes(baseAttrs, 8).performance.peakForce_N;
    expect(child).toBeLessThan(peak * 0.70);
  });

  it("cognition (fluid): young adult logicalMathematical > elder logicalMathematical", () => {
    const ya    = applyAgingToAttributes(baseAttrs, 24).cognition!.logicalMathematical;
    const elder = applyAgingToAttributes(baseAttrs, 65).cognition!.logicalMathematical;
    expect(ya).toBeGreaterThan(elder);
  });

  it("cognition (crystal): elder interpersonal > young adult interpersonal", () => {
    const ya    = applyAgingToAttributes(baseAttrs, 24).cognition!.interpersonal;
    const elder = applyAgingToAttributes(baseAttrs, 55).cognition!.interpersonal;
    expect(elder).toBeGreaterThan(ya);
  });

  it("entity without cognition does not crash — cognition remains undefined", () => {
    const noCog = { ...baseAttrs, cognition: undefined };
    const aged  = applyAgingToAttributes(noCog, 65);
    expect(aged.cognition).toBeUndefined();
  });

  it("does not mutate the original base attributes", () => {
    const origForce = baseAttrs.performance.peakForce_N;
    applyAgingToAttributes(baseAttrs, 65);
    expect(baseAttrs.performance.peakForce_N).toBe(origForce);
  });
});

// ── stepAging ─────────────────────────────────────────────────────────────────

describe("stepAging", () => {
  it("initializes age state if absent", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    expect(e.age).toBeUndefined();
    stepAging(e, SECONDS_PER_YEAR);
    expect(e.age).toBeDefined();
    expect(e.age!.ageSeconds).toBe(SECONDS_PER_YEAR);
  });

  it("increments ageSeconds by elapsedSeconds", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    stepAging(e, SECONDS_PER_YEAR);
    stepAging(e, SECONDS_PER_YEAR);
    expect(e.age!.ageSeconds).toBe(2 * SECONDS_PER_YEAR);
  });

  it("entityAgeYears returns 0 for entity without age state", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    expect(entityAgeYears(e)).toBe(0);
  });

  it("entityAgeYears matches ageSeconds / SECONDS_PER_YEAR", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    stepAging(e, 25 * SECONDS_PER_YEAR);
    expect(entityAgeYears(e)).toBeCloseTo(25, 5);
  });

  it("aged entity phase matches expected phase after step", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    stepAging(e, 65 * SECONDS_PER_YEAR);
    expect(getAgePhase(entityAgeYears(e))).toBe("elder");
  });
});
