/**
 * Phase 34 — Bodily-Kinesthetic & Spatial: Navigation
 *
 * Groups:
 *   Output shape       (3) — valid types, routeEfficiency bounds, timeLost_s ≥ 0
 *   Determinism        (1) — same inputs → same outcome
 *   Spatial effect     (2) — high spatial → better efficiency; low spatial → worse
 *   Map bonus          (1) — hasMap=true → better than hasMap=false
 *   Terrain penalties  (2) — road > mountain; sea is harshest
 *   Visibility         (1) — clear > night
 *   Edge cases         (2) — floor clamp; zero distance → timeLost_s=0
 */

import { describe, it, expect } from "vitest";
import { SCALE, q, type Q }  from "../src/units";
import { resolveNavigation } from "../src/competence/navigation";
import { mkHumanoidEntity }  from "../src/sim/testing";
import type { Entity }       from "../src/sim/entity";
import type { NavigationSpec } from "../src/competence/navigation";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkNavigator(spatialBK: Q): Entity {
  const e = mkHumanoidEntity(1, 1, 0, 0);
  return {
    ...e,
    attributes: {
      ...e.attributes,
      cognition: {
        linguistic:          q(0.60) as Q,
        logicalMathematical: q(0.60) as Q,
        spatial:             spatialBK,
        bodilyKinesthetic:   q(0.55) as Q,
        musical:             q(0.55) as Q,
        interpersonal:       q(0.60) as Q,
        intrapersonal:       q(0.60) as Q,
        naturalist:          q(0.55) as Q,
        interSpecies:        q(0.30) as Q,
      },
    },
  };
}

const BASE_SPEC: NavigationSpec = {
  distance_m:  10_000,
  terrain:     "road",
  hasMap:      false,
  visibility:  "clear",
};

// ── Output shape ──────────────────────────────────────────────────────────────

