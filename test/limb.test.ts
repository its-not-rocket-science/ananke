/**
 * Phase 32B — Multi-Limb Granularity tests
 *
 * Groups:
 *   buildLimbStates     (5) — OCTOPOID_PLAN 8 arms, HUMANOID_PLAN 2 arms, plan without primary
 *   effectiveLimbForceMul (6) — all active, some severed, all severed, grip contribution
 *   stepLimbFatigue     (4) — engaged accumulation, idle skip, drain rate
 *   Kernel integration  (3) — init via stepWorld, per-tick fatigue, backward compat
 */

import { describe, it, expect } from "vitest";
import { q, SCALE, type Q } from "../src/units";
import {
  buildLimbStates,
  effectiveLimbForceMul,
  stepLimbFatigue,
} from "../src/sim/limb";
import { OCTOPOID_PLAN, HUMANOID_PLAN, AVIAN_PLAN } from "../src/sim/bodyplan";
import { defaultInjury } from "../src/sim/injury";
import { segmentIds } from "../src/sim/bodyplan";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";

// ── buildLimbStates ───────────────────────────────────────────────────────────

describe("buildLimbStates", () => {
  it("OCTOPOID_PLAN produces 8 limb states", () => {
    const limbs = buildLimbStates(OCTOPOID_PLAN);
    expect(limbs.length).toBe(8);
  });

  it("all limb segmentIds match arm IDs in OCTOPOID_PLAN", () => {
    const limbs = buildLimbStates(OCTOPOID_PLAN);
    const ids = limbs.map(l => l.segmentId);
    expect(ids).toContain("arm1");
    expect(ids).toContain("arm8");
  });

  it("HUMANOID_PLAN produces 2 limb states (leftArm, rightArm)", () => {
    const limbs = buildLimbStates(HUMANOID_PLAN);
    expect(limbs.length).toBe(2);
    const ids = limbs.map(l => l.segmentId);
    expect(ids).toContain("leftArm");
    expect(ids).toContain("rightArm");
  });

  it("AVIAN_PLAN produces 0 primary-manipulation limbs (wings are secondary)", () => {
    const limbs = buildLimbStates(AVIAN_PLAN);
    // Avian plan has secondary manipulation on wings — no primary
    expect(limbs.length).toBe(0);
  });

  it("initial state: gripQ=0, engagedWith=0, fatigueJ=0", () => {
    const limbs = buildLimbStates(OCTOPOID_PLAN);
    for (const l of limbs) {
      expect(l.gripQ).toBe(0);
      expect(l.engagedWith).toBe(0);
      expect(l.fatigueJ).toBe(0);
    }
  });
});

// ── effectiveLimbForceMul ─────────────────────────────────────────────────────

describe("effectiveLimbForceMul", () => {
  it("all 8 arms active, no grip → returns 8/8 = q(1.0)", () => {
    const limbs = buildLimbStates(OCTOPOID_PLAN);
    const injury = defaultInjury(segmentIds(OCTOPOID_PLAN));
    const mul = effectiveLimbForceMul(limbs, injury);
    expect(mul).toBe(q(1.0));
  });

  it("4 of 8 arms severed → returns ~q(0.50)", () => {
    const limbs = buildLimbStates(OCTOPOID_PLAN);
    const injury = defaultInjury(segmentIds(OCTOPOID_PLAN));
    // Sever first 4 arms
    for (const seg of ["arm1", "arm2", "arm3", "arm4"]) {
      (injury.byRegion)[seg]!.structuralDamage = SCALE.Q;
    }
    const mul = effectiveLimbForceMul(limbs, injury);
    expect(mul).toBe(q(0.5)); // 4/8
  });

  it("all arms severed → returns q(0)", () => {
    const limbs = buildLimbStates(OCTOPOID_PLAN);
    const injury = defaultInjury(segmentIds(OCTOPOID_PLAN));
    for (const seg of ["arm1","arm2","arm3","arm4","arm5","arm6","arm7","arm8"]) {
      (injury.byRegion)[seg]!.structuralDamage = SCALE.Q;
    }
    const mul = effectiveLimbForceMul(limbs, injury);
    expect(mul).toBe(q(0));
  });

  it("with grip set: mul = activeFrac × avgGrip", () => {
    const limbs = buildLimbStates(OCTOPOID_PLAN);
    // Set all 8 grips to q(0.50)
    for (const l of limbs) l.gripQ = q(0.5) as Q;
    const injury = defaultInjury(segmentIds(OCTOPOID_PLAN));
    const mul = effectiveLimbForceMul(limbs, injury);
    // activeFrac = 1.0, avgGrip = q(0.5) → mul = q(0.5)
    expect(mul).toBeCloseTo(q(0.5), -1); // within 1 Q unit
  });

  it("empty limbStates array returns q(1.0)", () => {
    const injury = defaultInjury(segmentIds(OCTOPOID_PLAN));
    expect(effectiveLimbForceMul([], injury)).toBe(q(1.0));
  });

  it("2 arms (HUMANOID): 1 severed → 0.5 × activeFrac", () => {
    const limbs = buildLimbStates(HUMANOID_PLAN);
    const injury = defaultInjury(segmentIds(HUMANOID_PLAN));
    (injury.byRegion)["leftArm"]!.structuralDamage = SCALE.Q;
    const mul = effectiveLimbForceMul(limbs, injury);
    expect(mul).toBe(q(0.5)); // 1/2
  });
});

