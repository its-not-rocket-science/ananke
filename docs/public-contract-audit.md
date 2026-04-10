# Public Contract Audit Report

Date: 2026-04-10

Scope audited:

- `README.md`
- `STABLE_API.md`
- `docs/stable-api-manifest.json`
- `docs/module-index.md`
- `docs/bridge-contract.md`
- `docs/wire-protocol.md`
- `package.json` exports
- `src/index.ts`

## Mismatches found

1. `docs/module-index.md` claimed `"./polity"` as Tier-1 stable, while canonical Tier-1 is root-only in `src/index.ts` + manifest.
2. `docs/module-index.md` listed root key export `generateIndividual`, which is not in Tier-1 manifest.
3. Tier labeling across docs mixed “Tier-2” with shipped/public status but did not consistently say shipped-but-not-Tier-1.
4. No single precedence page explained what wins if docs disagree.
5. No CI check enforced drift across `src/index.ts`, manifest, `STABLE_API.md`, `docs/module-index.md`, and `package.json` exports.

## Fixes applied

- Rewrote `STABLE_API.md` to include machine-checked Tier-1 symbol block.
- Rewrote `docs/module-index.md` to list shipped subpaths from `package.json` exports as shipped-but-not-Tier-1.
- Added `docs/public-contract.md` with canonical sources, categories, and precedence rules.
- Updated `README.md` to point to `docs/public-contract.md` and clarify subpath status.
- Updated `docs/bridge-contract.md` / `docs/wire-protocol.md` wording to explicitly call out shipped-but-not-Tier-1 surfaces.
- Added `tools/check-public-contract.ts` and CI wiring so these files cannot silently drift.

