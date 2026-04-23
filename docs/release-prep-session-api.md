# Release Prep Checklist — Session API (v0.4.1)

- [x] Version bump prepared: `package.json` set to `0.4.1` (patch release for backward-compatible session API/docs/runtime portability improvements).
- [x] Runtime version synced: `src/version.ts` regenerated from `package.json` via `npm run sync-version`.
- [x] Lockfile refreshed with `npm install --ignore-scripts`.
- [x] Changelog prepared: `CHANGELOG.md` includes `## [0.4.1] — 2026-04-23` using existing heading style.
- [x] Release dashboard refreshed (`npm run generate-release-dashboard`) and verified (`npm run check-release-dashboard`).
- [x] Required quality gates run for release readiness (`npm run build`, `npm run check-trust-dashboard-artifacts`, `npm run release-check:quick`).

## What happens when the release tag is pushed

1. Pushing `v0.4.1` triggers `.github/workflows/release.yml` (`on.push.tags: v*`).
2. CI checks out that tag, installs with `npm ci`, and verifies `package.json` version matches the tag.
3. It runs `release/run-release-checks.sh` (full CI, determinism artifacts/checks, release-check, strict benchmark gate).
4. It builds npm + WASM artifacts via `release/build-release-artifacts.sh`.
5. It publishes to npm with provenance (`npm publish --provenance`) using `NPM_TOKEN`.
6. It extracts release notes from `CHANGELOG.md`, then creates a GitHub Release for the tag and attaches generated artifacts.

## Operator reminder

- Do **not** run `npm publish` locally.
- Use the repo flow: commit -> push -> create/push `v0.4.1` tag.

## Release verification note (2026-04-23)

- Verified version consistency for `0.4.1` across `package.json`, `package-lock.json`, `src/version.ts`, and the latest changelog heading (`## [0.4.1] — 2026-04-23`) using `npm run check-version-sync` plus direct file checks.
- Verified docs version references stay aligned with `package.json` via `npm run check-doc-version-sync`.
- Verified release dashboard artifacts are current via `npm run check-release-dashboard`.
- Verified release commit conventions are represented in history by release-prep/release-discipline commits (`ff89a8c` and `dcea3c7`) and that workflow tag convention remains `v*` (`v<package.json version>`).
- Local repository snapshot does not currently include the `v0.4.1` tag object, so tag-object presence cannot be revalidated in this checkout without a configured remote.

