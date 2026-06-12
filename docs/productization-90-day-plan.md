# 90-Day Productization Plan (Adoption Without Scope Pruning)

Date: 2026-04-08  
Owner: Productization Engineering  
Horizon: 90 days

## Goal

Improve adoption, integration speed, and trust in Ananke **without removing simulation breadth**.

This plan focuses on:

- public entry points
- examples and cookbook quality
- host integration ergonomics
- save/replay trust
- schema clarity
- scenario/content-pack workflows
- renderer bridge usability
- install-to-first-success time

---

## Current pain points in repo shape (what this plan is reacting to)

1. **Navigation overload for new users**
   - The root package exports a very large number of subpaths, while onboarding asks users to stay on Tier 1 first. This creates “where do I start?” friction. (`package.json`, `README.md`, `STABLE_API.md`)
2. **Examples are broad, but not obviously progressive**
   - There are many example files and game folders (`examples/`, `examples/reference/`, `examples/games/`), but no single executable matrix that proves all examples still work each PR.
3. **Cookbook quality/trust gap**
   - `docs/cookbook.md` positions itself as task-first, but snippets are not explicitly CI-verified as copy/paste contracts.
4. **Save/replay confidence is not surfaced as a user-facing score**
   - Determinism and conformance assets exist (`conformance/`, `fixtures/`, `docs/determinism-proof.md`) but confidence is spread across files rather than surfaced as one “trust dashboard” for adopters.
5. **Schema discoverability is weak for content authors**
   - Several schemas exist (`schema/*.schema.json`) but there is no single schema landing page that maps use-cases → schema → validator CLI.
6. **Content-pack workflows exist but are not productized end-to-end**
   - Pack examples and CLI exist (`examples/content-packs/`, `tools/pack-cli.ts`) yet “author → validate → bundle → load → replay-proof” is not one guided flow.
7. **Renderer bridge docs are rich but split across multiple documents**
   - Bridge contract and quickstarts are present (`docs/bridge-contract.md`, `docs/quickstart-unity.md`, `docs/quickstart-godot.md`), but first-render success path is fragmented.
8. **Roadmap already flags adoption/scope risk**
   - Roadmap v2 explicitly calls out usability/documentation gaps and zero external users; this plan executes on that signal instead of adding net-new sim domains. (`ROADMAP-v2.md`)

---

## Ranked backlog (impact vs effort)

Scoring: Impact (1–5), Effort (1–5), Priority score = Impact / Effort.

| Rank | Initiative | Impact | Effort | Priority | Why now |
|---|---|---:|---:|---:|---|
| 1 | **Adoption entrypoint consolidation** (single `docs/start-here.md` + README top-path rewrite) | 5 | 2 | 2.5 | Removes first 10-minute confusion immediately |
| 2 | **Golden examples CI matrix** (run/smoke all onboarding examples each PR) | 5 | 2 | 2.5 | Converts examples from marketing to contract |
| 3 | **Install-to-first-success instrumentation** (timed scripts + CI metric capture) | 5 | 3 | 1.7 | Enables objective adoption KPI tracking |
| 4 | **Save/replay trust dashboard** (one generated report from determinism + conformance checks) | 5 | 3 | 1.7 | Improves buyer confidence for integration decisions |
| 5 | **Schema portal + lint tooling** (schema index, versioning table, validator UX) | 4 | 3 | 1.3 | Makes content and host JSON workflows teachable |
| 6 | **Content-pack authoring pipeline** (`init`, `validate`, `bundle`, `simulate`) | 4 | 3 | 1.3 | Reduces authoring friction without reducing scope |
| 7 | **Renderer bridge “first battle on screen” starter kit** | 4 | 3 | 1.3 | Directly improves install-to-first-rendered-battle |
| 8 | **Host integration starter adapters** (Node loop + web worker + engine loop templates) | 4 | 4 | 1.0 | Removes common integration boilerplate |
| 9 | **Cookbook contract tests** (extract snippets, compile/run) | 4 | 4 | 1.0 | Raises cookbook trust and maintenance quality |
| 10 | **Scenario pack workflow unification** (scenario + pack + replay roundtrip command) | 3 | 3 | 1.0 | Helps storytellers/hobbyists reach value faster |

---

## 30 / 60 / 90-day milestone plan

## Day 0–30: “First success in under 15 minutes”

### Outcomes
- New user can choose a path in under 2 minutes.
- Core examples have pass/fail visibility in CI.
- First baseline for install-to-first-sim is measurable.

### Deliverables
1. **Public entrypoint refactor**
   - Add `docs/start-here.md` with four persona lanes (Game Dev, ML Researcher, Hobbyist, Storyteller).
   - Rewrite README top section to route through that page first.
2. **Golden path command unification**
   - Add `npm run first-success` script (build + one deterministic duel + one replay check).
3. **Example reliability matrix**
   - Add `tools/validate-games/run-validation.ts` coverage for onboarding examples.
   - Add CI job `examples-smoke` and a Markdown report artifact.
4. **Metric instrumentation v1**
   - Add `tools/benchmark-onboarding.ts` to time:
     - install-to-first-sim
     - install-to-first-rendered-battle (headless bridge smoke)

