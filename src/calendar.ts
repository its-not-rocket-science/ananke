// src/calendar.ts — Phase 78: Seasonal Calendar & Agricultural Cycle
//
// A campaign-scale time layer. One `CalendarState` advances by simulated days
// and drives seasonal modifiers for weather, disease, mobility, and harvest income.
//
// Design:
//   - Pure computation — no Entity fields, no kernel changes.
//   - Immutable step: `stepCalendar` returns a new `CalendarState`.
//   - Year divided into 4 equal seasons of 91–92 days (Northern-hemisphere convention).
//   - `SeasonalModifiers` are the canonical interface between the calendar and
//     subsystem-specific application helpers.
//   - `applySeasonalHarvest` integrates directly with Phase 61 `Polity`.
//   - `deriveSeasonalWeatherBias` produces a suggested `WeatherState` for the host.

import type { Polity }        from "./polity.js";
import type { WeatherState }  from "./sim/weather.js";
import type { Q }             from "./units.js";
import { q, SCALE, clampQ }  from "./units.js";

// ── Constants ─────────────────────────────────────────────────────────────────

export const DAYS_PER_YEAR = 365;

// Season day boundaries (1-based, Northern hemisphere)
// Winter: 1–91   (Dec 21 – Mar 20)
// Spring: 92–182 (Mar 21 – Jun 20)
// Summer: 183–273 (Jun 21 – Sep 21)
// Autumn: 274–365 (Sep 22 – Dec 20)
export const SPRING_START_DAY = 92;
export const SUMMER_START_DAY = 183;
export const AUTUMN_START_DAY = 274;

// Harvest window within Autumn: full harvest days 274–365
export const HARVEST_PLANTING_START = 92;   // spring planting begins
export const HARVEST_PLANTING_END   = 136;  // planting ends mid-spring
export const HARVEST_GROWING_START  = 137;  // growing begins
export const HARVEST_GROWING_END    = 273;  // growing ends (end of summer)
export const HARVEST_WINDOW_START   = 274;  // harvest opens
export const HARVEST_WINDOW_END     = 365;  // harvest closes

/**
 * Approximate Q units per °C in Phase-29 thermal encoding.
 * Matches `WEATHER_Q_PER_DEG_C` in `src/sim/weather.ts`.
 */
export const CALENDAR_Q_PER_DEG_C = 185;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Macro-scale season driven by `computeSeason(dayOfYear)`. */
export type Season = "winter" | "spring" | "summer" | "autumn";

/** Agricultural phase for the current day. */
export type HarvestPhase = "dormant" | "planting" | "growing" | "harvest";

/**
 * Persistent calendar state.  Advances via `stepCalendar(state, days)`.
 * Year and dayOfYear are both 1-based.
 */
export interface CalendarState {
  /** Simulated year number (starts at 1). */
  year:      number;
  /** Day within the current year, 1–365. */
  dayOfYear: number;
}

/**
 * Seasonal multipliers and offsets for subsystem integration.
 * All Q values follow the SCALE.Q convention (q(1.0) = no change).
 */
export interface SeasonalModifiers {
  /**
   * Additive thermal offset in Phase-29 Q units (1 °C ≈ CALENDAR_Q_PER_DEG_C).
   * Negative = colder than baseline.
   */
  thermalOffset:      number;
  /**
   * Multiplier on precipitation intensity and frequency [0, SCALE.Q].
   * q(1.0) = average; q(1.30) = wet spring; q(0.70) = dry winter.
   */
  precipitationMul_Q: Q;
  /**
   * Multiplier on airborne disease transmission rate [0, SCALE.Q].
   * q(1.0) = no change; q(1.20) = winter crowding boost.
   */
  diseaseMul_Q:       Q;
  /**
   * Multiplier on overland travel speed [0, SCALE.Q].
   * q(1.0) = normal; q(0.70) = winter snow or spring mud.
   */
  mobilityMul_Q:      Q;
  /**
   * Harvest yield fraction for this season [0, SCALE.Q].
   * q(0) = off-season (no harvest); q(1.0) = peak autumn harvest.
   */
  harvestYield_Q:     Q;
}

// ── Season modifiers table ────────────────────────────────────────────────────

export const SEASONAL_MODIFIERS: Record<Season, SeasonalModifiers> = {
  winter: {
    thermalOffset:      -CALENDAR_Q_PER_DEG_C * 10,  // ~−10 °C
    precipitationMul_Q: q(0.70),   // drier (frozen precip, less liquid)
    diseaseMul_Q:       q(1.20),   // crowding and cold stress boosts disease
    mobilityMul_Q:      q(0.70),   // snow and ice hinder travel
    harvestYield_Q:     q(0.00),   // dormant; no harvest
  },
  spring: {
    thermalOffset:      0,          // baseline temperature
    precipitationMul_Q: q(1.30),   // spring rains
    diseaseMul_Q:       q(0.80),   // mild weather reduces transmission
    mobilityMul_Q:      q(0.80),   // mud season slows travel
    harvestYield_Q:     q(0.10),   // minor early crops (spring vegetables)
  },
  summer: {
    thermalOffset:      CALENDAR_Q_PER_DEG_C * 5,    // ~+5 °C
    precipitationMul_Q: q(1.00),   // average precipitation
    diseaseMul_Q:       q(0.90),   // better hygiene conditions
    mobilityMul_Q:      q(1.00),   // optimal travel conditions
    harvestYield_Q:     q(0.30),   // some summer crops (hay, early grain)
  },
  autumn: {
    thermalOffset:      -CALENDAR_Q_PER_DEG_C * 3,   // ~−3 °C
    precipitationMul_Q: q(1.00),   // average
    diseaseMul_Q:       q(1.10),   // early cold season uptick
    mobilityMul_Q:      q(0.90),   // cooling, shorter days
    harvestYield_Q:     q(1.00),   // peak harvest
  },
};

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a new `CalendarState` at the given year and day.
 * Defaults to year 1, day 1 (first day of winter).
 */
