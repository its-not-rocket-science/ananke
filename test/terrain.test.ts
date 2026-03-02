/**
 * Phase 6 — Terrain friction tests
 *
 * Unit tests for terrain.ts pure functions and kernel integration
 * verifying that surface type correctly modifies movement speed.
 */
import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units";
import type { Q } from "../src/units";
import {
  SURFACE_TRACTION,
  SURFACE_SPEED_MUL,
  terrainKey,
  parseTerrainKey,
  tractionAtPosition,
  speedMulAtPosition,
  buildTerrainGrid,
  type SurfaceType,
} from "../src/sim/terrain";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import type { CommandMap } from "../src/sim/commands";

const M = SCALE.m;

// ── terrainKey / parseTerrainKey ────────────────────────────────────────────

describe("terrainKey / parseTerrainKey", () => {
  it("encodes and decodes cell coordinates", () => {
    const key = terrainKey(3, 7);
    expect(key).toBe("3,7");
    const { cellX, cellY } = parseTerrainKey(key);
    expect(cellX).toBe(3);
    expect(cellY).toBe(7);
  });

  it("handles negative coordinates", () => {
    const key = terrainKey(-2, -5);
    const { cellX, cellY } = parseTerrainKey(key);
    expect(cellX).toBe(-2);
    expect(cellY).toBe(-5);
  });

  it("origin cell", () => {
    expect(terrainKey(0, 0)).toBe("0,0");
  });
});

// ── SURFACE_TRACTION values ──────────────────────────────────────────────────

describe("SURFACE_TRACTION", () => {
  it("normal ground is q(0.80)", () => {
    expect(SURFACE_TRACTION.normal).toBe(q(0.80));
  });

  it("ice has the lowest traction", () => {
    const all = Object.values(SURFACE_TRACTION) as Q[];
    expect(SURFACE_TRACTION.ice).toBe(Math.min(...all));
  });

  it("slope_down has higher traction than slope_up", () => {
    expect(SURFACE_TRACTION.slope_down).toBeGreaterThan(SURFACE_TRACTION.slope_up);
  });

  it("mud traction is between ice and normal", () => {
    expect(SURFACE_TRACTION.mud).toBeGreaterThan(SURFACE_TRACTION.ice);
    expect(SURFACE_TRACTION.mud).toBeLessThan(SURFACE_TRACTION.normal);
  });
});

// ── SURFACE_SPEED_MUL values ─────────────────────────────────────────────────

describe("SURFACE_SPEED_MUL", () => {
  it("normal ground has no penalty (q(1.0))", () => {
    expect(SURFACE_SPEED_MUL.normal).toBe(q(1.0));
  });

  it("mud is slower than normal", () => {
    expect(SURFACE_SPEED_MUL.mud).toBeLessThan(SURFACE_SPEED_MUL.normal);
  });

  it("ice is slower than normal", () => {
    expect(SURFACE_SPEED_MUL.ice).toBeLessThan(SURFACE_SPEED_MUL.normal);
  });

  it("ice is slower than mud (slipping prevents effective sprint)", () => {
    expect(SURFACE_SPEED_MUL.ice).toBeLessThan(SURFACE_SPEED_MUL.mud);
  });

  it("slope_down is faster than slope_up", () => {
    expect(SURFACE_SPEED_MUL.slope_down).toBeGreaterThan(SURFACE_SPEED_MUL.slope_up);
  });

  it("slope_up is slower than normal", () => {
    expect(SURFACE_SPEED_MUL.slope_up).toBeLessThan(SURFACE_SPEED_MUL.normal);
  });
});

// ── tractionAtPosition ───────────────────────────────────────────────────────

