# Ananke — Stable API Reference

Canonical contract sources:

- `src/index.ts`
- `docs/stable-api-manifest.json`
- `docs/public-contract.md`

For explicit maintainer promises, exclusions, and version-pinning guidance, see `docs/support-boundaries.md`.


## Stability labels (taxonomy-bound)

<!-- CONTRACT:STABILITY_LABELS:start -->
```json
[
  { "kind": "subpath", "subject": ".", "status": "Tier 1 stable", "notes": "Root package entrypoint" },
  { "kind": "symbol-group", "subject": "root:tier1-symbols", "status": "Tier 1 stable", "notes": "Manifest-backed root symbols" }
]
```
<!-- CONTRACT:STABILITY_LABELS:end -->

## Tier-1 (root-stable)

Only root imports are Tier-1:

```ts
import { ... } from "@its-not-rocket-science/ananke";
```

<!-- CONTRACT:TIER1_SYMBOLS:start -->
```json
[
  "AnankeScenario",
  "AnankeScenarioEntity",
  "AnimationHints",
  "Command",
  "CommandMap",
  "Entity",
  "EntitySpec",
  "G_mps2",
  "I32",
  "IndividualAttributes",
  "KernelContext",
  "LoadedPlugin",
  "PluginHookContext",
  "PluginHooks",
  "PluginManifest",
  "PluginModule",
  "PluginPermission",
  "PluginRuntimeApi",
  "Q",
  "Replay",
  "ReplayFrame",
  "ReplayRecorder",
  "RigSnapshot",
  "SCALE",
  "WorldState",
  "clampQ",
  "createWorld",
  "deriveAnimationHints",
  "deserializeReplay",
  "extractRigSnapshots",
  "from",
  "installPluginFromRegistry",
  "loadPlugin",
  "loadScenario",
  "mulDiv",
  "q",
  "qDiv",
  "qMul",
  "replayTo",
  "serializeReplay",
  "sqrtQ",
  "stepWorld",
  "to",
  "validateScenario"
]
```
<!-- CONTRACT:TIER1_SYMBOLS:end -->

## Tier-2 stable (subpath imports with explicit stability claims)

The following subpaths are **Tier 2 stable**: they are fully implemented, thoroughly tested (>90% coverage), and API-stable within the `@minor` version boundary. Breaking changes require at minimum a minor version bump with a CHANGELOG entry. They are not Tier-1 because they are not re-exported from the root entrypoint.

| Subpath | Status | Coverage | Notes |
|---------|--------|----------|-------|
| `@its-not-rocket-science/ananke/sim/combat` | **Tier 2 stable** | >95% | `resolveHit`, `computeWeaponEnergy`, `CombatResult` — full pair-based combat resolution |
| `@its-not-rocket-science/ananke/sim/disease` | **Tier 2 stable** | 100% | `exposeToDisease`, `stepDiseaseForEntity`, `spreadDisease`, all 6 built-in profiles |
| `@its-not-rocket-science/ananke/sim/hazard` | **Tier 2 stable** | >95% | `computeHazardExposure`, `deriveHazardEffect`, `stepHazardZone`, all 5 built-in zones |

```ts
// Stable Tier-2 usage:
import { resolveHit, computeWeaponEnergy } from "@its-not-rocket-science/ananke/sim/combat";
import { exposeToDisease, spreadDisease }   from "@its-not-rocket-science/ananke/sim/disease";
import { computeHazardExposure, CAMPFIRE }  from "@its-not-rocket-science/ananke/sim/hazard";
```

> **Path to Tier-1**: These subpaths will be promoted to Tier-1 (re-exported from root) when the API has been exercised by ≥2 external integrations with documented use cases. Track `ROADMAP.md` for PM-series milestones.

## Shipped but not Tier-1 (subpath imports)

Everything below is public and shipped through `package.json` exports, but must be treated by the taxonomy as **Shipped but undocumented**, **Experimental**, or **Internal** (never Tier 1 stable unless explicitly labeled).

- Experimental subpaths: see `docs/module-index.md` for grouped listing.
- Internal/advanced subpath: `@its-not-rocket-science/ananke/tier3`.

## Rules

- Do not import non-listed symbols from root and assume stability.
- If a symbol is shipped only via subpath, treat it as shipped-but-not-Tier-1 unless a specific subpath-stability claim exists.
- If you depend on subpaths in production, pin versions conservatively and regression-test every upgrade.

