import { resolveCombat } from "./combat";
import { runMovement } from "./movement";
import { MAX_ENTITIES, alive, count, hp, posX, posY, seed, setSeed, setVelX, setVelY, world_create as worldCreate } from "./world";

let heapPtr: i32 = 65536;

// command format: [entityIndex, vx, vy] x commandCount
const COMMAND_STRIDE: i32 = 12;
const SNAPSHOT_STRIDE: i32 = 16;

function ensureCapacity(bytesNeeded: i32): void {
  const pagesNeeded = (bytesNeeded + 65535) >>> 16;
  const current = memory.size();
  if (pagesNeeded > current) memory.grow(pagesNeeded - current);
}

export function alloc(size: i32): i32 {
  const ptr = heapPtr;
  heapPtr = (heapPtr + size + 7) & ~7;
  ensureCapacity(heapPtr);
  return ptr;
}

export function dealloc(_ptr: i32): void {}

function nextRng(): i32 {
  const n = (seed() * 1664525 + 1013904223) | 0;
  setSeed(n);
  return n;
}

export function world_create(seed: i32): i32 {
  ensureCapacity(32768);
  return _world_create(seed);
}

@inline function _world_create(seed: i32): i32 {
  return worldCreate(seed);
}

export function world_step(commandsPtr: i32, commandCount: i32): i32 {
  const n = count();
  const cap = n < MAX_ENTITIES ? n : MAX_ENTITIES;
  for (let i = 0; i < commandCount; i++) {
    const base = commandsPtr + i * COMMAND_STRIDE;
    const entity = load<i32>(base);
    if (entity < 0 || entity >= cap || !alive(entity)) continue;
    setVelX(entity, load<i32>(base + 4));
    setVelY(entity, load<i32>(base + 8));
  }
  runMovement();
  resolveCombat(nextRng());
  return cap;
}

export function world_extractSnapshot(outPtr: i32): i32 {
  const n = count();
  store<i32>(outPtr, n);
  let ptr = outPtr + 4;
  for (let i = 0; i < n; i++) {
    store<i32>(ptr, posX(i));
    store<i32>(ptr + 4, posY(i));
    store<i32>(ptr + 8, hp(i));
    store<i32>(ptr + 12, alive(i));
    ptr += SNAPSHOT_STRIDE;
  }
  return 4 + n * SNAPSHOT_STRIDE;
}

export function snapshot_size_for(n: i32): i32 {
  return 4 + n * SNAPSHOT_STRIDE;
}
