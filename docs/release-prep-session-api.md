# Release Prep Checklist — Session API (v0.5.0)

- [x] Version bump prepared: `package.json` set to `0.5.0` (minor release for the additive Tier-2 session facade release track).
- [x] Runtime version synced: `src/version.ts` regenerated from `package.json` via `npm run sync-version`.
- [x] Lockfile refreshed and version fields synchronized.
- [x] Changelog prepared: `CHANGELOG.md` includes `## [0.5.0] — 2026-04-23` using existing heading style.
- [x] Release dashboard refreshed (`npm run generate-release-dashboard`) and verified (`npm run check-release-dashboard`).
- [x] Required quality gates run for release readiness (`npm run build`, `npm run check-trust-dashboard-artifacts`).

## Existing CI-driven publish mechanics (verified)

- Local release helper: `npm run release` -> `scripts/tag-release.sh`.
- The helper script bumps version, syncs runtime version, rebuilds, commits, creates `vX.Y.Z`, and pushes commit + tag.
- CI publish workflow: `.github/workflows/release.yml` (triggered by pushed `v*` tag) verifies tag/package version parity, runs release gates, builds artifacts, and publishes with `npm publish --provenance`.

## What happens when the `v0.5.0` tag is pushed

1. Pushing `v0.5.0` triggers `.github/workflows/release.yml` (`on.push.tags: v*`).
2. CI checks out the tag, installs with `npm ci`, and verifies `package.json` version matches the tag.
3. CI runs release checks (`release/run-release-checks.sh`).
4. CI builds release artifacts (`release/build-release-artifacts.sh`).
5. CI publishes to npm with provenance (`npm publish --provenance`) using `NPM_TOKEN`.
6. CI extracts release notes from `CHANGELOG.md` and creates the GitHub Release.

## Operator reminder

- Do **not** run `npm publish` locally.
- Use the repo flow: commit -> push -> create/push `v0.5.0` tag (or `npm run release minor` in a clean working tree).
