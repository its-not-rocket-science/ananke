// test/sensory-extended.test.ts — Phase 52: Extended Sensory Systems

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import {
  computeDaylightMul,
  canDetectByEcholocation,
  canDetectByElectroreception,
  deriveScentDetection,
  canDetectExtended,
  DETECT_ECHOLOCATION,
  DETECT_ELECTRORECEPTION,
  type ExtendedSenses,
} from "../src/sim/sensory-extended.js";
import { mkHumanoidEntity } from "../src/sim/testing.js";
import { DEFAULT_SENSORY_ENV } from "../src/sim/sensory.js";
import type { WindField } from "../src/sim/weather.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function mkEntity(id: number, x = 0, y = 0) {
  const e = mkHumanoidEntity(id, id, x, y);
  return e;
}

function withSenses(e: ReturnType<typeof mkEntity>, s: ExtendedSenses) {
  e.extendedSenses = s;
  return e;
}

/** Wind blowing East (+x). */
const WIND_EAST: WindField = { dx_m: SCALE.m, dy_m: 0, speed_mps: 1_000 };

/** Wind blowing West (−x). */
const WIND_WEST: WindField = { dx_m: -SCALE.m, dy_m: 0, speed_mps: 1_000 };

/** Noisy environment (2× normal noise). */
const NOISY_ENV = { ...DEFAULT_SENSORY_ENV, noiseMul: q(2.0) };

// ── computeDaylightMul ─────────────────────────────────────────────────────────

describe("computeDaylightMul", () => {
  it("noon (12h) → q(1.0)", () => {
    expect(computeDaylightMul(12)).toBe(SCALE.Q);
  });

  it("midnight (0h) → q(0.10)", () => {
    expect(computeDaylightMul(0)).toBe(q(0.10));
  });

  it("midnight (24h) → same as 0h (q(0.10))", () => {
    expect(computeDaylightMul(24)).toBe(q(0.10));
  });

  it("6h (dawn) is between q(0.10) and q(1.0)", () => {
    const dawn = computeDaylightMul(6);
    expect(dawn).toBeGreaterThan(q(0.10));
    expect(dawn).toBeLessThan(SCALE.Q);
  });

  it("18h (dusk) ≈ 6h (dawn) — symmetric", () => {
    expect(computeDaylightMul(18)).toBe(computeDaylightMul(6));
  });

  it("midnight < dawn < noon (monotonically increasing up to noon)", () => {
    const night = computeDaylightMul(0);
    const dawn  = computeDaylightMul(6);
    const noon  = computeDaylightMul(12);
    expect(night).toBeLessThan(dawn);
    expect(dawn).toBeLessThan(noon);
  });
});

// ── canDetectByEcholocation ────────────────────────────────────────────────────

describe("canDetectByEcholocation", () => {
  it("observer without extendedSenses → false", () => {
    const obs = mkEntity(1);
    const sub = mkEntity(2);
    expect(canDetectByEcholocation(obs, sub, SCALE.m * 5, DEFAULT_SENSORY_ENV.noiseMul)).toBe(false);
  });

  it("target within range → true", () => {
    const obs = withSenses(mkEntity(1), { echolocationRange_m: 20 * SCALE.m });
    const sub = mkEntity(2);
    expect(canDetectByEcholocation(obs, sub, 5 * SCALE.m, DEFAULT_SENSORY_ENV.noiseMul)).toBe(true);
  });

  it("target beyond range → false", () => {
    const obs = withSenses(mkEntity(1), { echolocationRange_m: 20 * SCALE.m });
    const sub = mkEntity(2);
    expect(canDetectByEcholocation(obs, sub, 25 * SCALE.m, DEFAULT_SENSORY_ENV.noiseMul)).toBe(false);
  });

  it("2× noise → effective range halved; target at 15m now outside", () => {
    const obs = withSenses(mkEntity(1), { echolocationRange_m: 20 * SCALE.m });
    const sub = mkEntity(2);
    // Without noise: 15m within 20m → true
    expect(canDetectByEcholocation(obs, sub, 15 * SCALE.m, DEFAULT_SENSORY_ENV.noiseMul)).toBe(true);
    // 2× noise → effective range = 10m → 15m now outside
    expect(canDetectByEcholocation(obs, sub, 15 * SCALE.m, NOISY_ENV.noiseMul)).toBe(false);
  });

  it("works regardless of light (echolocation is sound-based, not visual)", () => {
    const obs = withSenses(mkEntity(1), { echolocationRange_m: 20 * SCALE.m });
    const sub = mkEntity(2);
    // This test just verifies the function ignores light — it uses noiseMul not lightMul
    const darkEnv = { ...DEFAULT_SENSORY_ENV, lightMul: q(0) };
    // We pass DEFAULT noiseMul even though env is dark — echolocation doesn't care about light
    expect(canDetectByEcholocation(obs, sub, 5 * SCALE.m, darkEnv.noiseMul)).toBe(true);
  });

  it("dead target → still detectable (echolocation detects physical mass)", () => {
    const obs = withSenses(mkEntity(1), { echolocationRange_m: 20 * SCALE.m });
    const sub = mkEntity(2);
    sub.injury.dead = true;
    expect(canDetectByEcholocation(obs, sub, 5 * SCALE.m, DEFAULT_SENSORY_ENV.noiseMul)).toBe(true);
  });
});

