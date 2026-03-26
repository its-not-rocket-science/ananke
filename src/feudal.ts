// src/feudal.ts — Phase 79: Feudal Bonds & Vassal Tribute
//
// Tracks lord-vassal polity relationships including tribute, military levies,
// bond strength, and revolt risk. Integrates with Phase 61 (Polity) for
// treasury/military and Phase 75 (Renown) for oath-breaking infamy.
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `FeudalRegistry` is external to PolityRegistry; hosts maintain both.
//   - Bond strength decays over time and recovers via positive events
//     (kinship ties, shared victories, tribute payment).
//   - `isRebellionRisk` provides a clear boolean hook for AI and event triggers.

import type { Polity }         from "./polity.js";
import type { RenownRegistry } from "./renown.js";
import { getRenownRecord }     from "./renown.js";
import { q, SCALE, clampQ, mulDiv } from "./units.js";
import type { Q } from "./units.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** How the vassal bond was established — affects base strength and decay rate. */
export type LoyaltyType =
  | "kin_bound"   // family tie to liege; strong but triggers catastrophic break on kin death
  | "oath_sworn"  // formal oath; moderate; infamy penalty on breaking
  | "conquered"   // imposed by force; weak; high revolt risk
  | "voluntary";  // polity chose to submit; moderate; breaks cleanly

/**
 * A directional bond from a vassal polity to a liege polity.
 * Stored once per directed pair (vassal → liege).
 */
export interface VassalBond {
  vassalPolityId: string;
  liegePolityId:  string;
  loyaltyType:    LoyaltyType;
  /** Fraction of vassal `treasury_cu` paid as annual tribute [0, SCALE.Q]. */
  tributeRate_Q:  Q;
  /** Fraction of vassal `militaryStrength_Q` available to liege as levy [0, SCALE.Q]. */
  levyRate_Q:     Q;
  /**
   * Bond strength [0, SCALE.Q].
   * Below `REBELLION_THRESHOLD` the vassal is at risk of revolt.
   */
  strength_Q:     Q;
  /** Tick when the bond was created (for age-based decay calculations). */
  establishedTick: number;
}

