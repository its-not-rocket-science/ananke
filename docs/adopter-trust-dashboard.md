# Adopter Trust Dashboard (Single-Page)

_Last updated: 2026-04-10 (UTC)_

This dashboard is intentionally strict: if a claim is not currently enforced by a script, fixture, artifact, or CI workflow in this repo, it is marked **unverified**.

## 1) Stable API status

**Status:** ⚠️ **Partially verified (guardrails exist; latest pass in this edit unverified).**

### What is actually measured
- Tier-1 stable surface is explicitly documented in `STABLE_API.md` and machine-listed in `docs/stable-api-manifest.json`.
- The script `tools/check-stable-api.ts` is wired as `npm run check-stable-api`.
- PR-time API surface diffs are enforced in `.github/workflows/api-diff.yml` via:
  - `tools/api-surface.ts`
  - `tools/api-diff-check.ts`
- Semver compatibility against API surface is enforced in `.github/workflows/semver-check.yml` via `tools/semver-check.ts`.

### Hard truth
- There is **no historical uptime/error-rate metric** for API break attempts in this repo.
- “0 breaking changes in N days” style claims are not computed by an in-repo script in this file.

---

## 2) Versioning status

**Status:** ✅ **Verified for policy + automation presence; release-process health partially unverified.**

### What is actually measured
- Canonical version policy exists in `docs/versioning.md`.
- Version sync between `package.json` and generated runtime version is script-enforced by `tools/sync-version.mjs` (`npm run check-version-sync`).
- Semver compatibility checks for API deltas are enforced in `.github/workflows/semver-check.yml`.
- Release dashboard consistency is generated/checked by `tools/generate-release-dashboard.mjs` (`npm run generate-release-dashboard`, `npm run check-release-dashboard`) and stored in `docs/release-dashboard.md`.

### Hard truth
- This does **not** prove zero release mistakes in practice; it proves only that the checks exist and are codified.
- Signed artifacts / provenance enforcement is **unverified** in current repo automation.

---

## 3) Determinism status

**Status:** ⚠️ **Partially verified (strong automated checks exist; cross-platform determinism remains partially unverified).**

### What is actually measured
- Determinism CI gate exists in `.github/workflows/determinism.yml` and runs `npm run test:determinism` on PR/push.
- Nightly determinism fuzz exists in `.github/workflows/determinism-nightly.yml` (`npm run test:determinism:nightly`).
- Determinism summary generation is scripted in `tools/generate-determinism-summary.mjs`.
- Conformance fixtures capturing deterministic expectations exist under `conformance/*.json` and are consumed by `tools/conformance-runner.ts` (`npm run conformance-runner`).

### Hard truth
- Determinism CI runs primarily on GitHub Linux runners; broad OS/CPU-matrix reproducibility is **unverified**.
- No in-repo longitudinal dashboard for determinism failure rate over time is committed as a first-class artifact.

---

## 4) Benchmark status

**Status:** ⚠️ **Partially verified (benchmark automation exists; signal quality is noisy and partially sampled).**

### What is actually measured
- Benchmark execution and artifact generation scripts exist:
  - `tools/benchmark-dashboard/run.ts`
  - `tools/benchmark-dashboard/check-budget.ts`
  - `tools/benchmark-dashboard/publish-history.ts`
  - `tools/benchmark-dashboard/generate-dashboard.ts`
- CI workflow `.github/workflows/perf-regression.yml`:
  - On `main`: samples only ~1 in 10 commits before running full benchmark artifact updates.
  - On PRs: runs benchmark + budget check and fails on budget violation.
- Historical artifacts exist in `benchmarks/results/` and `benchmarks/history/`.

### Hard truth
- Main-branch sampling means many commits are **not benchmarked**.
- Runner variance is acknowledged in `.github/workflows/nightly.yml` (high threshold), so fine-grained perf regressions can be missed.
- Hardware-normalized benchmarking is **unverified**.

---

## 5) Conformance status

**Status:** ✅ **Verified for fixture-based conformance harness existence; ecosystem-wide host compliance unverified.**

### What is actually measured
- Fixture generation is scripted: `tools/generate-conformance-fixtures.ts`.
- Fixture corpus exists in `conformance/` (state hash, replay parity, bridge snapshot, lockstep sequence, etc.).
- Conformance runner exists: `tools/conformance-runner.ts` (`npm run conformance-runner`).
- Conformance contract and usage are documented in `conformance/README.md`.

### Hard truth
- This proves the reference harness exists; it does **not** prove third-party engines currently pass it.
- Public compatibility matrix of external implementations is **unverified** in-repo.

---

## 6) Docs coverage status

**Status:** ⚠️ **Partially verified (typed examples + tier-1 import hygiene checked; end-to-end docs coverage unverified).**

### What is actually measured
- CI runs docs/example import hygiene via `npm run check-docs-tier1-imports` in `.github/workflows/ci.yml` (script: `tools/check-docs-tier1-imports.mjs`).
- CI runs TypeScript docs example typechecks via `npm run check-doc-ts-examples` in `.github/workflows/ci.yml` (script: `tools/check-doc-ts-examples.mjs`).
- Docs site build workflow exists in `.github/workflows/docs.yml` (Docusaurus build + API doc generation via `tools/generate-api-docs.mjs`).

### Hard truth
- There is **no single quantitative docs coverage % metric** produced by a script in this repo.
- Runtime correctness of every command/snippet in every markdown file is **unverified**.
- Non-TypeScript examples (shell, JSON, conceptual steps) are only partially covered by automation.

---

## 7) Known gaps / roadmap items that affect adopters

Source: `ROADMAP-v2.md` and roadmap-adjacent release/process docs.

### High-impact adopter gaps (brutally honest)
1. **v1.0 not shipped yet** (roadmap target is Q1 2027) → long-term stability expectations should remain conservative.
2. **External adoption proof still maturing** (roadmap calls out external alpha/beta user-count targets) → social proof and integrator battle-testing are incomplete.
3. **Benchmark rigor still evolving** (sampling + noisy CI runners) → treat performance budgets as guardrails, not absolute guarantees.
4. **Conformance ecosystem proof is limited** → harness exists, but broad third-party pass/fail matrix is not published in-repo.
5. **Documentation quality is improving but not fully measured** → onboarding friction for some profiles can remain.

### What this means for adopters today
- Safe path: pin exact versions/commits for production determinism-sensitive use.
- Expectation setting: treat current process as **pre-1.0 disciplined pre-release**, not mature LTS governance.
- Integration strategy: run your own conformance + determinism checks in your target environment before rollout.

---

## Summary verdict

- **Strongest trust signals today:** deterministic testing infrastructure, conformance fixtures, API diff + semver gates, release/dashboard automation.
- **Weakest trust signals today:** cross-platform determinism proof, universal docs execution coverage, benchmark signal precision, external compatibility/adoption evidence.
- **Overall adopter confidence level:** **moderate for advanced evaluators, cautious for production-critical adopters**.
