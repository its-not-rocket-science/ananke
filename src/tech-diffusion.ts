// src/tech-diffusion.ts — Phase 67: Technology Diffusion at Polity Scale
//
// Technology eras spread from more-advanced polities to less-advanced neighbours
// via trade routes and cultural contact.  Each day, for every pair where one
// polity leads the other by at least one era, the lagging polity rolls for a
// chance to advance — exactly one era at a time, never skipping.
//
// Diffusion pressure scales with:
//   - era gap          : larger gaps produce stronger "pull" (knowledge gradient)
//   - route quality    : better navigators carry ideas faster (Phase 61 routeQuality_Q)
//   - shared locations : more border crossings → more cultural contact
//   - war              : active war between the pair sets diffusion to 0
//   - stability        : unstable polities are poor hosts for new ideas
//
// Historically grounded: trade routes (Silk Road, Mediterranean, Hanseatic League)
// were the primary vector for technology transfer in the pre-modern world.
// Model source: Bockstette, Chanda & Putterman (2002) "States and Markets: The
// Advantage of an Early Start".
//
// Phase hooks:
//   Phase 61 (Polity, PolityPair, areAtWar) — registry and route graph
//   Phase 11C (TechEra) — 9-era progression 0 (Prehistoric) → 8 (DeepSpace)

import { q, clampQ, qMul, SCALE, type Q }            from "./units.js";
import { eventSeed, hashString }                       from "./sim/seeds.js";
import { makeRng }                                     from "./rng.js";
import type { Polity, PolityRegistry, PolityPair }     from "./polity.js";
import { areAtWar, deriveMilitaryStrength }            from "./polity.js";
import { TechEra }                                     from "./sim/tech.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum tech era index (DeepSpace = 8). */
export const MAX_TECH_ERA: number = TechEra.DeepSpace;

/**
 * Base daily probability of era advance when the era gap is 1 and route quality
 * is q(0.50) and there is one shared location.  At this rate a lagging polity
 * advances roughly once per 200 days (~7 months) under median conditions.
 */
export const BASE_DIFFUSION_RATE_Q: Q = q(0.005) as Q;

/**
 * Multiplier applied per additional era of gap beyond 1.
 * At gap=2: ×1.5×; gap=3: ×2.0×; capped at gap=4 (×2.5×).
 * Ensures large knowledge gradients trigger faster catch-up.
 */
export const ERA_GAP_BONUS_Q: Q = q(0.50) as Q;

/** Maximum era-gap bonus (caps at gap=4 → ×3.0× the base). */
export const ERA_GAP_BONUS_MAX: Q = q(2.00) as Q;

/**
 * Route quality contributes up to this multiplier on top of the base rate.
 * routeQuality_Q = q(1.0) → +100% boost → 2× base rate.
 */
export const ROUTE_QUALITY_MUL_MAX: Q = q(1.00) as Q;

/**
 * Each additional shared location beyond 1 adds this fractional bonus.
 * e.g., 3 shared locations → +2 × q(0.20) = +40% of base rate.
 */
export const SHARED_LOCATION_BONUS: Q = q(0.20) as Q;

/** Maximum combined bonus from shared locations (caps at 5 locations). */
export const SHARED_LOCATION_MAX: Q = q(0.80) as Q;

/**
 * Stability threshold below which a polity cannot absorb new technology.
 * Unstable societies are too disorganised to institutionalise advances.
 */
export const STABILITY_DIFFUSION_THRESHOLD: Q = q(0.25) as Q;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Outcome of a single polity's tech advance in one day-tick. */
export interface TechDiffusionResult {
  polityId:        string;
  previousTechEra: number;
  newTechEra:      number;
}

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Compute the daily diffusion pressure (probability of era advance) that the
 * `source` polity exerts on the `target` via one `pair`.
 *
 * Returns q(0) when:
 * - `source.techEra <= target.techEra`  (no gradient)
 * - `target.stabilityQ < STABILITY_DIFFUSION_THRESHOLD` (target is unstable)
 * - `warActive === true` (war disrupts cultural contact)
 *
 * Otherwise returns a Q in (0, SCALE.Q] representing the per-day probability
 * of the target advancing one era.  The caller rolls against this value.
 */
