// test/epidemic.test.ts — Phase 88: Epidemic Spread at Polity Scale

import { describe, it, expect } from "vitest";
import {
  EPIDEMIC_CONTAINED_Q,
  EPIDEMIC_MIGRATION_PUSH_MAX_Q,
  HEALTH_CAPACITY_BY_ERA,
  createEpidemicState,
  deriveHealthCapacity,
  computeEpidemicDeathPressure,
  stepEpidemic,
  computeSpreadToPolity,
  spreadEpidemic,
  computeEpidemicMigrationPush,
} from "../src/epidemic.js";
import { createPolity } from "../src/polity.js";
import { getDiseaseProfile } from "../src/sim/disease.js";
import { q, SCALE, mulDiv } from "../src/units.js";
import type { Q } from "../src/units.js";
import type { DiseaseProfile } from "../src/sim/disease.js";
import type { TechEra } from "../src/sim/tech.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** High-transmission, high-mortality disease (plague-like). */
const PLAGUE_PROFILE: DiseaseProfile = {
  id:                     "test_plague",
  name:                   "Test Plague",
  transmissionRoute:      "airborne",
  baseTransmissionRate_Q: q(0.80) as Q,
  incubationPeriod_s:     3 * 86400,
  symptomaticDuration_s:  14 * 86400,
  mortalityRate_Q:        q(0.60) as Q,
  symptomSeverity_Q:      q(0.50) as Q,
  airborneRange_Sm:       50_000,
  immunityDuration_s:     -1,
};

/** Mild, low-mortality disease. */
const MILD_PROFILE: DiseaseProfile = {
  id:                     "test_mild",
  name:                   "Test Mild",
  transmissionRoute:      "contact",
  baseTransmissionRate_Q: q(0.20) as Q,
  incubationPeriod_s:     7 * 86400,
  symptomaticDuration_s:  7 * 86400,
  mortalityRate_Q:        q(0.01) as Q,
  symptomSeverity_Q:      q(0.10) as Q,
  airborneRange_Sm:       0,
  immunityDuration_s:     90 * 86400,
};

function makePolity(techEra = "Medieval", stability = q(0.70) as Q) {
  const p = createPolity("p1", "Test", "f1", [], 50_000, 500_000, techEra as TechEra);
  p.stabilityQ = stability;
  return p;
}

// ── Constants ──────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("EPIDEMIC_CONTAINED_Q is q(0.01)", () => {
    expect(EPIDEMIC_CONTAINED_Q).toBe(q(0.01));
  });

  it("EPIDEMIC_MIGRATION_PUSH_MAX_Q is q(0.20)", () => {
    expect(EPIDEMIC_MIGRATION_PUSH_MAX_Q).toBe(q(0.20));
  });

  it("HEALTH_CAPACITY_BY_ERA Medieval is q(0.40)", () => {
    expect(HEALTH_CAPACITY_BY_ERA["Medieval"]).toBe(q(0.40));
  });

  it("HEALTH_CAPACITY_BY_ERA Modern is q(0.99)", () => {
    expect(HEALTH_CAPACITY_BY_ERA["Modern"]).toBe(q(0.99));
  });

  it("HEALTH_CAPACITY_BY_ERA Stone is q(0.05)", () => {
    expect(HEALTH_CAPACITY_BY_ERA["Stone"]).toBe(q(0.05));
  });
});

// ── createEpidemicState ────────────────────────────────────────────────────────

describe("createEpidemicState", () => {
  it("sets polityId and diseaseId", () => {
    const s = createEpidemicState("p1", "plague");
    expect(s.polityId).toBe("p1");
    expect(s.diseaseId).toBe("plague");
  });

  it("defaults initial prevalence to q(0.01)", () => {
    const s = createEpidemicState("p1", "plague");
    expect(s.prevalence_Q).toBe(q(0.01));
  });

  it("accepts a custom initial prevalence", () => {
    const s = createEpidemicState("p1", "plague", q(0.10) as Q);
    expect(s.prevalence_Q).toBe(q(0.10));
  });

  it("clamps initial prevalence to [0, SCALE.Q]", () => {
    const over  = createEpidemicState("p1", "d", (SCALE.Q * 2) as Q);
    const under = createEpidemicState("p1", "d", -100 as Q);
    expect(over.prevalence_Q).toBe(SCALE.Q);
    expect(under.prevalence_Q).toBe(0);
  });
});

