import type { ImpactEvent } from "./events";
import type { WorldIndex } from "./indexing";
import type { Entity } from "./entity";

export interface FrontageRules {
  maxEngagersPerTarget: number;
}

export function applyFrontageCap(
  impacts: ImpactEvent[],
  index: WorldIndex,
  rules: FrontageRules
): ImpactEvent[] {
  const maxK = Math.max(1, rules.maxEngagersPerTarget);

  // group by targetId
  const byTarget = new Map<number, ImpactEvent[]>();
  for (const ev of impacts) {
    let arr = byTarget.get(ev.targetId);
    if (!arr) { arr = []; byTarget.set(ev.targetId, arr); }
    arr.push(ev);
  }

  const kept: ImpactEvent[] = [];

  for (const [targetId, arr] of byTarget.entries()) {
    if (arr.length <= maxK) {
      for (const ev of arr) kept.push(ev);
      continue;
    }

    const target = index.byId.get(targetId);
    if (!target) continue;

    // sort attackers by distance² then attackerId
    arr.sort((a, b) => {
      const da = dist2ByIds(index, a.attackerId, target);
      const db = dist2ByIds(index, b.attackerId, target);
      if (da < db) return -1;
      if (da > db) return 1;
      return a.attackerId - b.attackerId;
    });

    for (let i = 0; i < maxK; i++) kept.push(arr[i]!);
  }

  return kept;
}

function dist2ByIds(index: WorldIndex, attackerId: number, target: Entity): bigint {
  const a = index.byId.get(attackerId);
  if (!a) return (1n << 62n); // big + safe, avoids magic decimal
  const dx = target.position_m.x - a.position_m.x;
  const dy = target.position_m.y - a.position_m.y;
  const dz = target.position_m.z - a.position_m.z;
  return BigInt(dx) * BigInt(dx) + BigInt(dy) * BigInt(dy) + BigInt(dz) * BigInt(dz);
}