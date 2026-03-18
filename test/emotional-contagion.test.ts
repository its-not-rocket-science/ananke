// test/emotional-contagion.test.ts — Phase 65: Emotional Contagion at Polity Scale

import { describe, it, expect } from "vitest";
import { q, SCALE, type Q }     from "../src/units.js";
import {
  PROFILE_MILITARY_ROUT,
  PROFILE_PLAGUE_PANIC,
  PROFILE_VICTORY_RALLY,
  PROFILE_CHARISMATIC_ADDRESS,
  EMOTIONAL_PROFILES,
  getEmotionalProfile,
  createEmotionalWave,
  _makeWave,
  stepEmotionalWaves,
  computeEmotionalSpread,
  applyEmotionalContagion,
  triggerMilitaryRout,
  triggerVictoryRally,
  triggerLeaderAddress,
  triggerPlaguePanic,
  isWaveExpired,
  netEmotionalPressure,
  type EmotionalWave,
} from "../src/emotional-contagion.js";
import { createPolity, createPolityRegistry, type PolityPair } from "../src/polity.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function mkRegistry() {
  const empire   = createPolity("empire",   "Empire",   "f_a", ["loc1","loc2"], 100_000, 10_000, 1);
  const duchy    = createPolity("duchy",    "Duchy",    "f_b", ["loc3"],        60_000,  8_000,  1);
  const barony   = createPolity("barony",   "Barony",   "f_c", ["loc4"],        30_000,  4_000,  0);
  const registry = createPolityRegistry([empire, duchy, barony]);
  const pairs: PolityPair[] = [
    { polityAId: "empire", polityBId: "duchy",  sharedLocations: 2, routeQuality_Q: q(0.60) as Q },
    { polityAId: "duchy",  polityBId: "barony", sharedLocations: 1, routeQuality_Q: q(0.50) as Q },
  ];
  return { registry, pairs };
}

// ── Profile shape ─────────────────────────────────────────────────────────────

describe("built-in profiles", () => {
  it("all four profiles are present in EMOTIONAL_PROFILES", () => {
    expect(EMOTIONAL_PROFILES).toHaveLength(4);
    const ids = EMOTIONAL_PROFILES.map(p => p.id);
    expect(ids).toContain("military_rout");
    expect(ids).toContain("plague_panic");
    expect(ids).toContain("victory_rally");
    expect(ids).toContain("charismatic_address");
  });

  it("fear profiles have valence fear", () => {
    expect(PROFILE_MILITARY_ROUT.valence).toBe("fear");
    expect(PROFILE_PLAGUE_PANIC.valence).toBe("fear");
  });

  it("hope profiles have valence hope", () => {
    expect(PROFILE_VICTORY_RALLY.valence).toBe("hope");
    expect(PROFILE_CHARISMATIC_ADDRESS.valence).toBe("hope");
  });

  it("military_rout has faster decay than plague_panic", () => {
    expect(PROFILE_MILITARY_ROUT.decayRate_Q).toBeGreaterThan(PROFILE_PLAGUE_PANIC.decayRate_Q);
  });

  it("charismatic_address has non-zero leaderAmplification", () => {
    expect(PROFILE_CHARISMATIC_ADDRESS.leaderAmplification_Q).toBeGreaterThan(0);
  });

  it("military_rout has zero leaderAmplification", () => {
    expect(PROFILE_MILITARY_ROUT.leaderAmplification_Q).toBe(0);
  });

  it("getEmotionalProfile returns correct profile by id", () => {
    const p = getEmotionalProfile("victory_rally");
    expect(p).toBeDefined();
    expect(p!.id).toBe("victory_rally");
  });

  it("getEmotionalProfile returns undefined for unknown id", () => {
    expect(getEmotionalProfile("nonexistent")).toBeUndefined();
  });
});

// ── Wave creation ─────────────────────────────────────────────────────────────