// ── deriveHealthCapacity ───────────────────────────────────────────────────────

describe("deriveHealthCapacity", () => {
  it("returns correct capacity for each tech era", () => {
    const eras: [string, Q][] = [
      ["Stone",       q(0.05) as Q],
      ["Medieval",    q(0.40) as Q],
      ["Industrial",  q(0.80) as Q],
    ];
    for (const [era, expected] of eras) {
      expect(deriveHealthCapacity(makePolity(era))).toBe(expected);
    }
  });

  it("unknown era falls back to Stone capacity", () => {
    expect(deriveHealthCapacity(makePolity("FuturisticUnknown"))).toBe(q(0.05));
  });

  it("Modern era has near-full capacity", () => {
    expect(deriveHealthCapacity(makePolity("Modern"))).toBeGreaterThan(q(0.90));
  });
});

// ── computeEpidemicDeathPressure ───────────────────────────────────────────────

describe("computeEpidemicDeathPressure", () => {
  it("zero prevalence yields zero death pressure", () => {
    const s = createEpidemicState("p1", "plague", 0 as Q);
    expect(computeEpidemicDeathPressure(s, PLAGUE_PROFILE)).toBe(0);
  });

  it("death pressure = prevalence × mortalityRate / SCALE.Q", () => {
    const s = createEpidemicState("p1", "plague", q(0.10) as Q);
    const expected = mulDiv(q(0.10), PLAGUE_PROFILE.mortalityRate_Q, SCALE.Q);
    expect(computeEpidemicDeathPressure(s, PLAGUE_PROFILE)).toBe(expected);
  });

  it("full prevalence plague gives mortalityRate as death pressure", () => {
    const s = createEpidemicState("p1", "plague", SCALE.Q as Q);
    expect(computeEpidemicDeathPressure(s, PLAGUE_PROFILE)).toBe(PLAGUE_PROFILE.mortalityRate_Q);
  });

  it("mild disease has low death pressure even at moderate prevalence", () => {
    const s = createEpidemicState("p1", "mild", q(0.30) as Q);
    expect(computeEpidemicDeathPressure(s, MILD_PROFILE)).toBeLessThan(q(0.01));
  });

  it("result is clamped to [0, SCALE.Q]", () => {
    const s = createEpidemicState("p1", "plague", SCALE.Q as Q);
    const pressure = computeEpidemicDeathPressure(s, PLAGUE_PROFILE);
    expect(pressure).toBeLessThanOrEqual(SCALE.Q);
    expect(pressure).toBeGreaterThanOrEqual(0);
  });
});

// ── stepEpidemic ───────────────────────────────────────────────────────────────

