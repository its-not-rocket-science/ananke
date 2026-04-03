import type { WorldState } from "../sim/world.js";
import { normalizeWorldInPlace } from "../sim/normalization.js";
import { applyDiff, diffWorldState, type WorldStateDiff } from "../snapshot.js";

const FORMAT_VERSION = 2;
const MAGIC = 0x414e4b57; // ANKW
const FLAG_INCREMENTAL = 1 << 0;
const FLAG_RLE = 1 << 1;

interface SnapshotEnvelopeV2 {
  version: 2;
  timestampMs: number;
  seed: number;
  baseTick: number;
  isIncremental: boolean;
  codec: "raw" | "rle";
  world: WorldState | WorldStateDiff;
}

interface SnapshotEnvelopeV1 {
  version: 1;
  timestampMs: number;
  seed: number;
  world: WorldState;
}

const previousBySeed = new Map<number, WorldState>();

const MAP_MARKER = "__ananke_map__";

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return { [MAP_MARKER]: true, entries: [...value.entries()] };
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && (value as Record<string, unknown>)[MAP_MARKER] === true) {
    return new Map((value as { entries: Array<[unknown, unknown]> }).entries);
  }
  return value;
}

function fnv1a32(data: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function encodeU64(v: number): [number, number] {
  const bi = BigInt(Math.max(0, Math.floor(v)));
  return [Number(bi & 0xffffffffn), Number((bi >> 32n) & 0xffffffffn)];
}

function decodeU64(lo: number, hi: number): number {
  return Number((BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0));
}

function compressRLE(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const value = bytes[i]!;
    let run = 1;
    while (i + run < bytes.length && bytes[i + run] === value && run < 255) run++;
    out.push(run, value);
    i += run;
  }
  return Uint8Array.from(out);
}

function decompressRLE(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const run = bytes[i]!;
    const value = bytes[i + 1]!;
    for (let j = 0; j < run; j++) out.push(value);
  }
  return Uint8Array.from(out);
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value, replacer));
}

function decodeJson<T>(bytes: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(bytes), reviver) as T;
}

function buildEnvelope(world: WorldState): SnapshotEnvelopeV2 {
  const prev = previousBySeed.get(world.seed);
  if (!prev) {
    const full: SnapshotEnvelopeV2 = {
      version: 2,
      timestampMs: Date.now(),
      seed: world.seed,
      baseTick: world.tick,
      isIncremental: false,
      codec: "raw",
      world: structuredClone(world),
    };
    previousBySeed.set(world.seed, structuredClone(world));
    return full;
  }

  const diff = diffWorldState(prev, world);
  previousBySeed.set(world.seed, structuredClone(world));

  return {
    version: 2,
    timestampMs: Date.now(),
    seed: world.seed,
    baseTick: prev.tick,
    isIncremental: true,
    codec: "rle",
    world: diff,
  };
}

export function resetSerializationStream(seed?: number): void {
  if (seed === undefined) {
    previousBySeed.clear();
    return;
  }
  previousBySeed.delete(seed);
}

export function exportWorldState(world: WorldState): Uint8Array {
  const envelope = buildEnvelope(world);
  const payload = encodeJson(envelope);
  const compressed = envelope.codec === "rle" ? compressRLE(payload) : payload;

  const total = 4 + 4 + 4 + 4 + 4 + 4 + 4 + compressed.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let off = 0;
  view.setUint32(off, MAGIC, true); off += 4;
  view.setUint32(off, FORMAT_VERSION, true); off += 4;
  const [tsLo, tsHi] = encodeU64(envelope.timestampMs);
  view.setUint32(off, tsLo, true); off += 4;
  view.setUint32(off, tsHi, true); off += 4;
  const checksum = fnv1a32(compressed);
  view.setUint32(off, checksum, true); off += 4;
  const flags = (envelope.isIncremental ? FLAG_INCREMENTAL : 0) | (envelope.codec === "rle" ? FLAG_RLE : 0);
  view.setUint32(off, flags, true); off += 4;
  view.setUint32(off, compressed.length, true); off += 4;
  out.set(compressed, off);
  return out;
}

function migrateV1ToV2(env: SnapshotEnvelopeV1): SnapshotEnvelopeV2 {
  return {
    version: 2,
    timestampMs: env.timestampMs,
    seed: env.seed,
    baseTick: env.world.tick,
    isIncremental: false,
    codec: "raw",
    world: env.world,
  };
}

export function importWorldState(data: Uint8Array): WorldState {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let off = 0;
  const magic = view.getUint32(off, true); off += 4;
  if (magic !== MAGIC) throw new Error(`serialization: bad magic 0x${magic.toString(16)}`);

  const version = view.getUint32(off, true); off += 4;
  const tsLo = view.getUint32(off, true); off += 4;
  const tsHi = view.getUint32(off, true); off += 4;
  const timestampMs = decodeU64(tsLo, tsHi);
  const checksum = view.getUint32(off, true); off += 4;
  const flags = view.getUint32(off, true); off += 4;
  const payloadLength = view.getUint32(off, true); off += 4;
  const payload = new Uint8Array(data.buffer, data.byteOffset + off, payloadLength);

  if (fnv1a32(payload) !== checksum) {
    throw new Error("serialization: checksum mismatch");
  }

  const isRle = (flags & FLAG_RLE) !== 0;
  const jsonPayload = isRle ? decompressRLE(payload) : payload;

  let envelopeV2: SnapshotEnvelopeV2;
  if (version === 1) {
    const v1 = decodeJson<SnapshotEnvelopeV1>(jsonPayload);
    envelopeV2 = migrateV1ToV2(v1);
  } else if (version === 2) {
    envelopeV2 = decodeJson<SnapshotEnvelopeV2>(jsonPayload);
  } else {
    throw new Error(`serialization: unsupported version ${version}`);
  }

  envelopeV2.timestampMs = timestampMs;

  let world: WorldState;
  if (envelopeV2.isIncremental) {
    const base = previousBySeed.get(envelopeV2.seed);
    if (!base) {
      throw new Error("serialization: incremental snapshot received without base state");
    }
    world = applyDiff(base, envelopeV2.world as WorldStateDiff);
  } else {
    world = normalizeWorldInPlace(structuredClone(envelopeV2.world as WorldState));
  }

  previousBySeed.set(world.seed, structuredClone(world));
  return world;
}
