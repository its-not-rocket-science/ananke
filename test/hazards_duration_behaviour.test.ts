import { describe, it, expect } from "vitest";

import type { HazardCell, HazardGrid } from "../src/sim/terrain.js";

import { mkHumanoidEntity } from "../src/sim/testing.js";
import { terrainKey } from "../src/sim/terrain.js";
import { to } from "../src/units.js";
import { q } from "../src/units.js";

// Adjust this import to wherever stepHazardEffects lives in your refactor.
// From your snippet it looks like step/effects.ts exports it.
import { stepHazardEffects } from "../src/sim/step/effects.js";

function mkFireHazard(duration_ticks: number): HazardCell {
  // Minimal viable HazardCell for applyHazardDamage + duration ticking.
  // We cast to HazardCell to avoid chasing every field in tests.
  return {
    intensity: 1,
    duration_ticks,
    // The rest of the fields only matter if applyHazardDamage reads them.
    // If your HazardCell uses other names, keep them here or extend as needed.
    fireQ: q(1),
    corrosiveQ: q(0),
    electricQ: q(0),
    radiationQ: q(0),
  } as unknown as HazardCell;
}

describe("hazard duration ticking (once per cell per tick)", () => {
  it("ticks duration once per tick even if 2 entities share the cell", () => {
    const cellSize_m = to.m(1);

    const e1 = mkHumanoidEntity(1, 1, 0, 0); // e1 in cell (0,0)
    const e2 = mkHumanoidEntity(2, 1, 0, 0); // e2 in cell (0,0)
    // Put both entities in cell (0,0)
    e1.position_m.x = 0;
    e1.position_m.y = 0;
    e2.position_m.x = 0;
    e2.position_m.y = 0;

    const grid = new Map<string, HazardCell>() as unknown as HazardGrid;
    const key = terrainKey(0, 0);
    grid.set(key, mkFireHazard(2));

    stepHazardEffects([e1, e2], grid, cellSize_m);

    const hazard = (grid as unknown as Map<string, HazardCell>).get(key);
    expect(hazard).toBeTruthy();
    expect(hazard!.duration_ticks).toBe(1);
  });

  it("does not burn down faster with 10 entities in the same cell", () => {
    const cellSize_m = to.m(1);

    const entities = Array.from({ length: 10 }, (_, i) =>
      mkHumanoidEntity(100 + i, 1, 0, 0),
    );

    for (const e of entities) {
      e.position_m.x = 0;
      e.position_m.y = 0;
    }

    const grid = new Map<string, HazardCell>() as unknown as HazardGrid;
    const key = terrainKey(0, 0);
    grid.set(key, mkFireHazard(3));

    const gridMap = grid as unknown as Map<string, HazardCell>;

    // Tick 1: 3 -> 2
    stepHazardEffects(entities, grid, cellSize_m);
    expect(gridMap.has(key)).toBe(true);
    expect(gridMap.get(key)!.duration_ticks).toBe(2);

    // Tick 2: 2 -> 1
    stepHazardEffects(entities, grid, cellSize_m);
    expect(gridMap.has(key)).toBe(true);
    expect(gridMap.get(key)!.duration_ticks).toBe(1);

    // Tick 3: 1 -> 0, removed
    stepHazardEffects(entities, grid, cellSize_m);
    expect(gridMap.has(key)).toBe(false);
  });
});