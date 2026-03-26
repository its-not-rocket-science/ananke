// test/calendar.test.ts — Phase 78: Seasonal Calendar & Agricultural Cycle

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import {
  DAYS_PER_YEAR,
  SPRING_START_DAY,
  SUMMER_START_DAY,
  AUTUMN_START_DAY,
  SEASONAL_MODIFIERS,
  CALENDAR_Q_PER_DEG_C,
  createCalendar,
  stepCalendar,
  computeSeason,
  computeHarvestPhase,
  isInHarvestWindow,
  getSeasonalModifiers,
  applySeasonalHarvest,
  deriveSeasonalWeatherBias,
  applySeasonalDiseaseMul,
} from "../src/calendar.js";
import { createPolity } from "../src/polity.js";

// ── createCalendar ─────────────────────────────────────────────────────────────

describe("createCalendar", () => {
  it("defaults to year 1, day 1", () => {
    const c = createCalendar();
    expect(c.year).toBe(1);
    expect(c.dayOfYear).toBe(1);
  });

  it("accepts custom start", () => {
    const c = createCalendar(5, 180);
    expect(c.year).toBe(5);
    expect(c.dayOfYear).toBe(180);
  });

  it("clamps dayOfYear to [1, DAYS_PER_YEAR]", () => {
    expect(createCalendar(1, 0).dayOfYear).toBe(1);
    expect(createCalendar(1, 400).dayOfYear).toBe(DAYS_PER_YEAR);
  });
});

// ── stepCalendar ──────────────────────────────────────────────────────────────

describe("stepCalendar", () => {
  it("advances by days within same year", () => {
    const c = stepCalendar(createCalendar(1, 1), 10);
    expect(c.year).toBe(1);
    expect(c.dayOfYear).toBe(11);
  });

  it("rolls over to next year", () => {
    const c = stepCalendar(createCalendar(1, 360), 10);
    expect(c.year).toBe(2);
    expect(c.dayOfYear).toBe(5); // 360 + 10 - 365 = 5
  });

  it("0 days returns copy with same values", () => {
    const s = createCalendar(3, 100);
    const c = stepCalendar(s, 0);
    expect(c.year).toBe(3);
    expect(c.dayOfYear).toBe(100);
  });

  it("does not mutate original state", () => {
    const s = createCalendar(1, 50);
    stepCalendar(s, 30);
    expect(s.dayOfYear).toBe(50);
  });

  it("advances exactly one full year", () => {
    const c = stepCalendar(createCalendar(1, 1), DAYS_PER_YEAR);
    expect(c.year).toBe(2);
    expect(c.dayOfYear).toBe(1);
  });

  it("advances multiple years", () => {
    const c = stepCalendar(createCalendar(1, 1), DAYS_PER_YEAR * 3);
    expect(c.year).toBe(4);
    expect(c.dayOfYear).toBe(1);
  });
});

// ── computeSeason ─────────────────────────────────────────────────────────────

describe("computeSeason", () => {
  it("day 1 → winter", () => expect(computeSeason(1)).toBe("winter"));
  it("day 91 → winter", () => expect(computeSeason(91)).toBe("winter"));
  it("day 92 → spring (SPRING_START_DAY)", () => {
    expect(computeSeason(SPRING_START_DAY)).toBe("spring");
  });
  it("day 182 → spring", () => expect(computeSeason(182)).toBe("spring"));
  it("day 183 → summer (SUMMER_START_DAY)", () => {
    expect(computeSeason(SUMMER_START_DAY)).toBe("summer");
  });
  it("day 273 → summer", () => expect(computeSeason(273)).toBe("summer"));
  it("day 274 → autumn (AUTUMN_START_DAY)", () => {
    expect(computeSeason(AUTUMN_START_DAY)).toBe("autumn");
  });
  it("day 365 → autumn", () => expect(computeSeason(365)).toBe("autumn"));

  it("all four seasons appear across the year", () => {
    const seasons = new Set(
      Array.from({ length: DAYS_PER_YEAR }, (_, i) => computeSeason(i + 1)),
    );
    expect(seasons.size).toBe(4);
  });
});

// ── computeHarvestPhase ───────────────────────────────────────────────────────

describe("computeHarvestPhase", () => {
  it("day 1 → dormant", () => expect(computeHarvestPhase(1)).toBe("dormant"));
  it("day 92 → planting", () => expect(computeHarvestPhase(92)).toBe("planting"));
  it("day 137 → growing", () => expect(computeHarvestPhase(137)).toBe("growing"));
  it("day 274 → harvest", () => expect(computeHarvestPhase(274)).toBe("harvest"));
  it("day 365 → harvest", () => expect(computeHarvestPhase(365)).toBe("harvest"));
});

// ── isInHarvestWindow ─────────────────────────────────────────────────────────

describe("isInHarvestWindow", () => {
  it("day 273 is NOT in harvest window", () => expect(isInHarvestWindow(273)).toBe(false));
  it("day 274 IS in harvest window", () => expect(isInHarvestWindow(274)).toBe(true));
  it("day 365 IS in harvest window", () => expect(isInHarvestWindow(365)).toBe(true));
  it("day 1 is NOT in harvest window", () => expect(isInHarvestWindow(1)).toBe(false));
});

// ── SEASONAL_MODIFIERS sanity checks ─────────────────────────────────────────

