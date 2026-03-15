export function eventSeed(worldSeed: number, tick: number, aId: number, bId: number, salt: number): number {
  let x = (worldSeed ^ (tick * 0x9E3779B1) ^ (aId * 0x85EBCA77) ^ (bId * 0xC2B2AE3D) ^ salt) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7FEB352D) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x846CA68B) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

/** Deterministic hash of a string to a number (simple sum of char codes). */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h += s.charCodeAt(i);
  return h;
}