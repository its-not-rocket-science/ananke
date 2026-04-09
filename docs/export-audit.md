# Export Surface Audit (April 9, 2026)

This audit reviews `package.json` subpath exports for discoverability and overload, and proposes a non-breaking improvement plan.

## Scope

- Source of truth: `package.json` `exports` map.
- Constraint: keep backward compatibility (no removals/renames).

## 1) Export classification

### Essential (default onboarding path)

These are the minimum set users should encounter first in docs and quickstarts.

| Export | Why essential |
|---|---|
| `.` | Tier 1 stable root API; best first import for most hosts. |
| `./polity` | Only explicit Tier 1 domain module today; strategy/world hosts need it early. |
| `./combat` | Common second-step module for tactical hosts. |
| `./campaign` | Canonical campaign runtime entry point. |
| `./species` | Core content-model customization path. |
| `./host-loop` | Practical host integration path used by engine sidecars. |
| `./netcode` | Core multiplayer determinism workflow. |
| `./schema` | Serialization/migration compatibility boundary. |

### Sensible domain exports (good discoverability when grouped)

These are coherent domain APIs, but should be navigated by grouped index pages rather than a flat list.

| Export |
|---|
| `./catalog`, `./character`, `./social`, `./narrative`, `./narrative-prose`, `./renown` |
| `./anatomy`, `./crafting`, `./competence`, `./wasm-kernel` |
| `./kinship`, `./succession`, `./calendar`, `./feudal`, `./diplomacy`, `./migration`, `./espionage`, `./trade-routes` |
| `./siege`, `./faith`, `./demography`, `./granary`, `./epidemic`, `./infrastructure`, `./unrest`, `./research`, `./taxation` |
| `./military-campaign`, `./governance`, `./resources`, `./climate`, `./famine`, `./containment`, `./mercenaries`, `./wonders`, `./monetary` |
| `./content`, `./content-pack`, `./terrain-bridge`, `./atmosphere`, `./extended-senses` |

### Obscure / low-discoverability exports

These are valid and useful, but are difficult to discover correctly without explicit guidance.

| Export | Discoverability issue |
|---|---|
| `./conformance` | Specialist workflow; not a common consumer entry point. |
| `./tier2` | Aggregator path is convenient but can blur module ownership. |
| `./tier3` | Internal/unstable surface; should be intentionally gated in docs. |
| `./data-governance` | Niche operational module, not typical simulation start path. |
| `./campaign-layer` *(added alias)* | Naming-clarity alias; mostly for users guessing filename-based subpaths. |
| `./narrative-layer` *(added alias)* | Naming-clarity alias for current `./narrative` target module. |
| `./schema-migration` *(added alias)* | Naming-clarity alias for current `./schema` target module. |

## 2) Recommended regrouping plan (non-breaking)

Use docs-level grouping while keeping all existing exports intact:

1. **Stable first (Tier 1 card):** `.` and `./polity`.
2. **Common workflows (Tier 2 quick picks):** `./combat`, `./campaign`, `./species`, `./host-loop`, `./netcode`, `./schema`.
3. **Domain clusters:**
   - **Combat & Characters:** `./combat`, `./character`, `./anatomy`, `./competence`, `./extended-senses`.
   - **Campaign Governance:** all civilization/campaign extensions.
   - **Narrative & Social:** `./social`, `./narrative`, `./narrative-prose`, `./renown`, `./kinship`.
   - **Content & Modding:** `./content`, `./content-pack`, `./catalog`, `./species`, `./crafting`.
   - **Host/Platform:** `./host-loop`, `./netcode`, `./schema`, `./wasm-kernel`, `./terrain-bridge`, `./conformance`.
4. **Advanced/Internal bucket:** explicitly isolate `./tier2`, `./tier3`, `./data-governance`.

## 3) Docs/index improvements

1. Add a **single canonical export index page** sectioned by:
   - Tier
   - Domain cluster
   - “Start here” tags
   - “Advanced/internal” warnings
2. Generate docs from `package.json` exports (scripted), then enrich with curated metadata:
   - short purpose
   - maturity tier
   - top 3 symbols
   - canonical recipe links
3. Show **equivalence aliases** in tables:
   - `./campaign` ↔ `./campaign-layer`
   - `./narrative` ↔ `./narrative-layer`
   - `./schema` ↔ `./schema-migration`
4. Add **import decision tree** near top of `docs/module-index.md`:
   - “I need deterministic multiplayer” → `.` + `./host-loop` + `./netcode`
   - “I need strategy sim” → `.` + `./polity` + `./campaign` + selected extensions

## 4) Non-breaking export additions recommended

Implemented in this change:

- `./campaign-layer` → alias to `./campaign` target.
- `./narrative-layer` → alias to `./narrative` target.
- `./schema-migration` → alias to `./schema` target.

Rationale:

- improves filename-intuition imports,
- reduces “module not found” from guessed subpaths,
- preserves all existing imports unchanged.