// ── canDetectByElectroreception ────────────────────────────────────────────────

describe("canDetectByElectroreception", () => {
  it("observer without extendedSenses → false", () => {
    const obs = mkEntity(1);
    const sub = mkEntity(2);
    expect(canDetectByElectroreception(obs, sub, SCALE.m)).toBe(false);
  });

  it("living target within range → true", () => {
    const obs = withSenses(mkEntity(1), { electroreceptionRange_m: 2 * SCALE.m });
    const sub = mkEntity(2);
    expect(canDetectByElectroreception(obs, sub, 1 * SCALE.m)).toBe(true);
  });

  it("living target beyond range → false", () => {
    const obs = withSenses(mkEntity(1), { electroreceptionRange_m: 2 * SCALE.m });
    const sub = mkEntity(2);
    expect(canDetectByElectroreception(obs, sub, 3 * SCALE.m)).toBe(false);
  });

  it("dead target → false (no bioelectric field)", () => {
    const obs = withSenses(mkEntity(1), { electroreceptionRange_m: 5 * SCALE.m });
    const sub = mkEntity(2);
    sub.injury.dead = true;
    expect(canDetectByElectroreception(obs, sub, 1 * SCALE.m)).toBe(false);
  });
});

// ── deriveScentDetection ───────────────────────────────────────────────────────

describe("deriveScentDetection", () => {
  it("observer without olfaction → q(0)", () => {
    const obs = mkEntity(1, 0, 0);
    const sub = mkEntity(2, 10 * SCALE.m, 0);
    expect(deriveScentDetection(obs, sub, 10 * SCALE.m)).toBe(0);
  });

  it("high sensitivity, close range, no wind → strong detection", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { olfactionSensitivity_Q: q(1.0) });
    const sub = mkEntity(2, 5 * SCALE.m, 0);
    // No wind → windMul = q(0.50); at 5m: strength = 10000 * 50000 / 5000 = 100000 → clamped to SCALE.Q
    // combined = SCALE.Q * 5000 / 10000 * 10000 / 10000 = 5000 = q(0.50)
    const scent = deriveScentDetection(obs, sub, 5 * SCALE.m);
    expect(scent).toBeGreaterThan(q(0.20));
  });

  it("very far range (500 m) → scent very weak or zero", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { olfactionSensitivity_Q: q(1.0) });
    const sub = mkEntity(2, 500 * SCALE.m, 0);
    const scent = deriveScentDetection(obs, sub, 500 * SCALE.m);
    // strength = 10000 * 50000 / 500000 = 1000 = q(0.10); windMul = q(0.50) → 500 → q(0.05)
    expect(scent).toBeLessThan(q(0.15));
  });

  it("downwind from subject → better detection than no wind", () => {
    // Observer is EAST of subject; wind blows EAST → scent carried TO observer
    const sub = mkEntity(2, 0, 0);
    const obs = withSenses(mkEntity(1, 20 * SCALE.m, 0), { olfactionSensitivity_Q: q(1.0) });
    const noWind = deriveScentDetection(obs, sub, 20 * SCALE.m);
    const downWind = deriveScentDetection(obs, sub, 20 * SCALE.m, WIND_EAST);
    expect(downWind).toBeGreaterThan(noWind);
  });

  it("upwind from subject → weaker detection than no wind", () => {
    // Observer is EAST of subject; wind blows WEST → scent blown AWAY from observer
    const sub = mkEntity(2, 0, 0);
    const obs = withSenses(mkEntity(1, 20 * SCALE.m, 0), { olfactionSensitivity_Q: q(1.0) });
    const noWind  = deriveScentDetection(obs, sub, 20 * SCALE.m);
    const upWind  = deriveScentDetection(obs, sub, 20 * SCALE.m, WIND_WEST);
    expect(upWind).toBeLessThan(noWind);
  });

  it("heavy rain → lower detection than no precipitation", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { olfactionSensitivity_Q: q(1.0) });
    const sub = mkEntity(2, 15 * SCALE.m, 0);
    const clear = deriveScentDetection(obs, sub, 15 * SCALE.m);
    const rain  = deriveScentDetection(obs, sub, 15 * SCALE.m, undefined, "heavy_rain");
    expect(rain).toBeLessThan(clear);
  });
});

