// test/as/push.wasm.test.ts — CE-5 Phase 2: verify as/push.wasm pair-repulsion
//
// Requires WASM to be built first:  npm run build:wasm:push
// Run standalone:                   npm run test:wasm
// Auto-skipped when dist/as/push.wasm is absent.
//
// Canonical kernel values (from src/sim/kernel.ts):
//   personalRadius_m  = Math.trunc(0.45 * SCALE.m) = 4500
//   repelAccel_mps2   = Math.trunc(1.5  * SCALE.mps2) = 15000

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface PushExports {
  // constants
  MAX_ENTITIES:  WebAssembly.Global;
  OFFSET_POS_X:  WebAssembly.Global;
  OFFSET_POS_Y:  WebAssembly.Global;
  OFFSET_ALIVE:  WebAssembly.Global;
  OFFSET_DV_X:   WebAssembly.Global;
  OFFSET_DV_Y:   WebAssembly.Global;
  // functions
  writeEntity:         (slot: number, posX: number, posY: number, alive: number) => void;
  readDvX:             (slot: number) => number;
  readDvY:             (slot: number) => number;
  approxDist:          (dx: number, dy: number) => number;
  stepRepulsionPairs:  (n: number, radius_m: number, repelAccel_mps2: number) => void;
  // WASM memory
  memory: WebAssembly.Memory;
}

const WASM_PATH = fileURLToPath(new URL("../../dist/as/push.wasm", import.meta.url));
const wasmAvailable = existsSync(WASM_PATH);

// Canonical kernel defaults
const RADIUS   = 4500;   // Math.trunc(0.45 * SCALE.m)
const REPEL    = 15000;  // Math.trunc(1.5  * SCALE.mps2)
const SCALE_Q  = 10_000;

/** Reference implementation (mirrors TypeScript source). */
function refApproxDist(dx: number, dy: number): number {
  const adx = dx < 0 ? -dx : dx;
  const ady = dy < 0 ? -dy : dy;
  return adx > ady ? adx + (ady >> 1) : ady + (adx >> 1);
}

function refRepulsion(dx: number, dy: number, radius: number, repelAccel: number) {
  const R2 = BigInt(radius) ** 2n;
  const d2 = BigInt(dx) * BigInt(dx) + BigInt(dy) * BigInt(dy);
  if (d2 >= R2 || d2 === 0n) return null;
  const d = refApproxDist(dx, dy);
  const overlap = radius - d;
  if (overlap <= 0) return null;
  const strengthQ = Math.max(0, Math.min(SCALE_Q, Math.trunc(overlap * SCALE_Q / radius)));
  const denom = BigInt(Math.max(1, d)) * BigInt(SCALE_Q);
  const ax = Number(BigInt(dx) * BigInt(repelAccel) * BigInt(strengthQ) / denom);
  const ay = Number(BigInt(dy) * BigInt(repelAccel) * BigInt(strengthQ) / denom);
  return { ax, ay };
}

