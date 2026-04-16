# Package architecture: shipped state, partial modularization, and target state

This document reconciles three different things that are easy to blur together:

1. What the repository and npm package ship **today**.
2. What is **partially implemented** toward modular packages.
3. What the **target architecture** is intended to be.

---

## Current state (shipped now)

### What is published today

The primary published package is still the monolith:

- Package name: `@its-not-rocket-science/ananke`
- Root entrypoint: `.` → `dist/src/index.js`
- Many subpath exports (for example `./combat`, `./campaign`, `./species`, `./content`, etc.) from the same monolith build output.

In other words: consumers can import many domain-specific entrypoints, but they are exported from one package build at the root.

### Filesystem/layout reality

- Main implementation is in `src/`.
- Workspaces exist at `packages/*`.
- `packages/core`, `packages/combat`, `packages/campaign`, and `packages/content` currently contain thin Phase 1 wrappers (`index.js` + `index.d.ts`) that re-export monolith entrypoints.
- `packages/cli` exists, but it is private and points to root `dist/tools/*` binaries.

### Current architecture diagram (monolith-first)

```mermaid
flowchart LR
  App[Consumer app]
  Mono[@its-not-rocket-science/ananke]
  Dist[dist/src/*]
  Src[src/* implementation]

  App --> Mono
  Mono --> Dist
  Dist --> Src

  subgraph Phase 1 workspace wrappers
    Core[@ananke/core]
    Combat[@ananke/combat]
    Campaign[@ananke/campaign]
    Content[@ananke/content]
  end

  Core -.re-exports.-> Mono
  Combat -.re-exports.-> Mono
  Campaign -.re-exports.-> Mono
  Content -.re-exports.-> Mono
```

---

## In progress (partially implemented)

Modularization work is in progress and incomplete.

### Already implemented

- A modular ownership map and allowed dependency graph exist in `tools/package-boundaries.config.json`.
- Boundary checking/report tooling exists (`tools/check-package-boundaries.ts`, `npm run check-boundaries*`).
- Workspace package names and import surfaces for `@ananke/core`, `@ananke/combat`, `@ananke/campaign`, and `@ananke/content` are present.

### Not complete yet

- Boundary compliance is not yet achieved. The latest checked-in report (`docs/package-boundary-report.md`, generated 2026-04-09) still shows:
  - hard violations,
  - suspicious imports,
  - and unmapped files.
- Workspace packages are still wrappers; they do not yet own independent implementation/source trees.
- Because wrappers re-export from the monolith, modular import paths do **not** yet imply full package isolation.

---

## Target state (planned)

The target architecture is modular-first:

- Each `@ananke/*` package owns its code, build output, and tests.
- Cross-package imports follow the declared DAG (for example, `content -> core`, `combat -> core/content`, `campaign -> core/content`).
- The monolith package remains as a compatibility/meta layer that re-exports modular packages for adopters who want one dependency.

### Target architecture diagram (modular-first)

```mermaid
flowchart TD
  Core[@ananke/core]
  Content[@ananke/content]
  Combat[@ananke/combat]
  Campaign[@ananke/campaign]

  Content --> Core
  Combat --> Core
  Combat --> Content
  Campaign --> Core
  Campaign --> Content

  Meta[@its-not-rocket-science/ananke (compat/meta)]
  Meta --> Core
  Meta --> Content
  Meta --> Combat
  Meta --> Campaign
```

---

## What this means for adopters today

- You can safely use the monolith package now; it is the most direct reflection of shipped structure.
- You can also use `@ananke/*` imports today, but treat them as import-path aliases/wrappers rather than fully independent packages.
- Do not assume current modular imports provide maximum tree-shaking or strict package-boundary guarantees yet.
- Migration to modular import paths can reduce future refactors, because those paths are intended to remain valid as ownership moves into `@ananke/*` packages.
