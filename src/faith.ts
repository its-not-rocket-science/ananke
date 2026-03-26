// src/faith.ts — Phase 85: Religion & Faith Systems
//
// Models named faiths and their presence in polities. Faith presence is
// expressed as a Q fraction of the polity population. Exclusive faiths
// (monotheistic) compete with each other; syncretic faiths stack additively.
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `FaithRegistry` stores faith definitions and per-polity adherent fractions.
//   - Conversion pressure integrates with Phase-81 (migration drives faith spread)
//     and Phase-80 (shared faith boosts treaty strength) via caller-supplied context.
//   - Heresy risk integrates with Phase-82 (espionage can incite religious unrest).

import { q, SCALE, clampQ, mulDiv } from "./units.js";
import type { Q }                   from "./units.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FaithId = string;

/** Definition of a named faith. */
export interface Faith {
  faithId:     FaithId;
  name:        string;
  /**
   * Proselytising energy [0, SCALE.Q].
   * Higher fervor → faster conversion spread into other polities.
   */
  fervor_Q:    Q;
  /**
   * Tolerance for other faiths [0, SCALE.Q].
   * Low tolerance → higher heresy risk when minority faiths are present.
   */
  tolerance_Q: Q;
  /**
   * Exclusive faiths (monotheistic) compete: gaining adherents displaces
   * other exclusive faiths proportionally.
   * Syncretic faiths are additive — populations can hold multiple.
   */
  exclusive:   boolean;
}

/** Presence of one faith within a polity. */
export interface PolityFaith {
  polityId:    string;
  faithId:     FaithId;
  /** Fraction of population following this faith [0, SCALE.Q]. */
  adherents_Q: Q;
}

/** Central registry: faith definitions + per-polity adherent records. */
export interface FaithRegistry {
  /** All defined faiths keyed by faithId. */
  faiths:       Map<FaithId, Faith>;
  /** polityId → array of PolityFaith (one entry per faith present). */
  polityFaiths: Map<string, PolityFaith[]>;
}

// ── Built-in sample faiths ─────────────────────────────────────────────────────

/** High-fervor monotheistic faith. */
export const SOLAR_CHURCH: Faith = {
  faithId:     "solar_church",
  name:        "The Solar Church",
  fervor_Q:    q(0.80) as Q,
  tolerance_Q: q(0.20) as Q,
  exclusive:   true,
};

/** Low-fervor animistic syncretic faith. */
export const EARTH_SPIRITS: Faith = {
  faithId:     "earth_spirits",
  name:        "Earth Spirits",
  fervor_Q:    q(0.30) as Q,
  tolerance_Q: q(0.90) as Q,
  exclusive:   false,
};