describe.skipIf(!wasmAvailable)("AS push.wasm vs TypeScript reference", () => {
  let ex: PushExports;

  beforeAll(async () => {
    const buffer = readFileSync(WASM_PATH);
    const result = await WebAssembly.instantiate(buffer);
    ex = result.instance.exports as unknown as PushExports;
  });

  // ── Constants ──────────────────────────────────────────────────────────────

  it("MAX_ENTITIES == 256", () => {
    expect(ex.MAX_ENTITIES.value).toBe(256);
  });

  it("memory layout offsets are non-overlapping multiples of 1024", () => {
    const stride = 256 * 4; // 1024 bytes
    expect(ex.OFFSET_POS_X.value).toBe(0);
    expect(ex.OFFSET_POS_Y.value).toBe(stride);
    expect(ex.OFFSET_ALIVE.value).toBe(stride * 2);
    expect(ex.OFFSET_DV_X.value).toBe(stride * 3);
    expect(ex.OFFSET_DV_Y.value).toBe(stride * 4);
  });

  // ── approxDist() ──────────────────────────────────────────────────────────

  it("approxDist — purely horizontal", () => {
    expect(ex.approxDist(3000, 0)).toBe(refApproxDist(3000, 0));   // 3000
    expect(ex.approxDist(-3000, 0)).toBe(refApproxDist(-3000, 0)); // 3000
  });

  it("approxDist — purely vertical", () => {
    expect(ex.approxDist(0, 4000)).toBe(refApproxDist(0, 4000));   // 4000
    expect(ex.approxDist(0, -4000)).toBe(refApproxDist(0, -4000)); // 4000
  });

  it("approxDist — diagonal (equal components)", () => {
    // adx == ady: ady + (adx >> 1)  →  3000 + 1500 = 4500
    expect(ex.approxDist(3000, 3000)).toBe(refApproxDist(3000, 3000)); // 4500
  });

  it("approxDist — mixed signs", () => {
    expect(ex.approxDist(-3000, 2000)).toBe(refApproxDist(-3000, 2000)); // 4000
    expect(ex.approxDist(2000, -3000)).toBe(refApproxDist(2000, -3000)); // 3500 actually 3000+1000=4000? let me check: adx=2000,ady=3000: ady>adx → 3000+(2000>>1)=3000+1000=4000
  });

  it("approxDist matches TS for representative inputs", () => {
    const inputs: [number, number][] = [
      [100, 0], [0, 100], [3000, 4000], [4500, 0], [2121, 2121], [4000, 100],
    ];
    for (const [dx, dy] of inputs) {
      expect(ex.approxDist(dx, dy)).toBe(refApproxDist(dx, dy));
    }
  });

  // ── stepRepulsionPairs — two-entity cases ─────────────────────────────────

  it("no repulsion when entities are outside radius", () => {
    ex.writeEntity(0, 0,    0, 1);
    ex.writeEntity(1, 5000, 0, 1); // 5000 > 4500
    ex.stepRepulsionPairs(2, RADIUS, REPEL);
    expect(ex.readDvX(0)).toBe(0);
    expect(ex.readDvY(0)).toBe(0);
    expect(ex.readDvX(1)).toBe(0);
    expect(ex.readDvY(1)).toBe(0);
  });

  it("no repulsion when one entity is dead", () => {
    ex.writeEntity(0, 0,    0, 1); // alive
    ex.writeEntity(1, 3000, 0, 0); // dead
    ex.stepRepulsionPairs(2, RADIUS, REPEL);
    expect(ex.readDvX(0)).toBe(0);
    expect(ex.readDvX(1)).toBe(0);
  });

  it("equal-and-opposite dv for horizontal pair (3000 apart)", () => {
    // Expected: ax=4999, ay=0  (from refRepulsion)
    ex.writeEntity(0, 0,    0, 1);
    ex.writeEntity(1, 3000, 0, 1);
    ex.stepRepulsionPairs(2, RADIUS, REPEL);
    const ref = refRepulsion(3000, 0, RADIUS, REPEL)!;
    expect(ex.readDvX(0)).toBe(-ref.ax); // pushed left
    expect(ex.readDvY(0)).toBe(0);       // no y component (horizontal)
    expect(ex.readDvX(1)).toBe(ref.ax);  // pushed right
    expect(ex.readDvY(1)).toBe(0);
  });

  it("equal-and-opposite dv for near-overlap pair (100 apart)", () => {
    // Expected: ax=14665  (high strength, entities almost coincident)
    ex.writeEntity(0, 0,   0, 1);
    ex.writeEntity(1, 100, 0, 1);
    ex.stepRepulsionPairs(2, RADIUS, REPEL);
    const ref = refRepulsion(100, 0, RADIUS, REPEL)!;
    expect(ex.readDvX(0)).toBe(-ref.ax);
    expect(ex.readDvY(0)).toBe(0);
    expect(ex.readDvX(1)).toBe(ref.ax);
    expect(ex.readDvY(1)).toBe(0);
  });

  it("diagonal pair: repulsion has both x and y components", () => {
    // Entity 1 at (2000, 2000); d = approxDist(2000,2000) = 3000; within radius
    // Expected ax=3333, ay=3333
    ex.writeEntity(0, 0,    0,    1);
    ex.writeEntity(1, 2000, 2000, 1);
    ex.stepRepulsionPairs(2, RADIUS, REPEL);
    const ref = refRepulsion(2000, 2000, RADIUS, REPEL)!;
    expect(ex.readDvX(0)).toBe(-ref.ax);
    expect(ex.readDvY(0)).toBe(-ref.ay);
    expect(ex.readDvX(1)).toBe(ref.ax);
    expect(ex.readDvY(1)).toBe(ref.ay);
  });

  it("dv is cleared between successive calls", () => {
    ex.writeEntity(0, 0,    0, 1);
    ex.writeEntity(1, 3000, 0, 1);
    ex.stepRepulsionPairs(2, RADIUS, REPEL);
    // Second call — entities now far apart
    ex.writeEntity(0, 0,     0, 1);
    ex.writeEntity(1, 10000, 0, 1);
    ex.stepRepulsionPairs(2, RADIUS, REPEL);
    expect(ex.readDvX(0)).toBe(0); // was non-zero after first call, must be cleared
    expect(ex.readDvX(1)).toBe(0);
  });

  // ── Three-entity symmetry test ─────────────────────────────────────────────

  it("three entities in a line: middle entity balanced, outer entities pushed out", () => {
    // A at −3000, B at 0, C at +3000  (all 3000 apart, within radius)
    // A-B and B-C pairs overlap; A-C distance = 6000 > radius = no repulsion
    ex.writeEntity(0, -3000, 0, 1);
    ex.writeEntity(1,     0, 0, 1);
    ex.writeEntity(2,  3000, 0, 1);
    ex.stepRepulsionPairs(3, RADIUS, REPEL);

    const ref = refRepulsion(3000, 0, RADIUS, REPEL)!; // ax=4999 for each adjacent pair

    // A (entity 0) pushed left by B
    expect(ex.readDvX(0)).toBe(-ref.ax);
    expect(ex.readDvY(0)).toBe(0);

    // B (entity 1) pushed right by A (+ref.ax) and left by C (-ref.ax) → net 0
    expect(ex.readDvX(1)).toBe(0);
    expect(ex.readDvY(1)).toBe(0);

    // C (entity 2) pushed right by B
    expect(ex.readDvX(2)).toBe(ref.ax);
    expect(ex.readDvY(2)).toBe(0);
  });

  it("three entities: one dead, only alive pair repels", () => {
    ex.writeEntity(0, -3000, 0, 1); // alive
    ex.writeEntity(1,     0, 0, 0); // dead — no repulsion from/to
    ex.writeEntity(2,  3000, 0, 1); // alive
    ex.stepRepulsionPairs(3, RADIUS, REPEL);

    // Entity 0 and 2 are 6000 apart — outside radius — no repulsion
    expect(ex.readDvX(0)).toBe(0);
    expect(ex.readDvX(1)).toBe(0);
    expect(ex.readDvX(2)).toBe(0);
  });
});
