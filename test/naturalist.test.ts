/**
 * Phase 35 — Naturalist Intelligence: Tracking, Foraging, Taming
 *
 * Groups:
 *   Output shape        (6) — valid types, bounds, deterministic
 *   Tracking            (6) — age degradation, terrain, species bonus, affinity, range calc
 *   Foraging            (5) — yield by biome/season, herb quality, misidentification
 *   Taming              (5) — trust formula, fear penalty, attack check, full tame threshold
 *   Edge cases          (3) — missing cognition, max/min values, backward compatibility
 */

import { describe, it, expect } from "vitest";
import { SCALE, q, type Q } from "../src/units";
import {
  resolveTracking,
  resolveForaging,
  resolveTaming,
  isFullyTamed,
  isTrackingReliable,
  type TrackingSpec,
  type ForagingSpec,
  type TamingSpec,
} from "../src/competence/naturalist";
import { mkHumanoidEntity } from "../src/sim/testing";
import type { Entity } from "../src/sim/entity";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkNaturalist(naturalist: Q, interSpecies?: Q): Entity {
  const e = mkHumanoidEntity(1, 1, 0, 0);
  return {
    ...e,
    attributes: {
      ...e.attributes,
      cognition: {
        linguistic: q(0.60) as Q,
        logicalMathematical: q(0.60) as Q,
        spatial: q(0.60) as Q,
        bodilyKinesthetic: q(0.60) as Q,
        musical: q(0.55) as Q,
        interpersonal: q(0.60) as Q,
        intrapersonal: q(0.60) as Q,
        naturalist,
        interSpecies: interSpecies ?? (q(0.35) as Q),
      },
    },
  };
}

// ── Output Shape ──────────────────────────────────────────────────────────────

describe("output shape", () => {
  it("resolveTracking returns confidence_Q in [0, SCALE.Q]", () => {
    const e = mkNaturalist(q(0.60) as Q);
    const spec: TrackingSpec = { trackAge_s: 3600, terrain: "ideal", quarrySpecies: "human" };
    const out = resolveTracking(e, spec, 42);
    expect(out.confidence_Q).toBeGreaterThanOrEqual(0);
    expect(out.confidence_Q).toBeLessThanOrEqual(SCALE.Q);
    expect(out.trackRange_m).toBeGreaterThanOrEqual(0);
  });

  it("resolveForaging returns valid yield and quality", () => {
    const e = mkNaturalist(q(0.60) as Q);
    const spec: ForagingSpec = { searchHours: 2, biome: "forest", season: "summer" };
    const out = resolveForaging(e, spec, 42);
    expect(out.itemsFound).toBeGreaterThanOrEqual(0);
    expect(out.herbQuality_Q).toBeGreaterThanOrEqual(0);
    expect(out.herbQuality_Q).toBeLessThanOrEqual(SCALE.Q);
    expect(typeof out.misidentified).toBe("boolean");
  });

  it("resolveTaming returns trust_Q in [0, SCALE.Q]", () => {
    const e = mkNaturalist(q(0.60) as Q, q(0.50) as Q);
    const spec: TamingSpec = {
      animalSpecies: "wolf",
      animalFearQ: q(0.40) as Q,
      effortFactor: q(1.0) as Q,
      priorSuccesses: 0,
    };
    const out = resolveTaming(e, spec, 42);
    expect(out.trust_Q).toBeGreaterThanOrEqual(0);
    expect(out.trust_Q).toBeLessThanOrEqual(SCALE.Q);
    expect(typeof out.attacked).toBe("boolean");
  });

  it("isFullyTamed returns true at threshold", () => {
    expect(isFullyTamed(q(0.90) as Q)).toBe(true);
    expect(isFullyTamed(q(0.89) as Q)).toBe(false);
  });

  it("isTrackingReliable returns true at threshold", () => {
    expect(isTrackingReliable(q(0.60) as Q)).toBe(true);
    expect(isTrackingReliable(q(0.59) as Q)).toBe(false);
  });

  it("functions are deterministic with same inputs", () => {
    const e = mkNaturalist(q(0.70) as Q);
    const tSpec: TrackingSpec = { trackAge_s: 1800, terrain: "forest", quarrySpecies: "deer" };
    const fSpec: ForagingSpec = { searchHours: 3, biome: "plains", season: "spring" };

    const t1 = resolveTracking(e, tSpec, 123);
    const t2 = resolveTracking(e, tSpec, 123);
    expect(t1.confidence_Q).toBe(t2.confidence_Q);
    expect(t1.trackRange_m).toBe(t2.trackRange_m);

    const f1 = resolveForaging(e, fSpec, 456);
    const f2 = resolveForaging(e, fSpec, 456);
    expect(f1.yield).toBe(f2.yield);
    expect(f1.misidentified).toBe(f2.misidentified);
  });
});

