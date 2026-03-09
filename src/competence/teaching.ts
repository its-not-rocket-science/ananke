// src/competence/teaching.ts — Phase 37: Teaching and Skill Transfer
//
// Interpersonal intelligence governs social reading and teaching effectiveness.
// Extends Phase 21 progression system with interpersonal-based skill transfer.
//
// No kernel import — pure resolution module.

import type { Q } from "../units.js";
import { SCALE, q, clampQ, qMul, mulDiv } from "../units.js";
import type { Entity } from "../sim/entity.js";
import type { SkillId } from "../sim/skills.js";
import { getSkill } from "../sim/skills.js";
import { makeRng } from "../rng.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TeachingSpec {
  /** Skill domain being taught. */
  domain: SkillId;
  /** Hours of teaching session. */
  hours: number;
  /** Teacher's interpersonal skill quality (optional override). */
  teacherInterpersonal_Q?: Q;
  /** Learner's natural learning rate (optional override). */
  learnerLearningRate_Q?: Q;
}

export interface TeachingOutcome {
  /** XP gained by learner. */
  xpGained: number;
  /** Teacher fatigue in joules. */
  teacherFatigueJ: number;
  /** Teaching quality multiplier (0–1). */
  teachingQuality_Q: Q;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Base XP per hour of quality teaching. */
const BASE_XP_RATE = 10; // 10 XP per hour at full quality

/** Base fatigue cost per hour of teaching. */
const BASE_FATIGUE_PER_HOUR = 500; // 500 J per hour

/** Maximum XP gain per session. */
const MAX_XP_PER_SESSION = 100;

/** Fatigue multiplier for extended sessions. */
const FATIGUE_MULTIPLIER = 1.5;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve a teaching session and compute XP gain.
 *
 * Formula:
 *   xpGained = hours × BASE_XP_RATE × interpersonal(teacher) × learningRate(learner)
 *   teacherFatigueJ = hours × BASE_FATIGUE_PER_HOUR × FATIGUE_MULTIPLIER
 *
 * @param teacher - The entity providing instruction.
 * @param learner - The entity receiving instruction.
 * @param spec - Teaching specification.
 * @returns Teaching outcome with XP gained and teacher fatigue.
 */
export function resolveTeaching(
  teacher: Entity,
  learner: Entity,
  spec: TeachingSpec,
): TeachingOutcome {
  // Get interpersonal skill (teacher's ability to convey knowledge)
  const interpersonal: Q = spec.teacherInterpersonal_Q
    ?? (teacher.attributes.cognition?.interpersonal ?? q(0.50)) as Q;

  // Learning rate based on learner's interpersonal (receptivity) and natural aptitude
  // Phase 37: interpersonal affects both teaching AND learning
  const learnerInterpersonal: Q = spec.learnerLearningRate_Q
    ?? (learner.attributes.cognition?.interpersonal ?? q(0.50)) as Q;

  // Teaching quality: teacher's interpersonal skill
  const teachingQuality_Q = clampQ(interpersonal, q(0.20), SCALE.Q as Q);

  // Learning rate: learner's interpersonal (social learning) + existing skill level
  const existingSkill = getSkill(learner.skills, spec.domain);
  const skillLevelBonus = clampQ(
    mulDiv(existingSkill.energyTransferMul, q(0.30), SCALE.Q) as Q,
    q(0),
    q(0.30),
  );

  const learningRate_Q = clampQ(
    (qMul(learnerInterpersonal, q(0.70) as Q) + skillLevelBonus) as Q,
    q(0.20),
    SCALE.Q as Q,
  );

  // Calculate XP: hours × base rate × teaching quality × learning rate
  const rawXp = spec.hours * BASE_XP_RATE;
  const qualityMul = mulDiv(teachingQuality_Q, learningRate_Q, SCALE.Q);
  const xpGained = Math.min(
    MAX_XP_PER_SESSION,
    Math.round(rawXp * qualityMul / SCALE.Q),
  );

  // Teacher fatigue scales with hours and effort (inversely with skill)
  // Better teachers expend less energy for same result
  const effortMul = clampQ(
    (SCALE.Q - mulDiv(interpersonal, q(0.50), SCALE.Q)) as Q,
    q(0.50),
    SCALE.Q as Q,
  );
  const baseFatigue = spec.hours * BASE_FATIGUE_PER_HOUR;
  const teacherFatigueJ = Math.round(
    baseFatigue * FATIGUE_MULTIPLIER * effortMul / SCALE.Q,
  );

  return { xpGained, teacherFatigueJ, teachingQuality_Q };
}

/**
 * Compute maximum effective teaching hours based on teacher stamina.
 */
export function computeMaxTeachingHours(
  teacher: Entity,
  availableEnergyJ: number,
): number {
  const interpersonal: Q = (teacher.attributes.cognition?.interpersonal ?? q(0.50)) as Q;

  // More skilled teachers use energy more efficiently
  const effortMul = clampQ(
    (SCALE.Q - mulDiv(interpersonal, q(0.50), SCALE.Q)) as Q,
    q(0.50),
    SCALE.Q as Q,
  );

  const fatiguePerHour = BASE_FATIGUE_PER_HOUR * FATIGUE_MULTIPLIER * effortMul / SCALE.Q;
  return Math.floor(availableEnergyJ / Math.max(1, fatiguePerHour));
}

/**
 * Check if teacher is qualified to teach a skill.
 * Teacher should have at least journeyman level (skill delta showing improvement).
 */
export function isQualifiedTeacher(
  teacher: Entity,
  domain: SkillId,
  minimumProficiency: Q = q(0.30),
): boolean {
  const skill = getSkill(teacher.skills, domain);

  // Check if teacher has made meaningful progress in this skill
  // Negative energyTransferMul means they've learned (more efficient)
  // A good teacher should have negative energyTransferMul (below baseline)
  // proficiency = 1.0 + (energyTransferMul / SCALE.Q), where negative mul = better
  const proficiency = clampQ(
    (SCALE.Q + skill.energyTransferMul) as Q,
    q(0),
    SCALE.Q as Q,
  );

  // Default skill has energyTransferMul = 0, so proficiency = SCALE.Q (1.0)
  // We need to check if they've actually improved (negative mul)
  const hasActualSkill = skill.energyTransferMul < 0;

  return hasActualSkill && proficiency >= minimumProficiency;
}

// ── Deception detection (Phase 37 extension) ──────────────────────────────────

/**
 * Compute probability of detecting deception.
 *
 * Formula:
 *   P_detect = clamp(
 *     attentionDepth × 0.50 + interpersonal × 0.50 − plausibility,
 *     0, 1)
 *
 * @param detector - The entity attempting to detect deception.
 * @param plausibility_Q - Plausibility of the deception (0–1).
 * @returns Detection probability (0–1).
 */
export function computeDeceptionDetectionProbability(
  detector: Entity,
  plausibility_Q: Q,
): Q {
  // Attention depth contribution (perception skill)
  const attentionDepth = detector.attributes.perception?.attentionDepth ?? 4;
  const attentionContrib = clampQ(
    Math.trunc((attentionDepth * SCALE.Q) / 10) as Q,
    q(0),
    SCALE.Q as Q,
  );

  // Interpersonal contribution (social intuition)
  const interpersonal: Q = (detector.attributes.cognition?.interpersonal ?? q(0.50)) as Q;

  // Combined detection capability: 50% attention + 50% interpersonal
  const detectionCap = clampQ(
    (mulDiv(attentionContrib, q(0.50), SCALE.Q) +
     mulDiv(interpersonal, q(0.50), SCALE.Q)) as Q,
    q(0),
    SCALE.Q as Q,
  );

  // Subtract plausibility (better lies are harder to detect)
  const pDetect = clampQ(
    (detectionCap - plausibility_Q) as Q,
    q(0),
    SCALE.Q as Q,
  );

  return pDetect;
}

/**
 * Resolve deception detection.
 * @returns True if deception was detected.
 */
export function resolveDeceptionDetection(
  detector: Entity,
  plausibility_Q: Q,
  seed: number,
): { detected: boolean; confidence_Q: Q } {
  const pDetect = computeDeceptionDetectionProbability(detector, plausibility_Q);

  const rng = makeRng(seed, SCALE.Q);
  const roll = rng.q01();

  const detected = roll < pDetect;

  // Confidence based on detection probability (higher = more certain)
  const confidence_Q = clampQ(
    (pDetect + mulDiv(rng.q01(), q(0.20), SCALE.Q)) as Q,
    q(0.50),
    SCALE.Q as Q,
  );

  return { detected, confidence_Q };
}
