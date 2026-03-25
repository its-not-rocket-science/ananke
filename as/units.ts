// as/units.ts — AssemblyScript port of src/units.ts
// Compile with: npm run build:wasm
// All arithmetic is integer-only; f64 used only for to_* / from_* conversion helpers.

// ── Scale constants ─────────────────────────────────────────────────────────

export const SCALE_Q: i32 = 10_000;   // 1.0 == 10000
export const SCALE_m: i32 = 10_000;   // 0.1 mm
export const SCALE_s: i32 = 10_000;   // 0.1 ms
export const SCALE_kg: i32 = 1_000;   // 1 g
export const SCALE_N: i32 = 100;      // 0.01 N
export const SCALE_W: i32 = 1;        // 1 W
export const SCALE_J: i32 = 1;        // 1 J
export const SCALE_mps: i32 = 10_000; // 0.1 mm/s
export const SCALE_mps2: i32 = 10_000;// 0.1 mm/s²

// G = 9.80665 m/s² → Math.round(9.80665 × 10000) = 98067
export const G_mps2: i32 = 98067;

// ── Fixed-point helpers ──────────────────────────────────────────────────────

/** Convert a dimensionless fraction to Q (rounds to nearest). */
export function q(x: f64): i32 {
  return <i32>Math.round(x * 10000.0);
}

/** Clamp x to [lo, hi] in Q space. */
export function clampQ(x: i32, lo: i32, hi: i32): i32 {
  return max(lo, min(hi, x));
}

/** Q × Q → Q  (truncates toward zero, same as Math.trunc in JS). */
export function qMul(a: i32, b: i32): i32 {
  return <i32>((<i64>a * <i64>b) / 10000);
}

/** (a / b) in Q space — a × SCALE_Q / b, truncated. */
export function qDiv(a: i32, b: i32): i32 {
  return <i32>((<i64>a * 10000) / <i64>b);
}

/** a × b / div — overflow-safe via i64; mirrors BigInt path in TS source. */
export function mulDiv(a: i32, b: i32, div: i32): i32 {
  return <i32>((<i64>a * <i64>b) / <i64>div);
}

// ── to.* — SI value → scaled integer ────────────────────────────────────────

export function to_m(x: f64): i32    { return <i32>Math.round(x * 10000.0); }
export function to_s(x: f64): i32    { return <i32>Math.round(x * 10000.0); }
export function to_kg(x: f64): i32   { return <i32>Math.round(x * 1000.0);  }
export function to_N(x: f64): i32    { return <i32>Math.round(x * 100.0);   }
export function to_W(x: f64): i32    { return <i32>Math.round(x);            }
export function to_J(x: f64): i32    { return <i32>Math.round(x);            }
export function to_mps(x: f64): i32  { return <i32>Math.round(x * 10000.0); }
export function to_mps2(x: f64): i32 { return <i32>Math.round(x * 10000.0); }

// ── from.* — scaled integer → SI value ──────────────────────────────────────

export function from_m(x: i32): f64    { return <f64>x / 10000.0; }
export function from_s(x: i32): f64    { return <f64>x / 10000.0; }
export function from_kg(x: i32): f64   { return <f64>x / 1000.0;  }
export function from_N(x: i32): f64    { return <f64>x / 100.0;   }
export function from_W(x: i32): f64    { return <f64>x;            }
export function from_J(x: i32): f64    { return <f64>x;            }
export function from_mps(x: i32): f64  { return <f64>x / 10000.0; }
export function from_mps2(x: i32): f64 { return <f64>x / 10000.0; }

// ── Integer square root (Newton-Raphson, i64) ────────────────────────────────

/**
 * sqrt(xQ) in Q space.  Input and output are Q-scaled integers.
 * sqrtQ(q(1.0)) == q(1.0), sqrtQ(q(0.25)) == q(0.5).
 * Mirrors the BigInt Newton loop in src/units.ts.
 */
export function sqrtQ(xQ: i32): i32 {
  const x: i64 = <i64>max(1, xQ);
  const X: i64 = x * 10000;
  let r: i64 = 10000;
  for (let i = 0; i < 10; i++) {
    const rNew: i64 = (r + X / r) / 2;
    if (rNew == r) break;
    r = rNew;
  }
  return <i32>r;
}

// ── Integer cube root (Newton-Raphson, i64) ──────────────────────────────────

/**
 * cbrt(xQ) in Q space.  Input and output are Q-scaled integers.
 * cbrtQ(q(1.0)) == q(1.0), cbrtQ(q(0.125)) ≈ q(0.5).
 * Mirrors the BigInt Newton loop in src/units.ts.
 */
export function cbrtQ(xQ: i32): i32 {
  const x: i64 = <i64>max(1, xQ);
  const X: i64 = x * 10000 * 10000;
  let r: i64 = 10000;
  for (let i = 0; i < 12; i++) {
    const r2: i64 = r * r;
    r = (2 * r + X / r2) / 3;
    if (r <= 0) {
      r = 1;
      break;
    }
  }
  return <i32>r;
}
