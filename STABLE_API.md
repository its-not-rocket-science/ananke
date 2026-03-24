# Ananke — Stable API Reference

This document defines the three stability tiers for Ananke's public API surface.
See [`docs/versioning.md`](docs/versioning.md) for the full versioning policy, upgrade
cadence, and commit-hash pinning guide.

---

## Versioning policy (summary)

Ananke uses **semantic versioning (semver)** as its public contract.  Tier 1 exports
will not break without a major version bump and migration guide.  See
[`docs/versioning.md`](docs/versioning.md) for the complete policy.

Every export in `src/index.ts` is annotated with its tier via inline comments.
The tables below list key symbols by tier.

---

## Tier 1 — Stable host API

These exports are safe to depend on.  They will not change in a breaking way without a major
version bump and a migration guide in `CHANGELOG.md`.

### Fixed-point arithmetic (`src/units.ts`)

| Export | Description |
|--------|-------------|
| `type Q` | Dimensionless fixed-point scalar; `SCALE.Q == 1.0` |
| `type I32` | int32-safe number |
| `SCALE` | Unit scale constants: `SCALE.Q`, `SCALE.kg`, `SCALE.m`, `SCALE.mps`, `SCALE.J`, `SCALE.N`, `SCALE.W`, `SCALE.s` |
| `q(x)` | Convert a float to fixed-point Q |
| `qMul(a, b)` | Fixed-point multiply |
| `qDiv(a, b)` | Fixed-point divide |
| `clampQ(x, lo, hi)` | Clamp a Q value |
| `mulDiv(a, b, div)` | Integer multiply-then-divide with overflow safety |
| `to` | Conversion helpers: `to.kg(x)`, `to.m(x)`, `to.mps(x)`, `to.J(x)`, `to.N(x)`, `to.W(x)`, `to.s(x)` |
| `from` | Reverse converters: `from.kg(x)`, etc. |
| `sqrtQ(x)` | Fixed-point square root |

### Core simulation (`src/sim/kernel.ts`, `src/sim/world.ts`)

| Export | Description |
|--------|-------------|
| `stepWorld(world, cmds, ctx)` | Advance the world by one tick |
| `applyImpactToInjury(world, aId, bId, energy_J, channel)` | Apply kinetic impact |
| `applyFallDamage(entity, height_m)` | Apply fall damage to an entity |
| `applyExplosion(world, x, y, energy_J, radius_m, ctx)` | Blast AoE |
| `applyPayload(world, targetId, payload, ctx)` | Apply a capability payload |
| `applyCapabilityEffect(world, actorId, targetId, effect, ctx)` | Apply a capability effect |
| `WorldState` | World container type (`entities`, `spatialIndex`, `clock`) |
| `KernelContext` | Tick context (`worldSeed`, `techCtx`, `weather`) |
| `CommandMap` | Map of entity ID → command |

### Entity and attributes (`src/sim/entity.ts`, `src/types.ts`, `src/archetypes.ts`)

| Export | Description |
|--------|-------------|
| `Entity` | Core entity shape.  **Stable fields:** `id`, `pos`, `mass_kg`, `attributes`, `injuries`, `fatigue`, `fluid`, `consciousness`, `shock`, `fear`, `team`, `dead`.  Optional extension fields (mount, age, sleep, etc.) may gain new members in minor versions |
| `IndividualAttributes` | Physical attribute block (`peakForce_N`, `peakPower_W`, `continuousPower_W`, `reserveEnergy_J`, `reactionTime_s`, `controlQuality`, `stability`, `fineControl`, `stature_m`, `mass_kg`, …) |
| `Archetype` | Archetype baseline with variance fields |
| `BodyPlan` | Species body plan descriptor |
| `NarrativeBias` | Story-shaping bias for `generateIndividual` |

### Entity generation (`src/generate.ts`)

| Export | Description |
|--------|-------------|
| `generateIndividual(seed, archetype, bias?)` | Generate a physically plausible entity from an archetype |

### Presets and weapons (`src/presets.ts`, `src/weapons.ts`)