// ── Tracking ───────────────────────────────────────────────────────────────────

describe("tracking", () => {
  it("higher naturalist increases confidence and range", () => {
    const low = mkNaturalist(q(0.40) as Q);
    const high = mkNaturalist(q(0.80) as Q);
    const spec: TrackingSpec = { trackAge_s: 600, terrain: "ideal", quarrySpecies: "human" };

    const lowOut = resolveTracking(low, spec, 1);
    const highOut = resolveTracking(high, spec, 1);

    expect(highOut.confidence_Q).toBeGreaterThan(lowOut.confidence_Q);
    expect(highOut.trackRange_m).toBeGreaterThanOrEqual(lowOut.trackRange_m);
  });

  it("track age degrades confidence", () => {
    const e = mkNaturalist(q(0.70) as Q);
    const fresh: TrackingSpec = { trackAge_s: 300, terrain: "ideal", quarrySpecies: "human" };
    const old: TrackingSpec = { trackAge_s: 7200, terrain: "ideal", quarrySpecies: "human" };

    const freshOut = resolveTracking(e, fresh, 1);
    const oldOut = resolveTracking(e, old, 1);

    expect(freshOut.confidence_Q).toBeGreaterThan(oldOut.confidence_Q);
  });

  it("terrain affects track preservation", () => {
    const e = mkNaturalist(q(0.70) as Q);
    const base: TrackingSpec = { trackAge_s: 3600, terrain: "ideal", quarrySpecies: "human" };
    const rain: TrackingSpec = { trackAge_s: 3600, terrain: "rain", quarrySpecies: "human" };

    const baseOut = resolveTracking(e, base, 1);
    const rainOut = resolveTracking(e, rain, 1);

    // Rain degrades tracks faster
    expect(rainOut.confidence_Q).toBeLessThan(baseOut.confidence_Q);
  });

  it("species-specific tracking multipliers apply", () => {
    const e = mkNaturalist(q(0.70) as Q);
    const human: TrackingSpec = { trackAge_s: 600, terrain: "ideal", quarrySpecies: "human" };
    const goblin: TrackingSpec = { trackAge_s: 600, terrain: "ideal", quarrySpecies: "goblin" };

    const humanOut = resolveTracking(e, human, 1);
    const goblinOut = resolveTracking(e, goblin, 1);

    // Goblins are harder to track (smaller, lighter)
    expect(goblinOut.confidence_Q).toBeLessThan(humanOut.confidence_Q);
  });

  it("track range has floor based on naturalist ability", () => {
    const lowNat = mkNaturalist(q(0.20) as Q);
    const spec: TrackingSpec = { trackAge_s: 10000, terrain: "deep_water", quarrySpecies: "human" };

    const out = resolveTracking(lowNat, spec, 1);

    // Even with terrible conditions, naturalist skill provides some floor
    expect(out.trackRange_m).toBeGreaterThan(0);
  });

  it("confidence reliability threshold works", () => {
    const highSkill = mkNaturalist(q(0.90) as Q);
    const freshTrack: TrackingSpec = { trackAge_s: 60, terrain: "ideal", quarrySpecies: "human" };

    const out = resolveTracking(highSkill, freshTrack, 1);

    // High naturalist + fresh track should be reliable
    expect(isTrackingReliable(out.confidence_Q)).toBe(true);
  });
});

// ── Foraging ───────────────────────────────────────────────────────────────────

