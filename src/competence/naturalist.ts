// src/competence/naturalist.ts — Phase 35: Naturalist Intelligence & Animal Handling
//
// Naturalist intelligence governs pattern recognition in living organisms:
//   - Tracking: following quarry via environmental signs
//   - Foraging: finding edible/medicinal plants, avoiding misidentification
//   - Taming: building trust with animals across species boundaries
//
// No kernel import — pure resolution module.

import type { Q } from "../units.js";
import { SCALE, q, clampQ, qMul, mulDiv } from "../units.js";
import type { Entity } from "../sim/entity.js";
import { makeRng } from "../rng.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrackingSpec {
  /** Seconds since quarry passed. */
  trackAge_s: number;
  /** Terrain type affecting track preservation. */
  terrain: "ideal" | "rain" | "urban" | "deep_water" | "forest";
  /** Species identifier of the quarry. */
  quarrySpecies: string;
}

export interface TrackingOutcome {
  /** Confidence in track reading; above q(0.60) = reliable direction. */
  confidence_Q: Q;
  /** Maximum range at which entity can follow this track (metres). */
  trackRange_m: number;
}

export interface ForagingSpec {
  /** Hours spent searching. */
  searchHours: number;
  /** Biome type affecting yield. */
  biome: "forest" | "plains" | "desert" | "swamp" | "mountain";
  /** Season affecting plant availability. */
  season: "spring" | "summer" | "autumn" | "winter";
}

export interface ForagingOutcome {
  /** Items found per hour of searching. */
  itemsFound: number;
  /** Quality of medicinal plants found (0–1). */
  herbQuality_Q: Q;
  /** True if a poisonous plant was mistaken for edible. */
  misidentified: boolean;
}

export interface TamingSpec {
  /** Species identifier of the animal. */
  animalSpecies: string;
  /** Base fear level of the animal (0 = calm, 1 = terrified). */
  animalFearQ: Q;
  /** Effort factor: hours spent this session (normalized: 1.0 = standard 4-hour session). */
  effortFactor: Q;
  /** Number of prior successful interactions with this species. */
  priorSuccesses: number;
}