| Export | Description |
|--------|-------------|
| `mkKnight`, `mkBoxer`, `mkWrestler`, `mkOctopus`, `mkScubaDiver` | Named entity factories |
| `AMATEUR_BOXER`, `PRO_BOXER`, `GRECO_WRESTLER`, `KNIGHT_INFANTRY`, `LARGE_PACIFIC_OCTOPUS` | Validated archetypes |
| `ALL_HISTORICAL_MELEE`, `ALL_HISTORICAL_RANGED` | Complete historical weapon arrays |
| `PREHISTORIC_MELEE` … `CONTEMPORARY_RANGED` | Per-era weapon arrays (six eras × melee/ranged) |

### Damage channels and traits (`src/channels.ts`, `src/traits.ts`)

| Export | Description |
|--------|-------------|
| `DamageChannel` | Enum of damage channel types (kinetic, thermal, etc.) |
| `ChannelMask` | Bitmask type for combining channels |
| `channelMask(...channels)` | Build a combined channel mask |
| `hasChannel(mask, ch)` | Test whether a mask includes a channel |
| `TraitId` | Union type of all valid trait identifiers |
| `TRAITS` | Record mapping each `TraitId` to its `TraitEffect` |
| `buildTraitProfile(traits)` | Aggregate trait multipliers from an entity's trait list |
| `applyTraitsToAttributes(attrs, traits)` | Apply trait effects to an attribute block |

### Command vocabulary (`src/sim/kinds.ts`)

| Export | Description |
|--------|-------------|
| `CommandKinds` | Object of command kind string constants (`Move`, `Attack`, `Defend`, …) |
| `MoveModes` | Walk / sprint / crawl constants |
| `DefenceModes` | Parry / dodge / block constants |
| `EngageModes` | Engage / disengage constants |
| `HitArea` | Union of valid hit area identifiers |

### Replay and serialization (`src/replay.ts`)

| Export | Description |
|--------|-------------|
| `ReplayRecorder` | Attach to a world to record all ticks |
| `replayTo(replay, tick, ctx)` | Replay to a target tick deterministically |
| `serializeReplay(replay)` | JSON-stringify a replay |
| `deserializeReplay(json)` | Restore a replay from JSON |
| `Replay`, `ReplayFrame` | Replay types |

### 3D integration and renderer bridge (`src/model3d.ts`, `src/bridge/`)

See [`docs/bridge-contract.md`](docs/bridge-contract.md) for the field-by-field contract
including `AnimationHints`, `GrapplePoseConstraint`, and `InterpolatedState`.

| Export | Description |
|--------|-------------|
| `extractRigSnapshots(world)` | Per-entity rig data snapshot for renderer use |
| `deriveAnimationHints(entity)` | Animation state hints |
| `derivePoseModifiers(entity)` | Per-region impairment pose weights |
| `deriveGrappleConstraint(entity)` | Grapple pose constraint for paired entities |
| `deriveMassDistribution(entity)` | Mass distribution for physics rigs |
| `deriveInertiaTensor(entity)` | Inertia tensor for physics rigs |
| `AnimationHints`, `PoseModifier`, `GrapplePoseConstraint`, `MassDistribution`, `InertiaTensor` | Types |
| `BridgeEngine` | Double-buffered renderer bridge engine |
| `BridgeConfig`, `BodyPlanMapping`, `InterpolatedState` | Bridge configuration and output types |

### Description layer (`src/describe.ts`)

| Export | Description |
|--------|-------------|
| `describeCharacter(attrs)` | Translate fixed-point attributes into rated descriptions |
| `formatCharacterSheet(desc)` | Multi-line formatted character sheet |
| `formatOneLine(desc)` | One-line summary |
| `CharacterDescription`, `AttributeRating` | Types |

### Socio-Economic Campaign Layer (`ananke/polity` subpath — CE-14)

All of the following are available via `import { … } from "ananke/polity"` as a single
entry point.  The frozen interfaces (`Polity`, `PolityRegistry`, `PolityPair`,
`EmotionalWave`) will not gain required fields or lose existing fields without a minor
version bump; renames require a major bump and migration guide.

