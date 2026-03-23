/**
 * Phase 69 — Macro-Scale Formation Combat
 *
 * A tactical abstraction layer between individual entity simulation (20 Hz) and
 * polity-level conflict (1 tick/day).  Squads and companies resolve combat as
 * cohesive units via Lanchester's square law, adjusted for terrain and morale.
 *
 * When a named entity (id < NAMED_ENTITY_THRESHOLD, or in a caller-supplied set)
 * participates in the engagement, the resolver marks them in `namedEntityIds` so the
 * host can run a full per-entity micro-simulation frame at the decisive tick.
 *
 * Lanchester's Square Law:
 *   Attrition per tick ∝ opponent_strength² / own_strength
 *   δA = k × B²          δB = k × A²
 *
 * where k is derived from aggregated combat effectiveness (force_N × endurance × morale).
 */

import { q, SCALE, clampQ, qMul, mulDiv, type Q, type I32 } from "../units.js";
import { HUMAN_BASE } from "../archetypes.js";
import type { Archetype } from "../archetypes.js";

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * A squad- or company-level unit in a formation engagement.
 * All numeric fields that represent ratios use Q; headcounts are plain integers.
 */
export interface FormationUnit {
  /** Unique identifier within the engagement. */
  id: string;
  /** Polity / faction identifier. Units with the same factionId fight together. */
  factionId: string;
  /** Current headcount (soldiers present and capable of fighting). */
  strength: number;
  /** Sum of `peakForce_N` across all members (SCALE.N units). */
  aggregatedForce_N: I32;
  /**
   * Average continuous endurance as a Q fraction [0..SCALE.Q].
   * Derived from avg(continuousPower_W) / HUMAN_CONT_W_REFERENCE.
   */
  aggregatedEndurance: Q;
  /** Formation morale Q [0..SCALE.Q]. Collapse below `breakThreshold` triggers rout. */
  moraleQ: Q;
  /**
   * Representative archetype for the unit.  Used by the host to spawn micro-simulation
   * entities at the decisive tick when named characters are present.
   */
  archetype: Archetype;
  /**
   * Optional list of named entity ids (from the micro-simulation) embedded in this unit.
   * Any id below NAMED_ENTITY_THRESHOLD is treated as named automatically.
   */
  namedEntityIds?: readonly number[];
}

/** Terrain type affects defender effectiveness multiplier. */
export type TacticalTerrain = "open" | "difficult" | "fortified";

/**
 * An engagement between two (or more) sides.
 * `attackers` and `defenders` are lists of `FormationUnit`.
 * All units sharing a `factionId` within a side fight cohesively.
 */
export interface TacticalEngagement {
  attackers: FormationUnit[];
  defenders: FormationUnit[];
  /** Terrain favours the defender. */
  terrain: TacticalTerrain;
  /**
   * How many tactical ticks to resolve (1 tactical tick ≈ 1 real second at this scale).
   * Typical engagement: 30–600 ticks.
   */
  durationTicks: number;
  /**
   * World seed — used for deterministic morale collapse rolls.
   * If omitted, morale collapse is deterministic via threshold comparison only (no randomness).
   */
  seed?: number;
}

/** Per-side outcome summary from `resolveTacticalEngagement`. */
export interface TacticalSideResult {
  casualties: number;
  survivingStrength: number;
  finalMoraleQ: Q;
  routed: boolean;
}

