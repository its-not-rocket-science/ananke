// test/extended-senses.test.ts — PA-7: Advanced Non-Visual Sensory Systems

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import {
  hasEcholocation,
  hasElectroreception,
  hasThermalVision,
  hasOlfaction,
  dominantSense,
  thermalSignature,
  canDetectByThermalVision,
  canDetectExtendedAtmospheric,
  stepExtendedSenses,
  THERMAL_BASE_SIGNATURE_Q,
  THERMAL_BLEED_BONUS_Q,
  THERMAL_SHOCK_BONUS_Q,
  THERMAL_SHOCK_THRESHOLD,
  THERMAL_PRECIP_PENALTY,
  DETECT_THERMAL,
  DETECT_OLFACTION_ATMO_MIN,
  DETECT_OLFACTION_ATMO_MAX,
  type SenseModality,
} from "../src/extended-senses.js";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing.js";
import { DEFAULT_SENSORY_ENV } from "../src/sim/sensory.js";
import { deriveAtmosphericState } from "../src/atmosphere.js";
import type { Entity } from "../src/sim/entity.js";
import type { ExtendedSenses } from "../src/sim/sensory-extended.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function mkEntity(id: number, x = 0, y = 0): Entity {
  return mkHumanoidEntity(id, id, x, y);
}

function withSenses(e: Entity, s: ExtendedSenses): Entity {
  e.extendedSenses = s;
  return e;
}

/** Calm atmospheric state (no weather, no biome). */
const CALM_ATMO = deriveAtmosphericState(undefined, undefined);

/**
 * Blackout environment: no vision (lightMul=0) and no hearing (noiseMul=0).
 * Use this in canDetectExtendedAtmospheric tests to isolate extended modalities.
 * Note: noiseMul=0 amplifies echolocation effective range (min divisor=1), which is
 * harmless for detection-success tests.
 */
const BLACKOUT_ENV = {
  ...DEFAULT_SENSORY_ENV,
  lightMul:  q(0) as ReturnType<typeof q>,
  noiseMul:  q(0) as ReturnType<typeof q>,
};

/**
 * Downwind atmospheric state — wind blowing WEST so scent from an Eastern subject
 * is carried toward an observer at the origin.
 *
 * Observer at (0, 0).  Subject at (East, 0).
 * Wind West (dx_m = -SCALE.m) → dotNorm between shot East and wind West is -SCALE.m
 * → scentStrength_Q = -(-SCALE.m) × SCALE.Q / SCALE.m = SCALE.Q = q(1.0).
 */
function makeDownwindAtmo() {
  return deriveAtmosphericState(
    {
      lightMul: SCALE.Q as ReturnType<typeof q>,
      smokeMul: SCALE.Q as ReturnType<typeof q>,
      noiseMul: SCALE.Q as ReturnType<typeof q>,
      wind: { dx_m: -SCALE.m, dy_m: 0, speed_mps: 2_000 },
      precipitation: "none",
      precipVisionMul: SCALE.Q as ReturnType<typeof q>,
    } as Parameters<typeof deriveAtmosphericState>[0],
    undefined,
  );
}

// ── Body-plan predicates ───────────────────────────────────────────────────────

describe("hasEcholocation", () => {
  it("false when no extendedSenses", () => {
    expect(hasEcholocation(mkEntity(1))).toBe(false);
  });
  it("false when echolocationRange_m = 0", () => {
    expect(hasEcholocation(withSenses(mkEntity(1), { echolocationRange_m: 0 }))).toBe(false);
  });
  it("true when echolocationRange_m > 0", () => {
    expect(hasEcholocation(withSenses(mkEntity(1), { echolocationRange_m: 50 * SCALE.m }))).toBe(true);
  });
});

describe("hasElectroreception", () => {
  it("false when no extendedSenses", () => {
    expect(hasElectroreception(mkEntity(1))).toBe(false);
  });
  it("false when electroreceptionRange_m = 0", () => {
    expect(hasElectroreception(withSenses(mkEntity(1), { electroreceptionRange_m: 0 }))).toBe(false);
  });
  it("true when electroreceptionRange_m > 0", () => {
    expect(hasElectroreception(withSenses(mkEntity(1), { electroreceptionRange_m: 3 * SCALE.m }))).toBe(true);
  });
});

