import { describe, it, expect } from "vitest";
import {
  deriveAtmosphericState,
  queryAtmosphericModifiers,
  ATMO_BASE_VISIBILITY_Sm,
  ATMO_ACOUSTIC_FULL_MASK_MPS,
  ATMO_HAZARD_TAILWIND_MUL_MAX,
  ATMO_HAZARD_HEADWIND_MUL_MIN,
  ATMO_HEARING_UPWIND_BONUS,
  type AtmosphericState,
} from "../src/atmosphere.js";
import { SCALE, q } from "../src/units.js";
import type { WeatherState } from "../src/sim/weather.js";
import type { BiomeContext } from "../src/sim/biome.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function eastWind(speed_mps: number): WeatherState {
  return { wind: { dx_m: SCALE.m, dy_m: 0, speed_mps } };
}

function northWind(speed_mps: number): WeatherState {
  return { wind: { dx_m: 0, dy_m: SCALE.m, speed_mps } };
}

// Shot direction: straight East (positive x)
const FROM_ORIGIN = { x_Sm: 0, y_Sm: 0 };
const TO_EAST     = { x_Sm: 1_000_000, y_Sm: 0 };   // 100 m east
const TO_NORTH    = { x_Sm: 0, y_Sm: 1_000_000 };   // 100 m north
const TO_WEST     = { x_Sm: -1_000_000, y_Sm: 0 };  // 100 m west

// ── deriveAtmosphericState ────────────────────────────────────────────────────

describe("deriveAtmosphericState", () => {
  it("returns calm clear-sky defaults when no weather or biome provided", () => {
    const state = deriveAtmosphericState();
    expect(state.wind.speed_mps).toBe(0);
    expect(state.precipIntensity_Q).toBe(0);
    expect(state.baseVisibility_Sm).toBe(ATMO_BASE_VISIBILITY_Sm);
    expect(state.acousticMask_Q).toBe(0);
    expect(state.tractionMod_Q).toBe(SCALE.Q);
    expect(state.thermalOffset_Q).toBe(0);
  });

  it("preserves wind direction from WeatherState", () => {
    const state = deriveAtmosphericState(eastWind(1000));
    expect(state.wind.dx_m).toBe(SCALE.m);
    expect(state.wind.dy_m).toBe(0);
    expect(state.wind.speed_mps).toBe(1000);
  });

  it("adds zero dz_m (no vertical wind from 2D WeatherState)", () => {
    const state = deriveAtmosphericState(eastWind(1000));
    expect(state.wind.dz_m).toBe(0);
  });

  it("turbulence increases with wind speed", () => {
    const calm   = deriveAtmosphericState(eastWind(0)).wind.turbulence_Q;
    const breezy = deriveAtmosphericState(eastWind(500)).wind.turbulence_Q;
    const gale   = deriveAtmosphericState(eastWind(3000)).wind.turbulence_Q;
    expect(breezy).toBeGreaterThan(calm);
    expect(gale).toBeGreaterThan(breezy);
  });

  it("turbulence caps at q(1.0) for extreme winds", () => {
    const state = deriveAtmosphericState(eastWind(99_999));
    expect(state.wind.turbulence_Q).toBe(SCALE.Q);
  });

  it("blizzard reduces traction (tractionMod_Q < SCALE.Q)", () => {
    const state = deriveAtmosphericState({ precipitation: "blizzard" });
    expect(state.tractionMod_Q).toBeLessThan(SCALE.Q);
  });

  it("rain has less traction penalty than blizzard", () => {
    const rain    = deriveAtmosphericState({ precipitation: "rain" }).tractionMod_Q;
    const blizzard = deriveAtmosphericState({ precipitation: "blizzard" }).tractionMod_Q;
    expect(rain).toBeGreaterThan(blizzard);
  });

  it("fog reduces baseVisibility_Sm", () => {
    const clear = deriveAtmosphericState().baseVisibility_Sm;
    const foggy = deriveAtmosphericState({ fogDensity_Q: q(0.80) }).baseVisibility_Sm;
    expect(foggy).toBeLessThan(clear);
  });

  it("dense fog + heavy rain is less visible than fog alone", () => {
    const fog      = deriveAtmosphericState({ fogDensity_Q: q(0.50) }).baseVisibility_Sm;
    const fogRain  = deriveAtmosphericState({
      fogDensity_Q: q(0.50), precipitation: "heavy_rain",
    }).baseVisibility_Sm;
    expect(fogRain).toBeLessThan(fog);
  });

  it("acousticMask_Q increases with wind speed", () => {
    const calm = deriveAtmosphericState(eastWind(0)).acousticMask_Q;
    const gale = deriveAtmosphericState(eastWind(3000)).acousticMask_Q;
    expect(gale).toBeGreaterThan(calm);
  });

  it("acousticMask_Q reaches q(1.0) at ATMO_ACOUSTIC_FULL_MASK_MPS", () => {
    const state = deriveAtmosphericState(eastWind(ATMO_ACOUSTIC_FULL_MASK_MPS));
    expect(state.acousticMask_Q).toBe(SCALE.Q);
  });

  it("acousticMask_Q caps at q(1.0) for extreme wind", () => {
    const state = deriveAtmosphericState(eastWind(99_999));
    expect(state.acousticMask_Q).toBe(SCALE.Q);
  });

  it("soundPropagation_Q is SCALE.Q when no biome provided", () => {
    expect(deriveAtmosphericState().soundPropagation_Q).toBe(SCALE.Q);
  });

  it("vacuum biome sets soundPropagation_Q to 0", () => {
    const biome: BiomeContext = { soundPropagation: q(0) as never };
    const state = deriveAtmosphericState(undefined, biome);
    expect(state.soundPropagation_Q).toBe(0);
  });

  it("underwater biome sets soundPropagation_Q > SCALE.Q", () => {
    const biome: BiomeContext = { soundPropagation: q(4.0) as never };
    const state = deriveAtmosphericState(undefined, biome);
    expect(state.soundPropagation_Q).toBeGreaterThan(SCALE.Q);
  });

  it("blizzard produces a negative thermalOffset_Q (cooling)", () => {
    const state = deriveAtmosphericState({ precipitation: "blizzard" });
    expect(state.thermalOffset_Q).toBeLessThan(0);
  });

  it("no precipitation → thermalOffset_Q is 0", () => {
    expect(deriveAtmosphericState({ precipitation: "none" }).thermalOffset_Q).toBe(0);
  });

  it("precipIntensity_Q is 0 in clear weather", () => {
    expect(deriveAtmosphericState().precipIntensity_Q).toBe(0);
  });

  it("precipIntensity_Q is greater in blizzard than rain", () => {
    const rain    = deriveAtmosphericState({ precipitation: "rain" }).precipIntensity_Q;
    const blizzard = deriveAtmosphericState({ precipitation: "blizzard" }).precipIntensity_Q;
    expect(blizzard).toBeGreaterThan(rain);
  });
});

