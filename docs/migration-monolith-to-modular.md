# Migration Guide: Monolith to Modular Packages

This guide covers how to migrate from `@its-not-rocket-science/ananke` to the
focused `@ananke/*` packages.  Migration is optional — the monolith package is
maintained indefinitely for backwards compatibility.

---

## Should you migrate?

| Situation | Recommendation |
|-----------|----------------|
| Existing project, everything working | Stay on the monolith. No action required. |
| New project, only needs combat | Start with `@ananke/combat` + `@ananke/core` |
| New project, full simulation stack | Use the monolith; migrate to modular when convenient |
| Bundle size is a concern (Phase 2+) | Migrate after Phase 2 (source migration) for real tree-shaking |

---

## Phase 1 Migration (stubs — available now)

Phase 1 packages are thin wrappers that re-export from the monolith.  Bundle
size is unchanged, but import paths are cleaner and signal which API tier you
depend on.

### Step 1 — Install the sub-package(s) you need

```bash
# Combat-only host
npm install @ananke/core @ananke/combat

# Full world simulation
npm install @ananke/core @ananke/combat @ananke/campaign @ananke/content
```

The monolith is installed automatically as a peer dependency.

### Step 2 — Update imports

Replace monolith paths with the appropriate package name:

| Old import | New import |
|-----------|-----------|
| `@its-not-rocket-science/ananke` | `@ananke/core` |
| `@its-not-rocket-science/ananke/combat` | `@ananke/combat` |
| `@its-not-rocket-science/ananke/anatomy` | `@ananke/combat` |
| `@its-not-rocket-science/ananke/competence` | `@ananke/combat` |
| `@its-not-rocket-science/ananke/wasm-kernel` | `@ananke/combat` |
| `@its-not-rocket-science/ananke/species` | `@ananke/content` |
| `@its-not-rocket-science/ananke/catalog` | `@ananke/content` |
| `@its-not-rocket-science/ananke/character` | `@ananke/content` |
| `@its-not-rocket-science/ananke/crafting` | `@ananke/content` |
| `@its-not-rocket-science/ananke/campaign` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/polity` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/social` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/narrative` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/narrative-prose` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/renown` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/kinship` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/succession` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/calendar` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/feudal` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/diplomacy` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/migration` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/espionage` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/trade-routes` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/siege` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/faith` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/demography` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/granary` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/epidemic` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/infrastructure` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/unrest` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/research` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/taxation` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/military-campaign` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/governance` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/resources` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/climate` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/famine` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/containment` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/mercenaries` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/wonders` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/monetary` | `@ananke/campaign` |

### Step 3 — Verify

```bash
npm run build   # or tsc --noEmit
npm test
```

No other changes are needed.

---

## Phase 2 Migration (source migration — planned)

When Phase 2 lands, `@ananke/combat` will no longer depend on the monolith.
The import paths remain identical — only the transitive dependency graph changes.

**No code changes required in your project for Phase 2.**

Run `npm update` when the new versions are published; your bundler will
automatically produce a smaller output.

---

## Staying on the monolith

If you prefer to keep using `@its-not-rocket-science/ananke` directly, nothing
changes.  The 41 subpath exports are stable and will not be removed.

---

## See also

- [`docs/package-architecture.md`](package-architecture.md) — full design document and source file mapping
- [`docs/module-index.md`](module-index.md) — all exports with stability tiers and use cases
- [`STABLE_API.md`](../STABLE_API.md) — stable API surface (Tier 1)