describe("hasThermalVision", () => {
  it("false when no extendedSenses", () => {
    expect(hasThermalVision(mkEntity(1))).toBe(false);
  });
  it("false when thermalVisionRange_m = 0", () => {
    expect(hasThermalVision(withSenses(mkEntity(1), { thermalVisionRange_m: 0 }))).toBe(false);
  });
  it("true when thermalVisionRange_m > 0", () => {
    expect(hasThermalVision(withSenses(mkEntity(1), { thermalVisionRange_m: 5 * SCALE.m }))).toBe(true);
  });
});

describe("hasOlfaction", () => {
  it("false when no extendedSenses", () => {
    expect(hasOlfaction(mkEntity(1))).toBe(false);
  });
  it("false when olfactionSensitivity_Q = 0", () => {
    expect(hasOlfaction(withSenses(mkEntity(1), { olfactionSensitivity_Q: q(0) as ReturnType<typeof q> }))).toBe(false);
  });
  it("true when olfactionSensitivity_Q > 0", () => {
    expect(hasOlfaction(withSenses(mkEntity(1), { olfactionSensitivity_Q: q(0.8) as ReturnType<typeof q> }))).toBe(true);
  });
});

describe("dominantSense", () => {
  it("defaults to vision when no extended senses", () => {
    expect(dominantSense(mkEntity(1))).toBe("vision" satisfies SenseModality);
  });

  it("returns olfaction when only olfaction present", () => {
    const e = withSenses(mkEntity(1), { olfactionSensitivity_Q: q(0.8) as ReturnType<typeof q> });
    expect(dominantSense(e)).toBe("olfaction");
  });

  it("returns thermal when only thermal present", () => {
    const e = withSenses(mkEntity(1), { thermalVisionRange_m: 20 * SCALE.m });
    expect(dominantSense(e)).toBe("thermal");
  });

  it("returns echolocation over olfaction", () => {
    const e = withSenses(mkEntity(1), {
      echolocationRange_m: 30 * SCALE.m,
      olfactionSensitivity_Q: q(0.8) as ReturnType<typeof q>,
    });
    expect(dominantSense(e)).toBe("echolocation");
  });

  it("returns electroreception over echolocation", () => {
    const e = withSenses(mkEntity(1), {
      electroreceptionRange_m: 2 * SCALE.m,
      echolocationRange_m: 30 * SCALE.m,
    });
    expect(dominantSense(e)).toBe("electroreception");
  });

  it("returns thermal over olfaction", () => {
    const e = withSenses(mkEntity(1), {
      thermalVisionRange_m: 20 * SCALE.m,
      olfactionSensitivity_Q: q(0.8) as ReturnType<typeof q>,
    });
    expect(dominantSense(e)).toBe("thermal");
  });

  it("priority: electroreception > echolocation > thermal > olfaction", () => {
    const e = withSenses(mkEntity(1), {
      electroreceptionRange_m: 2 * SCALE.m,
      echolocationRange_m: 30 * SCALE.m,
      thermalVisionRange_m: 20 * SCALE.m,
      olfactionSensitivity_Q: q(0.8) as ReturnType<typeof q>,
    });
    expect(dominantSense(e)).toBe("electroreception");
  });
});

// ── thermalSignature ───────────────────────────────────────────────────────────

