# Ananke — Module Index

Canonical policy: `docs/public-contract.md`.

- **Tier 1 stable** is root only (`@its-not-rocket-science/ananke`).
- Subpaths default to **Shipped but undocumented** in the canonical inventory unless explicitly labeled otherwise.



## Stability labels (taxonomy-bound)

<!-- CONTRACT:STABILITY_LABELS:start -->
```json
[
  { "kind": "subpath", "subject": ".", "status": "Tier 1 stable", "notes": "Root entrypoint" },
  { "kind": "subpath", "subject": "./tier2", "status": "Experimental", "notes": "Tier-2 barrel" },
  { "kind": "subpath", "subject": "./tier3", "status": "Internal", "notes": "Tier-3 barrel" }
]
```
<!-- CONTRACT:STABILITY_LABELS:end -->

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

- **Experimental**: `./tier2`.
- **Internal**: `./tier3`.
- **Shipped but undocumented**: all remaining exported subpaths (`./tier2` and `./tier3` excluded).
- **Stable subpath**: none declared at this time in the repo-level contract.

For bridge and wire-specific behavior docs, see `docs/bridge-contract.md` and `docs/wire-protocol.md`.
