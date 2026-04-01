# API Surface: @ananke/campaign

> **Auto-generated** by `tools/extract-api.ts` — 2026-03-31  
> Do not edit by hand. Re-run `npm run extract-api` to refresh.

**World simulation — polity, economy, social, demography, epidemic**

Total exported symbols: **691**

---

## Source files (38)

- `src/calendar.ts` — 25 exports
- `src/climate.ts` — 14 exports
- `src/containment.ts` — 17 exports
- `src/demography.ts` — 19 exports
- `src/diplomacy.ts` — 19 exports
- `src/epidemic.ts` — 16 exports
- `src/espionage.ts` — 18 exports
- `src/faith.ts` — 22 exports
- `src/famine.ts` — 23 exports
- `src/feudal.ts` — 20 exports
- `src/governance.ts` — 21 exports
- `src/granary.ts` — 15 exports
- `src/infrastructure.ts` — 17 exports
- `src/kinship.ts` — 17 exports
- `src/mercenaries.ts` — 20 exports
- `src/migration.ts` — 14 exports
- `src/military-campaign.ts` — 35 exports
- `src/monetary.ts` — 16 exports
- `src/narrative-prose.ts` — 7 exports
- `src/polity.ts` — 38 exports
- `src/renown.ts` — 14 exports
- `src/research.ts` — 14 exports
- `src/resources.ts` — 24 exports
- `src/schema-migration.ts` — 10 exports
- `src/siege.ts` — 17 exports
- `src/sim/aging.ts` — 11 exports
- `src/sim/disease.ts` — 30 exports
- `src/sim/hazard.ts` — 16 exports
- `src/sim/mount.ts` — 27 exports
- `src/sim/nutrition.ts` — 6 exports
- `src/sim/sleep.ts` — 19 exports
- `src/sim/thermoregulation.ts` — 13 exports
- `src/succession.ts` — 14 exports
- `src/taxation.ts` — 13 exports
- `src/tech-diffusion.ts` — 13 exports
- `src/trade-routes.ts` — 20 exports
- `src/unrest.ts` — 18 exports
- `src/wonders.ts` — 19 exports

---

## Types & Interfaces (132)

| Name | Source | Notes |
|------|--------|-------|
| `ActiveClimateEvent` | `src/climate.ts` | Mutable tracking state for an ongoing climate event. |
| `AgeMultipliers` | `src/sim/aging.ts` | Q-valued multipliers for each aging dimension. |
| `AgentStatus` | `src/espionage.ts` | Current cover status of the agent in the target polity. |
| `AgePhase` | `src/sim/aging.ts` | Life-stage classification derived from normalized age fraction. Species-agnostic: boundaries are proportional to lifespan, not absolute years. |
| `AgeState` | `src/sim/aging.ts` | Per-entity age accumulator stored on `entity.age`. |
| `BattleOutcome` | `src/military-campaign.ts` | How an open-field battle resolved. |
| `BattleResult` | `src/military-campaign.ts` | Result of `resolveBattle`. |
| `CalendarState` | `src/calendar.ts` | Persistent calendar state.  Advances via `stepCalendar(state, days)`. Year and dayOfYear are both 1-based. |
| `CampaignPhase` | `src/military-campaign.ts` | Phase of a military campaign. |
| `CampaignState` | `src/military-campaign.ts` | Live state of an ongoing or resolved campaign. |
| `ChargeBonus` | `src/sim/mount.ts` | Kinetic energy delivered to a target in a charge attack. |
| `ClimateEffects` | `src/climate.ts` | Advisory effect bundle derived from a climate event. Pass individual fields into the relevant downstream phase calls. All fields are [0, SCALE.Q] unless noted. |
| `ClimateEvent` | `src/climate.ts` | Immutable descriptor for a climate event. |
| `ClimateEventType` | `src/climate.ts` | Classification of climate event. |
| `CoinagePolicy` | `src/monetary.ts` | Polity monetary policy tier. |
| `ContainmentState` | `src/containment.ts` | Per-polity containment tracking state. Attach one per polity; store externally (e.g. `Map<string, ContainmentState>`). |
| `DemographicsStepResult` | `src/demography.ts` | Outcome of a single `stepPolityPopulation` call. |
| `DiseaseProfile` | `src/sim/disease.ts` | Declarative disease profile. |
| `DiseaseState` | `src/sim/disease.ts` | One active disease infection on an entity. |
| `DismountCause` | `src/sim/mount.ts` | Why a dismount was triggered. |
| `EntityDiseaseResult` | `src/sim/disease.ts` | Result returned by `stepDiseaseForEntity`. |
| `EpidemicStepResult` | `src/epidemic.ts` | Outcome of a single `stepEpidemic` call. |
| `EspionageRegistry` | `src/espionage.ts` | Registry of all deployed spy agents. |
| `ExtractionState` | `src/resources.ts` | Mutable extraction state — store one externally per deposit per polity. |
| `ExtractionStepResult` | `src/resources.ts` | Output of `stepExtraction`. |
| `Faith` | `src/faith.ts` | Definition of a named faith. |
| `FaithId` | `src/faith.ts` |  |
| `FaithRegistry` | `src/faith.ts` | Central registry: faith definitions + per-polity adherent records. |
| `FaminePhase` | `src/famine.ts` | Graduated severity of a food crisis. |
| `FaminePressures` | `src/famine.ts` | Advisory pressure bundle for downstream phases. All fields [0, SCALE.Q] unless noted. |
| `FamineState` | `src/famine.ts` | Per-polity famine tracking state. Attach one to each polity; store externally (e.g. `Map<string, FamineState>`). |
| `FeudalRegistry` | `src/feudal.ts` | Registry of all vassal bonds, keyed by `"vassalId:liegeId"`. |
| `FoodItem` | `src/sim/nutrition.ts` |  |
| `GovernanceModifiers` | `src/governance.ts` | Modifier bundle derived from a polity's governance type and enacted laws. Each field is a Q multiplier or bonus that callers pass to downstream phases. |
| `GovernanceState` | `src/governance.ts` | Per-polity governance state. Store one externally per polity. |
| `GovernanceType` | `src/governance.ts` | Governance form of a polity. |
| `GranaryState` | `src/granary.ts` | Grain reserves for one polity. Capacity is derived (not stored): `population × GRANARY_CAPACITY_DAYS`. Attach one `GranaryState` per polity; store externally (e.g., `Map<string, GranaryState>`). |
| `HarvestPhase` | `src/calendar.ts` | Agricultural phase for the current day. |
| `HazardEffect` | `src/sim/hazard.ts` | Per-second hazard effect rates. All Q fields are non-negative except `thermalDelta_Q` (negative = cooling). The host multiplies by `dt` before applying, except `thermalDelta_Q` which is a continuous ambient offset (applied as-is each tick). |
| `HazardType` | `src/sim/hazard.ts` | The five environmental threat categories. |
| `HazardZone` | `src/sim/hazard.ts` | A persistent circular hazard zone in world-space. |
| `ImmunityRecord` | `src/sim/disease.ts` | Post-recovery immunity record preventing re-infection. |
| `InfamyLabel` | `src/renown.ts` | Human-readable infamy tier, derived from `infamy_Q`. |
| `InfraProject` | `src/infrastructure.ts` | An in-progress construction project. |
| `InfraStructure` | `src/infrastructure.ts` | A completed infrastructure structure. |
| `InfraType` | `src/infrastructure.ts` | Available infrastructure types. |
| `KinshipLabel` | `src/kinship.ts` | Human-readable kinship label derived from `computeKinshipDegree`. |
| `LawCode` | `src/governance.ts` | A discrete enacted law providing targeted modifiers. |
| `LegendEntry` | `src/renown.ts` | Lightweight reference to a significant chronicle event in an entity's legend. |
| `LineageNode` | `src/kinship.ts` | A single entity's family links within the lineage graph. |
| `LineageRegistry` | `src/kinship.ts` | Registry of all lineage nodes, keyed by entityId. |
| `LoyaltyType` | `src/feudal.ts` | How the vassal bond was established — affects base strength and decay rate. |
| `MarchStepResult` | `src/military-campaign.ts` | Result of `stepCampaignMarch`. |
| `MercenaryBand` | `src/mercenaries.ts` | Immutable descriptor for a mercenary band. Create via `createMercenaryBand`; share across multiple contracts if needed. |
| `MercenaryContract` | `src/mercenaries.ts` | Live contract state for one hired band. Store externally (e.g. `Map<string, MercenaryContract>`); pass to step each tick. |
| `MercenaryStepResult` | `src/mercenaries.ts` | Outcome of a single `stepMercenaryContract` call. |
| `MigrationContext` | `src/migration.ts` | Optional per-polity context for migration resolution. Callers supply war/feudal context without this module needing to import PolityRegistry or FeudalRegistry. |
| `MigrationFlow` | `src/migration.ts` | A resolved population transfer from one polity to another. |
| `MobilizationResult` | `src/military-campaign.ts` | Result of `mobilizeCampaign`. |
| `MonetaryState` | `src/monetary.ts` | Per-polity monetary state. Store externally (e.g. `Map<string, MonetaryState>`); pass to step each tick. |
| `MountGait` | `src/sim/mount.ts` | Movement gait of the mounted pair. |
| `MountProfile` | `src/sim/mount.ts` | Species-level mount data record. |
| `MountState` | `src/sim/mount.ts` | Per-entity mount/rider pair state, stored on `entity.mount`. On the rider entity: `mountId` is set, `riderId` is 0. On the mount entity: `riderId` is set, `mountId` is 0. |
| `MountStepResult` | `src/sim/mount.ts` | Result of evaluating one mount/rider tick. |
| `NarrativeContext` | `src/narrative-prose.ts` | Context bundle for a tone-aware rendering pass. Created by `createNarrativeContext` and passed to render functions. |
| `NearbyPair` | `src/sim/disease.ts` | A carrier–target pair supplied by the host's spatial query. |
| `NPIRecord` | `src/sim/disease.ts` | An active NPI for a polity. |
| `NPIRegistry` | `src/sim/disease.ts` | Registry of active NPIs per polity. Key format: `"${polityId}:${npiType}"`. |
| `NPIType` | `src/sim/disease.ts` | Non-pharmaceutical intervention type. |
| `OperationResult` | `src/espionage.ts` | Outcome of a single operation resolution. |
| `OperationType` | `src/espionage.ts` | What the spy is trying to achieve. |
| `Polity` | `src/polity.ts` | A geopolitical entity: city, nation, or empire. Operates at 1 tick per simulated day.  All Q fields are fixed-point fractions in [0, SCALE.Q] unless documented otherwise. @stable CE-14 — fields are frozen from v0.2.0.  New fields require a minor version bump; removals or renames require a major bump and migration guide. |
| `PolityDayResult` | `src/polity.ts` |  |
| `PolityDiplomacyResult` | `src/polity.ts` |  |
| `PolityDiseaseResult` | `src/polity.ts` |  |
| `PolityEpidemicState` | `src/epidemic.ts` | Epidemic state for one disease in one polity. Attach one record per active disease; store externally (e.g. `Map<string, PolityEpidemicState[]>`). |
| `PolityFaith` | `src/faith.ts` | Presence of one faith within a polity. |
| `PolityPair` | `src/polity.ts` | A trade/proximity link between two polities in the Campaign graph. @stable CE-14 — frozen from v0.2.0. |
| `PolityRegistry` | `src/polity.ts` | Registry of all active polities and their geopolitical relationships. @stable CE-14 — frozen from v0.2.0. |
| `PolityTradeResult` | `src/polity.ts` |  |
| `PolityWarResult` | `src/polity.ts` |  |
| `ProseTone` | `src/narrative-prose.ts` | Voice tone used when rendering chronicle entries. Derived from the dominant cultural values of the originating polity. |
| `QuarantinePolicy` | `src/containment.ts` | Polity-level quarantine policy tier. |
| `RationingPolicy` | `src/famine.ts` | Polity policy for reducing per-capita food consumption below normal demand. |
| `RebellionOutcome` | `src/unrest.ts` | Possible outcomes of a rebellion resolution. |
| `RebellionResult` | `src/unrest.ts` | Result returned by `resolveRebellion`. |
| `RenownLabel` | `src/renown.ts` | Human-readable fame tier, derived from `renown_Q`. |
| `RenownRecord` | `src/renown.ts` | Accumulated reputation record for a single entity. |
| `RenownRegistry` | `src/renown.ts` | Flat registry of RenownRecords, one per entity. |
| `ResearchState` | `src/research.ts` | Per-polity research progress. Store one externally per polity. |
| `ResearchStepResult` | `src/research.ts` | Result returned by `stepResearch`. |
| `ResourceDeposit` | `src/resources.ts` | Immutable descriptor for a natural resource deposit. |
| `ResourceType` | `src/resources.ts` | Classification of natural resource. |
| `SchemaKind` | `src/schema-migration.ts` | Schema discrimination tag added by `stampSnapshot`. |
| `Season` | `src/calendar.ts` | Macro-scale season driven by `computeSeason(dayOfYear)`. |
| `SeasonalModifiers` | `src/calendar.ts` | Seasonal multipliers and offsets for subsystem integration. All Q values follow the SCALE.Q convention (q(1.0) = no change). |
| `SiegeAttrition` | `src/siege.ts` | Daily attrition rates for both sides. |
| `SiegeOutcome` | `src/siege.ts` | How the siege ended. - `"attacker_victory"` — walls breached and assault succeeded. - `"defender_holds"`   — assault repelled; walls partially repaired. - `"surrender"`        — defender ran out of supply and capitulated. |
| `SiegePhase` | `src/siege.ts` | Phase of the siege. - `"investment"` — attacker encircles; supply lines not yet fully cut; no bombardment. - `"active"`     — bombardment + starvation running in parallel. - `"resolved"`   — siege ended; `outcome` is set. |
| `SiegeState` | `src/siege.ts` | Live state of an ongoing or resolved siege. |
| `SiegeStepResult` | `src/siege.ts` | Result of advancing the siege by one day. |
| `SleepDeprivationMuls` | `src/sim/sleep.ts` | Deprivation-driven attribute multipliers (all Q). |
| `SleepPhase` | `src/sim/sleep.ts` | Current sleep phase. "awake" when the entity is not sleeping. |
| `SleepState` | `src/sim/sleep.ts` | Per-entity sleep state stored on `entity.sleep`. |
| `SpreadResult` | `src/sim/disease.ts` | Result returned by `spreadDisease`. |
| `SpyAgent` | `src/espionage.ts` | A spy deployed by one polity against another. Stored in `EspionageRegistry`, keyed by `agentId` (entity ID). |
| `SuccessionCandidate` | `src/succession.ts` | A single candidate in a succession contest. |
| `SuccessionResult` | `src/succession.ts` | Outcome of a succession resolution. |
| `SuccessionRule` | `src/succession.ts` |  |
| `SuccessionRuleType` | `src/succession.ts` | How the succession contest is resolved. |
| `TaxCollectionResult` | `src/taxation.ts` | Result returned by `stepTaxCollection`. |
| `TaxPolicy` | `src/taxation.ts` | Per-polity tax configuration. Store one externally per polity. |
| `TechDiffusionResult` | `src/tech-diffusion.ts` | Outcome of a single polity's tech advance in one day-tick. |
| `TempModifiers` | `src/sim/thermoregulation.ts` |  |
| `TradeIncome` | `src/trade-routes.ts` | Daily income produced for both polities from a single route resolution. |
| `TradeRegistry` | `src/trade-routes.ts` | Registry of all active trade routes. |
| `TradeRoute` | `src/trade-routes.ts` | A bilateral trade route between two polities. Both parties earn income each day a route is active. |
| `TransmissionOptions` | `src/sim/disease.ts` | Options for the extended `computeTransmissionRisk`. |
| `TransmissionRoute` | `src/sim/disease.ts` | Transmission route determines how distance affects spread. |
| `Treaty` | `src/diplomacy.ts` | A bilateral diplomatic agreement between two polities. Stored in `TreatyRegistry`; keyed by canonical sorted pair + type. |
| `TreatyRegistry` | `src/diplomacy.ts` | Registry of all active treaties. |
| `TreatyType` | `src/diplomacy.ts` | Category of diplomatic agreement. |
| `UnrestFactors` | `src/unrest.ts` | Pressure signals fed into `computeUnrestLevel`. All fields are Q fractions [0, SCALE.Q]; omit any that are not applicable. |
| `UnrestStepResult` | `src/unrest.ts` | Outcome of `stepUnrest` — the changes applied this step. |
| `VaccinationRecord` | `src/sim/disease.ts` | Vaccination record granting partial-efficacy protection. Stored on `entity.vaccinations?`. |
| `ValidationError` | `src/schema-migration.ts` | A single actionable validation failure. `path` uses JSONPath dot-notation, e.g. `"$.entities[2].id"`. |
| `VassalBond` | `src/feudal.ts` | A directional bond from a vassal polity to a liege polity. Stored once per directed pair (vassal → liege). |
| `VersionedSnapshot` | `src/schema-migration.ts` | Metadata fields stamped onto a persisted snapshot. Present on any object returned by `stampSnapshot`. |
| `Wonder` | `src/wonders.ts` | A completed wonder. |
| `WonderEffects` | `src/wonders.ts` | Advisory effect bundle from a wonder. Pass individual fields into the relevant downstream phase calls. All Q fields are [0, SCALE.Q]; `researchPointBonus` is raw points/day. |
| `WonderProject` | `src/wonders.ts` | In-progress wonder construction. |
| `WonderType` | `src/wonders.ts` | Classification of wonder. |

## Functions (310)