export interface TacticalResult {
  attackerResult: TacticalSideResult;
  defenderResult: TacticalSideResult;
  /** Faction ids that routed (morale collapsed below `breakThreshold`). */
  routedFactions: string[];
  /**
   * Named entity ids present in the engagement that require micro-simulation resolution.
   * The host should run `stepWorld` for these entities at the decisive tick.
   */
  namedEntityIds: number[];
  /**
   * The tick number (0-based) at which the decisive moment occurred.
   * If no side routed or was wiped out, equals `durationTicks`.
   */
  decisiveTick: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Entity ids strictly below this value are treated as "named" and trigger
 * micro-simulation delegation.  Hosts may override via `FormationUnit.namedEntityIds`.
 */
export const NAMED_ENTITY_THRESHOLD = 1000;

/**
 * Morale Q threshold below which a unit routs.
 * Matches Phase 32D formation morale `BASE_DECAY` model.
 */
export const ROUT_THRESHOLD: Q = q(0.20);

/**
 * Base morale decay per tactical tick due to casualties (Q per tick per 1% casualty rate).
 * A unit sustaining 10% casualties/tick loses ~q(0.10) morale/tick.
 */
export const MORALE_CASUALTY_DECAY_PER_PCT: Q = q(0.010);

/**
 * Lanchester attrition rate (fraction of effective opponent strength killed per tick).
 *
 * Lanchester's Square Law differential form:
 *   dA/dt = -rate × B_eff     (attacker casualties ∝ effective defender count)
 *   dB/dt = -rate × A_eff     (defender casualties ∝ effective attacker count)
 *
 * The "square law" refers to the conservation integral (A²-B²=const), not squared
 * differentials.  rate=0.01 gives ~100-tick engagements for equal 100-person units.
 */
export const LANCHESTER_RATE = 0.10;

/**
 * Reference combat power of a single standard human soldier at q(1.0) morale.
 * Used to convert aggregated sidePower() to "effective fighter count" for attrition.
 * Units: same as aggregatedForce_N × conversionEfficiency / SCALE.Q (SCALE.N units).
 */
export const REFERENCE_POWER_PER_SOLDIER: number = Math.round(
  (HUMAN_BASE.peakForce_N * HUMAN_BASE.conversionEfficiency) / SCALE.Q
);

// ── Terrain multipliers ───────────────────────────────────────────────────────

/**
 * Defender effectiveness multiplier per terrain type.
 * Applied to the defender's combat power (force × endurance × morale).
 * Attackers always use multiplier q(1.0).
 */
export const TERRAIN_DEFENDER_MUL: Record<TacticalTerrain, Q> = {
  open:       q(1.00),  // no terrain advantage
  difficult:  q(1.30),  // broken ground, forest, river — 30% defender bonus
  fortified:  q(2.00),  // walls, prepared positions — 2× defender effectiveness
};

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Aggregate combat power for a side (Q-scaled, relative units).
 * power = sum(force_N × endurance × morale / SCALE.Q²)
 * Returns an integer in SCALE.N × Q units (before the /SCALE.Q² normalisation).
 */
function sidePower(units: FormationUnit[], terrainMul: Q): number {
  let total = 0;
  for (const u of units) {
    if (u.strength <= 0 || u.moraleQ <= 0) continue;
    // effective = force_N × (endurance / SCALE.Q) × (morale / SCALE.Q) × (terrain / SCALE.Q)
    const effForce = mulDiv(u.aggregatedForce_N, u.aggregatedEndurance, SCALE.Q);
    const withMorale = mulDiv(effForce, u.moraleQ, SCALE.Q);
    total += mulDiv(withMorale, terrainMul, SCALE.Q);
  }
  return Math.max(0, total);
}

/** Total headcount across all units on a side. */
function sideStrength(units: FormationUnit[]): number {
  return units.reduce((s, u) => s + Math.max(0, u.strength), 0);
}

/**
 * Distribute `casualties` proportionally across units by current strength.
 * Mutates unit.strength in-place.  Returns actual casualties applied.
 */
function distributeCasualties(units: FormationUnit[], casualties: number): number {
  const total = sideStrength(units);
  if (total <= 0 || casualties <= 0) return 0;

  let applied = 0;
  for (const u of units) {
    if (u.strength <= 0) continue;
    const share = Math.round((casualties * u.strength) / total);
    const actual = Math.min(share, u.strength);
    u.strength -= actual;
    applied += actual;
  }
  return applied;
}

/**
 * Apply morale pressure to all units on a side.
 * Pressure = casualty rate × MORALE_CASUALTY_DECAY_PER_PCT.
 */
function applyMoralePressure(units: FormationUnit[], casualtiesThisTick: number): void {
  const total = sideStrength(units) + casualtiesThisTick;
  if (total <= 0) return;
  const pct = Math.round((casualtiesThisTick * SCALE.Q) / total);
  const decay = qMul(MORALE_CASUALTY_DECAY_PER_PCT as Q, pct as Q);
  for (const u of units) {
    u.moraleQ = clampQ((u.moraleQ - decay) as Q, 0, SCALE.Q);
  }
}

/** Collect named entity ids from all units across both sides. */
function collectNamedIds(attackers: FormationUnit[], defenders: FormationUnit[]): number[] {
  const ids = new Set<number>();
  for (const u of [...attackers, ...defenders]) {
    // Explicit named ids
    if (u.namedEntityIds) {
      for (const id of u.namedEntityIds) ids.add(id);
    }
  }
  return [...ids];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a `FormationUnit` from headcount and archetype.
 *
 * @param id        Unique unit identifier.
 * @param factionId Faction / polity identifier.
 * @param strength  Number of combatants.
 * @param archetype Representative archetype (used for force and endurance derivation).
 * @param moraleQ   Initial morale (defaults to q(0.70)).
 */
export function createFormationUnit(
  id: string,
  factionId: string,
  strength: number,
  archetype: Archetype,
  moraleQ: Q = q(0.70) as Q,
): FormationUnit {
  return {
    id,
    factionId,
    strength: Math.max(0, strength),
    aggregatedForce_N: Math.round(archetype.peakForce_N * strength) as I32,
    aggregatedEndurance: archetype.conversionEfficiency,
    moraleQ,
    archetype,
  };
}

/**
 * Resolve a tactical engagement over `durationTicks` using Lanchester's square law.
 *
 * The engagement proceeds tick-by-tick:
 *  1. Compute combat power for each side (aggregated force × endurance × morale × terrain).
 *  2. Apply Lanchester attrition: δA = k × B²/A, δB = k × A²/B.
 *  3. Apply morale pressure proportional to casualty rate.
 *  4. Check rout conditions — any unit below ROUT_THRESHOLD is considered routed.
 *  5. Stop early if all units on one side are routed or wiped out.
 *
 * **Note:** This mutates `strength` and `moraleQ` on the supplied `FormationUnit` objects.
 * Clone them before calling if you need to preserve original state.
 *
 * @param engagement - The engagement parameters.
 * @returns `TacticalResult` with per-side outcomes, routed factions, and named entity ids.
 */
export function resolveTacticalEngagement(engagement: TacticalEngagement): TacticalResult {
  const { attackers, defenders, terrain, durationTicks } = engagement;

  const terrainMul = TERRAIN_DEFENDER_MUL[terrain];
  const namedEntityIds = collectNamedIds(attackers, defenders);

  let totalAttackerCasualties = 0;
  let totalDefenderCasualties = 0;
  const routedFactions = new Set<string>();
  let decisiveTick = durationTicks;

  for (let tick = 0; tick < durationTicks; tick++) {
    const aStrength = sideStrength(attackers);
    const dStrength = sideStrength(defenders);

    // Stop if one side is wiped out
    if (aStrength <= 0 || dStrength <= 0) {
      decisiveTick = tick;
      break;
    }

    // Combat power for each side
    const aPower = sidePower(attackers, SCALE.Q as Q);    // attackers: no terrain bonus
    const dPower = sidePower(defenders, terrainMul);       // defenders: terrain multiplier

    // Lanchester's Square Law — linear differential form:
    //   δA = rate × dEff    (attacker casualties ∝ effective defender count)
    //   δB = rate × aEff    (defender casualties ∝ effective attacker count)
    //
    // Convert aggregated power to "effective fighter count" by dividing by the
    // reference combat power of one standard soldier.
    const ref = Math.max(1, REFERENCE_POWER_PER_SOLDIER);
    const aEff = Math.max(1, Math.round(aPower / ref));
    const dEff = Math.max(1, Math.round(dPower / ref));

    const aCas = Math.max(0, Math.round(LANCHESTER_RATE * dEff));
    const dCas = Math.max(0, Math.round(LANCHESTER_RATE * aEff));

    // Distribute casualties
    totalAttackerCasualties += distributeCasualties(attackers, aCas);
    totalDefenderCasualties += distributeCasualties(defenders, dCas);

    // Morale pressure
    applyMoralePressure(attackers, aCas);
    applyMoralePressure(defenders, dCas);

    // Rout check
    for (const u of attackers) {
      if (u.moraleQ < ROUT_THRESHOLD || u.strength <= 0) routedFactions.add(u.factionId);
    }
    for (const u of defenders) {
      if (u.moraleQ < ROUT_THRESHOLD || u.strength <= 0) routedFactions.add(u.factionId);
    }

    // Early stop: all attacker or all defender factions routed
    const aAllRouted = attackers.every(u => routedFactions.has(u.factionId) || u.strength <= 0);
    const dAllRouted = defenders.every(u => routedFactions.has(u.factionId) || u.strength <= 0);
    if (aAllRouted || dAllRouted) {
      decisiveTick = tick + 1;
      break;
    }
  }

  const attackerResult: TacticalSideResult = {
    casualties:        totalAttackerCasualties,
    survivingStrength: sideStrength(attackers),
    finalMoraleQ:      Math.round(
      attackers.reduce((s, u) => s + u.moraleQ, 0) / Math.max(1, attackers.length)
    ) as Q,
    routed: attackers.every(u => routedFactions.has(u.factionId) || u.strength <= 0),
  };

  const defenderResult: TacticalSideResult = {
    casualties:        totalDefenderCasualties,
    survivingStrength: sideStrength(defenders),
    finalMoraleQ:      Math.round(
      defenders.reduce((s, u) => s + u.moraleQ, 0) / Math.max(1, defenders.length)
    ) as Q,
    routed: defenders.every(u => routedFactions.has(u.factionId) || u.strength <= 0),
  };

  return {
    attackerResult,
    defenderResult,
    routedFactions: [...routedFactions],
    namedEntityIds,
    decisiveTick,
  };
}

/**
 * Apply the tactical result back to polity military strength (Q).
 *
 * @param currentStrength_Q - Current `polity.militaryStrength_Q`.
 * @param initialStrength   - Headcount at engagement start.
 * @param result            - Side result from `resolveTacticalEngagement`.
 * @returns Updated `militaryStrength_Q`.
 */
export function applyTacticalResultToPolity(
  currentStrength_Q: Q,
  initialStrength: number,
  result: TacticalSideResult,
): Q {
  if (initialStrength <= 0) return currentStrength_Q;
  const survivorFrac = Math.round(
    (result.survivingStrength * SCALE.Q) / initialStrength
  );
  const moraleAdj = qMul(survivorFrac as Q, result.finalMoraleQ);
  return clampQ(
    Math.round((currentStrength_Q * moraleAdj) / SCALE.Q) as Q,
    0, SCALE.Q,
  );
}
