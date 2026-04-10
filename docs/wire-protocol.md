# Ananke Wire Protocol & Schema Formats

This page documents only what is currently shipped in code. It avoids treating roadmap ideas as current protocol guarantees.

Status badge legend:
- 🟢 **Implemented + public**: implemented and exported on documented package entrypoints.
- 🟡 **Partial**: implemented API exists, but completeness/coverage is intentionally limited.
- 🟠 **Implemented + internal**: implemented and exported only on internal/advanced surfaces.
- 🔵 **Planned**: not shipped as a canonical helper/module.

## Compatibility table (current)

| Surface | Status | Current contract |
|---|---|---|
| Save format | 🟢 Implemented + public | JSON snapshots stamped with `_ananke_version`/`_schema` via `stampSnapshot` on `@its-not-rocket-science/ananke/schema` (and `./schema-migration` alias). |
| Replay format | 🟢 Implemented + public | `Replay` JSON via `serializeReplay` / `deserializeReplay` on root entrypoint `@its-not-rocket-science/ananke`. |
| Schema migration | 🟡 Partial | `migrateWorld` + `registerMigration` are shipped; only explicitly registered migration edges run (no built-in universal chain). |
| Binary diff | 🟠 Implemented + internal | `diffWorldState` / `packDiff` / `unpackDiff` / `applyDiff` are shipped on `@its-not-rocket-science/ananke/tier3` (advanced/internal surface). |
| Lockstep messages | 🔵 Planned | No canonical exported lockstep message envelope/type module. Hosts define their own message schema today. |

## 1) Save snapshots (JSON)

**Status:** 🟢 Implemented + public

Shipped helpers:
- `stampSnapshot(snapshot, schemaKind)`
- `validateSnapshot(snapshot)`
- `detectVersion(snapshot)`
- `isValidSnapshot(snapshot)`

Entrypoints:
- `@its-not-rocket-science/ananke/schema`
- `@its-not-rocket-science/ananke/schema-migration` (alias)

Example:

```ts
import { stampSnapshot, validateSnapshot } from "@its-not-rocket-science/ananke/schema";

const world = {} as Parameters<typeof stampSnapshot>[0];
const stamped = stampSnapshot(world, "world");
const errors = validateSnapshot(stamped);
if (errors.length > 0) throw new Error("invalid snapshot");
const json = JSON.stringify(stamped);
```

Notes:
- `validateSnapshot` validates core structural fields required by simulation, and permits extra host fields.
- Canonical schema files are shipped in `schema/world.schema.json` and `schema/replay.schema.json`.

## 2) Replay format

**Status:** 🟢 Implemented + public

Shipped helpers (root entrypoint):
- `ReplayRecorder`
- `replayTo`
- `serializeReplay`
- `deserializeReplay`

Example:

```ts
import { ReplayRecorder, serializeReplay, deserializeReplay, replayTo } from "@its-not-rocket-science/ananke";

const world = {} as ConstructorParameters<typeof ReplayRecorder>[0];
const ctx = {} as Parameters<typeof replayTo>[2];
const recorder = new ReplayRecorder(world);
// ... record frames while stepping
const json = serializeReplay(recorder.toReplay());
const replay = deserializeReplay(json);
const worldAt100 = replayTo(replay, 100, ctx);
```

Notes:
- Replay JSON includes custom Map handling used by serializer/reviver.
- This is the shipped deterministic replay contract.

## 3) Schema migration

**Status:** 🟡 Partial

Shipped helpers:
- `registerMigration(fromVersion, toVersion, fn)`
- `migrateWorld(snapshot, toVersion?)`

Behavior today:
- If snapshot version equals target version, `migrateWorld` returns unchanged.
- If no migration is registered for the requested edge, `migrateWorld` throws.
- Legacy snapshots without `_ananke_version` are treated as `"0.0"`.

This is a real API, but migration coverage is only as complete as registered migration paths.

## 4) Binary diff format

**Status:** 🟠 Implemented + internal

Shipped helpers (Tier 3 surface):
- `diffWorldState(prev, next)`
- `packDiff(diff)`
- `unpackDiff(bytes)`
- `applyDiff(base, diff)`

Entrypoint:
- `@its-not-rocket-science/ananke/tier3`

Scope:
- Useful for incremental state transport/storage.
- Not part of Tier-1 root stability contract.

## 5) Lockstep message protocol

**Status:** 🔵 Planned

Current code provides deterministic primitives (`stepWorld`, replay, and `hashWorldState` in netcode), but **does not** provide a canonical exported lockstep message protocol module with fixed message kinds/envelopes.

Roadmap/proposed protocol details have been moved to `docs/planned-protocol-work.md`.

## 6) Helper/path audit (docs ↔ code)

| Item | Exists in code | Exported | Classification |
|---|---|---|---|
| `stampSnapshot` (`src/schema-migration.ts`) | yes | `./schema`, `./schema-migration` | implemented + public |
| `validateSnapshot` (`src/schema-migration.ts`) | yes | `./schema`, `./schema-migration` | implemented + public |
| `migrateWorld` (`src/schema-migration.ts`) | yes | `./schema`, `./schema-migration` | partial |
| `registerMigration` (`src/schema-migration.ts`) | yes | `./schema`, `./schema-migration` | implemented + public |
| `serializeReplay` (`src/replay.ts`) | yes | root `.` | implemented + public |
| `deserializeReplay` (`src/replay.ts`) | yes | root `.` | implemented + public |
| `diffWorldState` (`src/snapshot.ts`) | yes | `./tier3` | implemented + internal |
| `packDiff` (`src/snapshot.ts`) | yes | `./tier3` | implemented + internal |
| `unpackDiff` (`src/snapshot.ts`) | yes | `./tier3` | implemented + internal |
| `applyDiff` (`src/snapshot.ts`) | yes | `./tier3` | implemented + internal |
| `schema/world.schema.json` | yes | package file artifact | implemented + public artifact |
| `schema/replay.schema.json` | yes | package file artifact | implemented + public artifact |
| Canonical lockstep message module | no | n/a | planned |