#### Polity system (`src/polity.ts`)

| Export | Description |
|--------|-------------|
| `Polity` _(frozen)_ | Geopolitical entity: city, nation, or empire |
| `PolityRegistry` _(frozen)_ | Container for all polities and active wars/alliances |
| `PolityPair` _(frozen)_ | Trade/proximity link between two polities |
| `createPolity(spec)` | Construct a `Polity` with sensible defaults |
| `createPolityRegistry(polities)` | Construct an empty registry |
| `stepPolityDay(registry, pairs, worldSeed, tick)` | Advance all polities by one simulated day |
| `declareWar(registry, aId, bId)` | Record a war between two polities |
| `makePeace(registry, aId, bId)` | End a war between two polities |
| `areAtWar(registry, aId, bId)` | Query war status |

#### Technology diffusion (`src/tech-diffusion.ts`)

| Export | Description |
|--------|-------------|
| `stepTechDiffusion(registry, pairs, worldSeed, tick)` | Spread technology between polities for one day |
| `computeDiffusionPressure(source, target, pair)` | Per-pair pressure score |
| `totalInboundPressure(registry, pairs, targetId)` | Sum of all inbound pressure toward a polity |
| `techEraName(era)` | Human-readable era label |

#### Emotional contagion (`src/emotional-contagion.ts`)

| Export | Description |
|--------|-------------|
| `EmotionalWave` _(frozen)_ | Active emotional event propagating across polities |
| `applyEmotionalContagion(registry, waves, worldSeed, tick)` | Apply all active waves to polity morale |
| `stepEmotionalWaves(waves, worldSeed, tick)` | Advance wave intensities by one day |
| `computeEmotionalSpread(source, target, wave, profile)` | Spread probability for one polity pair |
| `triggerMilitaryRout(sourcePolityId)` | Emit a fear wave from a battlefield loss |
| `triggerVictoryRally(sourcePolityId, leaderId?)` | Emit a hope wave from a victory |
| `netEmotionalPressure(registry, waves, polityId)` | Net morale pressure on a polity |

---

## Tier 2 — Experimental extension API

These exports are usable and tested but may change across minor versions.
A `CHANGELOG.md` entry will document any breaking change.

All Tier 2 modules are accessible via deep imports:
```typescript
import { stepAging } from "@its-not-rocket-science/ananke/dist/src/sim/aging.js";
```

### AI command system

| Module | Key exports |
|--------|------------|
| `src/sim/ai/system.ts` | `buildAICommands(world, ctx)` — build a `CommandMap` for all AI-controlled entities |

### Character lifecycle

| Module | Key exports |
|--------|------------|
| `src/sim/aging.ts` | `applyAgingToAttributes`, `stepAging`, `deriveAgeMultipliers`, `getAgePhase` |
| `src/sim/sleep.ts` | `applySleepToAttributes`, `stepSleep`, `deriveSleepDeprivationMuls`, `circadianAlertness` |
| `src/sim/disease.ts` | `exposeToDisease`, `stepDiseaseForEntity`, `spreadDisease`, `computeTransmissionRisk` |
| `src/sim/wound-aging.ts` | `stepWoundAging`, `recordTraumaEvent`, `deriveFearThresholdMul`, `deriveSepsisRisk` |
| `src/sim/thermoregulation.ts` | `stepThermoregulation`, `deriveThermalComfort`, `computeMetabolicRate` |
| `src/sim/nutrition.ts` | `stepNutrition`, `computeHungerEffect`, food catalogue constants |
| `src/sim/medical.ts` | `resolveTreatment`, `computeTreatmentEffect`, medical tier definitions |
| `src/sim/toxicology.ts` | `applyVenom`, `stepActiveVenoms`, `resolveIngestedToxin` |
| `src/progression.ts` | `applyXP`, `applyTrainingDrift`, `computeMilestones` |

### Combat extensions