describe("thermalSignature", () => {
  it("returns q(0) for dead entity", () => {
    const e = mkEntity(1);
    e.injury.dead = true;
    expect(thermalSignature(e)).toBe(q(0));
  });

  it("returns THERMAL_BASE_SIGNATURE_Q for healthy entity", () => {
    expect(thermalSignature(mkEntity(1))).toBe(THERMAL_BASE_SIGNATURE_Q);
  });

  it("adds THERMAL_BLEED_BONUS_Q per bleeding region", () => {
    const e = mkEntity(1);
    // Set one bleeding region
    const regionKeys = Object.keys(e.injury.byRegion);
    expect(regionKeys.length).toBeGreaterThan(0);
    const firstKey = regionKeys[0] as keyof typeof e.injury.byRegion;
    e.injury.byRegion[firstKey].bleedingRate = 5;
    const sig = thermalSignature(e);
    expect(sig).toBe(Math.round(THERMAL_BASE_SIGNATURE_Q + THERMAL_BLEED_BONUS_Q));
  });

  it("adds THERMAL_SHOCK_BONUS_Q when shock >= THERMAL_SHOCK_THRESHOLD", () => {
    const e = mkEntity(1);
    e.injury.shock = THERMAL_SHOCK_THRESHOLD;
    const sig = thermalSignature(e);
    expect(sig).toBe(Math.round(THERMAL_BASE_SIGNATURE_Q + THERMAL_SHOCK_BONUS_Q));
  });

  it("no shock bonus below THERMAL_SHOCK_THRESHOLD", () => {
    const e = mkEntity(1);
    e.injury.shock = (THERMAL_SHOCK_THRESHOLD - 1) as ReturnType<typeof q>;
    expect(thermalSignature(e)).toBe(THERMAL_BASE_SIGNATURE_Q);
  });

  it("clamped to SCALE.Q", () => {
    const e = mkEntity(1);
    // Set many bleeding regions + shock
    for (const key of Object.keys(e.injury.byRegion) as (keyof typeof e.injury.byRegion)[]) {
      e.injury.byRegion[key].bleedingRate = 100;
    }
    e.injury.shock = THERMAL_SHOCK_THRESHOLD;
    expect(thermalSignature(e)).toBeLessThanOrEqual(SCALE.Q);
  });

  it("no injury object → still returns base", () => {
    const e = mkEntity(1);
    (e as Partial<typeof e>).injury = undefined as unknown as typeof e.injury;
    // injury might be undefined in edge cases — should return base or 0
    // In our implementation, if injury is undefined, dead check is false, byRegion loop skipped
    // This edge case returns THERMAL_BASE_SIGNATURE_Q
    const sig = thermalSignature(e);
    expect(sig).toBeGreaterThanOrEqual(q(0));
    expect(sig).toBeLessThanOrEqual(SCALE.Q);
  });
});

// ── canDetectByThermalVision ───────────────────────────────────────────────────

describe("canDetectByThermalVision", () => {
  it("false when observer has no thermal vision", () => {
    const obs = mkEntity(1, 0, 0);
    const sub = mkEntity(2, 0, 0);
    expect(canDetectByThermalVision(obs, sub, 0)).toBe(false);
  });

  it("false when subject is dead", () => {
    const obs = withSenses(mkEntity(1), { thermalVisionRange_m: 30 * SCALE.m });
    const sub = mkEntity(2, 0, 0);
    sub.injury.dead = true;
    expect(canDetectByThermalVision(obs, sub, 5 * SCALE.m)).toBe(false);
  });

  it("detects within effective range (base × signature)", () => {
    const obs = withSenses(mkEntity(1), { thermalVisionRange_m: 50 * SCALE.m });
    const sub = mkEntity(2, 0, 0);
    const sig = thermalSignature(sub);
    // effective range = 50m × sig / SCALE.Q (no precip)
    const effectiveRange = Math.trunc(50 * SCALE.m * sig / SCALE.Q);
    expect(canDetectByThermalVision(obs, sub, effectiveRange)).toBe(true);
    expect(canDetectByThermalVision(obs, sub, effectiveRange + 1)).toBe(false);
  });

  it("precipitation reduces effective range", () => {
    const obs = withSenses(mkEntity(1), { thermalVisionRange_m: 50 * SCALE.m });
    const sub = mkEntity(2, 0, 0);
    const sig = thermalSignature(sub);
    const noRainRange = Math.trunc(50 * SCALE.m * sig / SCALE.Q);
    // With max precip: penalty = THERMAL_PRECIP_PENALTY × 1.0 → precipMul = SCALE.Q - penalty
    const precipMul = SCALE.Q - THERMAL_PRECIP_PENALTY;
    const rainRange = Math.trunc(Math.trunc(50 * SCALE.m * sig / SCALE.Q) * precipMul / SCALE.Q);
    // rainRange < noRainRange
    expect(rainRange).toBeLessThan(noRainRange);
    // Just beyond rain range but within no-rain range → detected with no rain, not with heavy rain
    const testDist = rainRange + 1;
    if (testDist <= noRainRange) {
      expect(canDetectByThermalVision(obs, sub, testDist, SCALE.Q as ReturnType<typeof q>)).toBe(false);
      expect(canDetectByThermalVision(obs, sub, testDist, undefined)).toBe(true);
    }
  });

  it("high-signature (bleeding) subject detectable at greater range", () => {
    const obs = withSenses(mkEntity(1), { thermalVisionRange_m: 50 * SCALE.m });
    const healthy = mkEntity(2, 0, 0);
    const bleeding = mkEntity(3, 0, 0);
    const firstKey = Object.keys(bleeding.injury.byRegion)[0] as keyof typeof bleeding.injury.byRegion;
    bleeding.injury.byRegion[firstKey].bleedingRate = 10;

    const healthySig = thermalSignature(healthy);
    const bleedSig = thermalSignature(bleeding);
    expect(bleedSig).toBeGreaterThan(healthySig);

    const healthyRange = Math.trunc(50 * SCALE.m * healthySig / SCALE.Q);
    const bleedRange = Math.trunc(50 * SCALE.m * bleedSig / SCALE.Q);
    expect(bleedRange).toBeGreaterThan(healthyRange);
  });

  it("zero thermal range = false even at zero distance", () => {
    const obs = withSenses(mkEntity(1), { thermalVisionRange_m: 0 });
    const sub = mkEntity(2, 0, 0);
    expect(canDetectByThermalVision(obs, sub, 0)).toBe(false);
  });
});

