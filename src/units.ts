export type I32 = number; // int32-safe number
export type Q = number;   // dimensionless scalar, SCALE.Q == 1.0

export const SCALE = {
  Q: 10_000,    // 1.0 == 10000
  m: 10_000,    // 0.1 mm
  s: 10_000,    // 0.1 ms
  kg: 1_000,    // 1 g
  N: 100,       // 0.01 N
  W: 1,         // 1 W
  J: 1,         // 1 J
  mps: 10_000,  // 0.1 mm/s
  mps2: 10_000, // 0.1 mm/s^2
};

export const G_mps2: I32 = Math.round(9.80665 * SCALE.mps2);

export const q = (x: number): Q => Math.round(x * SCALE.Q);
export const clampQ = (x: Q, lo: number = 0, hi: number = SCALE.Q): Q =>
  Math.max(lo, Math.min(hi, x));

export const qMul = (a: Q, b: Q): Q => Math.trunc((a * b) / SCALE.Q);
export const qDiv = (a: Q, b: Q): Q => Math.trunc((a * SCALE.Q) / b);

export const mulDiv = (a: I32, b: I32, div: I32): I32 =>
  Number((BigInt(a) * BigInt(b)) / BigInt(div));

export const to = {
  m: (x: number): I32 => Math.round(x * SCALE.m),
  s: (x: number): I32 => Math.round(x * SCALE.s),
  kg: (x: number): I32 => Math.round(x * SCALE.kg),
  N: (x: number): I32 => Math.round(x * SCALE.N),
  W: (x: number): I32 => Math.round(x * SCALE.W),
  J: (x: number): I32 => Math.round(x * SCALE.J),
  mps: (x: number): I32 => Math.round(x * SCALE.mps),
  mps2: (x: number): I32 => Math.round(x * SCALE.mps2),
};

export const from = {
  m: (x: I32): number => x / SCALE.m,
  s: (x: I32): number => x / SCALE.s,
  kg: (x: I32): number => x / SCALE.kg,
  N: (x: I32): number => x / SCALE.N,
  W: (x: I32): number => x / SCALE.W,
  J: (x: I32): number => x / SCALE.J,
  mps: (x: I32): number => x / SCALE.mps,
  mps2: (x: I32): number => x / SCALE.mps2,
};

// Deterministic integer roots for Q-scaled values
export const sqrtQ = (xQ: Q): Q => {
  const x = BigInt(Math.max(1, xQ));
  const X = x * BigInt(SCALE.Q);
  let r = BigInt(SCALE.Q);
  for (let i = 0; i < 10; i++) {
    const rNew = (r + X / r) / 2n;
    if (rNew === r) break;  // Converged
    r = rNew;
  }
  return Number(r);
};

export const cbrtQ = (xQ: Q): Q => {
  const x = BigInt(Math.max(1, xQ));
  const X = x * BigInt(SCALE.Q) * BigInt(SCALE.Q);
  let r = BigInt(SCALE.Q);
  for (let i = 0; i < 12; i++) {
    const r2 = r * r;
    r = (2n * r + X / r2) / 3n;
    if (r <= 0n) {
      r = 1n;
      break;
    }
  }
  return Number(r);
};
