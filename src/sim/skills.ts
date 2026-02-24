// src/sim/skills.ts — Phase 7: Skill System
//
// Skills are learned technique modifiers separate from physical attributes.
// They adjust physical outcomes rather than providing abstract point bonuses.
// The engine consumes skill values; progression is managed by the host application.

import { type Q, type I32, q } from "../units.js";

export const SKILL_IDS = [
  "meleeCombat",
  "meleeDefence",
  "grappling",
  "rangedCombat",
  "throwingWeapons",
  "shieldCraft",
  "medical",
  "athleticism",
  "tactics",
  "stealth",
] as const;

export type SkillId = (typeof SKILL_IDS)[number];

/**
 * A SkillLevel is a set of physical outcome modifiers for one skill domain.
 * All fields default to the neutral value (no effect on simulation output).
 */
export interface SkillLevel {
  /**
   * Timing offset (SCALE.s units). Negative = faster action or reaction.
   *   meleeCombat: reduces attack recovery time (fewer ticks until next attack).
   *   tactics:     reduces AI decision latency (faster plan revisions).
   */
  hitTimingOffset_s: I32;

  /**
   * Efficiency multiplier (Q). > q(1.0) = beneficial.
   *   meleeCombat:     multiplied into strike impact energy.
   *   meleeDefence:    multiplied into effective defence skill (parry / block quality).
   *   grappling:       multiplied into grapple contest score (leverage bonus).
   *   throwingWeapons: multiplied into thrown weapon launch energy.
   *   shieldCraft:     multiplied into effective defence skill when blocking with a shield.
   */
  energyTransferMul: Q;

  /**
   * Dispersion multiplier (Q). < q(1.0) = tighter spread or smaller signature.
   *   rangedCombat: multiplied into adjusted dispersion (more accurate fire).
   *   stealth:      multiplied into the observer's effective hearing range for this
   *                 entity (reduces acoustic signature — harder to detect by hearing).
   */
  dispersionMul: Q;

  /**
   * Treatment rate multiplier (Q). > q(1.0) = better self-care.
   *   medical: divides the effective bleed-to-fluid-loss increment each tick
   *            (passive wound management — slower fluid loss from bleeding).
   */
  treatmentRateMul: Q;

  /**
   * Fatigue rate multiplier (Q). < q(1.0) = less fatigue per tick.
   *   athleticism: multiplied into the fatigue delta each energy tick.
   */
  fatigueRateMul: Q;
}

export type SkillMap = Map<SkillId, SkillLevel>;

/** Returns a SkillLevel with all fields at the neutral (no-effect) value. */
export function defaultSkillLevel(): SkillLevel {
  return {
    hitTimingOffset_s: 0,
    energyTransferMul: q(1.0),
    dispersionMul: q(1.0),
    treatmentRateMul: q(1.0),
    fatigueRateMul: q(1.0),
  };
}

/**
 * Build a SkillMap from a partial record.
 * Any missing fields in each entry default to the neutral values.
 */
export function buildSkillMap(
  entries: Partial<Record<SkillId, Partial<SkillLevel>>>,
): SkillMap {
  const m = new Map<SkillId, SkillLevel>();
  for (const [k, v] of Object.entries(entries) as [SkillId, Partial<SkillLevel>][]) {
    m.set(k, { ...defaultSkillLevel(), ...v });
  }
  return m;
}

/** Look up a skill level; returns neutral defaults when the map is absent or the skill is not set. */
export function getSkill(skills: SkillMap | undefined, id: SkillId): SkillLevel {
  return skills?.get(id) ?? defaultSkillLevel();
}

/**
 * Combine two SkillLevels into one composite level.
 *
 * Use this in the host application to express synergy bonuses or to composite
 * a base skill with a situational modifier before building the SkillMap.
 * The engine itself has no concept of synergies — compositing happens outside.
 *
 * Combination rules:
 *   hitTimingOffset_s  — additive    (both offsets reduce timing independently)
 *   energyTransferMul  — qMul        (efficiency gains multiply)
 *   dispersionMul      — qMul        (tighter spreads multiply)
 *   treatmentRateMul   — qMul        (healing bonuses multiply)
 *   fatigueRateMul     — qMul        (fatigue reductions multiply)
 *
 * Example: meleeCombat synergised with an athleticism bonus
 *   buildSkillMap({ meleeCombat: combineSkillLevels(baseMelee, athleticismSynergyBonus) })
 */
export function combineSkillLevels(a: SkillLevel, b: SkillLevel): SkillLevel {
  return {
    hitTimingOffset_s: (a.hitTimingOffset_s + b.hitTimingOffset_s) as I32,
    energyTransferMul: Math.trunc(a.energyTransferMul * b.energyTransferMul / 10_000) as Q,
    dispersionMul:     Math.trunc(a.dispersionMul     * b.dispersionMul     / 10_000) as Q,
    treatmentRateMul:  Math.trunc(a.treatmentRateMul  * b.treatmentRateMul  / 10_000) as Q,
    fatigueRateMul:    Math.trunc(a.fatigueRateMul    * b.fatigueRateMul    / 10_000) as Q,
  };
}