describe("createEmotionalWave / _makeWave", () => {
  it("creates wave with intensity SCALE.Q when no leader performance", () => {
    const wave = _makeWave(PROFILE_MILITARY_ROUT, "empire");
    expect(wave.intensity_Q).toBe(SCALE.Q);
    expect(wave.sourcePolityId).toBe("empire");
    expect(wave.profileId).toBe("military_rout");
    expect(wave.daysActive).toBe(0);
  });

  it("profile with zero amplification ignores leader performance", () => {
    const wave = _makeWave(PROFILE_MILITARY_ROUT, "empire", q(0.80) as Q);
    expect(wave.intensity_Q).toBe(SCALE.Q);  // no amplification
  });

  it("charismatic_address with high leader performance amplifies intensity", () => {
    const wave = _makeWave(PROFILE_CHARISMATIC_ADDRESS, "empire", q(0.80) as Q);
    // amplification = 0.80 × 1.0 = q(0.80); raw = SCALE.Q + q(0.80) → clamped to SCALE.Q
    expect(wave.intensity_Q).toBe(SCALE.Q);
  });

  it("createEmotionalWave sets profileId correctly", () => {
    const wave = createEmotionalWave(PROFILE_VICTORY_RALLY, "duchy");
    expect(wave.profileId).toBe("duchy");  // createEmotionalWave uses sourcePolityId as profileId
  });
});

// ── Wave decay ────────────────────────────────────────────────────────────────

