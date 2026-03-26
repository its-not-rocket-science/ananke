// src/diplomacy.ts — Phase 80: Diplomacy & Treaties
//
// Formal agreements between polities. Each treaty has a type, strength,
// optional expiry, and optional tribute clause. Strength decays over time
// and recovers via upholding the terms. Breaking a treaty adds infamy to
// the breaker's renown record (Phase 75).
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `TreatyRegistry` is external to PolityRegistry; hosts maintain both.
//   - Treaty keys are canonical (sorted polity IDs) so order doesn't matter.
//   - `isTreatyExpired` is a host responsibility: expired treaties should be
//     removed or renewed each tick.

import type { RenownRegistry } from "./renown.js";
import { getRenownRecord }     from "./renown.js";
import { q, SCALE, clampQ }   from "./units.js";
import type { Q }              from "./units.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Category of diplomatic agreement. */
export type TreatyType =
  | "non_aggression"    // mutual pledge not to attack; lightest form
  | "trade_pact"        // preferential trade terms; moderate benefit
  | "peace"             // formal end to hostilities; moderate strength
  | "military_alliance" // mutual defence commitment; strongest bond
  | "royal_marriage";   // dynastic tie; personal and political

/**
 * A bilateral diplomatic agreement between two polities.
 * Stored in `TreatyRegistry`; keyed by canonical sorted pair + type.
 */
export interface Treaty {
  /** Opaque unique id (host-assigned or from `treatyKey`). */
  treatyId:       string;
  polityAId:      string;
  polityBId:      string;
  type:           TreatyType;
  /** Agreement health [0, SCALE.Q]. Below `TREATY_FRAGILE_THRESHOLD` → at risk. */
  strength_Q:     Q;
  /** Simulation tick when signed. */
  signedTick:     number;
  /**
   * Tick when treaty expires. `-1` = permanent until broken.
   * Hosts should call `isTreatyExpired` each tick and remove or renew.
   */
  expiryTick:     number;
  /**
   * Annual tribute from polityA to polityB as a fraction of polityA treasury.
   * `0` = no tribute clause. Range [0, SCALE.Q].
   */
  tributeFromA_Q: Q;
  /**
   * Annual tribute from polityB to polityA as a fraction of polityB treasury.
   * `0` = no tribute clause. Range [0, SCALE.Q].
   */
  tributeFromB_Q: Q;
}

