# Subpath Reference (Top Priority)

This document hardens the most important public subpaths with explicit usage guidance.

Stability taxonomy follows `docs/public-contract.md` and `docs/export-status-matrix.md`:
- **Tier 1 stable**: root (`.`) only.
- **Shipped but undocumented**: public subpaths without Tier-1 guarantees.
- **Experimental**: currently `./tier2`.
- **Internal**: currently `./tier3`.

## `./species`
- **Purpose:** Define and reason about species templates, traits, and body-plan level metadata.
- **Stability:** **Shipped but undocumented** (public, non-Tier-1).
- **Example import:**
```ts
import * as Species from "@its-not-rocket-science/ananke/species";
```
- **Doc destination:** [Module index entry](./module-index.md).

## `./combat`
- **Purpose:** Combat-facing APIs for deterministic battle resolution and combat-adjacent mechanics.
- **Stability:** **Shipped but undocumented** (public, non-Tier-1).
- **Example import:**
```ts
import * as Combat from "@its-not-rocket-science/ananke/combat";
```
- **Doc destination:** [Integration primer](./integration-primer.md).

## `./campaign`
- **Purpose:** Campaign-scale simulation surface (long-horizon world/campaign stepping).
- **Stability:** **Shipped but undocumented** (public, non-Tier-1).
- **Example import:**
```ts
import * as Campaign from "@its-not-rocket-science/ananke/campaign";
```
- **Doc destination:** [Module index entry](./module-index.md).

## `./polity`
- **Purpose:** Macro governance/polity stepping and policy-state transitions.
- **Stability:** **Shipped but undocumented** (public, non-Tier-1).
- **Example import:**
```ts
import * as Polity from "@its-not-rocket-science/ananke/polity";
```
- **Doc destination:** [Recipes matrix](./recipes-matrix.md).

## `./character`
- **Purpose:** Character lifecycle, progression, and per-entity gameplay state helpers.
- **Stability:** **Shipped but undocumented** (public, non-Tier-1).
- **Example import:**
```ts
import * as Character from "@its-not-rocket-science/ananke/character";
```
- **Doc destination:** [Project overview](./project-overview.md).

## `./catalog`
- **Purpose:** Shared content lookup/catalog APIs used by higher-level systems.
- **Stability:** **Shipped but undocumented** (public, non-Tier-1).
- **Example import:**
```ts
import * as Catalog from "@its-not-rocket-science/ananke/catalog";
```
- **Doc destination:** [Package architecture](./package-architecture.md).

## `./social`
- **Purpose:** Social simulation state, interactions, and relationship-oriented rules.
- **Stability:** **Shipped but undocumented** (public, non-Tier-1).
- **Example import:**
```ts
import * as Social from "@its-not-rocket-science/ananke/social";
```
- **Doc destination:** [Module index entry](./module-index.md).

## `./netcode`
- **Purpose:** Lockstep/replication helpers for deterministic multiplayer and state hashing.
- **Stability:** **Shipped but undocumented** (public, non-Tier-1).
- **Example import:**
```ts
import * as Netcode from "@its-not-rocket-science/ananke/netcode";
```
- **Doc destination:** [Wire protocol](./wire-protocol.md).

## `./schema`
- **Purpose:** Snapshot/schema migration and persistence-facing compatibility helpers.
- **Stability:** **Shipped but undocumented** (public, non-Tier-1).
- **Example import:**
```ts
import * as Schema from "@its-not-rocket-science/ananke/schema";
```
- **Doc destination:** [Versioning](./versioning.md).

## `./content-pack`
- **Purpose:** Content pack loading/validation and integration hooks for external data packs.
- **Stability:** **Shipped but undocumented** (public, non-Tier-1).
- **Example import:**
```ts
import * as ContentPack from "@its-not-rocket-science/ananke/content-pack";
```
- **Doc destination:** [Plugin/content docs](./plugins/README.md).
