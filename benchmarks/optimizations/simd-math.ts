import type { EntityPool } from "./object-pool.js";

function clamp(v: number): number {
  if (v < -5000) return -5000;
  if (v > 5000) return 5000;
  return v;
}

function read(arr: Float32Array, idx: number): number {
  return arr[idx] ?? 0;
}

// SIMD-friendly data layout: structure-of-arrays + 4-wide unrolled loop.
export function integratePositionsSIMD(pool: EntityPool): void {
  const n = pool.count;
  let i = 0;
  for (; i + 3 < n; i += 4) {
    pool.posX[i] = clamp(read(pool.posX, i) + read(pool.velX, i));
    pool.posY[i] = clamp(read(pool.posY, i) + read(pool.velY, i));

    pool.posX[i + 1] = clamp(read(pool.posX, i + 1) + read(pool.velX, i + 1));
    pool.posY[i + 1] = clamp(read(pool.posY, i + 1) + read(pool.velY, i + 1));

    pool.posX[i + 2] = clamp(read(pool.posX, i + 2) + read(pool.velX, i + 2));
    pool.posY[i + 2] = clamp(read(pool.posY, i + 2) + read(pool.velY, i + 2));

    pool.posX[i + 3] = clamp(read(pool.posX, i + 3) + read(pool.velX, i + 3));
    pool.posY[i + 3] = clamp(read(pool.posY, i + 3) + read(pool.velY, i + 3));
  }

  for (; i < n; i++) {
    pool.posX[i] = clamp(read(pool.posX, i) + read(pool.velX, i));
    pool.posY[i] = clamp(read(pool.posY, i) + read(pool.velY, i));
  }
}
