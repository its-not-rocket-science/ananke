# Ananke — Supported-Recipes Matrix

> **Auto-generated** by `tools/generate-recipes-matrix.ts` — 2026-04-01  
> Run `npm run generate-recipes-matrix` to refresh.

One table per domain.  Use this to pick the right entry point without reading multiple docs.

**Stability tiers:**
- 🟢 **Stable** — guaranteed not to break without a major version bump + migration guide
- 🟡 **Experimental** — tested and usable; may change across minor versions; changelog documents it

**Save/replay column:**
- ✅ **full** — world state is deterministic and can be saved, loaded, and replayed exactly
- ✅ **replay only** — replay records tick-by-tick input; output is deterministic
- ⚠ **stateless** — output depends on external input (AI calls, prose templates); deterministic per seed but not replayable as a world state
- **n/a** — not applicable

---

## Summary

| Domain | Recipes | Stable | Experimental |
|--------|---------|--------|--------------|
| ⚔️ Tactical | 9 | 2 | 7 |
| 🏰 Campaign | 12 | 0 | 12 |
| 📦 Content | 6 | 0 | 6 |
| 🖼️ Renderer | 2 | 1 | 1 |
| 🌐 Multiplayer | 3 | 3 | 0 |
| 🔧 Tooling | 4 | 2 | 2 |
| **Total** | **36** | **8** | **28** |

---

## ⚔️ Tactical