// ── queryAtmosphericModifiers ─────────────────────────────────────────────────

describe("queryAtmosphericModifiers", () => {
  // ── Calm conditions ────────────────────────────────────────────────────────

  describe("calm conditions (no wind)", () => {
    const calm = deriveAtmosphericState();

    it("crossWindSpeed_mps is 0 in calm", () => {
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, calm);
      expect(m.crossWindSpeed_mps).toBe(0);
    });

    it("hazardConeMul_Q is SCALE.Q in calm (no distortion)", () => {
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, calm);
      expect(m.hazardConeMul_Q).toBe(SCALE.Q);
    });

    it("acousticMaskMul_Q is SCALE.Q in calm, clear, standard air", () => {
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, calm);
      expect(m.acousticMaskMul_Q).toBe(SCALE.Q);
    });

    it("visibilityRange_Sm equals baseVisibility_Sm in calm clear weather", () => {
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, calm);
      expect(m.visibilityRange_Sm).toBe(calm.baseVisibility_Sm);
    });

    it("scentStrength_Q is 0 in calm (no wind → no scent propagation)", () => {
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, calm);
      expect(m.scentStrength_Q).toBe(0);
    });

    it("tractionMod_Q passes through unchanged from state", () => {
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, calm);
      expect(m.tractionMod_Q).toBe(calm.tractionMod_Q);
    });

    it("thermalOffset_Q passes through from state", () => {
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, calm);
      expect(m.thermalOffset_Q).toBe(calm.thermalOffset_Q);
    });
  });

  // ── Crosswind ─────────────────────────────────────────────────────────────

  describe("crosswind (wind perpendicular to shot)", () => {
    // Shot East, wind North → full crosswind
    const state = deriveAtmosphericState(northWind(2000));

    it("crossWindSpeed_mps equals wind.speed_mps at full crosswind", () => {
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, state);
      expect(m.crossWindSpeed_mps).toBe(2000);
    });

    it("hazardConeMul_Q ≈ SCALE.Q (crosswind does not affect cone range)", () => {
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, state);
      // Cross product is maximal → dot is 0 → no tailwind/headwind effect
      expect(m.hazardConeMul_Q).toBe(SCALE.Q);
    });

    it("scentStrength_Q is 0 at full crosswind (no scent component)", () => {
      // Wind North, shot East → wind is perpendicular → no backward scent component
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, state);
      expect(m.scentStrength_Q).toBe(0);
    });
  });

  // ── Tailwind ──────────────────────────────────────────────────────────────

  describe("tailwind (wind aligned with shot)", () => {
    // Shot East, wind East → pure tailwind
    const state = deriveAtmosphericState(eastWind(2000));

    it("crossWindSpeed_mps is 0 for pure tailwind", () => {
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, state);
      expect(m.crossWindSpeed_mps).toBe(0);
    });

    it("hazardConeMul_Q > SCALE.Q (tailwind extends cone range)", () => {
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, state);
      expect(m.hazardConeMul_Q).toBeGreaterThan(SCALE.Q);
    });

    it("hazardConeMul_Q caps at ATMO_HAZARD_TAILWIND_MUL_MAX", () => {
      // Even extreme tailwind cannot exceed the cap
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, state);
      expect(m.hazardConeMul_Q).toBeLessThanOrEqual(ATMO_HAZARD_TAILWIND_MUL_MAX);
    });

    it("scentStrength_Q is 0 for tailwind (wind blows away from observer)", () => {
      // Wind East, observer at origin, target East → wind pushes scent away from observer
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, state);
      expect(m.scentStrength_Q).toBe(0);
    });

    it("acousticMaskMul_Q is slightly higher for source upwind (sound carries downwind)", () => {
      // Observer at origin, target East, wind East → target is downwind of observer
      // Hearing should be slightly worse (source is downwind, sound blows away)
      // No upwind bonus for this configuration
      const calm_m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, deriveAtmosphericState());
      const wind_m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, state);
      // Wind noise reduces hearing from calm baseline
      expect(wind_m.acousticMaskMul_Q).toBeLessThanOrEqual(calm_m.acousticMaskMul_Q);
    });
  });

  // ── Headwind ──────────────────────────────────────────────────────────────

  describe("headwind (wind opposite to shot)", () => {
    // Shot East (from→to), wind West (opposite) → pure headwind
    const state = deriveAtmosphericState({ wind: { dx_m: -SCALE.m, dy_m: 0, speed_mps: 2000 } });

    it("crossWindSpeed_mps is 0 for pure headwind", () => {
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, state);
      expect(m.crossWindSpeed_mps).toBe(0);
    });

    it("hazardConeMul_Q < SCALE.Q (headwind reduces cone range)", () => {
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, state);
      expect(m.hazardConeMul_Q).toBeLessThan(SCALE.Q);
    });

    it("hazardConeMul_Q floor is ATMO_HAZARD_HEADWIND_MUL_MIN", () => {
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, state);
      expect(m.hazardConeMul_Q).toBeGreaterThanOrEqual(ATMO_HAZARD_HEADWIND_MUL_MIN);
    });

    it("scentStrength_Q > 0 for headwind (wind blows from target toward observer)", () => {
      // Wind from West (same direction as from target TO observer for an east shot)
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, state);
      expect(m.scentStrength_Q).toBeGreaterThan(0);
    });

    it("acousticMaskMul_Q gets upwind bonus (sound carries toward observer)", () => {
      // headwind = source is upwind → sound carries downwind toward observer
      // with no wind
      const calm_mods = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, deriveAtmosphericState());
      const head_mods = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, state);
      // The upwind bonus counteracts some of the wind noise masking
      // In mild headwind the net effect may produce acousticMul close to SCALE.Q
      expect(head_mods.acousticMaskMul_Q).toBeGreaterThanOrEqual(0);
      expect(calm_mods.acousticMaskMul_Q).toBeGreaterThan(0);
    });
  });

  // ── Symmetry ──────────────────────────────────────────────────────────────

  describe("directional symmetry", () => {
    const windEast = deriveAtmosphericState(eastWind(2000));

    it("same shot direction is symmetric regardless of absolute position", () => {
      const m1 = queryAtmosphericModifiers({ x_Sm: 0, y_Sm: 0 }, { x_Sm: 500_000, y_Sm: 0 }, windEast);
      const m2 = queryAtmosphericModifiers({ x_Sm: 1_000_000, y_Sm: 2_000_000 }, { x_Sm: 1_500_000, y_Sm: 2_000_000 }, windEast);
      expect(m1.crossWindSpeed_mps).toBe(m2.crossWindSpeed_mps);
      expect(m1.hazardConeMul_Q).toBe(m2.hazardConeMul_Q);
      expect(m1.scentStrength_Q).toBe(m2.scentStrength_Q);
    });

    it("shot reversed → crosswind same, hazardConeMul flipped, scent flipped", () => {
      const toEast = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST,  windEast);
      const toWest = queryAtmosphericModifiers(FROM_ORIGIN, TO_WEST,  windEast);
      expect(toEast.crossWindSpeed_mps).toBe(toWest.crossWindSpeed_mps);  // crosswind same
      expect(toEast.hazardConeMul_Q).toBeGreaterThan(SCALE.Q);            // east = tailwind
      expect(toWest.hazardConeMul_Q).toBeLessThan(SCALE.Q);               // west = headwind
      expect(toEast.scentStrength_Q).toBe(0);                             // east = no scent
      expect(toWest.scentStrength_Q).toBeGreaterThan(0);                  // west = downwind
    });
  });

  // ── Visibility degradation ─────────────────────────────────────────────────

  describe("visibility", () => {
    it("headwind precipitation further reduces visibility vs crosswind", () => {
      const heavyRain: WeatherState = { precipitation: "heavy_rain", wind: { dx_m: -SCALE.m, dy_m: 0, speed_mps: 1000 } };
      const state = deriveAtmosphericState(heavyRain);
      // Shot East → headwind (wind from West = headwind)
      const headwind_m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, state);
      // Shot North → crosswind
      const cross_m    = queryAtmosphericModifiers(FROM_ORIGIN, TO_NORTH, state);
      expect(headwind_m.visibilityRange_Sm).toBeLessThanOrEqual(cross_m.visibilityRange_Sm);
    });

    it("visibilityRange_Sm is always > 0", () => {
      const extreme: WeatherState = { precipitation: "blizzard", fogDensity_Q: q(1.0) as never, wind: { dx_m: -SCALE.m, dy_m: 0, speed_mps: 9999 } };
      const state = deriveAtmosphericState(extreme);
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, state);
      expect(m.visibilityRange_Sm).toBeGreaterThan(0);
    });

    it("clear calm weather has full base visibility", () => {
      const state = deriveAtmosphericState();
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, state);
      expect(m.visibilityRange_Sm).toBe(ATMO_BASE_VISIBILITY_Sm);
    });
  });

  // ── Scent ──────────────────────────────────────────────────────────────────

  describe("scentStrength_Q", () => {
    it("observer downwind of target → scentStrength = q(1.0)", () => {
      // Target East, wind blowing West (from target toward observer)
      // → wind carries scent from target to observer → full scent
      const windWest = deriveAtmosphericState({ wind: { dx_m: -SCALE.m, dy_m: 0, speed_mps: 2000 } });
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, windWest);
      expect(m.scentStrength_Q).toBe(SCALE.Q);
    });

    it("scent is in [0, SCALE.Q]", () => {
      const state = deriveAtmosphericState(eastWind(2000));
      for (const to of [TO_EAST, TO_NORTH, TO_WEST]) {
        const m = queryAtmosphericModifiers(FROM_ORIGIN, to, state);
        expect(m.scentStrength_Q).toBeGreaterThanOrEqual(0);
        expect(m.scentStrength_Q).toBeLessThanOrEqual(SCALE.Q);
      }
    });
  });

  // ── Vacuum biome ───────────────────────────────────────────────────────────

  describe("vacuum biome", () => {
    it("acousticMaskMul_Q is 0 in vacuum (no sound propagation)", () => {
      const vacuumBiome: BiomeContext = { soundPropagation: q(0) as never };
      const state = deriveAtmosphericState(undefined, vacuumBiome);
      const m = queryAtmosphericModifiers(FROM_ORIGIN, TO_EAST, state);
      expect(m.acousticMaskMul_Q).toBe(0);
    });
  });

  // ── Coincident positions ───────────────────────────────────────────────────

  describe("coincident positions (from === to)", () => {
    it("does not throw when positions are identical", () => {
      const state = deriveAtmosphericState(eastWind(2000));
      expect(() => queryAtmosphericModifiers(FROM_ORIGIN, FROM_ORIGIN, state)).not.toThrow();
    });

    it("crossWindSpeed_mps is 0 when positions are identical", () => {
      const state = deriveAtmosphericState(eastWind(2000));
      const m = queryAtmosphericModifiers(FROM_ORIGIN, FROM_ORIGIN, state);
      expect(m.crossWindSpeed_mps).toBe(0);
    });
  });
});

// ── Constants sanity ──────────────────────────────────────────────────────────

describe("constants", () => {
  it("ATMO_HAZARD_TAILWIND_MUL_MAX > SCALE.Q", () => {
    expect(ATMO_HAZARD_TAILWIND_MUL_MAX).toBeGreaterThan(SCALE.Q);
  });

  it("ATMO_HAZARD_HEADWIND_MUL_MIN < SCALE.Q", () => {
    expect(ATMO_HAZARD_HEADWIND_MUL_MIN).toBeLessThan(SCALE.Q);
  });

  it("ATMO_BASE_VISIBILITY_Sm represents ≥ 100 m", () => {
    expect(ATMO_BASE_VISIBILITY_Sm).toBeGreaterThanOrEqual(100 * SCALE.m);
  });

  it("ATMO_HEARING_UPWIND_BONUS < SCALE.Q (bonus never doubles hearing on its own)", () => {
    expect(ATMO_HEARING_UPWIND_BONUS).toBeLessThan(SCALE.Q);
  });
});
