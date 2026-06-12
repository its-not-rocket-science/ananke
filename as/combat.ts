import { alive, armour, count, hp, posX, posY, setAlive, setHp } from "./world";

@inline export function hitChance(distance: i32): i32 {
  const chance = 900 - (distance >> 3);
  return chance < 250 ? 250 : chance;
}

@inline export function armourReduction(rawDamage: i32, armourValue: i32): i32 {
  const reduced = rawDamage - (armourValue << 1);
  return reduced > 10 ? reduced : 10;
}

@inline function absI32(v: i32): i32 { return v < 0 ? -v : v; }

@inline export function applyCombatForEntity(attacker: i32, target: i32, rng: i32): void {
  if (!alive(attacker) || !alive(target)) return;
  const dx = absI32(posX(attacker) - posX(target));
  const dy = absI32(posY(attacker) - posY(target));
  const dist = dx + dy;
  if ((rng & 1023) > hitChance(dist)) return;
  const raw = 70 + (rng & 63);
  const dealt = armourReduction(raw, armour(target));
  const nextHp = hp(target) - dealt;
  setHp(target, nextHp);
  if (nextHp <= 0) setAlive(target, 0);
}

export function resolveCombat(rng: i32): void {
  const n = count();
  for (let i = 0; i < n; i++) {
    const target = (i + 1) % n;
    applyCombatForEntity(i, target, (rng + i * 1103515245) | 0);
  }
}
