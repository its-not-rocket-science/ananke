# Contributing to Ananke

Thank you for your interest in contributing.  Ananke is a physics-first simulation engine
with a strong commitment to determinism, fixed-point arithmetic, and empirical validation.
Every contribution must preserve those guarantees.

---

## Table of contents

1. [Quick start for contributors](#1-quick-start-for-contributors)
2. [Code style](#2-code-style)
3. [Non-negotiable rules](#3-non-negotiable-rules)
4. [API stability tiers](#4-api-stability-tiers)
5. [Test and coverage requirements](#5-test-and-coverage-requirements)
6. [PR checklist](#6-pr-checklist)
7. [Contributing datasets](#7-contributing-datasets)
8. [Proposing a new simulation phase](#8-proposing-a-new-simulation-phase)
9. [Contributing a renderer plugin](#9-contributing-a-renderer-plugin)
10. [Decision process](#10-decision-process)

---

## 1. Quick start for contributors

```bash
git clone <repo>
npm ci
npm run build          # TypeScript → dist/
npm test               # Vitest unit tests
npm run test:coverage  # Tests + coverage report
```

Coverage thresholds enforced in CI (build fails if broken):

| Metric | Minimum |
|--------|---------|
| Statements | 90% |
| Branches | 80% |
| Functions | 85% |
| Lines | 90% |

---

## 2. Code style

- **TypeScript strict mode** — `strict: true`, `exactOptionalPropertyTypes: true`
- **No `any`** — use `unknown` and narrow
- **Fixed-point everywhere in `src/`** — use `q()`, `qMul()`, `clampQ()` from `src/units.ts`
- **No `Math.random()` in `src/`** — use `makeRng(eventSeed(...))` from `src/rng.ts`
- **SI units** — every physical quantity has a unit suffix (`_N`, `_J`, `_kg`, `_m`, `_mps`,
  `_s`, `_W`, `_Q`) and uses the corresponding `SCALE.*` constant
- **No floating point in the simulation path** — intermediate results must stay fixed-point
- **File headers** — start every new `src/` file with a comment block citing the Phase number,
  a one-paragraph description, the public API, and the phases it depends on (see any existing
  `src/sim/*.ts` file as a template)
- **Export discipline** — only export what is part of the public API; keep helpers internal

---

## 3. Non-negotiable rules

These rules are enforced in CI and will block any PR that violates them:

| Rule | Why |
|------|-----|
| No `Math.random()` in `src/` | Breaks determinism |
| No floating-point in simulation path | Causes cross-platform drift |
| No arbitrary unitless numbers — use SI + SCALE | Ensures physical interpretability |
| Same seed + same inputs → identical output | The core determinism guarantee |
| Coverage must stay at or above thresholds | Prevents blind spots in complex physics |
| Golden fixtures must match | Any physics change that shifts fixed-point output requires fixture update |

---

## 4. API stability tiers

Before writing code, classify where your change falls (see `STABLE_API.md`):

| Tier | What | Your obligation |
|------|------|----------------|
| **Stable** | `stepWorld`, `Entity` core fields, `q()`/`qMul()`, `ReplayRecorder`, `extractRigSnapshots` | No breaking changes; if unavoidable, discuss in issue first and document in `CHANGELOG.md` |
| **Experimental** | Polity, tech-diffusion, emotional-contagion, arena DSL, campaign, aging/sleep | Document changes in `CHANGELOG.md`; breaking changes allowed with clear migration note |
| **Internal** | `src/rng.ts`, `src/sim/push.ts`, kernel sub-phases | No obligation to external users; change freely but update affected tests |

If you are unsure which tier something belongs to, ask in the issue before writing code.

---

## 5. Test and coverage requirements

Every change to `src/` requires tests in `test/`.

**New simulation phase or subsystem:**
- Unit tests for every exported function (happy path + boundary cases)
- At least one "returns 0/false/identity for neutral inputs" test per function
- At least one test verifying the fixed-point range constraints (output is in `[0, SCALE.Q]`)
- A long-run test if the system has stochastic elements (verify convergence over N seeds)

**Bug fix:**
- A test that fails before the fix and passes after (regression guard)

**Performance-affecting change:**
- Run `npm run benchmark-check:strict` before and after; report the delta in the PR description
- If throughput drops >10% for any scenario, justify it in the PR

---

## 6. PR checklist

Copy this checklist into every PR description:

```
## PR checklist

### Code
- [ ] No `Math.random()` in `src/`
- [ ] No floating-point in simulation path
- [ ] SI unit suffixes on all new physical quantities
- [ ] New exports assigned to a stability tier in STABLE_API.md (or confirm unchanged)

### Tests
- [ ] Tests written for all new exported functions
- [ ] `npm run test:coverage` passes with coverage at or above thresholds
- [ ] Golden fixtures regenerated if physics output changed (`npm run generate-fixtures`)

### Documentation
- [ ] CHANGELOG.md updated if Stable or Experimental tier exports changed
- [ ] README updated if the feature is user-facing (new phase, new tool, new quickstart)
- [ ] ROADMAP updated if a planned item is completed
- [ ] TypeScript snippets in `README.md` and `docs/**/*.md` are fenced as `ts example` or `ts pseudocode`
- [ ] `npm run check:doc-examples` passes locally after docs edits

### Performance (check if touching kernel or AI path)
- [ ] `npm run benchmark-check:strict` run locally; delta reported in PR description
```

---

## 7. Contributing datasets

Ananke's validation framework compares simulation output against real-world empirical data.
New datasets make the engine more credible.

**Before submitting:**
1. Read `docs/dataset-contribution.md` — it has the exact CSV format, required metadata, and
   the four scenario code templates
2. Confirm your dataset is from a peer-reviewed or reputable source (DOI preferred)
3. Confirm n ≥ 10 observations and units are SI-convertible
4. Open an issue using the **Dataset contribution** template before writing code

**What to submit:**
- `datasets/your-dataset.csv` — measurements in the specified CSV format
- A `DirectValidationScenario` block in `tools/validation.ts`
- An entry in `docs/external-dataset-validation-inventory.md`

---

## 8. Proposing a new simulation phase

New phases extend the simulation kernel and must meet the acceptance criteria in
[§10 Decision process](#10-decision-process).

**Before coding anything:**
1. Open an issue using the **New phase proposal** template
2. Get at least one discussion comment from a maintainer confirming direction
3. Agree on which stability tier the new exports will occupy

**What a complete phase submission includes:**
- `src/<phase-name>.ts` with file header, implementation, and exports
- `test/<phase-name>.test.ts` with coverage meeting thresholds
- ROADMAP entry (under "New Simulation Phases") following the existing format
- README entry in the phase description section
- CHANGELOG entry under `[Unreleased]`
- If the phase adds Stable-tier exports: `STABLE_API.md` updated

---

## 9. Contributing a renderer plugin

Renderer plugins live in separate companion repositories (e.g. `ananke-godot-reference`).
They use only the Stable and Experimental tiers of the Ananke API.

**To be listed as an official companion:**
1. Open an issue using the **Renderer plugin** template
2. Plugin must use `extractRigSnapshots()` for all entity state extraction — no direct
   `Entity` field access beyond Stable-tier fields
3. Include a README explaining: minimum Ananke version, engine version, tick-rate
   interpolation strategy, and animation state machine wiring
4. Include a self-contained demo scene (at minimum: two entities, one fight, one replay)

---

## 10. Decision process

### Accepting a new simulation phase

A proposed phase is accepted when it satisfies all of:

| Criterion | Requirement |
|-----------|-------------|
| Physics citation | At least one peer-reviewed or authoritative source cited in the file header |
| Test coverage | Statements ≥ 90%, branches ≥ 80%, functions ≥ 85% on the new module |
| Determinism | All functions with stochastic elements use `eventSeed` + `makeRng`; verified by test |
| Fixed-point | No floating-point in the simulation path; verified by code review |
| Benchmark impact | `npm run benchmark-check:strict` run; any regression justified |
| ROADMAP fit | Phase fits naturally into the existing layer architecture (Layers 2–7) |
| Maintainer review | At least one maintainer approves the PR |

### Breaking a Stable-tier export

Breaking a Stable API export is a major-version bump and requires:
1. A GitHub issue opened for discussion at least 2 weeks before the PR
2. A migration guide committed to `docs/migrations/vX.0.0.md`
3. A `CHANGELOG.md` entry under the new major version header
4. Maintainer approval

### Updating the benchmark baseline

Intentionally accepting a performance regression requires:
1. A `CHANGELOG.md` entry documenting the new baseline numbers
2. `npm run benchmark-check:update` run and committed
3. A comment in the PR explaining why the regression is acceptable

---

## Getting help

- Open a GitHub Discussion for questions about architecture or design
- Open a GitHub Issue for bugs, dataset proposals, phase proposals, or plugin listings
- Read `docs/integration-primer.md` for the architecture overview and data-flow diagrams
- Read `STABLE_API.md` for the API stability contract

---

## 11. External contribution incentives

### Good First Issue labels

We use the following labels for external onboarding:

- `good first issue` — scoped for first-time contributors, typically < 1 day effort.
- `help wanted` — maintainers are explicitly seeking community implementation help.
- `mentored` — a maintainer is available to pair async in issue comments.
- `determinism` — touches reproducibility or fixed-point guarantees.
- `performance` — benchmark-sensitive work.

Starter workflow for new contributors:

1. Filter by `good first issue` first.
2. Comment “I’d like to take this” before opening a PR.
3. Maintainer confirms assignment and links any relevant tests/docs.

### Bug bounty (determinism break)

Community bounty program (funded through GitHub Sponsors):

- **Sponsors tier:** `Determinism Defender`
- **Reward:** USD **$100**
- **Scope:** Any reproducible determinism break where same seed + same inputs produce divergent outputs.
- **Submission channel:** Private report via `SECURITY.md` process (preferred) or issue if non-sensitive.
- **Payout channel:** GitHub Sponsors transfer (maintainer coordinated).

Eligibility rules:

- Must include minimal reproduction and environment metadata.
- Must reproduce on a maintainer machine or CI.
- First valid report for a unique root cause gets the bounty.

### Contributor recognition system

- All merged external contributors are listed in `CONTRIBUTORS.md`.
- Monthly “Top Contributor” is highlighted in `README.md` badge text.
- Recognition criteria include: merged PR count, review quality, and regression-prevention impact.
