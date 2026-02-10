import { SCALE, clampQ, mulDiv, qMul } from "./units";
export function tri01(rng) {
    const u = rng.q01();
    const v = rng.q01();
    return (u + v) >>> 1;
}
export function triSym(rng) {
    return (tri01(rng) - (SCALE.Q >>> 1));
}
export function mulFromVariation(variationSym, amplitude) {
    const delta = mulDiv(variationSym, amplitude, SCALE.Q);
    return clampQ((SCALE.Q + delta), 0, 3 * SCALE.Q);
}
export function skewUp(mult, steps) {
    let out = mult;
    for (let i = 0; i < steps; i++)
        out = qMul(out, mult);
    return (SCALE.Q + ((out - SCALE.Q) >>> 1));
}