export interface TamingOutcome {
  /** Trust level: 0 = hostile → 1 = fully tamed. */
  trust_Q: Q;
  /** True if animal attacked handler this session. */
  attacked: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Base track visibility range in metres at naturalist q(0.50), ideal conditions. */
const BASE_TRACK_RANGE_m = 100;

/** Age degradation: track freshness multiplier (seconds). */
const AGE_MUL: Record<TrackingSpec["terrain"], { decayPerHour: number; floor: Q }> = {
  ideal: { decayPerHour: 0.05, floor: q(0.80) as Q },
  rain: { decayPerHour: 0.25, floor: q(0.30) as Q },
  urban: { decayPerHour: 0.15, floor: q(0.40) as Q },
  deep_water: { decayPerHour: 0.50, floor: q(0.10) as Q },
  forest: { decayPerHour: 0.10, floor: q(0.50) as Q },  // leaves/debris preserve tracks moderately
};

/** Species difficulty multiplier for tracking (default q(1.0)). */
const SPECIES_TRACK_MUL: Record<string, Q> = {
  human: q(1.00) as Q,
  elf: q(1.10) as Q,
  dwarf: q(0.90) as Q,
  halfling: q(0.85) as Q,
  orc: q(1.05) as Q,
  ogre: q(1.20) as Q,
  goblin: q(0.80) as Q,
  troll: q(1.30) as Q,
  dragon: q(0.70) as Q, // rare, distinctive scent
  wolf: q(1.15) as Q,
  deer: q(1.10) as Q,
  bear: q(1.25) as Q,
};

/** Species affinity bonus for tracking known species. */
const SPECIES_AFFINITY_BONUS: Q = q(0.15) as Q;

/** Biome yield multipliers (base items per hour at naturalist q(0.50)). */
const BIOME_YIELD_BASE: Record<ForagingSpec["biome"], number> = {
  forest: 3.0,
  plains: 2.0,
  desert: 0.5,
  swamp: 2.5,
  mountain: 1.0,
};

/** Season multipliers affecting foraging yield. */
const SEASON_MUL: Record<ForagingSpec["season"], Q> = {
  spring: q(1.20) as Q,
  summer: q(1.00) as Q,
  autumn: q(0.90) as Q,
  winter: q(0.40) as Q,
};

/** Threshold for reliable tracking confidence. */
const TRACKING_CONFIDENCE_THRESHOLD: Q = q(0.60) as Q;

/** Trust threshold for fully tamed animal. */
const FULLY_TAMED_THRESHOLD: Q = q(0.90) as Q;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Get entity's species affinity list (for tracking/taming bonuses).
 * Currently derived from species id in a simplified manner.
 */
function getSpeciesAffinity(entity: Entity): string[] {
  // Simplified: could be expanded with a proper affinity system
  const baseAffinity: string[] = [];
  // Add natural affinities based on archetype patterns
  if (entity.attributes.cognition?.naturalist ?? 0 > q(0.60)) {
    baseAffinity.push("wolf", "deer", "bear"); // high naturalist = forest affinity
  }
  return baseAffinity;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve a tracking attempt.
 *
 * Formula:
 *   confidence_Q = naturalist × ageMul × terrainMul × speciesMul
 *   If quarrySpecies in entity's speciesAffinity: +q(0.15)
 *   trackRange_m = baseRange × confidence_Q (with floor at naturalist × 10m)
 *
 * @param entity - The tracker; uses `cognition.naturalist`.
 * @param spec   - Tracking specification.
 * @param _seed  - Reserved for future variance; currently unused.
 */
export function resolveTracking(
  entity: Entity,
  spec: TrackingSpec,
  _seed: number,
): TrackingOutcome {
  const naturalist: Q = (entity.attributes.cognition?.naturalist ?? q(0.50)) as Q;

  // Age multiplier: degrades over time, with terrain-specific floor
  const hoursOld = spec.trackAge_s / 3600;
  const ageConfig = AGE_MUL[spec.terrain];
  const ageDegradation = Math.min(1.0, hoursOld * ageConfig.decayPerHour);
  const ageMul: Q = clampQ(
    (q(1.0) - Math.trunc(ageDegradation * (q(1.0) - ageConfig.floor))) as Q,
    q(0.10), q(1.0),
  );

  // Species multiplier
  const speciesMul = SPECIES_TRACK_MUL[spec.quarrySpecies] ?? (q(1.0) as Q);

  // Base confidence
  let confidence_Q: Q = qMul(qMul(naturalist, ageMul), speciesMul);

  // Species affinity bonus
  const affinity = getSpeciesAffinity(entity);
  if (affinity.includes(spec.quarrySpecies)) {
    confidence_Q = clampQ((confidence_Q + SPECIES_AFFINITY_BONUS) as Q, q(0), q(1.0));
  }

  // Track range scales with confidence and naturalist ability
  // Floor ensures even low-confidence trackers can follow obvious trails
  const rangeMul = Math.max(confidence_Q, mulDiv(naturalist, q(0.20), SCALE.Q));
  const trackRange_m = Math.round(BASE_TRACK_RANGE_m * rangeMul / SCALE.Q);

  return { confidence_Q, trackRange_m };
}

/**
 * Resolve a foraging/herbalism attempt.
 *
 * Formula:
 *   yield = baseYield × naturalist × seasonMul × searchHours
 *   herbQuality_Q = clamp(naturalist × randomFactor, 0, 1)
 *   P_misidentified = max(0, 0.30 − naturalist × 0.40)
 *     (troll naturalist 0.50 → ~10%; elf naturalist 0.78 → ~0%)
 *
 * @param entity - The forager; uses `cognition.naturalist`.
 * @param spec   - Foraging specification.
 * @param seed   - Deterministic seed for quality variance.
 */
export function resolveForaging(
  entity: Entity,
  spec: ForagingSpec,
  seed: number,
): ForagingOutcome {
  const naturalist: Q = (entity.attributes.cognition?.naturalist ?? q(0.50)) as Q;

  // Base yield calculation
  const baseYield = BIOME_YIELD_BASE[spec.biome];
  const seasonQ = SEASON_MUL[spec.season];

  // itemsFound = base × naturalist(normalized) × season × hours
  const naturalistNorm = mulDiv(naturalist, q(1.0), SCALE.Q); // 0-1 range
  const yieldFloat = baseYield * naturalistNorm * (seasonQ / SCALE.Q) * spec.searchHours;
  const itemsFound = Math.max(0, Math.round(yieldFloat * 10) / 10); // 1 decimal place

  // Herb quality: naturalist × RNG factor (roll in [0.70, 1.10] range)
  const rng = makeRng(seed, SCALE.Q);
  const q01Roll = rng.q01(); // [0, SCALE.Q-1]
  const qualityRoll: Q = clampQ(
    (q(0.70) + mulDiv(q01Roll, q(0.40), SCALE.Q)) as Q,
    q(0.70), q(1.10),
  );
  const herbQuality_Q = clampQ(
    mulDiv(naturalist, qualityRoll, SCALE.Q) as Q,
    q(0), q(1.0),
  );

  // Misidentification probability: max(0, 0.30 − naturalist × 0.40)
  // At naturalist 0.50 (q(0.50)=5000): 0.30 − 0.50 × 0.40 = 0.30 − 0.20 = 0.10 (10%)
  // At naturalist 0.75: 0.30 − 0.30 = 0 (0%)
  const naturalistFloat = naturalistNorm;
  const pMisidentify = Math.max(0, 0.30 - naturalistFloat * 0.40);
  const misidentifyRoll = (rng.q01() / SCALE.Q);
  const misidentified = misidentifyRoll < pMisidentify;

  return { itemsFound, herbQuality_Q, misidentified };
}

/**
 * Resolve an animal taming attempt.
 *
 * Formula:
 *   trust_Q = clamp(naturalist × interSpecies × effortFactor − animalFearQ × 0.50, 0, 1)
 *   attacked = RNG < (animalFearQ − trust_Q) × 0.30  (high fear + low trust = danger)
 *
 * Full taming (trust_Q ≥ q(0.90)) makes the animal available as an ally.
 *
 * @param entity - The handler; uses `cognition.naturalist` and `cognition.interSpecies`.
 * @param spec   - Taming specification.
 * @param seed   - Deterministic seed for attack check.
 */
export function resolveTaming(
  entity: Entity,
  spec: TamingSpec,
  seed: number,
): TamingOutcome {
  const naturalist: Q = (entity.attributes.cognition?.naturalist ?? q(0.50)) as Q;
  const interSpecies: Q = (entity.attributes.cognition?.interSpecies ?? q(0.35)) as Q;

  // Base trust from naturalist × interSpecies × effort
  const baseTrust = qMul(qMul(naturalist, interSpecies), spec.effortFactor);

  // Fear penalty: high fear reduces trust
  const fearPenalty = mulDiv(spec.animalFearQ, q(0.50), SCALE.Q);

  // Prior successes bonus: +5% per success, max +25%
  const experienceBonus = Math.min(spec.priorSuccesses * q(0.05), q(0.25));

  const trust_Q = clampQ(
    (baseTrust - fearPenalty + experienceBonus) as Q,
    q(0), q(1.0),
  );

  // Attack check: high fear with low trust is dangerous
  // P(attack) = max(0, (animalFearQ − trust_Q) × 0.30)
  const fearFloat = mulDiv(spec.animalFearQ, q(1.0), SCALE.Q);
  const trustFloat = mulDiv(trust_Q, q(1.0), SCALE.Q);
  const pAttack = Math.max(0, (fearFloat - trustFloat) * 0.30);

  const rng = makeRng(seed, SCALE.Q);
  const attackRoll = rng.q01() / SCALE.Q;
  const attacked = attackRoll < pAttack;

  return { trust_Q, attacked };
}

/**
 * Check if an animal is fully tamed (available as ally).
 */
export function isFullyTamed(trust_Q: Q): boolean {
  return trust_Q >= FULLY_TAMED_THRESHOLD;
}

/**
 * Check if tracking confidence is reliable.
 */
export function isTrackingReliable(confidence_Q: Q): boolean {
  return confidence_Q >= TRACKING_CONFIDENCE_THRESHOLD;
}
