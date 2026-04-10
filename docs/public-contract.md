# Public Contract Canonicalization

This page defines the **single contract model** used by this repository.

## Canonical sources of truth

Tier-1 contract is canonical in this order:

1. `src/index.ts` (actual root exports)
2. `docs/stable-api-manifest.json` (declared Tier-1 symbol allowlist)

These two files must match exactly.

## Import-path categories

- **root-stable**: `@its-not-rocket-science/ananke` symbols that exist in both `src/index.ts` and `docs/stable-api-manifest.json`.
- **subpath-stable**: intentionally versioned subpath APIs with explicit stability guarantees in docs. **Current state: none declared globally in this repo-level contract.**
- **experimental**: shipped public subpaths with no Tier-1 guarantee (for example `./tier2`, domain modules).
- **internal**: advanced/unsafe surfaces that are shipped but explicitly not semver-stable for integrators (for example `./tier3`).

## Precedence rules when files disagree

1. `src/index.ts` + `docs/stable-api-manifest.json` determine Tier-1 truth.
2. `package.json` `exports` determines which public import paths are shipped.
3. `STABLE_API.md` and `docs/module-index.md` must describe (1) and (2), not redefine them.
4. `README.md`, `docs/bridge-contract.md`, and `docs/wire-protocol.md` are explanatory docs and must defer to this file plus (1)/(2).

## Drift enforcement

`npm run check-public-contract` fails CI when any of these drift:

- `src/index.ts`
- `docs/stable-api-manifest.json`
- `STABLE_API.md`
- `docs/module-index.md`
- `package.json` exports

