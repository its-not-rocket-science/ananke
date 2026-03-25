// test/as/units.wasm.test.ts — CE-5: verify AssemblyScript units.wasm matches TS reference
//
// Requires WASM to be built first:  npm run build:wasm
// Run standalone:                   npm run test:wasm
// Auto-skipped in normal test runs when dist/as/units.wasm does not yet exist.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { q, clampQ, qMul, qDiv, mulDiv, sqrtQ, cbrtQ, SCALE } from "../../src/units.js";

interface WasmExports {
  q:       (x: number) => number;
  clampQ:  (x: number, lo: number, hi: number) => number;
  qMul:    (a: number, b: number) => number;
  qDiv:    (a: number, b: number) => number;
  mulDiv:  (a: number, b: number, div: number) => number;
  sqrtQ:   (xQ: number) => number;
  cbrtQ:   (xQ: number) => number;
  to_m:    (x: number) => number;
  to_kg:   (x: number) => number;
  from_m:  (x: number) => number;
  from_kg: (x: number) => number;
  SCALE_Q: WebAssembly.Global;
  G_mps2:  WebAssembly.Global;
}

const WASM_PATH = fileURLToPath(new URL("../../dist/as/units.wasm", import.meta.url));
const wasmAvailable = existsSync(WASM_PATH);

