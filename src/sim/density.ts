import type { WorldState } from "./world";
import type { SpatialIndex } from "./spatial";
import type { WorldIndex } from "./indexing";
import { queryNearbyIds } from "./spatial";
import { SCALE, clampQ, q } from "../units";
import type { Q } from "../units";

/** Per-entity crowding metrics (0..1 Q). */
export interface DensityField {
  crowdingQ: Map<number, Q>; // entityId -> 0..1
}

export interface DensityTuning {
  personalRadius_m: number;   // e.g. 0.45 m
  maxNeighbours: number;      // e.g. 12
  crowdingAt: number;         // neighbours count that maps to ~1.0
}

export function computeDensityField(
  world: WorldState,
  index: WorldIndex,
  spatial: SpatialIndex,
  t: DensityTuning
): DensityField {
  const crowdingQ = new Map<number, Q>();
  const R = t.personalRadius_m;

  for (const e of world.entities) {
    if (e.injury.dead) continue;

    const ids = queryNearbyIds(spatial, e.position_m, R);
    let n = 0;
    for (const id of ids) {
      if (id === e.id) continue;
      const o = index.byId.get(id);
      if (!o || o.injury.dead) continue;

      // count only within true radius (avoid square query overcount)
      const dx = o.position_m.x - e.position_m.x;
      const dy = o.position_m.y - e.position_m.y;
      const dz = o.position_m.z - e.position_m.z;
      const d2 = BigInt(dx) * BigInt(dx) + BigInt(dy) * BigInt(dy) + BigInt(dz) * BigInt(dz);
      if (d2 <= BigInt(R) * BigInt(R)) n++;
      if (n >= t.maxNeighbours) break;
    }

    // map neighbour count to 0..1 Q
    const qv = clampQ(Math.trunc((n * SCALE.Q) / Math.max(1, t.crowdingAt)) as any, 0, SCALE.Q);
    crowdingQ.set(e.id, qv);
  }

  return { crowdingQ };
}