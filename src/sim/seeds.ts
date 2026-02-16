export function eventSeed(worldSeed: number, tick: number, aId: number, bId: number, salt: number): number {
  let x = (worldSeed ^ (tick * 0x9E3779B1) ^ (aId * 0x85EBCA77) ^ (bId * 0xC2B2AE3D) ^ salt) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7FEB352D) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x846CA68B) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}