| Use case | Packages | Tier | Run | Performance | Save/Replay | Notes |
|----------|----------|------|-----|-------------|-------------|-------|
| [Simulate a 1v1 duel](cookbook.md#1-simulate-a-duel) | `"."` + `"./combat"` | 🟢 Stable | `npm run example:combat`<br>`npm run ref:tactical-duel` | < 1 ms/tick | ✅ full | Fixed-point, deterministic across seeds |
| [Run a 500-agent battle](cookbook.md#2-run-a-500-agent-battle) | `"."` + `"./combat"` | 🟢 Stable | `npm run ref:tactical-duel`<br>`npm run run:demo` | < 0.5 ms/tick at 500 agents | ✅ full | Use lineInfantry AI preset; spatial index built each tick |
| Mounted combat / charges | `"."` + `"./combat"` | 🟡 Experimental | — | < 1 ms/tick | ✅ full | computeChargeBonus, checkMountStep, MountProfile |
| Ranged / projectile combat | `"."` + `"./combat"` | 🟡 Experimental | — | < 1 ms/tick | ✅ full | resolveRangedAttack; cone/occlusion built into kernel |
| Formation / mass battle | `"."` + `"./combat"` | 🟡 Experimental | `npm run run:demo` | < 0.5 ms/tick | ✅ full | computeFormationBonus, FormationUnit, frontage/density |
| Grapple / wrestling | `"."` + `"./combat"` | 🟡 Experimental | — | < 1 ms/tick | ✅ full | resolveGrappleContest; grapple state on Entity.grapple |
| Anatomy / regional injury | `"./anatomy"` + `"./combat"` + `"."` | 🟡 Experimental | — | < 1 ms/tick | ✅ full | compileAnatomyDefinition; injury.byRegion per body part |
| Competence / skill contests | `"./competence"` + `"."` | 🟡 Experimental | — | negligible | ✅ full | resolveCompetence across all 12 domains (Gardner model) |
| Environmental hazard zones | `"."` + `"./combat"` | 🟡 Experimental | — | < 1 ms/tick | ✅ full | HazardZone, computeHazardExposure, deriveHazardEffect |

## 🏰 Campaign

| Use case | Packages | Tier | Run | Performance | Save/Replay | Notes |
|----------|----------|------|-----|-------------|-------------|-------|
| [Campaign loop (day tick)](cookbook.md#6-create-a-campaign-loop) | `"./campaign"` + `"./polity"` + `"."` | 🟡 Experimental | `npm run ref:campaign-sandbox`<br>`npm run example:campaign` | < 1 ms/day at 4 polities | ✅ full | stepPolityDay, stepCampaignDay, PolityRegistry |
| Population / demography | `"./demography"` + `"./polity"` + `"./migration"` | 🟡 Experimental | `npm run ref:campaign-sandbox` | < 0.1 ms/polity/day | ✅ full | stepPolityPopulation; computeMigrationFlow; applyMigrationFlows |
| Epidemic / disease spread | `"./epidemic"` + `"./containment"` + `"./polity"` | 🟡 Experimental | `npm run ref:campaign-sandbox` | < 0.1 ms/disease/day | ✅ full | createEpidemicState, stepEpidemic, spreadEpidemic; 6 disease profiles |
| Diplomacy / treaties | `"./diplomacy"` + `"./polity"` | 🟡 Experimental | `npm run ref:campaign-sandbox` | negligible | ✅ full | signTreaty, stepTreatyStrength; TreatyType: trade_pact / military_alliance / … |
| Feudal hierarchy / succession | `"./feudal"` + `"./succession"` + `"./kinship"` | 🟡 Experimental | — | negligible | ✅ full | createFeudalBond, resolveSuccession, buildSuccessionOrder |
| Trade routes / economy | `"./trade-routes"` + `"./monetary"` + `"./granary"` | 🟡 Experimental | — | negligible | ✅ full | computeTradeFlow; monetary policy; food storage and distribution |
| Siege warfare | `"./siege"` + `"./polity"` + `"."` | 🟡 Experimental | — | < 1 ms/tick | ✅ full | SiegeState, stepSiege; siege escalation and breach resolution |
| [Narrative / storytelling](cookbook.md#9-stream-events-to-an-agent) | `"./narrative"` + `"./narrative-prose"` + `"./renown"` | 🟡 Experimental | `npm run run:narrative-stress-test`<br>`npm run run:narrative-stress-cinema` | < 1 ms/event | ⚠ stateless | Chronicle, story arcs, legend registry, template prose |
| Tech diffusion / eras | `"./polity"` + `"./research"` | 🟡 Experimental | `npm run ref:campaign-sandbox` | negligible | ✅ full | stepTechDiffusion; TechEra: Prehistoric→Ancient→Medieval→EarlyModern |
| Religion / faith system | `"./faith"` + `"./polity"` | 🟡 Experimental | — | negligible | ✅ full | FaithState, stepFaith; doctrine spread, piety, heresy |
| Civil unrest / governance | `"./unrest"` + `"./governance"` + `"./taxation"` | 🟡 Experimental | — | negligible | ✅ full | stepUnrest; edicts, tax pressure, stability feedback loops |
| Military campaign layer | `"./military-campaign"` + `"./polity"` + `"."` | 🟡 Experimental | — | < 1 ms/day | ✅ full | MilitaryCampaign, campaign marching, attrition, supply lines |

## 📦 Content

| Use case | Packages | Tier | Run | Performance | Save/Replay | Notes |
|----------|----------|------|-----|-------------|-------------|-------|
| [Add a custom weapon](cookbook.md#4-add-a-custom-weapon) | `"./catalog"` + `"."` | 🟡 Experimental | — | negligible | ✅ full | Weapon stats in SI units (SCALE.kg / SCALE.mps / SCALE.m) |
| [Author a new species](cookbook.md#3-author-a-new-species) | `"./species"` + `"./character"` + `"."` | 🟡 Experimental | `npm run ref:species-lab`<br>`npm run ref:species-lab:quick`<br>`npm run example:species` | negligible | ✅ full | SpeciesDefinition; generateSpeciesIndividual; innateTraits |
| Extended senses (echolocation, thermal, …) | `"./extended-senses"` + `"./species"` + `"."` | 🟡 Experimental | `npm run ref:species-lab` | negligible | ✅ full | dominantSense, thermalSignature, hasEcholocation, hasOlfaction |
| Aging, sleep, nutrition, disease (entity) | `"./character"` + `"."` | 🟡 Experimental | — | < 0.1 ms/entity/day | ✅ full | applyAgingToAttributes, stepSleep, stepNutrition, stepDiseaseForEntity |
| Crafting / manufacturing | `"./crafting"` + `"./catalog"` | 🟡 Experimental | — | negligible | ✅ full | craftItem, startManufacturing, advanceManufacturing, getAvailableRecipes |
| [Load a content pack](cookbook.md#12-load-a-content-pack) | `"./content-pack"` | 🟡 Experimental | — | negligible | ✅ full | JSON pack schema; loadContentPack, validatePack |

## 🖼️ Renderer

| Use case | Packages | Tier | Run | Performance | Save/Replay | Notes |
|----------|----------|------|-----|-------------|-------------|-------|
| [Drive a renderer (bridge layer)](cookbook.md#5-drive-a-renderer) | `"."` + `"./atmosphere"` + `"./terrain-bridge"` | 🟢 Stable | `npm run run:renderer-bridge`<br>`npm run run:bridge-demo` | < 0.2 ms/frame interpolation | ✅ full | serializeBridgeFrame, extractRigSnapshots; Unity/Godot ready |
| WASM kernel (C#/GDScript host) | `"./wasm-kernel"` | 🟡 Experimental | `npm run build:wasm:all` | native speed | ✅ full | loadWasmKernel; push/injury/units WASM modules |

## 🌐 Multiplayer

| Use case | Packages | Tier | Run | Performance | Save/Replay | Notes |
|----------|----------|------|-----|-------------|-------------|-------|
| Authoritative lockstep multiplayer | `"."` + `"./netcode"` | 🟢 Stable | `npm run example:lockstep` | < 1 ms/tick | ✅ full | hashWorldState per tick; fixed 20 Hz tick rate recommended |
| Rollback / client-side prediction | `"."` + `"./netcode"` | 🟢 Stable | `npm run example:rollback` | < 1 ms/re-sim | ✅ full | Snapshot → predict → verify hash → re-simulate on mismatch |
| [Replay recording and diffing](cookbook.md#11-record-and-replay-a-fight) | `"."` + `"./netcode"` | 🟢 Stable | `npm run run:trace-attack`<br>`npm run example:lockstep` | < 0.1 ms/frame encode | ✅ replay only | ReplayRecorder, replayToWorld; `npx ananke replay diff a.json b.json` |

## 🔧 Tooling

| Use case | Packages | Tier | Run | Performance | Save/Replay | Notes |
|----------|----------|------|-----|-------------|-------------|-------|
| [What-if scenario engine](cookbook.md#8-use-the-what-if-engine) | `"."` + `"./combat"` | 🟡 Experimental | `npm run run:what-if` | < 5 ms/scenario | ✅ replay only | Sweep over seeds / parameters; compareScenarios |
| [Build a validation scenario](cookbook.md#7-build-a-validation-scenario) | `"."` + `"./combat"` | 🟡 Experimental | `npm run run:validation`<br>`npm run run:validation-dashboard` | varies | ⚠ stateless | DirectValidationScenario; compare vs empirical data ±tolerance |
| [Save and reload a world](cookbook.md#10-save-and-reload-a-world) | `"."` + `"./schema"` | 🟢 Stable | `npm run run:serialize`<br>`npm run ref:campaign-sandbox` | < 1 ms/snapshot | ✅ full | stampSnapshot, JSON.stringify/parse; schema forward-compat via stampSnapshot |
| [Stream world events to an AI agent](cookbook.md#9-stream-events-to-an-agent) | `"."` | 🟢 Stable | `npm run run:observer` | negligible | ⚠ stateless | world.events array cleared each tick; snapshot for context window |

---

## Quick-reference: use case → entry point

| I want to… | Start here |
|------------|------------|
| Run a 1v1 fight | `import { stepWorld } from "@its-not-rocket-science/ananke"` |
| Build a strategy game | `import { stepPolityDay } from "@its-not-rocket-science/ananke/polity"` |
| Design a creature | `import { SpeciesDefinition } from "@its-not-rocket-science/ananke/species"` |
| Integrate with Unity / Godot | `import { serializeBridgeFrame } from "@its-not-rocket-science/ananke/host-loop"` |
| Add multiplayer | `import { hashWorldState } from "@its-not-rocket-science/ananke/netcode"` |
| Save game state | `import { stampSnapshot } from "@its-not-rocket-science/ananke/schema"` |
| Debug desyncs | `npx ananke replay diff a.json b.json` |

For a deeper walkthrough see **[docs/cookbook.md](cookbook.md)** (12 task-oriented recipes).

For API guarantees see **[STABLE_API.md](../STABLE_API.md)**.

For the full module listing see **[docs/module-index.md](module-index.md)**.
