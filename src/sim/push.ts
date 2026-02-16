import type { WorldState } from "./world";
import type { SpatialIndex } from "./spatial";
import type { WorldIndex } from "./indexing";
import { queryNearbyIds } from "./spatial";
import { SCALE, clampQ, q, qMul } from "../units";
import type { Q } from "../units";

export interface PushTuning {
  personalRadius_m: number;     // e.g. 0.45m
  repelAccel_mps2: number;      // e.g. 1.5 m/s² in fixed
  pushTransfer: Q;              // fraction of accel transferred to neighbour (0..1)
  maxNeighbours: number;
}

export function stepPushAndRepulsion(
  world: WorldState,
  index: WorldIndex,
  spatial: SpatialIndex,
  t: PushTuning
): void {
  const R = t.personalRadius_m;
  const R2 = BigInt(R) * BigInt(R);

  // Deterministic: iterate entities in stable id order (world.entities already sorted)
  for (const e of world.entities) {
    if (e.injury.dead) continue;

    const ids = queryNearbyIds(spatial, e.position_m, R);
    let checked = 0;

    for (const id of ids) {
      if (id === e.id) continue;
      if (id < e.id) continue; // handle each pair once (deterministic)
      const o = index.byId.get(id);
      if (!o || o.injury.dead) continue;

      const dx = o.position_m.x - e.position_m.x;
      const dy = o.position_m.y - e.position_m.y;
      const dz = o.position_m.z - e.position_m.z;

      const d2 = BigInt(dx) * BigInt(dx) + BigInt(dy) * BigInt(dy) + BigInt(dz) * BigInt(dz);
      if (d2 >= R2 || d2 === 0n) continue;

      // Repel along dx/dy only (keep it simple)
      // strength ~ (R - d)/R
      const d = approxDist(dx, dy);
      const overlap = Math.max(0, R - d);
      if (overlap <= 0) continue;

      const strengthQ = clampQ(Math.trunc((overlap * SCALE.Q) / R) as any, 0, SCALE.Q);

      const ax = Math.trunc((dx * t.repelAccel_mps2 * strengthQ) / (Math.max(1, d) * SCALE.Q));
      const ay = Math.trunc((dy * t.repelAccel_mps2 * strengthQ) / (Math.max(1, d) * SCALE.Q));

      // Apply equal and opposite accelerations to velocities (implicit dt folded into tuning)
      e.velocity_mps.x -= ax;
      e.velocity_mps.y -= ay;

      o.velocity_mps.x += ax;
      o.velocity_mps.y += ay;

      // Optional: push transfer based on intent direction (later)

      checked++;
      if (checked >= t.maxNeighbours) break;
    }
  }
}

function approxDist(dx: number, dy: number): number {
  const adx = dx < 0 ? -dx : dx;
  const ady = dy < 0 ? -dy : dy;
  return adx > ady ? adx + (ady >> 1) : ady + (adx >> 1);
}