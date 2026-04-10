# Ananke — Stable API Reference

Canonical contract sources:

- `src/index.ts`
- `docs/stable-api-manifest.json`
- `docs/public-contract.md`


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

## Shipped but not Tier-1 (subpath imports)

Everything below is public and shipped through `package.json` exports, but must be treated by the taxonomy as **Shipped but undocumented**, **Experimental**, or **Internal** (never Tier 1 stable unless explicitly labeled).

- Experimental subpaths: see `docs/module-index.md` for grouped listing.
- Internal/advanced subpath: `@its-not-rocket-science/ananke/tier3`.

## Rules

- Do not import non-listed symbols from root and assume stability.
- If a symbol is shipped only via subpath, treat it as shipped-but-not-Tier-1 unless a specific subpath-stability claim exists.