/** Registry of all vassal bonds, keyed by `"vassalId:liegeId"`. */
export interface FeudalRegistry {
  bonds: Map<string, VassalBond>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Bond strength below this → `isRebellionRisk` returns true. */
export const REBELLION_THRESHOLD: Q = q(0.25);

/** Daily strength decay for each loyalty type (per simulated day). */
export const LOYALTY_DECAY_PER_DAY: Record<LoyaltyType, Q> = {
  kin_bound:  q(0.001),  // very slow — family ties are resilient
  oath_sworn: q(0.002),
  voluntary:  q(0.003),
  conquered:  q(0.005),  // fastest — resentment grows quickly
};

/** Base strength at bond creation per loyalty type. */
export const LOYALTY_BASE_STRENGTH: Record<LoyaltyType, Q> = {
  kin_bound:  q(0.90),
  oath_sworn: q(0.70),
  voluntary:  q(0.65),
  conquered:  q(0.40),
};

/**
 * Infamy added to the vassal's renown record when breaking an `oath_sworn` bond.
 * `kin_bound` and `conquered` breaks carry no oath infamy.
 */
export const OATH_BREAK_INFAMY_Q: Q = q(0.15);

/** Tribute paid daily = `TRIBUTE_DAILY_FRAC` × annual rate × treasury_cu */
export const TRIBUTE_DAYS_PER_YEAR = 365;

// ── Factory ───────────────────────────────────────────────────────────────────

export function createFeudalRegistry(): FeudalRegistry {
  return { bonds: new Map() };
}

// ── Bond key ──────────────────────────────────────────────────────────────────

function bondKey(vassalId: string, liegeId: string): string {
  return `${vassalId}:${liegeId}`;
}

// ── Bond management ───────────────────────────────────────────────────────────

/**
 * Create a vassal bond and register it.
 * If a bond between this pair already exists it is overwritten.
 *
 * @param tributeRate_Q  Annual tribute as fraction of vassal treasury (default q(0.10)).
 * @param levyRate_Q     Fraction of military available as levy (default q(0.20)).
 * @param tick           Current simulation tick.
 */
export function createVassalBond(
  registry:       FeudalRegistry,
  vassalPolityId: string,
  liegePolityId:  string,
  loyaltyType:    LoyaltyType,
  tributeRate_Q:  Q = q(0.10) as Q,
  levyRate_Q:     Q = q(0.20) as Q,
  tick:           number = 0,
): VassalBond {
  const bond: VassalBond = {
    vassalPolityId,
    liegePolityId,
    loyaltyType,
    tributeRate_Q,
    levyRate_Q,
    strength_Q:      LOYALTY_BASE_STRENGTH[loyaltyType],
    establishedTick: tick,
  };
  registry.bonds.set(bondKey(vassalPolityId, liegePolityId), bond);
  return bond;
}

/** Return the bond from `vassalId` to `liegeId`, or `undefined` if none. */
export function getBond(
  registry:  FeudalRegistry,
  vassalId:  string,
  liegeId:   string,
): VassalBond | undefined {
  return registry.bonds.get(bondKey(vassalId, liegeId));
}

/** Return all active bonds where `liegeId` is the lord. */
export function getVassals(registry: FeudalRegistry, liegeId: string): VassalBond[] {
  return [...registry.bonds.values()].filter(b => b.liegePolityId === liegeId);
}

/** Return the bond where `vassalId` is the vassal, or `undefined`. */
export function getLiege(registry: FeudalRegistry, vassalId: string): VassalBond | undefined {
  return [...registry.bonds.values()].find(b => b.vassalPolityId === vassalId);
}

// ── Tribute computation ───────────────────────────────────────────────────────

/**
 * Compute the tribute owed for one simulated day.
 * Scales linearly: `daily = floor(treasury_cu × tributeRate_Q / SCALE.Q / DAYS_PER_YEAR)`.
 * Returns 0 if the vassal treasury is empty.
 */
export function computeDailyTribute(vassal: Polity, bond: VassalBond): number {
  if (vassal.treasury_cu <= 0) return 0;
  return Math.floor(
    vassal.treasury_cu * bond.tributeRate_Q / SCALE.Q / TRIBUTE_DAYS_PER_YEAR,
  );
}

/**
 * Apply one day of tribute: deduct from vassal treasury and add to liege treasury.
 * Mutates both polity objects.
 * No-op if computed tribute is 0.
 */
export function applyDailyTribute(
  vassal: Polity,
  liege:  Polity,
  bond:   VassalBond,
): number {
  const tribute = computeDailyTribute(vassal, bond);
  if (tribute <= 0) return 0;
  vassal.treasury_cu = Math.max(0, vassal.treasury_cu - tribute);
  liege.treasury_cu += tribute;
  return tribute;
}

// ── Levy computation ──────────────────────────────────────────────────────────

/**
 * Compute the military strength available to the liege as a levy.
 * = `vassal.militaryStrength_Q × levyRate_Q × bond.strength_Q`.
 * A weakened bond reduces the effective levy.
 */
export function computeLevyStrength(vassal: Polity, bond: VassalBond): Q {
  const raw = mulDiv(
    mulDiv(vassal.militaryStrength_Q, bond.levyRate_Q, SCALE.Q),
    bond.strength_Q,
    SCALE.Q,
  );
  return clampQ(raw, 0, SCALE.Q);
}

// ── Bond strength ─────────────────────────────────────────────────────────────

/**
 * Advance bond strength by one simulated day.
 * Strength decays at `LOYALTY_DECAY_PER_DAY[loyaltyType]`.
 * `boostDelta_Q` is an optional signed daily bonus (e.g., from kinship, shared victory,
 * good governance). Positive = strengthen; negative = additional stress.
 * Mutates `bond.strength_Q` directly.
 */
export function stepBondStrength(
  bond:         VassalBond,
  boostDelta_Q: Q = 0 as Q,
): void {
  const decay = LOYALTY_DECAY_PER_DAY[bond.loyaltyType];
  bond.strength_Q = clampQ(
    bond.strength_Q - decay + boostDelta_Q,
    0,
    SCALE.Q,
  );
}

/**
 * Strengthen a bond by a fixed delta (e.g., after a kinship event or tribute payment).
 * Clamps to [0, SCALE.Q].
 */
export function reinforceBond(bond: VassalBond, deltaQ: Q): void {
  bond.strength_Q = clampQ(bond.strength_Q + deltaQ, 0, SCALE.Q);
}

// ── Rebellion risk ────────────────────────────────────────────────────────────

/** Return `true` if the bond is at rebellion risk (`strength_Q < REBELLION_THRESHOLD`). */
export function isRebellionRisk(bond: VassalBond): boolean {
  return bond.strength_Q < REBELLION_THRESHOLD;
}

// ── Bond breaking ─────────────────────────────────────────────────────────────

/**
 * Break a vassal bond and remove it from the registry.
 * For `oath_sworn` bonds, adds `OATH_BREAK_INFAMY_Q` to the vassal ruler's renown
 * record if `vassalRulerId` and `renownRegistry` are provided.
 *
 * @returns `true` if a bond was found and removed; `false` otherwise.
 */
export function breakVassalBond(
  registry:       FeudalRegistry,
  vassalPolityId: string,
  liegePolityId:  string,
  vassalRulerId?: number,
  renownRegistry?: RenownRegistry,
): boolean {
  const key  = bondKey(vassalPolityId, liegePolityId);
  const bond = registry.bonds.get(key);
  if (!bond) return false;

  // Oath-breaking infamy
  if (
    bond.loyaltyType === "oath_sworn" &&
    vassalRulerId != null &&
    renownRegistry != null
  ) {
    const record = getRenownRecord(renownRegistry, vassalRulerId);
    record.infamy_Q = clampQ(record.infamy_Q + OATH_BREAK_INFAMY_Q, 0, SCALE.Q);
  }

  registry.bonds.delete(key);
  return true;
}
