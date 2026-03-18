# Ananke — Versioning Contract

*Integration & Adoption Milestone 5 — Community & Ecosystem Development*

---

## Summary

Ananke does **not** use semver automation.  There is no `npm publish` cadence and no
`package.json` version bump workflow.  The authoritative version of the library is a
**commit hash** on the `master` branch.

This document defines:

1. How to pin a stable version in your project
2. What constitutes a breaking change
3. How to track and review upgrades safely

---

## Pinning to a commit hash

### npm / package.json

```json
{
  "dependencies": {
    "ananke": "github:your-org/ananke#<commit-sha>"
  }
}
```

Replace `<commit-sha>` with the full 40-character hash of the commit you have validated.

### Git submodule

```bash
git submodule add https://github.com/your-org/ananke.git vendor/ananke
cd vendor/ananke && git checkout <commit-sha>
git add vendor/ananke && git commit -m "pin ananke to <commit-sha>"
```

### Why not a version tag?

Ananke is a research-grade simulation kernel.  Its primary consumers are game studios and
research projects that integrate the source directly rather than consuming a compiled package.
Pinning to a commit hash gives you a precise, immutable anchor.  Tags can be force-moved;
hashes cannot.

---

## What constitutes a breaking change

A change is **breaking** if it requires modifications to host code that previously compiled
and ran correctly.

### Tier 1 — Always breaking (requires migration note in CHANGELOG.md)

| Change | Example |
|--------|---------|
| Rename or remove a field on `Entity` | `entity.injury` → `entity.wounds` |
| Rename or remove a field on `WorldState` | `world.entities` array shape change |
| Change a field's unit or scale | `position_m` stored at different SCALE |
| Remove or rename an exported function | `stepWorld` signature change |
| Change the interpretation of a constant | `SCALE.Q` value changed |
| Change determinism — same seed produces different outcome | Any RNG, ordering, or arithmetic change |

### Tier 2 — Potentially breaking (noted in CHANGELOG.md, migration hint provided)

| Change | Example |
|--------|---------|
| Add a required field to `Entity` | New mandatory `age?: AgeState` that `mkEntity` helpers don't initialise |
| Change a constant value that affects tuning | `FORMATION_INTACT_THRESHOLD` or `SURF_J` adjusted |
| Add an optional field that changes default behaviour when absent | New optional context field with a non-neutral default |
| Change snapshot test output | Signals that deterministic output shifted |

### Tier 3 — Non-breaking (no migration required)

- Adding new exported functions or types
- Adding optional fields to interfaces (with `exactOptionalPropertyTypes` safe defaults)
- Adding new built-in archetypes, weapons, or body plans
- Adding new `tools/` scripts or `docs/` files
- Improving test coverage without changing logic
- Fixing bugs where the previous behaviour was demonstrably wrong and unlikely to be relied upon

---

## Changelog format

Breaking and potentially breaking changes are recorded in `CHANGELOG.md` at the root of the
repository.  Each entry follows this structure:

```markdown
## <commit-sha> — <YYYY-MM-DD>

### Breaking
- `Entity.someField` renamed to `Entity.newField`. Migration: search for `.someField` and
  replace with `.newField`.

### Potentially breaking
- `SURF_J` constant changed from 120 to 110. Re-run `npm run validation` to check impact
  on your calibration scenarios.

### Added
- `src/sim/widget.ts` — Widget System (Phase N).
```

---

## Upgrade review cadence

Recommended process when upgrading your pinned commit:

1. **Fetch and diff** — `git diff <old-sha>..<new-sha> -- src/` to see what changed
2. **Read CHANGELOG.md** — check all entries since your previous pin for Tier 1 and Tier 2 items
3. **Run your integration build** — `npm run build` against the new commit
4. **Run the validation suite** — `npm run validation` to confirm calibration scenarios still pass with your configuration
5. **Run the full test suite** — `npm run test:coverage`
6. **Update your pin** — commit the new hash to your dependency manifest

A quarterly review cadence is a reasonable default for a production project.  Security-relevant
fixes or determinism corrections warrant an out-of-cycle upgrade.

---

## Snapshot tests and determinism

`test/snapshots/kernel_behaviour_snapshot.json` is a deterministic regression lock.  If it
changes in an upstream commit, that commit has shifted simulation output for at least one
entity and seed combination.  Treat snapshot changes as **Tier 2** by default; verify they
are intentional before upgrading.

To regenerate your own snapshot baseline after a deliberate constant change:

```bash
rm test/snapshots/kernel_behaviour_snapshot.json
npm run test:coverage
```

The snapshot is regenerated automatically on the next test run.

---

## Internal fork guidance

If you need to diverge from upstream (custom damage channels, proprietary AI, non-standard
body plan hooks):

1. Fork at a pinned commit hash — do not fork from an untagged tip
2. Namespace your extensions: prefix custom fields and modules with your project identifier
   (e.g. `entity.myproject_customField`) to avoid conflicts on upstream merges
3. Keep a `UPSTREAM.md` at your fork root noting your base hash and a diff summary of your
   deviations; update it on each rebase
4. Periodically rebase onto upstream Tier 3 commits to collect non-breaking improvements;
   treat Tier 1/2 commits as explicit migration tasks to schedule
