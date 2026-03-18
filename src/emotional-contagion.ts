// src/emotional-contagion.ts — Phase 65: Emotional Contagion at Polity Scale
//
// Fear and hope propagate between polities using the same transmission model
// as Phase 56 disease spread, with `fear_Q` / `hope_Q` as the "pathogen".
//
// Design:
//   1. EmotionalContagionProfile  — transmission rate, valence, decay, amplitude
//   2. EmotionalWave              — active event (battle rout, rally speech) with
//                                   decaying intensity; multiple waves can stack
//   3. computeEmotionalSpread()   — risk Q between a source and adjacent polity
//   4. applyEmotionalContagion()  — batch spread + morale delta application
//   5. stepEmotionalWaves()       — daily decay; expired waves removed
//   6. Convenience triggers       — triggerMilitaryRout, triggerVictoryRally,
//                                   triggerLeaderAddress, triggerPlaguePanic
//
// The host calls applyEmotionalContagion once per polity day-tick (alongside
// stepPolityDay and computePolityDiseaseSpread).  No Entity import — this
// module operates purely at the Polity / PolityRegistry level.
//
// Four built-in profiles:
//   military_rout       — fear; fast spread, fast decay
//   plague_panic        — fear; moderate spread, slow decay
//   victory_rally       — hope; moderate spread, medium decay
//   charismatic_address — hope; leader-amplified, short-range, fast decay
//
// Phase 39 hook: leaderPerformance_Q amplifies the initial wave intensity
// of a charismatic_address event via triggerLeaderAddress().

import { q, clampQ, qMul, SCALE, type Q } from "./units.js";
import { eventSeed, hashString }           from "./sim/seeds.js";
import { makeRng }                          from "./rng.js";
import type { PolityRegistry, PolityPair }  from "./polity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Whether the emotional wave helps or harms morale. */
export type EmotionalValence = "fear" | "hope";

/**
 * Declarative profile for an emotional contagion event.
 * Mirrors DiseaseProfile structure for API consistency.
 */
export interface EmotionalContagionProfile {
  id:   string;
  name: string;
  /** "fear" drains moraleQ; "hope" restores it. */
  valence: EmotionalValence;
  /**
   * Daily transmission probability to each adjacent polity [0, SCALE.Q].
   * Rolled against eventSeed; analogous to DiseaseProfile.baseTransmissionRate_Q.
   */
  baseTransmissionRate_Q: Q;
  /**
   * Fraction of wave intensity lost per day [0, SCALE.Q].
   * At q(1.0) the wave expires in one tick.
   */
  decayRate_Q: Q;
  /**
   * Maximum moraleQ change applied to a polity per day [0, SCALE.Q].
   * Scaled by the effective wave intensity × transmission success.
   */
  maxMoraleDelta_Q: Q;
  /**
   * Multiplier applied to initial wave intensity when a leader with high
   * musical/performance intelligence triggers the event (Phase 39 hook).
   * 0 = no amplification; q(1.0) = up to 2× base intensity.
   */
  leaderAmplification_Q: Q;
}

/**
 * An active emotional event originating from one polity.
 * Decays each day; removed when intensity_Q reaches 0.
 */
export interface EmotionalWave {
  profileId:       string;
  /** The polity that originated the event (battle loss, speech, etc.). */
  sourcePolityId:  string;
  /** Current intensity [0, SCALE.Q]. Decays by decayRate_Q each day. */
  intensity_Q:     Q;
  /** Number of day-ticks this wave has been active. */
  daysActive:      number;
}

/** Per-polity morale delta produced by one batch of contagion spread. */
export interface ContagionResult {
  polityId:     string;
  moraleDelta_Q: Q;   // positive = gained morale (hope); negative = lost (fear)
}

// ── Built-in profiles ─────────────────────────────────────────────────────────

/** Heavy defeat in the field triggers mass panic. Spreads fast, decays fast. */
export const PROFILE_MILITARY_ROUT: EmotionalContagionProfile = {
  id:                     "military_rout",
  name:                   "Military Rout",
  valence:                "fear",
  baseTransmissionRate_Q: q(0.60) as Q,
  decayRate_Q:            q(0.18) as Q,  // ~5-day half-life
  maxMoraleDelta_Q:       q(0.08) as Q,
  leaderAmplification_Q:  q(0) as Q,
};

