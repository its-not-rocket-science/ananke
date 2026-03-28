# Ananke — Wire Protocol & Save Format

This document specifies how Ananke state is serialised for persistence, replay, and
network transport.  All formats are deterministic: the same simulation state always
produces the same bytes.

---

## 1. Concepts

| Term | Meaning |
|------|---------|
| **Snapshot** | A serialised `WorldState` — complete enough to resume simulation |
| **Replay** | An initial snapshot + a sequence of command frames |
| **Diff** | A compact binary diff between two consecutive snapshots (CE-9) |
| **Wire message** | A single unit transmitted between host and client over the network |
| **Q value** | A fixed-point integer scaled by `SCALE.Q = 10 000` (e.g. `q(0.75) = 7500`) |

---

## 2. JSON Snapshot Format

JSON is the recommended format for long-term save files and editor tooling.

### 2.1 Deterministic key ordering

When computing hash-checks across clients, keys must appear in insertion order.
The canonical TypeScript implementation (`JSON.stringify`) preserves insertion
order for string keys.  Third-party deserializers must preserve or sort keys
identically.

### 2.2 Q values

All `Q`-typed fields are serialised as plain integers.  Do **not** divide by
`SCALE.Q` before saving — the raw integer is the canonical representation.

```json
{ "fearQ": 7500 }    // correct — q(0.75)
{ "fearQ": 0.75 }    // WRONG — will cause precision loss and replay divergence
```

### 2.3 Maps

JavaScript `Map` instances do not serialise to JSON automatically.  Ananke
serialises `Map<K, V>` as an array of `[K, V]` pairs:

```json
{ "__nutritionAccum": 0 }
```

> Note: `__nutritionAccum` was simplified to a scalar in v0.1.  If a `Map`
> field is added in a future version, its pairs will use the array format above.

### 2.4 Version stamping

Always call `stampSnapshot(world, "world")` before persisting.  This adds
`_ananke_version` and `_schema` fields that enable forward migration:

```typescript
import { stampSnapshot } from "@its-not-rocket-science/ananke/schema";
// or: import { stampSnapshot } from "@ananke/core";   (when published)

const save = JSON.stringify(stampSnapshot(world, "world"), null, 2);
```

### 2.5 JSON Schema files

Canonical schemas ship with the package:

| File | Validates |
|------|-----------|
| `schema/world.schema.json` | `WorldState` snapshots |
| `schema/replay.schema.json` | `Replay` objects |

Use `validateSnapshot(raw)` from `@its-not-rocket-science/ananke/schema` to
check conformance programmatically before calling `stepWorld`.

---

## 3. Binary Diff Format

For tick-to-tick state synchronisation (multiplayer, streaming), use the binary
diff format implemented in `src/snapshot.ts`.

### 3.1 Encoding

```
[magic: "ANKD" (4 bytes)] [version: 1 (u8)] [payload: tag-value stream]
```

Tag values:

| Tag | Byte | Encodes |
|-----|------|---------|
| NULL | 0x00 | `null` |
| TRUE | 0x01 | `true` |
| FALSE | 0x02 | `false` |
| UINT8 | 0x10 | Unsigned integer 0–255 |
| INT32 | 0x11 | Signed 32-bit integer (big-endian) |
| FLOAT64 | 0x12 | IEEE 754 double (big-endian) — use only for non-Q floats |
| STRING | 0x20 | Length-prefixed UTF-8 |
| ARRAY | 0x30 | Length-prefixed sequence of tag-value items |
| OBJECT | 0x40 | Length-prefixed sequence of (string key, tag-value) pairs |

### 3.2 Usage

```typescript
import { diffWorldState, packDiff, unpackDiff, applyDiff } from "@its-not-rocket-science/ananke";

// Sender
const diff   = diffWorldState(prevState, nextState);
const bytes  = packDiff(diff);
socket.send(bytes);

// Receiver
const diff2  = unpackDiff(bytes);
const state2 = applyDiff(prevState, diff2);
```

### 3.3 Determinism guarantee

A diff produced from identical states must produce identical bytes.  Do not
include wall-clock timestamps or random nonces in diff payloads.

---

## 4. Multiplayer Message Protocol

For lockstep multiplayer, hosts exchange command frames rather than full state.

### 4.1 Message types

| `kind` | Direction | Payload |
|--------|-----------|---------|
| `"cmd"` | Client → Server | `{ tick, commands: Command[] }` |
| `"ack"` | Server → Client | `{ tick, stateHash: number }` |
| `"resync"` | Server → Client | `{ tick, snapshot: WorldState }` |
| `"hash_mismatch"` | Server → Client | `{ tick, expected: number, got: number }` |

### 4.2 State hash

Use the built-in tick counter and entity count as a cheap hash for divergence
detection:

```typescript
function stateHash(world: WorldState): number {
  return world.tick * 0x10000 + (world.entities.length & 0xFFFF);
}
```

A full structural hash is more robust but expensive; use it only on resync.

### 4.3 Lockstep loop

```
┌──────────────────────────────────────────────────────────┐
│ Client                       Server                      │
│                                                          │
│ collect commands ──── cmd ──► apply to authoritative     │
│                               state                      │
│                   ◄── ack ─── broadcast stateHash        │
│ verify hash                                              │
│ if mismatch ─── resync req ─► send full snapshot        │
│                ◄── resync ──                             │
│ restore snapshot                                         │
└──────────────────────────────────────────────────────────┘
```

### 4.4 Transport encoding

Use JSON for development and debugging.  For production, encode wire messages
as CBOR (RFC 8949) or MessagePack for ~30% size reduction.  The message
structure is identical; only the outer encoding changes.

---

## 5. Save File Recommendations

| Scenario | Format | Compression |
|----------|--------|-------------|
| Development / debugging | JSON (pretty-printed) | none |
| Production saves | JSON (compact) | gzip or zstd |
| Network sync (full state) | JSON or CBOR | none (already compact) |
| Network sync (incremental) | Binary diff (`packDiff`) | none |
| Replay archives | JSON replay schema | zstd |

---

## 6. Migration

Load a save and bring it to the current schema version before simulating:

```typescript
import {
  migrateWorld, validateSnapshot, stampSnapshot,
} from "@its-not-rocket-science/ananke/schema";

function loadSave(json: string): WorldState {
  const raw      = JSON.parse(json) as Record<string, unknown>;
  const migrated = migrateWorld(raw);          // no-op until 0.2 is released
  const errors   = validateSnapshot(migrated);
  if (errors.length > 0) {
    throw new Error(`Invalid save: ${errors.map(e => `${e.path}: ${e.message}`).join("; ")}`);
  }
  return migrated as WorldState;
}
```

See `docs/migration-monolith-to-modular.md` for package-level migration guidance.
