# Migration guide: monolith to modular imports (state-aware)

This guide separates what is available **today** from what is **planned** so adopters can migrate with accurate expectations.

---

## Current state (available now)

- `@its-not-rocket-science/ananke` is the primary shipped package.
- `@ananke/core`, `@ananke/combat`, `@ananke/campaign`, and `@ananke/content` are currently Phase 1 wrappers that re-export from the monolith.
- Result: changing imports can improve API clarity, but does not yet create full package isolation or guaranteed bundle-size reductions.

## In progress (partial implementation)

- Package-boundary definitions and checks exist and are actively used.
- Boundary cleanup and source ownership migration are still ongoing.
- Until that migration is complete, modular packages should be treated as compatibility entrypoints, not fully separated codebases.

## Target state (planned)

- Each `@ananke/*` package will own implementation and build artifacts.
- Dependency relationships between packages will match the declared modular DAG.
- The monolith remains as a compatibility/meta package for teams that prefer one dependency.

---

## Should you migrate now?

| Situation | Recommendation today |
|---|---|
| Existing project that already works on monolith imports | Staying on monolith is valid; no urgent change required. |
| New project that wants explicit domain-oriented imports | Use `@ananke/*` imports, understanding they are wrappers in Phase 1. |
| Team expecting immediate tree-shaking/size wins from modular packages | Wait for source-ownership migration milestones before expecting those gains. |

---

## Migration steps you can do today

### 1) Install wrapper packages

```bash
# Example: combat-oriented app
npm install @ananke/core @ananke/combat

# Example: broader simulation app
npm install @ananke/core @ananke/combat @ananke/campaign @ananke/content
```

These packages currently peer on `@its-not-rocket-science/ananke`.

### 2) Update imports

Use modular package names instead of monolith subpaths where practical.

| Old import | Current modular import |
|---|---|
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
| `@its-not-rocket-science/ananke/renown` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/kinship` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/succession` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/diplomacy` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/migration` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/trade-routes` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/military-campaign` | `@ananke/campaign` |
| `@its-not-rocket-science/ananke/governance` | `@ananke/campaign` |

> Note: for APIs not listed above, keep using monolith subpaths until corresponding modular wrapper/package coverage is explicitly documented.

### 3) Verify build and tests

```bash
npm run build
npm test
```

---

## What this means for adopters today

- Treat current migration as an import-surface alignment step.
- Do not treat it as proof that implementation has already moved out of the monolith.
- Adopting modular imports now can reduce future churn once target modular ownership lands.

---

## Related docs

- [`docs/package-architecture.md`](package-architecture.md)
- [`docs/module-index.md`](module-index.md)
- [`STABLE_API.md`](../STABLE_API.md)