/** Plague outbreak news spreads slowly but persists. */
export const PROFILE_PLAGUE_PANIC: EmotionalContagionProfile = {
  id:                     "plague_panic",
  name:                   "Plague Panic",
  valence:                "fear",
  baseTransmissionRate_Q: q(0.40) as Q,
  decayRate_Q:            q(0.05) as Q,  // ~20-day half-life
  maxMoraleDelta_Q:       q(0.05) as Q,
  leaderAmplification_Q:  q(0) as Q,
};

/** Victory news bolsters allied and neutral neighbours. */
export const PROFILE_VICTORY_RALLY: EmotionalContagionProfile = {
  id:                     "victory_rally",
  name:                   "Victory Rally",
  valence:                "hope",
  baseTransmissionRate_Q: q(0.45) as Q,
  decayRate_Q:            q(0.10) as Q,  // ~10-day half-life
  maxMoraleDelta_Q:       q(0.04) as Q,
  leaderAmplification_Q:  q(0.50) as Q,
};

/** A charismatic leader's speech rallies citizens directly. */
export const PROFILE_CHARISMATIC_ADDRESS: EmotionalContagionProfile = {
  id:                     "charismatic_address",
  name:                   "Charismatic Address",
  valence:                "hope",
  baseTransmissionRate_Q: q(0.30) as Q,
  decayRate_Q:            q(0.25) as Q,  // ~4-day half-life (fades quickly)
  maxMoraleDelta_Q:       q(0.10) as Q,
  leaderAmplification_Q:  q(1.00) as Q,  // leader skill doubles wave impact
};

/** All built-in profiles, indexed by id. */
export const EMOTIONAL_PROFILES: ReadonlyArray<EmotionalContagionProfile> = [
  PROFILE_MILITARY_ROUT,
  PROFILE_PLAGUE_PANIC,
  PROFILE_VICTORY_RALLY,
  PROFILE_CHARISMATIC_ADDRESS,
];

/** Look up a profile by id. Returns undefined if unknown. */
export function getEmotionalProfile(id: string): EmotionalContagionProfile | undefined {
  return EMOTIONAL_PROFILES.find(p => p.id === id);
}

// ── Wave management ────────────────────────────────────────────────────────────

/**
 * Create a new emotional wave at full intensity.
 * Pass `leaderPerformance_Q` > 0 to amplify the initial intensity
 * (effective only when the profile has leaderAmplification_Q > 0).
 */
export function createEmotionalWave(
  profile:             EmotionalContagionProfile,
  sourcePolityId:      string,
  leaderPerformance_Q: Q = q(0) as Q,
): EmotionalWave {
  // amplification = base + leaderPerformance_Q × leaderAmplification_Q / SCALE.Q
  // capped at SCALE.Q so intensity stays in [0, SCALE.Q]
  const amplification = qMul(leaderPerformance_Q, profile.leaderAmplification_Q);
  const intensity_Q   = clampQ(SCALE.Q + amplification, 0, SCALE.Q * 2) as Q;
  // clamp to SCALE.Q for the wave field
  const clamped       = clampQ(intensity_Q, 0, SCALE.Q) as Q;
  return { profileId: sourcePolityId, sourcePolityId, intensity_Q: clamped, daysActive: 0 };
}

/** @internal Used by tests and convenience triggers. */
export function _makeWave(
  profile:             EmotionalContagionProfile,
  sourcePolityId:      string,
  leaderPerformance_Q: Q = q(0) as Q,
): EmotionalWave {
  const amplification = qMul(leaderPerformance_Q, profile.leaderAmplification_Q);
  const raw           = SCALE.Q + amplification;
  const intensity_Q   = clampQ(raw, 0, SCALE.Q) as Q;
  return {
    profileId:      profile.id,
    sourcePolityId,
    intensity_Q,
    daysActive:     0,
  };
}

