# Roadmap claim audit (2026-04-09)

## Scope and method

This memo audits roadmap claims that use **"complete"** or **"M4 validated"** language and checks
them against current in-repo evidence (source layout, tests, conformance artifacts, and maturity docs).
The goal is conservative wording: avoid claiming more than the repository can prove today.

Primary comparison inputs:

- `ROADMAP.md` (legacy phase-by-phase claims)
- `docs/maturity-matrix.md` and `docs/maturity-matrix.json` (current maturity baseline)
- `ROADMAP-v2.md` (current pre-alpha/adoption framing)
- `package.json` (actual package surface and delivery tooling)

---

## 1) Claim audit memo

| Claim (current wording) | Evidence in repo | Assessment |
|---|---|---|
| **Phase 4 — Perception and Cognition (complete)** and **Phase 5 — Morale and Psychological State (complete)** | Maturity matrix currently marks **AI, perception, cognition as M3 (Hardened)**, explicitly saying prior COMPLETE wording was downgraded pending dedicated validation publication. | **Overstated**. "Complete" over-communicates vs. current M3 source of truth. |
| **Phase 22 — Campaign & World State (M4 VALIDATED)** | Maturity matrix marks **Campaign/world simulation as M3 (Hardened)** and says broader external validation is still pending. | **Overstated**. M4 wording conflicts with current subsystem maturity record. |
| **Next Priorities: “five integration milestones are complete … core technology is mature and validated … all roadmap items delivered”** | `ROADMAP-v2.md` calls current state **pre-alpha**, **high internal churn risk**, and a future plan for external alpha/beta and v1.0. | **Overstated / stale**. Legacy close-out language conflicts with current roadmap baseline. |
| **Community & Ecosystem Development (M4 VALIDATED)** with “Delivered” docs | Documentation artifacts exist (`docs/onboarding.md`, `docs/contributing.md`, `docs/versioning.md`, `docs/ecosystem.md`), but v2 baseline still lists **0 external users** and adoption blockers. | **Partially true**. Documentation is delivered; ecosystem/adoption validation is not yet proven in-source. |
| **Reference Renderer Implementation (M4 VALIDATED)** listing two external repos as completed M1–M4 | This repo includes bridge tooling (`src/bridge/*`, `tools/renderer-bridge.ts`) but renderer completion claims depend on companion repos outside this tree. | **Partially verifiable**. In-repo bridge exists; full M4 renderer claim is external and should be phrased as “reported by companion repos.” |
| **Q3 2026: “no npm package published yet” (ROADMAP-v2 baseline)** | `package.json` currently defines publishable package metadata, exports, files whitelist, and `publishConfig.access=public`. | **Potentially ambiguous**. Source proves package is publish-*ready* but not publish-*status*; wording should avoid definitive “not published” unless externally verified. |

---

## 2) Recommended wording changes

Use these edits (or equivalent) to reduce trust-eroding drift:

1. Replace hard completion claims for subsystems currently graded M3.
   - From: **"Phase 4 … (complete)"**
   - To: **"Phase 4 … (implemented, currently M3 Hardened; pending dedicated validation publication for M4)."**

2. Same for campaign/world:
   - From: **"Phase 22 … (M4 VALIDATED)"**
   - To: **"Phase 22 … (implemented and integrated; current maturity M3 Hardened in `docs/maturity-matrix.md`)."**

3. Reframe global close-out statements in `ROADMAP.md`:
   - From: **"all roadmap items delivered … core technology is mature and validated."**
   - To: **"major implementation scope has landed; validation/adoption maturity is tracked separately in `ROADMAP-v2.md` and `docs/maturity-matrix.md`."**

4. Reframe community milestone to distinguish artifacts vs outcomes:
   - From: **"Community & Ecosystem Development M4 VALIDATED."**
   - To: **"Community documentation baseline delivered; external ecosystem traction remains an active milestone in ROADMAP-v2."**

5. Reframe external-repo renderer claims:
   - From: **"M1–M4 complete in both companion repos."**
   - To: **"Companion repos report M1–M4 completion; this repository provides the bridge contracts/tooling used by those integrations."**

6. Clarify package status in `ROADMAP-v2.md`:
   - From: **"no npm package published yet."**
   - To: **"npm publication status must be verified against npm registry; repository is configured for public package publication."**

---

## 3) Follow-up implementation tasks

Conservative, source-verifiable tasks to close remaining drift:

1. **Add a machine-checkable claim registry** (`docs/roadmap-claims.json`) with each major claim mapped to required evidence files (tests, fixtures, docs, benchmarks).
2. **Add CI drift check** (extend `tools/check-maturity-evidence.mjs`) to fail when `ROADMAP.md` claims exceed current maturity matrix labels.
3. **Split legacy vs active roadmap docs** more explicitly:
   - `ROADMAP.md` as historical phase archive,
   - `ROADMAP-v2.md` as execution plan,
   - both with synchronized status banner generated from one source.
4. **Publish explicit validation artifacts for current M3 areas** (AI/perception and campaign/world) to support future M4 upgrades.
5. **Annotate externally-dependent claims** (renderer repos, user counts, npm publish status) with “external verification required” tags so readers know what cannot be proven from this repository alone.
6. **Add a release-time documentation gate** requiring roadmap wording review whenever maturity levels change.

