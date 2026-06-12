# Public Contract Canonicalization

This page defines the single contract model used by this repository and binds all status labels to one taxonomy: **Tier 1 stable**, **Experimental**, **Internal**, and **Planned**.

## Canonical sources of truth

Tier-1 contract is canonical in this order:

1. `src/index.ts` (actual root exports)
2. `docs/stable-api-manifest.json` (declared Tier-1 symbol allowlist)

These two files must match exactly for the same release tag.

## Import-path taxonomy (scope, conditions, evidence)

- **Tier 1 stable**
  - **Scope:** `@its-not-rocket-science/ananke` (root `.` only).
  - **Conditions:** Symbol exists in both `src/index.ts` and `docs/stable-api-manifest.json`.
  - **Evidence:** `src/index.ts`, `docs/stable-api-manifest.json`, `STABLE_API.md`.

- **Experimental**
  - **Scope:** shipped public subpaths without Tier-1 guarantee (for example `./tier2`, domain modules).
  - **Conditions:** Integrator owns minor/patch drift risk and must run upgrade regression tests.
  - **Evidence:** `package.json#exports`, `docs/module-index.md`, `docs/support-boundaries.md`.

- **Internal**
  - **Scope:** advanced/unsafe surfaces intentionally excluded from semver guarantees (for example `./tier3`).
  - **Conditions:** Consumers pin exact versions and accept direct breakage risk.
  - **Evidence:** `docs/module-index.md`, `docs/export-audit.md`.

- **Planned**
  - **Scope:** capabilities described in roadmap documents but not represented as shipped exports.
  - **Conditions:** No compatibility promise exists until artifacts land in source + docs + release checks.
  - **Evidence:** `ROADMAP-v2.md`, `docs/productization-90-day-plan.md`.

## Precedence rules when files disagree

1. `src/index.ts` + `docs/stable-api-manifest.json` determine Tier-1 truth.
2. `package.json` `exports` determines which import paths are shipped.
3. `STABLE_API.md` and `docs/module-index.md` must describe (1) and (2), not redefine them.
4. `README.md`, `docs/bridge-contract.md`, and `docs/wire-protocol.md` are explanatory docs and must defer to this file plus (1)/(2).

## Drift enforcement

`npm run check-public-contract` fails CI when any of these drift:

- `src/index.ts`
- `docs/stable-api-manifest.json`
- `STABLE_API.md`
- `docs/module-index.md`
- `package.json` exports