| Module | Key exports |
|--------|------------|
| `src/sim/mount.ts` | `checkMountStep`, `computeChargeBonus`, `deriveRiderHeightBonus` |
| `src/sim/hazard.ts` | `deriveHazardEffect`, `computeHazardExposure`, `stepHazardZone` |
| `src/sim/ranged.ts` | `resolveRangedAttack`, `computeRangedAccuracy`, `computeProjectileEnergy` |
| `src/sim/grapple.ts` | `resolveGrappleContest`, `computeGrappleStrength`, `stepGrapple` |
| `src/sim/formation.ts` | `FormationConfig`, `computeFormationBonus`, `resolveFormationStep` |
| `src/sim/morale.ts` | `computeMoraleEffect`, `stepMorale`, `applyRoutEffect` |
| `src/sim/sensory.ts` | `computeVisibility`, `computeHearingRange`, `stepSensoryState` |
| `src/sim/sensory-extended.ts` | `computeEcholocationRange`, `computeOlfactionRange` — non-human senses |
| `src/sim/weather.ts` | `WeatherState`, `stepWeather`, `computeWeatherEffect` |
| `src/sim/terrain.ts` | `TerrainType`, `TERRAIN_PROFILES`, `computeTerrainTraction` |
| `src/sim/skills.ts` | `SkillId`, `SkillLevel`, `SKILL_LEVEL_MULS`, `buildSkillMap`, `getSkillMul` |
| `src/sim/biome.ts` | `BiomeType`, `BIOME_PROFILES`, `deriveBiomeEnvironment` |

### Social and economic systems

| Module | Key exports |
|--------|------------|
| `src/dialogue.ts` | `resolveIntimidation`, `resolvePersuasion`, `resolveDeception`, `resolveTradeNegotiation` |
| `src/faction.ts` | `FactionRegistry`, `updateStanding`, `getFactionStanding` |
| `src/economy.ts` | `computeItemValue`, `applyWear`, `resolveDrops`, `evaluateTradeOffer` |
| `src/relationships.ts` | `createRelationshipGraph`, `establishRelationship`, `recordEvent`, `getRelationshipAffinity` |
| `src/relationships-effects.ts` | Relationship modifiers applied to dialogue, teaching, morale contexts |
| `src/party.ts` | `createPartyRegistry`, `createParty`, `addPartyMember`, `setPartyStanding` |

### Campaign and world management

| Module | Key exports |
|--------|------------|
| `src/campaign.ts` | `Campaign`, `stepCampaignDay`, `advanceCampaignClock`, `serializeCampaign`, `deserializeCampaign` |
| `src/downtime.ts` | `stepDowntime`, `TreatmentSchedule`, `EntityRecoveryReport` |
| `src/collective-activities.ts` | `createCollectiveProject`, `contributeToCollectiveProject`, `stepRitual`, `planCaravanRoute` |
| `src/inventory.ts` | `createInventory`, `addItemToInventory`, `consumeItemsByTemplateId`, `getEncumbrancePenalty` |
| `src/item-durability.ts` | `stepWear`, `applyWearPenalty` |
| `src/settlement.ts` | `createSettlement`, `upgradeSettlement`, `getServiceBonus` |
| `src/settlement-services.ts` | Service definitions (forge, medical, market, barracks, temple) |
| `src/inheritance.ts` | `transferEquipment`, `transferRelationships`, `transferInventory` — character death succession |
| `src/world-generation.ts` | `generateWorld`, `deriveStartingRelationships`, `deriveStartingConflicts` |

### Quest and narrative layer

