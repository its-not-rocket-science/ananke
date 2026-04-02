/**
 * Phase 32C — Venom & Chemical Injection
 *
 * Models wound-injection venom: onset delay, per-second internal damage and fear
 * accumulation, duration, and antidote clearance.
 *
 * Follows the 1 Hz accumulator pattern from Phase 30 (nutrition). Called from the
 * kernel's runtimeState.nutritionAccum gate and from downtime.ts per-second loop.
 */

import { q, SCALE, type Q, clampQ } from "../units.js";
import type { Entity } from "./entity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VenomProfile {
  id:           string;
  name:         string;
  /** Seconds before symptoms begin (onset latency). */
  onsetDelay_s: number;
  /** Per-second internal damage as Q fraction of max internal health. */
  damageRate_Q: Q;
  /** Per-second fear increment while symptomatic. */
  fearRate_Q:   Q;
  /** Total duration without antidote [seconds]. */
  duration_s:   number;
  /** Antidote consumable id (matches a FOOD_ITEMS entry or equipment catalogue item). */
  antidoteId?:  string;
}

export interface ActiveVenom {
  profile:        VenomProfile;
  /** Accumulated seconds since injection (includes pre-onset time). */
  elapsedSeconds: number;
}

// ── Venom catalogue ───────────────────────────────────────────────────────────

export const VENOM_PROFILES: readonly VenomProfile[] = [
  {
    id:           "venom_insect",
    name:         "Insect venom",
    onsetDelay_s: 30,
    damageRate_Q: q(0.008) as Q,  // ~0.08% max internal/s → lethal in ~200s without aid
    fearRate_Q:   q(0.005) as Q,
    duration_s:   300,
  },
  {
    id:           "venom_snake",
    name:         "Serpent venom",
    onsetDelay_s: 60,
    damageRate_Q: q(0.012) as Q,  // ~0.12% max internal/s → lethal in ~140s without aid
    fearRate_Q:   q(0.010) as Q,
    duration_s:   600,
    antidoteId:   "antivenom",
  },
  {
    id:           "venom_paralytic",
    name:         "Paralytic toxin",
    onsetDelay_s: 10,
    damageRate_Q: q(0.003) as Q,  // low damage, but high fear and rapid onset
    fearRate_Q:   q(0.020) as Q,
    duration_s:   120,
    antidoteId:   "antivenom",
  },
] as const;

const VENOM_BY_ID = new Map(VENOM_PROFILES.map(v => [v.id, v]));

/** Look up a VenomProfile by id. Returns undefined if unknown. */
export function getVenomProfile(id: string): VenomProfile | undefined {
  return VENOM_BY_ID.get(id);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Advance all active venoms on an entity by `delta_s` seconds.
 *
 * Mutates:
 *   entity.activeVenoms (elapsedSeconds incremented; expired entries removed)
 *   entity.injury (torso internalDamage incremented per symptomatic venom)
 *   entity.condition.fearQ (incremented per symptomatic venom)
 */
export function stepToxicology(entity: Entity, delta_s: number): void {
  const venoms = entity.activeVenoms;
  if (!venoms || venoms.length === 0) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cond = entity.condition as any;
  const torsoRegion = entity.injury.byRegion?.["torso"];

  for (const av of venoms) {
    av.elapsedSeconds += delta_s;
    if (av.elapsedSeconds < av.profile.onsetDelay_s) continue;  // still pre-onset

    // Internal damage to torso (if body plan has torso; otherwise apply to shock)
    const dmgInc = Math.trunc(av.profile.damageRate_Q * delta_s);
    if (torsoRegion !== undefined) {
      torsoRegion.internalDamage = clampQ(
        (torsoRegion.internalDamage + dmgInc) as Q, q(0), q(1.0)
      );
    } else {
      // Fallback: apply as shock when no torso region
      entity.injury.shock = clampQ(
        (entity.injury.shock + dmgInc) as Q, q(0), q(1.0)
      );
    }

    // Fear increment
    const fearInc = Math.trunc(av.profile.fearRate_Q * delta_s);
    cond.fearQ = clampQ((cond.fearQ + fearInc) as Q, q(0), SCALE.Q);
  }

  // Remove expired entries
  entity.activeVenoms = venoms.filter(av => av.elapsedSeconds < av.profile.duration_s);
}

/**
 * Inject a venom into an entity by profile id.
 * Returns false if the id is unknown.
 */
export function injectVenom(entity: Entity, venomId: string): boolean {
  const profile = VENOM_BY_ID.get(venomId);
  if (!profile) return false;
  if (!entity.activeVenoms) entity.activeVenoms = [];
  entity.activeVenoms.push({ profile, elapsedSeconds: 0 });
  return true;
}

/**
 * Apply an antidote, clearing all active venoms that list the given item id.
 * Returns true if at least one venom was cleared.
 */
export function applyAntidote(entity: Entity, antidoteId: string): boolean {
  if (!entity.activeVenoms || entity.activeVenoms.length === 0) return false;
  const before = entity.activeVenoms.length;
  entity.activeVenoms = entity.activeVenoms.filter(
    av => av.profile.antidoteId !== antidoteId
  );
  return entity.activeVenoms.length < before;
}
