// src/sim/ai/personality.ts — Phase 47: Advanced AI Personalities
//
// Four orthogonal personality axes modulate decision-making on top of the base AIPolicy:
//
//   aggression  → retreat range (less retreat) + hesitation override
//   caution     → defence intensity boost
//   loyalty     → switches focus target to protect a distressed ally
//   opportunism → switches focus target to the most-wounded enemy
//
// All modifiers are delta-based around q(0.50): neutral personality produces
// identical behaviour to absent personality.

import type { Q }                  from "../../units.js";
import { SCALE, q, clampQ, mulDiv } from "../../units.js";
import type { Entity }              from "../entity.js";
import type { WorldState }          from "../world.js";
import type { IndividualAttributes, PersonalityTraits, PersonalityId } from "../../types.js";
import { eventSeed }                from "../seeds.js";

// ── Re-export types for convenience ──────────────────────────────────────────

export type { PersonalityTraits, PersonalityId };

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Neutral personality: q(0.50) on all axes.
 * Produces identical behaviour to an entity with no personality set.
 */
export const NEUTRAL_PERSONALITY: PersonalityTraits = {
  aggression:  q(0.50) as Q,
  caution:     q(0.50) as Q,
  loyalty:     q(0.50) as Q,
  opportunism: q(0.50) as Q,
};

/** Named predefined personalities. */
export const PERSONALITIES: Record<PersonalityId, PersonalityTraits> = {
  /** Charges into melee, ignores pain and fear, rarely retreats. */
  berserker: {
    aggression:  q(0.90) as Q,
    caution:     q(0.10) as Q,
    loyalty:     q(0.30) as Q,
    opportunism: q(0.20) as Q,
  },
  /** Avoids engagement, maximises defence and retreat distance. */
  coward: {
    aggression:  q(0.10) as Q,
    caution:     q(0.90) as Q,
    loyalty:     q(0.20) as Q,
    opportunism: q(0.70) as Q,
  },
  /** Shields allies at personal cost; steadfast defender. */
  guardian: {
    aggression:  q(0.55) as Q,
    caution:     q(0.55) as Q,
    loyalty:     q(0.90) as Q,
    opportunism: q(0.15) as Q,
  },
  /** Targets the weak; disloyal; always looks for an advantage. */
  schemer: {
    aggression:  q(0.40) as Q,
    caution:     q(0.70) as Q,
    loyalty:     q(0.10) as Q,
    opportunism: q(0.90) as Q,
  },
  /** Disciplined, reliable, protects unit; balanced aggression. */
  soldier: {
    aggression:  q(0.65) as Q,
    caution:     q(0.50) as Q,
    loyalty:     q(0.70) as Q,
    opportunism: q(0.35) as Q,
  },
};

// ── Derivation from cognitive profile ────────────────────────────────────────

/**
 * Derive a personality from existing cognitive and resilience attributes.
 *
 * Mapping rationale:
 *   aggression  ← distressTolerance (pain tolerance → willing to keep fighting)
 *   caution     ← intrapersonal     (self-awareness → more careful and defensive)
 *   loyalty     ← interpersonal     (social empathy → protects allies)
 *   opportunism ← logicalMathematical (planning → targets strategically)
 */
export function derivePersonalityFromCognition(attrs: IndividualAttributes): PersonalityTraits {
  return {
    aggression:  attrs.resilience.distressTolerance,
    caution:     (attrs.cognition?.intrapersonal       ?? q(0.50)) as Q,
    loyalty:     (attrs.cognition?.interpersonal       ?? q(0.50)) as Q,
    opportunism: (attrs.cognition?.logicalMathematical ?? q(0.50)) as Q,
  };
}

// ── Pure formula helpers (exported for unit testing) ──────────────────────────

/**
 * Effective retreat range after aggression bias.
 *
 * aggression q(0.90) → range reduced by ~0.20m (fights more aggressively)
 * aggression q(0.50) → unchanged
 * aggression q(0.10) → range increased by ~0.20m (retreats sooner)
 */