| Module | Key exports |
|--------|------------|
| `src/quest.ts` | `questFactory`, `updateQuestState`, `resolveObjective`, `Quest`, `QuestObjective` |
| `src/quest-generators.ts` | `generateBountyQuest`, `generateEscortQuest`, `generateRetrievalQuest` |
| `src/chronicle.ts` | `createChronicle`, `addChronicleEntry`, `getEntriesForEntity`, `ChronicleEntry` |
| `src/story-arcs.ts` | `detectStoryArcs`, `updateDetectedArcs` — pattern detection across chronicle entries |
| `src/narrative-render.ts` | `renderEntry`, `renderArcSummary` — template-based prose from chronicle entries |
| `src/legend.ts` | `createLegendRegistry`, `createLegendFromChronicle`, `applyLegendToDialogueContext` |
| `src/mythology.ts` | `compressMythsFromHistory`, `stepMythologyYear`, `aggregateFactionMythEffect`, `scaledMythEffect` |
| `src/narrative.ts` | `narrateCombatTick`, `narrateInjury` — human-readable combat event strings |
| `src/narrative-stress.ts` | `runNarrativeStressTest`, `scoreNarrativePush` |
| `src/metrics.ts` | `extractCombatMetrics`, `summariseBattle` — analytics from trace events |
| `src/arena.ts` | Arena scenario DSL, `runArenaTrial`, `runArenaScenario` |

### Anatomy subsystem

| Module | Key exports |
|--------|------------|
| `src/anatomy/index.ts` | Re-export barrel for the full anatomy API |
| `src/anatomy/anatomy-contracts.ts` | `CompiledAnatomyModel`, `AnatomyContracts`, `AnatomyCapabilities` — core anatomy types |
| `src/anatomy/anatomy-schema.ts` | `validateExtendedBodyPlan`, `ValidationResult` — validate JSON body plan definitions |
| `src/anatomy/anatomy-compiler.ts` | `compileAnatomyDefinition`, `compileAnatomyDefinitionOrThrow` — compile a body plan to indexed model |
| `src/anatomy/anatomy-helpers.ts` | `createAnatomyHelpers`, `summarizeFunctionalHealth`, `sampleProfile` — query compiled anatomy |

### Competence framework

| Module | Key exports |
|--------|------------|
| `src/competence/index.ts` | Re-export barrel for the full competence API |
| `src/competence/framework.ts` | `resolveCompetence(entity, action, ctx)` — unified competence resolution dispatcher |
| `src/competence/catalogue.ts` | `CompetenceDomain`, `CompetenceTask`, predefined task catalogue entries |

### Crafting subsystem

| Module | Key exports |
|--------|------------|
| `src/crafting/index.ts` | `craftItem`, `startManufacturing`, `advanceManufacturing`, `getAvailableRecipes` — main crafting API |

---

## Tier 3 — Internal kernel structures

These are implementation details.  Do not import them directly; they may change at any time.

### Kernel internals

| Module | Why internal |
|--------|-------------|
| `src/rng.ts` | `makeRng`, `eventSeed`, `hashString` — RNG contract is internal; seed structure may change |
| `src/sim/seeds.ts` | Seed derivation utilities |
| `src/sim/push.ts` | Pair-based resolution internals |
| `src/sim/kernel.ts` (non-exported functions) | Step sub-phases, internal accumulators |
| `src/sim/tick.ts` | Single-tick orchestration called by `stepWorld` |
| `src/sim/action.ts` | Attack cooldown and swing-momentum state machine |
| `src/sim/intent.ts` | Movement and defence intent processing |
| `src/sim/combat.ts` | Hit resolution and skill-contest internals |
| `src/sim/step/` | All sub-step modules (`push`, `energy`, `injury`, `movement`, etc.) |
| `src/sim/context.ts` | `KernelContext` type definition (re-exported via `sim/world.ts`) |
| `src/sim/events.ts` | Internal event emission — consumed by trace and bridge |
| `src/sim/indexing.ts` | Spatial index internals used by `stepWorld` |
| `src/sim/tuning.ts` | Physics constant tables — may be retuned in patch releases |
| `src/sim/impairment.ts` | Functional damage accumulator — called by the kernel step |
| `src/sim/occlusion.ts` | Internal visibility occlusion used by sensory |
| `src/sim/systemic-toxicology.ts` | Multi-substance pharmacokinetics internals |
| `src/sim/formation-unit.ts` | Squad-level unit structure used by `formation-combat.ts` |
| `src/sim/commandBuilders.ts` | Low-level command construction helpers — prefer `noMove()` from `commands.ts` |
| `src/sim/team.ts` | Team/side definitions used internally by AI and morale |
| `src/derive.ts` | Movement-force and geometry derivations used by the kernel |
| `src/lod.ts` | Level-of-detail helpers for large simulations |
| `src/debug.ts` | Visual debug extraction (motion vectors, hit traces) |

