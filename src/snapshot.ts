/**
 * CE-9 — World-State Diffing + Incremental Snapshots
 *
 * Reduces long-run storage from O(ticks × fullState) to O(initialState + Σ deltas).
 *
 * ## Diff model
 * `WorldStateDiff` captures:
 * - World-level scalar changes (`tick`, `seed`, optional subsystem fields).
 * - Entity-level changes at **top-level-field granularity**: each field that
 *   differs from the previous snapshot is stored in full; unchanged fields are
 *   omitted.  This avoids deep-diffing complex nested types.
 * - Newly added entities (stored in full).
 * - Removed entity ids.
 *
 * ## Binary wire format (`packDiff` / `unpackDiff`)
 * A compact, dependency-free binary encoding using a simple tag-value scheme.
 * Zero external dependencies — implemented entirely with `DataView` / `Uint8Array`.
 *
 * Layout:
 *   [4 bytes magic "ANKD"] [1 byte version=1] [tag-value payload...]
 *
 * Tag bytes:
 *   0x01 null | 0x02 true | 0x03 false
 *   0x04 uint8  (1 byte) | 0x05 int32 LE (4 bytes) | 0x06 float64 LE (8 bytes)
 *   0x07 string (uint16 LE length + UTF-8 bytes)
 *   0x08 array  (uint32 LE count + items)
 *   0x09 object (uint32 LE count + key-value pairs, keys as 0x07 strings)
 *   0x0A undefined/absent (skipped in round-trip)
 */

import type { WorldState } from "./sim/world.js";
import type { Entity }     from "./sim/entity.js";
import { normalizeWorldInPlace } from "./sim/normalization.js";

// ── Public types ──────────────────────────────────────────────────────────────

/** A patch for a single entity — only changed top-level fields are included. */
export interface EntityPatch {
  /** Entity id. */
  id: number;
  /** Changed top-level fields (field name → new value). */
  changes: Record<string, unknown>;
}

/**
 * Delta between two consecutive `WorldState` snapshots.
 *
 * Applying a `WorldStateDiff` to the `prev` snapshot must yield a state
 * indistinguishable (JSON-round-trip-equal) from `next`.
 */
export interface WorldStateDiff {
  /** `next.tick` — always present for sequencing. */
  tick: number;
  /** Changed world-level scalar/subsystem fields (excluding `entities`). */
  worldChanges: Record<string, unknown>;
  /** Entities present in `next` but not in `prev` — stored in full. */
  added: Entity[];
  /** Entity ids present in `prev` but not in `next`. */
  removed: number[];
  /** Top-level-field patches for entities present in both states. */
  modified: EntityPatch[];
}

// ── Diff ──────────────────────────────────────────────────────────────────────

/**
 * Compute the diff between two `WorldState` snapshots.
 *
 * The diff is guaranteed to be **idempotent**: `applyDiff(prev, diffWorldState(prev, next))`
 * produces a state that is JSON-round-trip-equal to `next`.
 *
 * Complexity: O(E × F) where E = entity count and F = top-level field count per entity.
 *
 * @param prev  Base snapshot.
 * @param next  New snapshot (must have the same `seed`; `tick` may differ).
 * @returns     `WorldStateDiff` — empty diff if states are identical.
 */
export function diffWorldState(prev: WorldState, next: WorldState): WorldStateDiff {
  // ── World-level scalar/subsystem changes ──────────────────────────────────
  const worldChanges: Record<string, unknown> = {};
  const worldKeys: Array<keyof WorldState> = [
    "tick", "seed",
    "activeFieldEffects",
    "runtimeState",
  ];

  for (const key of worldKeys) {
    if (key === "entities") continue;
    const pv = prev[key];
    const nv = next[key];
    if (!jsonEqual(pv, nv)) {
      worldChanges[key] = nv;
    }
  }

  // ── Entity diff ───────────────────────────────────────────────────────────
  const prevMap = new Map<number, Entity>(prev.entities.map(e => [e.id, e]));
  const nextMap = new Map<number, Entity>(next.entities.map(e => [e.id, e]));

  const added:    Entity[]      = [];
  const removed:  number[]      = [];
  const modified: EntityPatch[] = [];

  // Removed or modified
  for (const [id, pe] of prevMap) {
    const ne = nextMap.get(id);
    if (!ne) {
      removed.push(id);
    } else {
      const changes = entityChanges(pe, ne);
      if (Object.keys(changes).length > 0) {
        modified.push({ id, changes });
      }
    }
  }

  // Added
  for (const [id, ne] of nextMap) {
    if (!prevMap.has(id)) {
      added.push(ne);
    }
  }

  return { tick: next.tick, worldChanges, added, removed, modified };
}

