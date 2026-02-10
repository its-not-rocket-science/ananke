const u32 = (x) => (x >>> 0);
export function splitmix32(seed) {
    let x = u32(seed);
    return () => {
        x = u32(x + 0x9E3779B9);
        let z = x;
        z = u32((z ^ (z >>> 16)) * 0x85EBCA6B);
        z = u32((z ^ (z >>> 13)) * 0xC2B2AE35);
        z = u32(z ^ (z >>> 16));
        return z;
    };
}
export function sfc32(a, b, c, d) {
    let A = u32(a), B = u32(b), C = u32(c), D = u32(d);
    const nextU32 = () => {
        const t = u32(A + B);
        A = u32(B ^ (B >>> 9));
        B = u32(C + (C << 3));
        C = u32((C << 21) | (C >>> 11));
        D = u32(D + 1);
        const out = u32(t + D);
        C = u32(C + out);
        return out;
    };
    return { nextU32 };
}
export function makeRng(seed, scaleQ) {
    const sm = splitmix32(seed);
    const r = sfc32(sm(), sm(), sm(), sm());
    return {
        u32: r.nextU32,
        q01: () => {
            const x = r.nextU32();
            return Math.trunc((x / 0x1_0000_0000) * scaleQ);
        },
    };
}
