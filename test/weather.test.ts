// test/weather.test.ts — Phase 51: Weather & Atmospheric Environment

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import {
  deriveWeatherModifiers,
  computeWindAimError,
  adjustConeRange,
  WEATHER_Q_PER_DEG_C,
  type WeatherState,
  type WindField,
} from "../src/sim/weather.js";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing.js";
import { stepWorld } from "../src/sim/kernel.js";
import type { KernelContext } from "../src/sim/context.js";
import type { ItemBase } from "../src/equipment.js";
import { DEFAULT_SENSORY_ENV } from "../src/sim/sensory.js";
import { cToQ } from "../src/sim/thermoregulation.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Pure crosswind — shot goes East (+x), wind blows North (+y). */
function crosswind(speed_mps: number): WindField {
  return { dx_m: 0, dy_m: SCALE.m, speed_mps };
}

/** Pure headwind — shot goes East (+x), wind also blows East (+x). */
function _headwind(speed_mps: number): WindField {
  return { dx_m: SCALE.m, dy_m: 0, speed_mps };
}

/** Pure tailwind — shot goes East (+x), wind blows West (−x). */
function _tailwind(speed_mps: number): WindField {
  return { dx_m: -SCALE.m, dy_m: 0, speed_mps };
}

/** Minimal ctx for stepWorld. */
function mkCtx(overrides: Record<string, unknown> = {}) {
  return { tractionCoeff: q(0.9), ...overrides } as unknown as KernelContext;
}

// ── deriveWeatherModifiers ─────────────────────────────────────────────────────

describe("deriveWeatherModifiers", () => {
  it("empty weather → all q(1.0), no thermal offset", () => {
    const m = deriveWeatherModifiers({});
    expect(m.tractionMul_Q).toBe(SCALE.Q);
    expect(m.lightMul_Q).toBe(SCALE.Q);
    expect(m.precipVisionMul_Q).toBe(SCALE.Q);
    expect(m.thermalOffset_Q).toBe(0);
  });

  it("rain → tractionMul_Q = q(0.85), thermalOffset_Q < 0", () => {
    const m = deriveWeatherModifiers({ precipitation: "rain" });
    expect(m.tractionMul_Q).toBe(q(0.85));
    expect(m.thermalOffset_Q).toBeLessThan(0);
    expect(m.thermalOffset_Q).toBe(-(1 * WEATHER_Q_PER_DEG_C));
  });

  it("heavy_rain tractionMul_Q < rain tractionMul_Q", () => {
    const rain = deriveWeatherModifiers({ precipitation: "rain" });
    const heavy = deriveWeatherModifiers({ precipitation: "heavy_rain" });
    expect(heavy.tractionMul_Q).toBeLessThan(rain.tractionMul_Q);
    expect(heavy.lightMul_Q).toBeLessThan(rain.lightMul_Q);
  });

  it("snow → tractionMul_Q = q(0.60), thermalOffset 5 °C cooling", () => {
    const m = deriveWeatherModifiers({ precipitation: "snow" });
    expect(m.tractionMul_Q).toBe(q(0.60));
    expect(m.thermalOffset_Q).toBe(-(5 * WEATHER_Q_PER_DEG_C));
  });

  it("blizzard → lightMul_Q = q(0.30), precipVisionMul_Q = q(0.30)", () => {
    const m = deriveWeatherModifiers({ precipitation: "blizzard" });
    expect(m.lightMul_Q).toBe(q(0.30));
    expect(m.precipVisionMul_Q).toBe(q(0.30));
  });

  it("hail → precipVisionMul_Q = q(0.85)", () => {
    const m = deriveWeatherModifiers({ precipitation: "hail" });
    expect(m.precipVisionMul_Q).toBe(q(0.85));
  });

  it("fog q(0.50) alone → lightMul_Q = q(0.50)", () => {
    const m = deriveWeatherModifiers({ fogDensity_Q: q(0.50) });
    // fogMul = SCALE.Q - q(0.50) = 5000; lightMul_Q = 10000 * 5000 / 10000 = 5000 = q(0.50)
    expect(m.lightMul_Q).toBe(q(0.50));
    expect(m.tractionMul_Q).toBe(SCALE.Q);  // no precipitation
  });

  it("rain + fog q(0.50) → lightMul_Q lower than rain or fog alone", () => {
    const rainOnly = deriveWeatherModifiers({ precipitation: "rain" });
    const fogOnly  = deriveWeatherModifiers({ fogDensity_Q: q(0.50) });
    const combined = deriveWeatherModifiers({ precipitation: "rain", fogDensity_Q: q(0.50) });
    expect(combined.lightMul_Q).toBeLessThan(rainOnly.lightMul_Q);
    expect(combined.lightMul_Q).toBeLessThan(fogOnly.lightMul_Q);
  });
});

