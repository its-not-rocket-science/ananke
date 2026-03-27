// test/wound-aging.test.ts — Phase 54: Wound Aging & Long-Term Sequelae

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import {
  stepWoundAging,
  recordTraumaEvent,
  deriveFearThresholdMul,
  deriveSepsisRisk,
  SECONDS_PER_DAY,
  SURFACE_HEAL_Q_PER_DAY,
  INFECTION_WORSEN_Q_PER_DAY,
  SEPSIS_THRESHOLD,
  PHANTOM_PAIN_THRESHOLD,
  TRAUMA_TRIGGER_THRESHOLD,
} from "../src/sim/wound-aging.js";
import { mkHumanoidEntity } from "../src/sim/testing.js";
import { defaultRegionInjury as _defaultRegionInjury } from "../src/sim/injury.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function freshEntity() {
  return mkHumanoidEntity(1, 1, 0, 0);
}

/** Set up a fresh entity with a single infected torso region at a given internalDamage. */
function entityWithInfectedRegion(internalDamage: number) {
  const e = freshEntity();
  e.injury.byRegion["torso"]!.internalDamage = internalDamage as ReturnType<typeof q>;
  e.injury.byRegion["torso"]!.infectedTick   = 0;   // infected
  return e;
}

/** Set up entity with given surface and internal damage (uninfected). */
function entityWithDamage(surfaceDmg: number, internalDmg: number, permanent = 0) {
  const e = freshEntity();
  const reg = e.injury.byRegion["torso"]!;
  reg.surfaceDamage   = surfaceDmg  as ReturnType<typeof q>;
  reg.internalDamage  = internalDmg as ReturnType<typeof q>;
  reg.permanentDamage = permanent   as ReturnType<typeof q>;
  return e;
}

// ── Healing (uninfected regions) ──────────────────────────────────────────────

describe("stepWoundAging — healing", () => {
  it("zero elapsed seconds → no change", () => {
    const e = entityWithDamage(q(0.50), q(0.30));
    const before = { ...e.injury.byRegion["torso"]! };
    stepWoundAging(e, 0);
    expect(e.injury.byRegion["torso"]!.surfaceDamage).toBe(before.surfaceDamage);
    expect(e.injury.byRegion["torso"]!.internalDamage).toBe(before.internalDamage);
  });

  it("uninfected region heals surface damage over 1 day", () => {
    const e = entityWithDamage(q(0.50), 0);
    const before = e.injury.byRegion["torso"]!.surfaceDamage;
    const result = stepWoundAging(e, SECONDS_PER_DAY);
    expect(e.injury.byRegion["torso"]!.surfaceDamage).toBeLessThan(before);
    expect(result.healedRegions).toContain("torso");
  });

  it("uninfected region heals internal damage over 1 day", () => {
    const e = entityWithDamage(0, q(0.50));
    const before = e.injury.byRegion["torso"]!.internalDamage;
    stepWoundAging(e, SECONDS_PER_DAY);
    expect(e.injury.byRegion["torso"]!.internalDamage).toBeLessThan(before);
  });

  it("surface heals faster than internal per day (higher Q/day rate)", () => {
    const e1 = entityWithDamage(q(0.50), 0);
    const e2 = entityWithDamage(0, q(0.50));
    stepWoundAging(e1, SECONDS_PER_DAY);
    stepWoundAging(e2, SECONDS_PER_DAY);
    const surfaceHealed   = q(0.50) - e1.injury.byRegion["torso"]!.surfaceDamage;
    const internalHealed  = q(0.50) - e2.injury.byRegion["torso"]!.internalDamage;
    expect(surfaceHealed).toBeGreaterThan(internalHealed);
  });

  it("healing cannot reduce damage below permanentDamage floor", () => {
    const perm = q(0.20);
    const e = entityWithDamage(q(0.25), q(0.25), perm);
    // Step many days — should plateau at permanent
    stepWoundAging(e, SECONDS_PER_DAY * 100);
    expect(e.injury.byRegion["torso"]!.surfaceDamage).toBeGreaterThanOrEqual(perm);
    expect(e.injury.byRegion["torso"]!.internalDamage).toBeGreaterThanOrEqual(perm);
  });

  it("fully healed region (all zeros) produces empty healedRegions for that region", () => {
    const e = freshEntity();   // no damage
    const result = stepWoundAging(e, SECONDS_PER_DAY);
    // Nothing improved because it was already at 0
    expect(result.healedRegions).not.toContain("torso");
  });

  it("surface heal per day matches SURFACE_HEAL_Q_PER_DAY constant", () => {
    const e = entityWithDamage(q(0.50), 0);
    stepWoundAging(e, SECONDS_PER_DAY);
    const expected = q(0.50) - Math.round(SURFACE_HEAL_Q_PER_DAY * 1);
    expect(e.injury.byRegion["torso"]!.surfaceDamage).toBe(expected);
  });
});

