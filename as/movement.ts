import { MAX_ENTITIES, alive, count, posX, posY, setPosX, setPosY, setVelX, setVelY, velX, velY } from "./world";

const COLLISION_R: i32 = 64;

@inline function absI32(v: i32): i32 { return v < 0 ? -v : v; }

@inline export function clampPos(v: i32): i32 {
  if (v < -32768) return -32768;
  if (v > 32768) return 32768;
  return v;
}

@inline export function integrateEntity(i: i32): void {
  if (!alive(i)) return;
  setPosX(i, clampPos(posX(i) + velX(i)));
  setPosY(i, clampPos(posY(i) + velY(i)));
}

@inline export function collide(i: i32, j: i32): void {
  const dx = posX(j) - posX(i);
  const dy = posY(j) - posY(i);
  if (absI32(dx) > COLLISION_R || absI32(dy) > COLLISION_R) return;

  const pushX = dx < 0 ? -2 : 2;
  const pushY = dy < 0 ? -2 : 2;

  setVelX(i, velX(i) - pushX);
  setVelY(i, velY(i) - pushY);
  setVelX(j, velX(j) + pushX);
  setVelY(j, velY(j) + pushY);
}

export function runMovement(): void {
  const n = count();
  if (n <= 0 || n > MAX_ENTITIES) return;
  for (let i = 0; i < n; i++) integrateEntity(i);
  for (let i = 0; i < n - 1; i++) {
    if (!alive(i)) continue;
    for (let j = i + 1; j < n; j++) {
      if (!alive(j)) continue;
      collide(i, j);
    }
  }
}