describe("SEASONAL_MODIFIERS", () => {
  it("winter has negative thermalOffset", () => {
    expect(SEASONAL_MODIFIERS.winter.thermalOffset).toBeLessThan(0);
  });

  it("summer has positive thermalOffset", () => {
    expect(SEASONAL_MODIFIERS.summer.thermalOffset).toBeGreaterThan(0);
  });

  it("autumn has peak harvestYield_Q (q(1.0))", () => {
    expect(SEASONAL_MODIFIERS.autumn.harvestYield_Q).toBe(q(1.0));
  });

  it("winter has zero harvestYield_Q", () => {
    expect(SEASONAL_MODIFIERS.winter.harvestYield_Q).toBe(0);
  });

  it("winter mobilityMul_Q < summer mobilityMul_Q", () => {
    expect(SEASONAL_MODIFIERS.winter.mobilityMul_Q).toBeLessThan(
      SEASONAL_MODIFIERS.summer.mobilityMul_Q,
    );
  });

  it("winter diseaseMul_Q > summer diseaseMul_Q (cold boosts disease)", () => {
    expect(SEASONAL_MODIFIERS.winter.diseaseMul_Q).toBeGreaterThan(
      SEASONAL_MODIFIERS.summer.diseaseMul_Q,
    );
  });
});

// ── getSeasonalModifiers ──────────────────────────────────────────────────────

describe("getSeasonalModifiers", () => {
  it("returns same object as SEASONAL_MODIFIERS[computeSeason(day)]", () => {
    for (const day of [1, 92, 183, 274]) {
      expect(getSeasonalModifiers(day)).toBe(
        SEASONAL_MODIFIERS[computeSeason(day)],
      );
    }
  });
});

// ── applySeasonalHarvest ──────────────────────────────────────────────────────

describe("applySeasonalHarvest", () => {
  const polity = createPolity("p1", "Rome", "f1", [], 100_000, 5_000, "Medieval");

  it("returns 0 during winter (zero harvest yield)", () => {
    const income = applySeasonalHarvest(polity, SEASONAL_MODIFIERS.winter, 1000);
    expect(income).toBe(0);
  });

  it("returns full income during autumn (yield = q(1.0))", () => {
    const income = applySeasonalHarvest(polity, SEASONAL_MODIFIERS.autumn, 1000);
    expect(income).toBe(1000);
  });

  it("returns partial income during summer (yield = q(0.30))", () => {
    const income = applySeasonalHarvest(polity, SEASONAL_MODIFIERS.summer, 1000);
    expect(income).toBe(300);
  });

  it("returns 0 when baseDailyIncome = 0", () => {
    expect(applySeasonalHarvest(polity, SEASONAL_MODIFIERS.autumn, 0)).toBe(0);
  });

  it("annual income cycle sums to significantly less than 4× daily income", () => {
    // Average over 4 seasons: (0 + 0.10 + 0.30 + 1.0) / 4 = 0.35
    const daily = 1000;
    const annual = ["winter", "spring", "summer", "autumn"].reduce(
      (sum, s) => sum + applySeasonalHarvest(polity, SEASONAL_MODIFIERS[s as keyof typeof SEASONAL_MODIFIERS], daily),
      0,
    );
    expect(annual).toBeLessThan(4 * daily);
    expect(annual).toBeGreaterThan(0);
  });
});

// ── deriveSeasonalWeatherBias ─────────────────────────────────────────────────

describe("deriveSeasonalWeatherBias", () => {
  it("winter + intensity 1.0 returns blizzard", () => {
    const w = deriveSeasonalWeatherBias("winter", 1.0);
    expect(w.precipitation).toBe("blizzard");
  });

  it("winter + intensity 0.5 returns snow", () => {
    const w = deriveSeasonalWeatherBias("winter", 0.5);
    expect(w.precipitation).toBe("snow");
  });

  it("summer returns empty (dry)", () => {
    const w = deriveSeasonalWeatherBias("summer", 1.0);
    expect(Object.keys(w)).toHaveLength(0);
  });

  it("intensity 0 always returns empty", () => {
    const seasons = ["winter", "spring", "summer", "autumn"] as const;
    for (const s of seasons) {
      expect(Object.keys(deriveSeasonalWeatherBias(s, 0))).toHaveLength(0);
    }
  });

  it("spring + intensity 0.8 returns rain", () => {
    const w = deriveSeasonalWeatherBias("spring", 0.8);
    expect(w.precipitation).toBe("rain");
  });
});

// ── applySeasonalDiseaseMul ───────────────────────────────────────────────────

describe("applySeasonalDiseaseMul", () => {
  it("winter boosts disease rate above base", () => {
    const base = q(0.20);
    const result = applySeasonalDiseaseMul(base, SEASONAL_MODIFIERS.winter);
    expect(result).toBeGreaterThan(base);
  });

  it("summer reduces disease rate below base", () => {
    const base = q(0.20);
    const result = applySeasonalDiseaseMul(base, SEASONAL_MODIFIERS.summer);
    expect(result).toBeLessThan(base);
  });

  it("result is clamped to [0, 2×SCALE.Q]", () => {
    const extreme = (SCALE.Q * 2) as any;
    const result = applySeasonalDiseaseMul(extreme, SEASONAL_MODIFIERS.winter);
    expect(result).toBeLessThanOrEqual(SCALE.Q * 2);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});
