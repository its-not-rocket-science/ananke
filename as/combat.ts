@inline
export function hashMix(seed: i32, a: i32, b: i32): i32 {
  let x = seed ^ (a * 374761393) ^ (b * 668265263);
  x = (x ^ (x >>> 13)) * 1274126177;
  return x ^ (x >>> 16);
}

@inline
export function hitChanceQ(attackerSkillQ: i32, defenderEvasionQ: i32): i32 {
  const base = attackerSkillQ - (defenderEvasionQ >> 1);
  if (base < 1500) return 1500;
  if (base > 9500) return 9500;
  return base;
}

@inline
export function armourReductionQ(armourQ: i32): i32 {
  if (armourQ <= 0) return 10000;
  const mitigated = 10000 - (armourQ > 8500 ? 8500 : armourQ);
  return mitigated < 1500 ? 1500 : mitigated;
}

@inline
export function rollDamage(
  seed: i32,
  attacker: i32,
  target: i32,
  baseDamageQ: i32,
  attackerSkillQ: i32,
  defenderEvasionQ: i32,
  armourQ: i32,
): i32 {
  const roll = hashMix(seed, attacker, target) & 0x7fff;
  const chance = hitChanceQ(attackerSkillQ, defenderEvasionQ);
  if (roll % 10000 >= chance) return 0;
  const crit = (roll & 31) == 0 ? 13000 : 10000;
  const afterArmour = <i32>((<i64>baseDamageQ * <i64>armourReductionQ(armourQ)) / 10000);
  return <i32>((<i64>afterArmour * <i64>crit) / 10000);
}
