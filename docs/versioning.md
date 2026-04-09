# Ananke — Versioning Policy

*Platform Hardening PH-2 — Versioning Policy Unification*

---

## Which version do I use?

**Short answer: put the semver tag in your `package.json`.**

```json
{ "dependencies": { "ananke": "^0.1.0" } }
```

If you need byte-for-byte replay determinism across patch releases, also record the
exact commit hash in your project's `UPSTREAM.md`.  See [commit-hash pinning](#commit-hash-pinning) below.

---

## Canonical versioning policy

Ananke uses **semantic versioning (semver)** as the public contract:

| Version change | Meaning |
|---------------|---------|
| Patch (`0.1.x`) | Bug fixes, documentation corrections, and internal refactors that do not change observable simulation output |
| Minor (`0.x.0`) | Additive changes: new exports, new optional fields, new simulation phases.  **Tier 1 (Stable) exports are not broken.**  Tier 2 (Experimental) exports may change with a `CHANGELOG.md` entry |
| Major (`x.0.0`) | Breaking changes to Tier 1 exports.  A migration guide accompanies every major bump |

> **Pre-1.0 note:** The project is currently at `0.1.0`.  Tier 1 exports will not break
> within the `0.x` line without a minor-version bump and a migration guide in `CHANGELOG.md`.
> The `1.0` release will lock the Tier 1 surface under full semver guarantees.

---


## Canonical runtime version source

Runtime compatibility checks use `ANANKE_ENGINE_VERSION` from `src/version.ts`, which is
a generated file.  The **only authoritative source** is `package.json` `"version"`; run
`npm run sync-version` to regenerate `src/version.ts` after any version bump.

CI enforces this with `npm run check-version-sync` to prevent drift between publish
versioning, runtime compat checks, and generated docs/tooling outputs.

---
## API stability tiers

Every export in `src/index.ts` is tagged with a stability tier.
The full tier table is in [`STABLE_API.md`](../STABLE_API.md).

| Tier | Label | Guarantee |
|------|-------|-----------|
| 1 | **Stable** | No breaking changes without major version bump + migration guide |
| 2 | **Experimental** | May change between minor versions; `CHANGELOG.md` entry required |
| 3 | **Internal** | No stability guarantee; may change at any time |

---

## Commit-hash pinning (supplementary)

Semver tags are the recommended pinning mechanism for most projects.  For hosts that
require absolute replay determinism across patch releases (e.g. tournament servers, archived
experiment results), you may also pin to a specific commit hash.

### npm / package.json

```json
{
  "dependencies": {
    "ananke": "github:its-not-rocket-science/ananke#<commit-sha>"
  }
}
```

Replace `<commit-sha>` with the full 40-character hash you have validated.

### Git submodule

```bash
git submodule add https://github.com/its-not-rocket-science/ananke.git vendor/ananke
cd vendor/ananke && git checkout <commit-sha>
git add vendor/ananke && git commit -m "pin ananke to <commit-sha>"
```

### Why keep the option at all?

Semver patch releases may adjust a tuning constant in ways that are technically
non-breaking (same function signatures, same output format) but shift simulation
balance.  If you run long-lived archived replays that must be reproduced identically
years later, commit-hash pinning is the stronger guarantee.

---

## What constitutes a breaking change

### Tier 1 — Always breaking (requires major version bump)

| Change | Example |
|--------|---------|
| Rename or remove a field on `Entity` | `entity.injury` → `entity.wounds` |
| Rename or remove a field on `WorldState` | `world.entities` array shape change |
| Change a field's unit or scale | `position_m` stored at a different `SCALE` |
| Remove or rename a Tier 1 exported function | `stepWorld` signature change |
| Change the interpretation of a constant | `SCALE.Q` value changed |
| Change determinism — same seed, different outcome | Any RNG, ordering, or arithmetic change |

### Tier 2 — Potentially breaking (noted in CHANGELOG.md, migration hint provided)

| Change | Example |
|--------|---------|
| Add a required field to `Entity` | New mandatory `age?: AgeState` that existing entity helpers don't initialise |
| Change a constant value that affects tuning | `SURF_J` adjusted |
| Add an optional field that changes default behaviour when absent | New optional context field with a non-neutral default |
| Change snapshot test output | Simulation output shifted for at least one seed |

### Tier 3 — Non-breaking (no migration required)