describe.skipIf(!wasmAvailable)("AS units.wasm vs TypeScript reference", () => {
  let ex: WasmExports;

  beforeAll(async () => {
    const buffer = readFileSync(WASM_PATH);
    const result = await WebAssembly.instantiate(buffer);
    ex = result.instance.exports as unknown as WasmExports;
  });

  // ── Constants ──────────────────────────────────────────────────────────────

  it("SCALE_Q global == 10000", () => {
    expect(ex.SCALE_Q.value).toBe(SCALE.Q);
  });

  it("G_mps2 global == Math.round(9.80665 * SCALE.mps2)", () => {
    expect(ex.G_mps2.value).toBe(Math.round(9.80665 * SCALE.mps2));
  });

  // ── q() ───────────────────────────────────────────────────────────────────

  it("q(1.0) == 10000", () => {
    expect(ex.q(1.0)).toBe(q(1.0));
  });

  it("q(0.0) == 0", () => {
    expect(ex.q(0.0)).toBe(q(0.0));
  });

  it("q() matches TS reference for representative values", () => {
    for (const x of [0.1, 0.25, 0.5, 0.42, 0.75, 0.9, 0.99]) {
      expect(ex.q(x)).toBe(q(x));
    }
  });

  // ── clampQ() ──────────────────────────────────────────────────────────────

  it("clampQ — value within range is unchanged", () => {
    expect(ex.clampQ(5000, 0, 10000)).toBe(clampQ(5000, 0, SCALE.Q));
  });

  it("clampQ — below lo is clamped", () => {
    expect(ex.clampQ(-200, 0, 10000)).toBe(0);
  });

  it("clampQ — above hi is clamped", () => {
    expect(ex.clampQ(15000, 0, 10000)).toBe(10000);
  });

  it("clampQ — arbitrary range", () => {
    expect(ex.clampQ(3000, 2000, 8000)).toBe(clampQ(3000, 2000, 8000));
  });

  // ── qMul() ────────────────────────────────────────────────────────────────

  it("qMul(q(0.5), q(0.5)) == q(0.25)", () => {
    expect(ex.qMul(5000, 5000)).toBe(qMul(5000, 5000)); // 2500
  });

  it("qMul(q(1.0), q(1.0)) == q(1.0)", () => {
    expect(ex.qMul(10000, 10000)).toBe(qMul(10000, 10000)); // 10000
  });

  it("qMul — zero operand gives zero", () => {
    expect(ex.qMul(0, 9999)).toBe(0);
  });

  it("qMul matches TS reference for representative pairs", () => {
    const pairs: [number, number][] = [
      [5000, 8000], [1000, 9000], [7500, 4000], [3333, 3333], [10000, 5000],
    ];
    for (const [a, b] of pairs) {
      expect(ex.qMul(a, b)).toBe(qMul(a, b));
    }
  });

  // ── qDiv() ────────────────────────────────────────────────────────────────

  it("qDiv(q(1.0), q(0.5)) == q(2.0)", () => {
    expect(ex.qDiv(10000, 5000)).toBe(qDiv(10000, 5000)); // 20000
  });

  it("qDiv(q(0.5), q(1.0)) == q(0.5)", () => {
    expect(ex.qDiv(5000, 10000)).toBe(qDiv(5000, 10000)); // 5000
  });

  it("qDiv matches TS reference for representative pairs", () => {
    const pairs: [number, number][] = [
      [8000, 4000], [6000, 3000], [1000, 2000], [9000, 10000],
    ];
    for (const [a, b] of pairs) {
      expect(ex.qDiv(a, b)).toBe(qDiv(a, b));
    }
  });

  // ── mulDiv() ──────────────────────────────────────────────────────────────

  it("mulDiv — basic case matches TS", () => {
    expect(ex.mulDiv(50000, 20000, 10000)).toBe(mulDiv(50000, 20000, 10000));
  });

  it("mulDiv — handles values that would overflow i32 before dividing", () => {
    // 1 000 000 × 1 000 000 = 10^12 — exceeds i32 range; needs i64 path
    const a = 1_000_000, b = 1_000_000, d = 100_000;
    expect(ex.mulDiv(a, b, d)).toBe(mulDiv(a, b, d));
  });

  it("mulDiv matches TS for kernel-typical values (mass × accel / scale)", () => {
    // 450 kg × 98067 mps2 / 1000 (kg scale) — horse weight
    expect(ex.mulDiv(450_000, 98067, 1_000)).toBe(mulDiv(450_000, 98067, 1_000));
  });

  // ── sqrtQ() ───────────────────────────────────────────────────────────────

  it("sqrtQ(q(1.0)) == q(1.0)", () => {
    expect(ex.sqrtQ(10000)).toBe(sqrtQ(10000)); // 10000
  });

  it("sqrtQ(q(0.25)) == q(0.5)", () => {
    expect(ex.sqrtQ(2500)).toBe(sqrtQ(2500)); // 5000
  });

  it("sqrtQ(q(0.09)) == q(0.3)", () => {
    expect(ex.sqrtQ(900)).toBe(sqrtQ(900)); // 3000
  });

  it("sqrtQ(q(0.01)) ≈ q(0.1)", () => {
    expect(ex.sqrtQ(100)).toBe(sqrtQ(100)); // 1000
  });

  it("sqrtQ matches TS reference for representative values", () => {
    for (const xQ of [1, 100, 625, 2500, 4000, 7500, 10000]) {
      expect(ex.sqrtQ(xQ)).toBe(sqrtQ(xQ));
    }
  });

  // ── cbrtQ() ───────────────────────────────────────────────────────────────

  it("cbrtQ(q(1.0)) == q(1.0)", () => {
    expect(ex.cbrtQ(10000)).toBe(cbrtQ(10000)); // 10000
  });

  it("cbrtQ(q(0.125)) ≈ q(0.5)", () => {
    expect(ex.cbrtQ(1250)).toBe(cbrtQ(1250)); // ~5000
  });

  it("cbrtQ matches TS reference for representative values", () => {
    for (const xQ of [1, 100, 1250, 2000, 5000, 10000]) {
      expect(ex.cbrtQ(xQ)).toBe(cbrtQ(xQ));
    }
  });

  // ── to_* / from_* ─────────────────────────────────────────────────────────

  it("to_m(1.5) == 15000", () => {
    expect(ex.to_m(1.5)).toBe(15000);
  });

  it("to_kg(75.0) == 75000", () => {
    expect(ex.to_kg(75.0)).toBe(75000);
  });

  it("from_m(15000) == 1.5", () => {
    expect(ex.from_m(15000)).toBeCloseTo(1.5, 6);
  });

  it("from_kg(75000) == 75.0", () => {
    expect(ex.from_kg(75000)).toBeCloseTo(75.0, 6);
  });
});
