// test/slope.test.ts — Phase 6: slope direction tests
import { describe, it, expect } from "vitest";
import { q, SCALE, to } from "../src/units";
import {
  slopeAtPosition,
  buildSlopeGrid,
  type SlopeInfo,
} from "../src/sim/terrain";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";

const CELL = Math.trunc(4 * SCALE.m); // 4 m cell size

function baseCtx(extra: Record<string, any> = {}) {
  return { tractionCoeff: q(0.80), cellSize_m: CELL, ...extra };
}

// ========================
// UNIT TESTS — pure funcs
// ========================

describe("slopeAtPosition", () => {
  it("returns undefined for undefined grid", () => {
    expect(slopeAtPosition(undefined, CELL, to.m(5), 0)).toBeUndefined();
  });

  it("returns undefined for empty grid", () => {
    const grid = buildSlopeGrid({});
    expect(slopeAtPosition(grid, CELL, to.m(5), 0)).toBeUndefined();
  });

  it("returns undefined for unknown cell", () => {
    const grid = buildSlopeGrid({ "99,99": { type: "uphill", grade: q(0.5) } });
    expect(slopeAtPosition(grid, CELL, to.m(1), 0)).toBeUndefined();
  });

  it("returns slope info for matching cell", () => {
    const info: SlopeInfo = { type: "uphill", grade: q(0.5) };
    const grid = buildSlopeGrid({ "1,0": info });
    // x=5m → cell cx=1 at cellSize=4m
    const result = slopeAtPosition(grid, CELL, to.m(5), 0);
    expect(result).toEqual(info);
  });

  it("buildSlopeGrid round-trips correctly", () => {
    const uphill: SlopeInfo = { type: "uphill", grade: q(0.80) };
    const downhill: SlopeInfo = { type: "downhill", grade: q(0.30) };
    const grid = buildSlopeGrid({ "0,0": uphill, "1,0": downhill });
    expect(slopeAtPosition(grid, CELL, to.m(1), 0)).toEqual(uphill);
    expect(slopeAtPosition(grid, CELL, to.m(5), 0)).toEqual(downhill);
  });
});

// ========================
// INTEGRATION TESTS
// ========================

describe("slope — movement speed", () => {
  /**
   * Run an entity sprinting in +x for `ticks` ticks and return steady-state x-velocity.
   * Tiles the slope across 30 cells (0-120 m) so the entity is always on sloped terrain.
   */
  function steadyStateSpeedX(slopeInfo?: SlopeInfo, ticks = 60): number {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    const moveCmd = [{ kind: "move", dir: { x: SCALE.Q, y: 0, z: 0 }, intensity: q(1.0), mode: "sprint" }];
    // Cover 30 cells (cx 0..29 = 0..120 m) so entity stays on slope throughout
    const slopeGrid = slopeInfo
      ? buildSlopeGrid(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`${i},0`, slopeInfo])))
      : undefined;
    for (let i = 0; i < ticks; i++) {
      stepWorld(world, new Map([[1, moveCmd]]), baseCtx(slopeGrid ? { slopeGrid } : {}));
    }
    return world.entities[0]!.velocity_mps.x;
  }

  it("uphill grade q(0.5): steady-state speed is lower than flat ground", () => {
    // grade=q(0.5); uphill mul = clamp(q(1.0) - qMul(q(0.5),q(0.25)), q(0.50), q(0.95))
    // qMul(5000, 2500) = trunc(5000*2500/10000) = 1250
    // slopeMul = clamp(10000-1250, 5000, 9500) = 8750 → 87.5% of base speed
    const flatSpeed = steadyStateSpeedX();
    const uphillSpeed = steadyStateSpeedX({ type: "uphill", grade: q(0.5) });
    expect(uphillSpeed).toBeLessThan(flatSpeed);
  });

  it("downhill grade q(0.5): steady-state speed is higher than flat ground", () => {
    // grade=q(0.5); downhill mul = clamp(q(1.0) + qMul(q(0.5),q(0.10)), q(1.0), q(1.20))
    // qMul(5000, 1000) = 500 → slopeMul = clamp(10500, 10000, 12000) = 10500 → 105% of base speed
    const flatSpeed = steadyStateSpeedX();
    const downhillSpeed = steadyStateSpeedX({ type: "downhill", grade: q(0.5) });
    expect(downhillSpeed).toBeGreaterThan(flatSpeed);
  });

  it("downhill grade q(1.0): speed is higher than grade q(0.5)", () => {
    // grade=q(1.0): mul = clamp(q(1.0)+qMul(q(1.0),q(0.10)), q(1.0), q(1.20)) = 11000 → 110%
    // grade=q(0.5): mul = 10500 → 105%
    const speed05 = steadyStateSpeedX({ type: "downhill", grade: q(0.5) });
    const speed10 = steadyStateSpeedX({ type: "downhill", grade: q(1.0) });
    expect(speed10).toBeGreaterThan(speed05);
  });

  it("uphill grade q(0.0): speed equals upper bound q(0.95) of uphill range", () => {
    // grade=q(0): slopeMul = clampQ(q(1.0) - 0, q(0.50), q(0.95)) = q(0.95)
    // Even zero grade uphill is slightly slower than flat (95% speed) due to posture cost.
    // Grade=0 should be faster than grade=0.5 (87.5%) and slower than flat (100%).
    const flatSpeed = steadyStateSpeedX();
    const grade0Speed = steadyStateSpeedX({ type: "uphill", grade: q(0) });
    const grade5Speed = steadyStateSpeedX({ type: "uphill", grade: q(0.5) });
    expect(grade0Speed).toBeLessThan(flatSpeed);    // q(0.95) < q(1.0)
    expect(grade0Speed).toBeGreaterThan(grade5Speed); // q(0.95) > q(0.875)
  });

  it("uphill grade q(4.0): speed is lower than grade q(1.0)", () => {
    // grade=q(1.0): mul = clamp(10000-2500, 5000, 9500) = 7500 → 75%
    // grade=q(4.0): mul = clamp(10000-10000, 5000, 9500) = 5000 → 50% (clamped at minimum)
    const speed10 = steadyStateSpeedX({ type: "uphill", grade: q(1.0) });
    const speed40 = steadyStateSpeedX({ type: "uphill", grade: q(4.0) });
    expect(speed40).toBeLessThan(speed10); // 50% < 75%
  });
});
