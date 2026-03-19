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
| `WEAPONS` | Historical weapons database (~70 weapons, six eras) |

### Replay and serialization (`src/replay.ts`)

| Export | Description |
|--------|-------------|
| `ReplayRecorder` | Attach to a world to record all ticks |
| `replayTo(replay, tick, ctx)` | Replay to a target tick deterministically |
| `serializeReplay(replay)` | JSON-stringify a replay |
| `deserializeReplay(json)` | Restore a replay from JSON |
| `Replay`, `ReplayFrame` | Replay types |

### 3D integration (`src/model3d.ts`)

| Export | Description |
|--------|-------------|
| `extractRigSnapshots(world)` | Per-entity rig data snapshot for renderer use |
| `deriveAnimationHints(entity)` | Animation state hints |
| `derivePoseModifiers(entity)` | Per-region impairment pose weights |
| `deriveGrappleConstraint(entity)` | Grapple pose constraint for paired entities |
| `deriveMassDistribution(entity)` | Mass distribution for physics rigs |
| `deriveInertiaTensor(entity)` | Inertia tensor for physics rigs |
| `AnimationHints`, `PoseModifier`, `GrapplePoseConstraint`, `MassDistribution`, `InertiaTensor` | Types |

### Description layer (`src/describe.ts`)

| Export | Description |
|--------|-------------|
| `describeCharacter(attrs)` | Translate fixed-point attributes into rated descriptions |
| `formatCharacterSheet(desc)` | Multi-line formatted character sheet |
| `formatOneLine(desc)` | One-line summary |
| `CharacterDescription`, `AttributeRating` | Types |

---

## Tier 2 — Experimental extension API

These exports are usable and tested but may change across minor versions.
A `CHANGELOG.md` entry will document any breaking change.

| Module | Key exports |
|--------|------------|
| `src/polity.ts` | `createPolity`, `createPolityRegistry`, `stepPolityDay`, `declareWar`, `areAtWar`, `Polity`, `PolityRegistry`, `PolityPair` |
| `src/tech-diffusion.ts` | `computeDiffusionPressure`, `stepTechDiffusion`, `totalInboundPressure`, `techEraName` |
| `src/emotional-contagion.ts` | `applyEmotionalContagion`, `stepEmotionalWaves`, `computeEmotionalSpread`, `triggerMilitaryRout`, `triggerVictoryRally`, `netEmotionalPressure` |
| `src/mythology.ts` | `compressMythsFromHistory`, `stepMythologyYear`, `aggregateFactionMythEffect`, `scaledMythEffect` |
| `src/narrative-stress.ts` | `runNarrativeStressTest`, `scoreNarrativePush` |
| `src/campaign.ts` | `Campaign`, `stepCampaignDay`, `advanceCampaignClock`, `serializeCampaign`, `deserializeCampaign` |
| `src/arena.ts` | Arena scenario DSL, `runArenaTrial`, `runArenaScenario` |
| `src/sim/aging.ts` | `applyAgingToAttributes`, `stepAging`, `deriveAgeMultipliers`, `getAgePhase` |
| `src/sim/sleep.ts` | `applySleepToAttributes`, `stepSleep`, `deriveSleepDeprivationMuls`, `circadianAlertness` |
| `src/sim/disease.ts` | `exposeToDisease`, `stepDiseaseForEntity`, `spreadDisease`, `computeTransmissionRisk` |
| `src/sim/mount.ts` | `checkMountStep`, `computeChargeBonus`, `deriveRiderHeightBonus` |
| `src/sim/hazard.ts` | `deriveHazardEffect`, `computeHazardExposure`, `stepHazardZone` |
| `src/dialogue.ts` | `resolveIntimidation`, `resolvePersuasion`, `resolveDeception`, `resolveTradeNegotiation` |
| `src/faction.ts` | `FactionRegistry`, `updateStanding`, `getFactionStanding` |
| `src/economy.ts` | `computeItemValue`, `applyWear`, `resolveDrops`, `evaluateTradeOffer` |
| `src/progression.ts` | `applyXP`, `applyTrainingDrift`, `computeMilestones` |

---

## Tier 3 — Internal kernel structures

These are implementation details.  Do not import them directly; they may change at any time.

| Module | Why internal |
|--------|-------------|
| `src/rng.ts` | `makeRng`, `eventSeed`, `hashString` — RNG contract is internal; seed structure may change |
| `src/sim/push.ts` | Pair-based resolution internals |
| `src/sim/kernel.ts` (non-exported functions) | Step sub-phases, internal accumulators |
| `src/sim/seeds.ts` | Seed derivation utilities |
| `src/sim/ai/` | AI decision internals; host applications should use `buildAICommands()` via `src/sim/ai/system.ts` |

> `buildAICommands()` from `src/sim/ai/system.ts` is Experimental (Tier 2).
> The individual sub-modules (`decide.ts`, `perception.ts`, `targeting.ts`) are Tier 3.

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