/** Moderate syncretic merchant cult. */
export const MERCHANT_CULT: Faith = {
  faithId:     "merchant_cult",
  name:        "Merchant Cult",
  fervor_Q:    q(0.50) as Q,
  tolerance_Q: q(0.70) as Q,
  exclusive:   false,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Base daily conversion delta at full missionary presence and full source fervor.
 * Actual delta = `fervor_Q × missionaryPresence_Q × CONVERSION_BASE_RATE_Q / SCALE.Q²`.
 */
export const CONVERSION_BASE_RATE_Q: Q = q(0.002);

/**
 * Minority exclusive faith presence above this fraction → heresy risk fires.
 * `computeHeresyRisk` returns non-zero only when a minority exclusive faith
 * exceeds this threshold in a polity whose dominant faith has low tolerance.
 */
export const HERESY_THRESHOLD_Q: Q = q(0.15);

/** Diplomatic bonus (Q offset) when two polities share the same dominant faith. */
export const FAITH_DIPLOMATIC_BONUS_Q: Q = q(0.10);

/** Diplomatic penalty when polities hold exclusive faiths that conflict. */
export const FAITH_DIPLOMATIC_PENALTY_Q: Q = q(0.10);

// ── Factory ───────────────────────────────────────────────────────────────────

export function createFaithRegistry(): FaithRegistry {
  return { faiths: new Map(), polityFaiths: new Map() };
}

// ── Faith management ───────────────────────────────────────────────────────────

/** Register or replace a faith definition. */
export function registerFaith(registry: FaithRegistry, faith: Faith): void {
  registry.faiths.set(faith.faithId, faith);
}

/** Return the faith definition, or `undefined` if unknown. */
export function getFaith(registry: FaithRegistry, faithId: FaithId): Faith | undefined {
  return registry.faiths.get(faithId);
}

// ── Polity faith records ───────────────────────────────────────────────────────

/** Return all faith records for a polity (empty array if none). */
export function getPolityFaiths(registry: FaithRegistry, polityId: string): PolityFaith[] {
  return registry.polityFaiths.get(polityId) ?? [];
}

/**
 * Set the adherent fraction for a faith in a polity.
 * Creates the record if it does not exist; updates it if it does.
 * Clamps `adherents_Q` to [0, SCALE.Q].
 * Does NOT normalise other faiths — call `normalisePolitFaiths` if needed.
 */
export function setPolityFaith(
  registry:    FaithRegistry,
  polityId:    string,
  faithId:     FaithId,
  adherents_Q: Q,
): PolityFaith {
  const clamped = clampQ(adherents_Q, 0, SCALE.Q);
  let list = registry.polityFaiths.get(polityId);
  if (!list) { list = []; registry.polityFaiths.set(polityId, list); }
  const existing = list.find(pf => pf.faithId === faithId);
  if (existing) {
    existing.adherents_Q = clamped;
    return existing;
  }
  const pf: PolityFaith = { polityId, faithId, adherents_Q: clamped };
  list.push(pf);
  return pf;
}

/** Return the faith with the highest adherents in a polity, or `undefined`. */
export function getDominantFaith(
  registry: FaithRegistry,
  polityId: string,
): PolityFaith | undefined {
  const list = getPolityFaiths(registry, polityId);
  if (list.length === 0) return undefined;
  return list.reduce((best, pf) => pf.adherents_Q > best.adherents_Q ? pf : best);
}

/** Return `true` if both polities share the same dominant faithId. */
export function sharesDominantFaith(
  registry:  FaithRegistry,
  polityAId: string,
  polityBId: string,
): boolean {
  const a = getDominantFaith(registry, polityAId);
  const b = getDominantFaith(registry, polityBId);
  return a != null && b != null && a.faithId === b.faithId;
}

// ── Conversion mechanics ───────────────────────────────────────────────────────

/**
 * Compute the daily conversion pressure exerted on a target polity by a
 * source faith's missionaries.
 *
 * Formula:
 *   pressure = fervor_Q × missionaryPresence_Q × CONVERSION_BASE_RATE_Q / SCALE.Q²
 *
 * Returns 0 if the faith is not registered.
 *
 * @param missionaryPresence_Q  Strength of missionary activity [0, SCALE.Q].
 *                              Callers may derive this from Phase-82 agent presence
 *                              or Phase-83 trade route volume.
 */
export function computeConversionPressure(
  faith:                Faith,
  missionaryPresence_Q: Q,
): Q {
  const step1 = mulDiv(faith.fervor_Q, missionaryPresence_Q, SCALE.Q);
  return clampQ(mulDiv(step1, CONVERSION_BASE_RATE_Q, SCALE.Q), 0, SCALE.Q);
}

/**
 * Apply a conversion delta to a polity.
 *
 * **Exclusive faiths**: gaining `delta_Q` adherents displaces all other
 * *exclusive* faiths proportionally, preserving their relative sizes.
 * Non-exclusive faiths in the polity are unaffected.
 *
 * **Syncretic faiths**: delta is added directly; no displacement occurs.
 *
 * All adherent_Q values are clamped to [0, SCALE.Q] after adjustment.
 */
export function stepFaithConversion(
  registry: FaithRegistry,
  polityId: string,
  faithId:  FaithId,
  delta_Q:  Q,
): void {
  if (delta_Q === 0) return;

  const faith = registry.faiths.get(faithId);
  const list  = getPolityFaiths(registry, polityId);

  // Ensure target record exists
  let target = list.find(pf => pf.faithId === faithId);
  if (!target) {
    target = { polityId, faithId, adherents_Q: 0 as Q };
    list.push(target);
    if (!registry.polityFaiths.has(polityId)) registry.polityFaiths.set(polityId, list);
  }

  const newTarget = clampQ(target.adherents_Q + delta_Q, 0, SCALE.Q);
  const actualDelta = newTarget - target.adherents_Q;
  target.adherents_Q = newTarget;

  // Displace other exclusive faiths proportionally
  if (faith?.exclusive && actualDelta > 0) {
    const others = list.filter(pf => pf.faithId !== faithId && registry.faiths.get(pf.faithId)?.exclusive);
    const totalOther = others.reduce((s, pf) => s + pf.adherents_Q, 0);
    if (totalOther > 0) {
      for (const other of others) {
        const displaced = mulDiv(actualDelta, other.adherents_Q, totalOther);
        other.adherents_Q = clampQ(other.adherents_Q - displaced, 0, SCALE.Q);
      }
    }
  }
}

// ── Heresy risk ────────────────────────────────────────────────────────────────

/**
 * Compute the heresy risk in a polity [0, SCALE.Q].
 *
 * Risk is non-zero when:
 * - The dominant faith is exclusive and has low tolerance.
 * - A minority exclusive faith exceeds `HERESY_THRESHOLD_Q`.
 *
 * Formula: `(minorityPresence - HERESY_THRESHOLD) × (SCALE.Q - tolerance) / SCALE.Q`
 * summed over all qualifying minority faiths.
 */
export function computeHeresyRisk(registry: FaithRegistry, polityId: string): Q {
  const list     = getPolityFaiths(registry, polityId);
  const dominant = getDominantFaith(registry, polityId);
  if (!dominant) return 0 as Q;

  const domFaith = registry.faiths.get(dominant.faithId);
  if (!domFaith?.exclusive) return 0 as Q;  // syncretic dominants don't declare heresy

  let risk = 0;
  for (const pf of list) {
    if (pf.faithId === dominant.faithId) continue;
    const minFaith = registry.faiths.get(pf.faithId);
    if (!minFaith?.exclusive) continue;  // syncretic minorities are tolerated
    if (pf.adherents_Q <= HERESY_THRESHOLD_Q) continue;

    const excess     = pf.adherents_Q - HERESY_THRESHOLD_Q;
    const intolerance = SCALE.Q - domFaith.tolerance_Q;
    risk += mulDiv(excess, intolerance, SCALE.Q);
  }

  return clampQ(risk, 0, SCALE.Q);
}

// ── Diplomatic faith modifier ──────────────────────────────────────────────────

/**
 * Compute a signed Q diplomatic modifier from faith compatibility.
 *
 * - Shared dominant faith → `+FAITH_DIPLOMATIC_BONUS_Q`.
 * - Both polities have exclusive dominant faiths that differ → `−FAITH_DIPLOMATIC_PENALTY_Q`.
 * - Otherwise (syncretic or no dominant faith) → `0`.
 *
 * Hosts add this to treaty strength or faction standing adjustments.
 */
export function computeFaithDiplomaticModifier(
  registry:  FaithRegistry,
  polityAId: string,
  polityBId: string,
): number {
  const a = getDominantFaith(registry, polityAId);
  const b = getDominantFaith(registry, polityBId);
  if (!a || !b) return 0;

  if (a.faithId === b.faithId) return FAITH_DIPLOMATIC_BONUS_Q;

  const faithA = registry.faiths.get(a.faithId);
  const faithB = registry.faiths.get(b.faithId);
  if (faithA?.exclusive && faithB?.exclusive) return -FAITH_DIPLOMATIC_PENALTY_Q;

  return 0;
}
