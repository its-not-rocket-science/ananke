// src/unrest.ts — Phase 90: Civil Unrest & Rebellion
//
// Aggregates pressure signals from existing systems into a composite unrest
// level, drains polity morale and stability under sustained pressure, and
// resolves rebellion events deterministically.
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `computeUnrestLevel` is a pure aggregator: callers pass pre-computed
//     pressure values from Phase-85 (heresy), Phase-87 (famine), Phase-88
//     (epidemic), Phase-79 (weakest feudal bond), etc.
//   - `stepUnrest` mutates polity.moraleQ and polity.stabilityQ when unrest
//     exceeds thresholds.
//   - `resolveRebellion` uses eventSeed for full determinism and replay safety.
//
// Integration:
//   Phase 61 (Polity):     mutates moraleQ / stabilityQ; reads militaryStrength_Q.
//   Phase 79 (Feudal):     weakestBond_Q input.
//   Phase 85 (Faith):      heresyRisk_Q input.
//   Phase 87 (Granary):    faminePressure_Q input from computeFamineMigrationPush.
//   Phase 88 (Epidemic):   epidemicPressure_Q input from computeEpidemicMigrationPush.

import { q, SCALE, clampQ, mulDiv } from "./units.js";
import type { Q }                   from "./units.js";
import type { Polity }              from "./polity.js";
import { eventSeed, hashString }    from "./sim/seeds.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Pressure signals fed into `computeUnrestLevel`.
 * All fields are Q fractions [0, SCALE.Q]; omit any that are not applicable.
 */
export interface UnrestFactors {
  /** Phase-87 famine push pressure. */
  faminePressure_Q?:   Q;
  /** Phase-88 epidemic flight pressure. */
  epidemicPressure_Q?: Q;
  /** Phase-85 heresy risk. */
  heresyRisk_Q?:       Q;
  /**
   * Weakest feudal bond strength [0, SCALE.Q] from Phase-79.
   * Low value → high feudal unrest contribution.
   */
  weakestBond_Q?:      Q;
}

/** Possible outcomes of a rebellion resolution. */
export type RebellionOutcome = "quelled" | "uprising" | "civil_war";

/** Result returned by `resolveRebellion`. */
export interface RebellionResult {
  outcome:       RebellionOutcome;
  /** Morale penalty applied to the polity (always ≤ 0). */
  moraleHit_Q:   number;
  /** Stability penalty applied to the polity (always ≤ 0). */
  stabilityHit_Q: number;
  /** Treasury plundered by rebels [cost units]. */
  treasuryLoss:  number;
}

