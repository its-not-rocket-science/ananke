# Changelog

All notable changes to Ananke are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

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
  - Layer 2 — Post-tick behavior hooks: `registerPostTickHook / unregisterPostTickHook /
    runPostTickHooks / listPostTickHooks / clearPostTickHooks`; hooks fire after
    `stepWorld`, are purely observational (logging, analytics, renderer updates).
  - Layer 3 — AI behavior node registry: `registerBehaviorNode / unregisterBehaviorNode /
    getBehaviorNode / listBehaviorNodes / clearBehaviorNodes`; custom `BehaviorNode`
    factories registered by id for scenario and behavior-tree composition.
  - Session fingerprint: `computeModManifest(catalogIds)` returns sorted id lists and a
    single fingerprint covering all three layers for multiplayer client validation.
  - `clearAllMods()` resets hooks and behavior nodes (catalog unchanged).
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
      post-tick hooks, and named AI behavior node factories. computeModManifest()
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
