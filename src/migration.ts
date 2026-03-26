// src/migration.ts — Phase 81: Migration & Displacement
//
// Population movement between polities driven by push factors (instability,
// low morale, active war, feudal oppression) and pull factors (prosperity,
// stability). Integrates with Phase 61 (Polity), Phase 79 (Feudal), and
// Phase 80 (Diplomacy) without importing any of them directly — callers
// pass pre-computed context values.
//
// Design:
//   - Pure computation layer — no Entity fields, no kernel changes.
//   - `computePushPressure` and `computePullFactor` are the two primitives.
//   - `computeMigrationFlow` derives the daily migrant count for a directed pair.
//   - `resolveMigration` collects all flows above the threshold.
//   - `applyMigrationFlows` mutates Polity population fields.

import type { Polity }         from "./polity.js";
import type { PolityRegistry } from "./polity.js";
import { SCALE, q, clampQ, mulDiv } from "./units.js";
import type { Q }              from "./units.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A resolved population transfer from one polity to another. */
export interface MigrationFlow {
  fromPolityId: string;
  toPolityId:   string;
  /** Positive integer — number of people moving. */
  population:   number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Stability below this contributes to push pressure.
 * A polity at q(0.40) stability has zero stability push; below it, pressure rises.
 */
export const MIGRATION_PUSH_STABILITY_THRESHOLD: Q = q(0.40);

/**
 * Morale below this contributes to push pressure.
 */
export const MIGRATION_PUSH_MORALE_THRESHOLD: Q = q(0.40);

/**
 * Feudal bond strength below this contributes to push pressure.
 * Vassals under an oppressive liege (weak bonds) bleed population.
 */
export const MIGRATION_PUSH_FEUDAL_THRESHOLD: Q = q(0.30);

/**
 * Flat push bonus added when the polity is in an active war.
 * Represents war refugees and general insecurity.
 */
export const MIGRATION_WAR_PUSH_Q: Q = q(0.20);

/**
 * Fraction of the source polity's population that migrates per simulated day
 * at full combined pressure and full destination pull.
 * q(0.001) = 0.1 % per day maximum.
 */
export const MIGRATION_DAILY_RATE_Q: Q = q(0.001);

/**
 * Minimum push pressure required for migration to occur.
 * Prevents trickle migration from perfectly stable polities.
 */
export const MIGRATION_PUSH_MIN_Q: Q = q(0.05);

// ── Core computation ───────────────────────────────────────────────────────────

/**
 * Compute the push pressure of a polity — how strongly it repels its own
 * population. Returns a Q in [0, SCALE.Q].
 *
 * @param polity           Source polity.
 * @param isAtWar          True if the polity has any active war (Phase 61).
 * @param lowestBondStr_Q  Weakest feudal bond as vassal, or SCALE.Q if not a vassal (Phase 79).
 */
export function computePushPressure(
  polity:          Polity,
  isAtWar:         boolean = false,
  lowestBondStr_Q: Q = SCALE.Q as Q,
): Q {
  const stabilityDeficit = Math.max(0, MIGRATION_PUSH_STABILITY_THRESHOLD - polity.stabilityQ);
  const moraleDeficit    = Math.max(0, MIGRATION_PUSH_MORALE_THRESHOLD    - polity.moraleQ);
  const warBonus         = isAtWar ? MIGRATION_WAR_PUSH_Q : 0;
  const feudalDeficit    = Math.max(0, MIGRATION_PUSH_FEUDAL_THRESHOLD - lowestBondStr_Q);
  return clampQ(stabilityDeficit + moraleDeficit + warBonus + feudalDeficit, 0, SCALE.Q);
}

/**
 * Compute the pull factor of a polity — how attractive it is as a destination.
 * Pull = `stabilityQ × moraleQ / SCALE.Q` — both must be high to attract migrants.
 * Returns a Q in [0, SCALE.Q].
 */
export function computePullFactor(polity: Polity): Q {
  return clampQ(mulDiv(polity.stabilityQ, polity.moraleQ, SCALE.Q), 0, SCALE.Q);
}

/**
 * Compute the number of people that would migrate from `from` to `to` in one
 * simulated day, given pre-computed push and pull values.
 *
 * Formula (integer arithmetic throughout):
 *   combined_Q = push_Q × pull_Q / SCALE.Q
 *   scaledPop  = population × combined_Q / SCALE.Q
 *   flow       = floor(scaledPop × DAILY_RATE_Q / SCALE.Q)
 *
 * Returns 0 if push < `MIGRATION_PUSH_MIN_Q`, pull ≤ 0, or from.population ≤ 0.
 */
export function computeMigrationFlow(
  from:   Polity,
  to:     Polity,
  push_Q: Q,
  pull_Q: Q,
): number {
  if (push_Q < MIGRATION_PUSH_MIN_Q) return 0;
  if (pull_Q <= 0)                   return 0;
  if (from.population <= 0)          return 0;
  if (from.id === to.id)             return 0;

  const combined_Q  = mulDiv(push_Q, pull_Q, SCALE.Q);
  const scaledPop   = mulDiv(from.population, combined_Q, SCALE.Q);
  const flow        = Math.floor(scaledPop * MIGRATION_DAILY_RATE_Q / SCALE.Q);
  return flow;
}

// ── Resolution helpers ─────────────────────────────────────────────────────────

/**
 * Optional per-polity context for migration resolution.
 * Callers supply war/feudal context without this module needing to import
 * PolityRegistry or FeudalRegistry.
 */
export interface MigrationContext {
  polityId:        string;
  isAtWar?:        boolean;
  lowestBondStr_Q?: Q;
}

/**
 * Resolve all migration flows for one simulated day across the provided
 * polities. Returns a flat list of `MigrationFlow` objects with `population > 0`.
 *
 * The caller should pass all polities that may send or receive migrants.
 * Flows are not applied here — call `applyMigrationFlows` to mutate state.
 *
 * @param polities  Array of candidate polities.
 * @param context   Optional per-polity war / feudal context keyed by polityId.
 */
export function resolveMigration(
  polities: Polity[],
  context:  Map<string, MigrationContext> = new Map(),
): MigrationFlow[] {
  const flows: MigrationFlow[] = [];

  for (const from of polities) {
    const ctx    = context.get(from.id);
    const push_Q = computePushPressure(
      from,
      ctx?.isAtWar ?? false,
      ctx?.lowestBondStr_Q ?? (SCALE.Q as Q),
    );
    if (push_Q < MIGRATION_PUSH_MIN_Q) continue;

    for (const to of polities) {
      if (to.id === from.id) continue;
      const pull_Q = computePullFactor(to);
      const n      = computeMigrationFlow(from, to, push_Q, pull_Q);
      if (n > 0) flows.push({ fromPolityId: from.id, toPolityId: to.id, population: n });
    }
  }

  return flows;
}

/**
 * Apply a list of migration flows to the polity registry.
 * Mutates `population` on both sending and receiving polities.
 * The actual population moved is clamped to the sender's current population
 * to prevent negative populations.
 *
 * Unknown polity IDs in a flow are silently skipped.
 */
export function applyMigrationFlows(
  registry: PolityRegistry,
  flows:    MigrationFlow[],
): void {
  for (const flow of flows) {
    const from = registry.polities.get(flow.fromPolityId);
    const to   = registry.polities.get(flow.toPolityId);
    if (!from || !to) continue;
    const actual = Math.min(flow.population, from.population);
    if (actual <= 0) continue;
    from.population -= actual;
    to.population   += actual;
  }
}

/**
 * Compute the net annual population change due to migration for a polity,
 * expressed as a fraction of its current population.
 *
 * Positive = net immigration (pull exceeds push).
 * Negative = net emigration (push exceeds pull).
 *
 * Useful for AI and diplomatic decision-making.
 */
export function estimateNetMigrationRate(
  polityId:   string,
  flows:      MigrationFlow[],
  population: number,
): number {
  if (population <= 0) return 0;
  let net = 0;
  for (const f of flows) {
    if (f.fromPolityId === polityId) net -= f.population;
    if (f.toPolityId   === polityId) net += f.population;
  }
  return net / population;
}
