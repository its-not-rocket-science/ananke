// src/climate.ts — Phase 96: Climate Events & Natural Disasters
//
// Multi-day climate events affect polity populations, granaries, infrastructure,
// epidemic spread, and military campaigns.  This is distinct from Phase-51
// (tactical weather): Phase 96 operates at the polity/campaign timescale —
// weeks to seasons — rather than the second-to-second combat tick.
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `ClimateEvent` is an immutable descriptor; `ActiveClimateEvent` tracks progress.
//   - `computeClimateEffects` returns an advisory `ClimateEffects` bundle;
//     callers pass individual fields to Phase-86/87/88/89/90/93 as needed.
//   - `generateClimateEvent` uses `eventSeed` for deterministic random occurrence.
//   - Severity and duration determine effect magnitude; effects scale linearly with
//     severity via mulDiv.
//
// Integration:
//   Phase 86 (Demography):  deathPressure_Q elevated by drought/harsh_winter.
//   Phase 87 (Granary):     harvestYieldPenalty_Q reduces harvest output.
//   Phase 88 (Epidemic):    epidemicGrowthBonus_Q accelerates disease spread.
//   Phase 89 (Infra):       infrastructureDamage_Q models flood/earthquake damage.
//   Phase 90 (Unrest):      unrestPressure_Q adds to computeUnrestLevel factors.
//   Phase 93 (Campaign):    marchPenalty_Q reduces daily march progress.

import { eventSeed } from "./sim/seeds.js";
import { q, SCALE, clampQ } from "./units.js";
import type { Q }                    from "./units.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Classification of climate event. */
export type ClimateEventType =
  | "drought"
  | "flood"
  | "harsh_winter"
  | "earthquake"
  | "plague_season"
  | "locust_swarm";

/** Immutable descriptor for a climate event. */
export interface ClimateEvent {
  eventId:    string;
  type:       ClimateEventType;
  /**
   * Severity [0, SCALE.Q].  Scales all effect magnitudes.
   * q(0.30) = minor; q(0.60) = severe; q(0.90) = catastrophic.
   */
  severity_Q: Q;
  /**
   * Total duration in simulated days.
   * Remaining days tracked in `ActiveClimateEvent.remainingDays`.
   */
  durationDays: number;
}

/** Mutable tracking state for an ongoing climate event. */
export interface ActiveClimateEvent {
  event:         ClimateEvent;
  remainingDays: number;
  /** Total days this event has been active on this polity. */
  elapsedDays:   number;
}

/**
 * Advisory effect bundle derived from a climate event.
 * Pass individual fields into the relevant downstream phase calls.
 * All fields are [0, SCALE.Q] unless noted.
 */
