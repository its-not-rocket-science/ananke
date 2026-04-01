# Changelog

All notable changes to Ananke are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.1.63] — 2026-04-01

### Added

- **PM-4 — Release Discipline Dashboard (complete):**
  - `tools/release-check.ts` (new): pre-release gate runner that executes 6 gates in sequence and produces two output artefacts:
    1. **Schema migration pass** — runs `test/schema-migration.test.ts` + `test/anatomy_schema.test.ts` via Vitest
    2. **Golden replay / fixture round-trip** — skips gracefully if `test/fixtures/` does not exist; runs fixture tests when present
    3. **Bridge contract type-check** — `tsc --noEmit -p tsconfig.build.json`; counts TypeScript errors
    4. **Benchmark regression** — delegates to `dist/tools/benchmark-check.js`; exit-code based
    5. **Emergent behaviour validation** — runs emergent-validation and parses PASS / PARTIAL PASS / FAIL from stdout
    6. **Module-index freshness** — re-generates `docs/module-index.md` and diffs against the committed version; warns if stale
  - `docs/release-report.json` (auto-generated): structured JSON with timestamp, version, per-gate status, duration, summary, and detail strings.
  - `docs/release-dashboard.md` (auto-generated): human-readable Markdown audit trail rendered from the JSON report. Includes verdict, gate table, and per-gate detail blocks.
  - `--quick` flag: skips slow gates (benchmark, emergent validation) for fast local checks.
  - Exit code: 0 = releasable (no failures, no warnings); 1 = not releasable.
  - npm scripts: `release-check`, `release-check:quick`.
- 0 new tests (5,569 total). Coverage unchanged. Build: clean.

---

## [0.1.62] — 2026-04-01

### Added

- **PM-3 — Supported-Recipes Matrix (complete):**
  - `docs/recipes-matrix.md` (new, auto-generated): 36 recipes across 6 domains (Tactical ⚔️, Campaign 🏰, Content 📦, Renderer 🖼️, Multiplayer 🌐, Tooling 🔧). Each row maps a use case to recommended packages, stability tier (🟢 Stable / 🟡 Experimental), runnable npm script, performance envelope, and save/replay compatibility status. Domain tables, summary counts, and a quick-reference "I want to…" table at the bottom.
  - `tools/generate-recipes-matrix.ts` (new): structured recipe catalogue as TypeScript array; outputs `docs/recipes-matrix.md` deterministically. Run `npm run generate-recipes-matrix` to refresh.
  - `npm run generate-recipes-matrix` script added.
  - README: "Not sure which entry point to use? → Recipes Matrix" note added near the cookbook paragraph; matrix linked first in the Further Reading table.
- 0 new tests (5,569 total). Coverage unchanged. Build: clean.

---

## [0.1.61] — 2026-04-01

### Added

- **PM-2 — Package-Boundary Enforcement in CI (complete):**
  - `tools/check-package-boundaries.ts` (new): static import-graph analyser mapping all 207 src/ files to their planned `@ananke/*` package. Reports:
    - **Hard violations** — files classified as `@ananke/core` that import from `@ananke/combat`, `@ananke/campaign`, or `@ananke/content` (86 identified; all expected in Phase 1 monolith, must be resolved in Phase 2 source migration).
    - **Suspicious cross-boundary imports** — peer-layer imports (`combat↔campaign`, `combat↔content`, `content↔campaign`) grouped by edge with file:line references and example paths.
    - **Cross-package import matrix** — NxN table showing import counts between packages, annotated ✓ (allowed) or ✗ (violation).
    - **Source size estimate** — raw TypeScript byte counts per package (core 341 KB, combat 499 KB, campaign 833 KB, content 248 KB).
    - **Unmapped files** — 9 files not yet in the mapping (atmosphere, battle-bridge, debug, host-loop, index, parallel, sensory, terrain-bridge).
    - Flags: `--strict` (exit 1 on hard violations), `--json` (machine-readable output).
  - `tools/extract-api.ts` (new): public API surface extraction — scans each package's entry-point source files for exported symbols, generates `docs/api-surface-<package>.md` with grouped tables (types/interfaces, enums, functions, constants, classes) and a source-file index.
    - `docs/api-surface-core.md` — 125 exports
    - `docs/api-surface-combat.md` — 221 exports
    - `docs/api-surface-campaign.md` — 691 exports
    - `docs/api-surface-content.md` — 103 exports (1140 total)
  - `"ci"` script now runs `check-boundaries` after test coverage, making cross-boundary drift visible in CI output.
  - npm scripts: `check-boundaries`, `check-boundaries:strict`, `extract-api`.
- 0 new tests (5,569 total — tools only). Coverage unchanged: 97.11% stmt, 88.08% branch, 95.82% func. Build: clean.

---

## [0.1.60] — 2026-03-31

### Added

- **PM-1 — First-Party Reference Builds (complete):**
  - `examples/reference/tactical-duel/` — end-to-end tactical demonstration: combat, anatomy, AI, `serializeBridgeFrame`, `hashWorldState`, `ReplayRecorder`. Runs in < 1 ms/tick; produces a replay file comparable with `npx ananke replay diff`. Includes architecture doc and pain-points guide.
  - `examples/reference/campaign-sandbox/` — turn-based world simulation: four polities (Rome, Carthage, Athens, Sparta) with trade, alliances, population dynamics, plague outbreak, inter-polity spread, save/reload via `stampSnapshot`. Runs in < 1 ms/day. Includes full `README.md` with correct API signatures.
  - `examples/reference/species-lab/` — xenobiology lab: attribute profiles for 6 species (Elf, Dwarf, Orc, Goblin, Troll, Halfling), extended-senses predicates, round-robin combat tournament (100 seeds × 15 matchups) with outcome distributions and physics insights. Quick mode (`--quick`) completes 150 trials in < 1 s. Includes pain-points guide and extension examples.
  - Each reference build includes: architecture diagram, package choices rationale, measured performance envelope, pain points encountered and resolved, extension examples.
  - npm scripts: `ref:tactical-duel`, `ref:campaign-sandbox`, `ref:species-lab`, `ref:species-lab:quick`.
  - ROADMAP: PM-1 through PM-10 added (Platform Maturity Roadmap); PA-1, PA-5–PA-8 marked complete.

---

## [0.1.59] — 2026-03-30

### Added

- **PA-10 — Deterministic Networking Kit (complete):**
  - `src/netcode.ts` (new): determinism utilities for authoritative lockstep and desync diagnosis.
    - **`hashWorldState(world): bigint`**: FNV-64 hash over `tick`, `seed`, and all entity state sorted by `id` (Map fields serialised as sorted entry arrays for canonical form). Use as a per-tick desync checksum in multiplayer loops.
    - **`diffReplays(replayA, replayB, ctx): ReplayDiff`**: steps two replays in lock-step and returns the first tick where their hashes diverge. O(N) in replay length.
    - **`diffReplayJson(jsonA, jsonB, ctx): ReplayDiff`**: convenience wrapper for CLI use.
    - `ReplayDiff` interface: `{ divergeAtTick, hashA, hashB, ticksCompared }`.
  - `"./netcode"` subpath export added to `package.json`.
  - **`ananke replay diff` CLI subcommand**: extends the `npx ananke` CLI — reads two replay JSON files and prints the first divergence tick and hex hashes, or confirms they are identical. Exit code 0 = identical; exit code 1 = divergence.
  - **`docs/netcode-host-checklist.md`** (new): 8-section guide covering fixed tick rate, no wall-clock reads in simulation path, input serialisation format, desync detection, state resync (full snapshot), replay recording and diff, rollback implementation outline, and KernelContext consistency requirements.
  - **`examples/lockstep-server.ts`** (new): self-contained authoritative lockstep demo — one server steps the world, two virtual clients verify hash checksums every tick. Demonstrates replay recording and `serializeBridgeFrame` integration.
  - **`examples/rollback-client.ts`** (new): rollback demo — client predicts speculatively, reconciles against server hash, and re-simulates from the last confirmed snapshot when a mismatch is detected.
  - npm scripts: `example:lockstep`, `example:rollback`.
- 16 new tests (189 test files, 5,569 tests total). Coverage: 97.11% stmt, 88.07% branch, 95.82% func. `netcode.ts`: 100%/100%/100%. Build: clean.

---

## [0.1.58] — 2026-03-30

### Added

- **PA-9 — Simulation Cookbook (complete):**
  - `docs/cookbook.md` (new): 12 task-oriented recipes designed to take a developer from zero to running simulation in under 30 minutes.
    - **Recipe 1 — Simulate a duel**: `mkWorld` + `stepWorld` + command loop; expected output showing injury accumulation and fight end.
    - **Recipe 2 — Run a 500-agent battle**: entity loop with `buildAICommands`; timing guidance (≤6 ms/tick on modern hardware).
    - **Recipe 3 — Author a new species**: custom `Archetype` → `generateIndividual`; species-specific attribute overrides.
    - **Recipe 4 — Add a custom weapon**: `Item` definition with mass, blade length, and damage profile; `createWorld` with `customItems`.
    - **Recipe 5 — Drive a renderer**: `serializeBridgeFrame` + WebSocket sidecar pattern; references `docs/quickstart-unity.md`, `docs/quickstart-godot.md`, `docs/quickstart-web.md`.
    - **Recipe 6 — Create a campaign loop**: `createPolity` + `stepPolityDay`; campaign-to-tactical transition example.
    - **Recipe 7 — Build a validation scenario**: empirical range-check pattern; tolerance bands and `±%` reporting.
    - **Recipe 8 — Use the what-if engine**: `npm run run:what-if`; scenario customization via parameter override.
    - **Recipe 9 — Stream events to an agent**: delta detection + `serializeBridgeFrame` push over Server-Sent Events.
    - **Recipe 10 — Save and reload a world**: `JSON.stringify` / `JSON.parse` round-trip with tick continuity check.
    - **Recipe 11 — Record and replay a fight**: `ReplayRecorder` + `replayTo` + `serializeReplay` / `deserializeReplay`.
    - **Recipe 12 — Load a content pack**: `loadPack` + `validatePack` + pack JSON schema reference.
  - `README.md`: cookbook cross-link added in intro and "Further reading" table.

---

## [0.1.57] — 2026-03-30

### Added