describe("foraging", () => {
  it("higher naturalist increases items found", () => {
    const low = mkNaturalist(q(0.40) as Q);
    const high = mkNaturalist(q(0.80) as Q);
    const spec: ForagingSpec = { searchHours: 2, biome: "forest", season: "summer" };

    const lowOut = resolveForaging(low, spec, 1);
    const highOut = resolveForaging(high, spec, 1);

    expect(highOut.itemsFound).toBeGreaterThanOrEqual(lowOut.itemsFound);
  });

  it("biome affects base items found", () => {
    const e = mkNaturalist(q(0.70) as Q);
    const forest: ForagingSpec = { searchHours: 1, biome: "forest", season: "summer" };
    const desert: ForagingSpec = { searchHours: 1, biome: "desert", season: "summer" };

    const forestOut = resolveForaging(e, forest, 1);
    const desertOut = resolveForaging(e, desert, 1);

    expect(forestOut.itemsFound).toBeGreaterThan(desertOut.itemsFound);
  });

  it("season affects items found", () => {
    const e = mkNaturalist(q(0.70) as Q);
    const summer: ForagingSpec = { searchHours: 1, biome: "forest", season: "summer" };
    const winter: ForagingSpec = { searchHours: 1, biome: "forest", season: "winter" };

    const summerOut = resolveForaging(e, summer, 1);
    const winterOut = resolveForaging(e, winter, 1);

    expect(summerOut.itemsFound).toBeGreaterThan(winterOut.itemsFound);
  });

  it("misidentification probability decreases with naturalist skill", () => {
    // Test statistically - low naturalist should misidentify more often
    const low = mkNaturalist(q(0.40) as Q);
    const high = mkNaturalist(q(0.85) as Q);
    const spec: ForagingSpec = { searchHours: 1, biome: "forest", season: "summer" };

    let lowMisidentifies = 0;
    let highMisidentifies = 0;
    const trials = 50;

    for (let i = 0; i < trials; i++) {
      const lowOut = resolveForaging(low, spec, i);
      const highOut = resolveForaging(high, spec, i + 1000);
      if (lowOut.misidentified) lowMisidentifies++;
      if (highOut.misidentified) highMisidentifies++;
    }

    // Low skill should misidentify more than high skill
    expect(lowMisidentifies).toBeGreaterThanOrEqual(highMisidentifies);
  });

  it("troll-like naturalist (~0.50) misidentifies more than elf (~0.78)", () => {
    const trollLike = mkNaturalist(q(0.50) as Q);
    const elfLike = mkNaturalist(q(0.78) as Q);
    const spec: ForagingSpec = { searchHours: 1, biome: "forest", season: "summer" };

    let trollMisidents = 0;
    let elfMisidents = 0;
    const trials = 500;

    for (let i = 0; i < trials; i++) {
      const trollOut = resolveForaging(trollLike, spec, i);
      const elfOut = resolveForaging(elfLike, spec, i + 2000);
      if (trollOut.misidentified) trollMisidents++;
      if (elfOut.misidentified) elfMisidents++;
    }

    // Troll: ~10% misidentification rate
    // Elf: ~0% misidentification (0.30 - 0.78*0.40 = negative, clamped to 0)
    // Troll should misidentify more often than elf (statistically)
    expect(trollMisidents).toBeGreaterThanOrEqual(elfMisidents);
    expect(trollMisidents).toBeLessThan(100); // Should be around 10% (50 out of 500)
    expect(elfMisidents).toBeLessThanOrEqual(5); // Should be near 0%
  });
});

// ── Taming ─────────────────────────────────────────────────────────────────────

