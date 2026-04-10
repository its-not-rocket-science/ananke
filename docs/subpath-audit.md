# Public Subpath Usability Audit

Audit date: 2026-04-10.

## Method
- Inventory source: `package.json#exports`.
- Build verification: `npm run build` (project-level TypeScript build).
- d.ts verification: each export `types` target exists on disk after build.
- Documentation/example verification: checked for an import example and a linked destination in docs.
- Stability verification: checked against `docs/export-status-matrix.md`.

## Inventory and checks

| Subpath | Purpose clarity | Stability explicit | Builds | d.ts output | Working import example | Linked doc destination | Notes |
|---|---|---|---|---|---|---|---|
| `.` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Root entrypoint; Tier-1 stable. Status: Tier 1 stable. |
| `./species` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Patched in docs/subpath-reference.md. Status: Shipped but undocumented. |
| `./polity` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Patched in docs/subpath-reference.md. Status: Shipped but undocumented. |
| `./catalog` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Patched in docs/subpath-reference.md. Status: Shipped but undocumented. |
| `./character` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Patched in docs/subpath-reference.md. Status: Shipped but undocumented. |
| `./combat` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Patched in docs/subpath-reference.md. Status: Shipped but undocumented. |
| `./campaign` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Patched in docs/subpath-reference.md. Status: Shipped but undocumented. |
| `./campaign-layer` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./social` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Patched in docs/subpath-reference.md. Status: Shipped but undocumented. |
| `./narrative` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./narrative-layer` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./anatomy` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./crafting` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./competence` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./wasm-kernel` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./narrative-prose` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./renown` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./kinship` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./succession` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./calendar` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./feudal` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./diplomacy` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./migration` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./espionage` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./trade-routes` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./siege` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./faith` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./demography` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./granary` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./epidemic` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./infrastructure` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./unrest` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./research` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./taxation` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./military-campaign` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./governance` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./resources` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./climate` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./famine` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./containment` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./mercenaries` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./wonders` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./monetary` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./schema` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Patched in docs/subpath-reference.md. Status: Shipped but undocumented. |
| `./schema-migration` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./content-pack` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Patched in docs/subpath-reference.md. Status: Shipped but undocumented. |
| `./content` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./terrain-bridge` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./atmosphere` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./extended-senses` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./host-loop` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./netcode` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Patched in docs/subpath-reference.md. Status: Shipped but undocumented. |
| `./conformance` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |
| `./tier2` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Experimental. |
| `./tier3` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Internal. |
| `./data-governance` | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Public export present, but no dedicated per-subpath usage block yet. Status: Shipped but undocumented. |

## Weak subpaths

Weak = missing dedicated purpose/example/doc-link coverage in this audit pass.

- `./anatomy`
- `./atmosphere`
- `./calendar`
- `./campaign-layer`
- `./climate`
- `./competence`
- `./conformance`
- `./containment`
- `./content`
- `./crafting`
- `./data-governance`
- `./demography`
- `./diplomacy`
- `./epidemic`
- `./espionage`
- `./extended-senses`
- `./faith`
- `./famine`
- `./feudal`
- `./governance`
- `./granary`
- `./host-loop`
- `./infrastructure`
- `./kinship`
- `./mercenaries`
- `./migration`
- `./military-campaign`
- `./monetary`
- `./narrative`
- `./narrative-layer`
- `./narrative-prose`
- `./renown`
- `./research`
- `./resources`
- `./schema-migration`
- `./siege`
- `./succession`
- `./taxation`
- `./terrain-bridge`
- `./tier2`
- `./tier3`
- `./trade-routes`
- `./unrest`
- `./wasm-kernel`
- `./wonders`

## Top-priority fixes completed

Added explicit purpose + stability + import example + doc destination for:
- `./species` → [docs/subpath-reference.md](./subpath-reference.md)
- `./combat` → [docs/subpath-reference.md](./subpath-reference.md)
- `./campaign` → [docs/subpath-reference.md](./subpath-reference.md)
- `./polity` → [docs/subpath-reference.md](./subpath-reference.md)
- `./character` → [docs/subpath-reference.md](./subpath-reference.md)
- `./catalog` → [docs/subpath-reference.md](./subpath-reference.md)
- `./social` → [docs/subpath-reference.md](./subpath-reference.md)
- `./netcode` → [docs/subpath-reference.md](./subpath-reference.md)
- `./schema` → [docs/subpath-reference.md](./subpath-reference.md)
- `./content-pack` → [docs/subpath-reference.md](./subpath-reference.md)