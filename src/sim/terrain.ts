// src/sim/terrain.ts — Phase 6: terrain friction and surface types
import { SCALE, q, type Q, type I32 } from "../units.js";

/**
 * Physical surface classification. Determines traction available to entities.
 */
export type SurfaceType = "normal" | "mud" | "ice" | "slope_up" | "slope_down";

/**
 * Traction coefficient (Q) per surface type.
 *
 * Normal ground ≈ 0.80 (existing KernelContext default).
 * Mud roughly halves usable force; ice allows only ~0.25×.
 */
export const SURFACE_TRACTION: Record<SurfaceType, Q> = {
  normal:     q(0.80) as Q,
  mud:        q(0.40) as Q,  // wet/muddy: ~50 % of normal traction
  ice:        q(0.20) as Q,  // icy: ~25 % of normal traction
  slope_up:   q(0.65) as Q,  // uphill: harder push-off, reduced effective force
  slope_down: q(0.90) as Q,  // downhill: slightly aided but less controlled
};

/**
 * Terrain speed multiplier (Q) per surface type.
 *
 * Applied directly to maxSprintSpeed to capture effects that traction alone
 * does not model (viscous drag in mud, slip uncertainty on ice, grade resistance).
 *
 * Normal = q(1.0) (no penalty).
 */
export const SURFACE_SPEED_MUL: Record<SurfaceType, Q> = {
  normal:     q(1.00) as Q,
  mud:        q(0.60) as Q,  // mud saps sprint speed: ~60 % of open-ground speed
  ice:        q(0.45) as Q,  // ice: very hard to sprint without slipping (~45 %)
  slope_up:   q(0.75) as Q,  // uphill grade: ~75 %
  slope_down: q(1.10) as Q,  // downhill assist: ~10 % bonus (capped in use)
};

/**
 * Sparse terrain grid. Keys are cell-index strings "cx,cy".
 * Cells absent from the map use whatever default the caller provides (usually "normal").
 */
export type TerrainGrid = Map<string, SurfaceType>;

/**
 * Encode integer cell coordinates as a lookup key.
 */
export function terrainKey(cellX: number, cellY: number): string {
  return `${cellX},${cellY}`;
}

/**
 * Decode a terrain key back into cell coordinates.
 */
export function parseTerrainKey(key: string): { cellX: number; cellY: number } {
  const [cx, cy] = key.split(",").map(Number);
  return { cellX: cx!, cellY: cy! };
}

/**
 * Look up the surface type at a given world position, or return undefined if
 * the position has no terrain entry.
 */
function surfaceAtPosition(
  grid: TerrainGrid | undefined,
  cellSize_m: I32,
  pos_x: I32,
  pos_y: I32,
): SurfaceType | undefined {
  if (!grid || grid.size === 0) return undefined;
  const cs = Math.max(1, cellSize_m);
  const cx = Math.trunc(pos_x / cs);
  const cy = Math.trunc(pos_y / cs);
  return grid.get(terrainKey(cx, cy));
}

/**
 * Look up the traction coefficient at a given world position.
 *
 * @param grid        Terrain grid (may be undefined or empty)
 * @param cellSize_m  Cell size in SCALE.m units (e.g. 4*SCALE.m for 4 m cells)
 * @param pos_x       Entity x position in SCALE.m units
 * @param pos_y       Entity y position in SCALE.m units
 * @param defaultTraction  Fallback traction when no grid cell is found
 * @returns Traction coefficient Q
 */
export function tractionAtPosition(
  grid: TerrainGrid | undefined,
  cellSize_m: I32,
  pos_x: I32,
  pos_y: I32,
  defaultTraction: Q,
): Q {
  const surf = surfaceAtPosition(grid, cellSize_m, pos_x, pos_y);
  return surf !== undefined ? SURFACE_TRACTION[surf] : defaultTraction;
}

/**
 * Look up the speed multiplier at a given world position.
 *
 * Returns q(1.0) when the position has no terrain entry (no penalty).
 */
export function speedMulAtPosition(
  grid: TerrainGrid | undefined,
  cellSize_m: I32,
  pos_x: I32,
  pos_y: I32,
): Q {
  const surf = surfaceAtPosition(grid, cellSize_m, pos_x, pos_y);
  return surf !== undefined ? SURFACE_SPEED_MUL[surf] : (SCALE.Q as Q);
}

/**
 * Convenience: build a TerrainGrid from a flat record of "cx,cy" → SurfaceType.
 */
export function buildTerrainGrid(cells: Record<string, SurfaceType>): TerrainGrid {
  return new Map(Object.entries(cells));
}
