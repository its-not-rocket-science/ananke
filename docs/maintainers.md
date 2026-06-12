# Maintainer Onboarding Guide

This checklist is the maintainer runbook for releases, security response, and Tier 1 API lifecycle decisions.

## Maintainer readiness checklist

- [ ] You have admin access to GitHub repo settings, GitHub Security Advisories, Actions secrets, and npm publishing settings.
- [ ] You can publish to npm for `@its-not-rocket-science/ananke`.
- [ ] You can create and edit GitHub Releases.
- [ ] You can triage labels (`good first issue`, `help wanted`, `security`, `api-change`, `performance`).

## Release checklist (tag-driven, zero manual publish steps)

### 1) Prepare release branch state

- [ ] `main` is green in CI and determinism nightly has no outstanding regressions.
- [ ] `CHANGELOG.md` has a finalized entry for the target version.
- [ ] You have pulled latest `main` and have a clean working tree.

```bash
git checkout main
git pull --ff-only
npm ci
npm run ci
npm run test:determinism
npm run benchmark-check:strict
```

### 2) Bump version using `npm version`

Pick exactly one bump strategy:

```bash
npm version patch
# or
npm version minor
# or
npm version major
```

This updates `package.json`, creates a version commit, and creates a tag (for example `v1.2.3`).

- [ ] Push commit and tags:

```bash
git push origin main --follow-tags
```

### 3) Automated release workflow validates and publishes

- [ ] Confirm `.github/workflows/release.yml` starts on tag push.
- [ ] Confirm workflow passes all gates:
  - full CI (`npm run ci`)
  - determinism (`npm run test:determinism`)
  - performance budget (`npm run benchmark-check:strict`)
  - npm + WASM build artifacts
- [ ] Confirm npm publish ran with provenance (`npm publish --provenance`).

### 4) GitHub Release finalization

- [ ] Confirm GitHub Release was created automatically for the tag.
- [ ] Confirm release notes were generated from the matching `CHANGELOG.md` section.
- [ ] Confirm attached artifacts include npm/WASM outputs.

---

## Security issue handling checklist (private disclosure)

Use private disclosure first. Do **not** ask reporters to open public issues for vulnerabilities.

- [ ] Acknowledge report within 24 hours.
- [ ] Move discussion to GitHub Security Advisory draft (private).
- [ ] If report came by email, mirror details into Security Advisory and add reporter as collaborator if appropriate.
- [ ] Reproduce and assign severity (P1 or P2).
- [ ] Ship fix and coordinated disclosure according to SLA in `SECURITY.md`.
- [ ] Credit reporter in advisory unless they request anonymity.

### Channels

1. GitHub Security Advisories (preferred):
   - Go to **Security → Advisories → New draft advisory**.
2. Security email (backup):
   - `security@its-not-rocket-science.dev`

---

## Tier 1 API deprecation checklist (2 major version notice)

Tier 1 APIs are semver-protected and deprecations require long notice.

Policy:

- A Tier 1 API proposed for removal/deep break must be announced no later than **N**, and removed no earlier than **N+2 major versions**.
- Example: notice in `v3.x` means earliest removal is `v5.0.0`.

Execution checklist:

- [ ] Open ADR documenting motivation, alternatives, migration path, and exact target removal major.
- [ ] Add deprecation annotation in code/docs.
- [ ] Add `CHANGELOG.md` deprecation entry with “earliest removal in vX.0.0”.
- [ ] Add migration guide section and replacement API examples.
- [ ] Keep compatibility shim through N+1 major.
- [ ] Remove only when N+2 major is cut.

Recommended changelog wording:

> Deprecated `fooBar()` in Tier 1 as of `v3.2.0`; earliest removal is `v5.0.0`.

