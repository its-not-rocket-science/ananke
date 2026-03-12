// src/sim/disease.ts — Phase 56: Disease & Epidemic Simulation
//
// Extends wound-level infection (Phase 9 / `infectedTick`) with entity-to-entity
// disease transmission. Suitable for downtime (campaign-scale) or continuous
// epidemic simulation in populated worlds.
//
// Three tiers:
//   1. Entity state — DiseaseState (per active disease) + ImmunityRecord (post-recovery)
//   2. Per-entity step — stepDiseaseForEntity: advances phase timers, applies fatigue,
//      rolls mortality on recovery, grants immunity.
//   3. Transmission — computeTransmissionRisk: distance-based risk Q;
//      spreadDisease: deterministic batch exposure using eventSeed.
//
// Six disease profiles span fantasy-medieval and speculative scenarios:
//   common_fever  wound_fever  plague_pneumonic  dysentery  marsh_fever  wasting_sickness

import { q, clampQ, SCALE, type Q } from "../units.js";
import { eventSeed } from "./seeds.js";
import type { Entity } from "./entity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Transmission route determines how distance affects spread. */
export type TransmissionRoute = "airborne" | "contact" | "vector" | "waterborne";

/** Declarative disease profile. */
export interface DiseaseProfile {
  id:                    string;
  name:                  string;
  transmissionRoute:     TransmissionRoute;
  /** Daily probability of spreading from symptomatic carrier to unprotected susceptible [Q]. */
  baseTransmissionRate_Q: Q;
  /** Seconds before symptoms appear. */
  incubationPeriod_s:    number;
  /** Seconds of active symptoms (measured from end of incubation). */
  symptomaticDuration_s: number;
  /** Probability of death at end of symptomatic phase [Q]. */
  mortalityRate_Q:       Q;
  /** Daily fatigue drain while symptomatic [Q/day]. */
  symptomSeverity_Q:     Q;
  /**
   * Max airborne range [SCALE.m]. Only used when transmissionRoute === "airborne".
   * Risk falls linearly to zero at this distance.
   */
  airborneRange_Sm:      number;
  /**
   * Immunity granted after recovery [seconds].
   * -1 = permanent; 0 = no immunity (can be reinfected immediately).
   */
  immunityDuration_s:    number;
}

/** One active disease infection on an entity. */
export interface DiseaseState {
  diseaseId:      string;
  /** "incubating" = latent, no symptoms; "symptomatic" = full symptoms active. */
  phase:          "incubating" | "symptomatic";
  /** Seconds elapsed in the current phase. */
  elapsedSeconds: number;
}

/** Post-recovery immunity record preventing re-infection. */
export interface ImmunityRecord {
  diseaseId:        string;
  /** Remaining seconds of immunity; -1 = permanent. */
  remainingSeconds: number;
}

/** Result returned by `stepDiseaseForEntity`. */
export interface EntityDiseaseResult {
  /** Disease IDs that transitioned from incubating → symptomatic this step. */
  advancedToSymptomatic: string[];
  /** Disease IDs that ended this step (recovered or fatal). */
  recovered:             string[];
  /** True if a mortality roll was triggered and the entity died this step. */
  died:                  boolean;
  /** Total Q units added to entity.energy.fatigue this step. */
  fatigueApplied:        number;
}

/** A carrier–target pair supplied by the host's spatial query. */
export interface NearbyPair {
  carrierId: number;
  targetId:  number;
  /** Distance between the two entities [SCALE.m]. */
  dist_Sm:   number;
}

