// src/battle-bridge.ts — Campaign ↔ Combat bridge for the Persistent World Server.
//
// Pure functions that translate between polity-scale state and tactical combat
// configuration, and back.  No I/O, no timers, no side effects.
//
// Flow:
//   1. Polity layer detects a war (activeWars contains pair key).
//   2. Caller invokes battleConfigFromPolities() to get a BattleConfig.
//   3. Caller runs a tactical combat instance until one team is wiped out.
//   4. Caller invokes polityImpactFromBattle() to get PolityImpact[] to apply.

import { SCALE, q, clampQ, type Q } from "./units.js";
import { TechEra }                   from "./sim/tech.js";
import type { Polity }               from "./polity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Equipment loadout inferred from a polity's tech era. */
export interface EraLoadout {
  archetype: string;
  weaponId:  string;
  armourId:  string;
}

/** Configuration for a single tactical battle between two polities. */
export interface BattleConfig {
  /** Deterministic seed: combines world seed + day + polity ids. */
  seed:       number;
  polityAId:  string;
  polityBId:  string;
  teamASize:  number;
  teamBSize:  number;
  loadoutA:   EraLoadout;
  loadoutB:   EraLoadout;
  /** Tick limit — battle is a draw if neither side wins by this tick. */
  maxTicks:   number;
}

/** Result reported by the caller after the battle completes. */
export interface BattleOutcome {
  /** 1 = team A won, 2 = team B won, 0 = draw (timeout or mutual annihilation). */
  winner:           0 | 1 | 2;
  ticksElapsed:     number;
  teamACasualties:  number;
  teamBCasualties:  number;
}

/** Per-polity state changes to apply after a battle. */
export interface PolityImpact {
  polityId:          string;
  moraleDelta_Q:     number;    // Q units; negative on loss, positive on win
  stabilityDelta_Q:  number;    // Q units; negative on heavy casualties
  populationLost:    number;    // headcount lost (scales from military strength)
}

