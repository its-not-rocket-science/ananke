import { rollDamage } from "./combat";
import { integrateAxis, resolvePair } from "./movement";

// @global fixed-capacity world state; no allocations on hot path.
export const MAX_ENTITIES: i32 = 2048;
export const ENTITY_STRIDE_I32: i32 = 10; // id,team,x,y,vx,vy,hp,armour,skill,evasion

@global let WORLD_SEED: i32 = 1;
@global let WORLD_COUNT: i32 = 0;
@global let SNAPSHOT_PTR: i32 = 0;
@global let HEAP_PTR: i32 = 0;

const IDS = new StaticArray<i32>(MAX_ENTITIES);
const TEAMS = new StaticArray<i32>(MAX_ENTITIES);
const POS_X = new StaticArray<i32>(MAX_ENTITIES);
const POS_Y = new StaticArray<i32>(MAX_ENTITIES);
const VEL_X = new StaticArray<i32>(MAX_ENTITIES);
const VEL_Y = new StaticArray<i32>(MAX_ENTITIES);
const HP_Q = new StaticArray<i32>(MAX_ENTITIES);
const ARMOUR_Q = new StaticArray<i32>(MAX_ENTITIES);
const SKILL_Q = new StaticArray<i32>(MAX_ENTITIES);
const EVASION_Q = new StaticArray<i32>(MAX_ENTITIES);

@inline
function resetEntity(i: i32): void {
  unchecked(IDS[i] = i + 1);
  unchecked(TEAMS[i] = (i & 1) + 1);
  unchecked(POS_X[i] = (i & 63) * 900);
  unchecked(POS_Y[i] = (i >>> 6) * 900);
  unchecked(VEL_X[i] = 0);
  unchecked(VEL_Y[i] = 0);
  unchecked(HP_Q[i] = 10000);
  unchecked(ARMOUR_Q[i] = 2500);
  unchecked(SKILL_Q[i] = 6200);
  unchecked(EVASION_Q[i] = 4600);
}

export function allocWords(words: i32): i32 {
  const ptr = HEAP_PTR;
  HEAP_PTR += (words << 2);
  return ptr;
}

export function world_count(): i32 {
  return WORLD_COUNT;
}

export function world_loadEntities(ptr: i32, count: i32): i32 {
  const n = count > MAX_ENTITIES ? MAX_ENTITIES : count;
  WORLD_COUNT = n;
  for (let i = 0; i < n; i++) {
    const base = ptr + i * ENTITY_STRIDE_I32 * 4;
    unchecked(IDS[i] = load<i32>(base));
    unchecked(TEAMS[i] = load<i32>(base + 4));
    unchecked(POS_X[i] = load<i32>(base + 8));
    unchecked(POS_Y[i] = load<i32>(base + 12));
    unchecked(VEL_X[i] = load<i32>(base + 16));
    unchecked(VEL_Y[i] = load<i32>(base + 20));
    unchecked(HP_Q[i] = load<i32>(base + 24));
    unchecked(ARMOUR_Q[i] = load<i32>(base + 28));
    unchecked(SKILL_Q[i] = load<i32>(base + 32));
    unchecked(EVASION_Q[i] = load<i32>(base + 36));
  }
  return n;
}

export function world_create(seed: i32): i32 {
  WORLD_SEED = seed | 0;
  WORLD_COUNT = 0;
  if (HEAP_PTR == 0) {
    HEAP_PTR = 512 * 1024; // scratch area begins after static arrays
  }
  SNAPSHOT_PTR = allocWords(1 + MAX_ENTITIES * 5);
  return 1;
}

@inline
function applyMovement(i: i32): void {
  unchecked(POS_X[i] = integrateAxis(unchecked(POS_X[i]), unchecked(VEL_X[i])));
  unchecked(POS_Y[i] = integrateAxis(unchecked(POS_Y[i]), unchecked(VEL_Y[i])));
}

@inline
function applyCollisions(): void {
  const n = WORLD_COUNT;
  for (let i = 0; i < n - 1; i++) {
    if (unchecked(HP_Q[i]) <= 0) continue;
    for (let j = i + 1; j < n; j++) {
      if (unchecked(HP_Q[j]) <= 0) continue;
      const overlap = resolvePair(unchecked(POS_X[i]), unchecked(POS_Y[i]), unchecked(POS_X[j]), unchecked(POS_Y[j]), 1500);
      if (overlap > 0) {
        unchecked(VEL_X[i] = unchecked(VEL_X[i]) - (overlap >> 1));
        unchecked(VEL_X[j] = unchecked(VEL_X[j]) + (overlap >> 1));
      }
    }
  }
}

@inline
function applyCombat(attacker: i32, target: i32): void {
  if (attacker < 0 || target < 0 || attacker >= WORLD_COUNT || target >= WORLD_COUNT) return;
  if (unchecked(HP_Q[attacker]) <= 0 || unchecked(HP_Q[target]) <= 0) return;
  if (unchecked(TEAMS[attacker]) == unchecked(TEAMS[target])) return;

  const damage = rollDamage(
    WORLD_SEED,
    unchecked(IDS[attacker]),
    unchecked(IDS[target]),
    1450,
    unchecked(SKILL_Q[attacker]),
    unchecked(EVASION_Q[target]),
    unchecked(ARMOUR_Q[target]),
  );
  unchecked(HP_Q[target] = unchecked(HP_Q[target]) - damage);
  if (unchecked(HP_Q[target]) < 0) unchecked(HP_Q[target] = 0);
}

// commands buffer format: [count, eIdx, dx, dy, targetIdx, eIdx, dx, dy, targetIdx, ...]
export function world_step(commandsPtr: i32): i32 {
  const n = WORLD_COUNT;
  for (let i = 0; i < n; i++) {
    applyMovement(i);
  }

  const commandCount = load<i32>(commandsPtr);
  let cursor = commandsPtr + 4;
  for (let i = 0; i < commandCount; i++) {
    const entityIdx = load<i32>(cursor);
    const dx = load<i32>(cursor + 4);
    const dy = load<i32>(cursor + 8);
    const targetIdx = load<i32>(cursor + 12);
    cursor += 16;
    if (entityIdx < 0 || entityIdx >= n) continue;
    unchecked(VEL_X[entityIdx] = unchecked(VEL_X[entityIdx]) + dx);
    unchecked(VEL_Y[entityIdx] = unchecked(VEL_Y[entityIdx]) + dy);
    applyCombat(entityIdx, targetIdx);
  }

  applyCollisions();
  WORLD_SEED = WORLD_SEED * 1664525 + 1013904223;
  return n;
}

export function world_extractSnapshot(): i32 {
  store<i32>(SNAPSHOT_PTR, WORLD_COUNT);
  let cursor = SNAPSHOT_PTR + 4;
  for (let i = 0; i < WORLD_COUNT; i++) {
    store<i32>(cursor, unchecked(IDS[i]));
    store<i32>(cursor + 4, unchecked(POS_X[i]));
    store<i32>(cursor + 8, unchecked(POS_Y[i]));
    store<i32>(cursor + 12, unchecked(HP_Q[i]));
    store<i32>(cursor + 16, unchecked(HP_Q[i]) > 0 ? 1 : 0);
    cursor += 20;
  }
  return SNAPSHOT_PTR;
}

export function world_bootstrap(count: i32): i32 {
  WORLD_COUNT = count > MAX_ENTITIES ? MAX_ENTITIES : count;
  for (let i = 0; i < WORLD_COUNT; i++) resetEntity(i);
  return WORLD_COUNT;
}