| Name | Source | Notes |
|------|--------|-------|
| `abandonRoute` | `src/trade-routes.ts` | Remove a route from the registry. Returns `true` if found and removed. |
| `activateClimateEvent` | `src/climate.ts` | Start tracking an active climate event. |
| `advanceTechEra` | `src/polity.ts` | Advance polity to the next tech era if eligible. Mutates `polity.techEra` and `polity.treasury_cu`. Refreshes `militaryStrength_Q` after advancement. Returns `true` if advancement occurred. |
| `ageSusceptibility_Q` | `src/sim/disease.ts` | Age-stratified susceptibility multiplier [Q]. Returns a value that may exceed SCALE.Q (increased susceptibility) or fall below it (relative protection).  Applied in `computeTransmissionRisk` when `target.age` is set. | Age range | Multiplier | Notes                         | |-----------|-----------|-------------------------------| | 0–4 yrs   | ×1.30     | High infant susceptibility    | | 5–14 yrs  | ×0.80     | Children — lower risk         | | 15–59 yrs | ×1.00     | Adult baseline                | | 60–74 yrs | ×1.20     | Early elderly                 | | 75 + yrs  | ×1.50     | Late elderly / ancient        | |
| `aggregateClimateEffects` | `src/climate.ts` | Combine effects from multiple simultaneous active events (e.g. drought + locust). Each field is summed and clamped to SCALE.Q. |
| `aggregateWonderEffects` | `src/wonders.ts` | Aggregate effects from multiple wonders. Q fields are summed and clamped to SCALE.Q. `researchPointBonus` is summed without capping. |
| `applyAgingToAttributes` | `src/sim/aging.ts` | Apply age multipliers to a base attribute set, returning a new object. The input `base` is treated as the archetype peak (typically from `generateIndividual`). The caller is responsible for caching the base and recomputing aged attributes when age advances (e.g. once per in-game month for campaign simulation). Attributes affected: - morphology.stature_m - performance.peakForce_N, peakPower_W, continuousPower_W - control.reactionTime_s, controlQuality, stability, fineControl - resilience.distressTolerance - cognition (if present): fluid dims + crystal dims scaled independently All Q outputs are clamped to [0, SCALE.Q]; reactionTime_s is clamped to ≥ 1. @param base          Archetype-peak attributes (unmodified). @param ageYears      Current age in years. @param lifespanYears Expected lifespan (default: HUMAN_LIFESPAN_YEARS). |
| `applyBattleConsequences` | `src/military-campaign.ts` |  |
| `applyDailyTrade` | `src/trade-routes.ts` | Apply one day of trade: add computed income to both polity treasuries. Mutates both polity objects. Returns the `TradeIncome` applied (both zero if route not viable). |
| `applyDailyTribute` | `src/feudal.ts` | Apply one day of tribute: deduct from vassal treasury and add to liege treasury. Mutates both polity objects. No-op if computed tribute is 0. |
| `applyMigrationFlows` | `src/migration.ts` | Apply a list of migration flows to the polity registry. Mutates `population` on both sending and receiving polities. The actual population moved is clamped to the sender's current population to prevent negative populations. Unknown polity IDs in a flow are silently skipped. |
| `applyNPI` | `src/sim/disease.ts` | Activate an NPI for a polity. `"mask_mandate"` — reduces airborne transmission in `computeTransmissionRisk` by `NPI_MASK_REDUCTION_Q` when the caller passes `options.maskMandate = true`. `"quarantine"` — recorded in the registry; the host is responsible for halving the contact-range pairs passed to `spreadDisease` (spatial filtering). |
| `applyQuarantineToContact` | `src/containment.ts` | Scale down a Phase-88 `contactIntensity_Q` by the effective quarantine reduction. Pass the returned value to `spreadEpidemic` or `computeSpreadToPolity`: ```ts const adjContact = applyQuarantineToContact(tradeIntensity_Q, containmentState); computeSpreadToPolity(source, profile, adjContact); ``` |
| `applySeasonalDiseaseMul` | `src/calendar.ts` | Compute the effective disease transmission rate multiplier for a given base rate, applying the seasonal modifier. Result is clamped to [0, SCALE.Q × 2] (allows doubling but prevents runaway). @param baseRate_Q     Disease baseTransmissionRate_Q from DiseaseProfile. @param modifiers      Seasonal modifiers. |
| `applySeasonalHarvest` | `src/calendar.ts` | Compute the treasury income for one simulated day, scaled by the seasonal harvest yield. @param polity           Current polity (provides treasury_cu as economic base). @param modifiers        Seasonal modifiers for this day. @param baseDailyIncome  Base income in cost-units per day (host-defined). @returns                Integer cost-unit gain for this day (≥ 0). |
| `applySleepToAttributes` | `src/sim/sleep.ts` | Apply sleep-deprivation multipliers to a base attribute set, returning a new object. Attributes affected: - control.reactionTime_s, stability - resilience.distressTolerance - cognition (if present): fluid dimensions (logical, spatial, kinesthetic, musical) Immutable — does not mutate `base`. Pattern matches `applyAgingToAttributes` (Phase 57). |
| `applySuccessionToPolity` | `src/succession.ts` | Apply a succession result to a polity. Adjusts `stabilityQ` by `result.stabilityImpact_Q`. Does NOT change the ruler field (Polity has no rulerId); callers update faction leadership separately if needed. |
| `applyVictoryLoyaltyBonus` | `src/mercenaries.ts` | Apply a loyalty bonus after a campaign victory. Clamps result to SCALE.Q. |
| `areAtWar` | `src/polity.ts` | Return true if two polities are currently at war. |
| `areInAnyTreaty` | `src/diplomacy.ts` | Return `true` if the two polities have at least one active treaty of any type. |
| `assignWorkers` | `src/resources.ts` | Assign workers to a deposit. Clamps to `[0, deposit.maxWorkers]`. Returns the effective worker count after clamping. |
| `breakTreaty` | `src/diplomacy.ts` | Break a treaty and remove it from the registry. Adds `TREATY_BREAK_INFAMY[type]` to `breakerRulerId`'s renown record if `breakerRulerId` and `renownRegistry` are provided. @returns `true` if a treaty was found and removed; `false` otherwise. |
| `breakVassalBond` | `src/feudal.ts` | Break a vassal bond and remove it from the registry. For `oath_sworn` bonds, adds `OATH_BREAK_INFAMY_Q` to the vassal ruler's renown record if `vassalRulerId` and `renownRegistry` are provided. @returns `true` if a bond was found and removed; `false` otherwise. |
| `canAdvanceTech` | `src/polity.ts` | Return true if the polity meets the conditions to advance to the next tech era. Requires: 1. A research project has been completed (`projectCompleted = true`). 2. Treasury meets the advancement cost for the current era. 3. Not already at maximum era (DeepSpace, index 8). |
| `changeGovernance` | `src/governance.ts` | Change the governance type of a polity. Applies `GOVERNANCE_CHANGE_STABILITY_HIT_Q` to `polity.stabilityQ` and sets `state.changeCooldown = GOVERNANCE_CHANGE_COOLDOWN_DAYS`. Returns `false` (no-op) if: - `newType` is the same as current type. - `state.changeCooldown > 0` (still cooling down). |
| `changeQuarantinePolicy` | `src/containment.ts` | Change the active quarantine policy. Resets `daysActive` and `complianceDecay_Q` — a policy change resets the population's compliance posture (initial goodwill or fear of the new measure). |
| `checkMountStep` | `src/sim/mount.ts` | Evaluate a single mounted-combat tick, returning dismount and fear outcomes. Does NOT mutate any entity — pure computation for the host to apply. Dismount priority: rider_shock > mount_dead > mount_bolt. @param riderShockQ   Rider's current shockQ [Q]. @param mountShockQ   Mount's current shockQ [Q]. @param mountDead     True if the mount has died this tick. @param profile       Mount species profile. @param riderMass_Skg Rider's mass [SCALE.kg] — used for fall energy. |
| `circadianAlertness` | `src/sim/sleep.ts` | Circadian alertness at a given time of day. @param hourOfDay  Float in [0, 24). Values outside this range are normalised. @returns Q in [q(0.30), q(1.0)]: q(1.0) at ~17:00, q(0.30) at ~03:00. |
| `completeProject` | `src/infrastructure.ts` | Convert a completed project into a permanent structure. Returns `undefined` if the project is not yet complete. |
| `completeWonder` | `src/wonders.ts` | Finalise a completed project into a standing `Wonder`. The caller is responsible for checking `isWonderProjectComplete` first. |
| `computeAgeFrac` | `src/sim/aging.ts` | Compute normalized age fraction [0..SCALE.Q] for a given age and lifespan. A 25-year-old human (lifespan 80) → q(0.3125). A 187-year-old elf (lifespan 600) → q(0.312) — effectively the same developmental stage. @param ageYears      Current age in years. @param lifespanYears Expected lifespan (default: HUMAN_LIFESPAN_YEARS). |
| `computeAnnualTaxRevenue` | `src/taxation.ts` | Compute annual tax revenue for a polity [cost-units/year]. Formula: taxablePopulation = population × (SCALE.Q − exemptFraction) / SCALE.Q perCapita         = TAX_REVENUE_PER_CAPITA_ANNUAL[techEra]  (default 0) stabilityMul      = SCALE.Q/2 + mulDiv(SCALE.Q/2, stabilityQ, SCALE.Q) ∈ [5000, 10000] = [q(0.50), q(1.00)] gross             = taxablePopulation × perCapita × taxRate / SCALE.Q annual            = round(gross × stabilityMul / SCALE.Q) Stability models collection efficiency: a fractured polity cannot collect the full assessed tax.  At zero stability, only half the theoretical revenue is gathered. |
| `computeAnnualTradeVolume` | `src/trade-routes.ts` | Compute the total annual trade volume flowing through all viable routes for a given polity (sum of `baseVolume_cu × efficiency_Q / SCALE.Q`). Useful for AI and diplomatic valuation. |
| `computeApothecaryHealthBonus` | `src/infrastructure.ts` | Health capacity bonus from apothecaries [0, SCALE.Q]. Add to `deriveHealthCapacity(polity)` result in Phase-88. |
| `computeArmySize` | `src/military-campaign.ts` | Compute army size for a given mobilization fraction [soldiers]. Clamped to `[0, floor(population × MAX_MOBILIZATION_Q / SCALE.Q)]`. |
| `computeBattleStrength` | `src/military-campaign.ts` | Compute battle strength for a polity with a given army size [Q]. Formula: soldierMul    = TECH_SOLDIER_MUL[techEra]  (default q(0.80)) stabilityMul  = q(0.50) + mulDiv(q(0.50), stabilityQ, SCALE.Q)  ∈ [q(0.50), q(1.00)] rawStrength   = round(militaryStrength_Q × armySize / REFERENCE_ARMY_SIZE) adjusted      = round(rawStrength × soldierMul / SCALE.Q) final         = clampQ(round(adjusted × stabilityMul / SCALE.Q), 0, SCALE.Q) @param armySize  Number of soldiers (capped at population for safety). |
| `computeBirthRate` | `src/demography.ts` | Compute the effective annual birth rate for a polity [Q = fraction/year]. Morale scales birth rate linearly between 50% and 150% of baseline: moraleQ = 0        → BASELINE × 0.50  (≈ 1.75%/year) moraleQ = SCALE.Q  → BASELINE × 1.50  (≈ 5.25%/year) |
| `computeBMR` | `src/sim/nutrition.ts` | Compute Basal Metabolic Rate in watts (integer) using Kleiber's law. mass_kg must be in SCALE.kg units (e.g. 75 000 for 75 kg). |
| `computeCapacity` | `src/granary.ts` | Maximum grain the polity can store [supply units]. Scales with current population — a growing polity can store more. |
| `computeCarryingCapacity` | `src/demography.ts` | Soft carrying capacity for a polity based on tech era. `stepPolityPopulation` does not enforce this cap.  The host should call `isOverCapacity` after each step and pass additional emigration pressure to Phase-81 when it returns `true`. |
| `computeChargeBonus` | `src/sim/mount.ts` | Compute the bonus kinetic energy delivered to a target during a mounted charge. Only `CHARGE_MASS_FRAC` (8%) of the mount's mass participates in the impact; the remainder is absorbed through the mount's body. `bonusEnergy_J = ½ × strikeMass × v²`  (SI, result in joules) @param speed_Smps  Current charge speed [SCALE.mps]. |
| `computeClimateEffects` | `src/climate.ts` | Compute the `ClimateEffects` bundle for a given event at its current severity. Each field = `round(BASE_EFFECTS[type][field] × severity_Q / SCALE.Q)`. Returns a zero bundle if `active.remainingDays <= 0`. |
| `computeContainmentCost_cu` | `src/containment.ts` | Compute the daily treasury cost of the active quarantine policy. `cost = DAILY_COST_PER_1000 × population / 1000 × elapsedDays` |
| `computeContainmentHealthBonus` | `src/containment.ts` | Compute the health capacity bonus from active quarantine [0, SCALE.Q]. Add to the output of Phase-88 `deriveHealthCapacity(polity)`. The bonus also decays with compliance. |
| `computeContainmentUnrest` | `src/containment.ts` | Compute the unrest pressure from the current quarantine policy [0, SCALE.Q]. Unrest grows as compliance erodes — a partially-enforced lockdown is more resented than a fresh voluntary advisory. `unrest = baseUnrest + decayFraction × baseUnrest / SCALE.Q` |
| `computeConversionPressure` | `src/faith.ts` | Compute the daily conversion pressure exerted on a target polity by a source faith's missionaries. Formula: pressure = fervor_Q × missionaryPresence_Q × CONVERSION_BASE_RATE_Q / SCALE.Q² Returns 0 if the faith is not registered. @param missionaryPresence_Q  Strength of missionary activity [0, SCALE.Q]. Callers may derive this from Phase-82 agent presence or Phase-83 trade route volume. |
| `computeCounterIntelligence` | `src/espionage.ts` |  |
| `computeDailyResearchPoints` | `src/research.ts` | Compute the daily research rate for a polity [integer points/day]. Formula: baseUnits = max(1, floor(population / RESEARCH_POP_DIVISOR)) stabilityFactor = SCALE.Q/2 + mulDiv(SCALE.Q/2, stabilityQ, SCALE.Q) ∈ [q(0.50), q(1.00)] = [5000, 10000] dailyPoints = max(1, round(baseUnits × stabilityFactor / SCALE.Q)) @param bonusPoints  Additional flat bonus points per day (e.g., from knowledge diffusion or Phase-89 infrastructure). |
| `computeDailyTaxRevenue` | `src/taxation.ts` | Compute daily tax revenue [cost-units/day]. Derived from `computeAnnualTaxRevenue` with day-fraction rounding. |
| `computeDailyTradeIncome` | `src/trade-routes.ts` | Compute the daily trade income for both polities from one route. Formula: base = floor(baseVolume_cu × efficiency_Q / SCALE.Q / TRADE_DAYS_PER_YEAR) bonus multiplier = SCALE.Q + (hasTradePact ? TREATY_TRADE_BONUS_Q : 0) seasonal multiplier = seasonalMul_Q (default SCALE.Q = no modification) income = floor(base × bonusMul / SCALE.Q × seasonalMul / SCALE.Q) Returns `{ incomeA_cu: 0, incomeB_cu: 0 }` if the route is not viable. @param hasTradePact  True if a Phase-80 trade_pact treaty is active between the pair. @param seasonalMul_Q Phase-78 seasonal modifier (default SCALE.Q = no change). |
| `computeDailyTribute` | `src/feudal.ts` | Compute the tribute owed for one simulated day. Scales linearly: `daily = floor(treasury_cu × tributeRate_Q / SCALE.Q / DAYS_PER_YEAR)`. Returns 0 if the vassal treasury is empty. |
| `computeDailyUpkeep` | `src/military-campaign.ts` | Compute daily treasury upkeep for an active campaign [cost-units/day]. |
| `computeDailyYield` | `src/resources.ts` | Compute the daily extraction yield [cost-units/day]. Formula: techMul       = TECH_EXTRACTION_MUL[techEra]  (default q(0.60)) richnessScale = RICHNESS_FLOOR_Q + mulDiv(SCALE.Q - RICHNESS_FLOOR_Q, richness_Q, SCALE.Q) ∈ [q(0.50), q(1.00)] base          = workers × BASE_YIELD_PER_WORKER[type] daily         = max(0, round(base × techMul / SCALE.Q × richnessScale / SCALE.Q)) Returns 0 if the deposit is exhausted or no workers assigned. |
| `computeDeathRate` | `src/demography.ts` | Compute the effective annual death rate for a polity [Q = fraction/year]. Factors (additive): 1. Baseline reduced by tech era (better medicine / nutrition). 2. Instability bonus: up to `INSTABILITY_DEATH_ANNUAL_Q` at stability = 0. 3. External death pressure (caller: Phase-56 epidemic or Phase-84 siege casualties). 4. Famine bonus: `FAMINE_DEATH_ANNUAL_Q` when `foodSupply_Q < FAMINE_THRESHOLD_Q`. @param deathPressure_Q  Annual mortality fraction from external cause. @param foodSupply_Q     Current food supply [0, SCALE.Q]; omit if unknown. |
| `computeDebasementGain_cu` | `src/monetary.ts` | Compute the extra treasury that would be minted by a debasement step without mutating state.  Advisory / preview function. |
| `computeDiffusionPressure` | `src/tech-diffusion.ts` | Compute the daily diffusion pressure (probability of era advance) that the `source` polity exerts on the `target` via one `pair`. Returns q(0) when: - `source.techEra <= target.techEra`  (no gradient) - `target.stabilityQ < STABILITY_DIFFUSION_THRESHOLD` (target is unstable) - `warActive === true` (war disrupts cultural contact) Otherwise returns a Q in (0, SCALE.Q] representing the per-day probability of the target advancing one era.  The caller rolls against this value. |
| `computeDiplomaticPrestige` | `src/diplomacy.ts` | Compute the diplomatic prestige of a polity as the sum of `strength_Q` of all its active treaties, normalised to [0, SCALE.Q]. Hosts should pass only non-expired treaties; this function does no expiry filtering. |
| `computeDistToHazard` | `src/sim/hazard.ts` | Euclidean distance from a world position to the hazard centre [SCALE.m]. Uses float sqrt for a one-time calculation; result is truncated to integer. |
| `computeEffectiveTransmissionReduction` | `src/containment.ts` | Compute the effective transmission reduction fraction [0, SCALE.Q], factoring in accumulated compliance decay. `effective = baseReduction × (SCALE.Q − complianceDecay_Q) / SCALE.Q` |
| `computeEpidemicDeathPressure` | `src/epidemic.ts` | Compute annual death pressure [Q = fraction/year] from an active epidemic. Formula: `prevalence_Q × mortalityRate_Q / SCALE.Q` Pass the result as `deathPressure_Q` to Phase-86 `stepPolityPopulation`. |
| `computeEpidemicMigrationPush` | `src/epidemic.ts` | Compute epidemic-driven migration push pressure [0, SCALE.Q]. Pressure scales with both prevalence and symptom severity. Only fires when `profile.symptomSeverity_Q >= EPIDEMIC_SEVERITY_THRESHOLD_Q`. Formula: `prevalence × severity × MIGRATION_PUSH_MAX / SCALE.Q²` Add the result to Phase-81 `computePushPressure` output. |
| `computeFaithDiplomaticModifier` | `src/faith.ts` | Compute a signed Q diplomatic modifier from faith compatibility. - Shared dominant faith → `+FAITH_DIPLOMATIC_BONUS_Q`. - Both polities have exclusive dominant faiths that differ → `−FAITH_DIPLOMATIC_PENALTY_Q`. - Otherwise (syncretic or no dominant faith) → `0`. Hosts add this to treaty strength or faction standing adjustments. |
| `computeFallEnergy_J` | `src/sim/mount.ts` | Compute the fall injury energy when a rider is dismounted from height. Models a free-fall from the rider's seat height: fallEnergy_J = riderMass × g × height @param riderMass_Skg  Rider's mass [SCALE.kg]. |
| `computeFamineMigrationPush` | `src/demography.ts` | Compute famine-driven migration push pressure [0, SCALE.Q]. Zero at or above `FAMINE_THRESHOLD_Q`.  Scales linearly from zero (at the threshold) to `FAMINE_MIGRATION_PUSH_Q` (at food = 0). Add the result to Phase-81 `computePushPressure` output. |
| `computeFaminePhase` | `src/famine.ts` | Classify the current famine phase from the granary food supply fraction. Obtain `foodSupply_Q` from Phase-87 `computeFoodSupply_Q(polity, granary)`. |
| `computeFaminePressures` | `src/famine.ts` | Compute the advisory pressure bundle for the current famine state and rationing policy. `unrestPressure_Q` sums famine unrest with rationing unrest, clamped to SCALE.Q. |
| `computeFoodSupply_Q` | `src/granary.ts` | Convert grain reserves to a [0, SCALE.Q] food supply fraction. This is the `foodSupply_Q` input for Phase-86 `stepPolityPopulation`: - q(1.0) = full granary (no famine) - below Phase-86 `FAMINE_THRESHOLD_Q = q(0.20)` → famine active Returns 0 when population is zero (prevents division by zero). |
| `computeGovernanceModifiers` | `src/governance.ts` | Compute the aggregate `GovernanceModifiers` for the given state plus active laws. Each law's bonuses are added on top of the governance baseline. `taxEfficiencyMul_Q` is clamped to SCALE.Q; others to [0, SCALE.Q]. @param lawRegistry  Map of lawId → LawCode.  Pass only enacted laws. |
| `computeGranaryCapacityBonus` | `src/infrastructure.ts` | Granary capacity multiplier bonus [0, SCALE.Q]. Effective capacity = `baseCapacity × (SCALE.Q + bonus) / SCALE.Q`. |
| `computeHarvestPhase` | `src/calendar.ts` | Derive the current `HarvestPhase` from `dayOfYear`. |
| `computeHarvestYield` | `src/granary.ts` | Compute the grain added by one harvest [supply units]. `yield_su = round(population × HARVEST_BASE_SU_PER_CAPITA × yieldFactor_Q / SCALE.Q)` @param yieldFactor_Q  Override factor; defaults to `deriveHarvestYieldFactor(polity)`. |
| `computeHazardExposure` | `src/sim/hazard.ts` | Compute the exposure intensity at a given distance from the hazard centre. Linear falloff:  `exposure = (radius − dist) × intensity / radius` Returns `q(0)` when `dist >= radius`. @param dist_Sm  Distance from hazard centre [SCALE.m]. |
| `computeHeresyRisk` | `src/faith.ts` | Compute the heresy risk in a polity [0, SCALE.Q]. Risk is non-zero when: - The dominant faith is exclusive and has low tolerance. - A minority exclusive faith exceeds `HERESY_THRESHOLD_Q`. Formula: `(minorityPresence - HERESY_THRESHOLD) × (SCALE.Q - tolerance) / SCALE.Q` summed over all qualifying minority faiths. |
| `computeInfraBonus` | `src/infrastructure.ts` | Compute the total Q bonus from all structures of a given type at a polity. Sums `BONUS_PER_LEVEL × level` across all matching structures. Clamped to [0, SCALE.Q]. |
| `computeInheritedRenown` | `src/kinship.ts` | Compute the renown bonus an entity inherits from their ancestors. For each ancestor at depth d, contribution = `ancestor.renown_Q × decay^d` where `decay = RENOWN_DEPTH_DECAY_Q / SCALE.Q` (default 0.5 per generation). The sum is clamped to `[0, SCALE.Q]`. Entities with no renown records or no ancestors return 0. @param registry       Lineage registry. @param entityId       Entity whose ancestors are being summed. @param renownRegistry Phase 75 renown registry. @param maxDepth       How many generations to look back (default 3). |
| `computeKinshipDegree` | `src/kinship.ts` | Compute the degree of kinship between two entities via BFS on the undirected family graph (parents, children, and partners are all degree-1 neighbours). Returns: - `0` if `entityA === entityB` - `1`–`MAX_KINSHIP_DEPTH` for kin within range - `null` if no path exists within `MAX_KINSHIP_DEPTH` |
| `computeKnowledgeDiffusion` | `src/research.ts` | Compute daily knowledge diffusion bonus that a source polity grants to a less-advanced target polity through trade or diplomatic contact. Diffusion fires only when `sourcePolity.techEra > targetPolity.techEra`. Formula: `round(sourceDaily × eraDiff × DIFFUSION_RATE × contactIntensity / SCALE.Q²)` @param contactIntensity_Q  Trade or diplomatic contact [0, SCALE.Q]. Derive from Phase-83 route efficiency or Phase-80 treaty strength. |
| `computeLevyStrength` | `src/feudal.ts` | Compute the military strength available to the liege as a levy. = `vassal.militaryStrength_Q × levyRate_Q × bond.strength_Q`. A weakened bond reduces the effective levy. |
| `computeMarketplaceIncome` | `src/infrastructure.ts` | Daily treasury income from marketplaces [cost units]. `income = treasury_cu × MARKETPLACE_BONUS / SCALE.Q` |
| `computeMercenaryStrengthContribution` | `src/mercenaries.ts` | Compute the military strength contribution of a hired band [0, SCALE.Q]. Formula: `round(size × quality_Q × loyalty_Q / SCALE.Q²)`, clamped to `MAX_MERC_STRENGTH_BONUS_Q`. Add the result to Phase-93 `computeBattleStrength` output. At full quality and full loyalty: ~q(0.05) per 500 soldiers; caps at q(0.30). |
| `computeMercenaryWage` | `src/mercenaries.ts` | Compute total wages due for `elapsedDays` days. `wage = band.size × band.dailyWagePerSoldier_cu × elapsedDays` |
| `computeMigrationFlow` | `src/migration.ts` | Compute the number of people that would migrate from `from` to `to` in one simulated day, given pre-computed push and pull values. Formula (integer arithmetic throughout): combined_Q = push_Q × pull_Q / SCALE.Q scaledPop  = population × combined_Q / SCALE.Q flow       = floor(scaledPop × DAILY_RATE_Q / SCALE.Q) Returns 0 if push < `MIGRATION_PUSH_MIN_Q`, pull ≤ 0, or from.population ≤ 0. |
| `computeMonetaryTradeMultiplier_Q` | `src/monetary.ts` | Compute the trade acceptance multiplier [MONETARY_TRADE_FLOOR_Q, SCALE.Q]. Foreign trade partners check coin purity: `multiplier = TRADE_FLOOR + mulDiv(SCALE.Q − TRADE_FLOOR, coinPurity_Q, SCALE.Q)` Pass as a multiplier on Phase-92 trade income. |
| `computeMonetaryUnrest_Q` | `src/monetary.ts` | Compute unrest pressure from inflation [0, MONETARY_MAX_UNREST_Q]. `unrest = mulDiv(MONETARY_MAX_UNREST_Q, inflationLevel_Q, SCALE.Q)` Pass to Phase-90 `computeUnrestLevel`. |
| `computeNetGrowthRate` | `src/demography.ts` | Compute the net annual growth rate (birth rate − death rate). Negative values indicate population decline. |
| `computeNewCoreQ` | `src/sim/thermoregulation.ts` | Compute the new core temperature Q value given explicit parameters (no entity mutation). Used by stepCoreTemp and by the downtime simulator (which does not hold an entity reference). Note: floating-point accumulation is intentional — sub-unit Q fractions accumulate correctly across successive calls since Q is stored as `number` (JS float). |
| `computePolityDiseaseSpread` | `src/polity.ts` | Compute population-scale disease spread for one simulated day. Only `"airborne"` diseases spread at polity scale; other routes remain entity-to-entity (handled by Phase 56 `spreadDisease`). Spread activates when population density (`population / locationIds.length`) exceeds DENSITY_SPREAD_THRESHOLD. Mutates `polity.population` by `populationDelta` (negative = deaths). Returns zeros when conditions are not met. |
| `computePullFactor` | `src/migration.ts` | Compute the pull factor of a polity — how attractive it is as a destination. Pull = `stabilityQ × moraleQ / SCALE.Q` — both must be high to attract migrants. Returns a Q in [0, SCALE.Q]. |
| `computePurchasingPower_Q` | `src/monetary.ts` | Compute the effective purchasing power of treasury coins [0, SCALE.Q]. `purchasingPower = coinPurity_Q × (SCALE.Q − inflationLevel_Q) / SCALE.Q` Use to scale the real value of treasury income, mercenary wages, and construction costs.  Returns q(0.05) minimum to avoid zero. |
| `computePushPressure` | `src/migration.ts` | Compute the push pressure of a polity — how strongly it repels its own population. Returns a Q in [0, SCALE.Q]. @param polity           Source polity. @param isAtWar          True if the polity has any active war (Phase 61). @param lowestBondStr_Q  Weakest feudal bond as vassal, or SCALE.Q if not a vassal (Phase 79). |
| `computeR0` | `src/sim/disease.ts` | Estimate the basic reproductive number R0 for a disease profile. Formula: R0 = beta × D × c - beta = baseTransmissionRate_Q / SCALE.Q (per-contact daily probability) - D    = symptomaticDuration_s / 86400 (infectious period in days) - c    = min(DAILY_CONTACTS_ESTIMATE, entityMap.size − 1) (daily contacts) Used for validation — not a simulation path value. @param profile    Disease profile to evaluate. @param entityMap  Population map (size determines contact estimate). @returns          Estimated R0 (float; not fixed-point). |
| `computeRationedConsumption` | `src/famine.ts` | Compute food demand in supply units after applying the rationing reduction. Normal demand = `polity.population × elapsedDays` su. `RATIONING_REDUCTION_Q[policy]` fraction is subtracted before multiplication. |
| `computeReliefImport` | `src/famine.ts` | Spend treasury to import emergency food. Converts up to `budget_cu` of `polity.treasury_cu` into grain at `RELIEF_IMPORT_COST_CU_PER_SU` cu/su, limited by remaining granary space. Mutates `polity.treasury_cu` and `granary.grain_su`. Returns the actual supply units added. @param budget_cu       Max treasury to spend (e.g. pass `polity.treasury_cu` for all-in). @param capacityCap_su  Max granary capacity; derive via Phase-87 `computeCapacity(polity)`. |
| `computeRepairCost` | `src/wonders.ts` | Compute treasury cost to repair a damaged wonder [cu]. |
| `computeRequiredTaxRate` | `src/taxation.ts` | Compute the effective tax rate needed to hit a desired annual revenue, clamped to [0, MAX_TAX_RATE_Q]. Useful for host AI: "what rate do I need to fund X?" Returns MAX_TAX_RATE_Q if the desired revenue exceeds what full taxation can provide. |
| `computeResearchProgress_Q` | `src/research.ts` | Return current research progress as a Q fraction [0, SCALE.Q] toward the next era. Returns `SCALE.Q` at max era (DeepSpace). |
| `computeRoadTradeBonus` | `src/infrastructure.ts` | Trade route efficiency bonus from roads [0, SCALE.Q]. Add to route `efficiency_Q` when calling Phase-83 `computeDailyTradeIncome`. |
| `computeSeason` | `src/calendar.ts` | Derive the current `Season` from `dayOfYear` (1–365). |
| `computeSiegeAttrition` | `src/siege.ts` | Compute daily attrition fractions for both sides in the current phase. - Investment: minimal skirmishing losses. - Active: attacker takes defensive fire; defender takes bombardment damage. - Resolved: no attrition. |
| `computeSpreadToPolity` | `src/epidemic.ts` | Compute the prevalence increase introduced into a target polity from a source. The `contactIntensity_Q` captures how connected the polities are: - Trade route efficiency or volume → high contact - Migration flow fraction → moderate contact - No trade/migration → zero Formula: `sourcePrevalence × contactIntensity × transmissionRate / SCALE.Q²` Returns 0 if the source epidemic is contained. |
| `computeTaxUnrestPressure` | `src/taxation.ts` | Compute the unrest pressure generated by the current tax rate [Q]. - At or below `OPTIMAL_TAX_RATE_Q`: pressure = 0. - Between OPTIMAL and MAX_TAX_RATE_Q: linear ramp 0 → MAX_TAX_UNREST_Q. - At or above MAX_TAX_RATE_Q: pressure = MAX_TAX_UNREST_Q. Pass the result as an extra additive unrest factor to Phase-90 `computeUnrestLevel`. |
| `computeTotalDailyResourceIncome` | `src/resources.ts` | Estimate daily bonus income from resource extraction across multiple deposits. Useful for treasury planning alongside Phase-92 tax revenue. |
| `computeTradeIncome` | `src/polity.ts` | Compute the daily trade income credited to each polity. Both polities receive the same `incomeEach_cu`.  Scales with: - min(treasury): limited by the poorer partner - routeQuality_Q: navigator skill (Phase 38 `logicalMathematical`) - lower tech era of the pair: advanced goods multiply trade value - sharedLocations: more border crossings → more trade routes Returns 0 when either treasury is empty or `sharedLocations <= 0`. |
| `computeTransmissionRisk` | `src/sim/disease.ts` | Compute the transmission risk Q from a symptomatic carrier to a target. Airborne: risk scales linearly from `baseTransmissionRate_Q` at dist 0 to 0 at `airborneRange_Sm`.  Beyond range → q(0). Contact / vector / waterborne: full `baseTransmissionRate_Q` if within `CONTACT_RANGE_Sm`; q(0) beyond. Returns q(0) if the carrier has no symptomatic instance of this disease, or if target already has immunity / active infection for this disease. **Phase 73 extensions (backward-compatible):** - If `target.age` is set, applies age-stratified susceptibility multiplier. - If `target.vaccinations` contains a record for this disease, reduces risk by efficacy. - If `options.maskMandate` is true and disease is airborne, reduces risk by `NPI_MASK_REDUCTION_Q`. @param carrier    The potentially infectious entity. @param target     The potentially susceptible entity. @param dist_Sm    Distance between them [SCALE.m]. @param disease    The disease profile to evaluate. @param options    Phase 73 optional NPI modifiers. |
| `computeUnrestLevel` | `src/unrest.ts` | Compute the composite unrest level [0, SCALE.Q] for a polity. Unrest is the weighted sum of: - Low morale   (`(SCALE.Q - moraleQ)    × MORALE_WEIGHT`) - Low stability (`(SCALE.Q - stabilityQ) × STABILITY_WEIGHT`) - Famine pressure  × FAMINE_WEIGHT - Epidemic pressure × EPIDEMIC_WEIGHT - Heresy risk      × HERESY_WEIGHT - Feudal deficit   × FEUDAL_WEIGHT  (`SCALE.Q − weakestBond_Q`) All inputs are optional; omitted factors contribute zero. |
| `computeWallSiegeBonus` | `src/infrastructure.ts` | Siege defence bonus from walls [0, SCALE.Q]. Subtract from attacker's effective `siegeStrength_Q` in Phase-84. |
| `computeWarUnrestPressure` | `src/military-campaign.ts` | Return the war unrest pressure on the attacker polity during an active campaign. Pass as an extra factor into Phase-90 `computeUnrestLevel`. Returns 0 when campaign is resolved. |
| `computeWonderEffects` | `src/wonders.ts` | Compute the `WonderEffects` advisory bundle for a single wonder. Damaged wonders: each numeric field is scaled by `WONDER_DAMAGED_EFFECT_MUL / SCALE.Q`. |
| `consumeFood` | `src/sim/nutrition.ts` | Consume a food item from the entity's optional food inventory. Returns `false` if the food ID is unknown, or if the entity has a `foodInventory: Map<string, number>` that does not contain the item. When no inventory is present (undefined), consumption is unconditional. Side effects: - caloricBalance_J   += food.energy_J - hydrationBalance_J += food.hydration_J (if any) - lastMealTick        = tick - injury.fluidLoss   reduced by scale(hydration_J)  [for water_flask] - hungerState         re-derived |
| `contributeToWonder` | `src/wonders.ts` | Invest treasury into a wonder project. Deducts up to `contribution_cu` from `polity.treasury_cu` (capped by available treasury and remaining cost), advances `progress_Q`, and returns the new progress. Does not auto-complete — call `isWonderProjectComplete` then `completeWonder`. |
| `createCalendar` | `src/calendar.ts` | Create a new `CalendarState` at the given year and day. Defaults to year 1, day 1 (first day of winter). |
| `createCampaign` | `src/military-campaign.ts` | Create a new campaign in `"mobilization"` phase. |
| `createClimateEvent` | `src/climate.ts` | Create a `ClimateEvent` with explicit parameters. |
| `createContainmentState` | `src/containment.ts` | Create a `ContainmentState` with no active quarantine policy. |
| `createDeposit` | `src/resources.ts` | Create a new `ResourceDeposit`. |
| `createEpidemicState` | `src/epidemic.ts` | Create a new epidemic state for a polity. |
| `createEspionageRegistry` | `src/espionage.ts` |  |
| `createExtractionState` | `src/resources.ts` | Create a fresh `ExtractionState` with no workers assigned. |
| `createFaithRegistry` | `src/faith.ts` |  |
| `createFamineState` | `src/famine.ts` | Create a fresh `FamineState` for a polity (no active famine, zero severity). |
| `createFeudalRegistry` | `src/feudal.ts` |  |
| `createGovernanceState` | `src/governance.ts` | Create a fresh `GovernanceState` with no laws and no cooldown. |
| `createGranary` | `src/granary.ts` | Create a new `GranaryState` for a polity. Initial reserves default to one year of consumption (stable starting point). |
| `createInfraProject` | `src/infrastructure.ts` | Start a new construction project. Returns the project record (not yet complete). |
| `createInfraStructure` | `src/infrastructure.ts` | Create a completed structure directly (e.g., at world initialisation). |
| `createLineageRegistry` | `src/kinship.ts` |  |
| `createMercenaryBand` | `src/mercenaries.ts` | Create a `MercenaryBand` descriptor. |
| `createMonetaryState` | `src/monetary.ts` | Create a fresh `MonetaryState` with full purity and zero inflation. |
| `createNarrativeContext` | `src/narrative-prose.ts` | Create a `NarrativeContext` for a rendering pass. @param entityNames  Map of entity id → display name (numeric ids are looked up here). @param culture      Optional culture profile — used to derive tone automatically. @param myth         Optional myth — used to append archetype-framing suffix. |
| `createPolity` | `src/polity.ts` | Create a Polity with derived `militaryStrength_Q`. Default starting stability and morale represent a stable, reasonably content polity (stability q(0.70), morale q(0.65)). |
| `createPolityRegistry` | `src/polity.ts` | Create a PolityRegistry from an array of polities. No wars or alliances are registered by default. |
| `createRenownRegistry` | `src/renown.ts` |  |
| `createResearchState` | `src/research.ts` | Create a fresh `ResearchState` with zero progress. |
| `createSiege` | `src/siege.ts` | Create a new siege. `attackerPolity.militaryStrength_Q` sets siege strength; `defenderPolity.stabilityQ` seeds defender morale. |
| `createTaxPolicy` | `src/taxation.ts` | Create a default TaxPolicy with a standard rate and no exemptions. |
| `createTradeRegistry` | `src/trade-routes.ts` |  |
| `createTreatyRegistry` | `src/diplomacy.ts` |  |
| `createVassalBond` | `src/feudal.ts` | Create a vassal bond and register it. If a bond between this pair already exists it is overwritten. @param tributeRate_Q  Annual tribute as fraction of vassal treasury (default q(0.10)). @param levyRate_Q     Fraction of military available as levy (default q(0.20)). @param tick           Current simulation tick. |
| `createWonderProject` | `src/wonders.ts` | Create a new wonder construction project. |
| `cToQ` | `src/sim/thermoregulation.ts` | Celsius → Q-coded temperature (rounds to nearest integer). |
| `damageWonder` | `src/wonders.ts` | Mark a wonder as damaged (earthquake, siege). Damaged wonders yield `WONDER_DAMAGED_EFFECT_MUL` fraction of full effects. |
| `declareWar` | `src/polity.ts` | Register a state of war between two polities. Idempotent. |
| `depleteDeposit` | `src/resources.ts` | Reduce deposit richness based on cumulative yield extracted. `richnessDrain = round(yield_cu × DEPLETION_RATE_PER_1000_CU / 1000)` Mutates `deposit.richness_Q`. |
| `deployAgent` | `src/espionage.ts` | Deploy an agent and register them. If an agent with this ID is already registered they are replaced. |
| `deriveAgeMultipliers` | `src/sim/aging.ts` | Derive age-based attribute multipliers from normalized age and lifespan. All returned Q values except `reactionTime_Q` are in [0, SCALE.Q]. `reactionTime_Q` may exceed SCALE.Q (values > q(1.0) indicate slower reaction than the archetype baseline). |
| `deriveFactionStandingAdjustment` | `src/renown.ts` | Compute a signed faction standing delta based on entity renown and infamy. `allianceBias` controls how the faction weighs the two axes: - q(1.0) = fully heroic faction: rewards renown, punishes infamy - q(0.0) = fully criminal faction: rewards infamy, punishes renown - q(0.5) = neutral: both axes equally weighted, they cancel Result is clamped to [-SCALE.Q, SCALE.Q].  The caller is responsible for adding this delta to the current standing and re-clamping to [0, SCALE.Q]. |
| `deriveHarvestYieldFactor` | `src/granary.ts` | Derive the harvest yield factor [0, SCALE.Q] for a polity. Formula: `HARVEST_YIELD_BASE_Q + mulDiv(HARVEST_STABILITY_BONUS_Q, stabilityQ, SCALE.Q)` then optionally multiplied by a Phase-78 seasonal factor. @param season_Q  Seasonal multiplier [0, SCALE.Q] from Phase-78 Calendar. `q(1.0)` = summer peak; `q(0.50)` = winter harvest. Omit for an unseasoned annual harvest. |
| `deriveHazardEffect` | `src/sim/hazard.ts` | Derive per-second hazard effect rates from an exposure level. `exposureQ` is the output of `computeHazardExposure` — already in [0, intensity_Q]. Each base rate is scaled linearly: `rate = base × exposureQ / SCALE.Q`. `thermalDelta_Q` uses the same scaling so the thermal offset fades toward the hazard boundary. Returns a zero-effect record when `exposureQ <= 0`. |
| `deriveHealthCapacity` | `src/epidemic.ts` | Derive health-care capacity [0, SCALE.Q] for a polity from its tech era. Hosts may blend this with morale or stability for a richer model. |
| `deriveHungerModifiers` | `src/sim/nutrition.ts` | Derive performance modifiers from hunger state. staminaMul : multiplier on effective stamina energy drain (Phase 2B) forceMul   : multiplier on effective peakForce_N in combat resolution latencyMul : multiplier on decision latency (Phase 4) moraleDecay: additional fear per tick (Phase 5) |
| `deriveMilitaryStrength` | `src/polity.ts` | Derive and update `polity.militaryStrength_Q` from population, morale, and tech era. Formula: `clamp(popFrac × morale × techMul, 0, SCALE.Q)` - `popFrac` = `population / POLITY_POP_SCALE`, clamped to [0, SCALE.Q] (100 000 people = q(1.0) military potential) - `morale` and `techMul` are Q multipliers; result is clamped to SCALE.Q. Mutates `polity.militaryStrength_Q` and returns the new value. |
| `deriveMountFearPressure` | `src/sim/mount.ts` | Derive the fear pressure transmitted from a panicking mount to its rider. Returns q(0) when the mount's shockQ is at or below its fearThreshold. Above the threshold, 40% of the excess is propagated to the rider. @param mountShockQ       Current shock level of the mount [Q]. @param fearThreshold_Q   Mount's panic threshold [Q]. |
| `deriveNarrativeTone` | `src/narrative-prose.ts` | Derive the best matching `ProseTone` from a `CultureProfile`. Uses the top-ranked cultural value; falls back to `"neutral"` for values without a direct tone mapping (hospitality, hierarchy, innovation, etc.). |
| `deriveRiderHeightBonus` | `src/sim/mount.ts` | Derive the aim/accuracy bonus a rider gains from elevation. `aimBonus_Q = (riderHeightBonus_m / SCALE.m) × HEIGHT_AIM_BONUS_PER_M` Capped at HEIGHT_AIM_BONUS_MAX = q(0.30). |
| `deriveRiderStabilityBonus` | `src/sim/mount.ts` | Derive the stability bonus a rider inherits from a well-balanced mount. `stabilityBonus_Q = mount.stability_Q × RIDER_STABILITY_INHERIT / SCALE.Q` Capped at q(0.20). |
| `deriveSeasonalWeatherBias` | `src/calendar.ts` | Derive a suggested `WeatherState` biased toward the current season. The result is advisory — hosts can override or blend with their own weather system. Precipitation type: - winter + heavy → "blizzard"; winter + light → "snow" - spring/summer → "rain"; autumn → "rain" or dry depending on yield @param season     Current season. @param intensity  0–1 float: how extreme the seasonal weather should be. 0 = clear; 1 = full seasonal character. |
| `deriveSleepDeprivationMuls` | `src/sim/sleep.ts` | Derive sleep-deprivation attribute multipliers from the entity's sleep state. Impairment is driven by the greater of: - `awakeSeconds`  — continuous wake duration (resets on sleep) - `sleepDebt_s`   — cumulative shortfall from prior nights Below IMPAIR_THRESHOLD_S (17 h) both drivers produce no impairment. Full impairment is reached at MAX_SLEEP_DEBT_S (72 h). Multiplier ranges at max deprivation: cognitionFluid_Q:    q(1.0) → q(0.202)   (−79.8%) reactionTime_Q:      q(1.0) → q(1.45)    (+45% slower) stability_Q:         q(1.0) → q(0.75)    (−25%) distressTolerance_Q: q(1.0) → q(0.65)    (−35%) |
| `deriveTempModifiers` | `src/sim/thermoregulation.ts` | Derive performance modifiers from current core temperature. Stages (high → low): > CRITICAL_HIGH  : critical hyperthermia (dead=true) > HEAT_STROKE    : heat stroke > HEAT_EXHAUS    : heat exhaustion > HEAT_MILD      : mild hyperthermia >= NORMAL        : normal >= HYPO_MILD     : mild hypothermia >= HYPO_MOD      : moderate hypothermia >= HYPO_SEVERE   : severe hypothermia < HYPO_SEVERE    : critical hypothermia (dead=true) |
| `detectVersion` | `src/schema-migration.ts` | Read the `_ananke_version` stamp from a deserialized snapshot. Returns `undefined` for legacy snapshots saved before PA-3. |
| `disruptRoute` | `src/trade-routes.ts` | Disrupt a route by reducing efficiency by `disruption_Q`. Used by callers applying espionage results (Phase 82), war declarations, or hazard events. Clamps to 0. |
| `enactLaw` | `src/governance.ts` | Enact a new law.  Returns `false` if already enacted or at `MAX_ACTIVE_LAWS`. |
| `entityAgeYears` | `src/sim/aging.ts` | Convenience helper: return the current age in fractional years from entity.age. Returns 0 if `entity.age` is absent. |
| `entityIsMount` | `src/sim/mount.ts` | True if this entity is currently carrying a rider. |
| `entityIsMounted` | `src/sim/mount.ts` | True if this entity is currently riding a mount. |
| `entitySleepDebt_h` | `src/sim/sleep.ts` | Return the entity's accumulated sleep debt in hours. Returns 0 if `entity.sleep` is absent. |
| `establishRoute` | `src/trade-routes.ts` | Establish a new trade route (or replace an existing one). @param baseVolume_cu Annual trade value in cost-units at 100% efficiency. @param tick          Current simulation tick. |
| `estimateAnnualBirths` | `src/demography.ts` | Estimate annual births from a birth rate and population. Useful for host display and scenario planning. |
| `estimateAnnualDeaths` | `src/demography.ts` | Estimate annual deaths from a death rate and population. |
| `estimateDaysToExhaustion` | `src/resources.ts` | Estimate how many days until the deposit is exhausted at the current extraction rate.  Returns `Infinity` if no workers or already exhausted. |
| `estimateDaysToNextEra` | `src/research.ts` | Estimate days until the next era advance at the current daily research rate. Returns `Infinity` at max era or when rate is zero. |
| `estimateDaysToTreasuryTarget` | `src/taxation.ts` | Estimate how many days until the treasury reaches a target amount at the current daily tax revenue.  Returns `Infinity` if daily revenue is zero. |
| `estimateNetMigrationRate` | `src/migration.ts` | Compute the net annual population change due to migration for a polity, expressed as a fraction of its current population. Positive = net immigration (pull exceeds push). Negative = net emigration (push exceeds pull). Useful for AI and diplomatic decision-making. |
| `exposeToDisease` | `src/sim/disease.ts` | Attempt to expose an entity to a disease. Returns false (no-op) if: - The disease id is unknown. - The entity already has an active infection with this disease. - The entity has a valid (non-expired) immunity record for this disease. Otherwise creates an incubating DiseaseState and returns true. Does NOT perform a probability roll — the caller (e.g. `spreadDisease`) is responsible for rolling before calling this function. Mutates: `entity.activeDiseases`. |
| `findAncestors` | `src/kinship.ts` | Return all ancestors of `entityId` within `maxDepth` generations. Uses BFS upward through parent links only. |
| `findSuccessionCandidates` | `src/succession.ts` | Find all kin of `deceasedId` up to `maxDegree` and compute their claim strength. Candidates are sorted by claimStrength_Q descending, then kinshipDegree ascending. |
| `generateClimateEvent` | `src/climate.ts` | Attempt to generate a random climate event for a polity on the given tick. Each event type is rolled independently.  Returns the first event whose annual probability roll succeeds, or `undefined` if none trigger. Roll: `eventSeed(worldSeed, tick, polityHash, 0, typeSalt) % SCALE.Q` vs daily probability = `round(annualProb / 365)`. @param polityHash  `hashString(polity.id)` from Phase-61. @param worldSeed   World-level seed. @param tick        Current simulation tick (day). |
| `getActiveTreaties` | `src/diplomacy.ts` | Return all active treaties involving `polityId` (as either party). |
| `getAgentsByOwner` | `src/espionage.ts` | Return all agents deployed by `ownerPolityId`. |
| `getAgentsByTarget` | `src/espionage.ts` | Return all agents currently operating against `targetPolityId`. |
| `getAgePhase` | `src/sim/aging.ts` | Classify the entity's life stage from their normalized age fraction. Boundaries (ageFrac): infant 0–0.05 | child 0.05–0.15 | adolescent 0.15–0.22 | young_adult 0.22–0.38 | adult 0.38–0.62 | elder 0.62–0.88 | ancient 0.88+ |
| `getBond` | `src/feudal.ts` | Return the bond from `vassalId` to `liegeId`, or `undefined` if none. |
| `getChildren` | `src/kinship.ts` | Return the child IDs of `entityId`. |
| `getDiseaseProfile` | `src/sim/disease.ts` | Look up a disease profile by id. Returns undefined for unknown ids. |
| `getDominantFaith` | `src/faith.ts` | Return the faith with the highest adherents in a polity, or `undefined`. |
| `getFaith` | `src/faith.ts` | Return the faith definition, or `undefined` if unknown. |
| `getInfamyLabel` | `src/renown.ts` | Map `infamy_Q` to a human-readable infamy tier. |
| `getKinshipLabel` | `src/kinship.ts` | Map a numeric kinship degree (or `null`) to a `KinshipLabel`. @param degree  Result of `computeKinshipDegree`; pass `null` for unrelated. |
| `getLiege` | `src/feudal.ts` | Return the bond where `vassalId` is the vassal, or `undefined`. |
| `getLineageNode` | `src/kinship.ts` | Return the `LineageNode` for `entityId`, creating a root node (no parents, no children, no partners) if one does not yet exist. |
| `getMountGaitSpeed` | `src/sim/mount.ts` | Return the mount's speed in SCALE.mps for the given gait. |
| `getParents` | `src/kinship.ts` | Return the parent IDs of `entityId` (0–2 elements). |
| `getPolityFaiths` | `src/faith.ts` | Return all faith records for a polity (empty array if none). |
| `getRenownLabel` | `src/renown.ts` | Map `renown_Q` to a human-readable fame tier. |
| `getRenownRecord` | `src/renown.ts` | Return the RenownRecord for `entityId`, creating a zero-initialised record if one does not yet exist. |
| `getRoute` | `src/trade-routes.ts` | Return the route between two polities, or `undefined` if none. |
| `getRoutesForPolity` | `src/trade-routes.ts` | Return all routes involving `polityId` (as either party). |
| `getSeasonalModifiers` | `src/calendar.ts` | Return the `SeasonalModifiers` for the given `dayOfYear`. Convenience wrapper over `SEASONAL_MODIFIERS[computeSeason(day)]`. |
| `getSiblings` | `src/kinship.ts` | Return the sibling IDs of `entityId` — entities that share at least one parent, excluding `entityId` itself. |
| `getTopLegendEntries` | `src/renown.ts` | Return up to `n` legend entries sorted by significance (descending). Ties are broken by tick (descending — more recent wins). |
| `getTreaty` | `src/diplomacy.ts` | Return the treaty between two polities of the given type, or `undefined`. |
| `getVassals` | `src/feudal.ts` | Return all active bonds where `liegeId` is the lord. |
| `hasConstructionBonus` | `src/resources.ts` | Return true if this resource type provides a construction bonus. |
| `hasMercenaryArrears` | `src/mercenaries.ts` | Return `true` when the contract has active arrears. |
| `hasMilitaryBonus` | `src/resources.ts` | Return true if this resource type provides a military bonus. |
| `hasMobilityBonus` | `src/resources.ts` | Return true if this resource type provides a mobility bonus. |
| `hasNPI` | `src/sim/disease.ts` | Returns true if the specified NPI is currently active for the polity. |
| `hireMercenaries` | `src/mercenaries.ts` | Hire a mercenary band, creating a contract with initial loyalty. Does NOT deduct an advance payment — caller may pay via `computeMercenaryWage` before the first step if an upfront retainer is desired. @param initialLoyalty_Q  Starting loyalty. Defaults to q(0.70) (neutral-positive hire). |
| `investInProject` | `src/infrastructure.ts` | Invest treasury into a project. Drains `Math.min(investAmount, remainingCost)` from `polity.treasury_cu`. Sets `project.completedTick` when fully funded. Returns the amount actually invested this call. |
| `investInResearch` | `src/research.ts` | Invest treasury into research, immediately adding points. Rate: `RESEARCH_COST_PER_POINT` cost-units = 1 point. Drains `min(amount, polity.treasury_cu)`.  No-ops if treasury is empty. Returns the actual number of research points added. |
| `isCatastrophicFamine` | `src/famine.ts` | Return `true` when the polity has reached the most severe famine phase. |
| `isClimateEventExpired` | `src/climate.ts` | Return true if the event has run its full duration. |
| `isCoinageSound` | `src/monetary.ts` | Return `true` when coin purity is at or above the given threshold. |
| `isFamineActive` | `src/famine.ts` | Return `true` when the polity is in any active famine phase. |
| `isHazardExpired` | `src/sim/hazard.ts` | True when the hazard has run out of duration and should be removed from the world. Always false for permanent hazards. |
| `isInHarvestWindow` | `src/calendar.ts` | Return `true` if the day falls within the autumn harvest window. |
| `isInsideHazard` | `src/sim/hazard.ts` | True if the given position is within or on the hazard boundary. Uses integer squared-distance comparison to avoid float precision issues. |
| `isKin` | `src/kinship.ts` | Whether two entities are kin within `maxDegree` (default `MAX_KINSHIP_DEPTH`). |
| `isMercenaryReliable` | `src/mercenaries.ts` | Return `true` when the band is loyal enough to remain in service reliably. |
| `isMonetaryCrisis` | `src/monetary.ts` | Return `true` when the polity is in monetary crisis (high inflation). |
| `isOverCapacity` | `src/demography.ts` | Return `true` if the polity's population exceeds its tech-era carrying capacity. |
| `isProjectComplete` | `src/infrastructure.ts` | Return `true` if the project is fully funded and complete. |
| `isQuarantineActive` | `src/containment.ts` | Return `true` when any active containment policy is in effect. |
| `isRebellionRisk` | `src/feudal.ts` | Return `true` if the bond is at rebellion risk (`strength_Q < REBELLION_THRESHOLD`). |
| `isRouteViable` | `src/trade-routes.ts` | Return `true` if the route is efficient enough to trade. |
| `isSiegeResolved` | `src/siege.ts` | Return `true` if the siege has ended. |
| `isTotalLockdown` | `src/containment.ts` | Return `true` when the current policy is the most restrictive tier. |
| `isTreatyExpired` | `src/diplomacy.ts` | Return `true` if the treaty has expired at `currentTick`. Permanent treaties (`expiryTick === -1`) never expire. |
| `isTreatyFragile` | `src/diplomacy.ts` | Return `true` if treaty strength is below `TREATY_FRAGILE_THRESHOLD`. |
| `isValidSnapshot` | `src/schema-migration.ts` | Returns `true` when the snapshot carries a valid version stamp and passes structural validation (no `ValidationError` entries). Convenience wrapper for `detectVersion` + `validateSnapshot`. |
| `isWonderIntact` | `src/wonders.ts` | Return `true` when the wonder is standing and undamaged. |
| `isWonderProjectComplete` | `src/wonders.ts` | Return `true` when the project has reached full completion. |
| `makePeace` | `src/polity.ts` | End the state of war between two polities. Idempotent. |
| `migrateWorld` | `src/schema-migration.ts` | Migrate a deserialized world snapshot to `toVersion` (default: current `SCHEMA_VERSION`). - If the snapshot already carries `_ananke_version === toVersion`, it is returned unchanged. - Legacy snapshots without `_ananke_version` are treated as version `"0.0"`. - Throws a descriptive error when no registered migration path exists. The snapshot is not mutated; a new object is returned. @example const raw   = JSON.parse(fs.readFileSync("save.json", "utf8")); const world = migrateWorld(raw) as WorldState; |
| `mobilizeCampaign` | `src/military-campaign.ts` | Raise an army and transition campaign to `"march"` phase. Drains `armySize × MOBILIZATION_COST_PER_SOLDIER` from `polity.treasury_cu` (capped at available treasury — a treasury-poor polity raises a smaller effective force than planned). Mutates `campaign` and `polity.treasury_cu`. |
| `mythArchetypeFrame` | `src/narrative-prose.ts` | Returns a closing phrase appropriate to the myth archetype. |
| `pointsRequiredForNextEra` | `src/research.ts` | Points required to advance from the polity's current era. Returns `Infinity` at max era (no advancement possible). |
| `polityFactionStanding` | `src/polity.ts` | Look up the current faction-level standing that polityA's faction holds toward polityB's faction in the FactionRegistry. Returns STANDING_NEUTRAL (q(0.50)) if no relation is registered. Use this as `currentStanding_Q` for `resolveDiplomacy`. |
| `prepareDefender` | `src/military-campaign.ts` | Set the defender's battle strength.  Call before `stepCampaignMarch` starts. @param wallBonus_Q  Phase-89 wall infrastructure bonus [0, SCALE.Q]. Increases defender effective strength by this fraction. |
| `raidGranary` | `src/granary.ts` | Plunder a granary after a successful siege. Removes `raidFraction_Q` of current grain reserves. Returns the amount plundered. Integrates with Phase-84 siege: call on `outcome === "attacker_victory"`. @param raidFraction_Q  Fraction of reserves plundered [0, SCALE.Q]. Defaults to `RAID_FRACTION_Q = q(0.40)`. |
| `recallAgent` | `src/espionage.ts` | Recall (remove) an active agent. Returns `true` if found and removed. |
| `recordBirth` | `src/kinship.ts` | Register a birth: create a node for `childId` and link it to up to two parents. Parent nodes are created if they do not already exist. No-op if `childId` already has a node (idempotent). |
| `recordPartnership` | `src/kinship.ts` | Record a partnership between two entities. Partners are considered degree-1 kin (immediate). Idempotent: duplicate calls are safe. |
| `registerDiseaseProfile` | `src/sim/disease.ts` | Register a custom disease profile so it can be used with `exposeToDisease`, `spreadDisease`, and `stepDiseaseForEntity`. Does not modify `DISEASE_PROFILES`. Use this to add `MEASLES` or other Phase 73 / host-defined profiles to the lookup map. |
| `registerFaith` | `src/faith.ts` | Register or replace a faith definition. |
| `registerMigration` | `src/schema-migration.ts` | Register a migration function between two schema versions. Migrations are chained automatically when `migrateWorld` is called. For a simple non-breaking addition, the migration only needs to add default values for the new fields. @example registerMigration("0.1", "0.2", snap => ({ ...snap, __newField: snap["__newField"] ?? 0, })); |
| `reinforceBond` | `src/feudal.ts` | Strengthen a bond by a fixed delta (e.g., after a kinship event or tribute payment). Clamps to [0, SCALE.Q]. |
| `reinforceRoute` | `src/trade-routes.ts` | Reinforce a route (e.g., road investment, diplomatic summit). Clamps to [0, SCALE.Q]. |
| `reinforceTreaty` | `src/diplomacy.ts` | Reinforce a treaty by a fixed delta (e.g., after a tribute payment, joint military victory, or diplomatic summit). Clamps to [0, SCALE.Q]. |
| `removeNPI` | `src/sim/disease.ts` | Remove an NPI from a polity's registry entry. |
| `renderChronicleWithTone` | `src/narrative-prose.ts` | Render all entries in a `Chronicle` above `minSignificance` (default 50), returned in chronological order. Uses `renderEntryWithTone` for each entry. |
| `renderEntryWithTone` | `src/narrative-prose.ts` | Render a single `ChronicleEntry` with cultural-tone awareness. Selects the tone variant for `entry.eventType`; falls back to `"neutral"` if the requested tone has no specific variant.  Appends `ctx.mythFrame` if set. Does NOT mutate `entry.rendered` — call `entry.rendered = renderEntryWithTone(...)` manually if caching is desired. |
| `renderLegendWithTone` | `src/renown.ts` | Render an entity's top legend entries as tone-aware prose strings. Requires `entryMap` — a Map of `entryId → ChronicleEntry` for full entry data. Missing entries fall back to a bracketed placeholder. @param maxEntries  Maximum number of entries to render (default 5). |
| `repairWonder` | `src/wonders.ts` | Repair a damaged wonder, spending `WONDER_REPAIR_COST_FRAC` of base cost. Mutates `polity.treasury_cu` and clears `wonder.damaged`. Returns `true` if repaired; `false` if the polity lacked funds. No-op if wonder is not damaged. |
| `repealLaw` | `src/governance.ts` | Repeal an active law.  Returns `false` if the law was not active. |
| `resolveBattle` | `src/military-campaign.ts` | Resolve the field battle deterministically. Outcome probability is weighted by the strength ratio between attacker and defender, modified by a `eventSeed`-derived roll. Roll: seed   = eventSeed(worldSeed, tick, hashString(attackerId), hashString(defenderId), 9301) roll   = seed % SCALE.Q   ∈ [0, 9999] threshold_victory  = round(attackerStr × q(0.80) / SCALE.Q)  — min roll to win threshold_stalemate = threshold_victory + round(q(0.15) × SCALE.Q / SCALE.Q) This ensures that a stronger attacker has a proportionally higher chance of victory, while weaker attackers still occasionally succeed. Mutates `campaign.outcome`, `campaign.phase`, and `attacker.treasury_cu`/ `defender.treasury_cu` (tribute on victory). |
| `resolveDiplomacy` | `src/polity.ts` | Resolve a diplomatic negotiation between two polities. Returns a positive `standingDelta` to apply to the FactionRegistry global standing between the two polities' factions via `applyFactionStanding`. Standing improvement scales with: - `diplomatLinguistic_Q`: best envoy's `linguisticIntelligence_Q` (Phase 37) - headroom: how far below ALLY standing (q(0.70)) the current relation is (no improvement when already at or above ALLY) Maximum delta per negotiation is DIPLOMACY_MAX_DELTA (q(0.08)). |
| `resolveMigration` | `src/migration.ts` | Resolve all migration flows for one simulated day across the provided polities. Returns a flat list of `MigrationFlow` objects with `population > 0`. The caller should pass all polities that may send or receive migrants. Flows are not applied here — call `applyMigrationFlows` to mutate state. @param polities  Array of candidate polities. @param context   Optional per-polity war / feudal context keyed by polityId. |
| `resolveOperation` | `src/espionage.ts` | Resolve one tick of an operation. Idempotent for the same (worldSeed, tick). Success check: successThreshold = skill_Q × BASE_SUCCESS_Q[op] / SCALE.Q successRoll      = eventSeed(…, opSalt) % SCALE.Q success          = successRoll < successThreshold Detection check (only on failure): detectionRoll = eventSeed(…, opSalt+1) % SCALE.Q detected      = detectionRoll < DETECTION_RISK_Q[op] Does NOT mutate `agent.status` — call `stepAgentCover` for passive detection. |
| `resolveRebellion` | `src/unrest.ts` | Resolve a rebellion event deterministically. Outcomes: - `"quelled"`:   rebels dispersed — morale/treasury hit only. - `"uprising"`:  significant unrest — larger morale/stability hit + treasury raid. - `"civil_war"`: polity fractures — severe penalties across all stats. Outcome probability is weighted by unrest level vs. military strength: - High military strength + moderate unrest → likely `"quelled"` - Low military + high unrest → risk of `"civil_war"` Mutates polity morale, stability, and treasury. @param worldSeed  World seed for deterministic resolution. @param tick       Current simulation tick. |
| `resolveSuccession` | `src/succession.ts` | Resolve succession after `deceasedId` dies. @param lineage         Kinship registry (Phase 76). @param deceasedId      The entity whose position must be inherited. @param renownRegistry  Renown registry (Phase 75). @param rule            Succession rule to apply. @param worldSeed       For deterministic election roll. @param tick            Current simulation tick. |
| `resolveWarOutcome` | `src/polity.ts` | Resolve one day of active warfare between two polities. Deterministic given (`worldSeed`, `tick`).  The defender receives a built-in structural advantage (DEFENDER_ADVANTAGE_Q = q(1.20)). Attacker power is modified by a deterministic ±q(0.20) uncertainty roll. On attacker victory the first location of the defender is transferred. Stability consequences are returned as deltas; the caller applies them (or call `stepPolityDay` to handle that automatically for active wars). |
| `routeKey` | `src/trade-routes.ts` | Canonical route key — independent of argument order. Polity IDs are sorted lexicographically so `key(A,B) === key(B,A)`. |
| `runSiegeToResolution` | `src/siege.ts` | Run the siege forward until resolved or `maxDays` have elapsed. Returns the final step result. Useful for tests and quick simulations. |
| `setPolityFaith` | `src/faith.ts` | Set the adherent fraction for a faith in a polity. Creates the record if it does not exist; updates it if it does. Clamps `adherents_Q` to [0, SCALE.Q]. Does NOT normalise other faiths — call `normalisePolitFaiths` if needed. |
| `sharesDominantFaith` | `src/faith.ts` | Return `true` if both polities share the same dominant faithId. |
| `signTreaty` | `src/diplomacy.ts` | Sign a new treaty between two polities and register it. If a treaty of the same type between the same pair already exists it is replaced (renewal). @param tick            Current simulation tick (day). @param durationTicks   How many ticks the treaty lasts; `-1` = permanent. @param tributeFromA_Q  Annual tribute fraction from A to B (default 0). @param tributeFromB_Q  Annual tribute fraction from B to A (default 0). |
| `spreadDisease` | `src/sim/disease.ts` | Attempt to spread disease across a set of nearby entity pairs. For each pair the host has identified as spatially close: - Evaluates all symptomatic diseases on the carrier. - Rolls `eventSeed(worldSeed, tick, carrierId, targetId, diseaseIdSalt)`. - If roll < transmissionRisk_Q × SCALE.Q, calls `exposeToDisease`. Deterministic: identical inputs → identical outputs. @param entityMap  Map of entity id → Entity (must include all ids in pairs). @param pairs      Carrier–target pairs with their SCALE.m distances (from host spatial query). @param worldSeed  World seed for eventSeed. @param tick       Current tick for eventSeed. @returns          Number of new exposures created. |
| `spreadEpidemic` | `src/epidemic.ts` | Introduce disease from a source polity into a target polity. Creates a new `PolityEpidemicState` for the target if the computed spread exceeds `EPIDEMIC_CONTAINED_Q`.  If the disease is already present in the target the existing state's prevalence is increased. Returns the state that was created or modified, or `undefined` if the spread was below the contained threshold. |
| `stampSnapshot` | `src/schema-migration.ts` | Add `_ananke_version` and `_schema` metadata to a snapshot before persisting. Does not mutate the original object. @example const save = JSON.stringify(stampSnapshot(world, "world")); |
| `stepAgentCover` | `src/espionage.ts` | Run a daily cover check for an active agent. If the check fires, the agent transitions to "compromised" or "captured" (50/50 split via a secondary roll). Mutates `agent.status` directly. No-op if agent is already compromised or captured. |
| `stepAging` | `src/sim/aging.ts` | Advance an entity's age by `elapsedSeconds`. Initializes `entity.age` if absent. Does NOT recompute attributes — the host should call `applyAgingToAttributes` when it needs current aged stats. Mutates: `entity.age`. |
| `stepBondStrength` | `src/feudal.ts` | Advance bond strength by one simulated day. Strength decays at `LOYALTY_DECAY_PER_DAY[loyaltyType]`. `boostDelta_Q` is an optional signed daily bonus (e.g., from kinship, shared victory, good governance). Positive = strengthen; negative = additional stress. Mutates `bond.strength_Q` directly. |
| `stepCalendar` | `src/calendar.ts` | Advance the calendar by `days` days (must be ≥ 0). Returns a new `CalendarState`; does NOT mutate the input. |
| `stepCampaignMarch` | `src/military-campaign.ts` | Advance the campaign march for one tick. Daily march rate = `BASE_MARCH_RATE_Q + roadBonus_Q`. Daily upkeep    = `attackerArmySize × CAMPAIGN_UPKEEP_PER_SOLDIER`. When `marchProgress_Q` reaches SCALE.Q the phase transitions to `"battle"`. Mutates `campaign` and `attacker.treasury_cu`. @param roadBonus_Q  Phase-89 road infrastructure bonus [0, SCALE.Q]. |
| `stepClimateEvent` | `src/climate.ts` | Advance an active climate event by `elapsedDays`. Decrements `remainingDays` (floor at 0) and increments `elapsedDays`. Returns `true` if the event has expired this step. |
| `stepContainment` | `src/containment.ts` | Advance containment state by `elapsedDays`. - Increments `daysActive`. - Accrues `complianceDecay_Q` at `COMPLIANCE_DECAY_PER_DAY[policy]`; clamped to SCALE.Q. Policy "none" does not decay (nothing to comply with). |
| `stepCoreTemp` | `src/sim/thermoregulation.ts` | Advance an entity's core temperature by `delta_s` seconds given the ambient temperature. Reads `entity.condition.coreTemp_Q` (defaults to CORE_TEMP_NORMAL_Q if absent). Writes the new value back to `entity.condition.coreTemp_Q` and returns it. |
| `stepDiseaseForEntity` | `src/sim/disease.ts` | Advance all active diseases on an entity by `delta_s` seconds. For each active disease: - Incubating → symptomatic when elapsedSeconds ≥ incubationPeriod_s. - Symptomatic: drain fatigue at `symptomSeverity_Q × delta_s / 86400`. - Symptomatic → ended when elapsedSeconds ≥ symptomaticDuration_s: roll mortality via eventSeed; if fatal set `entity.injury.dead = true`. If survivor, grant immunity (duration per profile). Also ticks down temporary immunity timers. Mutates: `entity.activeDiseases`, `entity.immunity`, `entity.energy.fatigue`, `entity.injury.dead`. @param worldSeed  World seed for deterministic mortality roll. @param tick       Current tick for deterministic mortality roll. |
| `stepEpidemic` | `src/epidemic.ts` | Advance epidemic prevalence for `elapsedDays` days. **Logistic growth model** (daily, applied `elapsedDays` times via single formula): ``` susceptible_Q  = SCALE.Q − prevalence_Q growthDelta_Q  = prevalence_Q × susceptible_Q × GROWTH_RATE × transmissionRate / SCALE.Q³ recoveryDelta_Q = prevalence_Q × (RECOVERY_RATE + healthBonus) / SCALE.Q netDelta_Q     = (growthDelta − recoveryDelta) × elapsedDays ``` Prevalence is clamped to [0, SCALE.Q]. @param healthCapacity_Q  [0, SCALE.Q] tech-era / infrastructure health bonus. Derive via `deriveHealthCapacity(polity)`. |
| `stepExtraction` | `src/resources.ts` | Advance extraction for `elapsedDays` days. 1. Computes `computeDailyYield × elapsedDays`. 2. Adds yield to `polity.treasury_cu` and `state.cumulativeYield_cu`. 3. Depletes deposit richness proportional to yield. Mutates `polity.treasury_cu`, `state.cumulativeYield_cu`, and `deposit.richness_Q`. |
| `stepFaithConversion` | `src/faith.ts` | Apply a conversion delta to a polity. **Exclusive faiths**: gaining `delta_Q` adherents displaces all other *exclusive* faiths proportionally, preserving their relative sizes. Non-exclusive faiths in the polity are unaffected. **Syncretic faiths**: delta is added directly; no displacement occurs. All adherent_Q values are clamped to [0, SCALE.Q] after adjustment. |
| `stepFamine` | `src/famine.ts` | Advance famine state by `elapsedDays`. - Reclassifies `phase` from the current `foodSupply_Q`. - Resets `daysInPhase` to 0 on phase change; otherwise increments. - Accrues or decays `cumulativeSeverity_Q` at `SEVERITY_DELTA_PER_DAY`. Returns `true` if the famine phase changed this step. |
| `stepGovernanceCooldown` | `src/governance.ts` | Tick down the governance change cooldown. Mutates `state.changeCooldown`; never goes below 0. |
| `stepGovernanceStability` | `src/governance.ts` | Apply the governance passive stability increment per elapsed days. Uses `computeGovernanceModifiers` to get the net `stabilityIncrement_Q`, then adds `increment × elapsedDays` to `polity.stabilityQ`. No-op if net increment is 0 (law costs cancel the baseline bonus). @param lawRegistry  Active law registry. |
| `stepGranaryConsumption` | `src/granary.ts` | Drain daily grain consumption for `elapsedDays` days. Consumption = `polity.population × elapsedDays` supply units. Grain is clamped to 0 (no negative reserves). Returns the actual amount consumed (may be less than demand if reserves run low). |
| `stepHazardZone` | `src/sim/hazard.ts` | Advance a hazard zone's lifetime by `elapsedSeconds`. Permanent hazards (`durationSeconds === -1`) are untouched. Mutates: `hazard.durationSeconds`. |
| `stepMercenaryContract` | `src/mercenaries.ts` | Advance a mercenary contract by `elapsedDays`. Each step: 1. Compute wages due = `computeMercenaryWage(band, elapsedDays)`. 2. Pay as much as `polity.treasury_cu` allows; add remainder to `arrears_cu`. 3. If fully paid: grow loyalty, clear any arrears previously owed. If in arrears: decay loyalty by `LOYALTY_DECAY_PER_DAY_UNPAID × elapsedDays`. 4. If `loyalty_Q < DESERT_LOYALTY_THRESHOLD_Q`: roll for desertion via `eventSeed`. Desertion probability scales linearly from `DESERT_ROLL_MAX` at loyalty 0 to 0 at `DESERT_LOYALTY_THRESHOLD_Q`. 5. If deserted: set `loyalty_Q = 0` (signal to caller to remove contract). Mutates `polity.treasury_cu`, `contract.loyalty_Q`, `contract.arrears_cu`, and `contract.daysActive`. @param worldSeed  World-level seed for deterministic desertion roll. @param tick       Current simulation tick (day). |
| `stepMonetary` | `src/monetary.ts` | Advance monetary state by `elapsedDays` under the given policy. 1. Mints extra coins: `treasury += computeDebasementGain_cu(polity, policy, elapsedDays)`. 2. Updates `coinPurity_Q` by `POLICY_PURITY_DELTA_PER_DAY × elapsedDays`; clamped [0, SCALE.Q]. 3. Updates `inflationLevel_Q` by `POLICY_INFLATION_DELTA_PER_DAY × elapsedDays`; clamped [0, SCALE.Q]. 4. Sets `monetaryCrisis = inflationLevel_Q >= MONETARY_CRISIS_THRESHOLD_Q`. Mutates `polity.treasury_cu`, `state.coinPurity_Q`, `state.inflationLevel_Q`, and `state.monetaryCrisis`. |
| `stepNutrition` | `src/sim/nutrition.ts` | Advance an entity's nutritional state by `delta_s` seconds. Mutates: condition.caloricBalance_J, condition.hydrationBalance_J, condition.hungerState attributes.morphology.mass_kg        (during starving or critical) attributes.performance.peakForce_N   (during critical only) `activity` is a Q value (0 = resting, q(1.0) = maximum). |
| `stepPolityDay` | `src/polity.ts` | Advance all polities by one simulated day. Performs three phases in order: **Trade**: For each non-warring pair, compute and credit mutual trade income. **War**: For each active war, resolve one day of combat, apply stability consequences, and transfer territory on attacker victory. **Morale/Stability**: For each polity: - Stability decays daily; recovers when morale > q(0.50). - Morale drains when stability < UNREST_THRESHOLD; recovers otherwise. - `militaryStrength_Q` is refreshed. Disease spread is NOT handled here; call `computePolityDiseaseSpread` per-disease per-polity as the host iterates active outbreaks. Mutates polities in `registry.polities` and registry.activeWars (territory transfers may empty `locationIds`, but war entries are not auto-removed). |
| `stepPolityPopulation` | `src/demography.ts` | Step polity population forward by `elapsedDays` simulated days. Mutates `polity.population` in place and returns step metadata. Delta formula (fixed-point, single rounding): `popDelta = round(population × netAnnualRate_Q × elapsedDays / (365 × SCALE.Q))` @param elapsedDays     Number of simulated days to advance (typically 1–30). @param deathPressure_Q Annual mortality fraction from disease or siege casualties. @param foodSupply_Q    Food supply level [0, SCALE.Q]; famine fires below `FAMINE_THRESHOLD_Q`. |
| `stepRationedGranary` | `src/famine.ts` | Drain rationed consumption from a granary. Use in place of Phase-87 `stepGranaryConsumption` when a rationing policy is active.  Grain is clamped to 0; returns the actual supply units consumed. |
| `stepResearch` | `src/research.ts` | Advance research for `elapsedDays` days. Adds `computeDailyResearchPoints(polity) × elapsedDays` to `state.progress`. When progress meets or exceeds `pointsRequiredForNextEra`: - Excess progress carries over. - `polity.techEra` is incremented. - `deriveMilitaryStrength` is refreshed. Only one era advancement occurs per call regardless of elapsed days. At DeepSpace (max era) the call is a no-op. @param bonusPoints  Flat daily bonus from knowledge diffusion or infrastructure. |
| `stepRouteEfficiency` | `src/trade-routes.ts` | Advance route efficiency by one simulated day. Decays at `ROUTE_DECAY_PER_DAY`; `boostDelta_Q` is an optional signed daily bonus (e.g., from road maintenance, diplomatic investment). Mutates `route.efficiency_Q`. |
| `stepSEIR` | `src/sim/disease.ts` | Advance a single SEIR-enabled disease on an entity by `delta_s` seconds. Functionally equivalent to `stepDiseaseForEntity` for this profile only — isolates the target disease so other active diseases are not advanced. Backward-compatible: calls through to the Phase 56 step function. Intended for use with `profile.useSeir === true` diseases, but works with any profile registered via `registerDiseaseProfile`. @param entity     Entity to advance. @param delta_s    Elapsed seconds. @param profile    Disease profile to process. @param worldSeed  World seed for deterministic mortality roll. @param tick       Current tick for deterministic mortality roll. |
| `stepSiege` | `src/siege.ts` | Advance the siege by one simulated day. **Investment phase**: counts down `INVESTMENT_DAYS` then transitions to active. **Active phase** (each day): 1. Decay `wallIntegrity_Q` by `siegeStrength_Q × WALL_DECAY_BASE_Q / SCALE.Q`. 2. Drain `supplyLevel_Q` by `SUPPLY_DRAIN_PER_DAY_Q` (+ optional `supplyPressureBonus_Q`). 3. Decay `defenderMorale_Q` proportionally to combined wall/supply weakness. 4. If `wallIntegrity_Q < ASSAULT_WALL_THRESHOLD_Q` → resolve assault via `eventSeed`. 5. Else if `supplyLevel_Q ≤ SURRENDER_SUPPLY_THRESHOLD_Q` → daily surrender roll. @param worldSeed            Global world seed for determinism. @param tick                 Current simulation tick. @param supplyPressureBonus_Q Extra daily supply drain (e.g., trade routes severed by Phase 83). @param siegeStrengthMul_Q   Multiplier on siege strength (e.g., winter penalty from Phase 78). |
| `stepSleep` | `src/sim/sleep.ts` | Advance an entity's sleep state by `elapsedSeconds`. When `isSleeping = false` (awake): - `awakeSeconds` accumulates. - `sleepDebt_s` accrues at ½ s/s for each second spent beyond OPTIMAL_AWAKE_S. (16 h waking × ½ = 8 h debt — exactly one night's repayment if sleep was ideal.) - Phase stays or transitions to "awake". When `isSleeping = true`: - On sleep onset (phase was "awake"): `awakeSeconds` resets to 0; phase enters "light". - `sleepDebt_s` decrements 1:1 with elapsed sleep time (floored at 0). - Phase cycles: light → deep → rem → light (90-minute NREM/REM cycle). Mutates: `entity.sleep`. |
| `stepTaxCollection` | `src/taxation.ts` | Collect taxes for `elapsedDays` days and add to `polity.treasury_cu`. Mutates `polity.treasury_cu`. @returns Revenue added and the unrest pressure the current rate generates. |
| `stepTechDiffusion` | `src/tech-diffusion.ts` | Advance technology through the polity pair graph for one simulated day. For each pair, checks both directions (A→B and B→A) and rolls against `computeDiffusionPressure`.  A polity that advances during this step is not eligible to advance again in the same tick (one advance per tick max). Mutates `polity.techEra` (and refreshes `militaryStrength_Q`) for any polity that advances. Returns a `TechDiffusionResult[]` for every polity that advanced this tick. |
| `stepTreatyStrength` | `src/diplomacy.ts` | Advance treaty strength by one simulated day. Decays at `TREATY_DECAY_PER_DAY[type]`; `boostDelta_Q` is an optional signed daily bonus (e.g., tribute paid, joint victory, diplomatic summit). Mutates `treaty.strength_Q`. |
| `stepUnrest` | `src/unrest.ts` | Apply unrest consequences to a polity for `elapsedDays` days. When `unrestLevel_Q > UNREST_ACTION_THRESHOLD_Q`: - Drains morale at rate `(unrest − threshold) × MORALE_DRAIN_Q / SCALE.Q` per day. - Drains stability at a lower rate. Mutates `polity.moraleQ` and `polity.stabilityQ` in place. Returns the step result for host inspection. |
| `sumArmourInsulation` | `src/sim/thermoregulation.ts` | Helper: derive total armour insulation from loadout items. |
| `techEraName` | `src/tech-diffusion.ts` | Return the set of tech-era names available for a given era index. Useful for display in tools and reports. |
| `totalInboundPressure` | `src/tech-diffusion.ts` | Compute the net inbound diffusion pressure on a single polity from all its neighbours in the pair graph.  Useful for AI queries ("how likely is this polity to advance soon?"). War pairs are excluded.  Pressure values are summed (uncapped). |
| `tradeFoodSupply` | `src/granary.ts` | Transfer grain from one polity's granary to another. Actual transfer is limited by: - Grain available in the source granary. - Remaining capacity in the destination granary. Returns the amount actually transferred. Integrate with Phase-83 trade routes: host calls this when resolving a food route. |
| `treatyKey` | `src/diplomacy.ts` | Canonical treaty key — independent of argument order. Polity IDs are sorted lexicographically so `key(A,B,t) === key(B,A,t)`. |
| `triggerHarvest` | `src/granary.ts` | Add one harvest to the granary. Grain is clamped to `computeCapacity(polity)` — surplus is lost (no overflow). Returns the amount actually added (may be less than yield if near capacity). Call at the end of each harvest season (biannual: spring + autumn). |
| `updateRenownFromChronicle` | `src/renown.ts` | Scan `chronicle` for entries involving `entityId` and update the entity's RenownRecord accordingly. Idempotent: already-seen entryIds (tracked by `record.entries`) are skipped, so this can be called on every game tick without double-counting. @param minSignificance  Only entries at or above this score are considered (default 50). |
| `vaccinate` | `src/sim/disease.ts` | Add or update a vaccination record on an entity. If the entity already has a record for this disease, updates `efficacy_Q` and increments `doseCount` (booster model).  Otherwise creates a new record. @param entity       Target entity to vaccinate. @param diseaseId    Disease being vaccinated against. @param efficacy_Q   Protection level [Q]; q(0.95) = 95 % efficacy. |
| `validateSnapshot` | `src/schema-migration.ts` | Check structural conformance of a deserialized world snapshot. Validates only the `@core` fields that `stepWorld` requires.  Subsystem fields are not validated — unknown extra fields are silently permitted (hosts may attach extension data). @returns An array of `ValidationError`.  An empty array means valid. |