- Adding new exported functions or types
- Adding optional fields to interfaces (with `exactOptionalPropertyTypes`-safe defaults)
- Adding new built-in archetypes, weapons, or body plans
- Adding new `tools/` scripts or `docs/` files
- Improving test coverage without changing logic
- Fixing bugs where the previous behaviour was demonstrably wrong

---

## Changelog format

Breaking and potentially breaking changes are recorded in `CHANGELOG.md`.
Each entry follows:

```markdown
## <semver-tag> — <YYYY-MM-DD>

### Breaking
- `Entity.someField` renamed to `Entity.newField`.
  Migration: search `.someField` and replace with `.newField`.

### Potentially breaking
- `SURF_J` constant changed from 120 to 110.
  Re-run `npm run validation` to check calibration impact.

### Added
- `src/sim/widget.ts` — Widget System (Phase N).
```

---

## Upgrade review cadence

When upgrading your pinned semver tag or commit hash:

1. **Read the CHANGELOG** — check all entries since your previous version for Tier 1 / Tier 2 items
2. **Diff the source** — `git diff <old-tag>..<new-tag> -- src/` to see what changed
3. **Run your integration build** — `npm run build`
4. **Run the validation suite** — `npm run validation` to confirm calibration scenarios pass
5. **Run the full test suite** — `npm run test:coverage`
6. **Update your pin** — commit the new tag/hash to your dependency manifest

A quarterly review cadence is a reasonable default for a production project.  Determinism
corrections warrant an out-of-cycle upgrade.

---

## Snapshot tests and determinism

`test/snapshots/kernel_behaviour_snapshot.json` is a deterministic regression lock.
If it changes in an upstream commit, that commit has shifted simulation output for at
least one entity and seed combination.  Treat snapshot changes as **Tier 2** by default;
verify they are intentional before upgrading.

To regenerate your snapshot baseline after a deliberate constant change:

```bash
rm test/snapshots/kernel_behaviour_snapshot.json
npm run test:coverage
```

---

## Internal fork guidance

If you need to diverge from upstream (custom damage channels, proprietary AI, non-standard
body plan hooks):

1. Fork at a pinned tag (or commit hash) — do not fork from an untagged tip
2. Namespace your extensions: prefix custom fields and modules with your project identifier
   (e.g. `entity.myproject_customField`) to avoid conflicts on upstream merges
3. Keep an `UPSTREAM.md` at your fork root noting your base version and a diff summary
4. Periodically rebase onto upstream Tier 3 commits to collect non-breaking improvements;
   treat Tier 1/2 commits as explicit migration tasks to schedule

---

## Deprecation lifecycle

Symbols are deprecated rather than removed immediately so downstream projects have time
to migrate.  The lifecycle follows a three-phase pattern:

### 1 — Mark deprecated (current version)

Add a structured JSDoc tag to the symbol:

```typescript
/**
 * @deprecated since 0.1.50 — use `newFunction` instead. Removes at 0.3.0.
 */
export function oldFunction() { … }
```

The **required format** is:

```
@deprecated since {version} — use {replacement} instead. Removes at {removeAfter}.
```

| Field | Meaning |
|-------|---------|
| `since` | Version in which the deprecation was introduced |
| `replacement` | Short description or code reference of what to use instead |
| `removeAfter` | Version at which the symbol will be deleted — must be a future version |

`removeAfter` must satisfy `> current` at publish time; `npm publish` runs
`audit-deprecations --check` and fails if any symbol is overdue.

### 2 — Migration window

During the migration window the symbol still works but emits a TypeScript deprecation
warning in IDEs (the `@deprecated` tag triggers the strikethrough).

The migration window is at least one **minor** version for Tier 2 symbols
and at least one **major** version for Tier 1 (Stable) symbols.

### 3 — Remove at removeAfter

When the engine reaches `removeAfter`, the symbol is deleted and a CHANGELOG entry is
added under a `### Removed` heading.  The `since` version and the replacement are
included in the removal note so the changelog is self-contained.

### Auditing

```bash
npm run audit-deprecations             # human-readable table
npm run audit-deprecations -- --json   # machine-readable JSON
npm run audit-deprecations -- --check  # exit 1 if any overdue
```

The `--check` flag is run automatically by `npm run prepublishOnly`.

### Adding a new deprecation (checklist)

- [ ] Add the structured `@deprecated` JSDoc tag with `since`, replacement, and `removeAfter`.
- [ ] Run `npm run audit-deprecations` to confirm the tag is detected and not overdue.
- [ ] Add a CHANGELOG entry under `### Deprecated`.
- [ ] Surface the replacement in the relevant `docs/` file or `STABLE_API.md`.
