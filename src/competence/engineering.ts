// src/competence/engineering.ts — Phase 38: Engineering Quality (Logical-Mathematical Intelligence)
//
// Logical-mathematical intelligence governs systematic reasoning applied to complex
// external problems: tactical analysis, engineering, research, resource planning.
//
// No kernel import — pure resolution module.

import type { Q } from "../units.js";
import { SCALE, q, clampQ, qMul, mulDiv } from "../units.js";
import type { Entity } from "../sim/entity.js";
import { makeRng } from "../rng.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EngineeringSpec {
  /** Engineering category. */
  category: "fortification" | "mechanism" | "weapon" | "vessel";
  /** Complexity of the project (0–1). */
  complexity_Q: Q;
  /** Time budget in hours. */
  timeBudget_h: number;
}

export interface EngineeringOutcome {
  /** Quality multiplier on structural integrity / resist_J. */
  qualityMul: Q;
  /** True if project has a latent flaw. */
  latentFlaw: boolean;
  /** Time actually taken (may exceed budget if quality suffers). */
  timeTaken_h: number;
  /** Success descriptor. */
  descriptor: "exceptional" | "good" | "adequate" | "poor" | "failure";
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Base quality multiplier at logicalMath q(0.50). */
const BASE_QUALITY_MUL: Q = q(0.70) as Q;

/** Maximum quality multiplier. */
const MAX_QUALITY_MUL: Q = q(1.20) as Q;

/** Minimum quality multiplier for success. */
const MIN_SUCCESS_QUALITY: Q = q(0.30) as Q;

/** Time factor: rushed work reduces quality. */
const TIME_FACTOR_BASE = 1.0;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve an engineering project.
 *
 * Formulas:
 *   qualityMul = logicalMath × (1 − complexity_Q × 0.30) × timeFactor
 *   P_latentFlaw = max(0, complexity_Q − logicalMath) × 0.40
 *
 * Troll (0.25) building complex siege engine → ~48% flaw chance. Heechee (0.95) → 0%.
 *
 * @param entity - The engineer; uses `cognition.logicalMathematical`.
 * @param spec - Engineering specification.
 * @param seed - Deterministic seed for RNG.
 * @returns Engineering outcome.
 */
export function resolveEngineering(
  entity: Entity,
  spec: EngineeringSpec,
  seed: number,
): EngineeringOutcome {
  const logicalMath: Q = (entity.attributes.cognition?.logicalMathematical ?? q(0.50)) as Q;

  // Complexity penalty: higher complexity reduces base quality
  const complexityPenalty = mulDiv(spec.complexity_Q, q(0.30), SCALE.Q);
  const complexityMul = clampQ(
    (SCALE.Q - complexityPenalty) as Q,
    q(0.40),
    SCALE.Q as Q,
  );

  // Time factor: adequate time budget improves quality
  // Optimal time = complexity × 10 hours baseline
  const optimalTime_h = 5 + (spec.complexity_Q / SCALE.Q) * 15; // 5-20 hours based on complexity
  const timeFactor = Math.min(1.2, spec.timeBudget_h / optimalTime_h);

  // Calculate quality multiplier
  const rawQuality = mulDiv(
    mulDiv(logicalMath, complexityMul, SCALE.Q) as Q,
    Math.round(timeFactor * SCALE.Q) as Q,
    SCALE.Q,
  );

  const qualityMul = clampQ(
    (BASE_QUALITY_MUL + mulDiv(rawQuality, q(0.50), SCALE.Q)) as Q,
    q(0.20),
    MAX_QUALITY_MUL,
  );

  // Latent flaw probability
  // P_flaw = max(0, complexity_Q − logicalMath) × 0.40
  const skillDeficit = Math.max(0, spec.complexity_Q - logicalMath);
  const pFlaw = mulDiv(skillDeficit as Q, q(0.40), SCALE.Q);

  // RNG for flaw check
  const rng = makeRng(seed, SCALE.Q);
  const flawRoll = rng.q01();
  const latentFlaw = flawRoll < pFlaw;

  // Determine descriptor
  let descriptor: EngineeringOutcome["descriptor"];
  if (qualityMul >= q(1.0)) {
    descriptor = latentFlaw ? "good" : "exceptional";
  } else if (qualityMul >= q(0.70)) {
    descriptor = "good";
  } else if (qualityMul >= MIN_SUCCESS_QUALITY) {
    descriptor = "adequate";
  } else if (qualityMul >= q(0.15)) {
    descriptor = "poor";
  } else {
    descriptor = "failure";
  }

  // Time taken: may overrun if quality is poor
  const timeTaken_h = descriptor === "poor"
    ? Math.round(spec.timeBudget_h * 1.5)
    : spec.timeBudget_h;

  return { qualityMul, latentFlaw, timeTaken_h, descriptor };
}

/**
 * Compute structural integrity multiplier from engineering quality.
 */
export function applyEngineeringQuality(
  baseIntegrity: Q,
  qualityMul: Q,
): Q {
  return clampQ(
    mulDiv(baseIntegrity, qualityMul, SCALE.Q) as Q,
    q(0.30),
    SCALE.Q as Q,
  );
}

/**
 * Check if entity is qualified for an engineering project.
 */
export function isQualifiedEngineer(
  entity: Entity,
  minLogicalMath: Q = q(0.40),
): boolean {
  const logicalMath: Q = (entity.attributes.cognition?.logicalMathematical ?? q(0.50)) as Q;
  return logicalMath >= minLogicalMath;
}

/**
 * Estimate project difficulty for an engineer.
 * Returns estimated quality multiplier without consuming resources.
 */
export function estimateProjectQuality(
  entity: Entity,
  spec: Omit<EngineeringSpec, "timeBudget_h"> & { timeBudget_h?: number },
): { estimatedQuality_Q: Q; flawRiskPercent: number } {
  const logicalMath: Q = (entity.attributes.cognition?.logicalMathematical ?? q(0.50)) as Q;

  // Simplified quality estimate
  const complexityPenalty = mulDiv(spec.complexity_Q, q(0.30), SCALE.Q);
  const complexityMul = clampQ(
    (SCALE.Q - complexityPenalty) as Q,
    q(0.40),
    SCALE.Q as Q,
  );

  const timeBudget = spec.timeBudget_h ?? 10;
  const optimalTime_h = 5 + (spec.complexity_Q / SCALE.Q) * 15;
  const timeFactor = Math.min(1.2, timeBudget / optimalTime_h);

  const rawQuality = mulDiv(
    mulDiv(logicalMath, complexityMul, SCALE.Q) as Q,
    Math.round(timeFactor * SCALE.Q) as Q,
    SCALE.Q,
  );

  const estimatedQuality_Q = clampQ(
    (BASE_QUALITY_MUL + mulDiv(rawQuality, q(0.50), SCALE.Q)) as Q,
    q(0.20),
    MAX_QUALITY_MUL,
  );

  // Flaw risk
  const skillDeficit = Math.max(0, spec.complexity_Q - logicalMath);
  const pFlaw = mulDiv(skillDeficit as Q, q(0.40), SCALE.Q);
  const flawRiskPercent = Math.round((pFlaw / SCALE.Q) * 100);

  return { estimatedQuality_Q, flawRiskPercent };
}