export function computeDiffusionPressure(
  source:    Polity,
  target:    Polity,
  pair:      PolityPair,
  warActive: boolean,
): Q {
  if (warActive) return q(0) as Q;
  if (source.techEra <= target.techEra) return q(0) as Q;
  if (target.stabilityQ < STABILITY_DIFFUSION_THRESHOLD) return q(0) as Q;

  // Era gap bonus: 0 for gap=1, +ERA_GAP_BONUS_Q per additional gap, capped
  const gap        = source.techEra - target.techEra;
  const gapBonus   = clampQ(ERA_GAP_BONUS_Q * (gap - 1), 0, ERA_GAP_BONUS_MAX) as Q;
  const gapMul     = (SCALE.Q + gapBonus) as Q;

  // Route quality bonus: routeQuality scales from 0 → ROUTE_QUALITY_MUL_MAX bonus
  const routeBonus  = qMul(pair.routeQuality_Q, ROUTE_QUALITY_MUL_MAX);
  const routeMul    = (SCALE.Q + routeBonus) as Q;

  // Shared locations bonus: extra locations beyond 1 add fractional boost
  const extraLocs   = Math.max(0, pair.sharedLocations - 1);
  const locBonus    = clampQ(SHARED_LOCATION_BONUS * extraLocs, 0, SHARED_LOCATION_MAX) as Q;
  const locMul      = (SCALE.Q + locBonus) as Q;

  // Combine: base × gapMul × routeMul × locMul (all ÷ SCALE.Q after each multiply)
  const step1 = qMul(BASE_DIFFUSION_RATE_Q, gapMul);
  const step2 = qMul(step1, routeMul);
  const step3 = qMul(step2, locMul);

  return clampQ(step3, 0, SCALE.Q) as Q;
}

// ── Day step ──────────────────────────────────────────────────────────────────

/**
 * Advance technology through the polity pair graph for one simulated day.
 *
 * For each pair, checks both directions (A→B and B→A) and rolls against
 * `computeDiffusionPressure`.  A polity that advances during this step is
 * not eligible to advance again in the same tick (one advance per tick max).
 *
 * Mutates `polity.techEra` (and refreshes `militaryStrength_Q`) for any
 * polity that advances.
 *
 * Returns a `TechDiffusionResult[]` for every polity that advanced this tick.
 */
export function stepTechDiffusion(
  registry:  PolityRegistry,
  pairs:     ReadonlyArray<PolityPair>,
  worldSeed: number,
  tick:      number,
): TechDiffusionResult[] {
  const advanced = new Set<string>();   // prevent double-advance per tick
  const results:  TechDiffusionResult[] = [];

  for (const pair of pairs) {
    const polityA = registry.polities.get(pair.polityAId);
    const polityB = registry.polities.get(pair.polityBId);
    if (!polityA || !polityB) continue;

    const atWar = areAtWar(registry, pair.polityAId, pair.polityBId);

    // Check both directions
    for (const [source, target] of [[polityA, polityB], [polityB, polityA]] as const) {
      if (advanced.has(target.id)) continue;
      if (target.techEra >= MAX_TECH_ERA) continue;

      const pressure = computeDiffusionPressure(source, target, pair, atWar);
      if (pressure <= 0) continue;

      // Deterministic roll
      const salt   = hashString(source.id) ^ hashString(target.id);
      const seed   = eventSeed(worldSeed, tick, hashString(source.id), hashString(target.id), salt);
      const rng    = makeRng(seed, SCALE.Q);
      const roll   = rng.q01();

      if (roll < pressure) {
        const prev = target.techEra;
        target.techEra = (target.techEra + 1) as typeof target.techEra;
        deriveMilitaryStrength(target);
        advanced.add(target.id);
        results.push({ polityId: target.id, previousTechEra: prev, newTechEra: target.techEra });
      }
    }
  }

  return results;
}

// ── Query helpers ─────────────────────────────────────────────────────────────

/**
 * Compute the net inbound diffusion pressure on a single polity from all its
 * neighbours in the pair graph.  Useful for AI queries ("how likely is this
 * polity to advance soon?").
 *
 * War pairs are excluded.  Pressure values are summed (uncapped).
 */
export function totalInboundPressure(
  polityId:  string,
  registry:  PolityRegistry,
  pairs:     ReadonlyArray<PolityPair>,
): Q {
  const target = registry.polities.get(polityId);
  if (!target) return q(0) as Q;

  let total = 0;
  for (const pair of pairs) {
    let sourceId: string | null = null;
    if (pair.polityAId === polityId) sourceId = pair.polityBId;
    else if (pair.polityBId === polityId) sourceId = pair.polityAId;
    if (!sourceId) continue;

    const source = registry.polities.get(sourceId);
    if (!source) continue;

    const atWar = areAtWar(registry, polityId, sourceId);
    total += computeDiffusionPressure(source, target, pair, atWar);
  }
  return clampQ(total, 0, SCALE.Q) as Q;
}

/**
 * Return the set of tech-era names available for a given era index.
 * Useful for display in tools and reports.
 */
export function techEraName(era: number): string {
  const names = [
    "Prehistoric", "Ancient", "Medieval", "EarlyModern",
    "Industrial", "Modern", "NearFuture", "FarFuture", "DeepSpace",
  ];
  return names[era] ?? `Era${era}`;
}
