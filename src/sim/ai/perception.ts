import type { Entity } from "../entity";
import type { WorldIndex } from "../indexing";
import type { SpatialIndex } from "../spatial";
import { queryNearbyIds } from "../spatial";
import { isEnemy } from "../team";
import { SCALE } from "../../units";

export interface Perception {
  enemies: Entity[];
  allies: Entity[];
}

export function perceiveLocal(
  self: Entity,
  index: WorldIndex,
  spatial: SpatialIndex,
  radius_m: number,
  maxCount = 24
): Perception {
  const ids = queryNearbyIds(spatial, self.position_m, radius_m);

  const enemies: Entity[] = [];
  const allies: Entity[] = [];

  for (const id of ids) {
    if (id === self.id) continue;
    const e = index.byId.get(id);
    if (!e || e.injury.dead) continue;

    if (isEnemy(self, e)) enemies.push(e);
    else allies.push(e);

    if (enemies.length + allies.length >= maxCount) break;
  }

  // deterministic order: distance² then id
  const sortByDist = (a: Entity, b: Entity) => {
    const dxA = a.position_m.x - self.position_m.x;
    const dyA = a.position_m.y - self.position_m.y;
    const d2A = BigInt(dxA) * BigInt(dxA) + BigInt(dyA) * BigInt(dyA);

    const dxB = b.position_m.x - self.position_m.x;
    const dyB = b.position_m.y - self.position_m.y;
    const d2B = BigInt(dxB) * BigInt(dxB) + BigInt(dyB) * BigInt(dyB);

    if (d2A < d2B) return -1;
    if (d2A > d2B) return 1;
    return a.id - b.id;
  };

  enemies.sort(sortByDist);
  allies.sort(sortByDist);

  return { enemies, allies };
}