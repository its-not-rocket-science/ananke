import type { ImpactEvent } from "./events.js";
import type { WorldIndex } from "./indexing.js";
import type { Entity } from "./entity.js";
import type { ObstacleGrid } from "./terrain.js";
import { SCALE } from "../units.js";
import { coverFractionAtPosition } from "./terrain.js";

export interface FrontageRules {
  maxEngagersPerTarget: number;
}

export function applyFrontageCap(
  impacts: ImpactEvent[],
  index: WorldIndex,
  rules: FrontageRules
): ImpactEvent[] {
  const maxK = Math.max(1, rules.maxEngagersPerTarget);

  // group by targetId
  const byTarget = new Map<number, ImpactEvent[]>();
  for (const ev of impacts) {
    let arr = byTarget.get(ev.targetId);
    if (!arr) { arr = []; byTarget.set(ev.targetId, arr); }
    arr.push(ev);
  }

  const kept: ImpactEvent[] = [];

  for (const [targetId, arr] of byTarget.entries()) {
    if (arr.length <= maxK) {
      for (const ev of arr) kept.push(ev);
      continue;
    }

    const target = index.byId.get(targetId);
    if (!target) continue;

    // sort attackers by distance² then attackerId
    arr.sort((a, b) => {
      const da = dist2ByIds(index, a.attackerId, target);
      const db = dist2ByIds(index, b.attackerId, target);
      if (da < db) return -1;
      if (da > db) return 1;
      return a.attackerId - b.attackerId;
    });

    for (let i = 0; i < maxK; i++) kept.push(arr[i]!);
  }

  return kept;
}

/**
 * Phase 32E: Compute the passable frontage width (in entity-widths) through a
 * corridor at `position_m` perpendicular to `facingDir`.
 *
 * Scans cells across the perpendicular axis within `scanRange_m` and counts
 * cells where cover < SCALE.Q (not fully impassable). Returns the count as a
 * rough maximum engager cap. Falls back to `defaultCap` when no grid is provided.
 *
 * @param obstacleGrid   Obstacle grid (may be undefined)
 * @param cellSize_m     Grid cell size in SCALE.m units
 * @param position_m     Centre of the corridor query
 * @param facingDir      Unit direction of movement (used to determine perpendicular)
 * @param scanRange_m    How far left/right to scan (SCALE.m)
 * @param entityWidth_m  Average entity body width (SCALE.m; default 0.5 m)
 * @param defaultCap     Cap to return when obstacleGrid is undefined
 */
export function computeChokeCapacity(
  obstacleGrid:  ObstacleGrid | undefined,
  cellSize_m:    number,
  position_m:    { x: number; y: number },
  facingDir:     { x: number; y: number },
  scanRange_m:   number,
  entityWidth_m: number = Math.trunc(0.5 * SCALE.m),
  defaultCap:    number = 100,
): number {
  if (!obstacleGrid) return defaultCap;
  if (cellSize_m <= 0 || entityWidth_m <= 0) return defaultCap;

  // Perpendicular to facing (rotate 90°)
  const perpX = -facingDir.y;
  const perpY =  facingDir.x;

  let passableCells = 0;
  const steps = Math.max(1, Math.round(scanRange_m / cellSize_m));

  for (let i = -steps; i <= steps; i++) {
    const cx = position_m.x + Math.trunc(perpX * i * cellSize_m);
    const cy = position_m.y + Math.trunc(perpY * i * cellSize_m);
    const cov = coverFractionAtPosition(obstacleGrid, cellSize_m, cx, cy);
    if (cov < SCALE.Q) passableCells++;
  }

  const passableWidth = passableCells * cellSize_m;
  return Math.max(1, Math.floor(passableWidth / entityWidth_m));
}

function dist2ByIds(index: WorldIndex, attackerId: number, target: Entity): bigint {
  const a = index.byId.get(attackerId);
  if (!a) return (1n << 62n); // big + safe, avoids magic decimal
  const dx = target.position_m.x - a.position_m.x;
  const dy = target.position_m.y - a.position_m.y;
  const dz = target.position_m.z - a.position_m.z;
  return BigInt(dx) * BigInt(dx) + BigInt(dy) * BigInt(dy) + BigInt(dz) * BigInt(dz);
}