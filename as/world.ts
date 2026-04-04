export const MAX_ENTITIES: i32 = 1024;

const STRIDE: i32 = MAX_ENTITIES * 4;
const OFFSET_COUNT: i32 = 0;
const OFFSET_SEED: i32 = 4;
export const OFFSET_POS_X: i32 = 16;
export const OFFSET_POS_Y: i32 = OFFSET_POS_X + STRIDE;
export const OFFSET_VEL_X: i32 = OFFSET_POS_Y + STRIDE;
export const OFFSET_VEL_Y: i32 = OFFSET_VEL_X + STRIDE;
export const OFFSET_HP: i32 = OFFSET_VEL_Y + STRIDE;
export const OFFSET_ARMOUR: i32 = OFFSET_HP + STRIDE;
export const OFFSET_ALIVE: i32 = OFFSET_ARMOUR + STRIDE;

@inline export function count(): i32 { return load<i32>(OFFSET_COUNT); }
@inline export function setCount(v: i32): void { store<i32>(OFFSET_COUNT, v); }
@inline export function seed(): i32 { return load<i32>(OFFSET_SEED); }
@inline export function setSeed(v: i32): void { store<i32>(OFFSET_SEED, v); }

@inline export function posX(i: i32): i32 { return load<i32>(OFFSET_POS_X + (i << 2)); }
@inline export function posY(i: i32): i32 { return load<i32>(OFFSET_POS_Y + (i << 2)); }
@inline export function velX(i: i32): i32 { return load<i32>(OFFSET_VEL_X + (i << 2)); }
@inline export function velY(i: i32): i32 { return load<i32>(OFFSET_VEL_Y + (i << 2)); }
@inline export function hp(i: i32): i32 { return load<i32>(OFFSET_HP + (i << 2)); }
@inline export function armour(i: i32): i32 { return load<i32>(OFFSET_ARMOUR + (i << 2)); }
@inline export function alive(i: i32): i32 { return load<i32>(OFFSET_ALIVE + (i << 2)); }

@inline export function setPosX(i: i32, v: i32): void { store<i32>(OFFSET_POS_X + (i << 2), v); }
@inline export function setPosY(i: i32, v: i32): void { store<i32>(OFFSET_POS_Y + (i << 2), v); }
@inline export function setVelX(i: i32, v: i32): void { store<i32>(OFFSET_VEL_X + (i << 2), v); }
@inline export function setVelY(i: i32, v: i32): void { store<i32>(OFFSET_VEL_Y + (i << 2), v); }
@inline export function setHp(i: i32, v: i32): void { store<i32>(OFFSET_HP + (i << 2), v); }
@inline export function setArmour(i: i32, v: i32): void { store<i32>(OFFSET_ARMOUR + (i << 2), v); }
@inline export function setAlive(i: i32, v: i32): void { store<i32>(OFFSET_ALIVE + (i << 2), v); }

@inline function rngNext(): i32 {
  const next = (seed() * 1664525 + 1013904223) | 0;
  setSeed(next);
  return next;
}

export function world_create(seedValue: i32): i32 {
  setSeed(seedValue | 0);
  const n = 256;
  setCount(n);
  for (let i = 0; i < n; i++) {
    const x = (rngNext() & 0x3fff) - 0x1fff;
    const y = (rngNext() & 0x3fff) - 0x1fff;
    setPosX(i, x);
    setPosY(i, y);
    setVelX(i, 0);
    setVelY(i, 0);
    setHp(i, 1000 + (rngNext() & 0x3ff));
    setArmour(i, 25 + (rngNext() & 31));
    setAlive(i, 1);
  }
  return n;
}
