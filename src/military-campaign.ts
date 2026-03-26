// src/military-campaign.ts — Phase 93: Military Campaigns & War Resolution
//
// Models field army mobilization, campaign march, and open-battle resolution
// between polities.  Siege warfare against fortified positions is handled
// separately by Phase-84 (src/siege.ts).
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `CampaignState` is the mutable live state; hosts store one per conflict.
//   - All random outcomes use `eventSeed` for full determinism.
//   - Battle strength derives from polity military strength × army size;
//     tech era scales the per-soldier multiplier.
//   - Phase-89 roads shorten march duration; Phase-89 walls add defender bonus.
//   - Phase-90 unrest pressure increases during active campaigns.
//   - Phase-92 treasury is drained daily by upkeep.
//
// Integration:
//   Phase 11 (Tech):     techEra gates per-soldier strength multiplier.
//   Phase 61 (Polity):   population, militaryStrength_Q, treasury_cu, stabilityQ mutated.
//   Phase 89 (Infra):    road bonus (march speed), wall bonus (defender strength).
//   Phase 90 (Unrest):   warUnrestPressure_Q as extra unrest factor.
//   Phase 92 (Taxation): daily upkeep drains treasury alongside tax revenue.

import { eventSeed, hashString } from "./sim/seeds.js";
import { q, SCALE, clampQ, mulDiv } from "./units.js";
import type { Q }                    from "./units.js";
import type { Polity }               from "./polity.js";
import { TechEra }                   from "./sim/tech.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Phase of a military campaign. */
export type CampaignPhase = "mobilization" | "march" | "battle" | "resolved";

/** How an open-field battle resolved. */
export type BattleOutcome = "attacker_victory" | "defender_holds" | "stalemate";

/** Live state of an ongoing or resolved campaign. */
export interface CampaignState {
  campaignId:        string;
  attackerPolityId:  string;
  defenderPolityId:  string;
  phase:             CampaignPhase;
  /** Day the campaign started. */
  startTick:         number;
  /** Total days elapsed since campaign start. */
  daysElapsed:       number;
  /**
   * March progress toward the defender [0, SCALE.Q].
   * Advances each day during `"march"` phase; battle triggers at SCALE.Q.
   */
  marchProgress_Q:   Q;
  /**
   * Attacker army size at mobilization (integer soldiers).
   * Does not change after mobilization; casualties reduce `attackerStrength_Q`.
   */
  attackerArmySize:  number;
  /** Attacker battle strength [0, SCALE.Q]; reduced by casualties. */
  attackerStrength_Q: Q;
  /** Defender battle strength [0, SCALE.Q]; reduced by casualties. */
  defenderStrength_Q: Q;
  /** Outcome when `phase === "resolved"`. */
  outcome?:          BattleOutcome;
}

/** Result of `mobilizeCampaign`. */
export interface MobilizationResult {
  /** Soldiers raised. */
  armySize:       number;
  /** Cost-units drained from `polity.treasury_cu`. */
  cost_cu:        number;
  /** Initial battle strength of the raised army [0, SCALE.Q]. */
  armyStrength_Q: Q;
}

/** Result of `stepCampaignMarch`. */
export interface MarchStepResult {
  /** March progress added this step [Q]. */
  progressAdded_Q: Q;
  /** Cost-units drained from attacker treasury (daily upkeep). */
  upkeep_cu:       number;
  /** Whether battle has been triggered this step. */
  battleTriggered: boolean;
}

