import type { WorldState } from "../sim/world.js";
import { applyDiff, diffWorldState, type WorldStateDiff } from "../snapshot.js";
import { migrateWorld } from "../schema-migration.js";

const MAGIC = 0x414E4B57; // ANKW
const FORMAT_VERSION = 2;

const COMPRESSION_NONE = 0;
const COMPRESSION_LZ4_WASM = 1;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface SnapshotPayloadV2 {
  schemaVersion: number;
  tick: number;
  full?: unknown;
  incremental?: {
    baseTick: number;
    diff: WorldStateDiff;
  };
}

interface SnapshotPayloadV1 {
  world: unknown;
}

let lastExportedWorld: WorldState | undefined;
let lastImportedWorld: WorldState | undefined;

export function exportWorldState(world: WorldState): Uint8Array {
  const canDiff =
    lastExportedWorld !== undefined &&
    lastExportedWorld.seed === world.seed &&
    world.tick >= lastExportedWorld.tick;

  const payload: SnapshotPayloadV2 = canDiff
    ? {
        schemaVersion: FORMAT_VERSION,
        tick: world.tick,
        incremental: {
          baseTick: lastExportedWorld!.tick,
          diff: diffWorldState(lastExportedWorld!, world),
        },
      }
    : {
        schemaVersion: FORMAT_VERSION,
        tick: world.tick,
        full: worldToSerializable(world),
      };

  const payloadRaw = utf8(JSON.stringify(payload, mapAwareReplacer));
  const { codec, bytes } = compress(payloadRaw);
  const checksum = crc32(bytes);

  const w = new BytesWriter(28 + bytes.length);
  w.u32(MAGIC);
  w.u32(FORMAT_VERSION);
  w.u64(BigInt(Date.now()));
  w.u32(checksum);
  w.u8(codec);
  w.u8(0); // reserved
  w.u16(0); // reserved
  w.u32(bytes.length);
  w.bytes(bytes);

  lastExportedWorld = structuredClone(world);
  return w.finish();
}

export function importWorldState(data: Uint8Array): WorldState {
  const r = new BytesReader(data);
  const magic = r.u32();
  if (magic !== MAGIC) throw new Error("serialization: bad magic");

  const version = r.u32();
  const _ts = r.u64();
  const checksum = r.u32();
  const codec = r.u8();
  r.u8();
  r.u16();
  const payloadLen = r.u32();
  const payloadBytes = r.bytes(payloadLen);

  if (crc32(payloadBytes) !== checksum) {
    throw new Error("serialization: checksum mismatch");
  }

  const payloadRaw = decompress(codec, payloadBytes);
  const payload = JSON.parse(text(payloadRaw), mapAwareReviver) as SnapshotPayloadV2 | SnapshotPayloadV1;

  let world: WorldState;
  if (version === 1) {
    const legacy = payload as SnapshotPayloadV1;
    const candidate = legacy.world as Record<string, unknown>;
    const migrated = typeof candidate["_ananke_version"] === "string" ? migrateWorld(candidate) : candidate;
    world = serializableToWorld(migrated as unknown as WorldState);
  } else if (version === FORMAT_VERSION) {
    const v2 = payload as SnapshotPayloadV2;
    if (v2.full !== undefined) {
      world = serializableToWorld(v2.full as WorldState);
    } else {
      if (!v2.incremental || !lastImportedWorld) {
        throw new Error("serialization: incremental snapshot requires prior base world");
      }
      if (lastImportedWorld.tick !== v2.incremental.baseTick) {
        throw new Error("serialization: incremental base tick mismatch");
      }
      world = applyDiff(lastImportedWorld, v2.incremental.diff);
    }
  } else {
    throw new Error(`serialization: unsupported version ${version}`);
  }

  lastImportedWorld = structuredClone(world);
  return world;
}

export function resetSerializationContext(): void {
  lastExportedWorld = undefined;
  lastImportedWorld = undefined;
}