/**
 * Apply a `WorldStateDiff` to a base `WorldState`, producing the `next` state.
 *
 * **Does not mutate `base`** — returns a new `WorldState` object.
 * The returned state may share sub-object references with `base` for unchanged
 * entities (copy-on-write semantics).
 *
 * @param base   The `prev` snapshot that was passed to `diffWorldState`.
 * @param diff   The diff produced by `diffWorldState`.
 * @returns      Reconstructed `next` state.
 */
export function applyDiff(base: WorldState, diff: WorldStateDiff): WorldState {
  // Reconstruct world-level fields
  const next: WorldState = {
    ...(base as object),
    ...diff.worldChanges,
    tick: diff.tick,
  } as WorldState;

  // Remove entities
  const removedSet = new Set(diff.removed);
  let entities = base.entities.filter(e => !removedSet.has(e.id));

  // Modify entities (patch changed fields)
  entities = entities.map(e => {
    const patch = diff.modified.find(p => p.id === e.id);
    if (!patch) return e;
    return { ...(e as object), ...patch.changes } as unknown as Entity;
  });

  // Add new entities
  entities = [...entities, ...diff.added];

  // Restore canonical sort order (ascending id)
  entities.sort((a, b) => a.id - b.id);

  return normalizeWorldInPlace({ ...next, entities });
}

// ── isEmpty / stats ───────────────────────────────────────────────────────────

/**
 * Returns `true` when the diff contains no changes — states were identical.
 */
export function isDiffEmpty(diff: WorldStateDiff): boolean {
  return (
    Object.keys(diff.worldChanges).length === 0 &&
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.modified.length === 0
  );
}

/**
 * Summary statistics for a diff (useful for logging / network budget monitoring).
 */
export interface DiffStats {
  /** Number of world-level changed fields. */
  worldChangedFields: number;
  addedEntities:      number;
  removedEntities:    number;
  modifiedEntities:   number;
  /** Total changed fields across all modified entities. */
  totalEntityChanges: number;
}

export function diffStats(diff: WorldStateDiff): DiffStats {
  return {
    worldChangedFields: Object.keys(diff.worldChanges).length,
    addedEntities:      diff.added.length,
    removedEntities:    diff.removed.length,
    modifiedEntities:   diff.modified.length,
    totalEntityChanges: diff.modified.reduce((s, p) => s + Object.keys(p.changes).length, 0),
  };
}

// ── Binary pack / unpack ──────────────────────────────────────────────────────

const MAGIC    = 0x414E4B44;  // "ANKD"
const VERSION  = 1;

const TAG = {
  NULL:    0x01,
  TRUE:    0x02,
  FALSE:   0x03,
  UINT8:   0x04,
  INT32:   0x05,
  FLOAT64: 0x06,
  STRING:  0x07,
  ARRAY:   0x08,
  OBJECT:  0x09,
} as const;

/**
 * Encode a `WorldStateDiff` as a compact binary `Uint8Array`.
 *
 * The binary format is self-describing (no schema required for decoding).
 * `unpackDiff(packDiff(diff))` is guaranteed to produce a diff that when
 * applied gives the same result as the original.
 *
 * @param diff  Diff to encode.
 * @returns     Binary representation.
 */
export function packDiff(diff: WorldStateDiff): Uint8Array {
  const buf = new Writer();
  buf.writeUint32(MAGIC);
  buf.writeUint8(VERSION);
  buf.writeValue(diff as unknown as JsonValue);
  return buf.toUint8Array();
}

/**
 * Decode a `WorldStateDiff` previously encoded by `packDiff`.
 *
 * @param bytes  Binary data produced by `packDiff`.
 * @returns      Decoded `WorldStateDiff`.
 * @throws       If the magic bytes or version do not match.
 */
export function unpackDiff(bytes: Uint8Array): WorldStateDiff {
  const r = new Reader(bytes);
  const magic = r.readUint32();
  if (magic !== MAGIC) throw new Error(`snapshot: invalid magic 0x${magic.toString(16)}`);
  const version = r.readUint8();
  if (version !== VERSION) throw new Error(`snapshot: unsupported version ${version}`);
  return r.readValue() as unknown as WorldStateDiff;
}