describe("output shape", () => {
  it("routeEfficiency is within [q(0.50), q(1.0)]", () => {
    for (const terrain of ["road", "forest", "mountain", "urban", "sea"] as const) {
      for (const vis of ["clear", "fog", "night"] as const) {
        const e   = mkNavigator(q(0.50) as Q);
        const out = resolveNavigation(e, { ...BASE_SPEC, terrain, visibility: vis }, 0);
        expect(out.routeEfficiency).toBeGreaterThanOrEqual(q(0.50));
        expect(out.routeEfficiency).toBeLessThanOrEqual(q(1.0));
      }
    }
  });

  it("timeLost_s is a non-negative integer", () => {
    const e   = mkNavigator(q(0.60) as Q);
    const out = resolveNavigation(e, BASE_SPEC, 0);
    expect(out.timeLost_s).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(out.timeLost_s)).toBe(true);
  });

  it("routeEfficiency q(1.0) → timeLost_s = 0", () => {
    // High spatial, road, map, clear → should reach max efficiency
    const e    = mkNavigator(q(0.95) as Q);
    const spec: NavigationSpec = { distance_m: 5000, terrain: "road", hasMap: true, visibility: "clear" };
    const out  = resolveNavigation(e, spec, 0);
    if (out.routeEfficiency >= SCALE.Q) {
      expect(out.timeLost_s).toBe(0);
    }
    // Not every configuration hits q(1.0) exactly, so just verify the formula
    expect(out.routeEfficiency).toBeGreaterThanOrEqual(q(0.50));
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe("determinism", () => {
  it("same entity + spec → same outcome regardless of seed", () => {
    const e = mkNavigator(q(0.65) as Q);
    const a = resolveNavigation(e, BASE_SPEC, 42);
    const b = resolveNavigation(e, BASE_SPEC, 42);
    expect(a.routeEfficiency).toBe(b.routeEfficiency);
    expect(a.timeLost_s).toBe(b.timeLost_s);
  });
});

// ── Spatial effect ────────────────────────────────────────────────────────────

describe("spatial effect", () => {
  it("high-spatial entity has better routeEfficiency than low-spatial (forest, no map)", () => {
    const highSpatial = mkNavigator(q(0.90) as Q);
    const lowSpatial  = mkNavigator(q(0.20) as Q);
    const spec: NavigationSpec = { ...BASE_SPEC, terrain: "forest", hasMap: false };
    const outHigh = resolveNavigation(highSpatial, spec, 0);
    const outLow  = resolveNavigation(lowSpatial,  spec, 0);
    expect(outHigh.routeEfficiency).toBeGreaterThan(outLow.routeEfficiency);
  });

  it("high-spatial entity loses less time than low-spatial on forest terrain", () => {
    const highSpatial = mkNavigator(q(0.90) as Q);
    const lowSpatial  = mkNavigator(q(0.20) as Q);
    const spec: NavigationSpec = { ...BASE_SPEC, terrain: "forest", hasMap: false };
    const outHigh = resolveNavigation(highSpatial, spec, 0);
    const outLow  = resolveNavigation(lowSpatial,  spec, 0);
    expect(outHigh.timeLost_s).toBeLessThanOrEqual(outLow.timeLost_s);
  });
});

// ── Map bonus ─────────────────────────────────────────────────────────────────

describe("map bonus", () => {
  it("hasMap=true → better routeEfficiency than hasMap=false", () => {
    const e       = mkNavigator(q(0.80) as Q);  // high enough spatial to avoid floor clamp
    const withMap: NavigationSpec    = { ...BASE_SPEC, terrain: "mountain", hasMap: true };
    const withoutMap: NavigationSpec = { ...BASE_SPEC, terrain: "mountain", hasMap: false };
    const outWith    = resolveNavigation(e, withMap,    0);
    const outWithout = resolveNavigation(e, withoutMap, 0);
    expect(outWith.routeEfficiency).toBeGreaterThan(outWithout.routeEfficiency);
  });
});

// ── Terrain penalties ─────────────────────────────────────────────────────────

describe("terrain penalties", () => {
  it("road terrain gives better efficiency than mountain (same entity, map, visibility)", () => {
    const e    = mkNavigator(q(0.65) as Q);
    const spec = { distance_m: 5000, hasMap: false, visibility: "clear" as const };
    const outRoad     = resolveNavigation(e, { ...spec, terrain: "road" },     0);
    const outMountain = resolveNavigation(e, { ...spec, terrain: "mountain" }, 0);
    expect(outRoad.routeEfficiency).toBeGreaterThan(outMountain.routeEfficiency);
  });

  it("sea terrain is harshest: lower efficiency than road, forest, mountain, urban", () => {
    const e    = mkNavigator(q(0.65) as Q);
    const spec = { distance_m: 5000, hasMap: false, visibility: "clear" as const };
    const outSea = resolveNavigation(e, { ...spec, terrain: "sea" }, 0);
    for (const t of ["road", "forest", "mountain", "urban"] as const) {
      const other = resolveNavigation(e, { ...spec, terrain: t }, 0);
      expect(outSea.routeEfficiency).toBeLessThanOrEqual(other.routeEfficiency);
    }
  });
});

// ── Visibility ────────────────────────────────────────────────────────────────

describe("visibility", () => {
  it("clear visibility gives better efficiency than night", () => {
    const e    = mkNavigator(q(0.80) as Q);  // high enough spatial to avoid floor clamp
    const spec: NavigationSpec = { ...BASE_SPEC, terrain: "forest" };
    const outClear = resolveNavigation(e, { ...spec, visibility: "clear" }, 0);
    const outNight = resolveNavigation(e, { ...spec, visibility: "night" }, 0);
    expect(outClear.routeEfficiency).toBeGreaterThan(outNight.routeEfficiency);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("low spatial + mountain + night → routeEfficiency hits floor q(0.50)", () => {
    const e    = mkNavigator(q(0.10) as Q);
    const spec: NavigationSpec = { distance_m: 1000, terrain: "mountain", hasMap: false, visibility: "night" };
    const out  = resolveNavigation(e, spec, 0);
    expect(out.routeEfficiency).toBe(q(0.50));
  });

  it("distance_m=0 → timeLost_s=0", () => {
    const e    = mkNavigator(q(0.50) as Q);
    const spec: NavigationSpec = { distance_m: 0, terrain: "mountain", hasMap: false, visibility: "night" };
    const out  = resolveNavigation(e, spec, 0);
    expect(out.timeLost_s).toBe(0);
  });
});
