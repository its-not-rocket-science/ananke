# Support Boundaries

This document defines what maintainers of `@its-not-rocket-science/ananke` promise to adopters, what they do **not** promise, and where adopters should pin versions conservatively.

## What maintainers promise

1. **Tier-1 root API is the semver support boundary.**
   - Imports from `@its-not-rocket-science/ananke` listed in `STABLE_API.md` and `docs/stable-api-manifest.json` are the maintained compatibility surface.
   - Breaking changes to this root Tier-1 surface are expected to follow semver and be called out in `CHANGELOG.md` with migration guidance.

2. **Deterministic-kernel intent is maintained within a pinned runtime envelope.**
   - For the same seed, command stream, tick count, and engine version, maintainers aim for reproducible outcomes.
   - Determinism guarantees are scoped to supported host usage patterns documented in `docs/host-contract.md` and related determinism docs.

3. **Documentation and contract artifacts are treated as release artifacts.**
   - `STABLE_API.md`, `docs/module-index.md`, and contract docs are expected to stay aligned with shipped exports.
   - Changes to support boundaries are expected to land with docs updates in the same release window.

## What maintainers do not promise

1. **No blanket stability for subpath imports.**
   - Subpaths (for example `@its-not-rocket-science/ananke/tier2`, domain subpaths, and `tier3`) are shipped but are not covered by the Tier-1 root semver contract unless explicitly marked stable.

2. **No turnkey host stack guarantees.**
   - The project does not promise a complete networking stack, renderer, editor toolchain, or production hosting architecture.

3. **No universal migration coverage for all historical data by default.**
   - Schema migration support is real but path-dependent; only registered migration edges are guaranteed to run.

4. **No promise that benchmarks or examples are production SLO guarantees.**
   - Benchmark numbers and examples are confidence and integration aids, not a guarantee of your production latency/cost profile.

## Where adopters should pin versions carefully

Use conservative version pinning in the following areas:

- **Any subpath import** (`/tier2`, `/tier3`, and domain subpaths): pin at least exact minor (`~x.y.z`) and prefer exact patch (`x.y.z`) for production.
- **Bridge runtime integrations** (`BridgeEngine` and mapping/interpolation helpers on `/tier2`): prefer exact patch pinning and re-run bridge integration tests before upgrades.
- **Schema-migration pipelines**: pin exact patch in systems that must load long-lived persisted snapshots and validate migration paths before rollout.
- **Internal/advanced transports** (for example tier3 diff helpers): treat as internal/advanced and pin exact patch.

## Practical adoption policy (recommended)

- If you need low-maintenance upgrades, stay on Tier-1 root imports only.
- If you adopt subpaths, budget explicit upgrade/testing work each release.
- Gate every dependency upgrade with:
  1. `npm run build`
  2. first-hour smoke (`npm run test:first-hour-smoke`)
  3. your host integration regression suite.
