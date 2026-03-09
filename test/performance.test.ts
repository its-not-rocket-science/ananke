// test/performance.test.ts — Phase 39: Musical Performance tests

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import type { Entity } from "../src/sim/entity.js";
import type { WillpowerState } from "../src/competence/willpower.js";
import {
  resolvePerformance,
  stepPerformance,
  calculatePerformanceRange,
  canPerform,
  estimatePerformance,
  createActivePerformance,
  type PerformanceType,
} from "../src/competence/performance.js";

// Helper to create a minimal entity with specified musical intelligence
function mkEntity(musical: number): Entity {
  return {
    id: 1,
    teamId: 1,
    attributes: {
      cognition: {
        musical,
      } as any,
    } as any,
    energy: { reserve_J: 10000, reserveMax_J: 10000 },
    loadout: { armour: [], weapons: [], items: [] },
    traits: [],
    position_m: { x: 0, y: 0, z: 0 },
    velocity_mps: { x: 0, y: 0, z: 0 },
    intent: { type: "idle" },
    action: {},
    condition: {},
    injury: { regions: new Map() },
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" },
  };
}

function mkWillpower(current_J: number, max_J: number = 50000): WillpowerState {
  return { current_J, max_J };
}

describe("resolvePerformance", () => {
  const performanceTypes: PerformanceType[] = [
    "march", "rally", "dirge", "celebration", "lament",
  ];

  performanceTypes.forEach((type) => {
    it(`produces fear decay bonus for "${type}"`, () => {
      const performer = mkEntity(q(0.70));
      const result = resolvePerformance(performer, {
        performanceType: type,
        duration_s: 60,
        audienceCount: 5,
        range_m: 50,
      });
      expect(result.fearDecayBonus_Q).toBeGreaterThan(0);
    });
  });

  it("satyr bard produces near-leader-level fear decay", () => {
    const satyr = mkEntity(q(0.95));
    const result = resolvePerformance(satyr, {
      performanceType: "rally",
      duration_s: 60,
      audienceCount: 5,
      range_m: 50,
    });
    // q(0.019) is close to leader aura levels (typically q(0.020))
    expect(result.fearDecayBonus_Q).toBeGreaterThanOrEqual(q(0.015));
  });

  it("higher musical skill produces better fear decay bonus", () => {
    const lowSkill = mkEntity(q(0.40));
    const highSkill = mkEntity(q(0.90));

    const lowResult = resolvePerformance(lowSkill, {
      performanceType: "rally",
      duration_s: 60,
      audienceCount: 0,
      range_m: 50,
    });
    const highResult = resolvePerformance(highSkill, {
      performanceType: "rally",
      duration_s: 60,
      audienceCount: 0,
      range_m: 50,
    });

    expect(highResult.fearDecayBonus_Q).toBeGreaterThan(lowResult.fearDecayBonus_Q);
  });

  it("larger audience increases willpower drain", () => {
    const performer = mkEntity(q(0.70));
    const solo = resolvePerformance(performer, {
      performanceType: "march",
      duration_s: 60,
      audienceCount: 0,
      range_m: 50,
    });
    const group = resolvePerformance(performer, {
      performanceType: "march",
      duration_s: 60,
      audienceCount: 10,
      range_m: 50,
    });

    expect(group.willpowerDrained_J).toBeGreaterThan(solo.willpowerDrained_J);
  });

  it("longer duration increases willpower drain", () => {
    const performer = mkEntity(q(0.70));
    const short = resolvePerformance(performer, {
      performanceType: "march",
      duration_s: 30,
      audienceCount: 5,
      range_m: 50,
    });
    const long = resolvePerformance(performer, {
      performanceType: "march",
      duration_s: 120,
      audienceCount: 5,
      range_m: 50,
    });

    expect(long.willpowerDrained_J).toBeGreaterThan(short.willpowerDrained_J);
  });

  it("assigns exceptional descriptor for high musical skill", () => {
    const performer = mkEntity(q(0.90));
    const result = resolvePerformance(performer, {
      performanceType: "celebration",
      duration_s: 60,
      audienceCount: 5,
      range_m: 50,
    });
    expect(result.descriptor).toBe("exceptional");
  });

  it("assigns poor descriptor for low musical skill", () => {
    const performer = mkEntity(q(0.30));
    const result = resolvePerformance(performer, {
      performanceType: "celebration",
      duration_s: 60,
      audienceCount: 5,
      range_m: 50,
    });
    expect(result.descriptor).toBe("poor");
  });

  it("rally has higher fear bonus than march", () => {
    const performer = mkEntity(q(0.70));
    const march = resolvePerformance(performer, {
      performanceType: "march",
      duration_s: 60,
      audienceCount: 5,
      range_m: 50,
    });
    const rally = resolvePerformance(performer, {
      performanceType: "rally",
      duration_s: 60,
      audienceCount: 5,
      range_m: 50,
    });

    expect(rally.fearDecayBonus_Q).toBeGreaterThan(march.fearDecayBonus_Q);
  });

  it("march has higher cohesion bonus than lament", () => {
    const performer = mkEntity(q(0.70));
    const march = resolvePerformance(performer, {
      performanceType: "march",
      duration_s: 60,
      audienceCount: 5,
      range_m: 50,
    });
    const lament = resolvePerformance(performer, {
      performanceType: "lament",
      duration_s: 60,
      audienceCount: 5,
      range_m: 50,
    });

    expect(march.cohesionBonus_Q).toBeGreaterThan(lament.cohesionBonus_Q);
  });
});

