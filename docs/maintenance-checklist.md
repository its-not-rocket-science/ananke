# Ananke — Release Preparation Checklist

*Platform Maturity PM-10 — Maintenance Budget Roadmap*

> Copy this checklist into the PR description or release notes for each publication.
> Check every item before running `npm publish`.
> See [`docs/maintenance-policy.md`](maintenance-policy.md) for the policy behind each step.

---

## Pre-release checklist

### 1 · Build

- [ ] `npm run build` — TypeScript compiles with zero errors
- [ ] No new `@ts-ignore` or `// eslint-disable` suppressions added without justification

### 2 · Tests

- [ ] `npm run test:coverage` — all tests pass
- [ ] Statement coverage ≥ 90%
- [ ] Branch coverage ≥ 80%
- [ ] Function coverage ≥ 85%
- [ ] Line coverage ≥ 90%
- [ ] No tests skipped with `.skip` or `.todo` without a linked issue

### 3 · Deprecation audit

- [ ] `npm run audit-deprecations -- --check` exits 0 (no overdue symbols)
- [ ] Total deprecated symbol count ≤ 10 (see §10 of maintenance policy)

### 4 · Docs reconciliation

- [ ] `npm run generate-module-index` — `docs/module-index.md` matches generated output
- [ ] `npm run generate-recipes-matrix` — `docs/recipes-matrix.md` matches generated output
- [ ] If either file changed, the updated file is staged for this commit

### 5 · Corpus verification

- [ ] `npm run verify-corpus` — all 5 corpus entries pass (hash + timing)
- [ ] If any hash changed: corpus regenerated with `npm run build && npm run generate-corpus`, new hash documented in `CHANGELOG.md`
- [ ] If any timing exceeded budget: root cause documented; budget updated or performance fixed

### 6 · Changelog and version

- [ ] `CHANGELOG.md` entry written under the new version number
- [ ] Entry includes: what changed, number of tests, coverage snapshot, build status
- [ ] `package.json` `"version"` field bumped (patch / minor / major as appropriate)
- [ ] `npm run sync-version` has regenerated `src/version.ts` from `package.json`
- [ ] If Tier 1 API changed: migration guide included in `CHANGELOG.md`
- [ ] If `BRIDGE_SCHEMA_VERSION` changed: sidecar update issue filed

### 7 · ROADMAP

- [ ] Completed roadmap items marked ✅ in `ROADMAP.md`
- [ ] Any newly deferred items noted in `ROADMAP.md` with reason

### 8 · Schema and content pack

- [ ] If `schema/pack.schema.json` changed: existing valid packs still validate (backward-compatible minor bump) OR migration tool shipped (major bump)
- [ ] If any `@core` field changed on `Entity` / `WorldState` / `IndividualAttributes`: migration registered in `src/schema-migration.ts` with a test

### 9 · SDK parity (if `BRIDGE_SCHEMA_VERSION` changed)

- [ ] Unity sidecar issue filed with new schema version
- [ ] Godot sidecar issue filed with new schema version
- [ ] Web sidecar issue filed with new schema version
- [ ] `docs/bridge-contract.md` updated to reflect schema changes

### 10 · Final publish

- [ ] `npm run build` one final time after all edits
- [ ] `npm publish --access public`
- [ ] Git tag created: `git tag v<version> && git push origin v<version>`
- [ ] GitHub release created with `CHANGELOG.md` entry as release notes

---

## Quick-reference commands

```bash
# Full pre-publish sequence (same as prepublishOnly)
npm run build
npm run test:coverage
npm run audit-deprecations -- --check

# Docs reconciliation
npm run generate-module-index
npm run generate-recipes-matrix

# Corpus
npm run verify-corpus
npm run build && npm run generate-corpus   # if hashes need updating

# Publish
npm publish --access public
git tag v0.1.x && git push origin v0.1.x
```

---

## Hotfix (P0 regression) fast path

When a P0 regression is identified on `main`:

1. Fix on a `hotfix/` branch
2. Run steps 1–3 and step 5 from the checklist above (skip docs reconciliation if unrelated)
3. Bump patch version; write a `### Breaking` or `### Fixed` `CHANGELOG.md` entry
4. Merge to `main`; publish immediately

P0 hotfixes do not require a full docs reconciliation pass — file a follow-up P3 issue
if any docs need updating.