describe("stepEpidemic", () => {
  it("high-transmission disease grows from low initial prevalence", () => {
    const s = createEpidemicState("p1", "plague", q(0.05) as Q);
    const r = stepEpidemic(s, PLAGUE_PROFILE, 30);
    expect(r.delta_Q).toBeGreaterThan(0);
    expect(r.newPrevalence_Q).toBeGreaterThan(q(0.05));
  });

  it("low-transmission disease recovers from low prevalence", () => {
    // With mild disease, recovery > growth at low prevalence if health capacity is high
    const s = createEpidemicState("p1", "mild", q(0.02) as Q);
    const r = stepEpidemic(s, MILD_PROFILE, 30, SCALE.Q as Q);  // max health
    expect(r.delta_Q).toBeLessThan(0);
    expect(r.newPrevalence_Q).toBeLessThan(q(0.02));
  });

  it("mutates state prevalence in place", () => {
    const s = createEpidemicState("p1", "plague", q(0.10) as Q);
    const r = stepEpidemic(s, PLAGUE_PROFILE, 1);
    expect(s.prevalence_Q).toBe(r.newPrevalence_Q);
  });

  it("prevalence never exceeds SCALE.Q", () => {
    const s = createEpidemicState("p1", "plague", q(0.90) as Q);
    const r = stepEpidemic(s, PLAGUE_PROFILE, 365);
    expect(r.newPrevalence_Q).toBeLessThanOrEqual(SCALE.Q);
  });

  it("prevalence never goes below zero", () => {
    const s = createEpidemicState("p1", "mild", q(0.01) as Q);
    const r = stepEpidemic(s, MILD_PROFILE, 365, SCALE.Q as Q);
    expect(r.newPrevalence_Q).toBeGreaterThanOrEqual(0);
  });

  it("contained flag set when prevalence drops to EPIDEMIC_CONTAINED_Q", () => {
    const s = createEpidemicState("p1", "mild", q(0.005) as Q);
    const r = stepEpidemic(s, MILD_PROFILE, 1, SCALE.Q as Q);
    // already below contained threshold
    expect(r.contained).toBe(true);
  });

  it("contained flag false when prevalence is above threshold", () => {
    const s = createEpidemicState("p1", "plague", q(0.20) as Q);
    const r = stepEpidemic(s, PLAGUE_PROFILE, 1);
    expect(r.contained).toBe(false);
  });

  it("higher health capacity reduces net growth", () => {
    const s1 = createEpidemicState("p1", "plague", q(0.20) as Q);
    const s2 = createEpidemicState("p1", "plague", q(0.20) as Q);
    const r1  = stepEpidemic(s1, PLAGUE_PROFILE, 30, q(0.10) as Q);  // low health
    const r2  = stepEpidemic(s2, PLAGUE_PROFILE, 30, q(0.90) as Q);  // high health
    expect(r2.newPrevalence_Q).toBeLessThan(r1.newPrevalence_Q);
  });

  it("longer step produces larger absolute change", () => {
    const s1 = createEpidemicState("p1", "plague", q(0.10) as Q);
    const _s2 = createEpidemicState("p1", "plague", q(0.10) as Q);
    const r1 = stepEpidemic(s1, PLAGUE_PROFILE, 7);
    const s3 = createEpidemicState("p1", "plague", q(0.10) as Q);
    const r2 = stepEpidemic(s3, PLAGUE_PROFILE, 30);
    expect(Math.abs(r2.delta_Q)).toBeGreaterThan(Math.abs(r1.delta_Q));
  });

  it("epidemic slows near full prevalence (logistic ceiling)", () => {
    const sLow  = createEpidemicState("p1", "plague", q(0.10) as Q);
    const sHigh = createEpidemicState("p1", "plague", q(0.90) as Q);
    const rLow  = stepEpidemic(sLow,  PLAGUE_PROFILE, 7);
    const rHigh = stepEpidemic(sHigh, PLAGUE_PROFILE, 7);
    // Growth at low prevalence is much higher than at high prevalence
    expect(rLow.delta_Q).toBeGreaterThan(rHigh.delta_Q);
  });
});

// ── computeSpreadToPolity ──────────────────────────────────────────────────────

describe("computeSpreadToPolity", () => {
  it("returns 0 when source is contained", () => {
    const s = createEpidemicState("p1", "plague", q(0.005) as Q); // below CONTAINED
    expect(computeSpreadToPolity(s, PLAGUE_PROFILE, q(0.50) as Q)).toBe(0);
  });

  it("spread increases with contact intensity", () => {
    const s  = createEpidemicState("p1", "plague", q(0.20) as Q);
    const lo = computeSpreadToPolity(s, PLAGUE_PROFILE, q(0.10) as Q);
    const hi = computeSpreadToPolity(s, PLAGUE_PROFILE, q(0.80) as Q);
    expect(hi).toBeGreaterThan(lo);
  });

  it("zero contact yields zero spread", () => {
    const s = createEpidemicState("p1", "plague", q(0.20) as Q);
    expect(computeSpreadToPolity(s, PLAGUE_PROFILE, 0 as Q)).toBe(0);
  });

  it("result is clamped to [0, SCALE.Q]", () => {
    const s    = createEpidemicState("p1", "plague", SCALE.Q as Q);
    const spread = computeSpreadToPolity(s, PLAGUE_PROFILE, SCALE.Q as Q);
    expect(spread).toBeLessThanOrEqual(SCALE.Q);
    expect(spread).toBeGreaterThanOrEqual(0);
  });
});

// ── spreadEpidemic ─────────────────────────────────────────────────────────────

