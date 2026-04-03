# Canonical Simulation Engine Architecture (Target State)

Status: **Normative target** for convergence.

This document defines the architecture that the repository must converge to. It is intentionally stricter than the current implementation and is the baseline for dependency checks, package extraction, and code review.

## 1) Package model and responsibilities

## 1.1 `core` (foundational kernel)

**Purpose:** deterministic simulation substrate with no domain-policy knowledge.

**Owns:**
- deterministic primitives (units, RNG, seeds, IDs, clocks, replay/event envelope)
- simulation kernel orchestration primitives (tick contracts, world/entity containers, indexing)
- math/spatial/fixed-point utilities
- kernel extension points (interfaces/capabilities/contracts) but **not** higher-level implementations

**Must not own:**
- combat resolution policy
- campaign/economy/social policy
- content definitions and authored assets
- host/framework IO adapters

---

## 1.2 `sim` (domain simulation systems)

**Purpose:** pluggable simulation systems that execute against `core` contracts.

**Owns:**
- combat, injury, morale, AI tactics, formation systems
- world/environment physiology systems (weather, toxicology, nutrition, etc.)
- step-phase logic and system-level orchestration using `core` kernel APIs

**Rules of thumb:**
- If logic changes “what happens in the world” (domain mechanics), it belongs in `sim`.
- `sim` must depend on `core`, never the reverse.

---

## 1.3 `content` (authored/static/runtime data catalogs)

**Purpose:** declarative domain content and composition schemas.

**Owns:**
- species, archetypes, catalogs, crafting recipes, item templates
- scenario/world generation templates and content-pack schema utilities
- validation/transforms for authored content

**Must not own:**
- frame-step mutation logic that belongs to `sim`
- low-level engine internals from `core`

---

## 1.4 `adapters` (integration and boundary IO)

**Purpose:** all edges to external systems.

**Owns:**
- renderer/bridge mapping
- netcode/host-loop/serialization protocol adapters
- CLI/tool/server-facing integration entrypoints

**Rules of thumb:**
- `adapters` translate external contracts into `core`/`sim`/`content` APIs.
- No domain policy should originate in adapters.

---

## 1.5 `apps` / `examples` / `tools` (composition roots)

**Purpose:** runnable assembly of the engine for demos, tests, utilities, and reference scenarios.

**Owns:**
- wiring of packages
- scenario bootstrapping
- diagnostic and migration tooling

These are allowed to depend on any package because they are top-level composition roots.

---

## 2) Allowed dependency directions

## 2.1 Canonical layer stack

```text
apps/examples/tools
        ↓
     adapters
      ↙   ↘
   content  sim
      ↘    ↙
        core
```

## 2.2 Dependency matrix (normative)

- `core` → *(none internal)*
- `sim` → `core` (+ `content` only for read-only typed catalogs/contracts)
- `content` → `core` (shared primitive types/validation helpers)
- `adapters` → `core`, `sim`, `content`
- `apps/examples/tools` → any

## 2.3 Forbidden directions

- `core` → `sim|content|adapters`
- `sim` → `adapters`
- `content` → `sim|adapters` (except explicitly approved shared contract package extraction)
- any lateral dependency that creates cycles between `sim` and `content` implementation modules

---

## 3) Architecture rules (hard constraints)

1. **No cross-layer imports against the matrix above.**
2. **No circular dependencies** at:
   - package/layer level
   - module level within each package (new cycles are rejected)
3. **Dependency inversion required for upward calls:**
   - use interfaces/events/commands declared in lower layers
   - implement in higher layers
4. **Shared contracts must be extracted downward** (usually to `core` or a dedicated `contracts` subpackage) rather than imported upward.
5. **Adapters remain edge-only:** no engine modules may import from adapter modules.

Enforcement target:
- boundary checker in CI must fail on any hard violation
- cycle checker in CI must fail on any newly introduced cycle

---

## 4) Current-state gap analysis (repo vs target)

Based on `node dist/tools/check-package-boundaries.js --report-md=docs/package-boundary-report.md` generated on **2026-04-03**:

- files scanned: **216**
- mapped files: **203**
- unmapped files: **13**
- hard violations: **87** (`core` importing upward)
- suspicious cross-boundary imports: **60** (non-core cross-layer warnings)

## 4.1 Major violation classes

1. **`core` imports `combat`/`campaign`/`content` modules (hard fail).**
   - examples: `src/sim/kernel.ts`, `src/sim/entity.ts`, `src/presets.ts`, `src/derive.ts`, bridge files importing `model3d`.
2. **Bidirectional coupling between `combat` and `campaign`.**
   - matrix shows both `combat → campaign` and `campaign → combat` imports.
3. **`content` importing simulation/policy modules.**
   - examples include `character.ts`, `world-generation.ts`, `catalog.ts`.
4. **Unmapped modules block strict governance** (13 files not assigned to architecture ownership).

## 4.2 Structural risk summary

Current package-level graph is effectively cyclic among `combat`, `campaign`, and `content`, with `core` still depending upward. This is the opposite of the target DAG and prevents true package extraction.

---

## 5) Convergence roadmap

## Phase A — Governance lock-in (short, 1 sprint)

- ratify this document as canonical
- update `tools/package-boundaries.config.json` to align names with target layers (`core/sim/content/adapters`)
- make boundary check mandatory in CI for hard violations
- add cycle detection check (module + package level)

**Exit criteria:** CI blocks new architectural regressions.

## Phase B — Core purification (high priority)

- remove all `core -> *` upward imports
- extract shared contracts/types currently owned by upper modules into `core` (`interfaces`, `event payloads`, `capability descriptors`)
- replace direct imports with command/event/plugin boundaries

**Exit criteria:** hard violations reduced from 87 to 0.

## Phase C — `sim` vs `content` decoupling

- isolate read-only content interfaces consumed by `sim`
- move content-dependent procedural logic out of `content` into `sim` or composition layer
- break `combat ↔ campaign` cycles via orchestration services and domain events

**Exit criteria:** no `content -> sim`, no `sim <-> campaign/combat` lateral cycles.

## Phase D — Introduce/finish `adapters` boundary

- migrate bridge/netcode/host-loop modules into explicit `adapters` package
- prohibit imports from engine layers to adapters

**Exit criteria:** adapters are edge-only; engine remains adapter-agnostic.

## Phase E — Package extraction and compatibility

- move source into workspace packages
- keep monolith package as compatibility re-export layer
- publish migration notes + stable API map

**Exit criteria:** package graph matches target DAG, boundary+cycle checks green, backward compatibility preserved.

---

## 6) Immediate next actions (ordered)

1. Assign ownership for each of the 13 unmapped files.
2. Tackle top 10 `core` hard-violation files by fan-out (`src/sim/kernel.ts`, `src/sim/entity.ts`, `src/sim/capability.ts`, etc.).
3. Create `sim-contracts`/`core-contracts` extraction ADR for currently upward-imported types.
4. Add cycle check script to CI and fail on new cycles.
5. Re-run boundary report per PR and trend counts in docs.

This sequence gives measurable progress while minimizing destabilization risk.
