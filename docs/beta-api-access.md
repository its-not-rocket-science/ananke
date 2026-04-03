# Beta API Access (Tier 2 / Tier 3)

Tier 2 and Tier 3 modules are available for advanced users who need early access to evolving systems.

## Risk warning

> ⚠️ Tier 2/3 APIs are not semver-stable and may change in minor or patch releases.
>
> Tier 1 stability dashboard target remains: **Tier 1 API Health ✅ 0 breaking changes in 90 days**.

If you consume Tier 2/3 APIs in production:

- pin exact versions (for example `@its-not-rocket-science/ananke@1.2.7`)
- run integration tests against every update
- expect occasional migration work

## How to import

Use explicit subpath imports:

```ts
import { somethingExperimental } from "@its-not-rocket-science/ananke/tier2";
import { unstableKernelHook } from "@its-not-rocket-science/ananke/tier3";
```

Do **not** import Tier 2/3 symbols from the root package path.

## Promotion path to Tier 1

A Tier 2/3 API can move to Tier 1 after:

1. practical use in external integrations
2. stable naming and behavior over multiple releases
3. test coverage and docs comparable to current Tier 1 standards
4. explicit promotion in changelog/release notes