/** Result of `resolveBattle`. */
export interface BattleResult {
  outcome:               BattleOutcome;
  /** Fractional strength lost by attacker [0, SCALE.Q]. */
  attackerCasualties_Q:  Q;
  /** Fractional strength lost by defender [0, SCALE.Q]. */
  defenderCasualties_Q:  Q;
  /**
   * Treasury tribute taken from defeated polity.
   * Set only on `"attacker_victory"`.
   */
  tributeAmount?:        number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Default fraction of the population available as soldiers [Q].
 * 5% mobilization is a sustainable wartime levy.
 */
export const MOBILIZATION_POP_FRACTION_Q: Q = q(0.05);

/**
 * Maximum fraction of population that can be mobilized [Q].
 * Above this, domestic stability collapses.
 */
export const MAX_MOBILIZATION_Q: Q = q(0.15);

/**
 * Treasury cost per soldier for initial mobilization (equipment, muster pay).
 * In cost-units per soldier.
 */
export const MOBILIZATION_COST_PER_SOLDIER = 5;

/**
 * Daily treasury upkeep per soldier [cost-units/soldier/day].
 */
export const CAMPAIGN_UPKEEP_PER_SOLDIER = 1;

/**
 * Base daily march progress [Q/day] at no road bonus.
 * At this rate, full march (SCALE.Q) takes 20 days.
 */
export const BASE_MARCH_RATE_Q: Q = q(0.05);

/**
 * Fraction of the defeated polity's treasury taken as tribute on victory [Q].
 */
export const VICTORY_TRIBUTE_Q: Q = q(0.20);

/**
 * Per-soldier strength multiplier by tech era [Q/soldier].
 * Higher eras have better weapons, tactics, and logistics.
 */
export const TECH_SOLDIER_MUL: Record<number, Q> = {
  [TechEra.Prehistoric]:  q(0.50) as Q,
  [TechEra.Ancient]:      q(0.70) as Q,
  [TechEra.Medieval]:     q(0.80) as Q,
  [TechEra.EarlyModern]:  q(0.90) as Q,
  [TechEra.Industrial]:   q(1.00) as Q,
  [TechEra.Modern]:       q(1.00) as Q,
  [TechEra.NearFuture]:   q(1.00) as Q,
  [TechEra.FarFuture]:    q(1.00) as Q,
  [TechEra.DeepSpace]:    q(1.00) as Q,
};

/**
 * Reference army size used as denominator for strength scaling.
 * An army of this size at q(1.0) military strength = battle strength q(1.0).
 */
export const REFERENCE_ARMY_SIZE = 10_000;

/**
 * Unrest pressure on attacker polity during an active campaign [Q].
 * Pass as extra unrest factor into Phase-90 `computeUnrestLevel`.
 */
export const WAR_UNREST_PRESSURE_Q: Q = q(0.15);

/**
 * Casualty rates per battle outcome.
 * These are fractional strength losses applied to each side.
 */
export const ATTACKER_CASUALTY_ON_VICTORY_Q: Q = q(0.20);
export const ATTACKER_CASUALTY_ON_DEFEAT_Q:  Q = q(0.40);
export const ATTACKER_CASUALTY_ON_STALEMATE_Q: Q = q(0.25);
export const DEFENDER_CASUALTY_ON_VICTORY_Q: Q = q(0.50);
export const DEFENDER_CASUALTY_ON_DEFEAT_Q:  Q = q(0.15);
export const DEFENDER_CASUALTY_ON_STALEMATE_Q: Q = q(0.25);

// ── Factory ───────────────────────────────────────────────────────────────────

/** Create a new campaign in `"mobilization"` phase. */
export function createCampaign(
  campaignId:       string,
  attackerPolityId: string,
  defenderPolityId: string,
  tick:             number,
): CampaignState {
  return {
    campaignId,
    attackerPolityId,
    defenderPolityId,
    phase:              "mobilization",
    startTick:          tick,
    daysElapsed:        0,
    marchProgress_Q:    0 as Q,
    attackerArmySize:   0,
    attackerStrength_Q: 0 as Q,
    defenderStrength_Q: 0 as Q,
  };
}

// ── Army strength ─────────────────────────────────────────────────────────────

/**
 * Compute battle strength for a polity with a given army size [Q].
 *
 * Formula:
 *   soldierMul    = TECH_SOLDIER_MUL[techEra]  (default q(0.80))
 *   stabilityMul  = q(0.50) + mulDiv(q(0.50), stabilityQ, SCALE.Q)  ∈ [q(0.50), q(1.00)]
 *   rawStrength   = round(militaryStrength_Q × armySize / REFERENCE_ARMY_SIZE)
 *   adjusted      = round(rawStrength × soldierMul / SCALE.Q)
 *   final         = clampQ(round(adjusted × stabilityMul / SCALE.Q), 0, SCALE.Q)
 *
 * @param armySize  Number of soldiers (capped at population for safety).
 */
export function computeBattleStrength(polity: Polity, armySize: number): Q {
  const soldierMul   = (TECH_SOLDIER_MUL[polity.techEra] ?? q(0.80)) as Q;
  const stabilityMul = SCALE.Q / 2 + mulDiv(SCALE.Q / 2, polity.stabilityQ, SCALE.Q);
  const raw          = Math.round(polity.militaryStrength_Q * armySize / REFERENCE_ARMY_SIZE);
  const adjusted     = Math.round(raw * soldierMul / SCALE.Q);
  return clampQ(Math.round(adjusted * stabilityMul / SCALE.Q), 0, SCALE.Q) as Q;
}

/**
 * Compute army size for a given mobilization fraction [soldiers].
 * Clamped to `[0, floor(population × MAX_MOBILIZATION_Q / SCALE.Q)]`.
 */
export function computeArmySize(polity: Polity, mobilizationFrac_Q: Q = MOBILIZATION_POP_FRACTION_Q): number {
  const frac    = clampQ(mobilizationFrac_Q, 0, MAX_MOBILIZATION_Q);
  return Math.floor(polity.population * frac / SCALE.Q);
}

// ── Mobilization ──────────────────────────────────────────────────────────────

/**
 * Raise an army and transition campaign to `"march"` phase.
 *
 * Drains `armySize × MOBILIZATION_COST_PER_SOLDIER` from `polity.treasury_cu`
 * (capped at available treasury — a treasury-poor polity raises a smaller
 * effective force than planned).
 *
 * Mutates `campaign` and `polity.treasury_cu`.
 */
export function mobilizeCampaign(
  campaign:          CampaignState,
  attacker:          Polity,
  mobilizationFrac_Q: Q = MOBILIZATION_POP_FRACTION_Q,
): MobilizationResult {
  const armySize  = computeArmySize(attacker, mobilizationFrac_Q);
  const fullCost  = armySize * MOBILIZATION_COST_PER_SOLDIER;
  const cost_cu   = Math.min(fullCost, attacker.treasury_cu);
  attacker.treasury_cu -= cost_cu;

  // Scale army size if treasury couldn't cover full cost
  const fundedFrac  = fullCost > 0 ? cost_cu / fullCost : 1;
  const effectiveSize = Math.floor(armySize * fundedFrac);
  const armyStrength_Q = computeBattleStrength(attacker, effectiveSize);

  campaign.attackerArmySize   = effectiveSize;
  campaign.attackerStrength_Q = armyStrength_Q;
  campaign.phase              = "march";

  return { armySize: effectiveSize, cost_cu, armyStrength_Q };
}

// ── Defender preparation ──────────────────────────────────────────────────────

/**
 * Set the defender's battle strength.  Call before `stepCampaignMarch` starts.
 *
 * @param wallBonus_Q  Phase-89 wall infrastructure bonus [0, SCALE.Q].
 *                     Increases defender effective strength by this fraction.
 */
export function prepareDefender(
  campaign:    CampaignState,
  defender:    Polity,
  wallBonus_Q: Q = 0 as Q,
): Q {
  const armySize  = computeArmySize(defender);
  const baseStr   = computeBattleStrength(defender, armySize);
  const wallBoost = mulDiv(baseStr, wallBonus_Q, SCALE.Q);
  const final     = clampQ(baseStr + wallBoost, 0, SCALE.Q) as Q;
  campaign.defenderStrength_Q = final;
  return final;
}

// ── March ─────────────────────────────────────────────────────────────────────

/**
 * Advance the campaign march for one tick.
 *
 * Daily march rate = `BASE_MARCH_RATE_Q + roadBonus_Q`.
 * Daily upkeep    = `attackerArmySize × CAMPAIGN_UPKEEP_PER_SOLDIER`.
 *
 * When `marchProgress_Q` reaches SCALE.Q the phase transitions to `"battle"`.
 *
 * Mutates `campaign` and `attacker.treasury_cu`.
 *
 * @param roadBonus_Q  Phase-89 road infrastructure bonus [0, SCALE.Q].
 */
export function stepCampaignMarch(
  campaign:     CampaignState,
  attacker:     Polity,
  elapsedDays:  number,
  roadBonus_Q:  Q = 0 as Q,
): MarchStepResult {
  const dailyProgress = clampQ(BASE_MARCH_RATE_Q + roadBonus_Q, 0, SCALE.Q) as Q;
  const added         = clampQ(
    Math.min(dailyProgress * elapsedDays, SCALE.Q - campaign.marchProgress_Q),
    0, SCALE.Q,
  ) as Q;
  campaign.marchProgress_Q = clampQ(campaign.marchProgress_Q + added, 0, SCALE.Q) as Q;
  campaign.daysElapsed    += elapsedDays;

  const upkeep_cu = Math.min(
    campaign.attackerArmySize * CAMPAIGN_UPKEEP_PER_SOLDIER * elapsedDays,
    attacker.treasury_cu,
  );
  attacker.treasury_cu -= upkeep_cu;

  const battleTriggered = campaign.marchProgress_Q >= SCALE.Q;
  if (battleTriggered && campaign.phase === "march") {
    campaign.phase = "battle";
  }

  return { progressAdded_Q: added, upkeep_cu, battleTriggered };
}

// ── Battle resolution ─────────────────────────────────────────────────────────

/**
 * Resolve the field battle deterministically.
 *
 * Outcome probability is weighted by the strength ratio between attacker and
 * defender, modified by a `eventSeed`-derived roll.
 *
 * Roll:
 *   seed   = eventSeed(worldSeed, tick, hashString(attackerId), hashString(defenderId), 9301)
 *   roll   = seed % SCALE.Q   ∈ [0, 9999]
 *   threshold_victory  = round(attackerStr × q(0.80) / SCALE.Q)  — min roll to win
 *   threshold_stalemate = threshold_victory + round(q(0.15) × SCALE.Q / SCALE.Q)
 *
 * This ensures that a stronger attacker has a proportionally higher chance
 * of victory, while weaker attackers still occasionally succeed.
 *
 * Mutates `campaign.outcome`, `campaign.phase`, and `attacker.treasury_cu`/
 * `defender.treasury_cu` (tribute on victory).
 */
export function resolveBattle(
  campaign:   CampaignState,
  attacker:   Polity,
  defender:   Polity,
  worldSeed:  number,
  tick:       number,
): BattleResult {
  const seed    = eventSeed(worldSeed, tick, hashString(attacker.id), hashString(defender.id), 9301);
  const roll    = seed % SCALE.Q;

  // Compute victory threshold based on relative strength
  const atkStr  = campaign.attackerStrength_Q;
  const defStr  = campaign.defenderStrength_Q;
  const totalStr = atkStr + defStr;
  const atkFrac = totalStr > 0 ? Math.round(atkStr * SCALE.Q / totalStr) : SCALE.Q / 2;

  // Thresholds:
  // [0, victoryThreshold)  → attacker_victory
  // [victoryThreshold, stalemateThreshold) → stalemate
  // [stalemateThreshold, SCALE.Q) → defender_holds
  const victoryThreshold   = Math.round(atkFrac * 0.7);
  const stalemateThreshold = Math.round(atkFrac * 0.9);

  let outcome: BattleOutcome;
  let attackerCas: Q;
  let defenderCas: Q;
  let tributeAmount: number | undefined;

  if (roll < victoryThreshold) {
    outcome     = "attacker_victory";
    attackerCas = ATTACKER_CASUALTY_ON_VICTORY_Q;
    defenderCas = DEFENDER_CASUALTY_ON_VICTORY_Q;
    tributeAmount = Math.floor(mulDiv(defender.treasury_cu, VICTORY_TRIBUTE_Q, SCALE.Q));
    defender.treasury_cu -= tributeAmount;
    attacker.treasury_cu += tributeAmount;
  } else if (roll < stalemateThreshold) {
    outcome     = "stalemate";
    attackerCas = ATTACKER_CASUALTY_ON_STALEMATE_Q;
    defenderCas = DEFENDER_CASUALTY_ON_STALEMATE_Q;
  } else {
    outcome     = "defender_holds";
    attackerCas = ATTACKER_CASUALTY_ON_DEFEAT_Q;
    defenderCas = DEFENDER_CASUALTY_ON_DEFEAT_Q;
  }

  // Apply strength reduction
  campaign.attackerStrength_Q = clampQ(
    campaign.attackerStrength_Q - mulDiv(campaign.attackerStrength_Q, attackerCas, SCALE.Q),
    0, SCALE.Q,
  ) as Q;
  campaign.defenderStrength_Q = clampQ(
    campaign.defenderStrength_Q - mulDiv(campaign.defenderStrength_Q, defenderCas, SCALE.Q),
    0, SCALE.Q,
  ) as Q;

  campaign.outcome = outcome;
  campaign.phase   = "resolved";

  return {
    outcome,
    attackerCasualties_Q: attackerCas,
    defenderCasualties_Q: defenderCas,
    ...(tributeAmount !== undefined ? { tributeAmount } : {}),
  };
}

// ── Post-battle consequences ──────────────────────────────────────────────────

/**
 * Apply morale and stability penalties to both sides after a resolved battle.
 *
 * - Loser: morale −`DEFEAT_MORALE_HIT_Q`, stability −`DEFEAT_STABILITY_HIT_Q`.
 * - Winner: morale +`VICTORY_MORALE_BONUS_Q` (capped at SCALE.Q).
 * - Both: stability drained by `COMBAT_STABILITY_DRAIN_Q` (war is always costly).
 *
 * Mutates `attacker` and `defender` in place.
 */
export const DEFEAT_MORALE_HIT_Q:       Q = q(0.20);
export const DEFEAT_STABILITY_HIT_Q:    Q = q(0.15);
export const VICTORY_MORALE_BONUS_Q:    Q = q(0.10);
export const COMBAT_STABILITY_DRAIN_Q:  Q = q(0.05);

export function applyBattleConsequences(
  result:   BattleResult,
  attacker: Polity,
  defender: Polity,
): void {
  // Both sides pay a stability toll for the war
  attacker.stabilityQ = clampQ(attacker.stabilityQ - COMBAT_STABILITY_DRAIN_Q, 0, SCALE.Q) as Q;
  defender.stabilityQ = clampQ(defender.stabilityQ - COMBAT_STABILITY_DRAIN_Q, 0, SCALE.Q) as Q;

  if (result.outcome === "attacker_victory") {
    attacker.moraleQ   = clampQ(attacker.moraleQ   + VICTORY_MORALE_BONUS_Q, 0, SCALE.Q) as Q;
    defender.moraleQ   = clampQ(defender.moraleQ   - DEFEAT_MORALE_HIT_Q,    0, SCALE.Q) as Q;
    defender.stabilityQ = clampQ(defender.stabilityQ - DEFEAT_STABILITY_HIT_Q, 0, SCALE.Q) as Q;
  } else if (result.outcome === "defender_holds") {
    defender.moraleQ   = clampQ(defender.moraleQ   + VICTORY_MORALE_BONUS_Q, 0, SCALE.Q) as Q;
    attacker.moraleQ   = clampQ(attacker.moraleQ   - DEFEAT_MORALE_HIT_Q,    0, SCALE.Q) as Q;
    attacker.stabilityQ = clampQ(attacker.stabilityQ - DEFEAT_STABILITY_HIT_Q, 0, SCALE.Q) as Q;
  } else {
    // Stalemate: minor morale drain on both
    attacker.moraleQ = clampQ(attacker.moraleQ - mulDiv(DEFEAT_MORALE_HIT_Q, q(0.40) as Q, SCALE.Q), 0, SCALE.Q) as Q;
    defender.moraleQ = clampQ(defender.moraleQ - mulDiv(DEFEAT_MORALE_HIT_Q, q(0.40) as Q, SCALE.Q), 0, SCALE.Q) as Q;
  }
}

// ── Upkeep & attrition ────────────────────────────────────────────────────────

/**
 * Compute daily treasury upkeep for an active campaign [cost-units/day].
 */
export function computeDailyUpkeep(campaign: CampaignState): number {
  return campaign.attackerArmySize * CAMPAIGN_UPKEEP_PER_SOLDIER;
}

/**
 * Return the war unrest pressure on the attacker polity during an active campaign.
 * Pass as an extra factor into Phase-90 `computeUnrestLevel`.
 * Returns 0 when campaign is resolved.
 */
export function computeWarUnrestPressure(campaign: CampaignState): Q {
  if (campaign.phase === "resolved") return 0 as Q;
  return WAR_UNREST_PRESSURE_Q;
}
