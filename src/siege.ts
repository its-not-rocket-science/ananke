
// src/siege.ts — Phase 84: Siege Warfare
//
// Models prolonged military operations against a fortified polity.
// A siege progresses through two main phases — investment then active —
// and resolves when walls are breached (assault) or supply is exhausted
// (surrender). All random outcomes use eventSeed for determinism.
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `SiegeState` is mutable; `stepSiege` advances it one simulated day.
//   - Wall decay scales with attacker siege strength (Phase-61 militaryStrength_Q).
//   - Defender morale tracks supply level and wall integrity.
//   - Integrates with Phase-83 (severing trade routes raises supply drain)
//     and Phase-78 (winter reduces attacker siege strength) via caller-supplied deltas.

import { eventSeed, hashString } from "./sim/seeds.js";
import type { Polity }           from "./polity.js";
import { q, SCALE, clampQ, mulDiv } from "./units.js";
import type { Q }                from "./units.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Phase of the siege.
 *
 * - `"investment"` — attacker encircles; supply lines not yet fully cut; no bombardment.
 * - `"active"`     — bombardment + starvation running in parallel.
 * - `"resolved"`   — siege ended; `outcome` is set.
 */
export type SiegePhase   = "investment" | "active" | "resolved";

/**
 * How the siege ended.
 *
 * - `"attacker_victory"` — walls breached and assault succeeded.
 * - `"defender_holds"`   — assault repelled; walls partially repaired.
 * - `"surrender"`        — defender ran out of supply and capitulated.
 */
export type SiegeOutcome = "attacker_victory" | "defender_holds" | "surrender";

/** Live state of an ongoing or resolved siege. */
export interface SiegeState {
  siegeId:          string;
  attackerPolityId: string;
  defenderPolityId: string;
  phase:            SiegePhase;
  /** Simulation tick (day) when the siege began. */
  startTick:        number;
  /** Days elapsed in the current phase. */
  phaseDay:         number;
  /** Defender fortification integrity [0, SCALE.Q]. Decays under bombardment. */
  wallIntegrity_Q:  Q;
  /** Defender garrison supplies [0, SCALE.Q]. Drains each active day. */
  supplyLevel_Q:    Q;
  /** Defender garrison morale [0, SCALE.Q]. Falls with supply and wall damage. */
  defenderMorale_Q: Q;
  /**
   * Attacker siege capability [0, SCALE.Q].
   * Derived from attacker `militaryStrength_Q`; governs wall-decay rate.
   */
  siegeStrength_Q:  Q;
  /** Set when `phase === "resolved"`. */
  outcome?:         SiegeOutcome;
}

/** Result of advancing the siege by one day. */
export interface SiegeStepResult {
  phaseChanged: boolean;
  resolved:     boolean;
  outcome?:     SiegeOutcome;
}

