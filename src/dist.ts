import { Q, SCALE, clampQ, mulDiv, qMul } from "./units";

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
  const delta = mulDiv(variationSym as number, amplitude as number, SCALE.Q);
  return clampQ((SCALE.Q + delta) as Q, 0, 3 * SCALE.Q);
}

export function skewUp(mult: Q, steps: number): Q {
  let out = mult;
  for (let i = 0; i < steps; i++) out = qMul(out, mult);
  return (SCALE.Q + ((out - SCALE.Q) >>> 1)) as Q;
}