export interface ClimateEffects {
  /** Extra famine death pressure for Phase-86 `deathPressure_Q`. */
  deathPressure_Q:        Q;
  /** Harvest yield penalty for Phase-87 `deriveHarvestYieldFactor`. */
  harvestYieldPenalty_Q:  Q;
  /** Epidemic growth bonus for Phase-88 `stepEpidemic` health capacity. */
  epidemicGrowthBonus_Q:  Q;
  /**
   * Infrastructure damage fraction per day for Phase-89.
   * Hosts subtract `investedCost × damage / SCALE.Q` from project progress.
   */
  infrastructureDamage_Q: Q;
  /** Extra unrest pressure for Phase-90 `computeUnrestLevel`. */
  unrestPressure_Q:       Q;
  /** March rate penalty for Phase-93 `stepCampaignMarch` road bonus reduction. */
  marchPenalty_Q:         Q;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Base effect magnitudes at full severity (q(1.0)) for each event type.
 * Actual effects = base × severity_Q / SCALE.Q.
 */
export const BASE_EFFECTS: Record<ClimateEventType, ClimateEffects> = {
  drought: {
    deathPressure_Q:        q(0.10) as Q,
    harvestYieldPenalty_Q:  q(0.60) as Q,  // major crop loss
    epidemicGrowthBonus_Q:  q(0.10) as Q,
    infrastructureDamage_Q: 0 as Q,
    unrestPressure_Q:       q(0.15) as Q,
    marchPenalty_Q:         0 as Q,
  },
  flood: {
    deathPressure_Q:        q(0.08) as Q,
    harvestYieldPenalty_Q:  q(0.40) as Q,
    epidemicGrowthBonus_Q:  q(0.20) as Q,  // waterborne disease
    infrastructureDamage_Q: q(0.05) as Q,  // per day
    unrestPressure_Q:       q(0.10) as Q,
    marchPenalty_Q:         q(0.30) as Q,  // mud impedes armies
  },
  harsh_winter: {
    deathPressure_Q:        q(0.08) as Q,
    harvestYieldPenalty_Q:  q(0.20) as Q,
    epidemicGrowthBonus_Q:  q(0.15) as Q,  // respiratory illness
    infrastructureDamage_Q: q(0.01) as Q,
    unrestPressure_Q:       q(0.08) as Q,
    marchPenalty_Q:         q(0.40) as Q,  // historical winter campaign penalty
  },
  earthquake: {
    deathPressure_Q:        q(0.15) as Q,  // immediate casualties
    harvestYieldPenalty_Q:  q(0.10) as Q,
    epidemicGrowthBonus_Q:  q(0.10) as Q,
    infrastructureDamage_Q: q(0.20) as Q,  // heavy structural damage
    unrestPressure_Q:       q(0.20) as Q,
    marchPenalty_Q:         q(0.10) as Q,
  },
  plague_season: {
    deathPressure_Q:        q(0.20) as Q,  // epidemic peak
    harvestYieldPenalty_Q:  q(0.15) as Q,  // insufficient labour
    epidemicGrowthBonus_Q:  q(0.40) as Q,  // primary driver
    infrastructureDamage_Q: 0 as Q,
    unrestPressure_Q:       q(0.18) as Q,
    marchPenalty_Q:         q(0.15) as Q,  // sick soldiers
  },
  locust_swarm: {
    deathPressure_Q:        q(0.05) as Q,
    harvestYieldPenalty_Q:  q(0.80) as Q,  // near-total crop destruction
    epidemicGrowthBonus_Q:  0 as Q,
    infrastructureDamage_Q: 0 as Q,
    unrestPressure_Q:       q(0.20) as Q,
    marchPenalty_Q:         0 as Q,
  },
};

/**
 * Typical duration ranges in days [min, max] for each event type.
 * Used by `generateClimateEvent` to set `durationDays`.
 */
export const EVENT_DURATION_RANGE: Record<ClimateEventType, [number, number]> = {
  drought:      [60,  180],
  flood:        [7,   30],
  harsh_winter: [30,  90],
  earthquake:   [1,   3],
  plague_season:[30,  120],
  locust_swarm: [7,   21],
};

/**
 * Daily probability of each event type triggering [Q].
 * Roll = `eventSeed(...) % SCALE.Q`; triggers when roll < dailyProb.
 *
 * These correspond to rough annual frequencies:
 *   harsh_winter: q(0.005) ≈ 0.5%/day ≈ ~50% chance within a year
 *   flood:        q(0.004) ≈ 0.4%/day ≈ ~40% within a year
 *   drought:      q(0.003) ≈ 0.3%/day
 *   plague_season:q(0.002) ≈ 0.2%/day
 *   locust_swarm: q(0.001) ≈ 0.1%/day
 *   earthquake:   q(0.0005)≈ 0.05%/day (rare)
 */
export const EVENT_DAILY_PROBABILITY_Q: Record<ClimateEventType, number> = {
  harsh_winter:  50,   // 50/10000 = 0.5% per day
  flood:         40,
  drought:       30,
  plague_season: 20,
  locust_swarm:  10,
  earthquake:     5,
};

// ── Factory ───────────────────────────────────────────────────────────────────

/** Create a `ClimateEvent` with explicit parameters. */
export function createClimateEvent(
  eventId:     string,
  type:        ClimateEventType,
  severity_Q:  Q,
  durationDays: number,
): ClimateEvent {
  return {
    eventId,
    type,
    severity_Q: clampQ(severity_Q, 0, SCALE.Q) as Q,
    durationDays: Math.max(1, durationDays),
  };
}

/** Start tracking an active climate event. */
export function activateClimateEvent(event: ClimateEvent): ActiveClimateEvent {
  return { event, remainingDays: event.durationDays, elapsedDays: 0 };
}

// ── Effect computation ────────────────────────────────────────────────────────

/**
 * Compute the `ClimateEffects` bundle for a given event at its current severity.
 *
 * Each field = `round(BASE_EFFECTS[type][field] × severity_Q / SCALE.Q)`.
 * Returns a zero bundle if `active.remainingDays <= 0`.
 */
export function computeClimateEffects(active: ActiveClimateEvent): ClimateEffects {
  if (active.remainingDays <= 0) {
    return zeroEffects();
  }
  const base = BASE_EFFECTS[active.event.type];
  const sev  = active.event.severity_Q;
  return {
    deathPressure_Q:        scale(base.deathPressure_Q,        sev),
    harvestYieldPenalty_Q:  scale(base.harvestYieldPenalty_Q,  sev),
    epidemicGrowthBonus_Q:  scale(base.epidemicGrowthBonus_Q,  sev),
    infrastructureDamage_Q: scale(base.infrastructureDamage_Q, sev),
    unrestPressure_Q:       scale(base.unrestPressure_Q,       sev),
    marchPenalty_Q:         scale(base.marchPenalty_Q,         sev),
  };
}

function scale(base: Q, severity_Q: Q): Q {
  return clampQ(Math.round(base * severity_Q / SCALE.Q), 0, SCALE.Q) as Q;
}

function zeroEffects(): ClimateEffects {
  return {
    deathPressure_Q:        0 as Q,
    harvestYieldPenalty_Q:  0 as Q,
    epidemicGrowthBonus_Q:  0 as Q,
    infrastructureDamage_Q: 0 as Q,
    unrestPressure_Q:       0 as Q,
    marchPenalty_Q:         0 as Q,
  };
}

// ── Event step ────────────────────────────────────────────────────────────────

/**
 * Advance an active climate event by `elapsedDays`.
 * Decrements `remainingDays` (floor at 0) and increments `elapsedDays`.
 * Returns `true` if the event has expired this step.
 */
export function stepClimateEvent(active: ActiveClimateEvent, elapsedDays: number): boolean {
  active.elapsedDays   += elapsedDays;
  active.remainingDays  = Math.max(0, active.remainingDays - elapsedDays);
  return active.remainingDays === 0;
}

/** Return true if the event has run its full duration. */
export function isClimateEventExpired(active: ActiveClimateEvent): boolean {
  return active.remainingDays <= 0;
}

// ── Random event generation ───────────────────────────────────────────────────

/**
 * Attempt to generate a random climate event for a polity on the given tick.
 *
 * Each event type is rolled independently.  Returns the first event whose
 * annual probability roll succeeds, or `undefined` if none trigger.
 *
 * Roll: `eventSeed(worldSeed, tick, polityHash, 0, typeSalt) % SCALE.Q`
 * vs daily probability = `round(annualProb / 365)`.
 *
 * @param polityHash  `hashString(polity.id)` from Phase-61.
 * @param worldSeed   World-level seed.
 * @param tick        Current simulation tick (day).
 */
export function generateClimateEvent(
  polityHash: number,
  worldSeed:  number,
  tick:       number,
): ClimateEvent | undefined {
  const types: ClimateEventType[] = [
    "harsh_winter", "flood", "drought", "plague_season", "locust_swarm", "earthquake",
  ];

  for (let i = 0; i < types.length; i++) {
    const type      = types[i] as ClimateEventType;
    const dailyProb = EVENT_DAILY_PROBABILITY_Q[type];

    const seed = eventSeed(worldSeed, tick, polityHash, 0, i + 1);
    const roll = seed % SCALE.Q;

    if (roll < dailyProb) {
      // Determine severity: another seed roll, maps to q(0.20)–q(0.90)
      const sevSeed = eventSeed(worldSeed, tick, polityHash, i + 1, 42);
      const sevRoll = sevSeed % SCALE.Q;
      const severity_Q = clampQ(q(0.20) + Math.round(sevRoll * q(0.70) / SCALE.Q), 0, SCALE.Q) as Q;

      // Duration: interpolate within the type's range
      const [minDays, maxDays] = EVENT_DURATION_RANGE[type];
      const durSeed  = eventSeed(worldSeed, tick, polityHash, i + 2, 7);
      const durRange = maxDays - minDays;
      const durationDays = minDays + (durSeed % (durRange + 1));

      const eventId = `${type}_${tick}_${polityHash % 10000}`;
      return createClimateEvent(eventId, type, severity_Q, durationDays);
    }
  }

  return undefined;
}

// ── Aggregate helpers ─────────────────────────────────────────────────────────

/**
 * Combine effects from multiple simultaneous active events (e.g. drought + locust).
 * Each field is summed and clamped to SCALE.Q.
 */
export function aggregateClimateEffects(actives: ActiveClimateEvent[]): ClimateEffects {
  let death = 0, harvest = 0, epidemic = 0, infra = 0, unrest = 0, march = 0;

  for (const active of actives) {
    const fx = computeClimateEffects(active);
    death    += fx.deathPressure_Q;
    harvest  += fx.harvestYieldPenalty_Q;
    epidemic += fx.epidemicGrowthBonus_Q;
    infra    += fx.infrastructureDamage_Q;
    unrest   += fx.unrestPressure_Q;
    march    += fx.marchPenalty_Q;
  }

  return {
    deathPressure_Q:        clampQ(death,    0, SCALE.Q) as Q,
    harvestYieldPenalty_Q:  clampQ(harvest,  0, SCALE.Q) as Q,
    epidemicGrowthBonus_Q:  clampQ(epidemic, 0, SCALE.Q) as Q,
    infrastructureDamage_Q: clampQ(infra,    0, SCALE.Q) as Q,
    unrestPressure_Q:       clampQ(unrest,   0, SCALE.Q) as Q,
    marchPenalty_Q:         clampQ(march,    0, SCALE.Q) as Q,
  };
}
