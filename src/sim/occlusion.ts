import type { Entity } from "./entity";
import type { WorldIndex } from "./indexing";
import type { SpatialIndex } from "./spatial";
import { queryNearbyIds } from "./spatial";
import { SCALE } from "../units";
import { isEnemy } from "./team";

export interface OcclusionQuery {
  laneRadius_m: number;   // fixed-point metres (corridor half-width)
}

export function isMeleeLaneOccludedByFriendly(
  attacker: Entity,
  target: Entity,
  index: WorldIndex,
  spatial: SpatialIndex,
  q: OcclusionQuery
): boolean {
  // Only matters if same team as attacker (friendly body blocking)
  const laneR = q.laneRadius_m;

  const ax = attacker.position_m.x, ay = attacker.position_m.y, az = attacker.position_m.z;
  const tx = target.position_m.x, ty = target.position_m.y, tz = target.position_m.z;

  const dx = tx - ax, dy = ty - ay, dz = tz - az;

  // If target is on same team, don't treat as occlusion here (that’s friendly fire prevention elsewhere)
  // Occlusion checks FRIENDLIES between attacker and ENEMY target
  if (!isEnemy(attacker, target)) return false;

  // Search near the midpoint with radius ~= half-distance + laneR
  // This bounds the search to local neighbourhood (fast at scale)
  const mx = ax + (dx >> 1);
  const my = ay + (dy >> 1);
  const mz = az + (dz >> 1);

  // radius = half distance + lane radius
  // sqrt not needed: use conservative bound in fixed-point
  const halfDist = approxHalfDist(ax, ay, tx, ty); // metres scaled
  const searchR = halfDist + laneR;

  const ids = queryNearbyIds(spatial, { x: mx, y: my, z: mz }, searchR);

  // Check for any friendly that lies between attacker and target AND within lane radius of the segment
  for (const id of ids) {
    if (id === attacker.id || id === target.id) continue;
    const e = index.byId.get(id);
    if (!e || e.injury.dead) continue;
    if (e.teamId !== attacker.teamId) continue; // only friendlies block

    // must be between along the segment (0 < t < 1) and close to it
    if (pointNearSegmentQ(e.position_m.x, e.position_m.y, ax, ay, tx, ty, laneR)) {
      return true;
    }
  }

  return false;
}

function approxHalfDist(ax: number, ay: number, tx: number, ty: number): number {
  const dx = tx - ax;
  const dy = ty - ay;
  const adx = dx < 0 ? -dx : dx;
  const ady = dy < 0 ? -dy : dy;

  // Cheap L∞/L1 mix; we just need a conservative search radius
  const approx = adx > ady ? adx + (ady >> 1) : ady + (adx >> 1);
  return approx >> 1;
}

/**
 * Returns true if point P is within laneR of segment A->B in 2D, and lies between A and B.
 * Uses only integer math (deterministic).
 */
function pointNearSegmentQ(px: number, py: number, ax: number, ay: number, bx: number, by: number, laneR: number): boolean {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;

  const vv = BigInt(vx) * BigInt(vx) + BigInt(vy) * BigInt(vy);
  if (vv === 0n) return false;

  const tNum = BigInt(wx) * BigInt(vx) + BigInt(wy) * BigInt(vy);
  if (tNum <= 0n || tNum >= vv) return false; // strictly between

  // distance^2 to line = |w|^2 - (w·v)^2 / |v|^2
  const ww = BigInt(wx) * BigInt(wx) + BigInt(wy) * BigInt(wy);
  const proj2 = (tNum * tNum) / vv;
  const dist2 = ww - proj2;

  const lane2 = BigInt(laneR) * BigInt(laneR);
  return dist2 <= lane2;
}