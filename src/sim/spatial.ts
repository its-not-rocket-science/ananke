import { SCALE } from "../units";
import type { Vec3 } from "./vec3";
import type { WorldState } from "./world";
import type { Entity } from "./entity";

export interface SpatialIndex {
  cell_m: number; // fixed-point metres (same scale as position_m)
  // key -> sorted entity ids
  cells: Map<number, number[]>;
}

function cellCoord(pos_m: number, cell_m: number): number {
  // floor division that behaves for negative coordinates too
  const q = Math.trunc(pos_m / cell_m);
  return pos_m < 0 && pos_m % cell_m !== 0 ? q - 1 : q;
}

function pack(cx: number, cy: number): number {
  // deterministic 32-bit packing (cx,cy limited by map bounds in practice)
  // offset to avoid negative mixing issues
  const ax = (cx & 0xffff) >>> 0;
  const ay = (cy & 0xffff) >>> 0;
  return ((ax << 16) | ay) >>> 0;
}

export function buildSpatialIndex(world: WorldState, cellSize_m: number): SpatialIndex {
  const cell_m = Math.max(1, Math.trunc(cellSize_m)); // already in fixed-point metres
  const cells = new Map<number, number[]>();

  for (const e of world.entities) {
    if (e.injury.dead) continue;
    const cx = cellCoord(e.position_m.x, cell_m);
    const cy = cellCoord(e.position_m.y, cell_m);
    const key = pack(cx, cy);
    let arr = cells.get(key);
    if (!arr) {
      arr = [];
      cells.set(key, arr);
    }
    arr.push(e.id);
  }

  // deterministic: sort IDs inside each cell
  for (const arr of cells.values()) arr.sort((a, b) => a - b);

  return { cell_m, cells };
}

export function queryNearbyIds(index: SpatialIndex, pos: Vec3, radius_m: number): number[] {
  const cell_m = index.cell_m;
  const r = Math.max(0, radius_m);

  const cx0 = cellCoord(pos.x - r, cell_m);
  const cx1 = cellCoord(pos.x + r, cell_m);
  const cy0 = cellCoord(pos.y - r, cell_m);
  const cy1 = cellCoord(pos.y + r, cell_m);

  const out: number[] = [];
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const key = pack(cx, cy);
      const ids = index.cells.get(key);
      if (!ids) continue;
      // already sorted
      for (const id of ids) out.push(id);
    }
  }

  // deterministic overall order: sort once (cheap; neighbourhood small)
  out.sort((a, b) => a - b);
  return out;
}