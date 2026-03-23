# Changelog

All notable changes to Ananke are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

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