### AI decision internals

| Module | Why internal |
|--------|-------------|
| `src/sim/ai/decide.ts` | Decision-tree evaluation — called by `buildAICommands` |
| `src/sim/ai/perception.ts` | AI sensory processing — called by `buildAICommands` |
| `src/sim/ai/targeting.ts` | Target selection heuristics — called by `buildAICommands` |
| `src/sim/ai/personality.ts` | Personality trait modifiers on AI decisions |
| `src/sim/ai/types.ts` | AI policy and state types used only within `src/sim/ai/` |

> Use `buildAICommands(world, ctx)` from `src/sim/ai/system.ts` (Tier 2) rather than importing AI sub-modules directly.

### Competence domain resolvers

These are called by `resolveCompetence()` and should not be imported directly.

| Module | Domain |
|--------|--------|
| `src/competence/crafting.ts` | Crafting and tool use |
| `src/competence/navigation.ts` | Wayfinding and cartography |
| `src/competence/naturalist.ts` | Tracking, foraging, taming |
| `src/competence/interspecies.ts` | Cross-species communication |
| `src/competence/language.ts` | Linguistics and translation |
| `src/competence/teaching.ts` | Knowledge transfer |
| `src/competence/willpower.ts` | Endurance and mental fortitude |
| `src/competence/engineering.ts` | Siege and structural engineering |
| `src/competence/performance.ts` | Entertainment and oratory |
| `src/competence/acoustic.ts` | Formation signalling (drums, horns) |

### Crafting internals

These are called by `craftItem()` / `startManufacturing()` and should not be imported directly.

| Module | Role |
|--------|------|
| `src/crafting/materials.ts` | Material definitions and property calculations |
| `src/crafting/recipes.ts` | Recipe validation and feasibility |
| `src/crafting/manufacturing.ts` | Batch production mechanics |
| `src/crafting/workshops.ts` | Workshop facility definitions and output bonuses |

---

## What constitutes a "breaking change"

| Tier 1 (breaking, requires major bump) | Tier 2 (documented in changelog) |
|---------------------------------------|----------------------------------|
| Removing or renaming a stable export | Removing or renaming an experimental export |
| Changing the signature of a stable function | Changing observable behaviour without a matching test update |
| Removing required fields from stable types | Changing field names in experimental types |
| Changing `stepWorld`'s observable output for identical inputs | Changing RNG consumption order in internal modules |
| Breaking `serializeReplay`/`deserializeReplay` round-trip | Changing undocumented default values |

Adding new **optional** fields to `Entity` or `IndividualAttributes` is never a breaking change.
Adding new exports is never a breaking change at any tier.

---

## Entity and WorldState Field Tiers

Every field on `Entity` and `WorldState` carries a JSDoc annotation that identifies which
subsystem owns it and whether it is required by the kernel.  There are three tiers:

### `@core` — Required by `stepWorld` every tick

These fields must always be present.  Removing or renaming them is a Tier 1 breaking change.

**`Entity` core fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | Unique entity identifier; stable across ticks |
| `teamId` | `number` | Combat team / allegiance for attack resolution and AI targeting |
| `attributes` | `IndividualAttributes` | Physical and cognitive capabilities |
| `energy` | `EnergyState` | Energy reserve and fatigue accumulator |
| `loadout` | `Loadout` | Equipped items: weapons, armour, held objects |
| `traits` | `TraitId[]` | Permanent trait flags |
| `position_m` | `Vec3` | World-space position (fixed-point, `SCALE.m` = 1 m) |
| `velocity_mps` | `Vec3` | Velocity (fixed-point, `SCALE.mps` = 1 m/s) |
| `intent` | `IntentState` | Movement and defence intent derived from the previous tick's commands |
| `action` | `ActionState` | Attack cooldowns, swing momentum, weapon-bind state |
| `condition` | `ConditionState` | Fear, morale, sensory modifiers, fatigue, thermal state |
| `injury` | `InjuryState` | Per-region damage, shock, consciousness, fluid loss, death flag |
| `grapple` | `GrappleState` | Active grapple relationships, grip strength, positional lock |