describe("tractionAtPosition", () => {
  const DEFAULT_TRACTION = q(0.80) as Q;
  const CELL_SIZE = Math.trunc(4 * M); // 4 m cells

  it("returns default when grid is undefined", () => {
    const t = tractionAtPosition(undefined, CELL_SIZE, 0, 0, DEFAULT_TRACTION);
    expect(t).toBe(DEFAULT_TRACTION);
  });

  it("returns default when grid is empty", () => {
    const grid = new Map<string, SurfaceType>();
    const t = tractionAtPosition(grid, CELL_SIZE, 0, 0, DEFAULT_TRACTION);
    expect(t).toBe(DEFAULT_TRACTION);
  });

  it("returns mud traction when position is in a mud cell", () => {
    // Position (1m, 1m) → cell (0,0) for 4m cells
    const grid = buildTerrainGrid({ "0,0": "mud" });
    const t = tractionAtPosition(grid, CELL_SIZE, Math.trunc(1 * M), Math.trunc(1 * M), DEFAULT_TRACTION);
    expect(t).toBe(SURFACE_TRACTION.mud);
  });

  it("returns ice traction for an ice cell", () => {
    // Position (5m, 0) → cell (1,0) for 4m cells
    const grid = buildTerrainGrid({ "1,0": "ice" });
    const t = tractionAtPosition(grid, CELL_SIZE, Math.trunc(5 * M), 0, DEFAULT_TRACTION);
    expect(t).toBe(SURFACE_TRACTION.ice);
  });

  it("returns default when position is outside any grid cell", () => {
    const grid = buildTerrainGrid({ "1,0": "mud" });
    // Position (0,0) → cell (0,0) not in grid
    const t = tractionAtPosition(grid, CELL_SIZE, 0, 0, DEFAULT_TRACTION);
    expect(t).toBe(DEFAULT_TRACTION);
  });

  it("handles all surface types", () => {
    const surfaces: SurfaceType[] = ["normal", "mud", "ice", "slope_up", "slope_down"];
    for (const surf of surfaces) {
      const grid = buildTerrainGrid({ "0,0": surf });
      const t = tractionAtPosition(grid, CELL_SIZE, 0, 0, DEFAULT_TRACTION);
      expect(t).toBe(SURFACE_TRACTION[surf]);
    }
  });

  it("correctly maps position to cell index", () => {
    const CELL = Math.trunc(4 * M); // 4m cells
    // pos (7.9m, 0) → cell (1, 0) since floor(7.9/4) = 1
    const grid = buildTerrainGrid({ "1,0": "slope_up" });
    const t = tractionAtPosition(grid, CELL, Math.trunc(Math.round(7.9 * M)), 0, DEFAULT_TRACTION);
    expect(t).toBe(SURFACE_TRACTION.slope_up);
  });
});

// ── speedMulAtPosition ───────────────────────────────────────────────────────

describe("speedMulAtPosition", () => {
  const CELL_SIZE = Math.trunc(4 * M);

  it("returns q(1.0) when grid is undefined", () => {
    expect(speedMulAtPosition(undefined, CELL_SIZE, 0, 0)).toBe(q(1.0));
  });

  it("returns q(1.0) when grid is empty", () => {
    const grid = new Map<string, SurfaceType>();
    expect(speedMulAtPosition(grid, CELL_SIZE, 0, 0)).toBe(q(1.0));
  });

  it("returns mud speed multiplier for mud cell", () => {
    const grid = buildTerrainGrid({ "0,0": "mud" });
    expect(speedMulAtPosition(grid, CELL_SIZE, 0, 0)).toBe(SURFACE_SPEED_MUL.mud);
  });

  it("returns ice speed multiplier for ice cell", () => {
    const grid = buildTerrainGrid({ "1,0": "ice" });
    expect(speedMulAtPosition(grid, CELL_SIZE, Math.trunc(5 * M), 0)).toBe(SURFACE_SPEED_MUL.ice);
  });

  it("returns no-penalty for cells not in grid", () => {
    const grid = buildTerrainGrid({ "1,0": "mud" });
    expect(speedMulAtPosition(grid, CELL_SIZE, 0, 0)).toBe(q(1.0));
  });
});

// ── buildTerrainGrid ─────────────────────────────────────────────────────────

describe("buildTerrainGrid", () => {
  it("builds a map from record", () => {
    const grid = buildTerrainGrid({ "0,0": "mud", "1,2": "ice" });
    expect(grid.size).toBe(2);
    expect(grid.get("0,0")).toBe("mud");
    expect(grid.get("1,2")).toBe("ice");
  });

  it("empty record produces empty map", () => {
    const grid = buildTerrainGrid({});
    expect(grid.size).toBe(0);
  });
});

// ── Kernel integration with terrainGrid ──────────────────────────────────────