// ── computeWindAimError ───────────────────────────────────────────────────────

describe("computeWindAimError", () => {
  // shot east, 100m range (100_000 SCALE.m), arrow at 50 m/s (5000 SCALE.mps)
  const DIST  = 100 * SCALE.m;   // 100_000
  const EARROW = 5_000;           // 50 m/s in SCALE.mps

  it("zero wind speed → 0", () => {
    expect(computeWindAimError({ dx_m: 0, dy_m: SCALE.m, speed_mps: 0 }, SCALE.m, 0, DIST, EARROW)).toBe(0);
  });

  it("zero dist_m → 0", () => {
    expect(computeWindAimError(crosswind(1000), SCALE.m, 0, 0, EARROW)).toBe(0);
  });

  it("zero v_proj_mps → 0", () => {
    expect(computeWindAimError(crosswind(1000), SCALE.m, 0, DIST, 0)).toBe(0);
  });

  it("pure crosswind → positive error", () => {
    // shot East (dx_m = SCALE.m, dy_m = 0), wind North (dx_m=0, dy_m=SCALE.m)
    const err = computeWindAimError(crosswind(1000), SCALE.m, 0, DIST, EARROW);
    expect(err).toBeGreaterThan(0);
  });

  it("pure parallel shot (headwind, dot product → zero cross) → 0", () => {
    // shot East (SCALE.m, 0), wind East (SCALE.m, 0) → cross = 0
    const wind: WindField = { dx_m: SCALE.m, dy_m: 0, speed_mps: 1000 };
    expect(computeWindAimError(wind, SCALE.m, 0, DIST, EARROW)).toBe(0);
  });

  it("error scales linearly with range (2× range → 2× error)", () => {
    // shotDx_m must match the actual distance (kernel passes Number(dx) = target.x - shooter.x)
    const err100 = computeWindAimError(crosswind(1000), 100 * SCALE.m, 0, 100 * SCALE.m, EARROW);
    const err200 = computeWindAimError(crosswind(1000), 200 * SCALE.m, 0, 200 * SCALE.m, EARROW);
    expect(err200).toBe(err100 * 2);
  });

  it("error inversely proportional to v_proj (2× speed → ½ error)", () => {
    const errSlow = computeWindAimError(crosswind(1000), SCALE.m, 0, DIST, EARROW);
    const errFast = computeWindAimError(crosswind(1000), SCALE.m, 0, DIST, EARROW * 2);
    expect(errSlow).toBe(errFast * 2);
  });

  it("slow arrow has 9× more drift than fast rifle at same wind+range", () => {
    const arrow  = computeWindAimError(crosswind(500), SCALE.m, 0, 100 * SCALE.m, 5_000);   // 50 m/s
    const rifle  = computeWindAimError(crosswind(500), SCALE.m, 0, 100 * SCALE.m, 45_000);  // 450 m/s
    expect(arrow).toBeGreaterThan(rifle * 8);
  });

  it("45° wind → error ≈ sin(45°) × full-crosswind error", () => {
    // wind at 45° = (dx, dy) = (SCALE.m / sqrt2, SCALE.m / sqrt2) but keep integer
    const s = Math.round(SCALE.m / Math.SQRT2);
    const wind45: WindField = { dx_m: s, dy_m: s, speed_mps: 1000 };
    const errFull  = computeWindAimError(crosswind(1000), SCALE.m, 0, DIST, EARROW);
    const err45    = computeWindAimError(wind45, SCALE.m, 0, DIST, EARROW);
    // sin(45°) ≈ 0.707 → err45 ≈ 0.707 × errFull  (allow integer rounding)
    expect(err45).toBeGreaterThan(Math.round(errFull * 0.60));
    expect(err45).toBeLessThan(Math.round(errFull * 0.80));
  });
});

// ── adjustConeRange ───────────────────────────────────────────────────────────

