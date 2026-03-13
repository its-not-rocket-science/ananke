// test/hazard.test.ts — Phase 60: Environmental Hazard Zones

import { describe, it, expect } from "vitest";
import { q, to, SCALE } from "../src/units.js";
import {
  ALL_HAZARD_TYPES,
  ALL_SAMPLE_HAZARDS,
  CAMPFIRE,
  RADIATION_ZONE,
  MUSTARD_GAS,
  ACID_POOL,
  BLIZZARD_ZONE,
  computeDistToHazard,
  isInsideHazard,
  computeHazardExposure,
  deriveHazardEffect,
  stepHazardZone,
  isHazardExpired,
  type HazardZone,
  type HazardType,
} from "../src/sim/hazard.js";

// ── Data integrity ─────────────────────────────────────────────────────────────

describe("data integrity", () => {
  it("ALL_HAZARD_TYPES has 5 entries", () => {
    expect(ALL_HAZARD_TYPES.length).toBe(5);
  });

  it("ALL_HAZARD_TYPES contains all five types", () => {
    const types: HazardType[] = ["fire", "radiation", "toxic_gas", "acid", "extreme_cold"];
    for (const t of types) {
      expect(ALL_HAZARD_TYPES).toContain(t);
    }
  });

  it("ALL_SAMPLE_HAZARDS has 5 entries", () => {
    expect(ALL_SAMPLE_HAZARDS.length).toBe(5);
  });

  it("all sample hazards have unique ids", () => {
    const ids = ALL_SAMPLE_HAZARDS.map(h => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all sample hazards have positive radius and intensity", () => {
    for (const h of ALL_SAMPLE_HAZARDS) {
      expect(h.radius_Sm).toBeGreaterThan(0);
      expect(h.intensity_Q).toBeGreaterThan(0);
      expect(h.intensity_Q).toBeLessThanOrEqual(SCALE.Q);
    }
  });

  it("RADIATION_ZONE durationSeconds === -1 (permanent)", () => {
    expect(RADIATION_ZONE.durationSeconds).toBe(-1);
  });

  it("all finite-duration hazards have durationSeconds > 0", () => {
    for (const h of ALL_SAMPLE_HAZARDS) {
      if (h.id !== "radiation_zone") {
        expect(h.durationSeconds).toBeGreaterThan(0);
      }
    }
  });

  it("BLIZZARD_ZONE radius > RADIATION_ZONE radius > MUSTARD_GAS radius > CAMPFIRE radius", () => {
    expect(BLIZZARD_ZONE.radius_Sm).toBeGreaterThan(RADIATION_ZONE.radius_Sm);
    expect(RADIATION_ZONE.radius_Sm).toBeGreaterThan(MUSTARD_GAS.radius_Sm);
    expect(MUSTARD_GAS.radius_Sm).toBeGreaterThan(CAMPFIRE.radius_Sm);
  });

  it("CAMPFIRE type is 'fire'", () => {
    expect(CAMPFIRE.type).toBe("fire");
  });

  it("MUSTARD_GAS type is 'toxic_gas'", () => {
    expect(MUSTARD_GAS.type).toBe("toxic_gas");
  });

  it("ACID_POOL type is 'acid'", () => {
    expect(ACID_POOL.type).toBe("acid");
  });

  it("BLIZZARD_ZONE type is 'extreme_cold'", () => {
    expect(BLIZZARD_ZONE.type).toBe("extreme_cold");
  });
});

// ── computeDistToHazard ────────────────────────────────────────────────────────

describe("computeDistToHazard", () => {
  it("returns 0 at hazard centre", () => {
    const h: HazardZone = { ...CAMPFIRE, x_Sm: to.m(10), y_Sm: to.m(20) };
    expect(computeDistToHazard(to.m(10), to.m(20), h)).toBe(0);
  });

  it("returns correct distance for axis-aligned offset", () => {
    const h: HazardZone = { ...CAMPFIRE, x_Sm: 0, y_Sm: 0 };
    // 3 m along x-axis
    const dist = computeDistToHazard(to.m(3), 0, h);
    expect(dist).toBe(to.m(3));
  });

  it("uses Euclidean distance (3-4-5 triangle)", () => {
    const h: HazardZone = { ...CAMPFIRE, x_Sm: 0, y_Sm: 0 };
    const dist = computeDistToHazard(to.m(3), to.m(4), h);
    // Expected: 5 m = to.m(5) = 50000 (truncated float sqrt)
    expect(dist).toBe(to.m(5));
  });

  it("works with negative coordinates", () => {
    const h: HazardZone = { ...CAMPFIRE, x_Sm: to.m(-5), y_Sm: to.m(-5) };
    const dist = computeDistToHazard(to.m(-5), to.m(-5), h);
    expect(dist).toBe(0);
  });

  it("is symmetric (dist A→B == B→A)", () => {
    const h: HazardZone = { ...CAMPFIRE, x_Sm: to.m(10), y_Sm: to.m(10) };
    const d1 = computeDistToHazard(to.m(13), to.m(14), h);
    const d2 = computeDistToHazard(to.m(10) + (to.m(13) - to.m(10)), to.m(10) + (to.m(14) - to.m(10)), h);
    expect(d1).toBe(d2);
  });
});

// ── isInsideHazard ─────────────────────────────────────────────────────────────

describe("isInsideHazard", () => {
  it("returns true at the hazard centre", () => {
    expect(isInsideHazard(CAMPFIRE.x_Sm, CAMPFIRE.y_Sm, CAMPFIRE)).toBe(true);
  });

  it("returns true just inside the radius", () => {
    // CAMPFIRE radius = 3 m; place entity at 2.9 m
    expect(isInsideHazard(to.m(2.9), 0, CAMPFIRE)).toBe(true);
  });

  it("returns true on the boundary (exactly at radius)", () => {
    expect(isInsideHazard(CAMPFIRE.radius_Sm, 0, CAMPFIRE)).toBe(true);
  });

  it("returns false just outside the radius", () => {
    // 3.1 m from a 3 m radius hazard
    expect(isInsideHazard(to.m(3.1), 0, CAMPFIRE)).toBe(false);
  });

  it("returns false well outside the radius", () => {
    expect(isInsideHazard(to.m(100), 0, CAMPFIRE)).toBe(false);
  });

  it("works for RADIATION_ZONE (50 m radius)", () => {
    expect(isInsideHazard(to.m(49), 0, RADIATION_ZONE)).toBe(true);
    expect(isInsideHazard(to.m(51), 0, RADIATION_ZONE)).toBe(false);
  });
});

// ── computeHazardExposure ──────────────────────────────────────────────────────

describe("computeHazardExposure", () => {
  it("returns intensity_Q at the hazard centre (dist = 0)", () => {
    const exp = computeHazardExposure(0, CAMPFIRE);
    expect(exp).toBe(CAMPFIRE.intensity_Q);
  });

  it("returns q(0) at or beyond the radius", () => {
    expect(computeHazardExposure(CAMPFIRE.radius_Sm, CAMPFIRE)).toBe(q(0));
    expect(computeHazardExposure(CAMPFIRE.radius_Sm + 1, CAMPFIRE)).toBe(q(0));
    expect(computeHazardExposure(to.m(999), CAMPFIRE)).toBe(q(0));
  });

  it("exposure decreases monotonically as distance increases", () => {
    const d1 = computeHazardExposure(to.m(0.5), CAMPFIRE);
    const d2 = computeHazardExposure(to.m(1.0), CAMPFIRE);
    const d3 = computeHazardExposure(to.m(2.0), CAMPFIRE);
    expect(d1).toBeGreaterThan(d2);
    expect(d2).toBeGreaterThan(d3);
  });

  it("midpoint exposure is roughly half the centre intensity (linear falloff)", () => {
    const midDist = CAMPFIRE.radius_Sm / 2;
    const exp = computeHazardExposure(midDist, CAMPFIRE);
    // Linear falloff: (radius - radius/2) * intensity / radius = intensity/2
    const expected = Math.round(CAMPFIRE.intensity_Q / 2);
    expect(exp).toBeCloseTo(expected, -1);  // within 10 units of SCALE.Q
  });

  it("returns q(0) for zero-intensity hazard", () => {
    const zeroH: HazardZone = { ...CAMPFIRE, intensity_Q: q(0) as any };
    expect(computeHazardExposure(0, zeroH)).toBe(q(0));
  });

  it("result is always in [0, SCALE.Q]", () => {
    for (const h of ALL_SAMPLE_HAZARDS) {
      for (const d of [0, h.radius_Sm / 4, h.radius_Sm / 2, h.radius_Sm - 1, h.radius_Sm]) {
        const exp = computeHazardExposure(d, h);
        expect(exp).toBeGreaterThanOrEqual(0);
        expect(exp).toBeLessThanOrEqual(SCALE.Q);
      }
    }
  });
});

// ── deriveHazardEffect ─────────────────────────────────────────────────────────

describe("deriveHazardEffect", () => {
  it("returns all-zero effect when exposureQ = 0", () => {
    const eff = deriveHazardEffect(CAMPFIRE, q(0) as any);
    expect(eff.fatigueInc_Q).toBe(0);
    expect(eff.thermalDelta_Q).toBe(0);
    expect(eff.radiationDose_Q).toBe(0);
    expect(eff.surfaceDamageInc_Q).toBe(0);
    expect(eff.diseaseExposureId).toBeUndefined();
  });

  it("fire at full exposure: positive thermalDelta and fatigue", () => {
    const eff = deriveHazardEffect(CAMPFIRE, SCALE.Q as any);
    expect(eff.thermalDelta_Q).toBeGreaterThan(0);
    expect(eff.fatigueInc_Q).toBeGreaterThan(0);
  });

  it("fire at full exposure: no radiation dose", () => {
    const eff = deriveHazardEffect(CAMPFIRE, SCALE.Q as any);
    expect(eff.radiationDose_Q).toBe(0);
  });

  it("radiation at full exposure: non-zero dose, zero fatigue", () => {
    const eff = deriveHazardEffect(RADIATION_ZONE, SCALE.Q as any);
    expect(eff.radiationDose_Q).toBeGreaterThan(0);
    expect(eff.fatigueInc_Q).toBe(0);
  });

  it("toxic_gas at full exposure: sets diseaseExposureId", () => {
    const eff = deriveHazardEffect(MUSTARD_GAS, SCALE.Q as any);
    expect(eff.diseaseExposureId).toBe("marsh_fever");
  });

  it("acid at full exposure: surface damage > fire surface damage", () => {
    const acidEff = deriveHazardEffect(ACID_POOL, SCALE.Q as any);
    const fireEff = deriveHazardEffect(CAMPFIRE, SCALE.Q as any);
    expect(acidEff.surfaceDamageInc_Q).toBeGreaterThan(fireEff.surfaceDamageInc_Q);
  });

  it("extreme_cold: thermalDelta is negative (cooling)", () => {
    const eff = deriveHazardEffect(BLIZZARD_ZONE, SCALE.Q as any);
    expect(eff.thermalDelta_Q).toBeLessThan(0);
  });

  it("extreme_cold: fatigue > 0 (shivering)", () => {
    const eff = deriveHazardEffect(BLIZZARD_ZONE, SCALE.Q as any);
    expect(eff.fatigueInc_Q).toBeGreaterThan(0);
  });

  it("higher exposure → higher fatigueInc_Q (monotone)", () => {
    const lo = deriveHazardEffect(CAMPFIRE, q(0.30) as any);
    const hi = deriveHazardEffect(CAMPFIRE, q(0.80) as any);
    expect(hi.fatigueInc_Q).toBeGreaterThan(lo.fatigueInc_Q);
  });

  it("higher exposure → higher radiationDose_Q for radiation type", () => {
    const lo = deriveHazardEffect(RADIATION_ZONE, q(0.20) as any);
    const hi = deriveHazardEffect(RADIATION_ZONE, q(0.80) as any);
    expect(hi.radiationDose_Q).toBeGreaterThan(lo.radiationDose_Q);
  });

  it("all effect fields are non-negative except thermalDelta", () => {
    for (const h of ALL_SAMPLE_HAZARDS) {
      const eff = deriveHazardEffect(h, q(0.50) as any);
      expect(eff.fatigueInc_Q).toBeGreaterThanOrEqual(0);
      expect(eff.radiationDose_Q).toBeGreaterThanOrEqual(0);
      expect(eff.surfaceDamageInc_Q).toBeGreaterThanOrEqual(0);
    }
  });

  it("diseaseExposureId is undefined for non-gas hazards", () => {
    for (const h of [CAMPFIRE, RADIATION_ZONE, ACID_POOL, BLIZZARD_ZONE]) {
      const eff = deriveHazardEffect(h, q(0.80) as any);
      expect(eff.diseaseExposureId).toBeUndefined();
    }
  });
});

// ── stepHazardZone ─────────────────────────────────────────────────────────────

describe("stepHazardZone", () => {
  it("decrements durationSeconds by elapsed time", () => {
    const h: HazardZone = { ...CAMPFIRE, durationSeconds: 100 };
    stepHazardZone(h, 30);
    expect(h.durationSeconds).toBe(70);
  });

  it("clamps durationSeconds to 0 (never negative)", () => {
    const h: HazardZone = { ...CAMPFIRE, durationSeconds: 10 };
    stepHazardZone(h, 50);
    expect(h.durationSeconds).toBe(0);
  });

  it("is a no-op for permanent hazards (durationSeconds === -1)", () => {
    const h: HazardZone = { ...RADIATION_ZONE };
    stepHazardZone(h, 9999);
    expect(h.durationSeconds).toBe(-1);
  });

  it("step by zero seconds leaves duration unchanged", () => {
    const h: HazardZone = { ...CAMPFIRE, durationSeconds: 500 };
    stepHazardZone(h, 0);
    expect(h.durationSeconds).toBe(500);
  });

  it("successive steps accumulate correctly", () => {
    const h: HazardZone = { ...CAMPFIRE, durationSeconds: 100 };
    stepHazardZone(h, 30);
    stepHazardZone(h, 40);
    expect(h.durationSeconds).toBe(30);
  });
});

// ── isHazardExpired ────────────────────────────────────────────────────────────

describe("isHazardExpired", () => {
  it("returns false when durationSeconds > 0", () => {
    const h: HazardZone = { ...CAMPFIRE, durationSeconds: 100 };
    expect(isHazardExpired(h)).toBe(false);
  });

  it("returns true when durationSeconds === 0", () => {
    const h: HazardZone = { ...CAMPFIRE, durationSeconds: 0 };
    expect(isHazardExpired(h)).toBe(true);
  });

  it("returns false for permanent hazards (durationSeconds === -1)", () => {
    expect(isHazardExpired(RADIATION_ZONE)).toBe(false);
  });

  it("returns true after being fully stepped down", () => {
    const h: HazardZone = { ...CAMPFIRE, durationSeconds: 10 };
    stepHazardZone(h, 10);
    expect(isHazardExpired(h)).toBe(true);
  });

  it("returns false when stepped but not yet exhausted", () => {
    const h: HazardZone = { ...CAMPFIRE, durationSeconds: 100 };
    stepHazardZone(h, 50);
    expect(isHazardExpired(h)).toBe(false);
  });
});

// ── Integration: distance → exposure → effect pipeline ────────────────────────

describe("pipeline: dist → exposure → effect", () => {
  it("entity at centre of CAMPFIRE has positive fatigue rate", () => {
    const dist = computeDistToHazard(0, 0, CAMPFIRE);
    const exp  = computeHazardExposure(dist, CAMPFIRE);
    const eff  = deriveHazardEffect(CAMPFIRE, exp);
    expect(eff.fatigueInc_Q).toBeGreaterThan(0);
  });

  it("entity outside CAMPFIRE has zero effect", () => {
    const dist = computeDistToHazard(to.m(10), 0, CAMPFIRE);
    const exp  = computeHazardExposure(dist, CAMPFIRE);
    const eff  = deriveHazardEffect(CAMPFIRE, exp);
    expect(eff.fatigueInc_Q).toBe(0);
    expect(eff.thermalDelta_Q).toBe(0);
  });

  it("entity inside RADIATION_ZONE accumulates radiation dose", () => {
    const dist = computeDistToHazard(to.m(10), 0, RADIATION_ZONE);
    const exp  = computeHazardExposure(dist, RADIATION_ZONE);
    const eff  = deriveHazardEffect(RADIATION_ZONE, exp);
    expect(eff.radiationDose_Q).toBeGreaterThan(0);
  });

  it("entity inside MUSTARD_GAS gets disease exposure id", () => {
    const dist = computeDistToHazard(to.m(5), 0, MUSTARD_GAS);
    const exp  = computeHazardExposure(dist, MUSTARD_GAS);
    const eff  = deriveHazardEffect(MUSTARD_GAS, exp);
    expect(eff.diseaseExposureId).toBe("marsh_fever");
  });

  it("entity closer to CAMPFIRE has more fatigue than entity further away", () => {
    const d1   = computeDistToHazard(to.m(0.5), 0, CAMPFIRE);
    const d2   = computeDistToHazard(to.m(2.0), 0, CAMPFIRE);
    const exp1 = computeHazardExposure(d1, CAMPFIRE);
    const exp2 = computeHazardExposure(d2, CAMPFIRE);
    const eff1 = deriveHazardEffect(CAMPFIRE, exp1);
    const eff2 = deriveHazardEffect(CAMPFIRE, exp2);
    expect(eff1.fatigueInc_Q).toBeGreaterThan(eff2.fatigueInc_Q);
  });
});