/** Registry of all active treaties. */
export interface TreatyRegistry {
  treaties: Map<string, Treaty>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Treaty strength below this → `isTreatyFragile` returns true. */
export const TREATY_FRAGILE_THRESHOLD: Q = q(0.20);

/** Base strength at signing per treaty type. */
export const TREATY_BASE_STRENGTH: Record<TreatyType, Q> = {
  military_alliance: q(0.80),
  royal_marriage:    q(0.75),
  peace:             q(0.60),
  non_aggression:    q(0.55),
  trade_pact:        q(0.50),
};

/** Daily strength decay per treaty type (per simulated day). */
export const TREATY_DECAY_PER_DAY: Record<TreatyType, Q> = {
  military_alliance: q(0.001),  // very slow — costly to abandon
  royal_marriage:    q(0.001),
  peace:             q(0.002),
  non_aggression:    q(0.003),
  trade_pact:        q(0.002),
};

/**
 * Infamy added to the breaker's renown record on treaty violation.
 * Military alliances carry the gravest penalty; trade pacts the lightest.
 */
export const TREATY_BREAK_INFAMY: Record<TreatyType, Q> = {
  military_alliance: q(0.25),
  royal_marriage:    q(0.20),
  peace:             q(0.15),
  non_aggression:    q(0.10),
  trade_pact:        q(0.05),
};

// ── Factory ───────────────────────────────────────────────────────────────────

export function createTreatyRegistry(): TreatyRegistry {
  return { treaties: new Map() };
}

// ── Key helpers ───────────────────────────────────────────────────────────────

/**
 * Canonical treaty key — independent of argument order.
 * Polity IDs are sorted lexicographically so `key(A,B,t) === key(B,A,t)`.
 */
export function treatyKey(polityAId: string, polityBId: string, type: TreatyType): string {
  const [lo, hi] = polityAId < polityBId
    ? [polityAId, polityBId]
    : [polityBId, polityAId];
  return `${lo}:${hi}:${type}`;
}

// ── Treaty management ─────────────────────────────────────────────────────────

/**
 * Sign a new treaty between two polities and register it.
 * If a treaty of the same type between the same pair already exists it is
 * replaced (renewal).
 *
 * @param tick            Current simulation tick (day).
 * @param durationTicks   How many ticks the treaty lasts; `-1` = permanent.
 * @param tributeFromA_Q  Annual tribute fraction from A to B (default 0).
 * @param tributeFromB_Q  Annual tribute fraction from B to A (default 0).
 */
export function signTreaty(
  registry:       TreatyRegistry,
  polityAId:      string,
  polityBId:      string,
  type:           TreatyType,
  tick:           number = 0,
  durationTicks:  number = -1,
  tributeFromA_Q: Q = 0 as Q,
  tributeFromB_Q: Q = 0 as Q,
): Treaty {
  const key = treatyKey(polityAId, polityBId, type);
  const treaty: Treaty = {
    treatyId:       key,
    polityAId,
    polityBId,
    type,
    strength_Q:     TREATY_BASE_STRENGTH[type],
    signedTick:     tick,
    expiryTick:     durationTicks < 0 ? -1 : tick + durationTicks,
    tributeFromA_Q,
    tributeFromB_Q,
  };
  registry.treaties.set(key, treaty);
  return treaty;
}

/** Return the treaty between two polities of the given type, or `undefined`. */
export function getTreaty(
  registry:  TreatyRegistry,
  polityAId: string,
  polityBId: string,
  type:      TreatyType,
): Treaty | undefined {
  return registry.treaties.get(treatyKey(polityAId, polityBId, type));
}

/** Return all active treaties involving `polityId` (as either party). */
export function getActiveTreaties(
  registry: TreatyRegistry,
  polityId: string,
): Treaty[] {
  return [...registry.treaties.values()].filter(
    t => t.polityAId === polityId || t.polityBId === polityId,
  );
}

// ── Expiry ────────────────────────────────────────────────────────────────────

/**
 * Return `true` if the treaty has expired at `currentTick`.
 * Permanent treaties (`expiryTick === -1`) never expire.
 */
export function isTreatyExpired(treaty: Treaty, currentTick: number): boolean {
  return treaty.expiryTick !== -1 && currentTick >= treaty.expiryTick;
}

// ── Strength dynamics ─────────────────────────────────────────────────────────

/**
 * Advance treaty strength by one simulated day.
 * Decays at `TREATY_DECAY_PER_DAY[type]`; `boostDelta_Q` is an optional
 * signed daily bonus (e.g., tribute paid, joint victory, diplomatic summit).
 * Mutates `treaty.strength_Q`.
 */
export function stepTreatyStrength(
  treaty:       Treaty,
  boostDelta_Q: Q = 0 as Q,
): void {
  const decay = TREATY_DECAY_PER_DAY[treaty.type];
  treaty.strength_Q = clampQ(
    treaty.strength_Q - decay + boostDelta_Q,
    0,
    SCALE.Q,
  );
}

/**
 * Reinforce a treaty by a fixed delta (e.g., after a tribute payment, joint
 * military victory, or diplomatic summit). Clamps to [0, SCALE.Q].
 */
export function reinforceTreaty(treaty: Treaty, deltaQ: Q): void {
  treaty.strength_Q = clampQ(treaty.strength_Q + deltaQ, 0, SCALE.Q);
}

/** Return `true` if treaty strength is below `TREATY_FRAGILE_THRESHOLD`. */
export function isTreatyFragile(treaty: Treaty): boolean {
  return treaty.strength_Q < TREATY_FRAGILE_THRESHOLD;
}

// ── Treaty breaking ───────────────────────────────────────────────────────────

/**
 * Break a treaty and remove it from the registry.
 * Adds `TREATY_BREAK_INFAMY[type]` to `breakerRulerId`'s renown record
 * if `breakerRulerId` and `renownRegistry` are provided.
 *
 * @returns `true` if a treaty was found and removed; `false` otherwise.
 */
export function breakTreaty(
  registry:        TreatyRegistry,
  polityAId:       string,
  polityBId:       string,
  type:            TreatyType,
  breakerRulerId?: number,
  renownRegistry?: RenownRegistry,
): boolean {
  const key    = treatyKey(polityAId, polityBId, type);
  const treaty = registry.treaties.get(key);
  if (!treaty) return false;

  if (breakerRulerId != null && renownRegistry != null) {
    const record = getRenownRecord(renownRegistry, breakerRulerId);
    record.infamy_Q = clampQ(
      record.infamy_Q + TREATY_BREAK_INFAMY[type],
      0,
      SCALE.Q,
    );
  }

  registry.treaties.delete(key);
  return true;
}

// ── Diplomatic prestige ───────────────────────────────────────────────────────

/**
 * Compute the diplomatic prestige of a polity as the sum of `strength_Q`
 * of all its active treaties, normalised to [0, SCALE.Q].
 *
 * Hosts should pass only non-expired treaties; this function does no
 * expiry filtering.
 */
export function computeDiplomaticPrestige(
  registry: TreatyRegistry,
  polityId: string,
): Q {
  const treaties = getActiveTreaties(registry, polityId);
  if (treaties.length === 0) return 0 as Q;
  const total = treaties.reduce((sum, t) => sum + t.strength_Q, 0);
  return clampQ(total, 0, SCALE.Q);
}

/**
 * Return `true` if the two polities have at least one active treaty of any type.
 */
export function areInAnyTreaty(
  registry:  TreatyRegistry,
  polityAId: string,
  polityBId: string,
): boolean {
  return [...registry.treaties.values()].some(
    t =>
      (t.polityAId === polityAId && t.polityBId === polityBId) ||
      (t.polityAId === polityBId && t.polityBId === polityAId),
  );
}