- **PA-8 — Host Integration SDKs (complete):**
  - `src/host-loop.ts` (new): stable, versioned wire-format protocol for the Ananke sidecar ↔ renderer bridge. All values on the wire are real SI units (floats, not fixed-point).
    - **Wire types**: `BridgeVec3`, `BridgeCondition`, `BridgeAnimation`, `BridgePoseModifier`, `BridgeGrappleConstraint`, `BridgeEntitySnapshot`, `BridgeFrame`, `HostLoopConfig`.
    - **`serializeBridgeFrame(world, config)`**: canonical serializer — converts `WorldState` to `BridgeFrame`. Replaces per-sidecar serializer duplications in Unity and Godot reference implementations.
    - **`derivePrimaryState(animation)`**: maps `AnimationHints` to a single state string (`"idle"` | `"attack"` | `"flee"` | `"prone"` | `"unconscious"` | `"dead"`). Suitable for top-level renderer state machines.
    - **`derivePoseOffset(segmentId, impairmentQ)`**: anatomical local-space bone offset at a given impairment level (real metres), for injury deformation blend shapes.
    - Constants: `BRIDGE_SCHEMA_VERSION = "ananke.bridge.frame.v1"`, `DEFAULT_TICK_HZ = 20`, `DEFAULT_BRIDGE_PORT = 3001`, `DEFAULT_BRIDGE_HOST`, `DEFAULT_STREAM_PATH`.
  - `"./host-loop"` subpath export added to `package.json`.
  - **Reference sidecar updates**: both `ananke-unity-reference` and `ananke-godot-reference` sidecars updated to v0.1.57 dependency and refactored to import `serializeBridgeFrame` from `@its-not-rocket-science/ananke/host-loop` — local serialization code removed.
  - **Quickstart guides** (new):
    - `docs/quickstart-unity.md`: 15-minute Unity integration guide (sidecar → WebSocket → `AnankeReceiver` → `AnimationDriver` → your mesh).
    - `docs/quickstart-godot.md`: 15-minute Godot 4 integration guide (GDScript and C# addon variants).
    - `docs/quickstart-web.md`: Three.js browser integration guide (zero-build-step HTML example + `serializeBridgeFrame` sidecar recipe).
- 41 new tests (188 test files, 5,553 tests total). Coverage: 97.10% stmt, 88.05% branch, 95.81% func. Build: clean.

---

## [0.1.56] — 2026-03-30

### Added

- **PA-7 — Advanced Non-Visual Sensory Systems (complete):**
  - `src/sim/sensory-extended.ts`: added `thermalVisionRange_m?: number` to `ExtendedSenses` interface — fourth modality alongside echolocation, electroreception, and olfaction. Effective range scales with target thermal signature; degraded by precipitation; dead entities have no thermal signature.
  - `src/extended-senses.ts` (new): unified extended-senses module with `AtmosphericState` integration (PA-6).
    - Body-plan predicates: `hasEcholocation`, `hasElectroreception`, `hasThermalVision`, `hasOlfaction`, `dominantSense` (priority: electroreception > echolocation > thermal > olfaction > vision).
    - `thermalSignature(entity)` → Q: dead=q(0); living=base q(0.30) + q(0.10) per bleeding region + q(0.15) if shock≥q(0.40).
    - `canDetectByThermalVision(observer, subject, dist_m, precipIntensity?)`: effective range = baseRange × signature / SCALE.Q × (1 − precipIntensity × 0.60). Detection quality `DETECT_THERMAL = q(0.35)`.
    - `canDetectExtendedAtmospheric(observer, subject, env, atmospheric, sensorBoost?)`: drop-in replacement for Phase 52 `canDetectExtended` that uses `AtmosphericState.scentStrength_Q` from `queryAtmosphericModifiers` for olfaction, and `precipIntensity_Q` for thermal attenuation.
    - `stepExtendedSenses(observer, world, atmospheric, env)` → `ExtendedSensesResult { detections }`: per-tick batch detection accumulator; iterates all world entities, checks all four extended modalities, returns `SensoryDetection[]` with `entityId`, `modality`, `quality_Q`, `dist_Sm`. Multiple detections per target are possible.
  - Exports: `SenseModality`, `SensoryDetection`, `ExtendedSensesResult`, `THERMAL_BASE_SIGNATURE_Q`, `THERMAL_BLEED_BONUS_Q`, `THERMAL_SHOCK_BONUS_Q`, `THERMAL_SHOCK_THRESHOLD`, `THERMAL_PRECIP_PENALTY`, `DETECT_THERMAL`, `DETECT_OLFACTION_ATMO_MIN`, `DETECT_OLFACTION_ATMO_MAX`.
  - `"./extended-senses"` subpath export added to `package.json`.
- 60 new tests (187 test files, 5,512 tests total). Build: clean.

---

## [0.1.55] — 2026-03-30

### Added

- **PA-6 — Unified Atmosphere Model (complete):**
  - `src/atmosphere.ts` (new): single `AtmosphericState` struct derived from Phase 51 `WeatherState` and Phase 68 `BiomeContext`, with a unified per-pair query API.
  - `deriveAtmosphericState(weather?, biome?)` → `AtmosphericState`: maps WeatherState wind to 3D `AtmosphericWind` (adds `dz_m`, derives `turbulence_Q` from speed); derives `precipIntensity_Q` from precipitation type; computes `baseVisibility_Sm` from fog × precipitation; computes `acousticMask_Q` from wind noise; maps biome `soundPropagation_Q` (vacuum = 0, water = 4×, standard air = 1×); derives `tractionMod_Q` and `thermalOffset_Q` from `deriveWeatherModifiers`.
  - `queryAtmosphericModifiers(from, to, state)` → `AtmosphericModifiers`: single call yields all position-pair atmospheric effects — `crossWindSpeed_mps` (perpendicular wind for projectile drift), `hazardConeMul_Q` (gas/smoke cone range 0.5×–1.5× from headwind/tailwind), `acousticMaskMul_Q` (hearing range including upwind bonus and biome propagation), `visibilityRange_Sm` (headwind-boosted precipitation degradation), `tractionMod_Q`, `scentStrength_Q` (q(1.0) fully downwind of target, q(0) upwind — prerequisite for PA-7), `thermalOffset_Q`.
  - `"./atmosphere"` subpath export added to `package.json`.
  - Exports: `AtmosphericWind`, `AtmosphericState`, `AtmosphericModifiers`, `deriveAtmosphericState`, `queryAtmosphericModifiers`; constants `ATMO_BASE_VISIBILITY_Sm`, `ATMO_ACOUSTIC_FULL_MASK_MPS`, `ATMO_TURBULENCE_FULL_MPS`, `ATMO_HAZARD_TAILWIND_MUL_MAX`, `ATMO_HAZARD_HEADWIND_MUL_MIN`, `ATMO_HEARING_UPWIND_BONUS`.
- 53 new tests (186 test files, 5,452 tests total). Build: clean.

---

## [0.1.54] — 2026-03-28

### Added

- **PA-5 — Campaign ↔ Tactical Terrain Bridge (complete):**
  - `src/terrain-bridge.ts` (new): maps campaign hex tiles to tactical battlefield parameters consumable by `KernelContext`, and merges tactical battle results back into `CampaignState`.
  - `extractTerrainParams(hexType)` → deterministic 10×8-cell (100 m × 80 m) battlefield with `TerrainGrid`, `ObstacleGrid`, `ElevationGrid`, `SlopeGrid`, and `CoverSegment[]` for all 8 hex types: `plains`, `forest`, `hills`, `marsh`, `urban`, `mountain`, `river_crossing`, `coastal`.
  - `generateBattleSite(ctx)` → full `BattleTerrainParams` including `EntryVector[]` — attacker/defender spawn positions (y=5 m south, y=75 m north) with `facingY` direction.
  - `mergeBattleOutcome(campaign, outcome)` → merges post-battle `WorldState` into `CampaignState`: removes `injury.dead` entities, copies post-battle `injury`/`condition` onto survivors, transfers looted weapons/items from captured entities to winner's inventory, advances `worldTime_s`, appends a log entry.
  - Exports: `CampaignHexType`, `EntryVector`, `BattleTerrainParams`, `BattleSiteContext`, `BattleOutcome`; field constants `FIELD_WIDTH_Sm`, `FIELD_HEIGHT_Sm`, `CELL_SIZE_Sm`, `GRID_COLS`, `GRID_ROWS`.
  - `"./terrain-bridge"` subpath export added to `package.json`.
- 67 new tests (185 test files, 5,397 tests total). Coverage: 97.05% stmt, 87.88% branch, 95.75% func, 97.05% lines. Build: clean.

---

## [0.1.53] — 2026-03-28

### Added

- **PA-4 — Scenario & Content Pack System (complete):**
  - `src/content-pack.ts` (new): runtime `.ananke-pack` loader — `validatePack`, `loadPack`, `getPackScenario`, `instantiatePackScenario`, `listLoadedPacks`, `getLoadedPack`, `clearPackRegistry`. `loadPack` registers weapons/armour/archetypes into the global catalog AND into the world-factory extension tables so they are immediately usable in `loadScenario` scenarios.
  - `src/world-factory.ts`: added `registerWorldArchetype`, `registerWorldItem`, `clearWorldExtensions` extension hooks so content packs can make their items available to `createWorld` / `loadScenario` without a source build.
  - `schema/pack.schema.json` (new): JSON Schema 2020-12 for pack manifests (weapons, armour, archetypes, scenarios sections; full per-field documentation).
  - `tools/pack-cli.ts` (new): `ananke pack validate <file>`, `ananke pack bundle <dir>`, `ananke pack load <file>`. Registered as `bin.ananke` in `package.json` so `npx ananke pack validate` works after install.
  - `examples/packs/weapons-medieval.json`: 5 medieval weapons + 3 armours.
  - `examples/packs/species-humanoids.json`: 4 humanoid archetype variants.
  - `examples/packs/scenarios-duel.json`: 3 duel scenarios, self-contained with own archetypes and weapons.
  - `"./content-pack"` subpath, `schema/pack.schema.json`, and `bin.ananke` added to `package.json`.
- 32 new tests (184 test files, 5,332 tests total). Build: clean.

---

## [0.1.52] — 2026-03-28

### Added

- **PA-3 — Stable Schema, Save & Wire Contract (complete):**
  - `src/schema-migration.ts` (new): schema versioning and migration utilities — `SCHEMA_VERSION`, `stampSnapshot`, `validateSnapshot` (returns `ValidationError[]` with JSONPath paths), `migrateWorld` (chains registered migrations; legacy saves treated as version `"0.0"`), `registerMigration`, `detectVersion`, `isValidSnapshot`.
  - `schema/world.schema.json` (new): JSON Schema 2020-12 for `WorldState` — documents `@core` fields (`tick`, `seed`, `entities` with per-entity validation), `@subsystem` fields, and Q-value semantics.
  - `schema/replay.schema.json` (new): JSON Schema 2020-12 for `Replay` / `ReplayFrame` / `Command`.
  - `docs/wire-protocol.md` (new): Q-value serialisation rules (store raw integers, never divide by `SCALE.Q`), binary diff format (ANKD magic, tag-value encoding), multiplayer lockstep message types (`cmd`/`ack`/`resync`/`hash_mismatch`), save-format recommendations, and full load-with-migration code sample.
  - `"./schema"` subpath added to `package.json` exports.
  - `schema/` directory and `docs/wire-protocol.md` added to `package.json` `"files"`.
- 39 new tests (183 test files, 5,300 tests total). Build: clean.

---

## [0.1.51] — 2026-03-28

### Added

- **PA-2 — Modular Package Architecture (Phase 1 complete):**
  - `packages/core/` — `@ananke/core` stub; re-exports the full main `"."` entry point (kernel, entity model, units, RNG, replay, bridge).
  - `packages/combat/` — `@ananke/combat` stub; re-exports `"./combat"`, `"./anatomy"`, `"./competence"`, `"./wasm-kernel"`.
  - `packages/campaign/` — `@ananke/campaign` stub; re-exports all 32 campaign-scale subpaths (polity, social, narrative, feudal, demography, economy, military…).
  - `packages/content/` — `@ananke/content` stub; re-exports `"./species"`, `"./catalog"`, `"./character"`, `"./crafting"`.
  - Each stub ships a pre-built `index.js` + `index.d.ts` (no separate compilation step); `@its-not-rocket-science/ananke` is a peer dependency.
  - Root `package.json` gains `"workspaces": ["packages/*"]` for local linking.
  - `docs/package-architecture.md` (new): canonical package boundary design — dependency graph, monolith subpath → package mapping table, full source-file → package mapping for Phase 2 migration, and a before/after import example.
  - `docs/migration-monolith-to-modular.md` (new): step-by-step migration guide from the monolith to `@ananke/*` packages, with a complete old-import → new-package lookup table and Phase 2 expectations.
  - `docs/package-architecture.md` and `docs/migration-monolith-to-modular.md` added to `package.json` `"files"` so they ship with the published package.
- Build: clean. Tests: 5,261 passing. Coverage unchanged.

---

## [0.1.50] — 2026-03-28

### Docs

- **PA-1 — Documentation Reconciliation & Architecture Map (complete):**
  - `docs/project-overview.md`: Updated stale "next priority" reference plugin note to reflect Godot and Unity bridge plugins are complete; updated CE-1–CE-4 companion infrastructure from "planned" to "all complete"; updated PH-1–PH-8 platform hardening table from "Planned" to "Complete".
  - `docs/module-index.md` (new): Machine-checkable table of all 41 package subpath exports, with stability tier (Tier 1 Stable / Tier 2 Experimental / Tier 3 Campaign-scale), key exports, use-case notes, and doc links. Includes use-case entry-point guide at the top.
  - `tools/generate-module-index.ts` (new): Script that reads `package.json` exports and renders `docs/module-index.md`. Added `generate-module-index` npm script.
  - `docs/integration-primer.md`: Added "Choose Your Entry Point" section before Architecture Overview, with use-case decision tree and module tier table linking to `docs/module-index.md`.
  - `README.md`: Added `docs/module-index.md` row to Further Reading table.
- Build: clean. Tests: 5,261 passing. Coverage: statements 97.1 %, branches 87.83 %, functions 95.65 %, lines 97.1 %.

---

## [0.1.49] — 2026-03-28

### Fixed

- **Crafting subsystem — remaining TODO/placeholder items resolved:**
  - `src/crafting/manufacturing.ts` — `createAssemblySteps`: now derives skill types and tool categories from the recipe's actual `skillRequirements` and `toolRequirements` instead of hardcoded `"forge"`/alternating BK–LM defaults.
  - Removed misleading "placeholder" and outdated "Phase 24 placeholder" comments from `recipes.ts`, `crafting/index.ts`, and `dialogue.ts`; documentation now accurately reflects current behaviour.

### Docs

- **ROADMAP — Platformization & Adoption Roadmap (2026–2027):** Added a new top-level section following external review batch 4, which concluded that the simulation kernel is feature-complete and the next phase should focus on adoption, composability, and contract stability rather than new subsystems. Ten new roadmap items added (PA-1 through PA-10): documentation reconciliation & architecture map, modular package architecture (`@ananke/core`, `@ananke/combat`, etc.), stable schema/save/wire contract, scenario & content pack system, campaign ↔ tactical terrain bridge, unified atmosphere model, advanced non-visual sensory systems, host integration SDKs (Unity / Godot / Unreal / Web), simulation cookbook, and deterministic networking kit.
- Build: clean. Tests: 5,261 passing. Coverage: statements 97.1 %, branches 87.83 %, functions 95.65 %, lines 97.1 %.

---

## [0.1.48] — 2026-03-28

### Fixed

- **Crafting subsystem — TODO/placeholder items resolved:**
  - `src/crafting/materials.ts` — `createMaterialItem`: corrected `mass_kg` (was double-scaled by `SCALE.kg`; now `quantity_kg * SCALE.kg / SCALE.Q`); `bulk` now computed proportionally from quantity instead of a fixed `q(1.0)` placeholder.
  - `src/inventory.ts` — `findMaterialsByType`: replaced loose `templateId.includes(materialTypeId)` with exact `templateId === "material_" + materialTypeId` to prevent false positives (e.g. "iron" matching "iron_ore").
  - `src/crafting/manufacturing.ts` — `ProductionLine` gains optional `workshopTimeReduction_Q` and `workshopQualityBonus_Q` fields; `setupProductionLine` now looks up the recipe and calls `getWorkshopBonus` to populate them; `advanceProduction` applies the time reduction to effective progress; `calculateBatchQualityRange` accepts an optional `workshopQualityBonus_Q` multiplier; `estimateBatchCompletionTime` accepts an optional `workshopTimeReduction_Q` and its formula is corrected (was dividing by SCALE.Q twice, producing near-zero results).
  - `src/crafting/workshops.ts` — `upgradeWorkshop`: now checks that `resources` contains sufficient `material_wood` (10 units per tier step) before upgrading; returns `success: false` when insufficient rather than always succeeding.
  - `src/crafting/index.ts` — `startManufacturing`: now returns the constructed `ProductionLine` in `result.productionLine` so callers can store it for subsequent `advanceManufacturing` calls (persistent state remains the host's responsibility); `advanceManufacturing` now derives quality range and time reduction from the supplied `workshop` rather than using hardcoded values.
- Build: clean. Tests: 5,261 passing. Coverage: statements 97.1 %, branches 87.83 %, functions 95.65 %, lines 97.1 %.

---

## [0.1.47] — 2026-03-27

### Changed

- **Lint clean-up (zero issues)** — eliminated all 574 ESLint errors and warnings across `src/` and `test/`:
  - Replaced all `as any` casts with proper types (`as Q`, `as TechEra`, `as WonderType`, `as unknown as TypeName`, etc.)
  - Removed unused imports and prefixed unused locals with `_` across 50+ test files
  - Fixed `getAvailableMaterials` TODO in `src/crafting/materials.ts` — now accepts `readonly Material[]` and derives per-type totals
  - Removed `@ts-nocheck` from `as/injury.ts`; applied `const` fixes and removed dead imports throughout `src/`
- **UK English** — updated all comments, JSDoc, and documentation prose to British spelling (`armour`, `defence`, `behaviour`, `analyse`, `calibre`, `colour`); exported API identifiers unchanged
- Build: clean. Tests: 5,261 passing. Coverage: statements 97.12 %, branches 87.87 %, functions 95.65 %, lines 97.12 %.

---

## [0.1.46] — 2026-03-27

### Added

- **Phase 101 · Currency & Monetary Policy** (`src/monetary.ts`)
  - `CoinagePolicy`: `"stable" | "slight_debasement" | "heavy_debasement" | "emergency_printing"`.
  - `MonetaryState { polityId, coinPurity_Q, inflationLevel_Q, monetaryCrisis }` — per-polity mutable tracker stored externally.
  - `coinPurity_Q` [0, SCALE.Q]: intrinsic metal content; trade partners check this. Starts at SCALE.Q.
  - `inflationLevel_Q` [0, SCALE.Q]: accumulated price inflation; drives purchasing power loss and unrest. Starts at 0.
  - `monetaryCrisis`: activates when `inflationLevel_Q >= MONETARY_CRISIS_THRESHOLD_Q = q(0.60)`.
  - `POLICY_PURITY_DELTA_PER_DAY`: stable +3 (recovery) → emergency_printing −40/day.
  - `POLICY_INFLATION_DELTA_PER_DAY`: stable −3 (deflation) → emergency_printing +50/day.
  - `POLICY_DAILY_MINT_FRAC_Q`: stable 0 → emergency_printing 30/SCALE.Q (+110%/year).
  - `computePurchasingPower_Q(state)` → `coinPurity × (1 − inflation) / SCALE.Q`; floor q(0.05).
  - `computeMonetaryTradeMultiplier_Q(state)` → `[MONETARY_TRADE_FLOOR_Q, SCALE.Q]`; based on purity; feeds Phase-92.
  - `computeMonetaryUnrest_Q(state)` → `[0, MONETARY_MAX_UNREST_Q=q(0.25)]`; linear on inflation; feeds Phase-90.
  - `computeDebasementGain_cu(polity, policy, elapsedDays)` → advisory preview of mint gain.
  - `stepMonetary(polity, state, policy, elapsedDays)` — mints extra treasury, updates purity/inflation, sets crisis flag.
  - `isMonetaryCrisis(state)` / `isCoinageSound(state, threshold_Q?)` — predicates.
  - Added `./monetary` subpath export to `package.json`.
  - 45 new tests; 5,261 total. Coverage: 100% statements/branches/functions/lines on `monetary.ts`.

---

## [0.1.45] — 2026-03-27

### Added

- **Phase 100 · Wonders & Monuments** (`src/wonders.ts`)
  - `WonderType`: `"great_pyramid" | "colosseum" | "grand_library" | "great_wall" | "grand_harbour" | "aqueduct_system" | "grand_temple"`.
  - `WonderProject { projectId, polityId, type, progress_Q, investedCost_cu, startTick }` — in-progress construction.
  - `Wonder { wonderId, polityId, type, completedAtTick, damaged }` — completed monument.
  - `WonderEffects { stabilityBonus_Q, moraleBonus_Q, researchPointBonus, unrestReduction_Q, tradeIncomeBonus_Q, defenseBonus_Q, epidemicResistance_Q }` — advisory bundle.
  - `WONDER_BASE_COST_CU`: grand_library 150k → great_pyramid 1,000k cu.
  - `WONDER_TYPICAL_DAYS`: grand_library 180 → great_pyramid 3,650 days (10 years).
  - `WONDER_BASE_EFFECTS`: distinct niches — great_wall highest defence (q(0.20)), grand_harbour highest trade (q(0.25)), aqueduct_system highest epidemic resistance (q(0.15)), colosseum highest unrest reduction (q(0.12)), grand_library +3 RP/day, great_pyramid highest stability (q(0.08)).
  - `WONDER_DAMAGED_EFFECT_MUL = q(0.50)` — damaged wonders provide half effects.
  - `WONDER_REPAIR_COST_FRAC = q(0.25)` — repair costs 25% of base construction cost.
  - `createWonderProject(projectId, polityId, type, startTick)` — factory.
  - `contributeToWonder(project, polity, contribution_cu)` — deducts treasury, advances progress_Q; capped by treasury and remaining cost; returns new progress.
  - `isWonderProjectComplete(project)` → `progress_Q >= SCALE.Q`.
  - `completeWonder(project, tick)` → `Wonder`.
  - `damageWonder(wonder)` — set by Phase-96 earthquake or Phase-93 siege callers.
  - `repairWonder(wonder, polity)` → `boolean` — spends repair cost; returns false if funds insufficient.
  - `computeWonderEffects(wonder)` — full or half effects based on damage state.
  - `aggregateWonderEffects(wonders)` — sums Q fields (clamped to SCALE.Q); sums researchPointBonus uncapped.
  - `isWonderIntact(wonder)` / `computeRepairCost(type)` — helpers.
  - Added `./wonders` subpath export to `package.json`.
  - 43 new tests; 5,216 total. Coverage: 100% statements/branches/functions/lines on `wonders.ts`.

---

## [0.1.44] — 2026-03-27

### Added

- **Phase 99 · Mercenaries & Hired Forces** (`src/mercenaries.ts`)
  - `MercenaryBand { bandId, name, size, quality_Q, dailyWagePerSoldier_cu }` — immutable descriptor.
  - `MercenaryContract { contractId, polityId, bandId, daysActive, loyalty_Q, arrears_cu }` — mutable live state stored externally.
  - `MercenaryStepResult { wagePaid_cu, arrearsAdded_cu, loyaltyDelta, deserted }` — step outcome.
  - `DESERT_LOYALTY_THRESHOLD_Q = q(0.25)` — below this, desertion roll fires.
  - `LOYALTY_DECAY_PER_DAY_UNPAID = 80` — loyalty drops 0.8%/day when wages owed.
  - `LOYALTY_GROWTH_PER_DAY_PAID = 20` — loyalty grows 0.2%/day when fully paid.
  - `MAX_MERC_STRENGTH_BONUS_Q = q(0.30)` — caps advisory strength contribution.
  - `computeMercenaryWage(band, elapsedDays)` — `size × dailyWage × days`.
  - `computeMercenaryStrengthContribution(band, contract)` → Q — `size × quality × loyalty / SCALE.Q²`; capped at q(0.30); add to Phase-93 battle strength.
  - `stepMercenaryContract(contract, band, polity, elapsedDays, worldSeed, tick)` — pays wages from treasury, accrues arrears, grows/decays loyalty, rolls desertion via `eventSeed` (deterministic).
  - `applyVictoryLoyaltyBonus(contract)` — q(0.10) boost after campaign victory.
  - `hireMercenaries(contractId, polityId, band, initialLoyalty_Q?)` — factory; default loyalty q(0.70).
  - `isMercenaryReliable(contract)` / `hasMercenaryArrears(contract)` — predicates.
  - Three sample bands: `BAND_LIGHT_CAVALRY` (400 soldiers, q(0.65), 3 cu/day), `BAND_HEAVY_INFANTRY` (600, q(0.85), 5 cu/day), `BAND_SIEGE_ENGINEERS` (200, q(0.75), 8 cu/day).
  - Added `./mercenaries` subpath export to `package.json`.
  - 44 new tests; 5,173 total. Coverage: 100% statements/branches/functions/lines on `mercenaries.ts`.

---

## [0.1.43] — 2026-03-26

### Added

- **Phase 98 · Plague Containment & Quarantine** (`src/containment.ts`)
  - `QuarantinePolicy`: `"none" | "voluntary" | "enforced" | "total_lockdown"`.
  - `ContainmentState { polityId, policy, daysActive, complianceDecay_Q }` — per-polity mutable tracker stored externally.
  - Compliance decay models population resistance to prolonged enforcement: voluntary decays 2/day, enforced 8/day, total_lockdown 18/day (out of SCALE.Q=10000). `changeQuarantinePolicy` resets decay.
  - `QUARANTINE_TRANSMISSION_REDUCTION_Q`: voluntary q(0.20) → enforced q(0.55) → total_lockdown q(0.85) — base transmission cut fed to Phase-88 `spreadEpidemic`.
  - `QUARANTINE_HEALTH_BONUS_Q`: voluntary q(0.05) → total_lockdown q(0.25) — stacks with Phase-88 `deriveHealthCapacity` as additive `healthCapacity_Q` bonus.
  - `QUARANTINE_UNREST_Q`: q(0.02) → q(0.28); grows further as compliance decays.
  - `QUARANTINE_DAILY_COST_PER_1000`: 1 → 5 → 15 cu/1000 pop/day.
  - `computeEffectiveTransmissionReduction(state)` — base reduction × compliance factor.
  - `computeContainmentHealthBonus(state)` — health bonus scaled by compliance.
  - `computeContainmentUnrest(state)` — base unrest + decay-driven bonus.
  - `computeContainmentCost_cu(polity, state, elapsedDays)` — treasury drain.
  - `stepContainment(state, elapsedDays)` — increments daysActive; accrues complianceDecay_Q.
  - `applyQuarantineToContact(contactIntensity_Q, state)` — scales Phase-88 contact parameter by effective reduction; returns reduced value for `computeSpreadToPolity`.
  - `isQuarantineActive(state)` / `isTotalLockdown(state)` — convenience predicates.
  - Added `./containment` subpath export to `package.json`.
  - 47 new tests; 5,129 total. Coverage: 100% statements/branches/functions/lines on `containment.ts`.

---

## [0.1.42] — 2026-03-26

### Added

- **Phase 97 · Famine Relief & Rationing** (`src/famine.ts`)
  - `FaminePhase`: `"none" | "shortage" | "famine" | "catastrophe"` — graduated severity above Phase-87 Granary's binary famine flag.
  - `RationingPolicy`: `"none" | "tight" | "emergency" | "starvation_rations"` — active polity response.
  - `FamineState { polityId, phase, daysInPhase, cumulativeSeverity_Q }` — per-polity mutable tracker stored externally.
  - `FaminePressures { deathBonus_Q, migrationPush_Q, unrestPressure_Q }` — advisory bundle; callers pass fields into Phases 86/81/90.
  - Phase thresholds: shortage < q(0.50), famine < q(0.20), catastrophe < q(0.05) of `computeFoodSupply_Q`.
  - `FAMINE_PHASE_DEATH_Q`: +1%/year (shortage) → +3%/year (famine) → +7%/year (catastrophe); stacks with Phase-86 base famine death.
  - `FAMINE_PHASE_MIGRATION_Q`: q(0.08) → q(0.25) → q(0.50) — feeds Phase-81.
  - `RATIONING_REDUCTION_Q`: tight 20%, emergency 40%, starvation_rations 60% consumption cut.
  - `RATIONING_UNREST_Q`: q(0.04) → q(0.12) → q(0.25) — rationing itself generates unrest.
  - `SEVERITY_DELTA_PER_DAY`: none −5 (decay), shortage +2, famine +10, catastrophe +25 per day; `cumulativeSeverity_Q` models long-term famine damage.
  - `createFamineState(polityId)` — factory.
  - `computeFaminePhase(foodSupply_Q)` — classifies severity from granary output.
  - `computeFaminePressures(state, policy?)` — combined famine + rationing advisory pressures.
  - `stepFamine(state, foodSupply_Q, elapsedDays)` → `boolean` — advances state; returns `true` when phase changes.
  - `computeRationedConsumption(polity, policy, elapsedDays)` — rationed su demand.
  - `stepRationedGranary(polity, granary, policy, elapsedDays)` — replaces Phase-87 `stepGranaryConsumption` when rationing is active.
  - `computeReliefImport(polity, granary, budget_cu, capacityCap_su)` — converts treasury into grain; mutates both in-place; capped by treasury, budget, and granary space.
  - `isFamineActive(state)` / `isCatastrophicFamine(state)` — convenience predicates.
  - Added `./famine` subpath export to `package.json`.
  - 60 new tests; 5,082 total. Coverage: 100% statements/branches/functions/lines on `famine.ts`.

---

## [0.1.41] — 2026-03-26

### Added

- **Phase 96 · Climate Events & Natural Disasters** (`src/climate.ts`)
  - `ClimateEventType`: `"drought" | "flood" | "harsh_winter" | "earthquake" | "plague_season" | "locust_swarm"`.
  - `ClimateEvent { eventId, type, severity_Q, durationDays }` — immutable descriptor.
  - `ActiveClimateEvent { event, remainingDays, elapsedDays }` — mutable progress tracker stored externally by host.
  - `ClimateEffects { deathPressure_Q, harvestYieldPenalty_Q, epidemicGrowthBonus_Q, infrastructureDamage_Q, unrestPressure_Q, marchPenalty_Q }` — advisory bundle passed to Phases 86–93.
  - `BASE_EFFECTS: Record<ClimateEventType, ClimateEffects>` — full-severity baselines: locust_swarm has highest harvest penalty (q(0.80)), plague_season highest epidemic growth (q(0.40)), earthquake highest infrastructure damage (q(0.20)), harsh_winter highest march penalty (q(0.40)).
  - `EVENT_DAILY_PROBABILITY_Q: Record<ClimateEventType, number>` — direct daily integer probabilities out of SCALE.Q=10000: harsh_winter 50, flood 40, drought 30, plague_season 20, locust_swarm 10, earthquake 5.
  - `EVENT_DURATION_RANGE: Record<ClimateEventType, [number, number]>` — duration ranges in days: drought 60–180, plague_season 30–120, harsh_winter 30–90, flood 7–30, locust_swarm 7–21, earthquake 1–3.
  - `createClimateEvent(eventId, type, severity_Q, durationDays)` — factory; clamps severity and enforces minimum duration of 1.
  - `activateClimateEvent(event)` → `ActiveClimateEvent` with `remainingDays = durationDays`, `elapsedDays = 0`.
  - `computeClimateEffects(active)` → `ClimateEffects`; each field = `round(base × severity / SCALE.Q)`; returns zero bundle when expired.
  - `stepClimateEvent(active, elapsedDays)` — decrements `remainingDays` (floor 0), increments `elapsedDays`; returns `true` when event expires.
  - `isClimateEventExpired(active)` → `remainingDays <= 0`.
  - `generateClimateEvent(polityHash, worldSeed, tick)` → `ClimateEvent | undefined` — deterministic random generation via `eventSeed`; rolls each type independently; severity ∈ [q(0.20), q(0.90)]; duration interpolated within type range.
  - `aggregateClimateEffects(actives)` → combined `ClimateEffects` — sums per-field across all active events and clamps to SCALE.Q; expired events contribute zero.
  - Added `./climate` subpath export to `package.json`.
  - 41 new tests; 5,022 total. Coverage: 100% statements/branches/functions/lines on `climate.ts`.

---

## [0.1.40] — 2026-03-26

### Added

- **Phase 95 · Natural Resources & Extraction** (`src/resources.ts`)
  - `ResourceType`: `"iron" | "silver" | "timber" | "stone" | "horses"`.
  - `ResourceDeposit { depositId, polityId, type, richness_Q, maxWorkers }` — immutable site descriptor.
  - `ExtractionState { depositId, assignedWorkers, cumulativeYield_cu }` — mutable accumulator stored externally.
  - `BASE_YIELD_PER_WORKER: Record<ResourceType, number>` — silver 8, horses 5, iron 3, timber/stone 2 cu/worker/day at base.
  - `TECH_EXTRACTION_MUL: Record<number, Q>` — numeric TechEra keys; Prehistoric q(0.40) → DeepSpace q(4.00).
  - `computeDailyYield(deposit, state, techEra)` → cu/day: `workers × baseRate × techMul × richnessMul`; `richnessMul ∈ [q(0.50), q(1.00)]`; 0 when exhausted or no workers.
  - `assignWorkers(deposit, state, workers)` — clamps to `[0, deposit.maxWorkers]`.
  - `depleteDeposit(deposit, yield_cu)` — reduces `richness_Q` by `DEPLETION_RATE_PER_1000_CU = q(0.005)` per 1000 cu extracted.
  - `stepExtraction(deposit, state, polity, elapsedDays)` → `ExtractionStepResult`: adds yield to `polity.treasury_cu`; depletes richness; returns `{ yield_cu, richness_Q, exhausted }`.
  - `computeTotalDailyResourceIncome(deposits, states, techEra)` → cu/day total across all deposits.
  - Secondary bonus sets: `MILITARY_BONUS_RESOURCES` (iron, horses), `CONSTRUCTION_BONUS_RESOURCES` (timber, stone), `MOBILITY_BONUS_RESOURCES` (horses) — advisory flags for Phase-61/89/93.
  - `hasMilitaryBonus / hasConstructionBonus / hasMobilityBonus` helpers.
  - `estimateDaysToExhaustion(deposit, state, techEra)` → ceiling days; Infinity with no workers; 0 when already exhausted.
  - Added `./resources` subpath export to `package.json`.
  - 49 new tests; 4,981 total. Coverage maintained above all thresholds.

---

## [0.1.39] — 2026-03-26

### Added

- **Phase 94 · Laws & Governance Codes** (`src/governance.ts`)
  - `GovernanceType`: `"tribal" | "monarchy" | "oligarchy" | "republic" | "empire" | "theocracy"`.
  - `GovernanceModifiers { taxEfficiencyMul_Q, mobilizationMax_Q, researchBonus, unrestMitigation_Q, stabilityIncrement_Q }` — aggregate modifier bundle applied to downstream phases.
  - `GOVERNANCE_BASE: Record<GovernanceType, GovernanceModifiers>` — baseline modifiers per type; tribal maximises mobilisation (q(0.20)) but has lowest tax efficiency (q(0.60)); oligarchy and empire share highest tax efficiency (q(1.00)); theocracy has highest unrest mitigation (q(0.18)); republic has highest research bonus (+3).
  - `LawCode { lawId, name, taxBonus_Q, researchBonus, mobilizationBonus_Q, unrestBonus_Q, stabilityCostPerDay_Q }` — discrete enacted policies.
  - Five preset laws: `LAW_CONSCRIPTION` (+mobilisation, stability cost), `LAW_TAX_REFORM` (+tax), `LAW_SCHOLAR_PATRONAGE` (+5 research), `LAW_RULE_OF_LAW` (+tax +unrest mitigation), `LAW_MARTIAL_LAW` (+unrest mitigation, heavy stability drain).
  - `GovernanceState { polityId, governanceType, activeLawIds, changeCooldown }`.
  - `computeGovernanceModifiers(state, lawRegistry?)` — stacks law bonuses on governance baseline; clamps all outputs.
  - `enactLaw(state, lawId)` / `repealLaw(state, lawId)` — add/remove laws; enforces `MAX_ACTIVE_LAWS = 5`.
  - `changeGovernance(polity, state, newType)` — hits `polity.stabilityQ` by q(0.20); sets 365-day cooldown; no-op on same type or during cooldown.
  - `stepGovernanceCooldown(state, elapsedDays)` — ticks down cooldown.
  - `stepGovernanceStability(polity, state, elapsedDays, lawRegistry?)` — applies net `stabilityIncrement_Q` per day to `polity.stabilityQ`; no-op when law costs cancel the baseline.
  - Added `./governance` subpath export to `package.json`.
  - 48 new tests; 4,932 total. 100% statement/branch/function/line coverage. All thresholds met.

---

## [0.1.38] — 2026-03-26

### Added

- **Phase 93 · Military Campaigns & War Resolution** (`src/military-campaign.ts`)
  - `CampaignState { campaignId, attackerPolityId, defenderPolityId, phase, startTick, daysElapsed, marchProgress_Q, attackerArmySize, attackerStrength_Q, defenderStrength_Q, outcome? }` — mutable live state stored externally per conflict.
  - `CampaignPhase`: `"mobilization" | "march" | "battle" | "resolved"`.
  - `BattleOutcome`: `"attacker_victory" | "defender_holds" | "stalemate"`.
  - `computeArmySize(polity, mobilizationFrac_Q?)` — default q(0.05); clamped to `MAX_MOBILIZATION_Q = q(0.15)`.
  - `computeBattleStrength(polity, armySize)` → Q: `militaryStrength_Q × armySize / REFERENCE_ARMY_SIZE × TECH_SOLDIER_MUL[techEra] × stabilityMul`; clamped to SCALE.Q.
  - `mobilizeCampaign(campaign, attacker, mobilizationFrac_Q?)` — drains `MOBILIZATION_COST_PER_SOLDIER = 5` cu per soldier (capped at treasury); transitions to `"march"`.
  - `prepareDefender(campaign, defender, wallBonus_Q?)` — sets defender strength; Phase-89 wall bonus increases effective defence.
  - `stepCampaignMarch(campaign, attacker, elapsedDays, roadBonus_Q?)` — advances march at `BASE_MARCH_RATE_Q = q(0.05)` + road bonus; drains `CAMPAIGN_UPKEEP_PER_SOLDIER = 1` cu/soldier/day; triggers battle when progress reaches SCALE.Q.
  - `resolveBattle(campaign, attacker, defender, worldSeed, tick)` → `BattleResult` — `eventSeed`-deterministic; outcome weighted by strength ratio; `VICTORY_TRIBUTE_Q = q(0.20)` of defender treasury on victory; reduces both sides' strength by casualty rates.
  - `applyBattleConsequences(result, attacker, defender)` — applies morale/stability deltas; winner gains `VICTORY_MORALE_BONUS_Q = q(0.10)`; loser loses `DEFEAT_MORALE_HIT_Q = q(0.20)` + `DEFEAT_STABILITY_HIT_Q = q(0.15)`; both pay `COMBAT_STABILITY_DRAIN_Q = q(0.05)`.
  - `computeWarUnrestPressure(campaign)` → Q: `WAR_UNREST_PRESSURE_Q = q(0.15)` during active campaign; 0 when resolved — feeds Phase-90 `computeUnrestLevel`.
  - `computeDailyUpkeep(campaign)` → cu/day.
  - Added `./military-campaign` subpath export to `package.json`.
  - 56 new tests; 4,884 total. Coverage maintained above all thresholds.

---

## [0.1.37] — 2026-03-26

### Added

- **Phase 92 · Taxation & Treasury Revenue** (`src/taxation.ts`)
  - `TaxPolicy { polityId, taxRate_Q, exemptFraction_Q? }` — per-polity config stored externally by the host.
  - `TAX_REVENUE_PER_CAPITA_ANNUAL: Record<number, number>` — numeric TechEra keys; Prehistoric 0 → DeepSpace 20 k cu/person/year.
  - `computeAnnualTaxRevenue(polity, policy)` → cu/year: `taxablePop × perCapita × taxRate × stabilityMul / SCALE.Q`; `stabilityMul ∈ [q(0.50), q(1.00)]` models collection efficiency; zero at Prehistoric era.
  - `computeDailyTaxRevenue(polity, policy)` → cu/day: annual ÷ 365 with rounding.
  - `computeTaxUnrestPressure(policy)` → Q [0, `MAX_TAX_UNREST_Q = q(0.30)`]: zero at/below `OPTIMAL_TAX_RATE_Q = q(0.15)`; linear ramp to max at `MAX_TAX_RATE_Q = q(0.50)`; passes directly into Phase-90 `computeUnrestLevel` as an additional factor.
  - `stepTaxCollection(polity, policy, elapsedDays)` → `TaxCollectionResult`: adds `round(annual × days / 365)` to `polity.treasury_cu`; returns revenue and unrest pressure.
  - `estimateDaysToTreasuryTarget(polity, policy, targetAmount)` → ceiling days; Infinity at zero daily rate.
  - `computeRequiredTaxRate(polity, desiredAnnual)` → Q: reverse-solves for the rate needed to meet a target; clamped to MAX_TAX_RATE_Q.
  - Added `./taxation` subpath export to `package.json`.
  - 49 new tests; 4,828 total. Coverage maintained above all thresholds.

---

## [0.1.36] — 2026-03-26

### Added

- **Phase 91 · Technology Research** (`src/research.ts`)
  - `ResearchState { polityId, progress }` — per-polity accumulator stored externally by the host.
  - `RESEARCH_POINTS_REQUIRED: Record<number, number>` — numeric TechEra keys; Prehistoric 2 k → FarFuture 5 M; DeepSpace absent (no advancement).
  - `computeDailyResearchPoints(polity, bonusPoints?)` → integer points/day: `baseUnits = max(1, floor(pop / RESEARCH_POP_DIVISOR=5000))`; `stabilityFactor ∈ [5000, 10000]`; `max(1, round(baseUnits × stabilityFactor / SCALE.Q)) + bonusPoints`.
  - `stepResearch(polity, state, elapsedDays, bonusPoints?)` → `ResearchStepResult`: accumulates `daily × elapsedDays`; on threshold: increments `polity.techEra`, calls `deriveMilitaryStrength`, carries surplus; no-op at DeepSpace.
  - `investInResearch(polity, state, amount)` — drains treasury at `RESEARCH_COST_PER_POINT = 10` cu/point; capped at available treasury; returns points added.
  - `computeKnowledgeDiffusion(sourcePolity, targetPolity, contactIntensity_Q)` → bonus points/day: fires when `source.techEra > target.techEra`; `sourceDaily × eraDiff × KNOWLEDGE_DIFFUSION_RATE_Q(q(0.10)) × contactIntensity / SCALE.Q²`.
  - `computeResearchProgress_Q(polity, state)` → Q [0, SCALE.Q]: fraction toward next era; SCALE.Q at DeepSpace.
  - `estimateDaysToNextEra(polity, state, bonusPoints?)` → ceiling days; Infinity at DeepSpace or zero rate.
  - Added `./research` subpath export to `package.json`.
  - 57 new tests; 4,779 total. Coverage maintained above all thresholds.

---

## [0.1.35] — 2026-03-26

### Added

- **Phase 90 · Civil Unrest & Rebellion** (`src/unrest.ts`)
  - `UnrestFactors { faminePressure_Q?, epidemicPressure_Q?, heresyRisk_Q?, weakestBond_Q? }` — optional pressure inputs from Phases 85/87/88/79.
  - `computeUnrestLevel(polity, factors?)` → Q: weighted composite of morale deficit (×q(0.30)), stability deficit (×q(0.25)), famine (×q(0.20)), epidemic (×q(0.10)), heresy (×q(0.10)), feudal bond deficit (×q(0.05)).
  - `UNREST_ACTION_THRESHOLD_Q = q(0.30)` — excess above this drains morale/stability.
  - `REBELLION_THRESHOLD_Q = q(0.65)` — above this `rebellionRisk` flag is set.
  - `stepUnrest(polity, unrestLevel_Q, elapsedDays)` → `UnrestStepResult`: drains morale at `excess × UNREST_MORALE_DRAIN_Q = q(0.005)` per day, stability at `q(0.003)` per day; mutates polity in place; floor at 0.
  - `resolveRebellion(polity, worldSeed, tick)` → `RebellionResult`: deterministic via `eventSeed`; outcomes `"quelled" | "uprising" | "civil_war"` weighted by polity `militaryStrength_Q` vs. unrest roll; each outcome applies morale/stability penalties and treasury raid (`REBELLION_TREASURY_RAID_Q = q(0.15)`; civil war = 2×).
  - Added `./unrest` subpath export to `package.json`.
  - 35 new tests; 4,722 total. Coverage maintained above all thresholds.

---

## [0.1.34] — 2026-03-26

### Added

- **Phase 89 · Infrastructure & Development** (`src/infrastructure.ts`)
  - `InfraType`: `"road" | "wall" | "granary" | "marketplace" | "apothecary"`.
  - `InfraProject { projectId, polityId, type, targetLevel, investedCost, totalCost, completedTick? }` — in-progress construction.
  - `InfraStructure { structureId, polityId, type, level, builtTick }` — completed building; level [1, `MAX_INFRA_LEVEL = 5`].
  - `INFRA_BASE_COST` — treasury cost per level per type (wall 20 k → granary 8 k per level).
  - `INFRA_BONUS_PER_LEVEL_Q` — Q bonus per level (road q(0.05), wall q(0.08), granary q(0.10), marketplace q(0.02), apothecary q(0.06)).
  - `createInfraProject`, `createInfraStructure` — factories; level clamped to [1, 5].
  - `investInProject(polity, project, amount, tick)` — drains `polity.treasury_cu`, advances `investedCost`, stamps `completedTick` when fully funded; no-ops if complete or treasury insufficient.
  - `isProjectComplete`, `completeProject` → `InfraStructure | undefined`.
  - `computeInfraBonus(structures, type)` → Q: sums `BONUS_PER_LEVEL × level` across all matching structures; clamped to SCALE.Q.
  - **Typed bonus helpers**: `computeRoadTradeBonus` (Phase-83 efficiency boost), `computeWallSiegeBonus` (Phase-84 attacker strength reduction), `computeGranaryCapacityBonus` (Phase-87 capacity multiplier), `computeApothecaryHealthBonus` (Phase-88 health capacity), `computeMarketplaceIncome` (daily treasury income = `floor(treasury × bonus / SCALE.Q)`).
  - Max-level wall: −q(0.40) siege strength; max-level granary: +q(0.50) capacity.
  - Added `./infrastructure` subpath export to `package.json`.
  - 36 new tests; 4,687 total. Coverage maintained above all thresholds.

---

## [0.1.33] — 2026-03-26

### Added

- **Phase 88 · Epidemic Spread at Polity Scale** (`src/epidemic.ts`)
  - `PolityEpidemicState { polityId, diseaseId, prevalence_Q }` — infected fraction of polity population [0, SCALE.Q]. Reuses Phase-56 `DiseaseProfile` for disease properties.
  - `createEpidemicState(polityId, diseaseId, initialPrevalence_Q?)` — factory; default prevalence `q(0.01)`.
  - `deriveHealthCapacity(polity)` → Q: tech-era health infrastructure (`HEALTH_CAPACITY_BY_ERA`: Stone q(0.05) → Modern q(0.99)).
  - `computeEpidemicDeathPressure(state, profile)` → Q: annual death rate = `prevalence × mortalityRate / SCALE.Q`; feeds Phase-86 `deathPressure_Q` parameter.
  - `stepEpidemic(state, profile, elapsedDays, healthCapacity_Q?)` — **discrete logistic model**: growth proportional to `prevalence × (SCALE.Q − prevalence) × GROWTH_RATE × transmissionRate`; recovery proportional to `prevalence × (RECOVERY_RATE + healthBonus)`; higher `healthCapacity_Q` accelerates recovery.
  - `computeSpreadToPolity(sourceState, profile, contactIntensity_Q)` → Q: prevalence exported to a target polity; zero when source is contained.
  - `spreadEpidemic(source, profile, targetPolityId, contactIntensity_Q, existingState?)` — creates or updates target epidemic state; returns `undefined` below `EPIDEMIC_CONTAINED_Q`.
  - `computeEpidemicMigrationPush(state, profile)` → Q [0, `EPIDEMIC_MIGRATION_PUSH_MAX_Q = q(0.20)`]: flight pressure proportional to prevalence × severity; zero when `symptomSeverity_Q < EPIDEMIC_SEVERITY_THRESHOLD_Q = q(0.30)`. Integrates with Phase-81 push pressure.
  - `EPIDEMIC_CONTAINED_Q = q(0.01)`, `EPIDEMIC_BASE_GROWTH_RATE_Q = q(0.05)`, `EPIDEMIC_BASE_RECOVERY_RATE_Q = q(0.02)`, `EPIDEMIC_HEALTH_RECOVERY_BONUS_Q = q(0.04)`.
  - Added `./epidemic` subpath export to `package.json`.
  - 43 new tests; 4,651 total. Coverage maintained above all thresholds.

---

## [0.1.32] — 2026-03-26

### Added

- **Phase 87 · Granary & Food Supply** (`src/granary.ts`)
  - `GranaryState { polityId, grain_su }` — grain reserves in supply units (1 su = food for 1 person for 1 day); capacity derived dynamically from `polity.population × GRANARY_CAPACITY_DAYS = 730`.
  - `createGranary(polity)` — initialises with one year of consumption.
  - `computeCapacity(polity)` → integer; `computeFoodSupply_Q(polity, granary)` → Q [0, SCALE.Q] — feeds directly into Phase-86 `stepPolityPopulation(foodSupply_Q)`.
  - **Harvest yield**: `HARVEST_BASE_SU_PER_CAPITA = 250` su/person/harvest; `HARVEST_YIELD_BASE_Q = q(0.70)` floor; `HARVEST_STABILITY_BONUS_Q = q(0.30)` max bonus from stability. `deriveHarvestYieldFactor(polity, season_Q?)` integrates Phase-78 seasonal multiplier.
  - `computeHarvestYield(polity, yieldFactor_Q?)` → su; `triggerHarvest(polity, granary, yieldFactor_Q?)` → added su (clamped to capacity).
  - `stepGranaryConsumption(polity, granary, elapsedDays)` → consumed su; drains `population × elapsedDays` su per step; floors at 0.
  - `tradeFoodSupply(fromGranary, toGranary, toPolity, amount_su)` → transferred su; limited by source grain, destination capacity. Integrates with Phase-83 trade routes.
  - `raidGranary(granary, raidFraction_Q?)` → plundered su; defaults to `RAID_FRACTION_Q = q(0.40)`. Integrates with Phase-84 siege attacker victory.
  - Added `./granary` subpath export to `package.json`.
  - 47 new tests; 4,608 total. Coverage maintained above all thresholds.

---

## [0.1.31] — 2026-03-26

### Added

- **Phase 86 · Population Dynamics & Demographics** (`src/demography.ts`)
  - Annual Q rates for birth and death (fraction of population per year) to preserve fixed-point precision.
  - `BASELINE_BIRTH_RATE_ANNUAL_Q = q(0.035)` (≈ 3.5%/year); `BASELINE_DEATH_RATE_ANNUAL_Q = q(0.030)` (≈ 3.0%/year).
  - `computeBirthRate(polity)` → Q: morale linearly scales rate between 50% and 150% of baseline.
  - `computeDeathRate(polity, deathPressure_Q?, foodSupply_Q?)` → Q: baseline reduced by tech era (`TECH_ERA_DEATH_MUL`), plus instability bonus (up to `INSTABILITY_DEATH_ANNUAL_Q = q(0.015)`), optional external pressure, and famine bonus (`FAMINE_DEATH_ANNUAL_Q = q(0.030)`).
  - `computeNetGrowthRate(polity, ...)` → signed number (may be negative).
  - `stepPolityPopulation(polity, elapsedDays, deathPressure_Q?, foodSupply_Q?)` → `DemographicsStepResult`: mutates `polity.population`; formula `round(population × netAnnualRate_Q × days / (365 × SCALE.Q))`; clamps to ≥ 0.
  - **Famine**: `FAMINE_THRESHOLD_Q = q(0.20)` — food below this activates extra mortality and migration push.
  - `computeFamineMigrationPush(foodSupply_Q)` → Q [0, `FAMINE_MIGRATION_PUSH_Q = q(0.30)`]: linear from zero (at threshold) to peak (at food = 0); integrates with Phase-81 push pressure.
  - `computeCarryingCapacity(polity)` — soft cap by tech era (Stone 50 k → Modern 200 M); `isOverCapacity(polity)`.
  - `estimateAnnualBirths` / `estimateAnnualDeaths` — reporting utilities.
  - Phase-56 (disease) and Phase-84 (siege) integrate via `deathPressure_Q`; Phase-81 (migration) integrates via `computeFamineMigrationPush`; Phase-78 (calendar) via caller-supplied seasonal multipliers.
  - Added `./demography` subpath export to `package.json`.
  - 51 new tests; 4,561 total. Coverage maintained above all thresholds.

---

## [0.1.30] — 2026-03-26

### Added

- **Phase 85 · Religion & Faith Systems** (`src/faith.ts`)
  - `Faith { faithId, name, fervor_Q, tolerance_Q, exclusive }` — faith definition; exclusive faiths (monotheistic) compete; syncretic faiths stack additively.
  - `PolityFaith { polityId, faithId, adherents_Q }` — fraction of polity population following a faith [0, SCALE.Q].
  - `FaithRegistry { faiths: Map<FaithId, Faith>, polityFaiths: Map<string, PolityFaith[]> }` — central registry; pure data layer with no Entity fields or kernel changes.
  - Built-in sample faiths: `SOLAR_CHURCH` (exclusive, fervor q(0.80), tolerance q(0.20)), `EARTH_SPIRITS` (syncretic, tolerance q(0.90)), `MERCHANT_CULT` (syncretic, moderate).
  - `registerFaith` / `getFaith` — faith definition management.
  - `setPolityFaith` / `getPolityFaiths` — per-polity adherent records; creates or updates records; clamps to [0, SCALE.Q].
  - `getDominantFaith(registry, polityId)` → highest-adherent `PolityFaith | undefined`.
  - `sharesDominantFaith(registry, polityAId, polityBId)` → boolean.
  - `computeConversionPressure(faith, missionaryPresence_Q)` → Q: `fervor_Q × missionaryPresence_Q × CONVERSION_BASE_RATE_Q / SCALE.Q²`; `CONVERSION_BASE_RATE_Q = q(0.002)`.
  - `stepFaithConversion(registry, polityId, faithId, delta_Q)` — exclusive faith gains displace other exclusive faiths proportionally; syncretic faiths unaffected.
  - `computeHeresyRisk(registry, polityId)` → Q: fires when dominant exclusive faith has low tolerance and a minority exclusive faith exceeds `HERESY_THRESHOLD_Q = q(0.15)`; integrates with Phase-82 espionage religious unrest.
  - `computeFaithDiplomaticModifier(registry, polityAId, polityBId)` → signed number: `+FAITH_DIPLOMATIC_BONUS_Q = q(0.10)` for shared dominant faith; `−FAITH_DIPLOMATIC_PENALTY_Q = q(0.10)` for exclusive vs exclusive conflict; 0 for syncretic or no dominant faith. Integrates with Phase-80 treaty strength.
  - Added `./faith` subpath export to `package.json`.
  - 45 new tests; 4,510 total. Coverage: statements 96.96%, branches 87.53%, functions 95.2%, lines 96.96% — all thresholds maintained.

---

## [0.1.29] — 2026-03-26

### Added

- **Phase 84 · Siege Warfare** (`src/siege.ts`)
  - `SiegePhase`: `"investment" | "active" | "resolved"`.
  - `SiegeOutcome`: `"attacker_victory" | "defender_holds" | "surrender"`.
  - `SiegeState { siegeId, attackerPolityId, defenderPolityId, phase, startTick, phaseDay, wallIntegrity_Q, supplyLevel_Q, defenderMorale_Q, siegeStrength_Q, outcome? }`.
  - `SiegeAttrition { attackerLoss_Q, defenderLoss_Q }` — daily fractional losses per phase.
  - `createSiege(attackerPolity, defenderPolity, tick?)` — seeds from `militaryStrength_Q` and `stabilityQ`.
  - **Investment phase** (`INVESTMENT_DAYS = 14`): encirclement; no bombardment or starvation yet.
  - **Active phase**: wall decay = `siegeStrength_Q × WALL_DECAY_BASE_Q / SCALE.Q` per day; supply drains at `SUPPLY_DRAIN_PER_DAY_Q = q(0.004)`; morale tracks combined wall/supply weakness.
  - **Assault**: fires when `wallIntegrity_Q < ASSAULT_WALL_THRESHOLD_Q = q(0.30)`; resolved by `eventSeed` roll weighted by siege strength and defender morale deficit.
  - **Surrender**: fires when `supplyLevel_Q ≤ SURRENDER_SUPPLY_THRESHOLD_Q = q(0.05)` and daily probabilistic roll succeeds based on morale deficit.
  - `stepSiege(siege, worldSeed, tick, supplyPressureBonus_Q?, siegeStrengthMul_Q?)` — Phase-83 (severed trade) and Phase-78 (winter penalty) integration via optional parameters.
  - `computeSiegeAttrition(siege)` → `SiegeAttrition` — daily losses by phase.
  - `runSiegeToResolution(siege, worldSeed, startTick, maxDays?)` — convenience runner.
  - All outcomes deterministic and idempotent via `eventSeed`.
  - Added `./siege` subpath export to `package.json`.
  - 38 new tests; 4,465 total. Coverage maintained above all thresholds.

---

## [0.1.28] — 2026-03-26

### Added

- **Phase 83 · Trade Routes & Inter-Polity Commerce** (`src/trade-routes.ts`)
  - `TradeRoute { routeId, polityAId, polityBId, baseVolume_cu, efficiency_Q, establishedTick }` — bilateral route; both polities earn income.
  - `TradeRegistry { routes: Map<string, TradeRoute> }` — canonical sorted-pair key; symmetric lookup.
  - `ROUTE_VIABLE_THRESHOLD = q(0.10)` — below this `isRouteViable` returns false.
  - `ROUTE_DECAY_PER_DAY = q(0.001)` — slow natural decay without maintenance.
  - `TREATY_TRADE_BONUS_Q = q(0.20)` — Phase-80 trade pact adds 20% income multiplier.
  - `computeDailyTradeIncome(route, hasTradePact?, seasonalMul_Q?)` → `TradeIncome { incomeA_cu, incomeB_cu }` — zero for non-viable routes.
  - `applyDailyTrade(polityA, polityB, route, ...)` — mutates both treasuries.
  - `stepRouteEfficiency(route, boostDelta_Q?)` — daily decay with optional maintenance boost.
  - `reinforceRoute(route, deltaQ)` / `disruptRoute(route, disruption_Q)` — clamped efficiency adjustments; `disruptRoute` integrates with Phase-82 espionage results.
  - `abandonRoute(registry, A, B)` — removes route, returns boolean.
  - `computeAnnualTradeVolume(registry, polityId)` → integer — sum of viable route volumes at current efficiency.
  - Added `./trade-routes` subpath export to `package.json`.
  - 50 new tests; 4,427 total. Coverage maintained above all thresholds.

---

## [0.1.27] — 2026-03-26

### Added

- **Phase 82 · Espionage & Intelligence Networks** (`src/espionage.ts`)
  - `OperationType`: `"intelligence_gather" | "treaty_sabotage" | "bond_subversion" | "treasury_theft" | "incite_migration"`.
  - `AgentStatus`: `"active" | "compromised" | "captured"`.
  - `SpyAgent { agentId, ownerPolityId, targetPolityId, operation, status, deployedTick, skill_Q }`.
  - `EspionageRegistry { agents: Map<number, SpyAgent> }` — keyed by entity ID.
  - `OperationResult { success, detected, effectDelta_Q }`.
  - `OPERATION_BASE_SUCCESS_Q`: intelligence_gather q(0.70) → treasury_theft q(0.35).
  - `OPERATION_DETECTION_RISK_Q`: treasury_theft q(0.40) → intelligence_gather q(0.10).
  - `OPERATION_EFFECT_Q`: incite_migration q(0.15) → intelligence_gather q(0.00).
  - `COVER_DECAY_PER_DAY = q(0.005)` — daily base cover-loss risk, mitigated by skill.
  - `resolveOperation(agent, worldSeed, tick)` → `OperationResult` — deterministic via `eventSeed`; idempotent for same inputs; no-op for non-active agents.
  - `stepAgentCover(agent, worldSeed, tick)` — daily cover check; may flip status to `"compromised"` or `"captured"` (50/50 split via secondary seed).
  - `deployAgent`, `recallAgent`, `getAgentsByOwner`, `getAgentsByTarget`.
  - `computeCounterIntelligence(registry, targetPolityId)` → Q — `compromised` agent count × `COUNTER_INTEL_PER_AGENT = q(0.05)`, clamped to SCALE.Q.
  - Added `./espionage` subpath export to `package.json`.
  - 34 new tests; 4,377 total. Coverage maintained above all thresholds.

---

## [0.1.26] — 2026-03-26

### Added

- **Phase 81 · Migration & Displacement** (`src/migration.ts`)
  - `MigrationFlow { fromPolityId, toPolityId, population }` — a resolved daily population transfer.
  - `MigrationContext { polityId, isAtWar?, lowestBondStr_Q? }` — optional per-polity war/feudal context passed by the host.
  - `computePushPressure(polity, isAtWar?, lowestBondStr_Q?)` → Q — stability deficit + morale deficit + war bonus (`MIGRATION_WAR_PUSH_Q = q(0.20)`) + feudal-bond deficit below `MIGRATION_PUSH_FEUDAL_THRESHOLD = q(0.30)`.
  - `computePullFactor(polity)` → Q — `stabilityQ × moraleQ / SCALE.Q`; both must be high to attract migrants.
  - `computeMigrationFlow(from, to, push_Q, pull_Q)` → integer — 0 if push < `MIGRATION_PUSH_MIN_Q = q(0.05)` or pull = 0; floors to integer; max daily rate `MIGRATION_DAILY_RATE_Q = q(0.001)` (0.1% of population at full pressure).
  - `resolveMigration(polities[], context?)` → `MigrationFlow[]` — collects all directed pair flows above threshold.
  - `applyMigrationFlows(polityRegistry, flows)` — mutates `population` on sending and receiving polities; clamps to prevent negative populations.
  - `estimateNetMigrationRate(polityId, flows, population)` → signed fraction — positive = net immigration, negative = net emigration.
  - Integrates with Phase 61 (Polity), Phase 79 (Feudal bond strength), Phase 80 (Diplomacy) without direct imports — callers supply context.
  - Added `./migration` subpath export to `package.json`.
  - 41 new tests; 4,343 total. Coverage maintained above all thresholds.

---

## [0.1.25] — 2026-03-26

### Added

- **Phase 80 · Diplomacy & Treaties** (`src/diplomacy.ts`)
  - `TreatyType`: `"non_aggression" | "trade_pact" | "peace" | "military_alliance" | "royal_marriage"`.
  - `Treaty { treatyId, polityAId, polityBId, type, strength_Q, signedTick, expiryTick, tributeFromA_Q, tributeFromB_Q }` — bilateral agreement with optional tribute clause and finite or permanent duration.
  - `TreatyRegistry { treaties: Map<string, Treaty> }` — keyed by canonical sorted pair + type; order-independent.
  - `TREATY_BASE_STRENGTH`: military_alliance q(0.80) → trade_pact q(0.50).
  - `TREATY_DECAY_PER_DAY`: military_alliance q(0.001)/day → non_aggression q(0.003)/day.
  - `TREATY_BREAK_INFAMY`: military_alliance q(0.25) → trade_pact q(0.05) — Phase 75 integration.
  - `TREATY_FRAGILE_THRESHOLD = q(0.20)` — `isTreatyFragile(treaty)` returns true below this.
  - `signTreaty(registry, polityAId, polityBId, type, tick?, duration?, tributeFromA?, tributeFromB?)` — creates or replaces a treaty.
  - `getTreaty(registry, polityAId, polityBId, type)` — symmetric lookup.
  - `getActiveTreaties(registry, polityId)` — all treaties for a given polity.
  - `isTreatyExpired(treaty, currentTick)` — true at/after `expiryTick`; permanent (`-1`) never expires.
  - `stepTreatyStrength(treaty, boostDelta_Q?)` — daily decay with optional event boost.
  - `reinforceTreaty(treaty, deltaQ)` — clamped reinforcement.
  - `breakTreaty(registry, polityAId, polityBId, type, breakerRulerId?, renownRegistry?)` — removes treaty; adds `TREATY_BREAK_INFAMY[type]` infamy to breaker.
  - `computeDiplomaticPrestige(registry, polityId)` → Q — sum of active treaty strengths, clamped to SCALE.Q.
  - `areInAnyTreaty(registry, polityAId, polityBId)` → boolean.
  - Added `./diplomacy` subpath export to `package.json`.
  - 55 new tests; 4,302 total. Coverage maintained above all thresholds.

---

## [0.1.24] — 2026-03-26

### Added

- **Phase 79 · Feudal Bonds & Vassal Tribute** (`src/feudal.ts`)
  - `LoyaltyType`: `"kin_bound" | "oath_sworn" | "conquered" | "voluntary"` — governs base strength and daily decay rate.
  - `VassalBond { vassalPolityId, liegePolityId, loyaltyType, tributeRate_Q, levyRate_Q, strength_Q, establishedTick }` — directed lord-vassal record.
  - `FeudalRegistry { bonds: Map<string, VassalBond> }` keyed by `"vassalId:liegeId"`.
  - `LOYALTY_BASE_STRENGTH`: kin_bound q(0.90) → oath_sworn q(0.70) → voluntary q(0.65) → conquered q(0.40).
  - `LOYALTY_DECAY_PER_DAY`: kin_bound q(0.001)/day → conquered q(0.005)/day.
  - `REBELLION_THRESHOLD = q(0.25)` — `isRebellionRisk(bond)` returns true below this.
  - `computeDailyTribute` / `applyDailyTribute` — floor-based tribute scaled by `tributeRate_Q / SCALE.Q / 365`.
  - `computeLevyStrength(vassal, bond)` — effective levy reduced proportionally by bond weakness (`strength_Q`).
  - `stepBondStrength(bond, boostDelta_Q?)` — daily decay with optional event boost.
  - `reinforceBond(bond, deltaQ)` — clamped-to-SCALE.Q reinforcement for kinship events and tribute.
  - `breakVassalBond(registry, vassalId, liegeId, vassalRulerId?, renownRegistry?)` — removes bond; adds `OATH_BREAK_INFAMY_Q = q(0.15)` infamy to the vassal ruler for `oath_sworn` breaks (Phase 75 integration).
  - Added `./feudal` subpath export to `package.json`.
  - 58 new tests; 4,247 total. Coverage maintained above all thresholds.

---

## [0.1.23] — 2026-03-26

### Added

- **Phase 78 · Seasonal Calendar & Agricultural Cycle** (`src/calendar.ts`)
  - `CalendarState { year, dayOfYear }` — immutable; advanced via `stepCalendar(state, days)`.
  - `computeSeason(dayOfYear)` → `"winter" | "spring" | "summer" | "autumn"` (91-day quarters).
  - `computeHarvestPhase(dayOfYear)` → `"dormant" | "planting" | "growing" | "harvest"`.
  - `isInHarvestWindow(dayOfYear)` — true for days 274–365 (Autumn).
  - `SeasonalModifiers { thermalOffset, precipitationMul_Q, diseaseMul_Q, mobilityMul_Q, harvestYield_Q }`.
  - `SEASONAL_MODIFIERS` table: winter (−10 °C, zero harvest, x1.20 disease, x0.70 mobility), spring (rain, x1.30 precip, planting), summer (+5 °C, optimal mobility), autumn (peak harvest q(1.0), x1.10 disease).
  - `applySeasonalHarvest(polity, modifiers, baseDailyIncome)` → cost-unit gain for the day.
  - `deriveSeasonalWeatherBias(season, intensity?)` → `Partial<WeatherState>` — advisory weather for Phase-18 hosts.
  - `applySeasonalDiseaseMul(baseRate_Q, modifiers)` → scaled transmission rate for Phase-56/73 integration.
  - Added `./calendar` subpath export to `package.json`.
  - 47 new tests; 4,189 total. Coverage maintained above all thresholds.

---

## [0.1.22] — 2026-03-26

### Added

- **Phase 77 · Dynasty & Succession** (`src/succession.ts`)
  - `SuccessionRuleType`: `"primogeniture" | "renown_based" | "election"`.
  - `SuccessionCandidate { entityId, kinshipDegree, renown_Q, inheritedRenown_Q, claimStrength_Q }`.
  - `SuccessionResult { heirId, candidates, rule, stabilityImpact_Q }` — signed Q stability delta.
  - `findSuccessionCandidates(lineage, deceasedId, renownRegistry, maxDegree?)` — BFS over family graph (Phase 76), computes `renown_Q` and `inheritedRenown_Q` per candidate.
  - `resolveSuccession(lineage, deceasedId, renownRegistry, rule, worldSeed, tick)` → `SuccessionResult`:
    - **primogeniture**: first-born child (lowest entityId) gets SCALE.Q claim; others by distance.
    - **renown_based**: claim = 70% own renown + 30% inherited renown.
    - **election**: renown-weighted deterministic lottery via `eventSeed`.
    - Stability: `+STABILITY_CLEAN_SUCCESSION_Q` for uncontested direct heir; `−STABILITY_DISTANT_HEIR_Q` per extra degree; `−STABILITY_CONTESTED_Q` when top-two gap < q(0.10); `−STABILITY_NO_HEIR_Q` if no candidates.
  - `applySuccessionToPolity(polity, result)` — applies `stabilityImpact_Q` to `polity.stabilityQ` (clamped).
  - Added `./succession` subpath export to `package.json`.
  - 21 new tests; 4,142 total. Coverage maintained above all thresholds.

---

## [0.1.21] — 2026-03-26

### Added

- **Phase 76 · Kinship & Lineage** (`src/kinship.ts`)
  - `LineageNode { entityId, parentIds, childIds, partnerIds }` — family links per entity.
  - `LineageRegistry { nodes: Map<number, LineageNode> }` — flat registry, no Entity field changes.
  - `createLineageRegistry()` / `getLineageNode(registry, entityId)` — factory and lazy-init accessor.
  - `recordBirth(registry, childId, parentAId, parentBId?)` — links child to 1–2 parents; idempotent.
  - `recordPartnership(registry, entityAId, entityBId)` — mutual partner link; idempotent.
  - `getParents / getChildren / getSiblings` — direct family queries; siblings deduplicated.
  - `findAncestors(registry, entityId, maxDepth?)` — BFS upward through parent links (default depth 4).
  - `computeKinshipDegree(registry, entityA, entityB)` — BFS on undirected family graph (parents + children + partners); returns 0–4 or `null` beyond `MAX_KINSHIP_DEPTH = 4`.
  - `isKin(registry, entityA, entityB, maxDegree?)` — convenience boolean.
  - `getKinshipLabel(degree)` → `"self" | "immediate" | "close" | "extended" | "distant" | "unrelated"`.
  - `computeInheritedRenown(lineage, entityId, renownRegistry, maxDepth?)` — sums ancestor `renown_Q` with geometric decay (`RENOWN_DEPTH_DECAY_Q = q(0.50)` per generation); clamped to SCALE.Q.
  - Added `./kinship` subpath export to `package.json`.
  - 42 new tests; 4,121 total. Coverage maintained above all thresholds.

---

## [0.1.20] — 2026-03-26

### Added

- **Phase 75 · Entity Renown & Legend Registry** (`src/renown.ts`)
  - `RenownRecord { entityId, renown_Q, infamy_Q, entries: LegendEntry[] }` — per-entity reputation on two orthogonal axes.
  - `LegendEntry { entryId, tick, eventType, significance }` — lightweight reference to a significant `ChronicleEntry`.
  - `RenownRegistry { records: Map<number, RenownRecord> }` — flat registry, one record per entity.
  - `createRenownRegistry()` / `getRenownRecord(registry, entityId)` — factory and lazy-init accessor.
  - `updateRenownFromChronicle(registry, chronicle, entityId, minSignificance?)` — idempotent scan; renown events (legendary_deed, quest_completed, combat_victory, masterwork_crafted, rank_promotion, settlement_founded, first_contact) add to `renown_Q`; infamy events (relationship_betrayal, settlement_raided, settlement_destroyed, quest_failed) add to `infamy_Q`; both capped at SCALE.Q.
  - `getRenownLabel(renown_Q)` → `"unknown" | "noted" | "known" | "renowned" | "legendary" | "mythic"` (6 tiers at q(0.10) boundaries).
  - `getInfamyLabel(infamy_Q)` → `"innocent" | "suspect" | "notorious" | "infamous" | "reviled" | "condemned"`.
  - `deriveFactionStandingAdjustment(renown_Q, infamy_Q, allianceBias)` — signed Q adjustment; heroic factions (bias=1.0) reward renown and punish infamy; criminal factions (bias=0.0) the reverse; clamped to [-SCALE.Q, SCALE.Q].
  - `getTopLegendEntries(record, n)` — top N entries by significance (tick-descending tie-break).
  - `renderLegendWithTone(record, entryMap, ctx, maxEntries?)` — renders top entries as prose via Phase 74's `renderEntryWithTone`.
  - Added `./narrative-prose` and `./renown` subpath exports to `package.json`.
  - 42 new tests; 4,079 total. Coverage maintained above all thresholds.

---

## [0.1.19] — 2026-03-26

### Added

- **Phase 74 · Simulation Trace → Narrative Prose** (`src/narrative-prose.ts`)
  - 6 prose tones: `neutral | heroic | tragic | martial | spiritual | mercantile`
  - Tone-varied templates for all 19 `ChronicleEventType` values.
  - `deriveNarrativeTone(culture)` — maps dominant `CultureProfile` value → `ProseTone`
    via `VALUE_TONE_MAP` (martial_virtue→martial, spiritual_devotion→spiritual,
    commerce→mercantile, honour→heroic, fatalism→tragic; others fall back to neutral).
  - `mythArchetypeFrame(archetype)` — returns a culturally-flavoured closing phrase for
    each `MythArchetype` (hero, monster, trickster, great_plague, divine_wrath, golden_age).
  - `createNarrativeContext(entityNames, culture?, myth?)` — bundles tone + name map + myth frame.
  - `renderEntryWithTone(entry, ctx)` — picks the tone variant for each event, substitutes
    `{name}`, `{target}`, computed helper strings (`{cause_str}`, `{location_str}`, etc.),
    raw `entry.variables`, and appends the myth frame (replacing terminal period).
  - `renderChronicleWithTone(chronicle, ctx, minSignificance?)` — filters by significance,
    sorts chronologically, maps via `renderEntryWithTone`.
  - **Success criterion met:** martial, spiritual, and mercantile tones produce clearly
    distinguishable prose from the same chronicle events.
  - 39 new tests; 4,037 total. Coverage: statements 96.81%, branches 86.87%, functions 94.80%.

---

## [0.1.18] — 2026-03-26

### Added

- **CE-18 · External Agent Interface** (`tools/agent-server.ts`)
  - WebSocket server (default port 3001) implementing an agent observation/action loop
    over the existing `stepWorld` kernel — no src/ changes, no new npm exports.
  - **Protocol:**
    - Client → `{ type: "step", commands?: AgentCommand[] }` or `{ type: "reset" }`
    - Server → `{ type: "obs", tick, entities: ObservationSlice[], done, winner? }`
    - On connect → `{ type: "init", config, obs }`
  - **`ObservationSlice`** — safe subset: position, velocity, fatigue, shock/consciousness/dead,
    detected nearby enemies (filtered via Phase 52 `canDetect`). No raw internals exposed.
  - **`AgentCommand`** — validated high-level actions: `attack | move | dodge | flee | idle`.
    Invalid team targeting silently dropped; `decideCommandsForEntity` fills in missing commands.
  - Configurable scenario: `TEAM1_SIZE` / `TEAM2_SIZE` (1–4 each), `SEED`, `MAX_TICKS` via env vars.
    Default: 1v1, Knight (longsword + mail) vs Brawler (club).
  - Agent-driven stepping: server advances only when client sends `step` — agent controls tick rate.
  - Determinism preserved: external commands injected via existing `CommandMap` before `stepWorld`.
  - HTTP endpoints: `GET /config`, `GET /status`, `POST /reset`.
  - Run: `npm run agent-server`
  - **Success criterion met:** An external Python script using only `websockets` can drive a single
    entity through a 1v1 fight, receiving `ObservationSlice` observations each tick and submitting
    `attack` / `move` commands, without importing any Ananke TypeScript.

---

## [0.1.17] — 2026-03-26

### Added

- **Phase 73 · Enhanced Epidemiological Models** (`src/sim/disease.ts` extended in-place)
  - `VaccinationRecord { diseaseId, efficacy_Q, doseCount }` — partial-efficacy vaccination
    stored on `entity.vaccinations?`; `vaccinate(entity, diseaseId, efficacy_Q)` helper.
  - `ageSusceptibility_Q(ageYears)` — U-shaped multiplier: infants ×1.30, children ×0.80,
    adults ×1.00, early elderly ×1.20, late elderly ×1.50. Auto-applied in
    `computeTransmissionRisk` when `entity.age` is set.
  - `NPIType`, `NPIRecord`, `NPIRegistry` — non-pharmaceutical intervention registry;
    `applyNPI / removeNPI / hasNPI` helpers. `mask_mandate` reduces airborne transmission
    by `NPI_MASK_REDUCTION_Q = q(0.60)` (60 %). `quarantine` recorded for host-side pair
    filtering.
  - `computeTransmissionRisk` extended with optional 5th `options?` parameter — backward-
    compatible; applies vaccination, age susceptibility, and NPI effects when present.
  - `computeR0(profile, entityMap)` — basic reproductive number estimate
    (β × infectious-days × min(15, population−1)); used for validation.
  - `stepSEIR(entity, delta_s, profile, worldSeed, tick)` — SEIR-aware entity step that
    isolates a single disease profile; delegates to Phase 56 `stepDiseaseForEntity` for
    full backward compatibility.
  - `registerDiseaseProfile(profile)` — registers custom/SEIR profiles into the lookup map
    without modifying the canonical `DISEASE_PROFILES` array.
  - `MEASLES` profile (`useSeir: true`): R0 ≈ 15.1 in population ≥ 16, 14-day incubation,
    14-day infectious period, 0.2 % IFR, permanent immunity. Validates epidemic curve
    peaking days 10–20 and burning out by day 60 (matches standard SIR output ±15 %).
  - `entity.vaccinations?: VaccinationRecord[]` added to `Entity`.
  - `DiseaseProfile.useSeir?: boolean` opt-in field (no effect on existing callers).
  - 37 new tests in `test/disease-seir.test.ts`. All 37 Phase 56 tests pass unmodified.
  - **3 998 tests total.**

---

## [0.1.16] — 2026-03-25

### Added

- **CE-5 · Persistent World Server** — campaign ↔ combat battle bridge:
  - src/battle-bridge.ts: pure functions translating polity state to
    BattleConfig and BattleOutcome back to PolityImpact[]. Covers
    tech-era→loadout mapping, military-strength→team-size scaling,
    deterministic battle seed, morale/stability/population impact.
    27 tests in test/battle-bridge.test.ts.
  - tools/persistent-world.ts: integrated server running polity tick +
    synchronous tactical battles every 7 days per active war. Battle
    outcomes mutate polity morale, stability, and population. Full
    checkpoint/resume, WebSocket push, HTTP war/peace/save/reset/battles
    endpoints. Run with: npm run persistent-world

---

## [0.1.15] — 2026-03-25

### Added

- **CE-5 · WebAssembly Kernel** — shadow-mode WASM acceleration for push repulsion and
  injury accumulation:
  - `as/units.ts` — AssemblyScript port of `src/units.ts` (all 13 exports: SCALE constants,
    `q()`, `clampQ()`, `qMul()`, `qDiv()`, `mulDiv()`, `sqrtQ()`, `cbrtQ()`, unit
    converters).  Compiled to `dist/as/units.wasm`.
  - `as/push.ts` — pair-wise position repulsion kernel in flat WASM memory (64-entity
    capacity, octagonal distance approximation, overflow-safe i64 arithmetic).
    Compiled to `dist/as/push.wasm`.
  - `as/injury.ts` — per-entity injury accumulation inner loop (clotting, bleed→fluid,
    shock, consciousness, death check) matching `src/sim/step/injury.ts` constants exactly.
    Compiled to `dist/as/injury.wasm`.
  - `src/wasm-kernel.ts` — Node.js host bridge.  `WasmKernel.shadowStep(world, tick)`
    marshals entity state into WASM memory, runs both kernels, and returns a
    `WasmStepReport` with per-entity velocity deltas and projected vitals.  Shadow mode:
    outputs are never applied to world state — used for validation and diagnostics only.
  - `loadWasmKernel()` factory loads `push.wasm` + `injury.wasm` from `dist/as/` at
    runtime via `import.meta.url` + `readFileSync`.
  - Exported as `@its-not-rocket-science/ananke/wasm-kernel`.
  - `dist/as/` (compiled WASM binaries) included in the published package.
  - 61 WASM unit tests (`test/as/`) covering units, push repulsion, and injury
    accumulation parity with the TypeScript reference implementation.
  - Build scripts: `npm run build:wasm:all`, `npm run test:wasm`.

### Added

- **Phase 71 · Cultural Generation & Evolution Framework** (`src/culture.ts`)
  - Reverse WOAC method: derives culture bottom-up from five forces (`environment`,
    `power`, `exchange`, `legacy`, `belief`) scored from simulation state.
  - `generateCulture(polity, registry, myths, vassals?, biome?)` → `CultureProfile`
    with 10 possible `CulturalValue` types, `CulturalContradiction` pairs, and
    `CulturalCycle` practices (CYCLES audit).
  - `stepCultureYear(profile, techPressure_Q, militaryOutcome_Q, myths, worldSeed, tick)`
    → `CultureYearResult { profile, schism? }`: tech diffusion pulls exchange force
    upward; military outcomes shift power; new myths update legacy/belief; conservative
    cultures with high tension fire deterministic `SchismEvent` (reform_movement,
    heresy, or civil_unrest).
  - `describeCulture(profile)` → `{ summary, values, contradictions, cycles }`:
    human-readable output for writers and game designers.
  - Query helpers: `getCulturalValue`, `getDominantValues`, `getSignificantContradictions`.
  - Integrates with Phase 70 (vassal count → power force), Phase 66 (myths → legacy/belief),
    Phase 68 (BiomeContext → environment harshness), Phase 23 dialogue and Phase 24
    faction standing via exported profile queries.
  - 45 tests in `test/culture.test.ts`; exported via `ananke/campaign` subpath.

- **Phase 70 · Stratified Political Simulation ("Vassal Web" Layer)** (`src/polity-vassals.ts`)
  - `VassalNode` — intermediate layer between Entity and Polity with `territory_Q`,
    `military_Q`, `treasury_cu`, and a `VassalLoyalty` block.
  - Seven `LoyaltyType` variants with distinct `stepVassalLoyalty` dynamics:
    `ideological` (slow, conviction-driven), `transactional` (treasury comparison),
    `terrified` (instant collapse if liege appears weak), `honor_bound` (oath + grievance
    spike), `opportunistic` (tracks liege/rival morale ratio), `kin_bound` (stable family
    ties), `ideological_rival` (constant decay, cannot recover).
  - `applyGrievanceEvent` — immutable grievance accumulation (host applies broken-promise,
    tax-hike, kin-death events).
  - `computeVassalContribution` — loyalty-scaled troop and treasury output; zero below
    `CONTRIBUTION_FLOOR_Q` (q(0.20)), full above `CONTRIBUTION_FULL_Q` (q(0.50)).
  - `computeEffectiveMilitary` — sums contributions for command-chain filtering before
    passing force ratio to Phase 69 `resolveTacticalEngagement`.
  - `detectRebellionRisk` — Q score (70% low-loyalty + 30% high-grievance) for AI queries.
  - `resolveSuccessionCrisis` — deterministic heir-support rolls weighted by `military_Q`;
    winners gain +q(0.05) loyalty, losers −q(0.08); `SuccessionResult` with `supportQ`
    and per-vassal `loyaltyDeltas`.
  - 40 tests in `test/polity-vassals.test.ts`; exported via `ananke/campaign` subpath.

- **Option B · Tier 2 subpath exports** — eight new named import subpaths for all
  Tier 2 module groupings; deep imports remain supported as a fallback:
  - `ananke/character` → aging, sleep, disease, wound-aging, thermoregulation, nutrition,
    medical, toxicology, progression
  - `ananke/combat` → ranged, grapple, formation-combat, mount, hazard, morale, sensory,
    sensory-extended, weather, terrain, skills, biome
  - `ananke/campaign` → campaign, downtime, collective-activities, settlement,
    settlement-services, inventory, item-durability, world-generation, inheritance,
    economy, polity (campaign layer barrel)
  - `ananke/social` → dialogue, faction, relationships, relationships-effects, party,
    quest, quest-generators
  - `ananke/narrative` → chronicle, story-arcs, narrative-render, legend, mythology,
    narrative, narrative-stress, metrics, arena
  - `ananke/anatomy` → existing `src/anatomy/index.ts` barrel
  - `ananke/crafting` → existing `src/crafting/index.ts` barrel
  - `ananke/competence` → existing `src/competence/index.ts` barrel
  - `STABLE_API.md` updated to document preferred subpath import patterns.

- **CE-16 · Modding Support** (`src/modding.ts`)
  - Layer 1 — `hashMod(json)`: deterministic FNV-1a fingerprint (8-char hex) for any
    parsed JSON mod file; canonical key-sorted serialisation ensures order-independence.
  - Layer 2 — Post-tick behaviour hooks: `registerPostTickHook / unregisterPostTickHook /
    runPostTickHooks / listPostTickHooks / clearPostTickHooks`; hooks fire after
    `stepWorld`, are purely observational (logging, analytics, renderer updates).
  - Layer 3 — AI behaviour node registry: `registerBehaviorNode / unregisterBehaviorNode /
    getBehaviorNode / listBehaviorNodes / clearBehaviorNodes`; custom `BehaviorNode`
    factories registered by id for scenario and behaviour-tree composition.
  - Session fingerprint: `computeModManifest(catalogIds)` returns sorted id lists and a
    single fingerprint covering all three layers for multiplayer client validation.
  - `clearAllMods()` resets hooks and behaviour nodes (catalog unchanged).
  - 42 tests in `test/modding.test.ts`; exported via `src/index.ts`.

- **CE-14 · Socio-Economic Campaign Layer → Stable Promotion**
  - Promote `stepPolityDay`, `declareWar`, `makePeace`, `areAtWar`,
    `createPolity`, `createPolityRegistry`, `Polity`, `PolityRegistry`,
    `PolityPair` (`src/polity.ts`), `stepTechDiffusion`, `computeDiffusionPressure`,
    `totalInboundPressure`, `techEraName` (`src/tech-diffusion.ts`), and
    `applyEmotionalContagion`, `stepEmotionalWaves`, `computeEmotionalSpread`,
    `triggerMilitaryRout`, `triggerVictoryRally`, `netEmotionalPressure`,
    `EmotionalWave` (`src/emotional-contagion.ts`) from Tier 2 (Experimental)
    to Tier 1 (Stable) in `STABLE_API.md`.
  - Add `export *` re-exports to `src/polity.ts` so the `ananke/polity` subpath
    delivers the complete Socio-Economic Campaign Layer in one import.
  - Freeze `Polity`, `PolityRegistry`, `PolityPair` and `EmotionalWave` interfaces
    with `@stable CE-14` JSDoc annotations — no required-field additions without a
    minor bump, no renames without a major bump.

### Migration guide — v0.1.x → v0.2.0

This is a **non-breaking promotion**.  No existing code needs to change.

#### What is new

The Socio-Economic Campaign Layer (`polity`, `tech-diffusion`, `emotional-contagion`)
is now Tier 1 (Stable).  You can depend on it without fear of silent API churn.

#### Import change (optional)

Instead of importing from the package root:

```typescript
import { stepPolityDay }       from "@its-not-rocket-science/ananke";
import { stepTechDiffusion }   from "@its-not-rocket-science/ananke";
import { applyEmotionalContagion } from "@its-not-rocket-science/ananke";
```

You may now import from the dedicated subpath (recommended for tree-shaking):

```typescript
import {
  stepPolityDay,
  stepTechDiffusion,
  applyEmotionalContagion,
  EmotionalWave,
} from "@its-not-rocket-science/ananke/polity";
```

Both forms remain supported indefinitely.

#### Interface freeze guarantees (from v0.2.0)

| Interface | Guarantee |
|-----------|-----------|
| `Polity` | Existing fields never renamed/removed without major bump |
| `PolityRegistry` | `polities`, `activeWars`, `alliances` fields frozen |
| `PolityPair` | `polityAId`, `polityBId`, `sharedLocations`, `routeQuality_Q` frozen |
| `EmotionalWave` | `profileId`, `sourcePolityId`, `intensity_Q`, `daysActive` frozen |

Adding new **optional** fields to these interfaces is never a breaking change.

---

## [0.1.9] — 2026-03-24

  ### Added

  - **CE-14 · Promote Socio-economic Campaign Layer to Tier 1 Stable** (`src/parallel.ts`)
    - Freeze Polity, PolityRegistry, PolityPair, EmotionalWave interfaces.
    - Promote stepPolityDay, stepTechDiffusion, applyEmotionalContagion,
      declareWar, makePeace to Tier 1 in STABLE_API.md.
    - Re-export tech-diffusion and emotional-contagion from src/polity.ts so
      ananke/polity is a single-import campaign layer entry point.
    - Add v0.1.x -> v0.2.0 migration guide to CHANGELOG.md.

---

## [0.1.11] — 2026-03-24

  ### Added

  - **Export Presets, Weapons, Channels, Traits, Kinds from Package Root** (`src/parallel.ts`)
    - Five modules were documented as Tier 1 stable but missing from src/index.ts.
      mkKnight/mkBoxer/etc., weapon arrays, DamageChannel, TraitId, CommandKinds
      and related symbols are now importable directly from the package root.
      Fix STABLE_API.md: WEAPONS was a phantom name; correct to ALL_HISTORICAL_MELEE etc.

---

## [0.1.10] — 2026-03-24

  ### Added

  - **CE-16 · Modding Support — HashMod, Post-tick Hooks, Behaviour Node Registry** (`src/parallel.ts`)
    - Three-layer modding contract: FNV-1a data fingerprinting, observational
      post-tick hooks, and named AI behaviour node factories. computeModManifest()
      provides a single session fingerprint for multiplayer client validation.
    - exported via src/index.ts.

---

## [0.1.8] — 2026-03-24

  ### Added

  - **CE-7 · Spatial Partitioning API for WebWorker Support** (`src/parallel.ts`)
    - Add partitionWorld / mergePartitions / detectBoundaryPairs /
      assignEntitiesToPartitions / canonicaliseBoundaryPairs.  Boundary pairs
      are sorted in canonical (min-id first) order to preserve determinism
      across partitions.
    - Export via src/index.ts

---

## [0.1.7] — 2026-03-23

  ### Added

  - **CE-9 · World-state Diffing and Incremental Snapshots** (`src/sim/cover.ts`)
    - diffWorldState(prev, next): top-level-field diff per entity; world
      scalar/subsystem diffs; added/removed entity tracking
    - applyDiff(base, diff): reconstruct next state (non-mutating, copy-on-write)
    - packDiff(diff): custom binary encoding — magic "ANKD", tagged-value
      format (null/bool/uint8/int32/float64/string/array/object); zero
      external dependencies, implemented with DataView/Uint8Array
    - unpackDiff(bytes): full round-trip with magic and version validation
    - isDiffEmpty(), diffStats() — helpers for logging and network budgeting
    - 30 tests; verified binary size < full JSON for single-entity changes
    - Export via src/index.ts

---

## [0.1.6] — 2026-03-23

  ### Added

  - **CE-15 · Dynamic Terrain Cover System** (`src/sim/cover.ts`)
    - CoverSegment type: axis-aligned obstacle with material, height, burn state
    - isLineOfSightBlocked(): pure integer segment-intersection test (no sqrt)
    - computeCoverProtection(): multiplicative absorption across stacked cover
    - arcClearsCover(): indirect/lob fire height check
    - applyExplosionToTerrain(): proximity-scaled crater + wood ignition
    - stepCoverDecay(): wood burn-out and crater erosion over real time
    - 4 sample presets: stone wall, sandbag barricade, wooden palisade, dirt berm
    - 60 tests
    - Export via src/index.ts

---

## [0.1.5] — 2026-03-21

  ### Added

  - **CE-12 · Data-Driven Entity Catalog** (`src/catalog.ts`, `./catalog` subpath export)
    - `registerArchetype(json)` — parse JSON archetype with base inheritance (`HUMAN_BASE`,
      `AMATEUR_BOXER`, `SERVICE_ROBOT`, etc.) and SI → SCALE unit conversion
    - `registerWeapon(json)` — parse JSON weapon with damage profile; `reach_m` / `readyTime_s`
      converted to SCALE; all ratio fields → Q
    - `registerArmour(json)` — parse JSON armour; `protects` from channel-name strings →
      `ChannelMask`; `coverageByRegion` values → Q
    - `getCatalogEntry(id)` / `listCatalog(kind?)` / `unregisterCatalogEntry(id)` /
      `clearCatalog()` for lifecycle management
    - All numeric values in JSON are real-world SI units; conversion is automatic

  - **Phase 68 · Multi-Biome Physics** (`src/sim/biome.ts`)
    - `BiomeContext` interface with `gravity_mps2`, `thermalResistanceBase`, `dragMul`,
      `soundPropagation`, `isVacuum` overrides
    - Built-in profiles: `BIOME_UNDERWATER`, `BIOME_LUNAR`, `BIOME_VACUUM`
    - Gravity threads into `deriveMovementCaps` (jump height, traction); drag applied per tick
      in movement step; thermal resistance base overrides `stepCoreTemp`; vacuum fatigue
      accumulates in kernel (+3 Q/tick)
    - `KernelContext.biome?` field; fully backwards-compatible (absent = Earth defaults)

---

## [0.1.4] — 2026-03-20

### Added

- Subpath export `@its-not-rocket-science/ananke/species` — exposes `SpeciesDefinition`,
  `ALL_SPECIES`, and all 14 built-in species constants for companion packages such as
  `ananke-fantasy-species`.
- Subpath export `@its-not-rocket-science/ananke/polity` — exposes `createPolity`,
  `createPolityRegistry`, `stepPolityDay`, `declareWar`, `makePeace`, `areAtWar`,
  `Polity`, `PolityRegistry`, `PolityPair` for world-simulation consumers such as
  `ananke-world-ui`.

---

## [0.1.3] — 2026-03-20

### Changed

- `src/index.ts` (CE-4) now exports only the Tier 1 stable surface defined in `STABLE_API.md`.
  Tier 2 (experimental) and Tier 3 (internal) exports have been removed from the root barrel
  and are accessible via direct module paths (e.g. `dist/src/sim/aging.js`).
- `createWorld`, `loadScenario`, `validateScenario`, `ARCHETYPE_MAP`, `ITEM_MAP` promoted to
  Tier 1 (were incorrectly placed under Tier 3 in 0.1.2).
- `describeCharacter`, `formatCharacterSheet`, `formatOneLine` added to root barrel (were
  listed as Tier 1 in `STABLE_API.md` but missing from the 0.1.2 export).

---

## [0.1.2] — 2026-03-19

### Added

- `createWorld(seed, entities)` — Tier-1 convenience factory; builds a `WorldState` from
  `EntitySpec[]` (archetype, weapon, armour string IDs) without manual entity construction
- `loadScenario(json)` / `validateScenario(json)` — JSON-driven world creation for
  non-TypeScript consumers (Godot GDScript, Unity C#, scenario files)
- `ARCHETYPE_MAP` — `ReadonlyMap` of all 21 built-in archetypes (7 base + 14 species)
- `ITEM_MAP` — `ReadonlyMap` of all historical and starter weapons/armour

---

## [0.1.1] — 2026-03-19

### Documentation

- Replace root `README.md` with a focused programmer's guide (installation, three
  quick-start examples, core concepts, command reference, determinism rules, replay,
  bridge, API tier table, TypeScript types, performance guidance)
- Preserve full original README as `docs/project-overview.md`
- Publish `docs/` reference suite in npm tarball: host-contract, integration-primer,
  bridge-contract, performance, versioning, emergent-validation-report, project-overview
- Mark Platform Hardening PH-1 through PH-8 complete in ROADMAP
- Mark CE-1 (npm publish) complete; package published as `@its-not-rocket-science/ananke`

---

## [0.1.0] — 2026-03-18

Initial published release.  All simulation layers (2–6) complete.
3 023 tests passing.  Coverage: statements 93.9%, branches 85.0%, functions 92.3%.

### Simulation kernel (Layer 2) — Phases 1–60

- **Phase 1** — Physical melee combat: kinetic strike/block/parry resolution, per-region
  injury accumulation, shock/fluid-loss/consciousness tracking, movement physics, encumbrance,
  crowd density, spatial partitioning, formation frontage cap, occlusion
- **Phase 2** — Grappling (leverage-based, deterministic), stamina/exhaustion model, weapon
  dynamics (bind, reach dominance, swing momentum carry)
- **Phase 3** — Ranged and projectile combat: dispersion-based accuracy, penetration at range,
  suppression, cover/occlusion, explosive AoE, hydrostatic shock and cavitation, flash blindness
- **Phase 4** — Perception and cognition: sensory model, decision latency, surprise mechanics,
  deterministic AI (line infantry / skirmisher presets)
- **Phase 5** — Morale and psychological state: fear accumulation, routing, panic variety,
  leader/banner auras, rally mechanic
- **Phase 6** — Terrain: surface friction, obstacle/cover grids, elevation, slope direction,
  dynamic hazard cells, AI cover-seeking, elevation melee advantage
- **Phase 7** — Skill system: per-entity `SkillMap`, technique modifiers on physical outcomes
- **Phase 8** — Body plan system: universal region-based anatomy (humanoid, quadruped, theropod,
  sauropod, avian, vermiform, centaur, octopoid); add species with a data file, no kernel changes
- **Phase 9** — Medical simulation: fractures, infection, permanent damage, clotting, fatal
  fluid loss, `TreatCommand` with tiered equipment and skill-scaled treatment rates
- **Phase 10** — Indirect fire and artillery
- **Phase 11** — Technology spectrum: `TechContext`, `TechEra`, `TechCapability`,
  `validateLoadout`; powered exoskeleton, energy weapons, reflective armour, sensor items
- **Phase 12** — Capability sources and effects: Clarke's Third Law unification of magic and
  advanced technology; directional cone AoE for breath weapons / flamethrowers / gas
- **Phase 21** — Character generation: `generateIndividual(seed, archetype, bias?)` with
  per-archetype variance distributions; `NarrativeBias` for story-shaped generation (Phase 62)
- **Phase 22** — Campaign layer: world clock, location registry, `travelCost` routing,
  campaign-level inventory, Map-aware JSON serialisation
- **Phase 24** — Faction and reputation: standing, witness system, AI suppression
- **Phase 25** — Economy: item valuation, wear degradation, loot resolution, trade evaluation
- **Phase 31** — Knockback and stagger: impulse-momentum physics → stagger / prone transitions
- **Phase 32D** — Morale system constants
- **Phase 33** — Downtime and recovery: 1 Hz campaign-time bridge with tiered care levels
- **Phase 34** — Replay and analytics: `ReplayRecorder`, `replayTo`, `serializeReplay` /
  `deserializeReplay`, `CollectingTrace`, metrics
- **Phase 35** — Arena simulation framework: scenario DSL, batch trial runner, expectation system
- **Phase 36** — Dialogue and negotiation: intimidation / persuasion / deception / surrender /
  trade resolution using physical and psychological attributes
- **Phase 37** — Skill system extension: linguistic, musical, spatial intelligences
- **Phase 38** — Character description layer: `describeCharacter`, `formatCharacterSheet`,
  `formatOneLine`, tier ratings grounded in real-world benchmarks
- **Phase 39** — Narrative layer: trace-to-prose event conversion, configurable verbosity
- **Phase 45** — Faction system expansion
- **Phase 47** — Personality traits
- **Phase 48** — Formation and squad mechanics
- **Phase 50** — Legend and chronicle: `LegendRegistry`, fame tracking, `ChronicleEntry`
- **Phase 51** — Group psychology
- **Phase 53** — Systemic toxicology: ingested/cumulative toxins, pharmacokinetics,
  substance interactions, addiction and withdrawal
- **Phase 54** — Wound aging and long-term sequelae: PTSD-like `TraumaState`, phantom pain,
  chronic fatigue, sepsis risk
- **Phase 55** — Collective non-combat activities: siege engineering, ritual/ceremony, trade
  caravan logistics
- **Phase 56** — Disease and epidemic simulation: transmission routes, incubation, mortality,
  immunity, polity-scale spread
- **Phase 57** — Aging and lifespan: `AgeState`, age multipliers on all attribute groups,
  `applyAgingToAttributes`
- **Phase 58** — Sleep and circadian rhythm: sleep phases, debt accumulation,
  `applySleepToAttributes`, `circadianAlertness`
- **Phase 59** — Mounted combat: five mount profiles, charge energy, rider height/stability,
  forced dismount, mount fear propagation
- **Phase 60** — Environmental hazard zones: fire/radiation/toxic gas/acid/extreme cold,
  linear falloff exposure, `stepHazardZone`
- **Phase 2ext / 3ext / 8B / 8C / 10B / 10C / 11C / 12B** — Phase extensions for thermoregulation,
  weather, terrain enhancements, and technology calibration

### Individual scale (Layer 3) — Phases 57–58, 62

- Aging, sleep/circadian, narrative bias for character generation

### Group scale (Layer 4) — Phase 65

- **Phase 65** — Emotional contagion at polity scale: `EmotionalWave`, four built-in profiles
  (military rout, plague panic, victory rally, charismatic address), `applyEmotionalContagion`,
  `stepEmotionalWaves`, `netEmotionalPressure`

### Society scale (Layer 5) — Phase 66

- **Phase 66** — Generative mythology: six archetypal patterns detected from legend/chronicle log
  (hero, monster, great_plague, divine_wrath, golden_age, trickster); `compressMythsFromHistory`,
  `stepMythologyYear`, `aggregateFactionMythEffect`

### World scale (Layer 6) — Phases 61, 67

- **Phase 61** — Polity and world-state system: `Polity`, `PolityRegistry`, `stepPolityDay`,
  trade, war, diplomacy, tech advancement, epidemic spread at polity scale
- **Phase 67** — Technology diffusion: tech eras spread via trade routes; `computeDiffusionPressure`,
  `stepTechDiffusion`, `totalInboundPressure`

### Interface layer (Layer 1) — ROADMAP items 7–11, Phases 62–63

- **Phase 62** — Narrative Bias: `NarrativeBias` parameter for `generateIndividual`
- **Phase 63** — Narrative Stress Test: probability of story beats across seed distributions;
  Deus Ex score (0.00 = plausible, 1.00 = plot armour)
- **Phase 64** — "What If?" alternate history engine: polity-scale scenario runner across N seeds
- Visual editors: Body Plan Editor, Validation Scenario Builder, Species Forge
  (`docs/editors/`)
- Public Validation Dashboard: 43/43 scenarios passing (`docs/dashboard/`)
- Performance & Scalability Benchmarks: `tools/benchmark.ts`, `docs/performance.md`
- Emergent Behaviour Validation Suite: four historical scenarios, all pass (`tools/emergent-validation.ts`)
- Blade Runner artificial life test: 198 NPCs, 365 simulated days, 4/4 claims pass
- Dataset Contribution Pipeline: `docs/dataset-contribution.md`

### Infrastructure

- 3 023 Vitest tests; coverage ≥ 90% statements/lines, ≥ 80% branches, ≥ 85% functions
- CI: Node 20 + 22 matrix, typecheck, build, coverage, validation dashboard auto-update
- Fixed-point arithmetic throughout; zero `Math.random()` in `src/`
- `docs/integration-primer.md` — architecture, data-flow diagrams, type glossary, gotchas
- `docs/bridge-api.md` — 3D integration API reference
- `docs/ecosystem.md` — Unity/Godot adapter sketches
- `docs/performance.md` — benchmark methodology and tuning guide

---

[Unreleased]: https://github.com/its-not-rocket-science/ananke/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/its-not-rocket-science/ananke/releases/tag/v0.1.0
