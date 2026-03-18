import { Q, SCALE, clampQ, mulDiv, qMul } from "./units.js";

// half of SCALE.Q — the natural boundary of triSym output
const HALF_Q = SCALE.Q >>> 1;

export interface RngLike {
  q01(): Q; // 0..SCALE.Q-1
}

export function tri01(rng: RngLike): Q {
  const u = rng.q01();
  const v = rng.q01();
  return (u + v) >>> 1;
}

export function triSym(rng: RngLike): Q {
  return (tri01(rng) - (SCALE.Q >>> 1)) as Q;
}

export function mulFromVariation(variationSym: Q, amplitude: Q): Q {
  const delta = mulDiv(variationSym, amplitude, SCALE.Q);
  return clampQ((SCALE.Q + delta) as Q, 0, 3 * SCALE.Q);
}

/**
 * Symmetric triangular sample shifted by `bias × 0.5` of half-range, then
 * clamped back to the natural triSym bounds `[−SCALE.Q/2, SCALE.Q/2]`.
 *
 * `bias` ∈ [−1, 1]:
 *   +1 strongly skews toward high-end attribute values
 *   −1 strongly skews toward low-end attribute values
 *    0 is identical to an unbiased `triSym(rng)` call
 *
 * Used by `generateIndividual` to implement `NarrativeBias`.
 */
export function biasedTriSym(rng: RngLike, bias: number): Q {
  const raw = triSym(rng);
  if (bias === 0) return raw;
  const shift = Math.round(bias * HALF_Q * 0.5);
  return Math.max(-HALF_Q, Math.min(HALF_Q, raw + shift)) as Q;
}

export function skewUp(mult: Q, steps: number): Q {
  let out = mult;
  for (let i = 0; i < steps; i++) out = qMul(out, mult);
  return (SCALE.Q + ((out - SCALE.Q) >>> 1)) as Q;
}
