// src/competence/language.ts — Phase 37: Linguistic Intelligence
//
// Linguistic intelligence governs command clarity, multilingual competence,
// persuasive argument structure, and written record quality.
//
// No kernel import — pure resolution module.

import type { Q } from "../units.js";
import { SCALE, q, clampQ, qMul, mulDiv } from "../units.js";
import type { Entity } from "../sim/entity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Language capacity with fluency level.
 */
export interface LanguageCapacity {
  /** Language identifier (e.g., "common", "elvish", "klingonese"). */
  languageId: string;
  /** Fluency level: q(1.0) = native, q(0.50) = conversational, q(0.20) = survival. */
  fluency_Q: Q;
}

/**
 * Outcome of a command transmission to a formation.
 */
export interface CommandTransmission {
  /** Fraction of formation receiving correctly (0–1). */
  receptionRate_Q: Q;
  /** Delay in ticks before command is fully transmitted. */
  transmissionDelay_ticks: number;
}

/**
 * Specification for language-based communication check.
 */
export interface LanguageCheckSpec {
  /** Target language being used. */
  targetLanguage: string;
  /** Minimum fluency required for the communication. */
  minFluency_Q?: Q;
}

/**
 * Outcome of a language check.
 */
export interface LanguageCheckOutcome {
  /** True if entity has sufficient fluency. */
  canCommunicate: boolean;
  /** Entity's fluency in the target language. */
  fluency_Q: Q;
  /** Communication quality multiplier (0–1). */
  qualityMul_Q: Q;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Base reception rate at linguistic q(0.50) for formation size 1. */
const BASE_RECEPTION_RATE: Q = q(0.70) as Q;

/** Maximum formation size before reception penalties apply. */
const OPTIMAL_FORMATION_SIZE = 10;

/** Base delay divisor: linguistic × BASE_DELAY_DIVISOR. */
const BASE_DELAY_DIVISOR = 20;

/** Minimum fluency for basic communication. */
const MIN_FLUENCY_THRESHOLD: Q = q(0.10) as Q;

/** Default fluency when entity has no languages defined. */
const DEFAULT_FLUENCY: Q = q(0.50) as Q;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get entity's fluency in a specific language.
 * Returns default q(0.50) if no languages defined or language not found.
 */
export function getLanguageFluency(entity: Entity, languageId: string): Q {
  const languages = entity.attributes.languages;
  if (!languages || languages.length === 0) {
    return DEFAULT_FLUENCY;
  }
  const lang = languages.find((l) => l.languageId === languageId);
  return lang?.fluency_Q ?? MIN_FLUENCY_THRESHOLD;
}

/**
 * Check if entity can communicate in a language and at what quality.
 */
export function checkLanguage(
  entity: Entity,
  spec: LanguageCheckSpec,
): LanguageCheckOutcome {
  const fluency_Q = getLanguageFluency(entity, spec.targetLanguage);
  const minFluency = spec.minFluency_Q ?? MIN_FLUENCY_THRESHOLD;
  const canCommunicate = fluency_Q >= minFluency;

  // Quality multiplier scales with fluency above minimum
  const qualityMul_Q = canCommunicate
    ? clampQ(mulDiv(fluency_Q, SCALE.Q, q(1.0)) as Q, q(0.20), SCALE.Q as Q)
    : (q(0) as Q);

  return { canCommunicate, fluency_Q, qualityMul_Q };
}

/**
 * Compute communication penalty between two entities speaking different languages.
 * Returns the minimum fluency between initiator's target language and target's response language.
 */
export function computeLanguageBarrier(
  initiator: Entity,
  target: Entity,
  initiatorLanguage: string,
  targetLanguage: string,
): Q {
  const initiatorFluency = getLanguageFluency(initiator, initiatorLanguage);
  const targetFluency = getLanguageFluency(target, targetLanguage);

  // Communication limited by the least fluent participant
  return Math.min(initiatorFluency, targetFluency) as Q;
}

/**
 * Resolve command transmission to a formation.
 *
 * Formula:
 *   receptionRate_Q = linguistic × formationBonus(formationSize)
 *   transmissionDelay_ticks = ceil(formationSize / (linguistic × 20))
 *
 * @param commander - The entity issuing commands.
 * @param formationSize - Number of units in the formation.
 * @returns Command transmission outcome.
 */
export function resolveCommandTransmission(
  commander: Entity,
  formationSize: number,
): CommandTransmission {
  const linguistic: Q = (commander.attributes.cognition?.linguistic ?? q(0.50)) as Q;

  // Formation size penalty: larger formations are harder to coordinate
  // Bonus = 1.0 for size <= 10, then degrades linearly
  const sizePenalty = Math.max(0, formationSize - OPTIMAL_FORMATION_SIZE);
  const formationBonus = clampQ(
    (SCALE.Q - mulDiv(sizePenalty as Q, q(0.02), SCALE.Q)) as Q,
    q(0.30),
    SCALE.Q as Q,
  );

  // Reception rate: linguistic skill × formation size bonus
  const receptionRate_Q = clampQ(
    qMul(linguistic, formationBonus) as Q,
    q(0.10),
    SCALE.Q as Q,
  );

  // Delay: larger formations + lower linguistic = more delay
  // delay = ceil(formationSize / (linguistic × 20))
  const linguisticFactor = Math.max(1, mulDiv(linguistic, BASE_DELAY_DIVISOR, SCALE.Q));
  const transmissionDelay_ticks = Math.ceil(formationSize / linguisticFactor);

  return { receptionRate_Q, transmissionDelay_ticks };
}

/**
 * Compute effective command range based on linguistic skill.
 * Higher linguistic = commands carry farther.
 */
export function computeCommandRange_m(commander: Entity): number {
  const linguistic: Q = (commander.attributes.cognition?.linguistic ?? q(0.50)) as Q;
  const baseRange = 50; // 50 meters base
  const maxRange = 500; // 500 meters max

  // Range scales from base to max based on linguistic
  const range = baseRange + mulDiv(linguistic, (maxRange - baseRange) as Q, SCALE.Q);
  return Math.round(range);
}

// ── Backward compatibility ────────────────────────────────────────────────────

/**
 * Check if entity has any language capacity defined.
 */
export function hasLanguageCapacity(entity: Entity): boolean {
  const languages = entity.attributes.languages;
  return languages !== undefined && languages.length > 0;
}

/**
 * Get native language (fluency >= 0.80) or highest fluency language.
 */
export function getPrimaryLanguage(entity: Entity): string | undefined {
  const languages = entity.attributes.languages;
  if (!languages || languages.length === 0) {
    return undefined;
  }

  // Find native-level language first
  const native = languages.find((l) => l.fluency_Q >= q(0.80));
  if (native) return native.languageId;

  // Otherwise return highest fluency
  const highest = languages.reduce((best, current) =>
    current.fluency_Q > best.fluency_Q ? current : best,
  );
  return highest.languageId;
}