/**
 * Advance all active waves by one day: increment daysActive, apply decay.
 * Returns the updated array with expired waves (intensity_Q === 0) removed.
 *
 * Does NOT modify the input array — returns a new array.
 */
export function stepEmotionalWaves(
  waves:   ReadonlyArray<EmotionalWave>,
  profiles: ReadonlyArray<EmotionalContagionProfile>,
): EmotionalWave[] {
  const result: EmotionalWave[] = [];
  for (const wave of waves) {
    const profile = profiles.find(p => p.id === wave.profileId);
    const decayRate = profile?.decayRate_Q ?? (q(0.10) as Q);
    const decayed   = qMul(wave.intensity_Q, SCALE.Q - decayRate as Q);
    const newIntensity = clampQ(decayed, 0, SCALE.Q) as Q;
    if (newIntensity > 0) {
      result.push({ ...wave, intensity_Q: newIntensity, daysActive: wave.daysActive + 1 });
    }
  }
  return result;
}

// ── Spread computation ─────────────────────────────────────────────────────────

/**
 * Compute the morale delta a source wave inflicts on one adjacent target polity.
 *
 * Returns 0 if:
 * - The source polity is not in the registry
 * - The deterministic roll misses (no transmission)
 *
 * The sign of the returned Q matches the transmission direction — callers
 * should negate it for "fear" valence before applying to `moraleQ`.
 * (Positive return always means "some effect occurred"; valence is handled
 * by `applyEmotionalContagion`.)
 */
export function computeEmotionalSpread(
  sourcePolityId: string,
  targetPolityId: string,
  wave:           EmotionalWave,
  profile:        EmotionalContagionProfile,
  worldSeed:      number,
  tick:           number,
): Q {
  if (sourcePolityId === targetPolityId) return q(0) as Q;

  // Transmission roll — identical salt scheme to Phase 56
  const salt = hashString(profile.id);
  const seed = eventSeed(worldSeed, tick, hashString(sourcePolityId),
                         hashString(targetPolityId), salt);
  const rng  = makeRng(seed, SCALE.Q);
  const roll = rng.q01();

  // Effective rate: base × wave intensity
  const effectiveRate = qMul(profile.baseTransmissionRate_Q, wave.intensity_Q);
  if (roll > effectiveRate) return q(0) as Q;

  // Morale delta: maxDelta × (effectiveRate / SCALE.Q)
  const delta = Math.round(profile.maxMoraleDelta_Q * effectiveRate / SCALE.Q) as Q;
  return clampQ(delta, 0, profile.maxMoraleDelta_Q) as Q;
}

// ── Batch application ──────────────────────────────────────────────────────────

/**
 * Apply all active emotional waves to the polity registry for one day-tick.
 *
 * For each wave, iterates all PolityPairs where the source polity appears.
 * Calls `computeEmotionalSpread` for each neighbour polity.
 * Applies the resulting morale delta (negative for fear, positive for hope)
 * directly to `polity.moraleQ`, clamped to [0, SCALE.Q].
 *
 * Also applies the wave directly to the SOURCE polity at full intensity
 * (the originating polity is always affected before it spreads outward).
 *
 * Returns a `ContagionResult[]` listing every polity that was affected.
 * Polities with zero net delta are omitted.
 */