// ── canDetectExtended ──────────────────────────────────────────────────────────

describe("canDetectExtended", () => {
  it("primary vision hit → returns q(1.0) without checking extended senses", () => {
    // Observer faces East (+x) by default; subject 5 m East → within vision arc and range
    const obs = mkEntity(1, 0, 0);
    const sub = mkEntity(2, 5 * SCALE.m, 0);
    const result = canDetectExtended(obs, sub, DEFAULT_SENSORY_ENV);
    expect(result).toBe(q(1.0));
  });

  it("no primary detection, no extended senses → q(0)", () => {
    // Move subject far away (vision range ~200m, target at 500m)
    const obs = mkEntity(1, 0, 0);
    const sub = mkEntity(2, 500 * SCALE.m, 0);
    const result = canDetectExtended(obs, sub, DEFAULT_SENSORY_ENV);
    expect(result).toBe(q(0));
  });

  it("primary misses, echolocation hits → DETECT_ECHOLOCATION", () => {
    const obs = withSenses(mkEntity(1, 0, 0), { echolocationRange_m: 300 * SCALE.m });
    const sub = mkEntity(2, 250 * SCALE.m, 0);
    // Vision range ~200m → sub at 250m misses vision but hits echolocation
    const result = canDetectExtended(obs, sub, DEFAULT_SENSORY_ENV);
    expect(result).toBe(DETECT_ECHOLOCATION);
  });

  it("primary misses, electroreception hits → DETECT_ELECTRORECEPTION", () => {
    const _obs = withSenses(mkEntity(1, 0, 0), { electroreceptionRange_m: 3 * SCALE.m });
    // Sub at 2m — outside hearing range (50m default) but very close, so vision checks…
    // Actually at 2m sub IS within hearing (50m range) and possibly vision.
    // Place sub FAR enough to miss vision/hearing, but give very large electroreception range.
    const subFar = mkEntity(2, 60 * SCALE.m, 0);  // outside hearing (50m) and vision arc possibly
    const obsElectro = withSenses(mkEntity(1, 0, 0), { electroreceptionRange_m: 100 * SCALE.m });
    // Create a dark env so vision fails, and sub at 60m may miss hearing (50m)
    const darkEnv = { lightMul: q(0), smokeMul: q(1.0), noiseMul: q(1.0) };
    const result = canDetectExtended(obsElectro, subFar, darkEnv);
    expect(result).toBe(DETECT_ELECTRORECEPTION);
  });

  it("primary misses, olfaction detects → returns q(0.20)–q(0.40)", () => {
    // Sub at 350m — beyond all primary senses; high olfaction + downwind
    const _sub = mkEntity(2, 350 * SCALE.m, 0);
    const _obs = withSenses(mkEntity(1, 0, 0), { olfactionSensitivity_Q: q(1.0) });
    const darkEnv = { lightMul: q(0), smokeMul: q(1.0), noiseMul: q(1.0) };
    // at 350m: strength = 10000 * 50000 / 350000 ≈ 1428 = q(0.14); windMul = q(0.5) no wind
    // combined ≈ 1428 * 5000 / 10000 = 714 — below threshold q(0.20) = 2000
    // Use downwind to boost:
    const windEast: WindField = { dx_m: SCALE.m, dy_m: 0, speed_mps: 3_000 };
    // At 350m downwind: windMul ≈ SCALE.Q; combined ≈ 1428 — still below threshold
    // Use closer range for olfaction test
    const subClose = mkEntity(2, 45 * SCALE.m, 0);
    const obsOlf = withSenses(mkEntity(1, 0, 0), { olfactionSensitivity_Q: q(1.0) });
    // 45m: strength = 10000 * 50000 / 45000 ≈ 11111 → clamped SCALE.Q; windMul = SCALE.Q (downwind)
    // combined = SCALE.Q * SCALE.Q / SCALE.Q * SCALE.Q / SCALE.Q = SCALE.Q → within q(0.20)–q(0.40)
    const resultWithOlf = canDetectExtended(obsOlf, subClose, darkEnv, undefined, windEast);
    expect(resultWithOlf).toBeGreaterThanOrEqual(q(0.20));
    expect(resultWithOlf).toBeLessThanOrEqual(q(0.40));
  });

  it("electroreception takes priority over echolocation (higher Q returned)", () => {
    // Both modalities present; electroreception at 5m, echolocation at 50m; target at 3m
    const _obs = withSenses(mkEntity(1, 0, 0), {
      electroreceptionRange_m: 5 * SCALE.m,
      echolocationRange_m:     50 * SCALE.m,
    });
    const _sub = mkEntity(2, 3 * SCALE.m, 0);
    const darkEnv = { lightMul: q(0), smokeMul: q(1.0), noiseMul: q(1.0) };
    // At 3m → outside hearing (50m? no, 3m << 50m... let's place farther)
    // Actually at 3m, hearing range is 50m → sub IS heard. Need to be outside hearing.
    const subFar = mkEntity(2, 60 * SCALE.m, 0);
    const obsWithBoth = withSenses(mkEntity(1, 0, 0), {
      electroreceptionRange_m: 100 * SCALE.m,  // reaches 60m sub
      echolocationRange_m:     200 * SCALE.m,
    });
    const result = canDetectExtended(obsWithBoth, subFar, darkEnv);
    // Electroreception (q(0.80)) > Echolocation (q(0.70))
    expect(result).toBe(DETECT_ELECTRORECEPTION);
  });

  it("dead target: electroreception fails but echolocation succeeds", () => {
    const sub = mkEntity(2, 60 * SCALE.m, 0);
    sub.injury.dead = true;
    const obs = withSenses(mkEntity(1, 0, 0), {
      electroreceptionRange_m: 100 * SCALE.m,
      echolocationRange_m:     200 * SCALE.m,
    });
    const darkEnv = { lightMul: q(0), smokeMul: q(1.0), noiseMul: q(1.0) };
    const result = canDetectExtended(obs, sub, darkEnv);
    // Dead → electroreception fails; echolocation detects physical mass → DETECT_ECHOLOCATION
    expect(result).toBe(DETECT_ECHOLOCATION);
  });

  it("downwind olfaction detects better than upwind", () => {
    // Sub at origin, obs 200m East (beyond vision 200m and hearing 50m in dark env).
    // WIND_EAST carries scent from sub eastward to obs → strong downwind detection.
    // WIND_WEST carries scent away from obs → zero detection (upwind).
    const sub = mkEntity(2, 0, 0);
    const obs = withSenses(mkEntity(1, 200 * SCALE.m, 0), { olfactionSensitivity_Q: q(1.0) });
    const darkEnv = { lightMul: q(0), smokeMul: q(1.0), noiseMul: q(1.0) };
    const downWind = canDetectExtended(obs, sub, darkEnv, undefined, WIND_EAST);
    const upWind   = canDetectExtended(obs, sub, darkEnv, undefined, WIND_WEST);
    expect(downWind).toBeGreaterThan(upWind);
  });
});