/** Daily attrition rates for both sides. */
export interface SiegeAttrition {
  /** Fraction of attacker force lost per day [0, SCALE.Q]. */
  attackerLoss_Q: Q;
  /** Fraction of defender force lost per day [0, SCALE.Q]. */
  defenderLoss_Q: Q;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Days spent in the investment phase before active bombardment/starvation begins. */
export const INVESTMENT_DAYS = 14;

/**
 * Base wall decay per active day at maximum siege strength.
 * Actual decay = `siegeStrength_Q × WALL_DECAY_BASE_Q / SCALE.Q`.
 */
export const WALL_DECAY_BASE_Q: Q = q(0.005);

/** Supply drain per active day (independent of attacker strength). */
export const SUPPLY_DRAIN_PER_DAY_Q: Q = q(0.004);

/** Rate at which defender morale decays relative to combined wall/supply weakness. */
export const MORALE_DECAY_RATE_Q: Q = q(0.002);

/** Wall integrity below this → assault is triggered and resolved. */
export const ASSAULT_WALL_THRESHOLD_Q: Q = q(0.30);

/**
 * Base assault success probability at equal siege strength and full defender morale.
 * Actual chance boosted by `(SCALE.Q - defenderMorale_Q) × 0.30`.
 */
export const ASSAULT_SUCCESS_BASE_Q: Q = q(0.50);

/** Supply below this → daily surrender check fires. */
export const SURRENDER_SUPPLY_THRESHOLD_Q: Q = q(0.05);

// ── eventSeed salts ───────────────────────────────────────────────────────────

const ASSAULT_SALT   = 1111;
const SURRENDER_SALT = 2222;

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a new siege. `attackerPolity.militaryStrength_Q` sets siege strength;
 * `defenderPolity.stabilityQ` seeds defender morale.
 */
export function createSiege(
  attackerPolity: Polity,
  defenderPolity: Polity,
  tick:           number = 0,
): SiegeState {
  return {
    siegeId:          `${attackerPolity.id}:${defenderPolity.id}:${tick}`,
    attackerPolityId: attackerPolity.id,
    defenderPolityId: defenderPolity.id,
    phase:            "investment",
    startTick:        tick,
    phaseDay:         0,
    wallIntegrity_Q:  SCALE.Q as Q,
    supplyLevel_Q:    SCALE.Q as Q,
    defenderMorale_Q: clampQ(defenderPolity.stabilityQ, 0, SCALE.Q),
    siegeStrength_Q:  clampQ(attackerPolity.militaryStrength_Q, 0, SCALE.Q),
  };
}

// ── Query helpers ──────────────────────────────────────────────────────────────

/** Return `true` if the siege has ended. */
export function isSiegeResolved(siege: SiegeState): boolean {
  return siege.phase === "resolved";
}

/**
 * Compute daily attrition fractions for both sides in the current phase.
 * - Investment: minimal skirmishing losses.
 * - Active: attacker takes defensive fire; defender takes bombardment damage.
 * - Resolved: no attrition.
 */
export function computeSiegeAttrition(siege: SiegeState): SiegeAttrition {
  if (siege.phase === "investment") {
    return { attackerLoss_Q: q(0.001) as Q, defenderLoss_Q: q(0.001) as Q };
  }
  if (siege.phase === "active") {
    // Attacker losses grow as walls fall (defenders become desperate)
    const attackerLoss = clampQ(
      mulDiv(SCALE.Q - siege.wallIntegrity_Q, q(0.003), SCALE.Q) + q(0.001),
      0,
      SCALE.Q,
    ) as Q;
    // Defender losses from bombardment scale with siege strength
    const defenderLoss = clampQ(
      mulDiv(siege.siegeStrength_Q, q(0.002), SCALE.Q),
      0,
      SCALE.Q,
    ) as Q;
    return { attackerLoss_Q: attackerLoss, defenderLoss_Q: defenderLoss };
  }
  return { attackerLoss_Q: 0 as Q, defenderLoss_Q: 0 as Q };
}

// ── Siege progression ──────────────────────────────────────────────────────────

/**
 * Advance the siege by one simulated day.
 *
 * **Investment phase**: counts down `INVESTMENT_DAYS` then transitions to active.
 *
 * **Active phase** (each day):
 * 1. Decay `wallIntegrity_Q` by `siegeStrength_Q × WALL_DECAY_BASE_Q / SCALE.Q`.
 * 2. Drain `supplyLevel_Q` by `SUPPLY_DRAIN_PER_DAY_Q` (+ optional `supplyPressureBonus_Q`).
 * 3. Decay `defenderMorale_Q` proportionally to combined wall/supply weakness.
 * 4. If `wallIntegrity_Q < ASSAULT_WALL_THRESHOLD_Q` → resolve assault via `eventSeed`.
 * 5. Else if `supplyLevel_Q ≤ SURRENDER_SUPPLY_THRESHOLD_Q` → daily surrender roll.
 *
 * @param worldSeed            Global world seed for determinism.
 * @param tick                 Current simulation tick.
 * @param supplyPressureBonus_Q Extra daily supply drain (e.g., trade routes severed by Phase 83).
 * @param siegeStrengthMul_Q   Multiplier on siege strength (e.g., winter penalty from Phase 78).
 */
export function stepSiege(
  siege:                  SiegeState,
  worldSeed:              number,
  tick:                   number,
  supplyPressureBonus_Q:  Q = 0 as Q,
  siegeStrengthMul_Q:     Q = SCALE.Q as Q,
): SiegeStepResult {
  if (siege.phase === "resolved") {
    return { phaseChanged: false, resolved: true, ...(siege.outcome != null ? { outcome: siege.outcome } : {}) };
  }

  // ── Investment phase ────────────────────────────────────────────────────────
  if (siege.phase === "investment") {
    siege.phaseDay++;
    if (siege.phaseDay >= INVESTMENT_DAYS) {
      siege.phase    = "active";
      siege.phaseDay = 0;
      return { phaseChanged: true, resolved: false };
    }
    return { phaseChanged: false, resolved: false };
  }

  // ── Active phase ────────────────────────────────────────────────────────────
  const effectiveSiegeStr = clampQ(
    mulDiv(siege.siegeStrength_Q, siegeStrengthMul_Q, SCALE.Q),
    0,
    SCALE.Q,
  );

  // 1. Wall decay
  const wallDecay = mulDiv(effectiveSiegeStr, WALL_DECAY_BASE_Q, SCALE.Q);
  siege.wallIntegrity_Q = clampQ(siege.wallIntegrity_Q - wallDecay, 0, SCALE.Q);

  // 2. Supply drain (base + bonus from severed trade routes etc.)
  const totalDrain = clampQ(SUPPLY_DRAIN_PER_DAY_Q + supplyPressureBonus_Q, 0, SCALE.Q);
  siege.supplyLevel_Q = clampQ(siege.supplyLevel_Q - totalDrain, 0, SCALE.Q);

  // 3. Morale decay — weighted average of supply and wall weakness
  const wallWeakness   = SCALE.Q - siege.wallIntegrity_Q;
  const supplyWeakness = SCALE.Q - siege.supplyLevel_Q;
  const avgWeakness    = Math.round((wallWeakness + supplyWeakness) / 2);
  const moraleDecay    = mulDiv(avgWeakness, MORALE_DECAY_RATE_Q, SCALE.Q);
  siege.defenderMorale_Q = clampQ(siege.defenderMorale_Q - moraleDecay, 0, SCALE.Q);

  siege.phaseDay++;

  // 4. Assault trigger (walls breached)
  if (siege.wallIntegrity_Q < ASSAULT_WALL_THRESHOLD_Q) {
    const seed = eventSeed(
      worldSeed, tick,
      hashString(siege.attackerPolityId),
      hashString(siege.defenderPolityId),
      ASSAULT_SALT,
    );
    const roll = seed % SCALE.Q;

    // Attacker advantage = base success + morale deficit bonus
    const moraleDeficitBonus = mulDiv(SCALE.Q - siege.defenderMorale_Q, q(0.30), SCALE.Q);
    const successThresh = clampQ(
      mulDiv(effectiveSiegeStr, ASSAULT_SUCCESS_BASE_Q, SCALE.Q) + moraleDeficitBonus,
      0,
      SCALE.Q,
    );

    if (roll < successThresh) {
      siege.outcome = "attacker_victory";
    } else {
      // Defenders plug the breach
      siege.wallIntegrity_Q = clampQ(siege.wallIntegrity_Q + q(0.15), 0, SCALE.Q);
      siege.outcome = "defender_holds";
    }

    siege.phase = "resolved";
    return { phaseChanged: true, resolved: true, outcome: siege.outcome };
  }

  // 5. Surrender check (supply exhausted)
  if (siege.supplyLevel_Q <= SURRENDER_SUPPLY_THRESHOLD_Q) {
    const seed = eventSeed(
      worldSeed, tick,
      hashString(siege.defenderPolityId),
      hashString(siege.attackerPolityId),
      SURRENDER_SALT,
    );
    const roll = seed % SCALE.Q;
    // Surrender chance = morale deficit × 0.70
    const surrenderChance = mulDiv(SCALE.Q - siege.defenderMorale_Q, q(0.70), SCALE.Q);
    if (roll < surrenderChance) {
      siege.phase   = "resolved";
      siege.outcome = "surrender";
      return { phaseChanged: true, resolved: true, outcome: "surrender" };
    }
  }

  return { phaseChanged: false, resolved: false };
}

// ── Convenience helpers ────────────────────────────────────────────────────────

/**
 * Run the siege forward until resolved or `maxDays` have elapsed.
 * Returns the final step result. Useful for tests and quick simulations.
 */
export function runSiegeToResolution(
  siege:     SiegeState,
  worldSeed: number,
  startTick: number,
  maxDays:   number = 500,
): SiegeStepResult {
  let result: SiegeStepResult = { phaseChanged: false, resolved: false };
  for (let d = 0; d < maxDays; d++) {
    result = stepSiege(siege, worldSeed, startTick + d);
    if (result.resolved) break;
  }
  return result;
}
