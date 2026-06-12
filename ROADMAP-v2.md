# Ananke Roadmap v2 (Pre-Alpha → v1.0)

**Current state (honest baseline):**
- Version: **v0.1.69**
- Lifecycle: **pre-alpha**
- Adoption: **0 external users**
- Packaging: **repository is publish-configured; npm registry publish status should be externally verified**
- Delivery risk: **high internal churn and no stable 1.0 release line**

This roadmap replaces maturity-level framing with **quarterly milestones** tied to concrete user outcomes and deficiency closure.

---

## Deficiency Index (from prioritized audit)

- **P1 Blockers:**
  - D1: No 1.0 release
  - D2: Internal churn
  - D3: Zero users
  - D4: No npm package
- **P2 Completeness:**
  - D5: Missing benchmarks
  - D6: Modular stubs (not fully productized)
  - D7: No property tests
  - D8: Content pack system incomplete
- **P3–P6 Scale-up:**
  - D9: Usability/documentation gaps
  - D10: Production readiness gaps
  - D11: Performance/scalability uncertainty
  - D12: Governance/release process immaturity

---

## Q3 2026 Milestone — **Foundation & External Alpha Start**

**Milestone intent:** Unblock adoption by shipping the minimum credible platform surface and onboarding first external users.

**Deficiencies addressed in this milestone:** **D2, D3, D4, D5, D6, D9, D12**

### Target user profiles
- **Production Game Dev** (early evaluators integrating deterministic combat loop)
- **AI/ML Researcher** (deterministic experiment workflows)
- **Hobbyist** (quick-start simulation builders)
- **Storyteller** (scenario creators testing content workflows)

### Deliverables (with placeholder issues)
- [ ] Publish initial npm artifacts (`@ananke/core`, `@ananke/content`, `@ananke/bridge`) with semver + changelog policy. **#ISSUE-1**
- [ ] Establish architecture freeze windows and API review gate to reduce internal churn. **#ISSUE-2**
- [ ] Ship benchmark harness + baseline scenarios + CI regression threshold checks. **#ISSUE-3**
- [ ] Convert modular stubs to documented, import-safe package boundaries with CI enforcement. **#ISSUE-4**
- [ ] Release "30-minute quickstart" tracks for all four user profiles. **#ISSUE-5**
- [ ] Start external alpha program with onboarding checklist, support channel, and telemetry-free feedback form. **#ISSUE-6**
- [ ] Publish governance starter pack (triage SLAs, release checklist, ownership map). **#ISSUE-7**

### Success metric
- **At least 3 external alpha users actively running weekly simulations by September 30, 2026.**

### Call to Action by user profile
- **Production Game Dev:** Integrate the npm preview package into a prototype scene and submit integration pain points.
- **AI/ML Researcher:** Run deterministic replay experiments and report reproducibility friction.
- **Hobbyist:** Complete the quickstart and share first simulation outputs/examples.
- **Storyteller:** Build one short scenario pack draft and flag tooling/documentation blockers.

---

## Q4 2026 Milestone — **Completeness, Reliability, and Beta Readiness**

**Milestone intent:** Close major completeness gaps and prove reliability under repeatable validation.

**Deficiencies addressed in this milestone:** **D1 (preconditions), D5, D7, D8, D9, D10, D11, D12**

### Target user profiles
- **Production Game Dev** (beta integration candidates)
- **AI/ML Researcher** (validation + benchmark users)
- **Hobbyist** (stable workflow users)
- **Storyteller** (content-pack-first creators)

### Deliverables (with placeholder issues)
- [ ] Add property-based test suite for combat, replay determinism, and schema migrations. **#ISSUE-8**
- [ ] Complete content pack system (schema finalization, validation, pack tooling, compatibility metadata). **#ISSUE-9**
- [ ] Publish benchmark dashboard with reproducible methodology and target performance classes. **#ISSUE-10**
- [ ] Harden production-readiness items: deterministic replay diff CLI, release-check command, upgrade/migration guides. **#ISSUE-11**
- [ ] Ship UX/usability pass: docs IA cleanup, task-oriented recipes, profile-based getting-started pages. **#ISSUE-12**
- [ ] Formalize beta governance: RFC path, deprecation policy, and contributor decision rights. **#ISSUE-13**
- [ ] Run beta cohort (minimum 10 external users across profile types). **#ISSUE-14**

### Success metric
- **10 external beta users, with ≥80% of critical workflows passing without maintainer intervention by December 31, 2026.**

### Call to Action by user profile
- **Production Game Dev:** Pilot one gameplay loop in beta and report blocker bugs with reproducible replays.
- **AI/ML Researcher:** Validate benchmark scenarios and propose additional deterministic stress tests.
- **Hobbyist:** Use packaged templates to build and share one complete mini-project.
- **Storyteller:** Publish at least one interoperable content pack using the finalized pack schema.

---

## Q1 2027 Milestone — **v1.0 Release & Adoption Flywheel**

**Milestone intent:** Convert pre-alpha momentum into a credible, supportable **v1.0** release.

**Deficiencies addressed in this milestone:** **D1, D3, D10, D11, D12** (final closure and operationalization)

### Target user profiles
- **Production Game Dev** (production adopters)
- **AI/ML Researcher** (citation-ready deterministic engine users)
- **Hobbyist** (long-term community users)
- **Storyteller** (pack ecosystem contributors)

### Deliverables (with placeholder issues)
- [ ] Ship **v1.0.0** on npm with signed release artifacts, migration notes, and locked stable API surface. **#ISSUE-15**
- [ ] Publish v1.0 conformance suite and compatibility matrix for host integrations. **#ISSUE-16**
- [ ] Meet production SLOs: deterministic parity checks, perf envelopes, release gate pass rate, and incident response runbook. **#ISSUE-17**
- [ ] Launch governance v1: maintainers charter, roadmap cadence, support policy, and deprecation timeline guarantees. **#ISSUE-18**
- [ ] Execute adoption program (reference apps, case studies, and community onboarding events). **#ISSUE-19**

### Success metric
- **v1.0 released by March 31, 2027, with 25+ external users (including 5 production-oriented teams) and 2 public case studies.**

### Call to Action by user profile
- **Production Game Dev:** Adopt v1.0 in a production branch and contribute integration case-study feedback.
- **AI/ML Researcher:** Use v1.0 conformance + replay guarantees for publishable experiment pipelines.
- **Hobbyist:** Join community showcase cycles and contribute examples/issues for v1.x priorities.
- **Storyteller:** Publish and maintain reusable content packs targeting v1.0 compatibility.

---

## Path Credibility Notes (Why v1.0 by Q1 2027 is realistic)

- The plan intentionally front-loads **P1 blocker closure in Q3 2026** (npm packaging, churn controls, first users).
- **Q4 2026 is reserved for quality debt** (property tests, content-pack completion, benchmark rigor) rather than net-new scope.
- **Q1 2027 focuses on release discipline and adoption proof**, not major architecture change.
- If Q3 success metric is missed, v1.0 date should be explicitly re-baselined rather than forced.
