import type { EntityPool } from "./object-pool.js";

export interface SpatialHashGrid {
  readonly cellSize: number;
  clear: () => void;
  insert: (entityIndex: number, x: number, y: number) => void;
  forEachNearbyPair: (callback: (a: number, b: number) => void) => void;
}

interface BucketMap {
  [cellKey: string]: number[];
}

function f32(v: number | undefined): number {
  return v ?? 0;
}

export function createSpatialHashGrid(cellSize: number): SpatialHashGrid {
  const buckets: BucketMap = Object.create(null) as BucketMap;

  return {
    cellSize,
    clear() {
      for (const key of Object.keys(buckets)) delete buckets[key];
    },
    insert(entityIndex, x, y) {
      const cx = Math.floor(x / cellSize);
      const cy = Math.floor(y / cellSize);
      const key = `${cx},${cy}`;
      (buckets[key] ??= []).push(entityIndex);
    },
    forEachNearbyPair(callback) {
      for (const key of Object.keys(buckets)) {
        const cell = buckets[key];
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          for (let j = i + 1; j < cell.length; j++) {
            const a = cell[i];
            const b = cell[j];
            if (a !== undefined && b !== undefined) callback(a, b);
          }
        }
      }
    },
  };
}

export function resolveProximityDamage(pool: EntityPool, grid: SpatialHashGrid, damageScale: number): void {
  grid.clear();
  for (let i = 0; i < pool.count; i++) {
    if ((pool.alive[i] ?? 0) !== 1) continue;
    grid.insert(i, f32(pool.posX[i]), f32(pool.posY[i]));
  }

  grid.forEachNearbyPair((a, b) => {
    const dx = f32(pool.posX[a]) - f32(pool.posX[b]);
    const dy = f32(pool.posY[a]) - f32(pool.posY[b]);
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > 25 * 25) return;

    const damage = Math.max(0.5, damageScale - distanceSquared * 0.002);
    pool.hp[a] = Math.max(0, f32(pool.hp[a]) - damage);
    pool.hp[b] = Math.max(0, f32(pool.hp[b]) - damage);
    if (f32(pool.hp[a]) <= 0) pool.alive[a] = 0;
    if (f32(pool.hp[b]) <= 0) pool.alive[b] = 0;
  });
}