// ── Infection worsening ───────────────────────────────────────────────────────

describe("stepWoundAging — infection progression", () => {
  it("infected region internalDamage increases over 1 day", () => {
    const e = entityWithInfectedRegion(q(0.20));
    const before = e.injury.byRegion["torso"]!.internalDamage;
    const result = stepWoundAging(e, SECONDS_PER_DAY);
    expect(e.injury.byRegion["torso"]!.internalDamage).toBeGreaterThan(before);
    expect(result.worsenedRegions).toContain("torso");
  });

  it("infected region does NOT heal surface damage", () => {
    const e = entityWithInfectedRegion(q(0.20));
    e.injury.byRegion["torso"]!.surfaceDamage = q(0.30);
    const before = e.injury.byRegion["torso"]!.surfaceDamage;
    stepWoundAging(e, SECONDS_PER_DAY);
    // Infected regions don't heal
    expect(e.injury.byRegion["torso"]!.surfaceDamage).toBe(before);
  });

  it("infection worsen rate per day matches INFECTION_WORSEN_Q_PER_DAY", () => {
    const initDmg = q(0.20);
    const e = entityWithInfectedRegion(initDmg);
    stepWoundAging(e, SECONDS_PER_DAY);
    const expected = initDmg + Math.round(INFECTION_WORSEN_Q_PER_DAY * 1);
    expect(e.injury.byRegion["torso"]!.internalDamage).toBe(expected);
  });

  it("newSepsis=true when infected region crosses SEPSIS_THRESHOLD", () => {
    // Start just below threshold, one day of worsening pushes past
    const initDmg = SEPSIS_THRESHOLD - Math.round(INFECTION_WORSEN_Q_PER_DAY * 0.5);
    const e = entityWithInfectedRegion(initDmg);
    const result = stepWoundAging(e, SECONDS_PER_DAY);
    expect(result.newSepsis).toBe(true);
  });

  it("newSepsis=false when already above threshold before step", () => {
    // Already above threshold — not a new crossing
    const e = entityWithInfectedRegion(SEPSIS_THRESHOLD + 1);
    const result = stepWoundAging(e, SECONDS_PER_DAY);
    expect(result.newSepsis).toBe(false);
  });

  it("multiple infected regions → multiple worsenedRegions entries", () => {
    const e = freshEntity();
    e.injury.byRegion["torso"]!.internalDamage = q(0.20);
    e.injury.byRegion["torso"]!.infectedTick   = 0;
    e.injury.byRegion["head"]!.internalDamage  = q(0.20);
    e.injury.byRegion["head"]!.infectedTick    = 0;
    const result = stepWoundAging(e, SECONDS_PER_DAY);
    expect(result.worsenedRegions).toContain("torso");
    expect(result.worsenedRegions).toContain("head");
  });
});

// ── Chronic fatigue ───────────────────────────────────────────────────────────

