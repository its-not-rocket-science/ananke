export const SCALE = {
    Q: 10_000, // 1.0 == 10000
    m: 10_000, // 0.1 mm
    s: 10_000, // 0.1 ms
    kg: 1_000, // 1 g
    N: 100, // 0.01 N
    W: 1, // 1 W
    J: 1, // 1 J
    mps: 10_000, // 0.1 mm/s
    mps2: 10_000, // 0.1 mm/s^2
};
export const G_mps2 = Math.round(9.80665 * SCALE.mps2);
export const q = (x) => Math.round(x * SCALE.Q);
export const clampQ = (x, lo = 0, hi = SCALE.Q) => Math.max(lo, Math.min(hi, x));
export const qMul = (a, b) => Math.trunc((a * b) / SCALE.Q);
export const qDiv = (a, b) => Math.trunc((a * SCALE.Q) / b);
export const mulDiv = (a, b, div) => Number((BigInt(a) * BigInt(b)) / BigInt(div));
export const to = {
    m: (x) => Math.round(x * SCALE.m),
    s: (x) => Math.round(x * SCALE.s),
    kg: (x) => Math.round(x * SCALE.kg),
    N: (x) => Math.round(x * SCALE.N),
    W: (x) => Math.round(x * SCALE.W),
    J: (x) => Math.round(x * SCALE.J),
    mps: (x) => Math.round(x * SCALE.mps),
    mps2: (x) => Math.round(x * SCALE.mps2),
};
export const from = {
    m: (x) => x / SCALE.m,
    s: (x) => x / SCALE.s,
    kg: (x) => x / SCALE.kg,
    N: (x) => x / SCALE.N,
    W: (x) => x / SCALE.W,
    J: (x) => x / SCALE.J,
    mps: (x) => x / SCALE.mps,
    mps2: (x) => x / SCALE.mps2,
};
// Deterministic integer roots for Q-scaled values
export const sqrtQ = (xQ) => {
    const x = BigInt(Math.max(1, xQ));
    const X = x * BigInt(SCALE.Q);
    let r = BigInt(SCALE.Q);
    for (let i = 0; i < 10; i++)
        r = (r + X / r) / 2n;
    return Number(r);
};
export const cbrtQ = (xQ) => {
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
