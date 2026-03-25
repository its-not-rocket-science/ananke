// as/push.ts — AssemblyScript port of the per-pair repulsion computation
// from src/sim/step/push.ts.
//
// API: caller writes entity data to WASM linear memory via writeEntity(),
// calls stepRepulsionPairs(), then reads velocity deltas with readDvX/Y().
// This flat-memory approach avoids dynamic allocation and works with
// --runtime stub (no GC required).
//
// Compile with: npm run build:wasm:push

import { SCALE_Q, clampQ } from "./units";

// ── Memory layout ────────────────────────────────────────────────────────────

/** Maximum entities per batch. */
export const MAX_ENTITIES: i32 = 64;

const STRIDE: i32 = MAX_ENTITIES * 4; // bytes per i32 array

/** Byte offset of pos_x array (i32 × MAX_ENTITIES). */
export const OFFSET_POS_X: i32 = 0;
/** Byte offset of pos_y array (i32 × MAX_ENTITIES). */
export const OFFSET_POS_Y: i32 = STRIDE;
/** Byte offset of alive array (i32 × MAX_ENTITIES; 1=alive, 0=dead). */
export const OFFSET_ALIVE: i32 = STRIDE * 2;
/** Byte offset of dv_x output array (i32 × MAX_ENTITIES). Cleared by stepRepulsionPairs. */
export const OFFSET_DV_X: i32 = STRIDE * 3;
/** Byte offset of dv_y output array (i32 × MAX_ENTITIES). Cleared by stepRepulsionPairs. */
export const OFFSET_DV_Y: i32 = STRIDE * 4;
// Total footprint: 5 × 64 × 4 = 1280 bytes (< 1 WASM page = 65536 bytes)

// ── Data marshaling ──────────────────────────────────────────────────────────

/**
 * Write one entity into WASM memory at slot [0, MAX_ENTITIES).
 * posX / posY are in SCALE.m units (0.1 mm); alive = 1 or 0.
 */
export function writeEntity(slot: i32, posX: i32, posY: i32, alive: i32): void {
  store<i32>(OFFSET_POS_X + slot * 4, posX);
  store<i32>(OFFSET_POS_Y + slot * 4, posY);
  store<i32>(OFFSET_ALIVE + slot * 4, alive);
}

/** Read accumulated velocity-delta X for entity at slot (in SCALE.mps units). */
export function readDvX(slot: i32): i32 {
  return load<i32>(OFFSET_DV_X + slot * 4);
}

/** Read accumulated velocity-delta Y for entity at slot (in SCALE.mps units). */
export function readDvY(slot: i32): i32 {
  return load<i32>(OFFSET_DV_Y + slot * 4);
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Octagonal distance approximation: max(|dx|,|dy|) + 0.5 × min(|dx|,|dy|).
 * Integer-only; mirrors approxDist() in src/sim/step/push.ts.
 * Maximum relative error ≈ 3.5%.
 */
export function approxDist(dx: i32, dy: i32): i32 {
  const adx: i32 = dx < 0 ? -dx : dx;
  const ady: i32 = dy < 0 ? -dy : dy;
  return adx > ady ? adx + (ady >> 1) : ady + (adx >> 1);
}

// ── Main computation ─────────────────────────────────────────────────────────

/**
 * Run the N² pair repulsion pass over `n` entities loaded into WASM memory.
 * For each overlapping pair (i, j) with i < j:
 *   - Computes octagonal distance d and overlap = radius_m − d.
 *   - Scales repel acceleration by overlap / radius (strengthQ in Q).
 *   - Accumulates equal-and-opposite velocity deltas.
 *
 * @param n              number of active slots (≤ MAX_ENTITIES)
 * @param radius_m       personal-space radius in SCALE.m units (e.g. 4500 = 0.45 m)
 * @param repelAccel_mps2 repulsion acceleration in SCALE.mps2 units (e.g. 15000 = 1.5 m/s²)
 *
 * Results written to OFFSET_DV_X / OFFSET_DV_Y; previous dv values are cleared first.
 * Mirrors the pair loop in stepPushAndRepulsion() in src/sim/step/push.ts.
 */
export function stepRepulsionPairs(n: i32, radius_m: i32, repelAccel_mps2: i32): void {
  // clear output arrays
  for (let i = 0; i < n; i++) {
    store<i32>(OFFSET_DV_X + i * 4, 0);
    store<i32>(OFFSET_DV_Y + i * 4, 0);
  }

  const R2: i64 = <i64>radius_m * <i64>radius_m;

  for (let i = 0; i < n - 1; i++) {
    if (!load<i32>(OFFSET_ALIVE + i * 4)) continue;
    const xi: i32 = load<i32>(OFFSET_POS_X + i * 4);
    const yi: i32 = load<i32>(OFFSET_POS_Y + i * 4);

    for (let j = i + 1; j < n; j++) {
      if (!load<i32>(OFFSET_ALIVE + j * 4)) continue;
      const xj: i32 = load<i32>(OFFSET_POS_X + j * 4);
      const yj: i32 = load<i32>(OFFSET_POS_Y + j * 4);

      const dx: i32 = xj - xi;
      const dy: i32 = yj - yi;

      // fast reject: squared distance ≥ R²
      const d2: i64 = <i64>dx * <i64>dx + <i64>dy * <i64>dy;
      if (d2 >= R2 || d2 == 0) continue;

      const d: i32 = approxDist(dx, dy);
      const overlap: i32 = radius_m - d;
      if (overlap <= 0) continue;

      // strength = overlap / radius, clamped to [0, SCALE_Q]
      const strengthQ: i32 = clampQ(
        (overlap * SCALE_Q) / radius_m,
        0, SCALE_Q
      );

      // ax = dx × repelAccel × strengthQ / (max(1, d) × SCALE_Q)
      // uses i64 to avoid intermediate overflow
      const denom: i64 = <i64>max(1, d) * <i64>SCALE_Q;
      const ax: i32 = <i32>((<i64>dx * <i64>repelAccel_mps2 * <i64>strengthQ) / denom);
      const ay: i32 = <i32>((<i64>dy * <i64>repelAccel_mps2 * <i64>strengthQ) / denom);

      // entity i: push away (−ax, −ay)
      store<i32>(OFFSET_DV_X + i * 4, load<i32>(OFFSET_DV_X + i * 4) - ax);
      store<i32>(OFFSET_DV_Y + i * 4, load<i32>(OFFSET_DV_Y + i * 4) - ay);
      // entity j: push away (+ax, +ay)
      store<i32>(OFFSET_DV_X + j * 4, load<i32>(OFFSET_DV_X + j * 4) + ax);
      store<i32>(OFFSET_DV_Y + j * 4, load<i32>(OFFSET_DV_Y + j * 4) + ay);
    }
  }
}