export function createCalendar(startYear = 1, startDay = 1): CalendarState {
  return {
    year:      Math.max(1, startYear),
    dayOfYear: Math.max(1, Math.min(DAYS_PER_YEAR, startDay)),
  };
}

// ── Step ──────────────────────────────────────────────────────────────────────

/**
 * Advance the calendar by `days` days (must be ≥ 0).
 * Returns a new `CalendarState`; does NOT mutate the input.
 */
export function stepCalendar(state: CalendarState, days: number): CalendarState {
  if (days <= 0) return { ...state };
  const total     = state.dayOfYear - 1 + days;
  const yearDelta = Math.trunc(total / DAYS_PER_YEAR);
  const dayOfYear = (total % DAYS_PER_YEAR) + 1;
  return {
    year:      state.year + yearDelta,
    dayOfYear,
  };
}

// ── Derived state ─────────────────────────────────────────────────────────────

/** Derive the current `Season` from `dayOfYear` (1–365). */
export function computeSeason(dayOfYear: number): Season {
  if (dayOfYear >= AUTUMN_START_DAY) return "autumn";
  if (dayOfYear >= SUMMER_START_DAY) return "summer";
  if (dayOfYear >= SPRING_START_DAY) return "spring";
  return "winter";
}

/** Derive the current `HarvestPhase` from `dayOfYear`. */
export function computeHarvestPhase(dayOfYear: number): HarvestPhase {
  if (dayOfYear >= HARVEST_WINDOW_START) return "harvest";
  if (dayOfYear >= HARVEST_GROWING_START) return "growing";
  if (dayOfYear >= HARVEST_PLANTING_START) return "planting";
  return "dormant";
}

/** Return `true` if the day falls within the autumn harvest window. */
export function isInHarvestWindow(dayOfYear: number): boolean {
  return dayOfYear >= HARVEST_WINDOW_START && dayOfYear <= HARVEST_WINDOW_END;
}

/**
 * Return the `SeasonalModifiers` for the given `dayOfYear`.
 * Convenience wrapper over `SEASONAL_MODIFIERS[computeSeason(day)]`.
 */
export function getSeasonalModifiers(dayOfYear: number): SeasonalModifiers {
  return SEASONAL_MODIFIERS[computeSeason(dayOfYear)];
}

// ── Subsystem integration ─────────────────────────────────────────────────────

/**
 * Compute the treasury income for one simulated day, scaled by the seasonal
 * harvest yield.
 *
 * @param polity           Current polity (provides treasury_cu as economic base).
 * @param modifiers        Seasonal modifiers for this day.
 * @param baseDailyIncome  Base income in cost-units per day (host-defined).
 * @returns                Integer cost-unit gain for this day (≥ 0).
 */
export function applySeasonalHarvest(
  polity:          Polity,
  modifiers:       SeasonalModifiers,
  baseDailyIncome: number,
): number {
  if (baseDailyIncome <= 0) return 0;
  const raw = Math.round(baseDailyIncome * modifiers.harvestYield_Q / SCALE.Q);
  return Math.max(0, raw);
}

/**
 * Derive a suggested `WeatherState` biased toward the current season.
 *
 * The result is advisory — hosts can override or blend with their own weather
 * system. Precipitation type:
 *   - winter + heavy → "blizzard"; winter + light → "snow"
 *   - spring/summer → "rain"; autumn → "rain" or dry depending on yield
 *
 * @param season     Current season.
 * @param intensity  0–1 float: how extreme the seasonal weather should be.
 *                   0 = clear; 1 = full seasonal character.
 */
export function deriveSeasonalWeatherBias(
  season:    Season,
  intensity: number = 0.5,
): Partial<WeatherState> {
  if (intensity <= 0) return {};

  switch (season) {
    case "winter":
      return {
        precipitation: intensity >= 0.7 ? "blizzard" : "snow",
      };
    case "spring":
      return intensity >= 0.5 ? { precipitation: "rain" } : {};
    case "summer":
      return {};  // dry summer default
    case "autumn":
      return intensity >= 0.6 ? { precipitation: "rain" } : {};
  }
}

/**
 * Compute the effective disease transmission rate multiplier for a given
 * base rate, applying the seasonal modifier.
 *
 * Result is clamped to [0, SCALE.Q × 2] (allows doubling but prevents runaway).
 *
 * @param baseRate_Q     Disease baseTransmissionRate_Q from DiseaseProfile.
 * @param modifiers      Seasonal modifiers.
 */
export function applySeasonalDiseaseMul(
  baseRate_Q: Q,
  modifiers:  SeasonalModifiers,
): Q {
  return clampQ(
    Math.round(baseRate_Q * modifiers.diseaseMul_Q / SCALE.Q),
    0,
    SCALE.Q * 2,
  ) as Q;
}
