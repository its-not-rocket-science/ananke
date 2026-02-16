import type { Entity } from "./entity";
import type { WorldIndex } from "./indexing";
import type { SpatialIndex } from "./spatial";
import { queryNearbyIds } from "./spatial";
import { isEnemy } from "./team";
import { dotDirQ, normaliseDirCheapQ } from "./vec3"; // wherever you keep these
import { SCALE } from "../units";

export interface EngagementQuery {
  reach_m: number;          // fixed-point metres
  buffer_m: number;         // fixed-point metres
  maxTargets: number;       // cap for scalability
  requireFrontArc?: boolean;
  minDotQ?: number;         // 0..Q (e.g. q(0.0) for 180°, q(0.3) narrower)
}

export function pickNearestEnemyInReach(
  attacker: Entity,
  index: WorldIndex,
  spatial: SpatialIndex,
  q: EngagementQuery
): Entity | undefined {
  const radius_m = q.reach_m + q.buffer_m;
  const ids = queryNearbyIds(spatial, attacker.position_m, radius_m);

  // Collect candidates
  const cand: Entity[] = [];
  for (const id of ids) {
    if (id === attacker.id) continue;
    const e = index.byId.get(id);
    if (!e || e.injury.dead) continue;
    if (!isEnemy(attacker, e)) continue;

    if (q.requireFrontArc) {
      const dx = e.position_m.x - attacker.position_m.x;
      const dy = e.position_m.y - attacker.position_m.y;
      const dz = e.position_m.z - attacker.position_m.z;
      const dir = normaliseDirCheapQ({ x: dx, y: dy, z: dz });
      const dot = dotDirQ(attacker.action.facingDirQ, dir);
      const minDot = q.minDotQ ?? 0;
      if (dot < minDot) continue;
    }

    cand.push(e);
    if (cand.length >= q.maxTargets) {
      break;
    }
  }

  if (cand.length === 0) return undefined;

  // Deterministic pick: smallest distance², tie by id
  let best = cand[0]!;
  let bestD2 = dist2(attacker, best);

  for (let i = 1; i < cand.length; i++) {
    const e = cand[i]!;
    const d2 = dist2(attacker, e);
    if (d2 < bestD2 || (d2 === bestD2 && e.id < best.id)) {
      best = e;
      bestD2 = d2;
    }
  }
  return best;
}

function dist2(a: Entity, b: Entity): bigint {
  const dx = b.position_m.x - a.position_m.x;
  const dy = b.position_m.y - a.position_m.y;
  const dz = b.position_m.z - a.position_m.z;
  return BigInt(dx) * BigInt(dx) + BigInt(dy) * BigInt(dy) + BigInt(dz) * BigInt(dz);
}