export function exportLegacyV1WorldState(world: WorldState): Uint8Array {
  const payloadRaw = utf8(JSON.stringify({ world: worldToSerializable(world) }, mapAwareReplacer));
  const checksum = crc32(payloadRaw);
  const w = new BytesWriter(28 + payloadRaw.length);
  w.u32(MAGIC);
  w.u32(1);
  w.u64(BigInt(Date.now()));
  w.u32(checksum);
  w.u8(COMPRESSION_NONE);
  w.u8(0);
  w.u16(0);
  w.u32(payloadRaw.length);
  w.bytes(payloadRaw);
  return w.finish();
}

function worldToSerializable(world: WorldState): unknown {
  return structuredClone(world);
}

function serializableToWorld(payload: WorldState): WorldState {
  const cloned = structuredClone(payload) as unknown as Record<string, unknown>;
  delete cloned["_ananke_version"];
  delete cloned["_schema"];
  return cloned as unknown as WorldState;
}

function mapAwareReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) return { __ananke_map__: true, entries: [...value.entries()] };
  return value;
}

function mapAwareReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && (value as { __ananke_map__?: boolean }).__ananke_map__ === true) {
    return new Map((value as { entries: Array<[unknown, unknown]> }).entries);
  }
  return value;
}

type WasmLz4Codec = {
  compress(input: Uint8Array): Uint8Array;
  decompress(input: Uint8Array): Uint8Array;
};

function compress(bytes: Uint8Array): { codec: number; bytes: Uint8Array } {
  const maybe = (globalThis as { __ANANKE_LZ4_WASM__?: WasmLz4Codec }).__ANANKE_LZ4_WASM__;
  if (maybe) return { codec: COMPRESSION_LZ4_WASM, bytes: maybe.compress(bytes) };
  return { codec: COMPRESSION_NONE, bytes };
}

function decompress(codec: number, bytes: Uint8Array): Uint8Array {
  if (codec === COMPRESSION_NONE) return bytes;
  if (codec === COMPRESSION_LZ4_WASM) {
    const maybe = (globalThis as { __ANANKE_LZ4_WASM__?: WasmLz4Codec }).__ANANKE_LZ4_WASM__;
    if (!maybe) throw new Error("serialization: lz4 wasm codec unavailable");
    return maybe.decompress(bytes);
  }
  throw new Error(`serialization: unknown compression codec ${codec}`);
}

function utf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function crc32(data: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i]!;
    for (let b = 0; b < 8; b++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

class BytesWriter {
  private readonly out: Uint8Array;
  private cursor = 0;
  private readonly view: DataView;

  constructor(size: number) {
    this.out = new Uint8Array(size);
    this.view = new DataView(this.out.buffer);
  }

  u8(v: number): void { this.view.setUint8(this.cursor, v); this.cursor += 1; }
  u16(v: number): void { this.view.setUint16(this.cursor, v, true); this.cursor += 2; }
  u32(v: number): void { this.view.setUint32(this.cursor, v >>> 0, true); this.cursor += 4; }
  u64(v: bigint): void { this.view.setBigUint64(this.cursor, v, true); this.cursor += 8; }
  bytes(v: Uint8Array): void { this.out.set(v, this.cursor); this.cursor += v.length; }
  finish(): Uint8Array { return this.out.slice(0, this.cursor); }
}

class BytesReader {
  private cursor = 0;
  private readonly view: DataView;
  constructor(private readonly data: Uint8Array) { this.view = new DataView(data.buffer, data.byteOffset, data.byteLength); }
  u8(): number { const v = this.view.getUint8(this.cursor); this.cursor += 1; return v; }
  u16(): number { const v = this.view.getUint16(this.cursor, true); this.cursor += 2; return v; }
  u32(): number { const v = this.view.getUint32(this.cursor, true); this.cursor += 4; return v; }
  u64(): bigint { const v = this.view.getBigUint64(this.cursor, true); this.cursor += 8; return v; }
  bytes(n: number): Uint8Array {
    const start = this.cursor;
    this.cursor += n;
    return this.data.slice(start, start + n);
  }
}
