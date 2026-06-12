# Protocol & Schema Status Audit

Audit scope: wire protocol and schema-related documentation/contracts.

## Classification rubric

- **implemented + public**
- **implemented + internal**
- **partial**
- **planned**

## Feature status

| Feature | Classification | Evidence |
|---|---|---|
| Save snapshot metadata + validation (`stampSnapshot`, `validateSnapshot`) | implemented + public | Implemented in `src/schema-migration.ts`; exported via `./schema` and `./schema-migration`. |
| Replay JSON format (`serializeReplay`, `deserializeReplay`) | implemented + public | Implemented in `src/replay.ts`; exported from root `.` entrypoint. |
| Schema migration (`migrateWorld`) | partial | API is implemented and exported; migration execution depends on registered migration edges. |
| Binary diff (`diffWorldState`, `packDiff`, `unpackDiff`, `applyDiff`) | implemented + internal | Implemented in `src/snapshot.ts`; exported via `./tier3` advanced/internal surface. |
| Canonical lockstep message protocol module | planned | No canonical exported lockstep message module in package exports. |

## Helper + path verification

| Subject | Exists | Export/publicity |
|---|---|---|
| `src/schema-migration.ts` | yes | Public subpath exports via `./schema` and `./schema-migration`. |
| `src/replay.ts` | yes | Public root exports via `.` entrypoint. |
| `src/snapshot.ts` | yes | Exported on internal/advanced `./tier3` surface. |
| `schema/world.schema.json` | yes | Shipped package artifact. |
| `schema/replay.schema.json` | yes | Shipped package artifact. |

## Documentation boundary decisions

- `docs/wire-protocol.md` now documents only shipped contracts + explicit status badges.
- Proposed lockstep details were moved to `docs/planned-protocol-work.md` to isolate roadmap material from current guarantees.
