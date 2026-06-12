# Ananke — Maintenance Policy

*Platform Maturity PM-10 — Maintenance Budget Roadmap*

> **Audience:** Project maintainers and contributors who need to understand what the project
> commits to keeping working, at what cadence, and by whom.
>
> **Companion:** See [`docs/maintenance-checklist.md`](maintenance-checklist.md) for the
> per-release preparation checklist that operationalises this policy.

---

## 1 · Scope

This policy covers the `@its-not-rocket-science/ananke` npm package and the companion
reference projects (Unity, Godot, Web).  It defines the standing commitments that any
release must satisfy before publication.

---

## 2 · Docs reconciliation

**Commitment:** Every release must ship with an up-to-date module index and recipes matrix.

**Mechanism:**

```bash
npm run generate-module-index    # regenerates docs/module-index.md
npm run generate-recipes-matrix  # regenerates docs/recipes-matrix.md
```

These tools are deterministic — running them twice produces identical output.  If the
committed file differs from the regenerated one, the release is blocked until they are
reconciled.

**What triggers a diff:**

- Adding, removing, or renaming an export in `src/index.ts` or any sub-path export
- Changing a stability tier annotation
- Adding or removing a quick-start example or recipe

**Cadence:** Before every `npm publish`.  Tracked in the release checklist (§8 below).

---

## 3 · Issue triage cadence

| Priority | Trigger | Response target |
|----------|---------|-----------------|
| **P0 — Regression** | A Tier 1 export produces wrong output; determinism broken; test suite fails on main | Same day — hotfix patch release |
| **P1 — Correctness** | A validation scenario fails; a published API behaves contrary to its documented contract | Within one week — patch or minor release |
| **P2 — Enhancement** | New feature request, performance improvement, new content | Roadmap-tracked — next available roadmap slot |
| **P3 — Documentation** | Doc error, unclear explanation, missing example | Best-effort — batch into next release |

P0 and P1 issues block release publication until resolved or explicitly deferred with a
written justification in `CHANGELOG.md`.

---

## 4 · Migration maintenance

**Commitment:** Every minor version bump that changes a `@core`-tagged field on `Entity`,
`WorldState`, or `IndividualAttributes` must ship a registered migration in
`src/schema-migration.ts`.

**What counts as a `@core` change:**

- Renaming or removing a required field
- Changing the unit or scale of a field (e.g. `position_m` stored at a different `SCALE`)
- Changing the shape of a nested type that is part of the serialized world state

**What does not require a migration:**

- Adding a new optional field (with `exactOptionalPropertyTypes`-safe defaults)
- Adding new exported types or functions
- Changing internal `__`-prefixed fields

**Migration registration:**

```typescript pseudocode
// src/schema-migration.ts
registerMigration({
  from: "0.1.x",
  to:   "0.2.0",
  description: "Renamed entity.injury to entity.wounds",
  migrate: (world) => { /* ... */ },
});
```

Every migration must have a corresponding test in `test/schema-migration.test.ts`.

---

## 5 · SDK parity policy

Ananke has three companion reference projects that consume the npm package:

| Sidecar | Repository | Integration surface |
|---------|------------|---------------------|
| Unity | `ananke-unity-reference` | `BridgeFrame` schema, `AnimationHints`, `GrapplePoseConstraint` |
| Godot 4 | `ananke-godot-reference` | `BridgeFrame` schema, tick-driven `stepWorld` loop |
| Three.js / Web | `ananke-web-reference` | Full Tier 1 API via npm, `BridgeEngine` |

**Commitment:** All three sidecars must be updated to the current `BRIDGE_SCHEMA_VERSION`
(currently `"ananke.bridge.frame.v1"`) within one minor release of the core.

**What constitutes a schema change:** Any change to the exported shape of `BridgeFrame`,
`EntityBridgeData`, `AnimationHints`, or `GrapplePoseConstraint`.

**How it is tracked:** The `BRIDGE_SCHEMA_VERSION` constant in `src/host-loop.ts` is bumped
whenever a schema change occurs.  Sidecar maintainers subscribe to the `bridge-schema` label
on the core repository.

---

## 6 · Example and corpus upkeep

**Commitment:** All `examples/` and `corpus/` entries must build cleanly and produce
expected output hashes on every release.

**CI enforcement:**

```bash
npm run build          # TypeScript compile — fails on any type error in examples/
npm run verify-corpus  # Re-runs all corpus scenarios; fails on hash drift or over-budget timing
```

Any corpus entry that drifts (changed physics output) or exceeds its `expectedTickBudgetMs`
blocks the release until either:

a) The corpus hash is updated and the change is documented in `CHANGELOG.md`; or
b) The performance regression is investigated and a root cause identified.

**Examples in `examples/`** are compiled as part of `npm run build` (they are included in
`tsconfig.build.json`).  Type errors in examples block release.  Runtime correctness of
examples is verified by the quickstart tests in `test/examples/`.

---

## 7 · Content-pack schema evolution

**Commitment:** Pack schema minor bumps are backward-compatible.  Major bumps ship a
migration tool.

| Bump type | Policy |
|-----------|--------|
| Minor (`pack/v1` → `pack/v1.1`) | New optional fields only; existing valid packs continue to validate |
| Major (`pack/v1` → `pack/v2`) | Breaking changes; a `tools/migrate-pack-v1-to-v2.ts` tool is shipped in the same release |

**Schema file:** `schema/pack.schema.json`.

**Version constant:** `registry.compatRange` in each pack manifest tracks the engine version
range; the schema version is implicit in the manifest structure.

**Checksum invariant:** The SHA-256 `registry.checksum` must be valid for a pack to load.
After any schema migration, packs must be re-bundled with `npm run pack` to refresh the
checksum.

---

## 8 · Release checklist

See [`docs/maintenance-checklist.md`](maintenance-checklist.md) for the full pre-publish
checklist.  The short version:

1. `npm run build` — clean compile
2. `npm run test:coverage` — all tests pass; coverage above thresholds
3. `npm run audit-deprecations -- --check` — no overdue symbols
4. `npm run generate-module-index && npm run generate-recipes-matrix` — docs reconciled
5. `npm run verify-corpus` — all corpus entries pass
6. `CHANGELOG.md` entry written; version bumped in `package.json` and `src/version.ts` regenerated via `npm run sync-version`
7. `npm publish --access public`

---

## 9 · Coverage floor

The test suite enforces minimum coverage thresholds (configured in `vitest.config.ts`):

| Metric | Floor |
|--------|-------|
| Statements | 90% |
| Branches | 80% |
| Functions | 85% |
| Lines | 90% |

Falling below any floor blocks `npm run test:coverage`.  Adding new code without tests
that would drop coverage below the floor blocks release.

---

## 10 · Deprecation budget

At any given time, no more than **10 symbols** should be in the deprecated state.
If the count exceeds 10, the oldest overdue symbols must be removed before new deprecations
are added.

`npm run audit-deprecations` reports the current count.  The `--check` flag (run in
`prepublishOnly`) fails if any symbol's `removeAfter` version ≤ current engine version.

---

## 11 · What this policy does not cover

- **Feature development** — governed by ROADMAP.md
- **Third-party contributions** — see `docs/contributing.md`
- **Security disclosures** — report privately; patch release within 24 hours for P0 severity
- **Long-term archive compatibility** — commit-hash pinning is the recommended mechanism;
  see `docs/versioning.md`
