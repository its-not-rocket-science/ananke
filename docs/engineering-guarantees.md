# Engineering Guarantees

This page summarizes what this package guarantees, how each guarantee is enforced, what evidence is published, and what adopters must still validate in their own environment.

## 1) What is guaranteed

1. **Tier-1 API stability is guaranteed only for root imports** from `@its-not-rocket-science/ananke` as listed in `STABLE_API.md` and `docs/stable-api-manifest.json`.
2. **Deterministic outcomes are guaranteed only inside the documented envelope**: same initial state, same command stream, same tick count, and same package version.
3. **Release readiness is guaranteed only when release gates pass** (build, tests, determinism suites, and trust evidence checks).
4. **Subpath imports are shipped but not Tier-1 stable unless explicitly documented otherwise**.

## 2) How guarantees are enforced

- API compatibility checks run in CI (`api-diff.yml`, `semver-check.yml`) and are documented in `docs/api-lifecycle.md`.
- Public contract drift checks (`npm run check-public-contract`) fail when exports/manifest/docs diverge.
- Determinism checks run through deterministic suites and release checks (`npm run test:determinism`, `npm run release-check`).
- Trust and release evidence are validated by generated dashboards and freshness checks (`docs/trust-dashboard.md`, `docs/release-readiness-bundle.md`).

## 3) What evidence exists

- **Stable API evidence:** `STABLE_API.md`, `docs/stable-api-manifest.json`, `docs/public-contract.md`.
- **Determinism evidence:** `docs/determinism-status.md`, `docs/determinism-proof.md`, determinism regression/fuzz suites under `test/determinism/`.
- **Trust/release evidence:** `docs/trust-dashboard.md`, `docs/release-dashboard.md`, `docs/release-readiness-bundle.md`.
- **Support-scope evidence:** `docs/support-boundaries.md`, `docs/module-index.md`, `package.json` exports map.

## 4) What still requires adopter-side testing

Adopters must still run tests for anything outside maintainer-controlled guarantees:

1. Host integration correctness (network ordering, persistence/replay IO, renderer coupling).
2. Platform matrix fit (OS/CPU/runtime combinations used in production).
3. Performance and latency budgets on production-like hardware.
4. Upgrade safety for experimental/internal subpaths and host-owned extension points.
5. Operational behavior (deploy/rollback, observability, incident handling) in the adopter environment.

In short: this package guarantees bounded kernel/API contracts; adopters still own end-to-end system validation.