export function computeEffectiveRetreatRange(baseRange_m: number, aggression: Q): number {
  const delta = mulDiv(aggression - q(0.50), Math.trunc(0.40 * SCALE.m), SCALE.Q);
  return Math.max(0, baseRange_m - delta);
}

/**
 * Effective defence intensity after caution bias.
 *
 * caution q(0.90) → +q(0.20) max boost
 * caution q(0.50) → unchanged
 * caution q(0.10) → −q(0.20) max reduction
 */
export function computeDefenceIntensityBoost(baseIntensity: Q, caution: Q): Q {
  const delta = mulDiv(caution - q(0.50), q(0.40), SCALE.Q);
  return clampQ((baseIntensity + delta) as Q, q(0), q(1.0));
}

// ── Target bias functions ─────────────────────────────────────────────────────

/** Ally shock/fluid-loss above this Q value counts as "in distress". */
const ALLY_DISTRESS_Q: Q = q(0.20) as Q;

/** Enemy must be within this many SCALE.m units of the ally to count as a threat to them. */
const ALLY_THREAT_RANGE_m = Math.trunc(2.5 * SCALE.m);
const ALLY_THREAT_RANGE_m2 = ALLY_THREAT_RANGE_m * ALLY_THREAT_RANGE_m;

/**
 * Loyalty override: if an ally is in distress and has an enemy nearby, switch target to
 * that enemy.  Only triggers when loyalty > q(0.50); roll probability = loyaltyQ / SCALE.Q.
 */
export function applyLoyaltyBias(
  self:          Entity,
  world:         WorldState,
  currentTarget: Entity | undefined,
  loyaltyQ:      Q,
): Entity | undefined {
  if (loyaltyQ <= q(0.50)) return currentTarget;

  for (const ally of world.entities) {
    if (ally.teamId !== self.teamId || ally.id === self.id || ally.injury.dead) continue;
    const distressed = ally.injury.shock > ALLY_DISTRESS_Q
                    || ally.injury.fluidLoss > ALLY_DISTRESS_Q;
    if (!distressed) continue;

    // Find the enemy nearest to this distressed ally
    let threatEnemy: Entity | undefined;
    let bestD2 = Infinity;
    for (const e of world.entities) {
      if (e.teamId === self.teamId || e.injury.dead) continue;
      const adx = e.position_m.x - ally.position_m.x;
      const ady = e.position_m.y - ally.position_m.y;
      const d2 = adx * adx + ady * ady;
      if (d2 < ALLY_THREAT_RANGE_m2 && d2 < bestD2) { bestD2 = d2; threatEnemy = e; }
    }
    if (!threatEnemy) continue;

    const seed = eventSeed(world.seed, world.tick, self.id, ally.id, 0x10A1B);
    if ((seed % SCALE.Q) < loyaltyQ) return threatEnemy;
  }
  return currentTarget;
}

/** Minimum consciousness difference for the weakest enemy to qualify for an opportunism switch. */
const OPPORTUNISM_GAP: Q = q(0.30) as Q;

/**
 * Opportunism override: if a significantly more-wounded enemy is present, switch target.
 * Only triggers when opportunism > q(0.50); roll probability = opportunismQ / SCALE.Q.
 */
export function applyOpportunismBias(
  self:          Entity,
  world:         WorldState,
  currentTarget: Entity | undefined,
  opportunismQ:  Q,
): Entity | undefined {
  if (opportunismQ <= q(0.50)) return currentTarget;

  let weakest: Entity | undefined;
  let lowestConsc = SCALE.Q + 1;
  for (const e of world.entities) {
    if (e.teamId === self.teamId || e.injury.dead) continue;
    if (e.injury.consciousness < lowestConsc) { lowestConsc = e.injury.consciousness; weakest = e; }
  }

  if (!weakest || !currentTarget || weakest.id === currentTarget.id) return currentTarget;
  if (currentTarget.injury.consciousness - lowestConsc < OPPORTUNISM_GAP) return currentTarget;

  const seed = eventSeed(world.seed, world.tick, self.id, weakest.id, 0x06670);
  if ((seed % SCALE.Q) < opportunismQ) return weakest;
  return currentTarget;
}