### Concrete repository changes
- `README.md` (new top-path structure)
- `docs/start-here.md` (new)
- `package.json` scripts (`first-success`, `examples:smoke`, `onboarding:benchmark`)
- `tools/benchmark-onboarding.ts` (new)
- `.github/workflows/ci.yml` (add examples smoke + onboarding metrics)

### Concrete docs changes
- `docs/first-hour-adopter-path.md` (align with `first-success`)
- `docs/cookbook.md` (tag recipes as CI-verified or experimental)

---

## Day 31–60: “Integration ergonomics and trust surface”

### Outcomes
- Host teams can integrate without reading internal source.
- Save/load/replay trust becomes a product-facing metric.
- Schema usage becomes discoverable and self-serve.

### Deliverables
1. **Host integration starter kits**
   - Add `examples/host-starters/` with three minimal adapters:
     - Node authoritative loop
     - Browser worker loop
     - Unity/Godot data bridge loop
2. **Save/replay confidence suite**
   - Create `tools/replay-confidence.ts` that runs replay parity + state hash + migration fixtures and outputs one score.
   - Publish `docs/save-replay-confidence.md` from generated output.
3. **Schema portal**
   - Add `docs/schema-portal.md` mapping each schema file to use-case, version policy, examples, and validator command.
4. **Content pack flow upgrade**
   - Extend CLI UX docs for `pack validate`, `pack bundle`, `pack doctor` with guided examples.

### Concrete repository changes
- `examples/host-starters/*` (new)
- `tools/replay-confidence.ts` (new)
- `tools/content-validator.ts` (enhanced UX output)
- `schema/*.schema.json` (clarifying metadata fields where needed)
- CI: add replay confidence check job

### Concrete docs changes
- `docs/host-contract.md` (quick integration checklist)
- `docs/integration-primer.md` (starter templates)
- `docs/save-replay-confidence.md` (new)
- `docs/schema-portal.md` (new)
- `docs/pack-registry-spec.md` cross-links to authoring flow

---

## Day 61–90: “First rendered battle + content workflows at production quality”

### Outcomes
- New user can reach first rendered battle with one starter path.
- Content/scenario authoring is repeatable and replay-safe.
- Cookbook becomes a tested integration handbook, not static prose.

### Deliverables
1. **Renderer bridge starter app**
   - Add one canonical “first rendered battle” starter under `examples/games/bridge-starter/`.
   - Include fixed camera, event overlays, replay scrubber.
2. **Scenario/content-pack pipeline command**
   - Add `npm run scenario:prove`:
     - validate schema
     - run deterministic sim
     - save snapshot
     - replay and hash-compare
3. **Cookbook contract testing**
   - Add snippet extraction test harness (compile/run selected cookbook code blocks).
4. **Adoption scorecard publishing**
   - Add monthly generated `docs/adoption-scorecard-YYYY-MM.md` with KPI trends.

### Concrete repository changes
- `examples/games/bridge-starter/*` (new)
- `tools/scenario-prove.ts` (new)
- `test/docs/cookbook-contract.spec.ts` (new)
- `tools/generate-adoption-scorecard.ts` (new)

### Concrete docs changes
- `docs/bridge-contract.md` + `docs/quickstart-web.md` unified path to starter
- `docs/cookbook.md` badges per recipe (tested / untested)
- `docs/recipes-matrix.md` adds “Verified in CI” column
- `docs/adoption-scorecard-*.md` series (new)

---

## Success metrics (with definitions and 90-day targets)

## 1) Install-to-first-sim time
- **Definition:** wall-clock from `npm install` start to successful deterministic duel completion on golden path.
- **Capture:** `npm run onboarding:benchmark -- --mode=sim` in CI + local script.
- **Target by Day 90:** **p50 ≤ 12 min**, **p90 ≤ 20 min** on clean environments.

## 2) Install-to-first-rendered-battle time
- **Definition:** wall-clock from install start to first non-empty renderer frame from bridge starter.
- **Capture:** bridge starter smoke test + render-ready marker in logs.
- **Target by Day 90:** **p50 ≤ 20 min**, **p90 ≤ 35 min**.

## 3) Save/load confidence
- **Definition:** composite score from replay parity, state-hash parity, migration fixture pass rate.
- **Formula:** 0.4 * replay parity + 0.4 * state hash + 0.2 * migration passes.
- **Target by Day 90:** **≥ 99.5%** on mainline CI runs.

## 4) Example pass rate
- **Definition:** % of curated examples that execute successfully in CI on each PR.
- **Scope:** quickstarts + reference + starter integrations (exclude long-running research notebooks).
- **Target by Day 90:** **≥ 95%** rolling 14-day pass rate.

---

## Dependency sequencing / risk controls

1. **Do not add new simulation domains** until backlog items 1–4 are complete.
2. **Protect navigation scope** by enforcing a docs IA gate: no new guide without lane + entrypoint assignment.
3. **Treat examples as product surface**: failing examples block release candidates.
4. **Publish confidence metrics monthly** to make trust visible externally.

---

## Exit criteria at Day 90

- A new contributor can follow a single “Start Here” page and run:
  - first deterministic sim,
  - first rendered battle,
  - first save/load/replay confidence proof.
- Maintainers can quantify adoption friction with stable KPIs.
- Existing simulation breadth remains intact; onboarding burden is materially lower.