/** Outcome of `stepUnrest` — the changes applied this step. */
export interface UnrestStepResult {
  unrestLevel_Q:  Q;
  moraleDecay_Q:  number;
  stabilityDecay_Q: number;
  /** Whether rebellion threshold was crossed (host should call resolveRebellion). */
  rebellionRisk:  boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Weights applied to each pressure source in `computeUnrestLevel`. */
export const UNREST_MORALE_WEIGHT_Q:     Q = q(0.30);
export const UNREST_STABILITY_WEIGHT_Q:  Q = q(0.25);
export const UNREST_FAMINE_WEIGHT_Q:     Q = q(0.20);
export const UNREST_EPIDEMIC_WEIGHT_Q:   Q = q(0.10);
export const UNREST_HERESY_WEIGHT_Q:     Q = q(0.10);
export const UNREST_FEUDAL_WEIGHT_Q:     Q = q(0.05);

/** Unrest above this threshold → morale and stability begin draining. */
export const UNREST_ACTION_THRESHOLD_Q: Q = q(0.30);

/** Unrest above this threshold → rebellion risk flag raised. */
export const REBELLION_THRESHOLD_Q:     Q = q(0.65);

/** Maximum daily morale drain from sustained unrest [Q/day]. */
export const UNREST_MORALE_DRAIN_Q:     Q = q(0.005);

/** Maximum daily stability drain from sustained unrest [Q/day]. */
export const UNREST_STABILITY_DRAIN_Q:  Q = q(0.003);

/** Fraction of treasury rebels plunder during an uprising or civil war. */
export const REBELLION_TREASURY_RAID_Q: Q = q(0.15);

// ── Unrest computation ────────────────────────────────────────────────────────

/**
 * Compute the composite unrest level [0, SCALE.Q] for a polity.
 *
 * Unrest is the weighted sum of:
 * - Low morale   (`(SCALE.Q - moraleQ)    × MORALE_WEIGHT`)
 * - Low stability (`(SCALE.Q - stabilityQ) × STABILITY_WEIGHT`)
 * - Famine pressure  × FAMINE_WEIGHT
 * - Epidemic pressure × EPIDEMIC_WEIGHT
 * - Heresy risk      × HERESY_WEIGHT
 * - Feudal deficit   × FEUDAL_WEIGHT  (`SCALE.Q − weakestBond_Q`)
 *
 * All inputs are optional; omitted factors contribute zero.
 */
export function computeUnrestLevel(polity: Polity, factors: UnrestFactors = {}): Q {
  const moraleContrib    = mulDiv(SCALE.Q - polity.moraleQ,    UNREST_MORALE_WEIGHT_Q,    SCALE.Q);
  const stabilityContrib = mulDiv(SCALE.Q - polity.stabilityQ, UNREST_STABILITY_WEIGHT_Q, SCALE.Q);

  const famineContrib   = mulDiv(factors.faminePressure_Q   ?? 0, UNREST_FAMINE_WEIGHT_Q,   SCALE.Q);
  const epidemicContrib = mulDiv(factors.epidemicPressure_Q ?? 0, UNREST_EPIDEMIC_WEIGHT_Q, SCALE.Q);
  const heresyContrib   = mulDiv(factors.heresyRisk_Q       ?? 0, UNREST_HERESY_WEIGHT_Q,   SCALE.Q);

  const feudalDeficit   = factors.weakestBond_Q != null
    ? clampQ(SCALE.Q - factors.weakestBond_Q, 0, SCALE.Q)
    : 0;
  const feudalContrib = mulDiv(feudalDeficit, UNREST_FEUDAL_WEIGHT_Q, SCALE.Q);

  const total = moraleContrib + stabilityContrib + famineContrib +
                epidemicContrib + heresyContrib + feudalContrib;
  return clampQ(total, 0, SCALE.Q);
}

// ── Unrest step ───────────────────────────────────────────────────────────────

/**
 * Apply unrest consequences to a polity for `elapsedDays` days.
 *
 * When `unrestLevel_Q > UNREST_ACTION_THRESHOLD_Q`:
 * - Drains morale at rate `(unrest − threshold) × MORALE_DRAIN_Q / SCALE.Q` per day.
 * - Drains stability at a lower rate.
 *
 * Mutates `polity.moraleQ` and `polity.stabilityQ` in place.
 * Returns the step result for host inspection.
 */
export function stepUnrest(
  polity:        Polity,
  unrestLevel_Q: Q,
  elapsedDays:   number,
): UnrestStepResult {
  const excess = clampQ(unrestLevel_Q - UNREST_ACTION_THRESHOLD_Q, 0, SCALE.Q);

  const moraleDecayPerDay    = mulDiv(excess, UNREST_MORALE_DRAIN_Q,    SCALE.Q);
  const stabilityDecayPerDay = mulDiv(excess, UNREST_STABILITY_DRAIN_Q, SCALE.Q);

  const totalMoraleDecay    = Math.round(moraleDecayPerDay    * elapsedDays);
  const totalStabilityDecay = Math.round(stabilityDecayPerDay * elapsedDays);

  polity.moraleQ    = clampQ(polity.moraleQ    - totalMoraleDecay,    0, SCALE.Q);
  polity.stabilityQ = clampQ(polity.stabilityQ - totalStabilityDecay, 0, SCALE.Q);

  return {
    unrestLevel_Q,
    moraleDecay_Q:    totalMoraleDecay,
    stabilityDecay_Q: totalStabilityDecay,
    rebellionRisk:    unrestLevel_Q > REBELLION_THRESHOLD_Q,
  };
}

// ── Rebellion resolution ──────────────────────────────────────────────────────

/**
 * Resolve a rebellion event deterministically.
 *
 * Outcomes:
 * - `"quelled"`:   rebels dispersed — morale/treasury hit only.
 * - `"uprising"`:  significant unrest — larger morale/stability hit + treasury raid.
 * - `"civil_war"`: polity fractures — severe penalties across all stats.
 *
 * Outcome probability is weighted by unrest level vs. military strength:
 * - High military strength + moderate unrest → likely `"quelled"`
 * - Low military + high unrest → risk of `"civil_war"`
 *
 * Mutates polity morale, stability, and treasury.
 *
 * @param worldSeed  World seed for deterministic resolution.
 * @param tick       Current simulation tick.
 */
export function resolveRebellion(
  polity:    Polity,
  worldSeed: number,
  tick:      number,
): RebellionResult {
  const polityHash = hashString(polity.id);
  const seed       = eventSeed(worldSeed, tick, polityHash, 0, 9001);  // salt: rebellion
  const roll       = seed % SCALE.Q;  // [0, SCALE.Q)

  // Suppression capacity = military strength
  const suppressCap = polity.militaryStrength_Q;
  // Civil war threshold = low suppression + any roll in top quarter
  const civilWarThresh   = clampQ(SCALE.Q - suppressCap, 0, SCALE.Q);
  const uprisingThresh   = Math.round(civilWarThresh * 0.6);

  let outcome: RebellionOutcome;
  if (roll >= civilWarThresh) {
    outcome = "quelled";
  } else if (roll >= uprisingThresh) {
    outcome = "uprising";
  } else {
    outcome = "civil_war";
  }

  const moraleHit    = outcome === "quelled"   ? -q(0.05)
                     : outcome === "uprising"  ? -q(0.15)
                     :                          -q(0.30);
  const stabilityHit = outcome === "quelled"   ? -q(0.03)
                     : outcome === "uprising"  ? -q(0.10)
                     :                          -q(0.25);
  const treasuryRaid = outcome === "quelled"
    ? 0
    : Math.floor(mulDiv(polity.treasury_cu, REBELLION_TREASURY_RAID_Q, SCALE.Q)
        * (outcome === "civil_war" ? 2 : 1));

  polity.moraleQ    = clampQ(polity.moraleQ    + moraleHit,    0, SCALE.Q);
  polity.stabilityQ = clampQ(polity.stabilityQ + stabilityHit, 0, SCALE.Q);
  polity.treasury_cu = Math.max(0, polity.treasury_cu - treasuryRaid);

  return { outcome, moraleHit_Q: moraleHit, stabilityHit_Q: stabilityHit, treasuryLoss: treasuryRaid };
}