describe("kernel stepWorld with terrainGrid", () => {
  const CELL_SIZE = Math.trunc(4 * M);

  function runSteps(surface: SurfaceType | "none", steps = 5): number {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);

    const grid = surface === "none" ? undefined : buildTerrainGrid({ "0,0": surface });

    const cmds: CommandMap = new Map([
      [1, [{ kind: "move", dir: { x: SCALE.Q, y: 0, z: 0 }, intensity: q(1.0) as Q, mode: "sprint" as const }]],
    ]);

    for (let i = 0; i < steps; i++) {
      const context = {
        tractionCoeff: q(0.80) as Q,
        cellSize_m: CELL_SIZE,
        ...(grid && { terrainGrid: grid }),
      };
      stepWorld(world, cmds, context);
    }

    return Math.abs(world.entities[0]!.velocity_mps.x);
  }

  it("entity in mud is slower than on normal ground", () => {
    const speedNormal = runSteps("normal");
    const speedMud    = runSteps("mud");
    expect(speedMud).toBeLessThan(speedNormal);
  });

  it("entity on ice is slower than in mud (ice prevents effective sprinting)", () => {
    const speedMud = runSteps("mud");
    const speedIce = runSteps("ice");
    // ice_speed_mul (0.45) < mud_speed_mul (0.60) → ice entity moves slower
    expect(speedIce).toBeLessThan(speedMud);
  });

  it("entity on slope_down is faster than on slope_up", () => {
    const speedUp   = runSteps("slope_up");
    const speedDown = runSteps("slope_down");
    expect(speedDown).toBeGreaterThan(speedUp);
  });

  it("no terrainGrid falls back to ctx.tractionCoeff (no extra penalty)", () => {
    const speedGrid   = runSteps("normal"); // explicit normal grid
    const speedNoGrid = runSteps("none");   // no grid (uses ctx.tractionCoeff directly)
    // Both should produce identical results since normal = q(1.0) speed mul
    expect(speedNoGrid).toBe(speedGrid);
  });

  it("entity outside mud cell moves at normal speed", () => {
    // Entity at (10m, 0) → cell (2, 0); only cell (0,0) is mud
    const eNormal = mkHumanoidEntity(1, 1, Math.trunc(10 * M), 0);
    const eMud    = mkHumanoidEntity(2, 1, 0, 0);

    const world = mkWorld(1, [eNormal, eMud]);
    const grid = buildTerrainGrid({ "0,0": "mud" }); // only cell (0,0) is mud

    const cmds: CommandMap = new Map([
      [1, [{ kind: "move", dir: { x: SCALE.Q, y: 0, z: 0 }, intensity: q(1.0) as Q, mode: "sprint" as const }]],
      [2, [{ kind: "move", dir: { x: SCALE.Q, y: 0, z: 0 }, intensity: q(1.0) as Q, mode: "sprint" as const }]],
    ]);

    const context = {
      tractionCoeff: q(0.80) as Q,
      cellSize_m: CELL_SIZE,
      ...(grid && { terrainGrid: grid }),
    };
    stepWorld(world, cmds, context);

    const vNormal = Math.abs(world.entities[0]!.velocity_mps.x);
    const vMud    = Math.abs(world.entities[1]!.velocity_mps.x);

    // Entity on normal terrain should be faster than entity in mud
    expect(vNormal).toBeGreaterThan(vMud);
  });

  it("terrain affects velocity consistently across multiple ticks (large mud area)", () => {
    // Use a large mud area (cells 0..9 along x) so entity stays in mud for all 20 ticks
    function runLargeArea(surface: SurfaceType | "none", steps: number): number {
      const e = mkHumanoidEntity(1, 1, 0, 0);
      const world = mkWorld(1, [e]);

      let grid: ReturnType<typeof buildTerrainGrid> | undefined;
      if (surface !== "none") {
        // Fill a 10×10 cell area with the surface type
        const cells: Record<string, SurfaceType> = {};
        for (let cx = 0; cx < 10; cx++) {
          for (let cy = 0; cy < 3; cy++) {
            cells[`${cx},${cy}`] = surface;
          }
        }
        grid = buildTerrainGrid(cells);
      }

      const cmds: CommandMap = new Map([
        [1, [{ kind: "move", dir: { x: SCALE.Q, y: 0, z: 0 }, intensity: q(1.0) as Q, mode: "sprint" as const }]],
      ]);

      for (let i = 0; i < steps; i++) {
        stepWorld(world, cmds, {
          tractionCoeff: q(0.80) as Q,
          cellSize_m: CELL_SIZE,
          ...(grid && { terrainGrid: grid }),
        });
      }

      return Math.abs(world.entities[0]!.velocity_mps.x);
    }

    const speed20Normal = runLargeArea("normal", 20);
    const speed20Mud    = runLargeArea("mud", 20);

    // Mud entity stays in mud throughout → consistently lower speed
    expect(speed20Mud).toBeLessThan(speed20Normal);
  });
});
