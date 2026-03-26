# Changelog

All notable changes to Ananke are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

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
