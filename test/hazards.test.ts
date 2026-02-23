// test/hazards.test.ts — Phase 6: dynamic terrain hazard tests
import { describe, it, expect } from "vitest";
import { q, SCALE, to } from "../src/units";
import { buildHazardGrid, type HazardCell } from "../src/sim/terrain";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";

const CELL = Math.trunc(4 * SCALE.m);

function baseCtx(extra: Record<string, any> = {}) {
  return { tractionCoeff: q(0.80), cellSize_m: CELL, ...extra };
}

// ========================
// UNIT TESTS
// ========================

describe("buildHazardGrid", () => {
  it("creates correct entries from record", () => {
    const cell: HazardCell = { type: "fire", intensity: q(0.5), duration_ticks: 10 };
    const grid = buildHazardGrid({ "0,0": cell });
    expect(grid.get("0,0")).toEqual(cell);
    expect(grid.size).toBe(1);
  });

  it("creates multiple entries", () => {
    const grid = buildHazardGrid({
      "0,0": { type: "fire", intensity: q(0.5), duration_ticks: 5 },
      "1,0": { type: "radiation", intensity: q(0.3), duration_ticks: 0 },
    });
    expect(grid.size).toBe(2);
    expect(grid.get("1,0")?.type).toBe("radiation");
  });
});

// ========================
// INTEGRATION TESTS
// ========================

describe("hazard — fire", () => {
  it("fire increases torso surfaceDamage and shock after 1 tick", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0); // in cell (0,0)
    const world = mkWorld(1, [e]);
    const hazardGrid = buildHazardGrid({
      "0,0": { type: "fire", intensity: q(1.0), duration_ticks: 0 },
    });

    const shockBefore = e.injury.shock;
    const surfBefore = e.injury.byRegion["torso"]!.surfaceDamage;

    stepWorld(world, new Map(), baseCtx({ hazardGrid }));

    expect(world.entities[0]!.injury.shock).toBeGreaterThan(shockBefore);
    expect(world.entities[0]!.injury.byRegion["torso"]!.surfaceDamage).toBeGreaterThan(surfBefore);
  });
});

describe("hazard — radiation", () => {
  it("radiation increases torso internalDamage after 1 tick", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    const hazardGrid = buildHazardGrid({
      "0,0": { type: "radiation", intensity: q(1.0), duration_ticks: 0 },
    });

    const intBefore = e.injury.byRegion["torso"]!.internalDamage;

    stepWorld(world, new Map(), baseCtx({ hazardGrid }));

    expect(world.entities[0]!.injury.byRegion["torso"]!.internalDamage).toBeGreaterThan(intBefore);
  });
});

describe("hazard — poison_gas", () => {
  it("poison_gas increases torso internalDamage and reduces consciousness after 1 tick", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    const hazardGrid = buildHazardGrid({
      "0,0": { type: "poison_gas", intensity: q(1.0), duration_ticks: 0 },
    });

    const concBefore = e.injury.consciousness;
    const intBefore = e.injury.byRegion["torso"]!.internalDamage;

    stepWorld(world, new Map(), baseCtx({ hazardGrid }));

    expect(world.entities[0]!.injury.consciousness).toBeLessThan(concBefore);
    expect(world.entities[0]!.injury.byRegion["torso"]!.internalDamage).toBeGreaterThan(intBefore);
  });
});

describe("hazard — duration", () => {
  it("duration_ticks > 0 decrements each tick and removes cell when 0", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    const hazardGrid = buildHazardGrid({
      "0,0": { type: "fire", intensity: q(1.0), duration_ticks: 2 },
    });

    expect(hazardGrid.size).toBe(1);
    stepWorld(world, new Map(), baseCtx({ hazardGrid }));
    // After 1 tick: duration_ticks should be 1
    expect(hazardGrid.get("0,0")?.duration_ticks).toBe(1);

    stepWorld(world, new Map(), baseCtx({ hazardGrid }));
    // After 2 ticks: cell removed
    expect(hazardGrid.has("0,0")).toBe(false);
    expect(hazardGrid.size).toBe(0);
  });

  it("permanent hazard (duration_ticks = 0) persists after multiple ticks", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    const hazardGrid = buildHazardGrid({
      "0,0": { type: "radiation", intensity: q(0.5), duration_ticks: 0 },
    });

    for (let i = 0; i < 5; i++) {
      stepWorld(world, new Map(), baseCtx({ hazardGrid }));
    }
    // Cell still present
    expect(hazardGrid.has("0,0")).toBe(true);
  });
});

describe("hazard — edge cases", () => {
  it("entity outside hazard cell is unaffected", () => {
    // Entity at x=0m (cell 0,0); hazard at cell (1,0)
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    const hazardGrid = buildHazardGrid({
      "1,0": { type: "fire", intensity: q(1.0), duration_ticks: 0 },
    });

    const shockBefore = e.injury.shock;
    stepWorld(world, new Map(), baseCtx({ hazardGrid }));
    expect(world.entities[0]!.injury.shock).toBe(shockBefore);
  });

  it("intensity q(0) hazard has no effect", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    const hazardGrid = buildHazardGrid({
      "0,0": { type: "fire", intensity: q(0), duration_ticks: 0 },
    });

    const shockBefore = e.injury.shock;
    const surfBefore = e.injury.byRegion["torso"]!.surfaceDamage;
    stepWorld(world, new Map(), baseCtx({ hazardGrid }));
    // qMul(q(0), anything) = 0, so no change
    expect(world.entities[0]!.injury.shock).toBe(shockBefore);
    expect(world.entities[0]!.injury.byRegion["torso"]!.surfaceDamage).toBe(surfBefore);
  });
});
