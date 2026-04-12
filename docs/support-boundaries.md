# Support Boundaries

This document defines the taxonomy-bound support contract for `@its-not-rocket-science/ananke`.

## Claim ledger (scope, conditions, evidence)

- **Claim:** The **Tier 1 stable** compatibility contract is limited to root imports from `@its-not-rocket-science/ananke`.
  - **Scope:** Root entrypoint (`.`) exports only.
  - **Conditions:** The imported symbol must exist in both `src/index.ts` and `docs/stable-api-manifest.json` for the same release.
  - **Evidence:** `src/index.ts`, `docs/stable-api-manifest.json`, `STABLE_API.md`, `docs/module-index.md`.

- **Claim:** Determinism compatibility is **Tier 1 stable** only for the documented host envelope.
  - **Scope:** Reproducibility for fixed seed + command stream + tick count + package version.
  - **Conditions:** Integrators follow `docs/host-contract.md` constraints and do not use Internal APIs for state mutation.
  - **Evidence:** `docs/host-contract.md`, `docs/determinism-proof.md`, `test/determinism/regression.spec.ts`.

- **Claim:** Subpath APIs are **Experimental** unless a subpath is explicitly labelled **Tier 1 stable** in contract docs.
  - **Scope:** `@its-not-rocket-science/ananke/tier2` and domain subpaths in `package.json#exports`.
  - **Conditions:** Treat each release as requiring explicit upgrade testing before production rollout.
  - **Evidence:** `package.json` exports map, `docs/module-index.md`, `docs/subpath-reference.md`.

- **Claim:** `@its-not-rocket-science/ananke/tier3` is **Internal** and excluded from Tier-1 semver guarantees.
  - **Scope:** Tier-3 import path and symbols reachable from it.
  - **Conditions:** Consumers pin exact patch versions and own breakage risk.
  - **Evidence:** `docs/module-index.md`, `docs/export-status-matrix.md`, `docs/export-audit.md`.

- **Claim:** Full turnkey host stack guarantees (renderer, networking, deployment architecture) are **Planned**, not in the current package contract.
  - **Scope:** End-to-end production platform responsibilities outside this package boundary.
  - **Conditions:** Teams must validate their own SLOs and operational fit.
  - **Evidence:** `docs/project-overview.md`, `docs/productization-90-day-plan.md`, `docs/integration-primer.md`.

## Upgrade policy

- For **Tier 1 stable** usage, minor/patch upgrades are expected to preserve API compatibility under semver.
- For **Experimental** usage, pin at least `~x.y.z`; prefer exact `x.y.z` for production.
- For **Internal** usage, pin exact `x.y.z` and gate upgrades on full regression runs.
- For **Planned** capabilities, treat roadmap language as intent and ship only against published artifacts.

## Release-gate checks

Run these checks before promoting a dependency update:

1. `npm run build`
2. `npm run test:first-hour-smoke`
3. host integration regression suite for your deployment target
