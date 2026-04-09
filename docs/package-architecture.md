# Ananke package architecture: actual state vs plan

This document reconciles the modular package design with what is **currently** in this repository.

## TL;DR

- The repository is still built and published primarily as a **single monolith package**: `@its-not-rocket-science/ananke`.  
- `packages/*` workspaces exist, but the main domain packages are currently **Phase 1 stubs** that re-export monolith subpaths; they are not independent codebases yet.  
- Boundary tooling exists and runs, but boundary violations are still present, so modular boundaries are **partially enforced** rather than fully achieved.

---

## 1) Current state (what is true today)

### Build and publish model

- Root `package.json` defines the package name as `@its-not-rocket-science/ananke` and includes the full export surface from `dist/src/*`.  
- Root publish config is public and root packaging is driven by the root `files` list and root build scripts (`npm run build` compiles `tsconfig.build.json`).  
- The root package currently exposes **56 export entries** (including `"."` and many subpaths).

### Repository layout reality

- Most implementation source remains under the monolith `src/` tree.
- Workspaces are declared as `packages/*`, with these folders present:
  - `packages/core`
  - `packages/combat`
  - `packages/campaign`
  - `packages/content`
  - `packages/cli`
- `packages/core|combat|campaign|content` each contain only:
  - `package.json`
  - `index.js`
  - `index.d.ts`

### Current architecture diagram (monolith-first)

```mermaid
flowchart LR
  Host[Consumer app] --> Mono[@its-not-rocket-science/ananke]
  Mono --> Dist[dist/src/* exports]
  Dist --> Src[src/* monolith implementation]

  subgraph Workspace wrappers (Phase 1)
    Core[@ananke/core]
    Combat[@ananke/combat]
    Campaign[@ananke/campaign]
    Content[@ananke/content]
  end

  Core --> Mono
  Combat --> Mono
  Campaign --> Mono
  Content --> Mono
```

---

## 2) Partially implemented state (in progress now)

### What is implemented

- A modular ownership/dependency model is defined in `tools/package-boundaries.config.json` (`@ananke/core`, `@ananke/combat`, `@ananke/campaign`, `@ananke/content`).
- Boundary checking tooling exists (`tools/check-package-boundaries.ts`) and report generation is wired via `npm run check-boundaries:report`.
- Workspace packages (`@ananke/core|combat|campaign|content`) are usable import targets, but they are intentionally thin re-export shims.

### What is only partial (not fully shipped)

- Boundary conformance is not complete: current report still shows hard and suspicious violations, and unmapped files.
- The modular packages are not yet source-owning packages; they forward imports to the monolith package.
- `packages/*` are therefore **meaningfully populated only as compatibility wrappers**, not as fully separated implementation modules.

---

## 3) Planned future state (target)

### Target outcomes

- Each `@ananke/*` domain package owns its source and build output directly.
- Cross-package dependencies follow the declared DAG (core at base, domain packages depending on core/content as designed).
- The monolith remains available as a compatibility meta-package that re-exports modular packages.

### Target architecture diagram (modular-first)

```mermaid
flowchart TD
  Core[@ananke/core]
  Content[@ananke/content]
  Combat[@ananke/combat]
  Campaign[@ananke/campaign]
  Bridge[@ananke/bridge]

  Combat --> Core
  Combat --> Content
  Campaign --> Core
  Campaign --> Content
  Content --> Core
  Bridge --> Core

  Meta[@its-not-rocket-science/ananke (meta-package)] --> Core
  Meta --> Combat
  Meta --> Campaign
  Meta --> Content
  Meta --> Bridge
```

---

## 4) Notes on `packages/*` workspace population

`package.json` declares `"workspaces": ["packages/*"]`. In the current repository state:

- `packages/core`, `packages/combat`, `packages/campaign`, and `packages/content` are present but mostly stub wrappers (re-export only).
- `packages/cli` exists but is marked `private: true` and points at root `dist/tools/*` binaries.
- This means workspaces are present and useful for import-path migration, but they are **not yet independently implemented package modules**.

---

## 5) Practical interpretation for adopters

- Treat today’s setup as a **monolith with modular entry-point aliases**.
- Expect true modularization benefits (stronger isolation and clearer independent package ownership) only after Phase 2 source migration and boundary cleanup are completed.
