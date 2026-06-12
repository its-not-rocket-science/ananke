# Public API Drift Audit Report

Tier-1 contract source of truth:
- `src/index.ts`
- `docs/stable-api-manifest.json`

Audit scope:
- `README.md`
- `docs/**/*.md`
- `examples/` code/doc examples

## Findings

| File | Outdated symbol/path | Why it conflicts with Tier-1 | Recommended fix |
|---|---|---|---|
| `docs/cookbook.md` | `generateIndividual` imported from `@its-not-rocket-science/ananke` | `generateIndividual` is not exported by Tier-1 root (`src/index.ts` / stable manifest). | Import species-generation APIs from `@its-not-rocket-science/ananke/species` and keep Tier-1 imports limited to Tier-1 symbols. |
| `docs/cookbook.md` | `Archetype` imported from `@its-not-rocket-science/ananke` | `Archetype` is not in the Tier-1 stable symbol list. | Use `SpeciesDefinition` from `@its-not-rocket-science/ananke/species` for the example type. |
| `docs/cookbook.md` | `Item` imported from `@its-not-rocket-science/ananke` | `Item` is not exported by Tier-1 root. | Remove Tier-1 root type import and use an untyped literal (or a non-Tier-1 subpath if the example explicitly targets experimental APIs). |
| `docs/cookbook.md` | `TechEra` imported from `@its-not-rocket-science/ananke` | `TechEra` is not in Tier-1 stable exports. | Avoid Tier-1 root import for `TechEra`; use explicit numeric era in snippet comment or move to a non-Tier-1 subpath example. |
| `docs/cookbook.md` | `eventSeed`, `makeRng` imported from `@its-not-rocket-science/ananke` | Neither symbol is exported from Tier-1 root. | Replace snippet with a local deterministic PRNG helper to avoid implying Tier-1 support for these functions. |
| `docs/project-overview.md` | `mkWorld` imported from `@its-not-rocket-science/ananke` | `mkWorld` is not in Tier-1 manifest. | Use `createWorld` from Tier-1 root. |
| `docs/recipes-matrix.md` | `serializeBridgeFrame` imported from `@its-not-rocket-science/ananke` | `serializeBridgeFrame` is not a Tier-1 root export (it is available via host-loop subpath). | Import from `@its-not-rocket-science/ananke/host-loop`. |
| `docs/wire-protocol.md` | `diffWorldState`, `packDiff`, `unpackDiff`, `applyDiff` imported from `@its-not-rocket-science/ananke` | These symbols are not exported by Tier-1 root. | Import from `@its-not-rocket-science/ananke/tier3` and label as internal/unstable usage. |

## Applied doc fixes

All entries above were patched to make Tier-1-root examples copy-paste correct and aligned with the stable manifest.

## Added guardrail

A CI/docs check now verifies that any named import from `@its-not-rocket-science/ananke` in docs/examples only references symbols present in `docs/stable-api-manifest.json`.
