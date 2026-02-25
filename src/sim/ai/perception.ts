import type { Entity } from "../entity.js";
import type { WorldIndex } from "../indexing.js";
import type { SpatialIndex } from "../spatial.js";
import { queryNearbyIds } from "../spatial.js";
import { isEnemy } from "../team.js";
import { SCALE, q } from "../../units.js";
import { canDetect, DEFAULT_PERCEPTION, DEFAULT_SENSORY_ENV, type SensoryEnvironment } from "../sensory.js";
import { findSensor } from "../../equipment.js";

export interface LocalPerception {
  enemies: Entity[];
  allies: Entity[];
}

/** @deprecated Use LocalPerception */
export type Perception = LocalPerception;

export function perceiveLocal(
  self: Entity,
  index: WorldIndex,
  spatial: SpatialIndex,
  radius_m: number,
  maxCount = 24,
  env: SensoryEnvironment = DEFAULT_SENSORY_ENV,
): LocalPerception {
  const perc = (self.attributes as any).perception ?? DEFAULT_PERCEPTION;
  // Use the threat horizon as the spatial query radius if it is smaller than the requested radius.
  const effectiveRadius = Math.min(radius_m, perc.threatHorizon_m);

  const ids = queryNearbyIds(spatial, self.position_m, effectiveRadius);
  ids.sort((a, b) => a - b);

  const enemies: Entity[] = [];
  const allies: Entity[] = [];

  for (const id of ids) {
    if (id === self.id) continue;
    const e = index.byId.get(id);
    if (!e || e.injury.dead) continue;

    // Phase 4: filter by sensory detection
    // Phase 11C: derive sensor boost from loadout
    const sensor = findSensor(self.loadout);
    const sensorBoost = sensor
      ? { visionRangeMul: sensor.visionRangeMul, hearingRangeMul: sensor.hearingRangeMul }
      : undefined;
    const detQ = canDetect(self, e, env, sensorBoost);
    if (detQ <= q(0)) continue;

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