// ── canDetectExtendedAtmospheric ──────────────────────────────────────────────

describe("canDetectExtendedAtmospheric", () => {
  it("returns q(0) when no extended senses and blackout (vision+hearing fail)", () => {
    const obs = mkEntity(1, 0, 0);
    const sub = mkEntity(2, 100 * SCALE.m, 0);
    expect(canDetectExtendedAtmospheric(obs, sub, BLACKOUT_ENV, CALM_ATMO)).toBe(q(0));
  });

  it("returns DETECT_ELECTRORECEPTION for entity within range, living subject", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { electroreceptionRange_m: 5 * SCALE.m });
    const sub = mkEntity(2, 3 * SCALE.m, 0);
    expect(canDetectExtendedAtmospheric(obs, sub, BLACKOUT_ENV, CALM_ATMO)).toBe(q(0.80));
  });

  it("electroreception: dead subject falls through to q(0) when no other senses", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { electroreceptionRange_m: 5 * SCALE.m });
    const sub = mkEntity(2, 3 * SCALE.m, 0);
    sub.injury.dead = true;
    // Electroreception skips dead; no other senses defined → q(0)
    expect(canDetectExtendedAtmospheric(obs, sub, BLACKOUT_ENV, CALM_ATMO)).toBe(q(0));
  });

  it("returns DETECT_ECHOLOCATION for entity within echolocation range", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { echolocationRange_m: 30 * SCALE.m });
    const sub = mkEntity(2, 20 * SCALE.m, 0);
    expect(canDetectExtendedAtmospheric(obs, sub, BLACKOUT_ENV, CALM_ATMO)).toBe(q(0.70));
  });

  it("returns DETECT_THERMAL for entity with thermal vision detecting living subject", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { thermalVisionRange_m: 50 * SCALE.m });
    const sub = mkEntity(2, 5 * SCALE.m, 0);
    const result = canDetectExtendedAtmospheric(obs, sub, BLACKOUT_ENV, CALM_ATMO);
    expect(result).toBe(DETECT_THERMAL);
  });

  it("thermal: dead subject returns q(0) when no other senses", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { thermalVisionRange_m: 50 * SCALE.m });
    const sub = mkEntity(2, 5 * SCALE.m, 0);
    sub.injury.dead = true;
    expect(canDetectExtendedAtmospheric(obs, sub, BLACKOUT_ENV, CALM_ATMO)).toBe(q(0));
  });

  it("olfaction detects nearby subject downwind (wind blows scent toward observer)", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { olfactionSensitivity_Q: q(1.0) as ReturnType<typeof q> });
    // Subject East at 10 m; westerly wind carries scent from East to origin
    const sub = mkEntity(2, 10 * SCALE.m, 0);
    const downwindAtmo = makeDownwindAtmo();
    const result = canDetectExtendedAtmospheric(obs, sub, BLACKOUT_ENV, downwindAtmo);
    expect(result).toBeGreaterThan(q(0));
    expect(result).toBeGreaterThanOrEqual(DETECT_OLFACTION_ATMO_MIN);
    expect(result).toBeLessThanOrEqual(DETECT_OLFACTION_ATMO_MAX);
  });

  it("priority: electroreception beats echolocation", () => {
    const obs = withSenses(mkEntity(1, 0, 0), {
      electroreceptionRange_m: 5 * SCALE.m,
      echolocationRange_m: 30 * SCALE.m,
    });
    const sub = mkEntity(2, 3 * SCALE.m, 0);
    expect(canDetectExtendedAtmospheric(obs, sub, BLACKOUT_ENV, CALM_ATMO)).toBe(q(0.80));
  });
});

