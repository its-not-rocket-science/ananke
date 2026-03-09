/**
 * Phase 37 — Interpersonal Intelligence: Teaching and Deception Detection
 *
 * Groups:
 *   Teaching resolution    (6) — XP gain, fatigue, interpersonal effects
 *   Teaching limits        (3) — max hours, qualification
 *   Deception detection    (5) — probability, confidence, interpersonal
 */

import { describe, it, expect } from "vitest";
import { SCALE, q, type Q } from "../src/units";
import {
  resolveTeaching,
  computeMaxTeachingHours,
  isQualifiedTeacher,
  computeDeceptionDetectionProbability,
  resolveDeceptionDetection,
  type TeachingSpec,
} from "../src/competence/teaching";
import { mkHumanoidEntity } from "../src/sim/testing";
import type { Entity } from "../src/sim/entity";
import type { SkillId } from "../src/sim/skills";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkEntityWithInterpersonal(id: number, interpersonal: Q): Entity {
  const e = mkHumanoidEntity(id, 1, 0, 0);
  return {
    ...e,
    attributes: {
      ...e.attributes,
      cognition: {
        linguistic: q(0.60) as Q,
        logicalMathematical: q(0.60) as Q,
        spatial: q(0.60) as Q,
        bodilyKinesthetic: q(0.60) as Q,
        musical: q(0.55) as Q,
        interpersonal,
        intrapersonal: q(0.60) as Q,
        naturalist: q(0.55) as Q,
        interSpecies: q(0.35) as Q,
      },
    },
  };
}

function mkEntityWithAttention(id: number, attentionDepth: number): Entity {
  const e = mkHumanoidEntity(id, 1, 0, 0);
  return {
    ...e,
    attributes: {
      ...e.attributes,
      perception: {
        visionRange_m: 50000,
        visionArcDeg: 120,
        halfArcCosQ: q(0.5),
        hearingRange_m: 30000,
        decisionLatency_s: 20000,
        attentionDepth,
        threatHorizon_m: 100000,
      },
    },
  };
}

// ── Teaching Resolution ───────────────────────────────────────────────────────

describe("teaching resolution", () => {
  it("higher teacher interpersonal increases XP gain", () => {
    const lowSkill = mkEntityWithInterpersonal(1, q(0.30));
    const highSkill = mkEntityWithInterpersonal(2, q(0.90));
    const learner = mkEntityWithInterpersonal(3, q(0.50));

    const spec: TeachingSpec = { domain: "meleeCombat" as SkillId, hours: 4 };

    const lowResult = resolveTeaching(lowSkill, learner, spec);
    const highResult = resolveTeaching(highSkill, learner, spec);

    expect(highResult.xpGained).toBeGreaterThanOrEqual(lowResult.xpGained);
  });

  it("higher learner interpersonal increases XP gain", () => {
    const teacher = mkEntityWithInterpersonal(1, q(0.70));
    const slowLearner = mkEntityWithInterpersonal(2, q(0.30));
    const fastLearner = mkEntityWithInterpersonal(3, q(0.90));

    const spec: TeachingSpec = { domain: "meleeCombat" as SkillId, hours: 4 };

    const slowResult = resolveTeaching(teacher, slowLearner, spec);
    const fastResult = resolveTeaching(teacher, fastLearner, spec);

    expect(fastResult.xpGained).toBeGreaterThanOrEqual(slowResult.xpGained);
  });

  it("longer sessions give more XP (up to cap)", () => {
    const teacher = mkEntityWithInterpersonal(1, q(0.70));
    const learner = mkEntityWithInterpersonal(2, q(0.70));

    const shortSpec: TeachingSpec = { domain: "meleeCombat" as SkillId, hours: 2 };
    const longSpec: TeachingSpec = { domain: "meleeCombat" as SkillId, hours: 8 };

    const shortResult = resolveTeaching(teacher, learner, shortSpec);
    const longResult = resolveTeaching(teacher, learner, longSpec);

    expect(longResult.xpGained).toBeGreaterThanOrEqual(shortResult.xpGained);
  });

  it("teaching produces fatigue for teacher", () => {
    const teacher = mkEntityWithInterpersonal(1, q(0.70));
    const learner = mkEntityWithInterpersonal(2, q(0.70));

    const spec: TeachingSpec = { domain: "meleeCombat" as SkillId, hours: 4 };
    const result = resolveTeaching(teacher, learner, spec);

    expect(result.teacherFatigueJ).toBeGreaterThan(0);
  });

  it("teaching quality reflects teacher interpersonal", () => {
    const lowSkill = mkEntityWithInterpersonal(1, q(0.30));
    const highSkill = mkEntityWithInterpersonal(2, q(0.90));
    const learner = mkEntityWithInterpersonal(3, q(0.50));

    const spec: TeachingSpec = { domain: "meleeCombat" as SkillId, hours: 2 };

    const lowResult = resolveTeaching(lowSkill, learner, spec);
    const highResult = resolveTeaching(highSkill, learner, spec);

    expect(highResult.teachingQuality_Q).toBeGreaterThan(lowResult.teachingQuality_Q);
  });

  it("XP per session is capped", () => {
    const teacher = mkEntityWithInterpersonal(1, q(1.0));
    const learner = mkEntityWithInterpersonal(2, q(1.0));

    const spec: TeachingSpec = { domain: "meleeCombat" as SkillId, hours: 20 };
    const result = resolveTeaching(teacher, learner, spec);

    expect(result.xpGained).toBeLessThanOrEqual(100); // MAX_XP_PER_SESSION
  });
});