**`WorldState` core fields:**

| Field | Type | Description |
|-------|------|-------------|
| `tick` | `number` | Current tick count; incremented by `stepWorld` |
| `seed` | `number` | Deterministic RNG seed |
| `entities` | `Entity[]` | All live and dead entities |

### `@subsystem(name)` — Optional state consumed by a specific module

These fields are optional `?` properties.  Omitting a subsystem field disables that module's
behaviour for the entity; the kernel continues to run correctly without it.  Adding new
subsystem fields is never a breaking change.

**`Entity` subsystem fields:**

| Field | Module | Description |
|-------|--------|-------------|
| `willpower?` | `willpower` | Cognitive stamina reserve for concentration abilities |
| `skills?` | `skills` | Per-skill proficiency map for skill-contest resolution |
| `bodyPlan?` | `anatomy` | Body plan defining injury segments and mass distribution |
| `substances?` | `pharmacology` | Active pharmacological substances in the bloodstream |
| `foodInventory?` | `nutrition` | Consumable food items and counts |
| `molting?` | `anatomy` | Arthropod molting state (softening segments, repair cycles) |
| `ai?` | `ai` | AI decision state (target selection, threat map) |
| `capabilitySources?` | `capability` | Attached capability sources (mana pools, divine reserves) |
| `armourState?` | `armour` | Mutable resist state for ablative armour items |
| `pendingActivation?` | `capability` | In-flight capability cast |
| `activeConcentration?` | `capability` | Active concentration aura |
| `faction?` | `faction` | Faction membership identifier |
| `party?` | `party` | Adventuring party membership identifier |
| `reputations?` | `faction` | Entity-level faction-standing overrides |
| `physiology?` | `thermoregulation` | Species-level physiological overrides |
| `activeVenoms?` | `toxicology` | Active venom/toxin injections |
| `limbStates?` | `anatomy` | Per-limb state for multi-limb entities |
| `personality?` | `ai` | AI personality traits (aggression, caution, loyalty) |
| `extendedSenses?` | `sensory` | Extended sensory modalities (echolocation, olfaction) |
| `activeIngestedToxins?` | `toxicology` | Active ingested toxins (alcohol, sedatives, heavy metals) |
| `cumulativeExposure?` | `toxicology` | Cumulative lifetime dose records |
| `withdrawal?` | `toxicology` | Active withdrawal states |
| `traumaState?` | `wound-aging` | PTSD-like trauma state from severe shock events |
| `activeDiseases?` | `disease` | Active systemic disease states |
| `immunity?` | `disease` | Post-recovery immunity records |
| `age?` | `aging` | Elapsed life-seconds for aging calculations |
| `sleep?` | `sleep` | Sleep-phase state and debt accumulator |
| `mount?` | `mount` | Rider/mount pair state for mounted combat |
| `compiledAnatomy?` | `anatomy` | Internal anatomy cache — do not set manually |
| `anatomyHelpers?` | `anatomy` | Internal anatomy helper cache — do not set manually |

**`WorldState` subsystem fields:**

| Field | Module | Description |
|-------|--------|-------------|
| `activeFieldEffects?` | `capability` | Active suppression zones and field-effect modifiers |
| `__sensoryEnv?` | `sensory` | Ambient lighting and visibility environment |
| `__factionRegistry?` | `faction` | Global faction-standing registry |
| `__partyRegistry?` | `party` | Global party registry |
| `__relationshipGraph?` | `relationships` | Inter-entity relationship graph |
| `__nutritionAccum?` | `nutrition` | Cross-tick nutrition accumulator |

### `@extension` — Host-owned data

No built-in fields carry this tag.  Hosts may add their own optional `?` fields to pass
renderer metadata, network session IDs, or other application-specific data alongside entities.
TypeScript's structural typing allows this without modifying `Entity`'s definition.
