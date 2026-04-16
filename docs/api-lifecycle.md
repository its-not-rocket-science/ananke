# Tier 1 API Lifecycle Policy

This project treats `src/index.ts` exports as **Tier 1 stable API**. Once exported in Tier 1, the symbol is covered by semantic versioning guarantees.

## Deprecation policy

When you need to retire a Tier 1 API:

1. Keep the existing export in place.
2. Add a `@deprecated` JSDoc tag with:
   - replacement API (if one exists)
   - removal target major version
3. Keep the deprecated API for **at least one full major version**.
4. Remove only during the next major release.

### Example

```ts pseudocode
/** @deprecated Use `stepWorld` instead. Will be removed in v2.0.0. */
export function step(world: WorldState): WorldState {
  return stepWorld(world);
}
```

## CI gates that enforce this promise

- `api-diff.yml` compares Tier 1 API surface on PR branch vs `main`.
- Any Tier 1 breaking change (kind/param/type/removal) fails CI unless the PR carries a matching major version bump.
- `semver-check.yml` ensures version bump matches API change category.
- API health indicators are derived from CI checks (`api-diff.yml`, `semver-check.yml`) and current repository artifacts.

## Compatibility matrix

- Breaking API change: **major** (`1.x` → `2.0.0`)
- New backwards-compatible Tier 1 export: **minor** (`1.2.x` → `1.3.0`)
- Internal fixes/no Tier 1 API change: **patch** (`1.2.3` → `1.2.4`)
