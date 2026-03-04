import type { WorldState } from "../world.js";
import type { SpatialIndex } from "../spatial.js";
import type { WorldIndex } from "../indexing.js";
import { queryNearbyIds } from "../spatial.js";
import { SCALE, clampQ } from "../../units.js";
import type { Q } from "../../units.js";

export interface PushTuning {
  personalRadius_m: number; // e.g. 0.45m
  repelAccel_mps2: number; // e.g. 1.5 m/s² in fixed
  pushTransfer: Q;         // fraction of accel transferred to neighbour (0..1) (unused for now)
  maxNeighbours: number;
}

type Pair = { a: number; b: number }; // entity id pair, a < b for deterministic ordering
type Dv = { x: number; y: number; z: number };
type DvMap = Map<number, Dv>; // entity id -> velocity delta

export function stepPushAndRepulsion(
  world: WorldState,
  index: WorldIndex,
  spatial: SpatialIndex,
  tuning: PushTuning
): void {
  const R = tuning.personalRadius_m;
  const R2 = BigInt(R) * BigInt(R);

  // 1) collect all candidate pairs (order-independent)
  const pairs: Pair[] = [];

  // Deterministic: world.entities already sorted by id in stepWorld
  for (const e of world.entities) {
    if (e.injury.dead) continue;

    const ids = queryNearbyIds(spatial, e.position_m, R, tuning.maxNeighbours);
    ids.sort((x, y) => x - y);

    for (const id of ids) {
      if (id === e.id) continue;
      const a = Math.min(e.id, id);
      const b = Math.max(e.id, id);
      pairs.push({ a, b });
    }
  }

  // 2) de-dupe pairs deterministically
  pairs.sort((p, q) => (p.a - q.a) || (p.b - q.b));
  const uniq: Pair[] = [];
  for (const p of pairs) {
    const last = uniq[uniq.length - 1];
    if (!last || last.a !== p.a || last.b !== p.b) uniq.push(p);
  }

  // 3) compute dv per pair, accumulate into dv map (NO entity mutation here)
  const dv: DvMap = new Map();

  for (const { a, b } of uniq) {
    const A = index.byId.get(a);
    const B = index.byId.get(b);
    if (!A || !B) continue;
    if (A.injury.dead || B.injury.dead) continue;

    const dx = B.position_m.x - A.position_m.x;
    const dy = B.position_m.y - A.position_m.y;
    const dz = B.position_m.z - A.position_m.z;

    const d2 = BigInt(dx) * BigInt(dx) + BigInt(dy) * BigInt(dy) + BigInt(dz) * BigInt(dz);
    if (d2 >= R2 || d2 === 0n) continue;

    // repel along x/y only
    const d = approxDist(dx, dy);
    const overlap = Math.max(0, R - d);
    if (overlap <= 0) continue;

    const strengthQ = clampQ(
      Math.trunc((overlap * SCALE.Q) / R),
      0,
      SCALE.Q
    );

    const ax = Math.trunc((dx * tuning.repelAccel_mps2 * strengthQ) / (Math.max(1, d) * SCALE.Q));
    const ay = Math.trunc((dy * tuning.repelAccel_mps2 * strengthQ) / (Math.max(1, d) * SCALE.Q));

    // equal + opposite dv
    addDv(dv, A.id, -ax, -ay, 0);
    addDv(dv, B.id,  ax,  ay, 0);
  }

  // 4) apply dv in stable order (world.entities is stable-sorted)
  for (const e of world.entities) {
    const d = dv.get(e.id);
    if (!d) continue;
    e.velocity_mps.x += d.x;
    e.velocity_mps.y += d.y;
    e.velocity_mps.z += d.z;
  }
}

function addDv(dv: DvMap, id: number, dx: number, dy: number, dz: number): void {
  const cur = dv.get(id) ?? { x: 0, y: 0, z: 0 };
  cur.x += dx;
  cur.y += dy;
  cur.z += dz;
  dv.set(id, cur);
}

// cheap approx: max + 0.5*min
function approxDist(dx: number, dy: number): number {
  const adx = dx < 0 ? -dx : dx;
  const ady = dy < 0 ? -dy : dy;
  return adx > ady ? adx + (ady >> 1) : ady + (adx >> 1);
}