describe("taming", () => {
  it("higher naturalist increases trust", () => {
    const low = mkNaturalist(q(0.40) as Q, q(0.50) as Q);
    const high = mkNaturalist(q(0.80) as Q, q(0.50) as Q);
    const spec: TamingSpec = {
      animalSpecies: "wolf",
      animalFearQ: q(0.30) as Q,
      effortFactor: q(1.0) as Q,
      priorSuccesses: 0,
    };

    const lowOut = resolveTaming(low, spec, 1);
    const highOut = resolveTaming(high, spec, 1);

    expect(highOut.trust_Q).toBeGreaterThan(lowOut.trust_Q);
  });

  it("higher interSpecies increases trust", () => {
    const lowIS = mkNaturalist(q(0.60) as Q, q(0.30) as Q);
    const highIS = mkNaturalist(q(0.60) as Q, q(0.70) as Q);
    const spec: TamingSpec = {
      animalSpecies: "wolf",
      animalFearQ: q(0.30) as Q,
      effortFactor: q(1.0) as Q,
      priorSuccesses: 0,
    };

    const lowOut = resolveTaming(lowIS, spec, 1);
    const highOut = resolveTaming(highIS, spec, 1);

    expect(highOut.trust_Q).toBeGreaterThan(lowOut.trust_Q);
  });

  it("animal fear reduces trust", () => {
    const e = mkNaturalist(q(0.70) as Q, q(0.60) as Q);
    const calm: TamingSpec = {
      animalSpecies: "deer",
      animalFearQ: q(0.20) as Q,
      effortFactor: q(1.0) as Q,
      priorSuccesses: 0,
    };
    const fearful: TamingSpec = {
      animalSpecies: "bear",
      animalFearQ: q(0.80) as Q,
      effortFactor: q(1.0) as Q,
      priorSuccesses: 0,
    };

    const calmOut = resolveTaming(e, calm, 1);
    const fearfulOut = resolveTaming(e, fearful, 1);

    expect(calmOut.trust_Q).toBeGreaterThan(fearfulOut.trust_Q);
  });

  it("high fear with low trust can trigger attack", () => {
    const inexpert = mkNaturalist(q(0.40) as Q, q(0.30) as Q);
    const spec: TamingSpec = {
      animalSpecies: "bear",
      animalFearQ: q(0.90) as Q,
      effortFactor: q(0.50) as Q, // low effort
      priorSuccesses: 0,
    };

    let attacks = 0;
    for (let i = 0; i < 30; i++) {
      const out = resolveTaming(inexpert, spec, i);
      if (out.attacked) attacks++;
    }

    // Should have some attacks given high fear + low skill
    expect(attacks).toBeGreaterThan(0);
  });

  it("fully tamed threshold requires trust >= q(0.90)", () => {
    const expert = mkNaturalist(q(0.95) as Q, q(0.90) as Q);
    const spec: TamingSpec = {
      animalSpecies: "wolf",
      animalFearQ: q(0.10) as Q,
      effortFactor: q(1.0) as Q,
      priorSuccesses: 5,
    };

    const out = resolveTaming(expert, spec, 1);

    // With expert handler, calm animal, and experience, should be fully tamed
    expect(isFullyTamed(out.trust_Q)).toBe(true);
  });
});

// ── Edge Cases ─────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles missing cognition with defaults", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const eNoCognition = {
      ...e,
      attributes: { ...e.attributes, cognition: undefined },
    };

    const tSpec: TrackingSpec = { trackAge_s: 600, terrain: "ideal", quarrySpecies: "human" };
    const fSpec: ForagingSpec = { searchHours: 1, biome: "forest", season: "summer" };
    const tmSpec: TamingSpec = {
      animalSpecies: "wolf",
      animalFearQ: q(0.40) as Q,
      effortFactor: q(1.0) as Q,
      priorSuccesses: 0,
    };

    const tOut = resolveTracking(eNoCognition, tSpec, 1);
    const fOut = resolveForaging(eNoCognition, fSpec, 1);
    const tmOut = resolveTaming(eNoCognition, tmSpec, 1);

    // Should work with default naturalist = q(0.50)
    expect(tOut.confidence_Q).toBeGreaterThan(0);
    expect(fOut.itemsFound).toBeGreaterThanOrEqual(0);
    expect(tmOut.trust_Q).toBeGreaterThanOrEqual(0);
  });

  it(" clamps values at maximum bounds", () => {
    const maxSkill = mkNaturalist(q(1.0) as Q, q(1.0) as Q);
    const tSpec: TrackingSpec = { trackAge_s: 0, terrain: "ideal", quarrySpecies: "human" };
    const fSpec: ForagingSpec = { searchHours: 10, biome: "forest", season: "spring" };

    const tOut = resolveTracking(maxSkill, tSpec, 1);
    const fOut = resolveForaging(maxSkill, fSpec, 1);

    expect(tOut.confidence_Q).toBeLessThanOrEqual(SCALE.Q);
    expect(fOut.herbQuality_Q).toBeLessThanOrEqual(SCALE.Q);
  });

  it("zero effort taming yields minimal trust", () => {
    const e = mkNaturalist(q(0.70) as Q, q(0.60) as Q);
    const spec: TamingSpec = {
      animalSpecies: "wolf",
      animalFearQ: q(0.50) as Q,
      effortFactor: q(0.0) as Q,
      priorSuccesses: 0,
    };

    const out = resolveTaming(e, spec, 1);

    expect(out.trust_Q).toBeLessThan(q(0.30));
  });
});