export function applyEmotionalContagion(
  registry:  PolityRegistry,
  pairs:     ReadonlyArray<PolityPair>,
  waves:     ReadonlyArray<EmotionalWave>,
  profiles:  ReadonlyArray<EmotionalContagionProfile>,
  worldSeed: number,
  tick:      number,
): ContagionResult[] {
  if (waves.length === 0) return [];

  // Accumulate per-polity morale deltas (signed: positive = hope, negative = fear)
  const deltas = new Map<string, number>();

  const applyDelta = (polityId: string, signed: number): void => {
    deltas.set(polityId, (deltas.get(polityId) ?? 0) + signed);
  };

  for (const wave of waves) {
    const profile = profiles.find(p => p.id === wave.profileId);
    if (!profile) continue;

    const sign = profile.valence === "fear" ? -1 : 1;

    // Source polity always receives the full wave intensity as a direct morale hit
    const sourceDelta = Math.round(profile.maxMoraleDelta_Q * wave.intensity_Q / SCALE.Q);
    applyDelta(wave.sourcePolityId, sign * sourceDelta);

    // Spread to adjacent polities via pairs
    for (const pair of pairs) {
      let targetId: string | null = null;
      if (pair.polityAId === wave.sourcePolityId) targetId = pair.polityBId;
      else if (pair.polityBId === wave.sourcePolityId) targetId = pair.polityAId;
      if (!targetId) continue;

      const spread = computeEmotionalSpread(
        wave.sourcePolityId, targetId, wave, profile, worldSeed, tick,
      );
      if (spread > 0) {
        applyDelta(targetId, sign * spread);
      }
    }
  }

  // Apply accumulated deltas to registry and build result list
  const results: ContagionResult[] = [];
  for (const [polityId, delta] of deltas) {
    if (delta === 0) continue;
    const polity = registry.polities.get(polityId);
    if (!polity) continue;
    const newMorale = clampQ(polity.moraleQ + delta, 0, SCALE.Q) as Q;
    polity.moraleQ = newMorale;
    results.push({ polityId, moraleDelta_Q: delta as Q });
  }
  return results;
}

// ── Convenience triggers ───────────────────────────────────────────────────────

/**
 * A polity's army has been routed.  Creates a MILITARY_ROUT fear wave at the
 * source polity at full base intensity (no leader amplification for defeats).
 */
export function triggerMilitaryRout(sourcePolityId: string): EmotionalWave {
  return _makeWave(PROFILE_MILITARY_ROUT, sourcePolityId);
}

/**
 * Plague outbreak confirmed in a polity.  Creates a PLAGUE_PANIC fear wave.
 */
export function triggerPlaguePanic(sourcePolityId: string): EmotionalWave {
  return _makeWave(PROFILE_PLAGUE_PANIC, sourcePolityId);
}

/**
 * A decisive military victory.  Creates a VICTORY_RALLY hope wave, optionally
 * amplified by the commander's performance intelligence (Phase 39 hook).
 *
 * @param leaderPerformance_Q  Commander's musical/intrapersonal mean [0, SCALE.Q].
 *                             Pass q(0) for a leaderless victory.
 */
export function triggerVictoryRally(
  sourcePolityId:      string,
  leaderPerformance_Q: Q = q(0) as Q,
): EmotionalWave {
  return _makeWave(PROFILE_VICTORY_RALLY, sourcePolityId, leaderPerformance_Q);
}

/**
 * A charismatic leader addresses the populace.  Uses CHARISMATIC_ADDRESS profile;
 * `leaderPerformance_Q` amplifies wave intensity (Phase 39 hook).
 *
 * @param leaderPerformance_Q  Leader's musical/intrapersonal mean [0, SCALE.Q].
 */
export function triggerLeaderAddress(
  sourcePolityId:      string,
  leaderPerformance_Q: Q,
): EmotionalWave {
  return _makeWave(PROFILE_CHARISMATIC_ADDRESS, sourcePolityId, leaderPerformance_Q);
}

/**
 * Check whether a wave has fully decayed (intensity === 0).
 */
export function isWaveExpired(wave: EmotionalWave): boolean {
  return wave.intensity_Q <= 0;
}

/**
 * Summarise the net emotional pressure across all active waves for a polity.
 * Returns a signed Q: positive = net hope, negative = net fear.
 * Useful for AI queries ("is this polity in panic?").
 */
export function netEmotionalPressure(
  polityId: string,
  waves:    ReadonlyArray<EmotionalWave>,
  profiles: ReadonlyArray<EmotionalContagionProfile>,
): Q {
  let total = 0;
  for (const wave of waves) {
    if (wave.sourcePolityId !== polityId) continue;
    const profile = profiles.find(p => p.id === wave.profileId);
    if (!profile) continue;
    const signed = profile.valence === "fear" ? -wave.intensity_Q : wave.intensity_Q;
    total += signed;
  }
  return clampQ(total, -SCALE.Q, SCALE.Q) as Q;
}