// ── stepLimbFatigue ───────────────────────────────────────────────────────────

describe("stepLimbFatigue", () => {
  it("no fatigue when no limbs are engaged", () => {
    const limbs = buildLimbStates(OCTOPOID_PLAN);
    stepLimbFatigue(limbs, 100_000, 1.0); // 100N peak force
    for (const l of limbs) expect(l.fatigueJ).toBe(0);
  });

  it("engaged limb accumulates fatigue", () => {
    const limbs = buildLimbStates(OCTOPOID_PLAN);
    limbs[0]!.engagedWith = 99;
    stepLimbFatigue(limbs, 80_000, 1.0); // 80N
    expect(limbs[0]!.fatigueJ).toBeGreaterThan(0);
  });

  it("fatigue is proportional to delta_s", () => {
    const limbsA = buildLimbStates(OCTOPOID_PLAN);
    const limbsB = buildLimbStates(OCTOPOID_PLAN);
    limbsA[0]!.engagedWith = 1;
    limbsB[0]!.engagedWith = 1;
    stepLimbFatigue(limbsA, 80_000, 1.0);
    stepLimbFatigue(limbsB, 80_000, 2.0);
    expect(limbsB[0]!.fatigueJ).toBeCloseTo(limbsA[0]!.fatigueJ * 2, 5);
  });

  it("only engaged limbs accumulate fatigue", () => {
    const limbs = buildLimbStates(OCTOPOID_PLAN);
    limbs[2]!.engagedWith = 7; // arm3 only
    stepLimbFatigue(limbs, 80_000, 1.0);
    for (let i = 0; i < limbs.length; i++) {
      if (i === 2) expect(limbs[i]!.fatigueJ).toBeGreaterThan(0);
      else expect(limbs[i]!.fatigueJ).toBe(0);
    }
  });
});

// ── Kernel integration ─────────────────────────────────────────────────────────

describe("kernel integration", () => {
  it("limbStates not initialised for entity without bodyPlan", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    stepWorld(world, new Map(), { tractionCoeff: q(0.9) });
    expect(e.limbStates).toBeUndefined();
  });

  it("entity with bodyPlan gets limbStates initialised on first stepWorld", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.bodyPlan = OCTOPOID_PLAN;
    e.injury = defaultInjury(segmentIds(OCTOPOID_PLAN));
    const world = mkWorld(1, [e]);
    stepWorld(world, new Map(), { tractionCoeff: q(0.9) });
    expect(e.limbStates).toBeDefined();
    expect(e.limbStates!.length).toBe(8);
  });

  it("limb fatigue accumulates per tick for engaged limb", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.bodyPlan = HUMANOID_PLAN;
    e.injury = defaultInjury(segmentIds(HUMANOID_PLAN));
    const world = mkWorld(1, [e]);
    // Initialize limbStates first
    stepWorld(world, new Map(), { tractionCoeff: q(0.9) });
    // Engage a limb
    e.limbStates![0]!.engagedWith = 99;
    const fatigueBefore = e.limbStates![0]!.fatigueJ;
    // Run another tick
    stepWorld(world, new Map(), { tractionCoeff: q(0.9) });
    expect(e.limbStates![0]!.fatigueJ).toBeGreaterThan(fatigueBefore);
  });
});