## Constants (249)

| Name | Source | Notes |
|------|--------|-------|
| `ACID_POOL` | `src/sim/hazard.ts` | A corrosive acid pool — 2 m radius, 2-hour duration. |
| `ALL_HAZARD_TYPES` | `src/sim/hazard.ts` | All hazard type identifiers (useful for validation and iteration). |
| `ALL_MOUNTS` | `src/sim/mount.ts` | All mount profiles in one array. |
| `ALL_SAMPLE_HAZARDS` | `src/sim/hazard.ts` | All sample hazard zones. |
| `ASSAULT_SUCCESS_BASE_Q` | `src/siege.ts` | Base assault success probability at equal siege strength and full defender morale. Actual chance boosted by `(SCALE.Q - defenderMorale_Q) × 0.30`. |
| `ASSAULT_WALL_THRESHOLD_Q` | `src/siege.ts` | Wall integrity below this → assault is triggered and resolved. |
| `ATTACKER_CASUALTY_ON_DEFEAT_Q` | `src/military-campaign.ts` |  |
| `ATTACKER_CASUALTY_ON_STALEMATE_Q` | `src/military-campaign.ts` |  |
| `ATTACKER_CASUALTY_ON_VICTORY_Q` | `src/military-campaign.ts` | Casualty rates per battle outcome. These are fractional strength losses applied to each side. |
| `AUTUMN_START_DAY` | `src/calendar.ts` |  |
| `BAND_HEAVY_INFANTRY` | `src/mercenaries.ts` | A 600-man heavy infantry cohort — expensive, high quality. |
| `BAND_LIGHT_CAVALRY` | `src/mercenaries.ts` | A typical 400-man light cavalry band — mobile, moderate quality. |
| `BAND_SIEGE_ENGINEERS` | `src/mercenaries.ts` | A 200-man specialist siege engineers unit. |
| `BASE_DIFFUSION_RATE_Q` | `src/tech-diffusion.ts` | Base daily probability of era advance when the era gap is 1 and route quality is q(0.50) and there is one shared location.  At this rate a lagging polity advances roughly once per 200 days (~7 months) under median conditions. |
| `BASE_EFFECTS` | `src/climate.ts` | Base effect magnitudes at full severity (q(1.0)) for each event type. Actual effects = base × severity_Q / SCALE.Q. |
| `BASE_MARCH_RATE_Q` | `src/military-campaign.ts` | Base daily march progress [Q/day] at no road bonus. At this rate, full march (SCALE.Q) takes 20 days. |
| `BASE_YIELD_PER_WORKER` | `src/resources.ts` | Base daily yield per worker [cost-units/worker/day] at full richness and base tech era (Ancient = 1, the reference point). |
| `BASELINE_BIRTH_RATE_ANNUAL_Q` | `src/demography.ts` | Baseline annual birth rate [Q = fraction of population per year]. ≈ 3.5%/year. |
| `BASELINE_DEATH_RATE_ANNUAL_Q` | `src/demography.ts` | Baseline annual death rate [Q = fraction of population per year]. ≈ 3.0%/year. |
| `BIRTH_RATE_MORALE_FLOOR_Q` | `src/demography.ts` | Morale floor multiplier on birth rate. Birth rate factor = `BIRTH_RATE_MORALE_FLOOR_Q + moraleQ`, yielding: moraleQ = 0        → factor = q(0.50) → birth rate × 0.50 moraleQ = SCALE.Q  → factor = q(1.50) → birth rate × 1.50 |
| `BLIZZARD_ZONE` | `src/sim/hazard.ts` | A severe cold zone — 100 m radius, 6-hour duration. |
| `CALENDAR_Q_PER_DEG_C` | `src/calendar.ts` | Approximate Q units per °C in Phase-29 thermal encoding. Matches `WEATHER_Q_PER_DEG_C` in `src/sim/weather.ts`. |
| `CAMEL` | `src/sim/mount.ts` |  |
| `CAMPAIGN_UPKEEP_PER_SOLDIER` | `src/military-campaign.ts` | Daily treasury upkeep per soldier [cost-units/soldier/day]. |
| `CAMPFIRE` | `src/sim/hazard.ts` | A modest campfire — 3 m radius, 1-hour duration. |
| `CARRYING_CAPACITY_BY_ERA` | `src/demography.ts` | Soft carrying capacity by tech era. `stepPolityPopulation` does not enforce it — host checks `isOverCapacity` and applies extra emigration pressure via Phase-81 if desired. |
| `CATASTROPHE_THRESHOLD_Q` | `src/famine.ts` | `foodSupply_Q` below this → catastrophe phase. |
| `CHARGE_MASS_FRAC` | `src/sim/mount.ts` | Fraction of mount mass that contributes to charge strike energy [Q]. |
| `CLAIM_INHERITED_RENOWN_WEIGHT_Q` | `src/succession.ts` |  |
| `CLAIM_OWN_RENOWN_WEIGHT_Q` | `src/succession.ts` | Weight of own renown vs. inherited renown when computing claim strength. |
| `COGNITION_FLUID_COEFF` | `src/sim/sleep.ts` | Coefficient for cognition fluid degradation per unit impair fraction [numeric]. |
| `COMBAT_STABILITY_DRAIN_Q` | `src/military-campaign.ts` |  |
| `COMPLIANCE_DECAY_PER_DAY` | `src/containment.ts` | Compliance decay accrued per day by policy tier [out of SCALE.Q]. Voluntary: minimal decay (people accept guidance). Total lockdown: fast erosion (coercion breeds resistance). |
| `CONSTRUCTION_BONUS_RESOURCES` | `src/resources.ts` | Resource types that provide a construction cost discount when worked. Hosts apply this to Phase-89 `investInProject` cost calculations. |
| `CONTACT_RANGE_Sm` | `src/sim/disease.ts` | Maximum distance for contact/vector/waterborne transmission [SCALE.m]. |
| `CONTESTED_THRESHOLD_Q` | `src/succession.ts` | Additional penalty when the top two candidates are within this band. |
| `CONVERSION_BASE_RATE_Q` | `src/faith.ts` | Base daily conversion delta at full missionary presence and full source fervor. Actual delta = `fervor_Q × missionaryPresence_Q × CONVERSION_BASE_RATE_Q / SCALE.Q²`. |
| `CORE_TEMP_HEAT_EXHAUS` | `src/sim/thermoregulation.ts` | Heat exhaustion entry (~38.6 °C). |
| `CORE_TEMP_HEAT_MILD` | `src/sim/thermoregulation.ts` | Mild hyperthermia entry (~37.8 °C). |
| `CORE_TEMP_HEAT_STROKE` | `src/sim/thermoregulation.ts` | Heat stroke entry (~39.4 °C). |
| `CORE_TEMP_HYPOTHERMIA_MILD` | `src/sim/thermoregulation.ts` | Mild hypothermia entry (~36.2 °C; below normal). |
| `CORE_TEMP_HYPOTHERMIA_MOD` | `src/sim/thermoregulation.ts` | Moderate hypothermia entry (~34.6 °C). |
| `CORE_TEMP_HYPOTHERMIA_SEVERE` | `src/sim/thermoregulation.ts` | Severe hypothermia entry (~33.0 °C). |
| `CORE_TEMP_NORMAL_Q` | `src/sim/thermoregulation.ts` | Normal body temperature (37.0 °C). |
| `COUNTER_INTEL_PER_AGENT` | `src/espionage.ts` | Compute the counterintelligence strength of a polity based on the number of known (compromised) agents inside its borders. Returns a Q modifier applied by hosts to reduce incoming operation success. `knownAgentCount × COUNTER_INTEL_PER_AGENT`, clamped to [0, SCALE.Q]. |
| `COVER_DECAY_PER_DAY` | `src/espionage.ts` | Daily base probability that an active agent's cover is blown regardless of operations. Low but non-zero. |
| `DAILY_CONTACTS_ESTIMATE` | `src/sim/disease.ts` | Daily contacts-per-entity estimate for `computeR0`. Community-setting assumption; capped by actual population size. |
| `DAYS_PER_YEAR` | `src/calendar.ts` |  |
| `DEEP_PHASE_S` | `src/sim/sleep.ts` | Duration of the deep-sleep (slow-wave) phase per cycle [s]. |
| `DEFEAT_MORALE_HIT_Q` | `src/military-campaign.ts` | Apply morale and stability penalties to both sides after a resolved battle. - Loser: morale −`DEFEAT_MORALE_HIT_Q`, stability −`DEFEAT_STABILITY_HIT_Q`. - Winner: morale +`VICTORY_MORALE_BONUS_Q` (capped at SCALE.Q). - Both: stability drained by `COMBAT_STABILITY_DRAIN_Q` (war is always costly). Mutates `attacker` and `defender` in place. |
| `DEFEAT_STABILITY_HIT_Q` | `src/military-campaign.ts` |  |
| `DEFENDER_ADVANTAGE_Q` | `src/polity.ts` | Defender's structural advantage in war resolution (home terrain, fortifications). |
| `DEFENDER_CASUALTY_ON_DEFEAT_Q` | `src/military-campaign.ts` |  |
| `DEFENDER_CASUALTY_ON_STALEMATE_Q` | `src/military-campaign.ts` |  |
| `DEFENDER_CASUALTY_ON_VICTORY_Q` | `src/military-campaign.ts` |  |
| `DENSITY_SPREAD_THRESHOLD` | `src/polity.ts` | Population per controlled location above which airborne disease spreads at polity scale (instead of only entity-to-entity). |
| `DEPLETION_EXHAUSTED_Q` | `src/resources.ts` | Richness threshold below which the deposit is considered exhausted [Q]. Extraction becomes uneconomical below this level. |
| `DEPLETION_RATE_PER_1000_CU` | `src/resources.ts` | Richness reduction per 1000 cost-units of cumulative yield. Controls the depletion rate.  Lower values mean longer-lived deposits. |
| `DESERT_LOYALTY_THRESHOLD_Q` | `src/mercenaries.ts` | Loyalty below this → desertion roll fires. |
| `DESERT_ROLL_MAX` | `src/mercenaries.ts` | Daily desertion probability roll threshold when loyalty is at zero [out of SCALE.Q]. At loyalty = DESERT_THRESHOLD: ~25% chance/day; scales linearly to 0 at threshold. |
| `DIPLOMACY_MAX_DELTA` | `src/polity.ts` | Maximum standing delta per successful diplomatic negotiation. |
| `DISEASE_PROFILES` | `src/sim/disease.ts` | All disease profiles indexed by id. |
| `DISMOUNT_SHOCK_Q` | `src/sim/mount.ts` | Rider shock level above which a forced dismount occurs [Q]. |
| `DISTRESS_TOLERANCE_COEFF` | `src/sim/sleep.ts` | Coefficient for distress tolerance degradation per unit impair fraction [numeric]. |
| `EARTH_SPIRITS` | `src/faith.ts` | Low-fervor animistic syncretic faith. |
| `EPIDEMIC_BASE_GROWTH_RATE_Q` | `src/epidemic.ts` | Base daily growth rate of prevalence per susceptible unit. Logistic growth: `growthDelta = prevalence × (SCALE.Q − prevalence) × GROWTH_RATE / SCALE.Q²` The actual rate is further scaled by `profile.baseTransmissionRate_Q`. |
| `EPIDEMIC_BASE_RECOVERY_RATE_Q` | `src/epidemic.ts` | Base daily recovery rate (natural immunity + mortality removes infecteds). Scaled by `healthCapacity_Q`: better medicine → faster clearance. |
| `EPIDEMIC_CONTAINED_Q` | `src/epidemic.ts` | Prevalence at or below this value is considered "contained" — epidemic no longer produces meaningful mortality or migration pressure. |
| `EPIDEMIC_HEALTH_RECOVERY_BONUS_Q` | `src/epidemic.ts` | Maximum additional daily recovery from maximum `healthCapacity_Q`. At healthCapacity = SCALE.Q: recovery rate += this value. |
| `EPIDEMIC_MIGRATION_PUSH_MAX_Q` | `src/epidemic.ts` | Peak migration push pressure from a severe epidemic (at full prevalence). Integrates with Phase-81 `computePushPressure` as additive bonus. |
| `EPIDEMIC_SEVERITY_THRESHOLD_Q` | `src/epidemic.ts` | Minimum symptom severity that generates significant migration push. Below this threshold `computeEpidemicMigrationPush` returns reduced pressure. |
| `ERA_GAP_BONUS_MAX` | `src/tech-diffusion.ts` | Maximum era-gap bonus (caps at gap=4 → ×3.0× the base). |
| `ERA_GAP_BONUS_Q` | `src/tech-diffusion.ts` | Multiplier applied per additional era of gap beyond 1. At gap=2: ×1.5×; gap=3: ×2.0×; capped at gap=4 (×2.5×). Ensures large knowledge gradients trigger faster catch-up. |
| `EVENT_DAILY_PROBABILITY_Q` | `src/climate.ts` | Daily probability of each event type triggering [Q]. Roll = `eventSeed(...) % SCALE.Q`; triggers when roll < dailyProb. These correspond to rough annual frequencies: harsh_winter: q(0.005) ≈ 0.5%/day ≈ ~50% chance within a year flood:        q(0.004) ≈ 0.4%/day ≈ ~40% within a year drought:      q(0.003) ≈ 0.3%/day plague_season:q(0.002) ≈ 0.2%/day locust_swarm: q(0.001) ≈ 0.1%/day earthquake:   q(0.0005)≈ 0.05%/day (rare) |
| `EVENT_DURATION_RANGE` | `src/climate.ts` | Typical duration ranges in days [min, max] for each event type. Used by `generateClimateEvent` to set `durationDays`. |
| `FAITH_DIPLOMATIC_BONUS_Q` | `src/faith.ts` | Diplomatic bonus (Q offset) when two polities share the same dominant faith. |
| `FAITH_DIPLOMATIC_PENALTY_Q` | `src/faith.ts` | Diplomatic penalty when polities hold exclusive faiths that conflict. |
| `FAMINE_DEATH_ANNUAL_Q` | `src/demography.ts` | Additional annual death rate during famine (+3%/year on top of baseline). |
| `FAMINE_MIGRATION_PUSH_Q` | `src/demography.ts` | Peak famine-driven migration push pressure (at food = 0). Integrates with Phase-81 `computePushPressure` as an additive bonus. |
| `FAMINE_PHASE_DEATH_Q` | `src/famine.ts` | Additional annual death rate by famine phase [Q]. Phase-86 already applies `FAMINE_DEATH_ANNUAL_Q = q(0.030)` at famine threshold; these bonuses are additive on top for graduated severity. |
| `FAMINE_PHASE_MIGRATION_Q` | `src/famine.ts` | Migration push pressure by famine phase [0, SCALE.Q]. |
| `FAMINE_PHASE_UNREST_Q` | `src/famine.ts` | Base unrest pressure by famine phase [0, SCALE.Q]. |
| `FAMINE_THRESHOLD_Q` | `src/demography.ts` | Food supply fraction below which famine is active [0, SCALE.Q]. |
| `FAMINE_THRESHOLD_Q` | `src/famine.ts` | `foodSupply_Q` below this → famine phase. |
| `FOOD_ITEMS` | `src/sim/nutrition.ts` |  |
| `GOVERNANCE_BASE` | `src/governance.ts` | Baseline governance modifiers for each type. Callers layer law-code bonuses on top. |
| `GOVERNANCE_CHANGE_COOLDOWN_DAYS` | `src/governance.ts` | Cooldown days after a governance change before another is allowed. |
| `GOVERNANCE_CHANGE_STABILITY_HIT_Q` | `src/governance.ts` | Stability penalty applied when changing governance type [Q]. Represents the upheaval of political transition. |
| `GRANARY_CAPACITY_DAYS` | `src/granary.ts` | Granary holds this many person-days of food at full capacity. Default: 730 (≈ 2 years of food per capita). |
| `HARVEST_BASE_SU_PER_CAPITA` | `src/granary.ts` | Each harvest at full yield contributes this many person-days per capita. With two harvests/year: 500 annual supply vs. 365 consumption → ~37% surplus headroom. |
| `HARVEST_GROWING_END` | `src/calendar.ts` |  |
| `HARVEST_GROWING_START` | `src/calendar.ts` |  |
| `HARVEST_PLANTING_END` | `src/calendar.ts` |  |
| `HARVEST_PLANTING_START` | `src/calendar.ts` |  |
| `HARVEST_STABILITY_BONUS_Q` | `src/granary.ts` | Maximum additional yield from full stability [0, SCALE.Q]. yieldFactor = HARVEST_YIELD_BASE_Q + mulDiv(HARVEST_STABILITY_BONUS_Q, stabilityQ, SCALE.Q). |
| `HARVEST_WINDOW_END` | `src/calendar.ts` |  |
| `HARVEST_WINDOW_START` | `src/calendar.ts` |  |
| `HARVEST_YIELD_BASE_Q` | `src/granary.ts` | Minimum harvest yield at zero stability [0, SCALE.Q]. Stability linearly scales yield from this floor to `SCALE.Q` (full yield). |
| `HEALTH_CAPACITY_BY_ERA` | `src/epidemic.ts` | Health-care capacity by tech era [0, SCALE.Q]. |
| `HEIGHT_AIM_BONUS_MAX` | `src/sim/mount.ts` | Maximum rider height aim bonus (caps at 2.5 m for war elephant) [Q]. |
| `HEIGHT_AIM_BONUS_PER_M` | `src/sim/mount.ts` | Aim / accuracy bonus per real metre of rider elevation [Q]. |
| `HERESY_THRESHOLD_Q` | `src/faith.ts` | Minority exclusive faith presence above this fraction → heresy risk fires. `computeHeresyRisk` returns non-zero only when a minority exclusive faith exceeds this threshold in a polity whose dominant faith has low tolerance. |
| `HORSE` | `src/sim/mount.ts` |  |
| `HUMAN_LIFESPAN_YEARS` | `src/sim/aging.ts` | Default lifespan for entities without a species override [years]. |
| `IMPAIR_THRESHOLD_S` | `src/sim/sleep.ts` | Continuous wake time above which cognitive/motor impairment begins [s]. |
| `INFRA_BASE_COST` | `src/infrastructure.ts` | Base treasury cost per level for each structure type [cost units]. Each level costs `BASE_COST × level` (level 1 = cheapest, level 5 = 5×). |
| `INFRA_BONUS_PER_LEVEL_Q` | `src/infrastructure.ts` | Bonus Q per level for each infrastructure type. Total bonus = `BONUS_PER_LEVEL × level` (clamped by the calling function). |
| `INSTABILITY_DEATH_ANNUAL_Q` | `src/demography.ts` | Additional annual death rate at zero stability. Linearly scaled by `(SCALE.Q − stabilityQ) / SCALE.Q`. Full bonus at stability = 0; zero at stability = SCALE.Q. |
| `INVESTMENT_DAYS` | `src/siege.ts` | Days spent in the investment phase before active bombardment/starvation begins. |
| `KNOWLEDGE_DIFFUSION_RATE_Q` | `src/research.ts` | Fraction of the source polity's daily research rate that diffuses to a less-advanced trade partner per era of difference. |
| `LAW_CONSCRIPTION` | `src/governance.ts` | Conscription law: larger armies, minor stability cost. |
| `LAW_MARTIAL_LAW` | `src/governance.ts` | Martial law: strong unrest mitigation but heavy stability drain. |
| `LAW_RULE_OF_LAW` | `src/governance.ts` | Rule of law: stability bonus, research bonus, small unrest mitigation. |
| `LAW_SCHOLAR_PATRONAGE` | `src/governance.ts` | Patronage of scholars: research bonus, expensive. |
| `LAW_TAX_REFORM` | `src/governance.ts` | Tax reform: better tax efficiency, minor unrest from displacing old collectors. |
| `LIGHT_PHASE_S` | `src/sim/sleep.ts` | Duration of the light-sleep (NREM-1/2) phase per cycle [s]. |
| `LOYALTY_BASE_STRENGTH` | `src/feudal.ts` | Base strength at bond creation per loyalty type. |
| `LOYALTY_DECAY_PER_DAY` | `src/feudal.ts` | Daily strength decay for each loyalty type (per simulated day). |
| `LOYALTY_DECAY_PER_DAY_UNPAID` | `src/mercenaries.ts` | Loyalty decay per day when wages are in arrears [out of SCALE.Q]. |
| `LOYALTY_GROWTH_PER_DAY_PAID` | `src/mercenaries.ts` | Loyalty growth per day when wages are paid in full [out of SCALE.Q]. |
| `LOYALTY_VICTORY_BONUS_Q` | `src/mercenaries.ts` | Loyalty bonus on campaign victory — reward for shared triumph. Caller applies via `applyVictoryLoyaltyBonus`. |
| `MAX_ACTIVE_LAWS` | `src/governance.ts` | Maximum number of laws that can be active simultaneously. |
| `MAX_INFRA_LEVEL` | `src/infrastructure.ts` | Maximum upgrade level for any structure. |
| `MAX_KINSHIP_DEPTH` | `src/kinship.ts` | Maximum BFS depth for kinship searches; beyond this entities are "unrelated". |
| `MAX_MERC_STRENGTH_BONUS_Q` | `src/mercenaries.ts` | Maximum military strength contribution from any single mercenary contract [Q]. Prevents a single large band from trivially dominating a polity's army. |
| `MAX_MOBILIZATION_Q` | `src/military-campaign.ts` | Maximum fraction of population that can be mobilized [Q]. Above this, domestic stability collapses. |
| `MAX_SLEEP_DEBT_S` | `src/sim/sleep.ts` | Maximum sleep debt tracked (3 days of total sleep deprivation) [s]. |
| `MAX_TAX_RATE_Q` | `src/taxation.ts` | Tax rate above which unrest pressure reaches maximum [Q]. Between OPTIMAL and MAX, pressure scales linearly. |
| `MAX_TAX_UNREST_Q` | `src/taxation.ts` | Maximum unrest pressure that taxation alone can generate [Q]. Passed as an extra additive factor into Phase-90 `computeUnrestLevel`. |
| `MAX_TECH_ERA` | `src/tech-diffusion.ts` | Maximum tech era index (DeepSpace = 8). |
| `MEASLES` | `src/sim/disease.ts` | Measles — highly contagious SEIR airborne disease. R0 ≈ 12–18 in populations of 15+ (DAILY_CONTACTS_ESTIMATE × 14 days × baseRate). Use with `registerDiseaseProfile(MEASLES)` before calling `exposeToDisease`. Validation target: epidemic curve peaks days 10–20, burns out by day 60, matching standard SIR model output within ±15 % for 95 % susceptible population. |
| `MERCHANT_CULT` | `src/faith.ts` | Moderate syncretic merchant cult. |
| `MIGRATION_DAILY_RATE_Q` | `src/migration.ts` | Fraction of the source polity's population that migrates per simulated day at full combined pressure and full destination pull. q(0.001) = 0.1 % per day maximum. |
| `MIGRATION_PUSH_FEUDAL_THRESHOLD` | `src/migration.ts` | Feudal bond strength below this contributes to push pressure. Vassals under an oppressive liege (weak bonds) bleed population. |
| `MIGRATION_PUSH_MIN_Q` | `src/migration.ts` | Minimum push pressure required for migration to occur. Prevents trickle migration from perfectly stable polities. |
| `MIGRATION_PUSH_MORALE_THRESHOLD` | `src/migration.ts` | Morale below this contributes to push pressure. |
| `MIGRATION_PUSH_STABILITY_THRESHOLD` | `src/migration.ts` | Stability below this contributes to push pressure. A polity at q(0.40) stability has zero stability push; below it, pressure rises. |
| `MIGRATION_WAR_PUSH_Q` | `src/migration.ts` | Flat push bonus added when the polity is in an active war. Represents war refugees and general insecurity. |
| `MILITARY_BONUS_RESOURCES` | `src/resources.ts` | Resource types that provide a military equipment bonus when worked. Hosts apply this to Phase-61 `deriveMilitaryStrength` or Phase-93 strength. |
| `MOBILITY_BONUS_RESOURCES` | `src/resources.ts` | Resource types that improve march rate when worked. Hosts add a road-equivalent bonus to Phase-93 `stepCampaignMarch`. |
| `MOBILIZATION_COST_PER_SOLDIER` | `src/military-campaign.ts` | Treasury cost per soldier for initial mobilization (equipment, muster pay). In cost-units per soldier. |
| `MOBILIZATION_POP_FRACTION_Q` | `src/military-campaign.ts` | Default fraction of the population available as soldiers [Q]. 5% mobilization is a sustainable wartime levy. |
| `MONETARY_CRISIS_THRESHOLD_Q` | `src/monetary.ts` | Inflation level at which monetary crisis activates [Q]. |
| `MONETARY_MAX_UNREST_Q` | `src/monetary.ts` | Maximum unrest pressure from inflation at full inflation level [Q]. Scales linearly: 0 at no inflation, `MONETARY_MAX_UNREST_Q` at SCALE.Q. |
| `MONETARY_TRADE_FLOOR_Q` | `src/monetary.ts` | Minimum trade acceptance multiplier even with near-zero coin purity [Q]. Barter / commodity exchange prevents complete trade collapse. |
| `MORALE_DECAY_RATE_Q` | `src/siege.ts` | Rate at which defender morale decays relative to combined wall/supply weakness. |
| `MORALE_DRAIN_PER_DAY` | `src/polity.ts` | Daily morale drain when stability < UNREST_THRESHOLD. |
| `MORALE_RECOVERY_PER_DAY` | `src/polity.ts` | Daily morale gain when stability ≥ UNREST_THRESHOLD. |
| `MOUNT_FEAR_CONTAGION` | `src/sim/mount.ts` | Fraction of excess mount-shock (beyond fearThreshold) that propagates to rider [Q]. |
| `MUSTARD_GAS` | `src/sim/hazard.ts` | A drifting toxic-gas cloud — 20 m radius, 30-minute duration. |
| `NPI_MASK_REDUCTION_Q` | `src/sim/disease.ts` | Airborne transmission reduction from mask mandate NPI [Q]. Risk is multiplied by (SCALE.Q − NPI_MASK_REDUCTION_Q) / SCALE.Q → ×0.40 remaining. |
| `OATH_BREAK_INFAMY_Q` | `src/feudal.ts` | Infamy added to the vassal's renown record when breaking an `oath_sworn` bond. `kin_bound` and `conquered` breaks carry no oath infamy. |
| `OPERATION_BASE_SUCCESS_Q` | `src/espionage.ts` | Base success probability per operation at agent skill = SCALE.Q. Actual threshold = `skill_Q × BASE_SUCCESS_Q / SCALE.Q`. |
| `OPERATION_DETECTION_RISK_Q` | `src/espionage.ts` | Detection probability on failure for each operation. High-impact operations (treasury_theft) are riskier. |
| `OPERATION_EFFECT_Q` | `src/espionage.ts` | Maximum effect delta per successful operation, scaled by `skill_Q`. `intelligence_gather` has no Q delta (information is the outcome). |
| `OPTIMAL_AWAKE_S` | `src/sim/sleep.ts` | Optimal waking duration per 24-hour period [s]. |
| `OPTIMAL_SLEEP_S` | `src/sim/sleep.ts` | Optimal sleep duration per 24-hour period [s]. |
| `OPTIMAL_TAX_RATE_Q` | `src/taxation.ts` | Tax rate below which no unrest pressure is generated [Q]. Rates at or below this are considered politically acceptable. |
| `POLICY_DAILY_MINT_FRAC_Q` | `src/monetary.ts` | Extra coins minted per day as a fraction of current treasury [out of SCALE.Q]. `gain_cu = round(treasury_cu × mintFrac × elapsedDays / SCALE.Q)` |
| `POLICY_INFLATION_DELTA_PER_DAY` | `src/monetary.ts` | Inflation change per day by policy [out of SCALE.Q]. Positive = inflation rising; negative = inflation falling. |
| `POLICY_PURITY_DELTA_PER_DAY` | `src/monetary.ts` | Coin purity change per day by policy [out of SCALE.Q]. Positive = recovery; negative = degradation. |
| `POLITY_POP_SCALE` | `src/polity.ts` | Population count at which military potential equals q(1.0). |
| `PONY` | `src/sim/mount.ts` |  |
| `PRESET_LAW_CODES` | `src/governance.ts` |  |
| `QUARANTINE_DAILY_COST_PER_1000` | `src/containment.ts` | Daily treasury cost per 1,000 population by policy tier [cu]. Scale: `computeContainmentCost_cu = cost × population / 1000 × elapsedDays`. |
| `QUARANTINE_HEALTH_BONUS_Q` | `src/containment.ts` | Health capacity bonus per policy tier [0, SCALE.Q]. Stack with Phase-88 `deriveHealthCapacity` as additive bonus to `healthCapacity_Q`. Reflects improved isolation, triage, and care coordination. |
| `QUARANTINE_TRANSMISSION_REDUCTION_Q` | `src/containment.ts` | Base transmission reduction fraction per policy tier [0, SCALE.Q]. Applied to `contactIntensity_Q` in Phase-88 spread calculations. Actual effect is scaled down by `(SCALE.Q − complianceDecay_Q) / SCALE.Q`. |
| `QUARANTINE_UNREST_Q` | `src/containment.ts` | Unrest pressure per policy tier [0, SCALE.Q]. Pass to Phase-90 `computeUnrestLevel`. |
| `RADIATION_ZONE` | `src/sim/hazard.ts` | A contaminated crater — 50 m radius, permanent. |
| `RAID_FRACTION_Q` | `src/granary.ts` | Fraction of the granary that a successful siege raid removes. Callers may pass a different fraction to `raidGranary`. |
| `RATIONING_REDUCTION_Q` | `src/famine.ts` | Consumption reduction fraction per rationing policy [0, SCALE.Q]. Applied to `polity.population × elapsedDays` to give actual su demand. |
| `RATIONING_UNREST_Q` | `src/famine.ts` | Unrest pressure added by rationing policy itself [0, SCALE.Q]. |
| `REACTION_TIME_COEFF` | `src/sim/sleep.ts` | Coefficient for reaction time slowdown per unit impair fraction [numeric]. |
| `REBELLION_THRESHOLD` | `src/feudal.ts` | Bond strength below this → `isRebellionRisk` returns true. |
| `REBELLION_THRESHOLD_Q` | `src/unrest.ts` | Unrest above this threshold → rebellion risk flag raised. |
| `REBELLION_TREASURY_RAID_Q` | `src/unrest.ts` | Fraction of treasury rebels plunder during an uprising or civil war. |
| `REFERENCE_ARMY_SIZE` | `src/military-campaign.ts` | Reference army size used as denominator for strength scaling. An army of this size at q(1.0) military strength = battle strength q(1.0). |
| `RELIEF_IMPORT_COST_CU_PER_SU` | `src/famine.ts` | Treasury cost in cu per supply unit of emergency food import (1 su = 1 person-day). |
| `REM_PHASE_S` | `src/sim/sleep.ts` | Duration of the REM phase per cycle [s]. |
| `RENOWN_DEPTH_DECAY_Q` | `src/kinship.ts` | Depth-decay factor for inherited renown. Each generation reduces the renown contribution by this fraction: depth 1 (parent) → q(0.50) × parent renown depth 2 (grandparent) → q(0.25) × grandparent renown |
| `RENOWN_SCALE_Q` | `src/renown.ts` | Per-event renown/infamy contribution rate. A maximum-significance (100) event contributes `RENOWN_SCALE_Q` to the score. Scales linearly with `entry.significance`: `delta = round(sig * RENOWN_SCALE_Q / 100)`. |
| `RESEARCH_COST_PER_POINT` | `src/research.ts` | Treasury cost per research point when using `investInResearch`. 10 cost-units = 1 research point. |
| `RESEARCH_POINTS_REQUIRED` | `src/research.ts` | Research points required to advance FROM each TechEra to the next. Keyed by numeric TechEra value.  `Infinity` (absent) = max era, no advancement. |
| `RESEARCH_POP_DIVISOR` | `src/research.ts` | Population divisor for base daily research units. `baseUnits = floor(population / RESEARCH_POP_DIVISOR)` — minimum 1. |
| `RICHNESS_FLOOR_Q` | `src/resources.ts` | Fraction of base yield that richness scales against [Q]. At richness q(0.50), yield = base × (0.50 + 0.50×0.50) = base × 0.75 — partial depletion still produces meaningful income. |
| `RIDER_STABILITY_INHERIT` | `src/sim/mount.ts` | Fraction of mount stability that transfers to the rider [Q]. |
| `ROUTE_DECAY_PER_DAY` | `src/trade-routes.ts` | Daily efficiency decay (without maintenance). |
| `ROUTE_QUALITY_MUL_MAX` | `src/tech-diffusion.ts` | Route quality contributes up to this multiplier on top of the base rate. routeQuality_Q = q(1.0) → +100% boost → 2× base rate. |
| `ROUTE_VIABLE_THRESHOLD` | `src/trade-routes.ts` | Route efficiency below this → `isRouteViable` returns false. |
| `SCHEMA_VERSION` | `src/schema-migration.ts` | Current schema major.minor version. Patch releases (0.1.x → 0.1.y) never change the schema. Minor releases (0.1.x → 0.2.0) may add optional fields (non-breaking). Major releases (0.x → 1.0.0) may alter required fields (breaking; migration required). |
| `SEASONAL_MODIFIERS` | `src/calendar.ts` |  |
| `SECONDS_PER_YEAR` | `src/sim/aging.ts` | Seconds in one year (non-leap). |
| `SEVERITY_DELTA_PER_DAY` | `src/famine.ts` | Cumulative severity change per day by famine phase [out of SCALE.Q]. Negative values → decay; positive values → accrual. |
| `SHARED_LOCATION_BONUS` | `src/tech-diffusion.ts` | Each additional shared location beyond 1 adds this fractional bonus. e.g., 3 shared locations → +2 × q(0.20) = +40% of base rate. |
| `SHARED_LOCATION_MAX` | `src/tech-diffusion.ts` | Maximum combined bonus from shared locations (caps at 5 locations). |
| `SHORTAGE_THRESHOLD_Q` | `src/famine.ts` | `foodSupply_Q` below this → shortage phase. |
| `SOLAR_CHURCH` | `src/faith.ts` | High-fervor monotheistic faith. |
| `SPRING_START_DAY` | `src/calendar.ts` |  |
| `STABILITY_CLEAN_SUCCESSION_Q` | `src/succession.ts` | Stability bonus when a direct child inherits with no contest. |
| `STABILITY_COEFF` | `src/sim/sleep.ts` | Coefficient for stability degradation per unit impair fraction [numeric]. |
| `STABILITY_CONTESTED_Q` | `src/succession.ts` |  |
| `STABILITY_DECAY_PER_DAY` | `src/polity.ts` | Daily stability decay absent active governance. |
| `STABILITY_DIFFUSION_THRESHOLD` | `src/tech-diffusion.ts` | Stability threshold below which a polity cannot absorb new technology. Unstable societies are too disorganised to institutionalise advances. |
| `STABILITY_DISTANT_HEIR_Q` | `src/succession.ts` | Stability penalty per extra degree of kinship beyond 1 (direct child/parent). |
| `STABILITY_NO_HEIR_Q` | `src/succession.ts` | Stability penalty when no heir is found. |
| `STABILITY_RECOVERY_PER_DAY` | `src/polity.ts` | Daily stability recovery when morale > q(0.50). |
| `SUMMER_START_DAY` | `src/calendar.ts` |  |
| `SUPPLY_DRAIN_PER_DAY_Q` | `src/siege.ts` | Supply drain per active day (independent of attacker strength). |
| `SURRENDER_SUPPLY_THRESHOLD_Q` | `src/siege.ts` | Supply below this → daily surrender check fires. |
| `TAX_REVENUE_PER_CAPITA_ANNUAL` | `src/taxation.ts` | Annual tax revenue per capita at full (q(1.0)) tax rate, keyed by TechEra. Prehistoric has no monetary economy — yield is zero. Values are in cost-units per person per year. |
| `TECH_ADVANCE_COST` | `src/polity.ts` | Treasury cost to advance one tech era (indexed by current era). Era 8 (DeepSpace) is the maximum; index 8 cost is unused. |
| `TECH_ERA_DEATH_MUL` | `src/demography.ts` | Tech-era multiplier applied to the baseline death rate. Better technology → lower mortality from disease and malnutrition. Expressed as a Q fraction of SCALE.Q. |
| `TECH_EXTRACTION_MUL` | `src/resources.ts` | Tech era extraction efficiency multiplier [Q]. Better tools, techniques, and logistics improve yield per worker. |
| `TECH_FORCE_MUL` | `src/polity.ts` | Military force multiplier by TechEra index. Higher eras give a fractional advantage on top of population and morale. |
| `TECH_SOLDIER_MUL` | `src/military-campaign.ts` | Per-soldier strength multiplier by tech era [Q/soldier]. Higher eras have better weapons, tactics, and logistics. |
| `TECH_TRADE_MUL` | `src/polity.ts` | Trade output multiplier by the *lower* of the two polities' TechEra. Advanced tech means more valuable tradeable goods. |
| `TRADE_DAYS_PER_YEAR` | `src/trade-routes.ts` | Days per year used in the daily trade fraction calculation. |
| `TRADE_RATE_PER_DAY_Q` | `src/polity.ts` | Fraction of min(treasury) exchanged as mutual trade income per day. |
| `TREATY_BASE_STRENGTH` | `src/diplomacy.ts` | Base strength at signing per treaty type. |
| `TREATY_BREAK_INFAMY` | `src/diplomacy.ts` | Infamy added to the breaker's renown record on treaty violation. Military alliances carry the gravest penalty; trade pacts the lightest. |
| `TREATY_DECAY_PER_DAY` | `src/diplomacy.ts` | Daily strength decay per treaty type (per simulated day). |
| `TREATY_FRAGILE_THRESHOLD` | `src/diplomacy.ts` | Treaty strength below this → `isTreatyFragile` returns true. |
| `TREATY_TRADE_BONUS_Q` | `src/trade-routes.ts` | Multiplier applied to both parties' income when a trade pact is active. |
| `TRIBUTE_DAYS_PER_YEAR` | `src/feudal.ts` | Tribute paid daily = `TRIBUTE_DAILY_FRAC` × annual rate × treasury_cu |
| `UNREST_ACTION_THRESHOLD_Q` | `src/unrest.ts` | Unrest above this threshold → morale and stability begin draining. |
| `UNREST_EPIDEMIC_WEIGHT_Q` | `src/unrest.ts` |  |
| `UNREST_FAMINE_WEIGHT_Q` | `src/unrest.ts` |  |
| `UNREST_FEUDAL_WEIGHT_Q` | `src/unrest.ts` |  |
| `UNREST_HERESY_WEIGHT_Q` | `src/unrest.ts` |  |
| `UNREST_MORALE_DRAIN_Q` | `src/unrest.ts` | Maximum daily morale drain from sustained unrest [Q/day]. |
| `UNREST_MORALE_WEIGHT_Q` | `src/unrest.ts` | Weights applied to each pressure source in `computeUnrestLevel`. |
| `UNREST_STABILITY_DRAIN_Q` | `src/unrest.ts` | Maximum daily stability drain from sustained unrest [Q/day]. |
| `UNREST_STABILITY_WEIGHT_Q` | `src/unrest.ts` |  |
| `UNREST_THRESHOLD` | `src/polity.ts` | Stability below this value triggers morale drain instead of recovery. |
| `VICTORY_MORALE_BONUS_Q` | `src/military-campaign.ts` |  |
| `VICTORY_TRIBUTE_Q` | `src/military-campaign.ts` | Fraction of the defeated polity's treasury taken as tribute on victory [Q]. |
| `WALL_DECAY_BASE_Q` | `src/siege.ts` | Base wall decay per active day at maximum siege strength. Actual decay = `siegeStrength_Q × WALL_DECAY_BASE_Q / SCALE.Q`. |
| `WAR_ELEPHANT` | `src/sim/mount.ts` |  |
| `WAR_LOSER_STABILITY_HIT` | `src/polity.ts` | Stability penalty applied to the losing side per war day-tick. |
| `WAR_UNCERTAINTY_Q` | `src/polity.ts` | Outcome uncertainty range in war: attacker power is scaled by [q(0.80), q(1.30)]. |
| `WAR_UNREST_PRESSURE_Q` | `src/military-campaign.ts` | Unrest pressure on attacker polity during an active campaign [Q]. Pass as extra unrest factor into Phase-90 `computeUnrestLevel`. |
| `WAR_WINNER_STABILITY_GAIN` | `src/polity.ts` | Stability bonus for the winning side per war day-tick. |
| `WARHORSE` | `src/sim/mount.ts` |  |
| `WONDER_BASE_COST_CU` | `src/wonders.ts` | Total treasury cost to construct each wonder type [cu]. Grand library is fastest; great pyramid is a generational project. |
| `WONDER_BASE_EFFECTS` | `src/wonders.ts` | Full effects for each wonder type at q(1.0) effectiveness. Damaged wonders multiply each field by `WONDER_DAMAGED_EFFECT_MUL`. |
| `WONDER_DAMAGED_EFFECT_MUL` | `src/wonders.ts` | Effect multiplier for a damaged wonder [0, SCALE.Q]. Damaged wonders still provide partial benefit; repair restores full effects. |
| `WONDER_REPAIR_COST_FRAC` | `src/wonders.ts` | Treasury cost to repair a damaged wonder, as a fraction of `WONDER_BASE_COST_CU`. Repair = `round(baseCost × WONDER_REPAIR_COST_FRAC / SCALE.Q)`. |
| `WONDER_TYPICAL_DAYS` | `src/wonders.ts` | Estimated build time in days at average investment rate. Informational only — actual duration depends on how fast the host invests. |
| `WORKER_POP_FRACTION_Q` | `src/resources.ts` | Maximum fraction of polity population that can be assigned as resource workers without impacting farming/tax base [Q]. Hosts should warn if this is exceeded. |