describe("stepWoundAging — chronic fatigue", () => {
  it("no permanent damage → fatigue unchanged", () => {
    const e = freshEntity();  // all regions default with permanentDamage = 0
    const beforeFatigue = e.energy.fatigue;
    stepWoundAging(e, SECONDS_PER_DAY);
    expect(e.energy.fatigue).toBe(beforeFatigue);
  });

  it("total permanent damage >= CHRONIC_FATIGUE_THRESHOLD per region → fatigue increases", () => {
    const e = freshEntity();
    // Set all 6 regions to permanentDamage = q(0.15) — above threshold
    for (const reg of Object.values(e.injury.byRegion)) {
      reg.permanentDamage = q(0.15) as ReturnType<typeof q>;
    }
    const beforeFatigue = e.energy.fatigue;
    stepWoundAging(e, SECONDS_PER_DAY);
    expect(e.energy.fatigue).toBeGreaterThan(beforeFatigue);
  });

  it("higher average permanent damage → more fatigue drain per day", () => {
    const e1 = freshEntity();
    const e2 = freshEntity();
    for (const reg of Object.values(e1.injury.byRegion)) {
      reg.permanentDamage = q(0.20) as ReturnType<typeof q>;
    }
    for (const reg of Object.values(e2.injury.byRegion)) {
      reg.permanentDamage = q(0.50) as ReturnType<typeof q>;
    }
    stepWoundAging(e1, SECONDS_PER_DAY);
    stepWoundAging(e2, SECONDS_PER_DAY);
    expect(e2.energy.fatigue).toBeGreaterThan(e1.energy.fatigue);
  });

  it("chronic fatigue is clamped to SCALE.Q", () => {
    const e = freshEntity();
    e.energy.fatigue = SCALE.Q as ReturnType<typeof q>;  // already maxed
    for (const reg of Object.values(e.injury.byRegion)) {
      reg.permanentDamage = q(1.0) as ReturnType<typeof q>;
    }
    stepWoundAging(e, SECONDS_PER_DAY * 10);
    expect(e.energy.fatigue).toBe(SCALE.Q);
  });
});

// ── Phantom pain ──────────────────────────────────────────────────────────────

describe("stepWoundAging — phantom pain", () => {
  it("no fractured regions → shock unchanged", () => {
    const e = freshEntity();
    const beforeShock = e.injury.shock;
    stepWoundAging(e, SECONDS_PER_DAY);
    expect(e.injury.shock).toBe(beforeShock);
  });

  it("fractured region with permanentDamage below threshold → no phantom pain", () => {
    const e = freshEntity();
    const reg = e.injury.byRegion["torso"]!;
    reg.fractured       = true;
    reg.permanentDamage = (PHANTOM_PAIN_THRESHOLD - 1) as ReturnType<typeof q>;
    const beforeShock = e.injury.shock;
    stepWoundAging(e, SECONDS_PER_DAY);
    expect(e.injury.shock).toBe(beforeShock);
  });

  it("fractured region with permanentDamage >= threshold increases shock", () => {
    const e = freshEntity();
    const reg = e.injury.byRegion["torso"]!;
    reg.fractured       = true;
    reg.permanentDamage = q(0.50) as ReturnType<typeof q>;  // above q(0.30) threshold
    const beforeShock = e.injury.shock;
    stepWoundAging(e, SECONDS_PER_DAY);
    expect(e.injury.shock).toBeGreaterThan(beforeShock);
  });

  it("more fractured regions → more shock per day", () => {
    const e1 = freshEntity();
    const e2 = freshEntity();

    // e1: one fractured region
    e1.injury.byRegion["torso"]!.fractured       = true;
    e1.injury.byRegion["torso"]!.permanentDamage = q(0.60) as ReturnType<typeof q>;

    // e2: two fractured regions
    e2.injury.byRegion["torso"]!.fractured       = true;
    e2.injury.byRegion["torso"]!.permanentDamage = q(0.60) as ReturnType<typeof q>;
    e2.injury.byRegion["leftArm"]!.fractured       = true;
    e2.injury.byRegion["leftArm"]!.permanentDamage = q(0.60) as ReturnType<typeof q>;

    stepWoundAging(e1, SECONDS_PER_DAY);
    stepWoundAging(e2, SECONDS_PER_DAY);
    expect(e2.injury.shock).toBeGreaterThan(e1.injury.shock);
  });
});

// ── recordTraumaEvent ─────────────────────────────────────────────────────────

