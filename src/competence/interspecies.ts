// src/competence/interspecies.ts — Phase 36: Inter-Species Intelligence & Xenodiplomacy
//
// Inter-species intelligence models the ability to understand, read, and communicate
// with minds operating on fundamentally different cognitive and sensory substrates.
//
// No kernel import — pure resolution module.

import type { Q, I32 } from "../units.js";
import { SCALE, q, clampQ, qMul, mulDiv } from "../units.js";
import type { Entity } from "../sim/entity.js";
import { makeRng } from "../rng.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Inter-species profile tracking empathy and species-specific comprehension.
 */
export interface InterSpeciesProfile {
  /** Base empathy quotient for cross-species interaction. */
  empathy_Q: Q;
  /** Species IDs with which the entity has deep familiarity. */
  speciesAffinity: string[];
  /** Map of species ID → comprehension quality for signaling. */
  signalVocab: Map<string, Q>;
}

/**
 * Signal action for cross-species communication (non-verbal).
 */
export interface SignalSpec {
  /** Target species to signal. */
  targetSpecies: string;
  /** Intent being communicated. */
  intent: "calm" | "submit" | "ally" | "territory";
  /** Base fear level of the target animal/entity (0 = calm, 1 = terrified). */
  targetFearQ: Q;
}

/**
 * Outcome of a signal attempt.
 */
export interface SignalOutcome {
  /** True if signal was successfully communicated and understood. */
  success: boolean;
  /** Quality of comprehension (0–1). */
  comprehension_Q: Q;
  /** True if signal aggravated the target (hostile misinterpretation). */
  aggravated: boolean;
}

/**
 * Latency penalty context for unfamiliar species combat.
 */
export interface UnfamiliarSpeciesContext {
  /** The entity making decisions. */
  entity: Entity;
  /** Species ID of the opponent. */
  opponentSpecies: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum latency penalty in milliseconds (80ms at interSpecies q(0.0)). */
const MAX_LATENCY_PENALTY_MS: I32 = 80 * SCALE.s / 1000; // 80ms in Q-units

/** Scaling factor: penalty = (1.0 − interSpecies) × MAX_LATENCY_PENALTY_MS. */
const LATENCY_PENALTY_SCALE: I32 = MAX_LATENCY_PENALTY_MS;

/** Base success probability for signaling without vocabulary. */
const SIGNAL_BASE_PROBABILITY: Q = q(0.10) as Q;

/** Aggravation threshold: low empathy + high fear → possible hostile reaction. */
const AGGRAVATION_THRESHOLD: Q = q(0.30) as Q;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute latency penalty when facing an unfamiliar species.
 *
 * Formula: latencyPenalty_ms = (1.0 − interSpecies) × 0.080 (up to +80ms)
 *
 * @param entity - The entity experiencing unfamiliarity penalty.
 * @param opponentSpecies - Species ID of the opponent.
 * @returns Penalty in milliseconds (fixed-point I32), or 0 if species is familiar.
 */
export function computeUnfamiliarSpeciesLatencyPenalty(
  entity: Entity,
  opponentSpecies: string,
): I32 {
  // Check if entity has affinity with opponent species
  const affinity = entity.attributes.cognition?.speciesAffinity ?? [];
  if (affinity.includes(opponentSpecies)) {
    return 0; // No penalty for familiar species
  }

  const interSpecies: Q = (entity.attributes.cognition?.interSpecies ?? q(0.35)) as Q;

  // penalty_ms = (SCALE.Q - interSpecies) / SCALE.Q × 80ms
  const penaltyScale: Q = clampQ((SCALE.Q - interSpecies) as Q, 0, SCALE.Q);
  const penaltyMs = mulDiv(penaltyScale, LATENCY_PENALTY_SCALE, SCALE.Q);

  return penaltyMs as I32;
}

/**
 * Resolve a cross-species signal attempt.
 *
 * Formula:
 *   P_success = empathy_Q × signalVocab(targetSpecies) × (1 − animalFearQ × 0.60)
 *   aggravated = (empathy_Q < AGGRAVATION_THRESHOLD) && (targetFearQ > q(0.50))
 *
 * @param entity - The entity sending the signal.
 * @param spec - Signal specification.
 * @param seed - Deterministic seed for RNG variance.
 * @returns Signal outcome with success, comprehension quality, and aggravation flag.
 */
export function resolveSignal(
  entity: Entity,
  spec: SignalSpec,
  seed: number,
): SignalOutcome {
  const interSpecies: Q = (entity.attributes.cognition?.interSpecies ?? q(0.35)) as Q;
  const empathy_Q: Q = interSpecies; // Use interSpecies as empathy base

  // Get vocabulary comprehension for target species
  const vocab = entity.attributes.cognition?.signalVocab ?? new Map<string, Q>();
  const vocabComp: Q = vocab.get(spec.targetSpecies) ?? (q(0.20) as Q);

  // Base success probability
  const baseProb: Q = clampQ(
    qMul(empathy_Q, vocabComp) as Q,
    q(0),
    SCALE.Q as Q,
  );

  // Fear penalty: fearful targets are harder to communicate with
  // P_success *= (1 − fear × 0.60)
  const fearPenalty: Q = mulDiv(spec.targetFearQ, q(0.60), SCALE.Q);
  const fearMul: Q = clampQ((SCALE.Q - fearPenalty) as Q, q(0.20), SCALE.Q as Q);

  const finalProb: Q = clampQ(
    qMul(baseProb, fearMul) as Q,
    q(0),
    SCALE.Q as Q,
  );

  // RNG check
  const rng = makeRng(seed, SCALE.Q);
  const roll = rng.q01();
  const success = roll < finalProb;

  // Comprehension quality: empathy × vocab × (0.7–1.1 RNG variance)
  const varianceRoll = rng.q01();
  const variance: Q = clampQ(
    (q(0.70) + mulDiv(varianceRoll, q(0.40), SCALE.Q)) as Q,
    q(0.70),
    q(1.10),
  );
  const comprehension_Q = clampQ(
    qMul(qMul(empathy_Q, vocabComp), variance) as Q,
    q(0),
    SCALE.Q as Q,
  );

  // Aggravation check: low empathy + fearful target can trigger hostile reaction
  const aggravated = empathy_Q < AGGRAVATION_THRESHOLD && spec.targetFearQ > q(0.50);

  return { success, comprehension_Q, aggravated };
}

/**
 * Check if entity has affinity with a given species.
 */
export function hasSpeciesAffinity(entity: Entity, species: string): boolean {
  const affinity = entity.attributes.cognition?.speciesAffinity ?? [];
  return affinity.includes(species);
}

/**
 * Build a default signal vocabulary for a species.
 * Used for populating default comprehension levels.
 */
export function buildDefaultSignalVocab(speciesId: string): Map<string, Q> {
  const vocab = new Map<string, Q>();

  // Default low comprehension with most species
  const commonSpecies = ["human", "elf", "dwarf", "orc", "goblin", "troll", "wolf", "bear"];
  for (const s of commonSpecies) {
    if (s !== speciesId) {
      vocab.set(s, q(0.15) as Q);
    }
  }

  // Higher comprehension with own species
  vocab.set(speciesId, q(0.80) as Q);

  return vocab;
}

// ── Backward compatibility helpers ────────────────────────────────────────────

/**
 * Get effective inter-species empathy for an entity.
 * Returns interSpecies cognition value, or default q(0.35) if absent.
 */
export function getEffectiveEmpathy(entity: Entity): Q {
  return (entity.attributes.cognition?.interSpecies ?? q(0.35)) as Q;
}