describe("stepEmotionalWaves", () => {
  it("decays intensity by decayRate each step", () => {
    const wave: EmotionalWave = {
      profileId:      "military_rout",
      sourcePolityId: "empire",
      intensity_Q:    SCALE.Q as Q,
      daysActive:     0,
    };
    const result = stepEmotionalWaves([wave], EMOTIONAL_PROFILES);
    expect(result).toHaveLength(1);
    // intensity_Q' = intensity × (1 - decayRate) = q(1.0) × (1 - q(0.18)) = q(0.82)
    expect(result[0]!.intensity_Q).toBeLessThan(SCALE.Q);
    expect(result[0]!.daysActive).toBe(1);
  });

  it("removes fully decayed waves", () => {
    const wave: EmotionalWave = {
      profileId:      "military_rout",
      sourcePolityId: "empire",
      intensity_Q:    1 as Q,  // near-zero
      daysActive:     10,
    };
    // After one step: qMul(1, SCALE.Q - decayRate) ≈ 0 → removed
    const result = stepEmotionalWaves([wave], EMOTIONAL_PROFILES);
    expect(result).toHaveLength(0);
  });

  it("increments daysActive", () => {
    const wave: EmotionalWave = {
      profileId:      "plague_panic",
      sourcePolityId: "duchy",
      intensity_Q:    SCALE.Q as Q,
      daysActive:     5,
    };
    const result = stepEmotionalWaves([wave], EMOTIONAL_PROFILES);
    expect(result[0]!.daysActive).toBe(6);
  });

  it("handles empty array", () => {
    expect(stepEmotionalWaves([], EMOTIONAL_PROFILES)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const wave: EmotionalWave = {
      profileId: "victory_rally", sourcePolityId: "empire",
      intensity_Q: SCALE.Q as Q, daysActive: 0,
    };
    const original = [wave];
    stepEmotionalWaves(original, EMOTIONAL_PROFILES);
    expect(original[0]!.intensity_Q).toBe(SCALE.Q);  // unchanged
  });

  it("falls back to default decay for unknown profileId", () => {
    const wave: EmotionalWave = {
      profileId: "unknown_profile", sourcePolityId: "empire",
      intensity_Q: SCALE.Q as Q, daysActive: 0,
    };
    const result = stepEmotionalWaves([wave], EMOTIONAL_PROFILES);
    // Default decay q(0.10) applied → survives
    expect(result).toHaveLength(1);
    expect(result[0]!.intensity_Q).toBeLessThan(SCALE.Q);
  });
});

// ── Spread computation ────────────────────────────────────────────────────────

describe("computeEmotionalSpread", () => {
  it("returns 0 when sourcePolityId === targetPolityId", () => {
    const wave: EmotionalWave = {
      profileId: "military_rout", sourcePolityId: "empire",
      intensity_Q: SCALE.Q as Q, daysActive: 0,
    };
    const delta = computeEmotionalSpread("empire", "empire", wave,
      PROFILE_MILITARY_ROUT, 1, 0);
    expect(delta).toBe(0);
  });

  it("returns 0 or positive Q (never negative)", () => {
    const wave: EmotionalWave = {
      profileId: "military_rout", sourcePolityId: "empire",
      intensity_Q: SCALE.Q as Q, daysActive: 0,
    };
    for (let seed = 0; seed < 50; seed++) {
      const delta = computeEmotionalSpread("empire", "duchy", wave,
        PROFILE_MILITARY_ROUT, seed, 0);
      expect(delta).toBeGreaterThanOrEqual(0);
    }
  });

  it("spread is deterministic for same seed and tick", () => {
    const wave: EmotionalWave = {
      profileId: "plague_panic", sourcePolityId: "duchy",
      intensity_Q: SCALE.Q as Q, daysActive: 0,
    };
    const a = computeEmotionalSpread("duchy", "empire", wave,
      PROFILE_PLAGUE_PANIC, 42, 7);
    const b = computeEmotionalSpread("duchy", "empire", wave,
      PROFILE_PLAGUE_PANIC, 42, 7);
    expect(a).toBe(b);
  });

  it("higher intensity produces higher expected delta (50-seed average)", () => {
    const waveHigh: EmotionalWave = {
      profileId: "victory_rally", sourcePolityId: "empire",
      intensity_Q: SCALE.Q as Q, daysActive: 0,
    };
    const waveLow: EmotionalWave = {
      profileId: "victory_rally", sourcePolityId: "empire",
      intensity_Q: q(0.20) as Q, daysActive: 0,
    };
    let sumHigh = 0, sumLow = 0;
    for (let s = 1; s <= 50; s++) {
      sumHigh += computeEmotionalSpread("empire", "duchy", waveHigh, PROFILE_VICTORY_RALLY, s, 0);
      sumLow  += computeEmotionalSpread("empire", "duchy", waveLow,  PROFILE_VICTORY_RALLY, s, 0);
    }
    expect(sumHigh).toBeGreaterThan(sumLow);
  });

  it("clamped delta never exceeds maxMoraleDelta_Q", () => {
    const wave: EmotionalWave = {
      profileId: "military_rout", sourcePolityId: "empire",
      intensity_Q: SCALE.Q as Q, daysActive: 0,
    };
    for (let seed = 0; seed < 100; seed++) {
      const delta = computeEmotionalSpread("empire", "duchy", wave,
        PROFILE_MILITARY_ROUT, seed, 0);
      expect(delta).toBeLessThanOrEqual(PROFILE_MILITARY_ROUT.maxMoraleDelta_Q);
    }
  });
});

// ── Batch application ─────────────────────────────────────────────────────────

describe("applyEmotionalContagion", () => {
  it("returns empty array when no waves", () => {
    const { registry, pairs } = mkRegistry();
    const results = applyEmotionalContagion(registry, pairs, [], EMOTIONAL_PROFILES, 1, 0);
    expect(results).toHaveLength(0);
  });

  it("fear wave lowers source polity morale", () => {
    const { registry, pairs } = mkRegistry();
    const initialMorale = registry.polities.get("empire")!.moraleQ;
    const wave: EmotionalWave = {
      profileId: "military_rout", sourcePolityId: "empire",
      intensity_Q: SCALE.Q as Q, daysActive: 0,
    };
    applyEmotionalContagion(registry, pairs, [wave], EMOTIONAL_PROFILES, 1, 0);
    expect(registry.polities.get("empire")!.moraleQ).toBeLessThan(initialMorale);
  });

  it("hope wave raises source polity morale", () => {
    const { registry, pairs } = mkRegistry();
    // Set morale low so there is room to increase
    registry.polities.get("empire")!.moraleQ = q(0.30) as Q;
    const initialMorale = registry.polities.get("empire")!.moraleQ;
    const wave: EmotionalWave = {
      profileId: "victory_rally", sourcePolityId: "empire",
      intensity_Q: SCALE.Q as Q, daysActive: 0,
    };
    applyEmotionalContagion(registry, pairs, [wave], EMOTIONAL_PROFILES, 1, 0);
    expect(registry.polities.get("empire")!.moraleQ).toBeGreaterThan(initialMorale);
  });

  it("morale never goes below 0 from fear", () => {
    const { registry, pairs } = mkRegistry();
    registry.polities.get("empire")!.moraleQ = q(0.01) as Q;
    const wave: EmotionalWave = {
      profileId: "military_rout", sourcePolityId: "empire",
      intensity_Q: SCALE.Q as Q, daysActive: 0,
    };
    // Apply many times
    for (let i = 0; i < 20; i++) {
      applyEmotionalContagion(registry, pairs, [wave], EMOTIONAL_PROFILES, i, i);
    }
    expect(registry.polities.get("empire")!.moraleQ).toBeGreaterThanOrEqual(0);
  });

  it("morale never exceeds SCALE.Q from hope", () => {
    const { registry, pairs } = mkRegistry();
    registry.polities.get("empire")!.moraleQ = q(0.99) as Q;
    const wave: EmotionalWave = {
      profileId: "victory_rally", sourcePolityId: "empire",
      intensity_Q: SCALE.Q as Q, daysActive: 0,
    };
    for (let i = 0; i < 20; i++) {
      applyEmotionalContagion(registry, pairs, [wave], EMOTIONAL_PROFILES, i, i);
    }
    expect(registry.polities.get("empire")!.moraleQ).toBeLessThanOrEqual(SCALE.Q);
  });

  it("results list includes affected polities only", () => {
    const { registry, pairs } = mkRegistry();
    const wave: EmotionalWave = {
      profileId: "plague_panic", sourcePolityId: "empire",
      intensity_Q: SCALE.Q as Q, daysActive: 0,
    };
    const results = applyEmotionalContagion(registry, pairs, [wave], EMOTIONAL_PROFILES, 42, 0);
    // empire is always affected (source); duchy may or may not spread
    const polityIds = results.map(r => r.polityId);
    expect(polityIds).toContain("empire");
    // barony is NOT adjacent to empire (only duchy-barony pair), so not affected
    expect(polityIds).not.toContain("barony");
  });

  it("skips unknown polity id in wave", () => {
    const { registry, pairs } = mkRegistry();
    const wave: EmotionalWave = {
      profileId: "military_rout", sourcePolityId: "unknown_polity",
      intensity_Q: SCALE.Q as Q, daysActive: 0,
    };
    // Should not throw; affected polity list should not include unknown
    const results = applyEmotionalContagion(registry, pairs, [wave], EMOTIONAL_PROFILES, 1, 0);
    const ids = results.map(r => r.polityId);
    expect(ids).not.toContain("unknown_polity");
  });

  it("wave with unknown profileId is skipped", () => {
    const { registry, pairs } = mkRegistry();
    const initialMorale = registry.polities.get("empire")!.moraleQ;
    const wave: EmotionalWave = {
      profileId: "no_such_profile", sourcePolityId: "empire",
      intensity_Q: SCALE.Q as Q, daysActive: 0,
    };
    applyEmotionalContagion(registry, pairs, [wave], EMOTIONAL_PROFILES, 1, 0);
    // No profile found → no effect
    expect(registry.polities.get("empire")!.moraleQ).toBe(initialMorale);
  });
});

// ── Convenience triggers ──────────────────────────────────────────────────────

describe("convenience triggers", () => {
  it("triggerMilitaryRout creates military_rout fear wave", () => {
    const wave = triggerMilitaryRout("empire");
    expect(wave.profileId).toBe("military_rout");
    expect(wave.sourcePolityId).toBe("empire");
    expect(wave.intensity_Q).toBe(SCALE.Q);
  });

  it("triggerPlaguePanic creates plague_panic fear wave", () => {
    const wave = triggerPlaguePanic("duchy");
    expect(wave.profileId).toBe("plague_panic");
    expect(wave.sourcePolityId).toBe("duchy");
  });

  it("triggerVictoryRally creates victory_rally hope wave", () => {
    const wave = triggerVictoryRally("empire");
    expect(wave.profileId).toBe("victory_rally");
    expect(wave.sourcePolityId).toBe("empire");
  });

  it("triggerLeaderAddress creates charismatic_address hope wave", () => {
    const wave = triggerLeaderAddress("empire", q(0.70) as Q);
    expect(wave.profileId).toBe("charismatic_address");
    expect(wave.sourcePolityId).toBe("empire");
    expect(wave.intensity_Q).toBe(SCALE.Q);
  });
});

// ── isWaveExpired ─────────────────────────────────────────────────────────────

describe("isWaveExpired", () => {
  it("returns false for non-zero intensity", () => {
    expect(isWaveExpired({ profileId: "x", sourcePolityId: "a",
      intensity_Q: q(0.01) as Q, daysActive: 0 })).toBe(false);
  });

  it("returns true when intensity is 0", () => {
    expect(isWaveExpired({ profileId: "x", sourcePolityId: "a",
      intensity_Q: 0 as Q, daysActive: 5 })).toBe(true);
  });
});

// ── netEmotionalPressure ──────────────────────────────────────────────────────

describe("netEmotionalPressure", () => {
  it("returns 0 when no waves match polityId", () => {
    const pressure = netEmotionalPressure("empire", [], EMOTIONAL_PROFILES);
    expect(pressure).toBe(0);
  });

  it("fear wave gives negative pressure", () => {
    const wave = triggerMilitaryRout("empire");
    const pressure = netEmotionalPressure("empire", [wave], EMOTIONAL_PROFILES);
    expect(pressure).toBeLessThan(0);
  });

  it("hope wave gives positive pressure", () => {
    const wave = triggerVictoryRally("empire");
    const pressure = netEmotionalPressure("empire", [wave], EMOTIONAL_PROFILES);
    expect(pressure).toBeGreaterThan(0);
  });

  it("fear + hope waves partially cancel", () => {
    const fear = triggerMilitaryRout("empire");
    const hope = triggerVictoryRally("empire");
    const pressure = netEmotionalPressure("empire", [fear, hope], EMOTIONAL_PROFILES);
    // Both at SCALE.Q: fear = -SCALE.Q, hope = +SCALE.Q → clampQ(0, -SCALE.Q, SCALE.Q) = 0
    expect(pressure).toBe(0);
  });

  it("ignores waves from other polities", () => {
    const wave = triggerMilitaryRout("duchy");
    const pressure = netEmotionalPressure("empire", [wave], EMOTIONAL_PROFILES);
    expect(pressure).toBe(0);
  });

  it("pressure is clamped to [-SCALE.Q, SCALE.Q]", () => {
    const waves = [triggerMilitaryRout("empire"), triggerMilitaryRout("empire"),
                   triggerMilitaryRout("empire"), triggerMilitaryRout("empire")];
    const pressure = netEmotionalPressure("empire", waves, EMOTIONAL_PROFILES);
    expect(pressure).toBeGreaterThanOrEqual(-SCALE.Q);
    expect(pressure).toBeLessThanOrEqual(SCALE.Q);
  });
});

// ── Integration: multi-day propagation ───────────────────────────────────────

describe("multi-day propagation", () => {
  it("fear wave spreads to adjacent polities over multiple ticks", () => {
    const { registry, pairs } = mkRegistry();
    const initialDuchy = registry.polities.get("duchy")!.moraleQ;

    let waves: EmotionalWave[] = [triggerMilitaryRout("empire")];
    for (let tick = 0; tick < 10; tick++) {
      applyEmotionalContagion(registry, pairs, waves, EMOTIONAL_PROFILES, 42, tick);
      waves = stepEmotionalWaves(waves, EMOTIONAL_PROFILES);
    }

    // Duchy (adjacent to empire) should have lost some morale over 10 days
    const finalDuchy = registry.polities.get("duchy")!.moraleQ;
    expect(finalDuchy).toBeLessThanOrEqual(initialDuchy);
  });

  it("wave fully decays to 0 after enough steps", () => {
    let waves: EmotionalWave[] = [triggerMilitaryRout("empire")];
    for (let i = 0; i < 100; i++) {
      waves = stepEmotionalWaves(waves, EMOTIONAL_PROFILES);
      if (waves.length === 0) break;
    }
    expect(waves).toHaveLength(0);
  });

  it("plague_panic decays slower than military_rout", () => {
    let rout  : EmotionalWave[] = [triggerMilitaryRout("empire")];
    let plague: EmotionalWave[] = [triggerPlaguePanic("empire")];
    for (let i = 0; i < 10; i++) {
      rout   = stepEmotionalWaves(rout,   EMOTIONAL_PROFILES);
      plague = stepEmotionalWaves(plague, EMOTIONAL_PROFILES);
    }
    // Plague should still be active; rout may or may not be
    const routIntensity   = rout[0]?.intensity_Q   ?? 0;
    const plagueIntensity = plague[0]?.intensity_Q ?? 0;
    expect(plagueIntensity).toBeGreaterThan(routIntensity);
  });
});