// ── Teaching Limits ───────────────────────────────────────────────────────────

describe("teaching limits", () => {
  it("computeMaxTeachingHours scales with available energy", () => {
    const teacher = mkEntityWithInterpersonal(1, q(0.70));

    const lowEnergy = computeMaxTeachingHours(teacher, 1000);
    const highEnergy = computeMaxTeachingHours(teacher, 10000);

    expect(highEnergy).toBeGreaterThan(lowEnergy);
  });

  it("isQualifiedTeacher returns false for unskilled teachers", () => {
    const unskilled = mkHumanoidEntity(1, 1, 0, 0);
    expect(isQualifiedTeacher(unskilled, "meleeCombat" as SkillId)).toBe(false);
  });

  it("isQualifiedTeacher returns true for skilled teachers", () => {
    // Create entity with some skill progression
    const skilled = mkHumanoidEntity(1, 1, 0, 0);
    skilled.skills = new Map([["meleeCombat", { energyTransferMul: -5000 }]]);

    expect(isQualifiedTeacher(skilled, "meleeCombat" as SkillId)).toBe(true);
  });
});

// ── Deception Detection ───────────────────────────────────────────────────────

describe("deception detection", () => {
  it("higher attention depth increases detection probability", () => {
    const lowAttention = mkEntityWithAttention(1, 2);
    const highAttention = mkEntityWithAttention(2, 10);

    const lowProb = computeDeceptionDetectionProbability(lowAttention, q(0.50));
    const highProb = computeDeceptionDetectionProbability(highAttention, q(0.50));

    expect(highProb).toBeGreaterThanOrEqual(lowProb);
  });

  it("higher interpersonal increases detection probability", () => {
    const lowSocial = mkEntityWithInterpersonal(1, q(0.20));
    const highSocial = mkEntityWithInterpersonal(2, q(0.90));

    const lowProb = computeDeceptionDetectionProbability(lowSocial, q(0.50));
    const highProb = computeDeceptionDetectionProbability(highSocial, q(0.50));

    expect(highProb).toBeGreaterThanOrEqual(lowProb);
  });

  it("higher plausibility reduces detection probability", () => {
    const detector = mkEntityWithInterpersonal(1, q(0.70));

    const lowPlausProb = computeDeceptionDetectionProbability(detector, q(0.20));
    const highPlausProb = computeDeceptionDetectionProbability(detector, q(0.80));

    expect(lowPlausProb).toBeGreaterThanOrEqual(highPlausProb);
  });

  it("detection probability is bounded 0-1", () => {
    const poorDetector = mkEntityWithAttention(1, 1);
    const excellentDetector = mkEntityWithAttention(2, 10);

    const lowProb = computeDeceptionDetectionProbability(poorDetector, q(1.0));
    const highProb = computeDeceptionDetectionProbability(excellentDetector, q(0));

    expect(lowProb).toBeGreaterThanOrEqual(0);
    expect(highProb).toBeLessThanOrEqual(SCALE.Q);
  });

  it("resolveDeceptionDetection returns detected flag and confidence", () => {
    const detector = mkEntityWithInterpersonal(1, q(0.70));

    const result = resolveDeceptionDetection(detector, q(0.50), 42);

    expect(typeof result.detected).toBe("boolean");
    expect(result.confidence_Q).toBeGreaterThanOrEqual(0);
    expect(result.confidence_Q).toBeLessThanOrEqual(SCALE.Q);
  });
});
