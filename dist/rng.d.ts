export type U32 = number;
export declare function splitmix32(seed: U32): () => U32;
export declare function sfc32(a: U32, b: U32, c: U32, d: U32): {
    nextU32: () => number;
};
export declare function makeRng(seed: U32, scaleQ: number): {
    u32: () => number;
    q01: () => number;
};