describe("spreadEpidemic", () => {
  it("returns undefined when source is contained", () => {
    const s = createEpidemicState("p1", "plague", q(0.005) as Q);
    expect(spreadEpidemic(s, PLAGUE_PROFILE, "p2", q(0.80) as Q)).toBeUndefined();
  });

  it("creates new state for target when spread exceeds contained threshold", () => {
    const s = createEpidemicState("p1", "plague", q(0.20) as Q);
    const result = spreadEpidemic(s, PLAGUE_PROFILE, "p2", q(0.80) as Q);
    expect(result).toBeDefined();
    expect(result?.polityId).toBe("p2");
    expect(result?.diseaseId).toBe("test_plague");
    expect(result?.prevalence_Q).toBeGreaterThan(EPIDEMIC_CONTAINED_Q);
  });

  it("updates existing state if provided", () => {
    const source   = createEpidemicState("p1", "plague", q(0.30) as Q);
    const existing = createEpidemicState("p2", "plague", q(0.05) as Q);
    const before   = existing.prevalence_Q;
    const result   = spreadEpidemic(source, PLAGUE_PROFILE, "p2", q(0.60) as Q, existing);
    expect(result).toBe(existing);  // same object
    expect(existing.prevalence_Q).toBeGreaterThan(before);
  });

  it("low contact returns undefined (below contained threshold)", () => {
    const s = createEpidemicState("p1", "plague", q(0.015) as Q);
    // Very low contact → spread < EPIDEMIC_CONTAINED_Q
    const result = spreadEpidemic(s, MILD_PROFILE, "p2", q(0.01) as Q);
    expect(result).toBeUndefined();
  });
});

// ── computeEpidemicMigrationPush ───────────────────────────────────────────────

describe("computeEpidemicMigrationPush", () => {
  it("returns 0 for mild disease (below severity threshold)", () => {
    const s = createEpidemicState("p1", "mild", q(0.50) as Q);
    expect(computeEpidemicMigrationPush(s, MILD_PROFILE)).toBe(0);
  });

  it("returns positive push for severe disease above threshold", () => {
    const s = createEpidemicState("p1", "plague", q(0.20) as Q);
    expect(computeEpidemicMigrationPush(s, PLAGUE_PROFILE)).toBeGreaterThan(0);
  });

  it("migration push scales with prevalence", () => {
    const lo = createEpidemicState("p1", "plague", q(0.10) as Q);
    const hi = createEpidemicState("p1", "plague", q(0.50) as Q);
    expect(computeEpidemicMigrationPush(hi, PLAGUE_PROFILE))
      .toBeGreaterThan(computeEpidemicMigrationPush(lo, PLAGUE_PROFILE));
  });

  it("push at zero prevalence is zero", () => {
    const s = createEpidemicState("p1", "plague", 0 as Q);
    expect(computeEpidemicMigrationPush(s, PLAGUE_PROFILE)).toBe(0);
  });

  it("result is clamped to [0, SCALE.Q]", () => {
    const s    = createEpidemicState("p1", "plague", SCALE.Q as Q);
    const push = computeEpidemicMigrationPush(s, PLAGUE_PROFILE);
    expect(push).toBeLessThanOrEqual(SCALE.Q);
    expect(push).toBeGreaterThanOrEqual(0);
  });

  it("push cannot exceed EPIDEMIC_MIGRATION_PUSH_MAX_Q", () => {
    const s    = createEpidemicState("p1", "plague", SCALE.Q as Q);
    const push = computeEpidemicMigrationPush(s, PLAGUE_PROFILE);
    expect(push).toBeLessThanOrEqual(EPIDEMIC_MIGRATION_PUSH_MAX_Q);
  });
});

// ── Integration with real disease profiles ─────────────────────────────────────

describe("integration with getDiseaseProfile", () => {
  it("plague_pneumonic death pressure at 5% prevalence is significant", () => {
    const profile = getDiseaseProfile("plague_pneumonic");
    expect(profile).toBeDefined();
    if (!profile) return;
    const s = createEpidemicState("p1", "plague_pneumonic", q(0.05) as Q);
    const pressure = computeEpidemicDeathPressure(s, profile);
    // 5% × 60% mortality ≈ 3%/year extra — notable
    expect(pressure).toBeGreaterThan(q(0.02));
  });

  it("common_fever death pressure is near zero", () => {
    const profile = getDiseaseProfile("common_fever");
    expect(profile).toBeDefined();
    if (!profile) return;
    const s = createEpidemicState("p1", "common_fever", q(0.20) as Q);
    const pressure = computeEpidemicDeathPressure(s, profile);
    expect(pressure).toBe(0);  // mortalityRate_Q = q(0)
  });
});