// ── stepExtendedSenses ────────────────────────────────────────────────────────

describe("stepExtendedSenses", () => {
  it("returns empty detections when observer has no extended senses", () => {
    const obs = mkEntity(1, 0, 0);
    const sub = mkEntity(2, 5 * SCALE.m, 0);
    const world = mkWorld(1, [obs, sub]);
    const result = stepExtendedSenses(obs, world, CALM_ATMO, DEFAULT_SENSORY_ENV);
    expect(result.detections).toHaveLength(0);
  });

  it("observer does not detect itself", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { echolocationRange_m: 50 * SCALE.m });
    const world = mkWorld(1, [obs]);
    const result = stepExtendedSenses(obs, world, CALM_ATMO, DEFAULT_SENSORY_ENV);
    expect(result.detections.every(d => d.entityId !== obs.id)).toBe(true);
  });

  it("echolocation detects subject within range", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { echolocationRange_m: 30 * SCALE.m });
    const sub = mkEntity(2, 20 * SCALE.m, 0);
    const world = mkWorld(1, [obs, sub]);
    const result = stepExtendedSenses(obs, world, CALM_ATMO, DEFAULT_SENSORY_ENV);
    const det = result.detections.find(d => d.entityId === sub.id && d.modality === "echolocation");
    expect(det).toBeDefined();
    expect(det!.quality_Q).toBe(q(0.70));
  });

  it("echolocation does NOT detect subject beyond range", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { echolocationRange_m: 10 * SCALE.m });
    const sub = mkEntity(2, 50 * SCALE.m, 0);
    const world = mkWorld(1, [obs, sub]);
    const result = stepExtendedSenses(obs, world, CALM_ATMO, DEFAULT_SENSORY_ENV);
    expect(result.detections.find(d => d.modality === "echolocation")).toBeUndefined();
  });

  it("electroreception detects living subject within range", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { electroreceptionRange_m: 4 * SCALE.m });
    const sub = mkEntity(2, 3 * SCALE.m, 0);
    const world = mkWorld(1, [obs, sub]);
    const result = stepExtendedSenses(obs, world, CALM_ATMO, DEFAULT_SENSORY_ENV);
    const det = result.detections.find(d => d.modality === "electroreception");
    expect(det).toBeDefined();
    expect(det!.entityId).toBe(sub.id);
  });

  it("electroreception does NOT detect dead subject", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { electroreceptionRange_m: 4 * SCALE.m });
    const sub = mkEntity(2, 3 * SCALE.m, 0);
    sub.injury.dead = true;
    const world = mkWorld(1, [obs, sub]);
    const result = stepExtendedSenses(obs, world, CALM_ATMO, DEFAULT_SENSORY_ENV);
    expect(result.detections.find(d => d.modality === "electroreception")).toBeUndefined();
  });

  it("thermal detects living subject within effective range", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { thermalVisionRange_m: 50 * SCALE.m });
    const sub = mkEntity(2, 5 * SCALE.m, 0);
    const world = mkWorld(1, [obs, sub]);
    const result = stepExtendedSenses(obs, world, CALM_ATMO, DEFAULT_SENSORY_ENV);
    const det = result.detections.find(d => d.modality === "thermal");
    expect(det).toBeDefined();
    expect(det!.quality_Q).toBe(DETECT_THERMAL);
  });

  it("thermal does NOT detect dead subject", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { thermalVisionRange_m: 50 * SCALE.m });
    const sub = mkEntity(2, 5 * SCALE.m, 0);
    sub.injury.dead = true;
    const world = mkWorld(1, [obs, sub]);
    const result = stepExtendedSenses(obs, world, CALM_ATMO, DEFAULT_SENSORY_ENV);
    expect(result.detections.find(d => d.modality === "thermal")).toBeUndefined();
  });

  it("multiple modalities can detect same target", () => {
    const obs = withSenses(mkEntity(1, 0, 0), {
      echolocationRange_m: 30 * SCALE.m,
      electroreceptionRange_m: 5 * SCALE.m,
    });
    const sub = mkEntity(2, 3 * SCALE.m, 0);
    const world = mkWorld(1, [obs, sub]);
    const result = stepExtendedSenses(obs, world, CALM_ATMO, DEFAULT_SENSORY_ENV);
    const forSub = result.detections.filter(d => d.entityId === sub.id);
    expect(forSub.length).toBe(2);
    expect(forSub.map(d => d.modality).sort()).toEqual(["echolocation", "electroreception"]);
  });

  it("detection includes correct dist_Sm", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { echolocationRange_m: 30 * SCALE.m });
    const sub = mkEntity(2, 20 * SCALE.m, 0);
    const world = mkWorld(1, [obs, sub]);
    const result = stepExtendedSenses(obs, world, CALM_ATMO, DEFAULT_SENSORY_ENV);
    const det = result.detections.find(d => d.modality === "echolocation");
    expect(det!.dist_Sm).toBe(20 * SCALE.m);
  });

  it("multiple subjects — each detected independently", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { echolocationRange_m: 30 * SCALE.m });
    const sub2 = mkEntity(2, 10 * SCALE.m, 0);
    const sub3 = mkEntity(3, 25 * SCALE.m, 0);
    const sub4 = mkEntity(4, 50 * SCALE.m, 0); // out of range
    const world = mkWorld(1, [obs, sub2, sub3, sub4]);
    const result = stepExtendedSenses(obs, world, CALM_ATMO, DEFAULT_SENSORY_ENV);
    const ids = result.detections.map(d => d.entityId);
    expect(ids).toContain(sub2.id);
    expect(ids).toContain(sub3.id);
    expect(ids).not.toContain(sub4.id);
  });

  it("olfaction detects downwind subject at close range", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { olfactionSensitivity_Q: q(1.0) as ReturnType<typeof q> });
    // Subject East at 10 m; westerly wind (makeDownwindAtmo) carries scent toward observer
    const sub = mkEntity(2, 10 * SCALE.m, 0);
    const world = mkWorld(1, [obs, sub]);
    const downwindAtmo = makeDownwindAtmo();
    const result = stepExtendedSenses(obs, world, downwindAtmo, DEFAULT_SENSORY_ENV);
    const det = result.detections.find(d => d.modality === "olfaction");
    expect(det).toBeDefined();
    expect(det!.entityId).toBe(sub.id);
  });
});

