# Ananke — Module Index

Canonical policy: `docs/public-contract.md`.

- Tier-1 is **root only** (`@its-not-rocket-science/ananke`).
- Subpaths are shipped-but-not-Tier-1 unless explicitly marked otherwise.

## Root-stable

| Import path | Category | Notes |
|---|---|---|
| `@its-not-rocket-science/ananke` | root-stable | Canonical Tier-1. |

## Subpath exports (shipped-but-not-Tier-1)

<!-- CONTRACT:SUBPATH_EXPORTS:start -->
```json
[
  "./anatomy",
  "./atmosphere",
  "./calendar",
  "./campaign",
  "./campaign-layer",
  "./catalog",
  "./character",
  "./climate",
  "./combat",
  "./competence",
  "./conformance",
  "./containment",
  "./content",
  "./content-pack",
  "./crafting",
  "./data-governance",
  "./demography",
  "./diplomacy",
  "./epidemic",
  "./espionage",
  "./extended-senses",
  "./faith",
  "./famine",
  "./feudal",
  "./governance",
  "./granary",
  "./host-loop",
  "./infrastructure",
  "./kinship",
  "./mercenaries",
  "./migration",
  "./military-campaign",
  "./monetary",
  "./narrative",
  "./narrative-layer",
  "./narrative-prose",
  "./netcode",
  "./polity",
  "./renown",
  "./research",
  "./resources",
  "./schema",
  "./schema-migration",
  "./siege",
  "./social",
  "./species",
  "./succession",
  "./taxation",
  "./terrain-bridge",
  "./tier2",
  "./tier3",
  "./trade-routes",
  "./unrest",
  "./wasm-kernel",
  "./wonders"
]
```
<!-- CONTRACT:SUBPATH_EXPORTS:end -->

### Subpath classification

- **experimental**: every subpath except `./tier3`.
- **internal**: `./tier3`.
- **subpath-stable**: none declared at this time in the repo-level contract.

For bridge and wire-specific behavior docs, see `docs/bridge-contract.md` and `docs/wire-protocol.md`.