/** Summary record written to the battle log. */
export interface BattleRecord {
  day:              number;
  polityAId:        string;
  polityBId:        string;
  winner:           0 | 1 | 2;
  teamACasualties:  number;
  teamBCasualties:  number;
  ticksElapsed:     number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Minimum and maximum combatants per side. */
export const MIN_TEAM_SIZE = 2;
export const MAX_TEAM_SIZE = 16;

/** Battle ends after this many ticks regardless of outcome (prevents infinite loops). */
export const DEFAULT_MAX_TICKS = 6000;   // 5 min at 20 Hz

/** Morale bonus for winning a battle (Q units). */
export const WIN_MORALE_BONUS    = q(0.08) as number;
/** Morale penalty for losing a battle (Q units). */
export const LOSS_MORALE_PENALTY = q(0.12) as number;
/** Stability penalty per 10% casualties above 20% casualty rate. */
export const CASUALTY_STABILITY_RATE = q(0.02) as number;
/** Population lost per combatant casualty (polity headcount, not Q). */
export const POP_PER_CASUALTY = 50;

// ── Era → Loadout mapping ──────────────────────────────────────────────────────

/**
 * Returns the best available weapon and armour for a given tech era.
 * Prehistoric → club + none; Ancient → knife + leather; Medieval+ → longsword + mail/plate.
 */
export function techEraToLoadout(era: TechEra): EraLoadout {
  switch (era) {
    case TechEra.Prehistoric:
      return { archetype: "HUMAN_BASE", weaponId: "wpn_club",      armourId: "arm_leather" };
    case TechEra.Ancient:
      return { archetype: "HUMAN_BASE", weaponId: "wpn_knife",     armourId: "arm_leather" };
    case TechEra.Medieval:
      return { archetype: "HUMAN_BASE", weaponId: "wpn_longsword", armourId: "arm_mail"    };
    case TechEra.EarlyModern:
      return { archetype: "HUMAN_BASE", weaponId: "wpn_longsword", armourId: "arm_plate"   };
    default:
      return { archetype: "HUMAN_BASE", weaponId: "wpn_longsword", armourId: "arm_plate"   };
  }
}

// ── Military strength → team size ─────────────────────────────────────────────

/**
 * Converts a polity's military strength (Q) to a team size.
 * q(0) → MIN_TEAM_SIZE; q(1.0) → MAX_TEAM_SIZE.  Linear interpolation.
 */
export function militaryStrengthToTeamSize(militaryStrength_Q: number): number {
  const frac  = Math.max(0, Math.min(SCALE.Q, militaryStrength_Q)) / SCALE.Q;
  const size  = Math.round(MIN_TEAM_SIZE + frac * (MAX_TEAM_SIZE - MIN_TEAM_SIZE));
  return Math.max(MIN_TEAM_SIZE, Math.min(MAX_TEAM_SIZE, size));
}

// ── Deterministic seed ─────────────────────────────────────────────────────────

/**
 * Produces a deterministic battle seed from the world seed, day, and polity ids.
 * Ensures each polity pair on each day gets a unique, reproducible seed.
 */
export function battleSeed(worldSeed: number, day: number, polityAId: string, polityBId: string): number {
  const idSalt = [...(polityAId + polityBId)].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return ((worldSeed * 1000003 + day * 6151 + idSalt) >>> 0);
}

// ── BattleConfig factory ───────────────────────────────────────────────────────

/**
 * Builds a BattleConfig for a war between two polities.
 * Team sizes scale with militaryStrength_Q; loadouts reflect each side's tech era.
 */
export function battleConfigFromPolities(
  polityA:   Polity,
  polityB:   Polity,
  worldSeed: number,
  day:       number,
  maxTicks = DEFAULT_MAX_TICKS,
): BattleConfig {
  return {
    seed:      battleSeed(worldSeed, day, polityA.id, polityB.id),
    polityAId: polityA.id,
    polityBId: polityB.id,
    teamASize: militaryStrengthToTeamSize(polityA.militaryStrength_Q),
    teamBSize: militaryStrengthToTeamSize(polityB.militaryStrength_Q),
    loadoutA:  techEraToLoadout(polityA.techEra),
    loadoutB:  techEraToLoadout(polityB.techEra),
    maxTicks,
  };
}

// ── PolityImpact derivation ────────────────────────────────────────────────────

/**
 * Derives the per-polity state changes to apply after a battle.
 *
 * Win:  +WIN_MORALE_BONUS morale.
 * Loss: −LOSS_MORALE_PENALTY morale.
 * Draw: no morale change.
 * Both sides: stability penalty proportional to casualties above 20%.
 * Population: POP_PER_CASUALTY headcount lost per casualty.
 */
export function polityImpactFromBattle(
  outcome: BattleOutcome,
  config:  BattleConfig,
): PolityImpact[] {
  const results: PolityImpact[] = [];

  const sides: Array<{ id: string; casualties: number; teamSize: number; isWinner: boolean }> = [
    { id: config.polityAId, casualties: outcome.teamACasualties, teamSize: config.teamASize, isWinner: outcome.winner === 1 },
    { id: config.polityBId, casualties: outcome.teamBCasualties, teamSize: config.teamBSize, isWinner: outcome.winner === 2 },
  ];

  for (const side of sides) {
    const isLoser = outcome.winner !== 0 && !side.isWinner;

    const moraleDelta_Q = side.isWinner
      ? WIN_MORALE_BONUS
      : isLoser
        ? -LOSS_MORALE_PENALTY
        : 0;

    // Stability penalty for casualty rates above 20%
    const casualtyRate     = side.teamSize > 0 ? side.casualties / side.teamSize : 0;
    const excessCasualties = Math.max(0, casualtyRate - 0.20);
    const stabilityDelta_Q = -Math.round(excessCasualties * 10 * CASUALTY_STABILITY_RATE);

    results.push({
      polityId:         side.id,
      moraleDelta_Q,
      stabilityDelta_Q,
      populationLost:   side.casualties * POP_PER_CASUALTY,
    });
  }

  return results;
}

/**
 * Apply a PolityImpact to a polity in-place.
 * Clamps morale and stability to [0, SCALE.Q].
 */
export function applyPolityImpact(polity: Polity, impact: PolityImpact): void {
  polity.moraleQ     = clampQ(polity.moraleQ     + impact.moraleDelta_Q,    0, SCALE.Q) as Q;
  polity.stabilityQ  = clampQ(polity.stabilityQ  + impact.stabilityDelta_Q, 0, SCALE.Q) as Q;
  polity.population  = Math.max(0, polity.population - impact.populationLost);
}