// ── Internal: JSON equality ───────────────────────────────────────────────────

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Compute changed top-level fields between two entity versions. */
function entityChanges(prev: Entity, next: Entity): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  const allKeys = new Set([...Object.keys(prev as object), ...Object.keys(next as object)]) as Set<keyof Entity>;
  for (const key of allKeys) {
    if (!jsonEqual(prev[key], next[key])) {
      changes[key as string] = next[key];
    }
  }
  return changes;
}

// ── Binary Writer ─────────────────────────────────────────────────────────────

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

class Writer {
  private chunks: Uint8Array[] = [];
  private size   = 0;

  writeUint8(v: number): void {
    const b = new Uint8Array(1);
    b[0] = v & 0xFF;
    this.push(b);
  }

  writeUint16(v: number): void {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v, true);
    this.push(b);
  }

  writeUint32(v: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v >>> 0, true);
    this.push(b);
  }

  writeInt32(v: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, v, true);
    this.push(b);
  }

  writeFloat64(v: number): void {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, v, true);
    this.push(b);
  }

  writeString(s: string): void {
    const enc = new TextEncoder().encode(s);
    this.writeUint8(TAG.STRING);
    this.writeUint16(enc.length);
    this.push(enc);
  }

  writeValue(v: JsonValue): void {
    if (v === null || v === undefined) {
      this.writeUint8(TAG.NULL);
    } else if (typeof v === "boolean") {
      this.writeUint8(v ? TAG.TRUE : TAG.FALSE);
    } else if (typeof v === "number") {
      if (Number.isInteger(v) && v >= 0 && v <= 255) {
        this.writeUint8(TAG.UINT8);
        this.writeUint8(v);
      } else if (Number.isInteger(v) && v >= -2147483648 && v <= 2147483647) {
        this.writeUint8(TAG.INT32);
        this.writeInt32(v);
      } else {
        this.writeUint8(TAG.FLOAT64);
        this.writeFloat64(v);
      }
    } else if (typeof v === "string") {
      this.writeString(v);
    } else if (Array.isArray(v)) {
      this.writeUint8(TAG.ARRAY);
      this.writeUint32(v.length);
      for (const item of v) this.writeValue(item);
    } else {
      const entries = Object.entries(v).filter(([, val]) => val !== undefined);
      this.writeUint8(TAG.OBJECT);
      this.writeUint32(entries.length);
      for (const [key, val] of entries) {
        this.writeString(key);
        this.writeValue(val as JsonValue);
      }
    }
  }

  private push(b: Uint8Array): void {
    this.chunks.push(b);
    this.size += b.length;
  }

  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.size);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }
}

// ── Binary Reader ─────────────────────────────────────────────────────────────

class Reader {
  private view: DataView;
  private pos = 0;

  constructor(bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  readUint8(): number {
    return this.view.getUint8(this.pos++);
  }

  readUint16(): number {
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  readUint32(): number {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  readInt32(): number {
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }

  readFloat64(): number {
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }

  readString(): string {
    const len = this.readUint16();
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.pos, len);
    this.pos += len;
    return new TextDecoder().decode(bytes);
  }

  readValue(): JsonValue {
    const tag = this.readUint8();
    switch (tag) {
      case TAG.NULL:    return null;
      case TAG.TRUE:    return true;
      case TAG.FALSE:   return false;
      case TAG.UINT8:   return this.readUint8();
      case TAG.INT32:   return this.readInt32();
      case TAG.FLOAT64: return this.readFloat64();
      case TAG.STRING: {
        const len = this.readUint16();
        const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.pos, len);
        this.pos += len;
        return new TextDecoder().decode(bytes);
      }
      case TAG.ARRAY: {
        const count = this.readUint32();
        const arr: JsonValue[] = [];
        for (let i = 0; i < count; i++) arr.push(this.readValue());
        return arr;
      }
      case TAG.OBJECT: {
        const count = this.readUint32();
        const obj: Record<string, JsonValue> = {};
        for (let i = 0; i < count; i++) {
          // key is always a STRING tag
          const keyTag = this.readUint8();
          if (keyTag !== TAG.STRING) throw new Error(`snapshot: expected string key tag, got 0x${keyTag.toString(16)}`);
          const keyLen = this.readUint16();
          const keyBytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.pos, keyLen);
          this.pos += keyLen;
          const key = new TextDecoder().decode(keyBytes);
          obj[key] = this.readValue();
        }
        return obj;
      }
      default:
        throw new Error(`snapshot: unknown tag 0x${tag.toString(16)}`);
    }
  }
}