describe("adjustConeRange", () => {
  const BASE_RANGE = 10 * SCALE.m;  // 10 m

  it("no wind (speed=0) → unchanged range", () => {
    const wind: WindField = { dx_m: SCALE.m, dy_m: 0, speed_mps: 0 };
    expect(adjustConeRange(wind, SCALE.m, 0, BASE_RANGE)).toBe(BASE_RANGE);
  });

  it("full headwind → range reduced below original", () => {
    // cone faces East (+x), wind also East (+x) = headwind for East-facing cone
    // Wait: dot = coneDx * windDx + coneDy * windDy. If cone faces East and wind is East,
    // wind is coming FROM the West TOWARD the East — a tailwind for the cone.
    // Headwind = wind opposes cone direction = wind blows WEST when cone faces EAST.
    const wind: WindField = { dx_m: -SCALE.m, dy_m: 0, speed_mps: 3_000 }; // 30 m/s wind from east
    const adjusted = adjustConeRange(wind, SCALE.m, 0, BASE_RANGE);
    expect(adjusted).toBeLessThan(BASE_RANGE);
  });

  it("full tailwind → range extended above original", () => {
    // cone faces East (+x), wind blows East (+x) = tailwind (helps the cone)
    const wind: WindField = { dx_m: SCALE.m, dy_m: 0, speed_mps: 3_000 };
    const adjusted = adjustConeRange(wind, SCALE.m, 0, BASE_RANGE);
    expect(adjusted).toBeGreaterThan(BASE_RANGE);
  });

  it("pure crosswind → range unchanged (dot product ≈ 0)", () => {
    // cone faces East (+x), wind blows North (+y) → dot = SCALE.m*0 + 0*SCALE.m = 0
    const wind: WindField = { dx_m: 0, dy_m: SCALE.m, speed_mps: 5_000 };
    const adjusted = adjustConeRange(wind, SCALE.m, 0, BASE_RANGE);
    expect(adjusted).toBe(BASE_RANGE);
  });

  it("very strong headwind → clamped at −20% reduction", () => {
    const wind: WindField = { dx_m: -SCALE.m, dy_m: 0, speed_mps: 50_000 }; // 500 m/s extreme
    const adjusted = adjustConeRange(wind, SCALE.m, 0, BASE_RANGE);
    const minRange = BASE_RANGE - Math.trunc(BASE_RANGE * 2_000 / SCALE.Q);  // 80% of base
    expect(adjusted).toBeGreaterThanOrEqual(minRange - 1);  // allow rounding
  });
});

// ── Kernel integration ─────────────────────────────────────────────────────────

