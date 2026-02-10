import { Q } from "./units";
export interface RngLike {
    q01(): Q;
}
export declare function tri01(rng: RngLike): Q;
export declare function triSym(rng: RngLike): Q;
export declare function mulFromVariation(variationSym: Q, amplitude: Q): Q;
export declare function skewUp(mult: Q, steps: number): Q;