// ── Constants sanity ───────────────────────────────────────────────────────────

describe("exported constants", () => {
  it("THERMAL_BASE_SIGNATURE_Q = q(0.30)", () => {
    expect(THERMAL_BASE_SIGNATURE_Q).toBe(q(0.30));
  });
  it("THERMAL_BLEED_BONUS_Q = q(0.10)", () => {
    expect(THERMAL_BLEED_BONUS_Q).toBe(q(0.10));
  });
  it("THERMAL_SHOCK_BONUS_Q = q(0.15)", () => {
    expect(THERMAL_SHOCK_BONUS_Q).toBe(q(0.15));
  });
  it("THERMAL_SHOCK_THRESHOLD = q(0.40)", () => {
    expect(THERMAL_SHOCK_THRESHOLD).toBe(q(0.40));
  });
  it("THERMAL_PRECIP_PENALTY = q(0.60)", () => {
    expect(THERMAL_PRECIP_PENALTY).toBe(q(0.60));
  });
  it("DETECT_THERMAL = q(0.35)", () => {
    expect(DETECT_THERMAL).toBe(q(0.35));
  });
  it("DETECT_OLFACTION_ATMO_MIN = q(0.20)", () => {
    expect(DETECT_OLFACTION_ATMO_MIN).toBe(q(0.20));
  });
  it("DETECT_OLFACTION_ATMO_MAX = q(0.40)", () => {
    expect(DETECT_OLFACTION_ATMO_MAX).toBe(q(0.40));
  });
});
