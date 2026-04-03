# Beta API Access (Tier 2 / Tier 3)

Tier 2 and Tier 3 APIs are intended for fast iteration and experimentation.

## Risk warning

> ⚠️ Tier 2/3 APIs are **not semver-stable**. They may change in minor or patch releases.

If you ship production code, prefer Tier 1 (`src/index.ts`) for strict compatibility guarantees.

## Safe usage guidance

- Import Tier 2/3 through explicit subpaths (for example `@its-not-rocket-science/ananke/tier2`).
- Wrap beta integrations behind your own adapter layer.
- Pin exact versions when using Tier 2/3 in production pipelines.
- Monitor release notes for migration instructions.

## Graduation path

When a Tier 2/3 API proves stable and broadly useful, it can be promoted to Tier 1 through:

1. API review.
2. Baseline capture by API surface tooling.
3. Semver policy enforcement in CI.
