import type { EntityPool } from "./object-pool.js";

export const COMMAND_STRIDE = 4;

export interface CommandBatch {
  buffer: Float32Array;
  count: number;
}

export function createCommandBatch(maxEntities: number): CommandBatch {
  return {
    buffer: new Float32Array(maxEntities * COMMAND_STRIDE),
    count: 0,
  };
}

export function fillMoveCommands(batch: CommandBatch, entityCount: number, amplitude: number): void {
  batch.count = entityCount;
  for (let i = 0; i < entityCount; i++) {
    const base = i * COMMAND_STRIDE;
    batch.buffer[base] = i;
    batch.buffer[base + 1] = (i & 1) === 0 ? amplitude : -amplitude;
    batch.buffer[base + 2] = ((i + 1) & 1) === 0 ? amplitude * 0.25 : -amplitude * 0.25;
    batch.buffer[base + 3] = (i % 5) === 0 ? 2 : 1;
  }
}

function read(arr: Float32Array, idx: number): number {
  return arr[idx] ?? 0;
}

export function applyCommandBatch(pool: EntityPool, batch: CommandBatch): void {
  for (let i = 0; i < batch.count; i++) {
    const base = i * COMMAND_STRIDE;
    const entity = Math.trunc(read(batch.buffer, base));
    if (entity < 0 || entity >= pool.count) continue;
    if ((pool.alive[entity] ?? 0) !== 1) continue;
    const vx = read(batch.buffer, base + 1);
    const vy = read(batch.buffer, base + 2);
    const damage = read(batch.buffer, base + 3);
    pool.velX[entity] = vx;
    pool.velY[entity] = vy;
    const hp = pool.hp[entity] ?? 0;
    pool.hp[entity] = Math.max(0, hp - damage * 0.02);
  }
}