/** Result returned by `spreadDisease`. */
export interface SpreadResult {
  /** Number of new exposures applied this call. */
  newExposures: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum distance for contact/vector/waterborne transmission [SCALE.m]. */
export const CONTACT_RANGE_Sm = 20_000;  // 2 m

/** Common-fever airborne range [SCALE.m]. */
const FEVER_AIRBORNE_Sm = 100_000;  // 10 m

/** Plague airborne range [SCALE.m]. */
const PLAGUE_AIRBORNE_Sm = 50_000;  // 5 m

// ── Disease Catalogue ─────────────────────────────────────────────────────────

/**
 * Common fever — mild respiratory infection.
 * Airborne, short duration, no mortality. Short-lived immunity (90 days).
 */
const COMMON_FEVER: DiseaseProfile = {
  id:                     "common_fever",
  name:                   "Common Fever",
  transmissionRoute:      "airborne",
  baseTransmissionRate_Q: q(0.30),
  incubationPeriod_s:     86_400,           // 1 day
  symptomaticDuration_s:  3 * 86_400,       // 3 days
  mortalityRate_Q:        q(0),
  symptomSeverity_Q:      q(0.10),
  airborneRange_Sm:       FEVER_AIRBORNE_Sm,
  immunityDuration_s:     90 * 86_400,      // 90 days
};

/**
 * Wound fever — arises from contact with infected individuals or open wounds.
 * Moderate severity; 5 % mortality.  Permanent immunity.
 */
const WOUND_FEVER: DiseaseProfile = {
  id:                     "wound_fever",
  name:                   "Wound Fever",
  transmissionRoute:      "contact",
  baseTransmissionRate_Q: q(0.15),
  incubationPeriod_s:     2 * 86_400,       // 2 days
  symptomaticDuration_s:  7 * 86_400,       // 7 days
  mortalityRate_Q:        q(0.05),
  symptomSeverity_Q:      q(0.20),
  airborneRange_Sm:       0,
  immunityDuration_s:     -1,               // permanent
};

/**
 * Pneumonic plague — severe airborne variant.
 * High transmission, 60 % mortality. Permanent immunity in survivors.
 */
const PLAGUE_PNEUMONIC: DiseaseProfile = {
  id:                     "plague_pneumonic",
  name:                   "Pneumonic Plague",
  transmissionRoute:      "airborne",
  baseTransmissionRate_Q: q(0.80),
  incubationPeriod_s:     86_400,           // 1 day
  symptomaticDuration_s:  10 * 86_400,      // 10 days
  mortalityRate_Q:        q(0.60),
  symptomSeverity_Q:      q(0.50),
  airborneRange_Sm:       PLAGUE_AIRBORNE_Sm,
  immunityDuration_s:     -1,               // permanent
};

/**
 * Dysentery — waterborne/contact, highly debilitating.
 * 10 % mortality; no lasting immunity (can be reinfected).
 */
const DYSENTERY: DiseaseProfile = {
  id:                     "dysentery",
  name:                   "Dysentery",
  transmissionRoute:      "waterborne",
  baseTransmissionRate_Q: q(0.40),
  incubationPeriod_s:     86_400,           // 1 day
  symptomaticDuration_s:  14 * 86_400,      // 14 days
  mortalityRate_Q:        q(0.10),
  symptomSeverity_Q:      q(0.30),
  airborneRange_Sm:       0,
  immunityDuration_s:     0,                // no immunity
};

/**
 * Marsh fever — vector-borne (insects), recurring.
 * Chronic fatigue; 3 % mortality; short-lived immunity (30 days).
 */
const MARSH_FEVER: DiseaseProfile = {
  id:                     "marsh_fever",
  name:                   "Marsh Fever",
  transmissionRoute:      "vector",
  baseTransmissionRate_Q: q(0.20),
  incubationPeriod_s:     7 * 86_400,       // 7 days
  symptomaticDuration_s:  5 * 86_400,       // 5 days
  mortalityRate_Q:        q(0.03),
  symptomSeverity_Q:      q(0.25),
  airborneRange_Sm:       0,
  immunityDuration_s:     30 * 86_400,      // 30 days
};

/**
 * Wasting sickness — slow-onset, prolonged contact-spread disease.
 * High fatigue drain; 25 % mortality; long-lived immunity (180 days).
 */
const WASTING_SICKNESS: DiseaseProfile = {
  id:                     "wasting_sickness",
  name:                   "Wasting Sickness",
  transmissionRoute:      "contact",
  baseTransmissionRate_Q: q(0.05),
  incubationPeriod_s:     14 * 86_400,      // 14 days
  symptomaticDuration_s:  30 * 86_400,      // 30 days
  mortalityRate_Q:        q(0.25),
  symptomSeverity_Q:      q(0.35),
  airborneRange_Sm:       0,
  immunityDuration_s:     180 * 86_400,     // 180 days
};

/** All disease profiles indexed by id. */
export const DISEASE_PROFILES: DiseaseProfile[] = [
  COMMON_FEVER,
  WOUND_FEVER,
  PLAGUE_PNEUMONIC,
  DYSENTERY,
  MARSH_FEVER,
  WASTING_SICKNESS,
];

const _PROFILE_MAP = new Map(DISEASE_PROFILES.map(p => [p.id, p]));

/** Look up a disease profile by id. Returns undefined for unknown ids. */
export function getDiseaseProfile(id: string): DiseaseProfile | undefined {
  return _PROFILE_MAP.get(id);
}

// ── Entity-level API ──────────────────────────────────────────────────────────

/**
 * Attempt to expose an entity to a disease.
 *
 * Returns false (no-op) if:
 *   - The disease id is unknown.
 *   - The entity already has an active infection with this disease.
 *   - The entity has a valid (non-expired) immunity record for this disease.
 *
 * Otherwise creates an incubating DiseaseState and returns true.
 * Does NOT perform a probability roll — the caller (e.g. `spreadDisease`) is
 * responsible for rolling before calling this function.
 *
 * Mutates: `entity.activeDiseases`.
 */
export function exposeToDisease(entity: Entity, diseaseId: string): boolean {
  if (!getDiseaseProfile(diseaseId)) return false;

  // Already infected?
  if (entity.activeDiseases?.some(d => d.diseaseId === diseaseId)) return false;

  // Immune?
  const immune = entity.immunity?.some(
    r => r.diseaseId === diseaseId && (r.remainingSeconds === -1 || r.remainingSeconds > 0),
  );
  if (immune) return false;

  if (!entity.activeDiseases) entity.activeDiseases = [];
  entity.activeDiseases.push({
    diseaseId,
    phase:          "incubating",
    elapsedSeconds: 0,
  });
  return true;
}

/**
 * Advance all active diseases on an entity by `delta_s` seconds.
 *
 * For each active disease:
 *   - Incubating → symptomatic when elapsedSeconds ≥ incubationPeriod_s.
 *   - Symptomatic: drain fatigue at `symptomSeverity_Q × delta_s / 86400`.
 *   - Symptomatic → ended when elapsedSeconds ≥ symptomaticDuration_s:
 *       roll mortality via eventSeed; if fatal set `entity.injury.dead = true`.
 *       If survivor, grant immunity (duration per profile).
 *
 * Also ticks down temporary immunity timers.
 *
 * Mutates: `entity.activeDiseases`, `entity.immunity`, `entity.energy.fatigue`,
 *          `entity.injury.dead`.
 *
 * @param worldSeed  World seed for deterministic mortality roll.
 * @param tick       Current tick for deterministic mortality roll.
 */
export function stepDiseaseForEntity(
  entity:    Entity,
  delta_s:   number,
  worldSeed: number,
  tick:      number,
): EntityDiseaseResult {
  const result: EntityDiseaseResult = {
    advancedToSymptomatic: [],
    recovered:             [],
    died:                  false,
    fatigueApplied:        0,
  };

  if (entity.injury.dead) return result;

  // ── Tick immunity timers ──────────────────────────────────────────────────
  if (entity.immunity) {
    for (const r of entity.immunity) {
      if (r.remainingSeconds > 0) {
        r.remainingSeconds = Math.max(0, r.remainingSeconds - delta_s);
      }
    }
  }

  if (!entity.activeDiseases?.length) return result;

  const toRemove: string[] = [];

  for (const state of entity.activeDiseases) {
    const profile = getDiseaseProfile(state.diseaseId);
    if (!profile) { toRemove.push(state.diseaseId); continue; }

    state.elapsedSeconds += delta_s;

    if (state.phase === "incubating") {
      if (state.elapsedSeconds >= profile.incubationPeriod_s) {
        state.phase          = "symptomatic";
        state.elapsedSeconds -= profile.incubationPeriod_s;
        result.advancedToSymptomatic.push(state.diseaseId);
      }
    }

    if (state.phase === "symptomatic") {
      // Apply daily fatigue drain
      const fatigueInc = Math.round(profile.symptomSeverity_Q * delta_s / 86_400);
      if (fatigueInc > 0) {
        entity.energy.fatigue = clampQ(
          (entity.energy.fatigue + fatigueInc) as Q, q(0) as Q, SCALE.Q as Q,
        );
        result.fatigueApplied += fatigueInc;
      }

      // Recover when symptomatic duration is reached
      if (state.elapsedSeconds >= profile.symptomaticDuration_s) {
        toRemove.push(state.diseaseId);
        result.recovered.push(state.diseaseId);

        // Mortality roll — deterministic via eventSeed
        const salt = diseaseIdSalt(state.diseaseId);
        const roll = eventSeed(worldSeed, tick, entity.id, 0, salt) % SCALE.Q;
        if (roll < profile.mortalityRate_Q) {
          entity.injury.dead = true;
          result.died = true;
          continue; // no immunity needed if dead
        }

        // Grant immunity
        if (profile.immunityDuration_s !== 0) {
          if (!entity.immunity) entity.immunity = [];
          entity.immunity.push({
            diseaseId:        state.diseaseId,
            remainingSeconds: profile.immunityDuration_s, // -1 = permanent
          });
        }
      }
    }
  }

  // Remove ended diseases
  if (toRemove.length > 0) {
    entity.activeDiseases = entity.activeDiseases.filter(
      d => !toRemove.includes(d.diseaseId),
    );
  }

  return result;
}

// ── Transmission ──────────────────────────────────────────────────────────────

/**
 * Compute the transmission risk Q from a symptomatic carrier to a target.
 *
 * Airborne: risk scales linearly from `baseTransmissionRate_Q` at dist 0
 *   to 0 at `airborneRange_Sm`.  Beyond range → q(0).
 * Contact / vector / waterborne: full `baseTransmissionRate_Q` if within
 *   `CONTACT_RANGE_Sm`; q(0) beyond.
 *
 * Returns q(0) if the carrier has no symptomatic instance of this disease,
 * or if target already has immunity / active infection for this disease.
 *
 * @param carrier    The potentially infectious entity.
 * @param target     The potentially susceptible entity.
 * @param dist_Sm    Distance between them [SCALE.m].
 * @param disease    The disease profile to evaluate.
 */
export function computeTransmissionRisk(
  carrier:  Entity,
  target:   Entity,
  dist_Sm:  number,
  disease:  DiseaseProfile,
): Q {
  // Carrier must be symptomatic with this disease
  const carrierState = carrier.activeDiseases?.find(
    d => d.diseaseId === disease.id && d.phase === "symptomatic",
  );
  if (!carrierState) return q(0) as Q;

  // Target already infected?
  if (target.activeDiseases?.some(d => d.diseaseId === disease.id)) return q(0) as Q;

  // Target immune?
  const immune = target.immunity?.some(
    r => r.diseaseId === disease.id && (r.remainingSeconds === -1 || r.remainingSeconds > 0),
  );
  if (immune) return q(0) as Q;

  if (disease.transmissionRoute === "airborne") {
    if (disease.airborneRange_Sm <= 0 || dist_Sm >= disease.airborneRange_Sm) return q(0) as Q;
    const proximity_Q = Math.round(
      (disease.airborneRange_Sm - dist_Sm) * SCALE.Q / disease.airborneRange_Sm,
    );
    return Math.round(disease.baseTransmissionRate_Q * proximity_Q / SCALE.Q) as Q;
  }

  // contact / vector / waterborne: flat risk within CONTACT_RANGE
  if (dist_Sm > CONTACT_RANGE_Sm) return q(0) as Q;
  return disease.baseTransmissionRate_Q;
}

/**
 * Attempt to spread disease across a set of nearby entity pairs.
 *
 * For each pair the host has identified as spatially close:
 *   - Evaluates all symptomatic diseases on the carrier.
 *   - Rolls `eventSeed(worldSeed, tick, carrierId, targetId, diseaseIdSalt)`.
 *   - If roll < transmissionRisk_Q × SCALE.Q, calls `exposeToDisease`.
 *
 * Deterministic: identical inputs → identical outputs.
 *
 * @param entityMap  Map of entity id → Entity (must include all ids in pairs).
 * @param pairs      Carrier–target pairs with their SCALE.m distances (from host spatial query).
 * @param worldSeed  World seed for eventSeed.
 * @param tick       Current tick for eventSeed.
 * @returns          Number of new exposures created.
 */
export function spreadDisease(
  entityMap: Map<number, Entity>,
  pairs:     NearbyPair[],
  worldSeed: number,
  tick:      number,
): SpreadResult {
  let newExposures = 0;

  for (const pair of pairs) {
    const carrier = entityMap.get(pair.carrierId);
    const target  = entityMap.get(pair.targetId);
    if (!carrier || !target) continue;
    if (carrier.injury.dead || target.injury.dead) continue;
    if (!carrier.activeDiseases?.length) continue;

    for (const state of carrier.activeDiseases) {
      if (state.phase !== "symptomatic") continue;
      const profile = getDiseaseProfile(state.diseaseId);
      if (!profile) continue;

      const risk_Q = computeTransmissionRisk(carrier, target, pair.dist_Sm, profile);
      if (risk_Q <= 0) continue;

      const salt = diseaseIdSalt(state.diseaseId);
      const roll = eventSeed(worldSeed, tick, pair.carrierId, pair.targetId, salt) % SCALE.Q;
      if (roll < risk_Q) {
        if (exposeToDisease(target, state.diseaseId)) {
          newExposures++;
        }
      }
    }
  }

  return { newExposures };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Stable numeric salt from a disease id string (sum of char codes & 0xFFFFFF). */
function diseaseIdSalt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) & 0xFFFFFF;
  return h;
}