describe("stepPerformance", () => {
  it("deducts willpower each step", () => {
    const willpower = mkWillpower(5000);
    const performance = {
      performerId: 1,
      performanceType: "march" as const,
      remaining_s: 60,
      fearDecayBonus_Q: q(0.010),
      range_m: 50,
    };
    const before = willpower.current_J;
    stepPerformance(performance, willpower, 1);
    expect(willpower.current_J).toBeLessThan(before);
  });

  it("returns false when willpower depleted", () => {
    const willpower = mkWillpower(10);
    const performance = {
      performerId: 1,
      performanceType: "rally" as const,
      remaining_s: 60,
      fearDecayBonus_Q: q(0.015),
      range_m: 50,
    };
    const canContinue = stepPerformance(performance, willpower, 1);
    expect(canContinue).toBe(false);
  });

  it("returns false when duration expires", () => {
    const willpower = mkWillpower(5000);
    const performance = {
      performerId: 1,
      performanceType: "dirge" as const,
      remaining_s: 1,
      fearDecayBonus_Q: q(0.008),
      range_m: 50,
    };
    const canContinue = stepPerformance(performance, willpower, 2);
    expect(canContinue).toBe(false);
    expect(performance.remaining_s).toBe(0);
  });

  it("returns true when performance can continue", () => {
    const willpower = mkWillpower(5000);
    const performance = {
      performerId: 1,
      performanceType: "celebration" as const,
      remaining_s: 60,
      fearDecayBonus_Q: q(0.012),
      range_m: 50,
    };
    const canContinue = stepPerformance(performance, willpower, 1);
    expect(canContinue).toBe(true);
    expect(performance.remaining_s).toBe(59);
  });
});

describe("calculatePerformanceRange", () => {
  it("returns higher range for high musical skill", () => {
    const highSkill = mkEntity(q(0.90));
    const lowSkill = mkEntity(q(0.40));
    const highRange = calculatePerformanceRange(highSkill);
    const lowRange = calculatePerformanceRange(lowSkill);
    expect(highRange).toBeGreaterThan(lowRange);
  });

  it("respects base range parameter", () => {
    const performer = mkEntity(q(0.70));
    const shortRange = calculatePerformanceRange(performer, 30);
    const longRange = calculatePerformanceRange(performer, 100);
    expect(longRange).toBeGreaterThan(shortRange);
  });

  it("caps at maximum range", () => {
    const performer = mkEntity(SCALE.Q);
    const range = calculatePerformanceRange(performer, 200);
    expect(range).toBeLessThanOrEqual(100);
  });
});

describe("canPerform", () => {
  it("returns true with sufficient musical and willpower", () => {
    const performer = mkEntity(q(0.70));
    const willpower = mkWillpower(5000);
    expect(canPerform(performer, willpower)).toBe(true);
  });

  it("returns false with low musical skill", () => {
    const performer = mkEntity(q(0.20));
    const willpower = mkWillpower(5000);
    expect(canPerform(performer, willpower)).toBe(false);
  });

  it("returns false with depleted willpower", () => {
    const performer = mkEntity(q(0.70));
    const willpower = mkWillpower(100);
    expect(canPerform(performer, willpower)).toBe(false);
  });

  it("respects custom minimum musical threshold", () => {
    const performer = mkEntity(q(0.60));
    const willpower = mkWillpower(5000);
    expect(canPerform(performer, willpower, q(0.70))).toBe(false);
    expect(canPerform(performer, willpower, q(0.50))).toBe(true);
  });
});

describe("estimatePerformance", () => {
  it("matches resolvePerformance for same inputs", () => {
    const performer = mkEntity(q(0.75));
    const estimate = estimatePerformance(performer, "rally", 60, 5);
    const actual = resolvePerformance(performer, {
      performanceType: "rally",
      duration_s: 60,
      audienceCount: 5,
      range_m: 50,
    });

    expect(estimate.fearDecayBonus_Q).toBe(actual.fearDecayBonus_Q);
    expect(estimate.cohesionBonus_Q).toBe(actual.cohesionBonus_Q);
    expect(estimate.willpowerDrained_J).toBe(actual.willpowerDrained_J);
    expect(estimate.descriptor).toBe(actual.descriptor);
  });

  it("scales fear bonus with musical skill in estimate", () => {
    const lowSkill = mkEntity(q(0.40));
    const highSkill = mkEntity(q(0.90));

    const lowEstimate = estimatePerformance(lowSkill, "march", 60, 0);
    const highEstimate = estimatePerformance(highSkill, "march", 60, 0);

    expect(highEstimate.fearDecayBonus_Q).toBeGreaterThan(lowEstimate.fearDecayBonus_Q);
  });
});

describe("createActivePerformance", () => {
  it("creates performance with correct performer ID", () => {
    const performer = mkEntity(q(0.70));
    const active = createActivePerformance(42, "rally", 120, performer);
    expect(active.performerId).toBe(42);
  });

  it("creates performance with correct duration", () => {
    const performer = mkEntity(q(0.70));
    const active = createActivePerformance(1, "march", 300, performer);
    expect(active.remaining_s).toBe(300);
  });

  it("creates performance with positive fear bonus", () => {
    const performer = mkEntity(q(0.70));
    const active = createActivePerformance(1, "celebration", 60, performer);
    expect(active.fearDecayBonus_Q).toBeGreaterThan(0);
  });

  it("creates performance with valid range", () => {
    const performer = mkEntity(q(0.70));
    const active = createActivePerformance(1, "dirge", 60, performer);
    expect(active.range_m).toBeGreaterThan(0);
    expect(active.range_m).toBeLessThanOrEqual(100);
  });
});