describe("recordTraumaEvent", () => {
  it("event below TRAUMA_TRIGGER_THRESHOLD → no traumaState created", () => {
    const e = freshEntity();
    recordTraumaEvent(e, (TRAUMA_TRIGGER_THRESHOLD - 1) as ReturnType<typeof q>);
    expect(e.traumaState).toBeUndefined();
  });

  it("event at or above threshold → traumaState created with severity > 0", () => {
    const e = freshEntity();
    recordTraumaEvent(e, TRAUMA_TRIGGER_THRESHOLD);
    expect(e.traumaState).toBeDefined();
    expect(e.traumaState!.severity_Q).toBeGreaterThan(0);
  });

  it("traumaState auto-created if absent", () => {
    const e = freshEntity();
    expect(e.traumaState).toBeUndefined();
    recordTraumaEvent(e, q(0.50) as ReturnType<typeof q>);
    expect(e.traumaState).toBeDefined();
  });

  it("multiple events accumulate severity", () => {
    const e = freshEntity();
    recordTraumaEvent(e, q(0.50) as ReturnType<typeof q>);
    const after1 = e.traumaState!.severity_Q;
    recordTraumaEvent(e, q(0.50) as ReturnType<typeof q>);
    expect(e.traumaState!.severity_Q).toBeGreaterThan(after1);
  });

  it("severity is capped at SCALE.Q", () => {
    const e = freshEntity();
    // Fire many large events
    for (let i = 0; i < 100; i++) {
      recordTraumaEvent(e, SCALE.Q as ReturnType<typeof q>);
    }
    expect(e.traumaState!.severity_Q).toBe(SCALE.Q);
  });
});

// ── deriveFearThresholdMul ────────────────────────────────────────────────────

describe("deriveFearThresholdMul", () => {
  it("no traumaState → returns SCALE.Q (no multiplier reduction)", () => {
    const e = freshEntity();
    expect(deriveFearThresholdMul(e)).toBe(SCALE.Q);
  });

  it("max trauma (severity q(1.0)) → returns q(0.50) (fear triggers at half normal threshold)", () => {
    const e = freshEntity();
    e.traumaState = { severity_Q: SCALE.Q as ReturnType<typeof q> };
    expect(deriveFearThresholdMul(e)).toBe(q(0.50));
  });

  it("half trauma (severity q(0.50)) → approximately q(0.75)", () => {
    const e = freshEntity();
    e.traumaState = { severity_Q: q(0.50) as ReturnType<typeof q> };
    const mul = deriveFearThresholdMul(e);
    expect(mul).toBeGreaterThanOrEqual(q(0.70));
    expect(mul).toBeLessThanOrEqual(q(0.80));
  });

  it("never returns less than q(0.50)", () => {
    const e = freshEntity();
    e.traumaState = { severity_Q: SCALE.Q as ReturnType<typeof q> };
    expect(deriveFearThresholdMul(e)).toBeGreaterThanOrEqual(q(0.50));
  });
});

// ── deriveSepsisRisk ──────────────────────────────────────────────────────────

describe("deriveSepsisRisk", () => {
  it("no infected regions → q(0)", () => {
    const e = freshEntity();
    expect(deriveSepsisRisk(e)).toBe(q(0));
  });

  it("infected region with high internalDamage → risk > q(0)", () => {
    const e = entityWithInfectedRegion(q(0.70));
    expect(deriveSepsisRisk(e)).toBeGreaterThan(q(0));
  });

  it("more severe infection → higher sepsis risk", () => {
    const e1 = entityWithInfectedRegion(q(0.40));
    const e2 = entityWithInfectedRegion(q(0.80));
    expect(deriveSepsisRisk(e2)).toBeGreaterThan(deriveSepsisRisk(e1));
  });
});

// ── Trauma decay ──────────────────────────────────────────────────────────────

describe("stepWoundAging — trauma natural decay", () => {
  it("traumaState.severity_Q decreases over days", () => {
    const e = freshEntity();
    e.traumaState = { severity_Q: q(0.60) as ReturnType<typeof q> };
    stepWoundAging(e, SECONDS_PER_DAY * 7);  // 1 week
    expect(e.traumaState.severity_Q).toBeLessThan(q(0.60));
  });

  it("trauma severity cannot drop below q(0)", () => {
    const e = freshEntity();
    e.traumaState = { severity_Q: q(0.01) as ReturnType<typeof q> };
    stepWoundAging(e, SECONDS_PER_DAY * 100);  // long time
    expect(e.traumaState.severity_Q).toBeGreaterThanOrEqual(q(0));
  });
});
