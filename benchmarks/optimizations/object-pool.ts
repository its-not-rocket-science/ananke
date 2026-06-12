export interface EntityPool {
  capacity: number;
  count: number;
  posX: Float32Array;
  posY: Float32Array;
  velX: Float32Array;
  velY: Float32Array;
  hp: Float32Array;
  alive: Uint8Array;
}

export function createEntityPool(capacity: number): EntityPool {
  return {
    capacity,
    count: 0,
    posX: new Float32Array(capacity),
    posY: new Float32Array(capacity),
    velX: new Float32Array(capacity),
    velY: new Float32Array(capacity),
    hp: new Float32Array(capacity),
    alive: new Uint8Array(capacity),
  };
}

export function resetEntityPool(pool: EntityPool, count: number): void {
  if (count > pool.capacity) {
    throw new Error(`Entity count ${count} exceeds pool capacity ${pool.capacity}`);
  }
  pool.count = count;
  pool.posX.fill(0, 0, count);
  pool.posY.fill(0, 0, count);
  pool.velX.fill(0, 0, count);
  pool.velY.fill(0, 0, count);
  pool.hp.fill(100, 0, count);
  pool.alive.fill(1, 0, count);
}