describe("weather kernel integration", () => {
  it("no weather field → tractionCoeff unchanged after stepWorld", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const w = mkWorld(1, [e]);
    const ctx = mkCtx({ tractionCoeff: q(0.9) });
    const originalTraction = ctx.tractionCoeff;
    stepWorld(w, new Map(), ctx);
    expect(ctx.tractionCoeff).toBe(originalTraction);
  });

  it("rain weather → tractionCoeff reduced by ~15%", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const w = mkWorld(1, [e]);
    const ctx = mkCtx({ tractionCoeff: q(1.0), weather: { precipitation: "rain" } as WeatherState });
    stepWorld(w, new Map(), ctx);
    // rain tractionMul = q(0.85) → 10000 * 0.85 = 8500
    expect(ctx.tractionCoeff).toBe(q(0.85));
  });

  it("fog → (world).runtimeState.sensoryEnv.lightMul reduced", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const w = mkWorld(1, [e]);
    const ctx = mkCtx({ weather: { fogDensity_Q: q(0.50) } as WeatherState });
    stepWorld(w, new Map(), ctx);
    const env = w.runtimeState!.sensoryEnv!;
    expect(env.lightMul).toBeLessThan(DEFAULT_SENSORY_ENV.lightMul);
  });

  it("heavy_rain → (world).runtimeState.sensoryEnv.smokeMul reduced", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const w = mkWorld(1, [e]);
    const ctx = mkCtx({ weather: { precipitation: "heavy_rain" } as WeatherState });
    stepWorld(w, new Map(), ctx);
    const env = w.runtimeState!.sensoryEnv!;
    expect(env.smokeMul).toBeLessThan(DEFAULT_SENSORY_ENV.smokeMul);
  });

  it("snow + thermalAmbient_Q → ambient is cooler after stepWorld", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const w = mkWorld(1, [e]);
    const ambient20C = cToQ(20);
    const ctx = mkCtx({
      thermalAmbient_Q: ambient20C,
      weather: { precipitation: "snow" } as WeatherState,
    });
    stepWorld(w, new Map(), ctx);
    // snow thermalDegC = 5 → offset = −5*185 = −925
    expect(ctx.thermalAmbient_Q).toBe(ambient20C - 5 * WEATHER_Q_PER_DEG_C);
  });

  it("blizzard → both traction and lightMul severely degraded", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const w = mkWorld(1, [e]);
    const ctx = mkCtx({ tractionCoeff: q(1.0), weather: { precipitation: "blizzard" } as WeatherState });
    stepWorld(w, new Map(), ctx);
    const env = w.runtimeState!.sensoryEnv!;
    expect(ctx.tractionCoeff).toBe(q(0.40));
    expect(env.lightMul).toBe(q(0.30));
  });

  it("weather absent → no crash (backward-compatible)", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const w = mkWorld(1, [e]);
    const ctx = mkCtx();
    expect(() => stepWorld(w, new Map(), ctx)).not.toThrow();
  });

  it("weather with no thermalAmbient_Q → thermal offset not applied (no crash)", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const w = mkWorld(1, [e]);
    const ctx = mkCtx({ weather: { precipitation: "snow" } as WeatherState });
    // thermalAmbient_Q is absent — should not crash
    expect(() => stepWorld(w, new Map(), ctx)).not.toThrow();
    expect(ctx.thermalAmbient_Q).toBeUndefined();
  });

  it("combined fog + rain → lightMul lower than either alone", () => {
    function runAndGetLightMul(weather: WeatherState) {
      const e = mkHumanoidEntity(1, 1, 0, 0);
      const w = mkWorld(1, [e]);
      const ctx = mkCtx({ weather });
      stepWorld(w, new Map(), ctx);
      return w.runtimeState!.sensoryEnv!.lightMul as number;
    }
    const rainOnly     = runAndGetLightMul({ precipitation: "rain" });
    const fogOnly      = runAndGetLightMul({ fogDensity_Q: q(0.40) });
    const combined     = runAndGetLightMul({ precipitation: "rain", fogDensity_Q: q(0.40) });
    expect(combined).toBeLessThan(rainOnly);
    expect(combined).toBeLessThan(fogOnly);
  });

  it("wind crosswind → ranged shot at long range misses due to drift", () => {
    // Bow: slow arrow at ~50 m/s, 50 m/s pure crosswind, target 300m away.
    // Drift ≈ 300m → gRadius_m enormous → always miss.
    const shooter = mkHumanoidEntity(1, 1, 0, 0);
    const target  = mkHumanoidEntity(2, 2, 300 * SCALE.m, 0);  // 300m East

    // Give shooter a bow-like ranged weapon
    const bow = {
      id: "test_bow",
      name: "Test Bow",
      category: "ranged" as const,
      handedness: "two-handed" as const,
      mass_kg: Math.round(0.5 * SCALE.kg),
      reach_m: Math.round(0.5 * SCALE.m),
      projectileMass_kg: Math.round(0.030 * SCALE.kg),  // 30 g arrow
      launchEnergy_J: 80,                               // ~80 J → ~73 m/s
      dragCoeff_perM: 0.001,
      dispersionQ: q(0.10),
      damage: { surfaceFrac: q(0.3), internalFrac: q(0.5), structuralFrac: q(0.2), bleedFactor: q(0.4), penetrationBias: q(0.3) },
    };
    shooter.loadout.items = [bow as unknown as ItemBase];

    const world = mkWorld(42, [shooter, target]);

    // Extreme 50 m/s crosswind (5000 SCALE.mps) blowing North
    const ctx = mkCtx({
      weather: { wind: crosswind(5_000) } as WeatherState,
    });

    // Issue shoot command
    const cmds = new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "test_bow" }]]]);

    // Run 5 ticks — target should take no damage due to extreme drift
    for (let i = 0; i < 5; i++) {
      stepWorld(world, cmds, ctx);
    }

    const t = world.entities.find(e => e.id === 2)!;
    const totalInjury = Object.values(t.injury.byRegion)
      .reduce((s, r) => s + (r?.internalDamage ?? 0), 0);
    // With ~300m wind drift, shots should miss entirely
    expect(totalInjury).toBe(0);
  });
});
