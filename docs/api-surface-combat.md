# API Surface: @ananke/combat

> **Auto-generated** by `tools/extract-api.ts` — 2026-03-31  
> Do not edit by hand. Re-run `npm run extract-api` to refresh.

**Combat resolution, anatomy, grapple, ranged, competence, AI**

Total exported symbols: **221**

---

## Source files (15)

- `src/arena.ts` — 23 exports
- `src/equipment.ts` — 39 exports
- `src/extended-senses.ts` — 20 exports
- `src/faction.ts` — 18 exports
- `src/party.ts` — 30 exports
- `src/sim/ai/decide.ts` — 1 export
- `src/sim/ai/presets.ts` — 1 export
- `src/sim/combat.ts` — 5 exports
- `src/sim/grapple.ts` — 11 exports
- `src/sim/injury.ts` — 11 exports
- `src/sim/medical.ts` — 6 exports
- `src/sim/morale.ts` — 18 exports
- `src/sim/ranged.ts` — 7 exports
- `src/sim/wound-aging.ts` — 17 exports
- `src/weapons.ts` — 14 exports

---

## Types & Interfaces (44)

| Name | Source | Notes |
|------|--------|-------|
| `AmmoType` | `src/equipment.ts` | Phase 3 extension: ammo type — overrides projectile properties per shot. |
| `ArenaCombatant` | `src/arena.ts` |  |
| `ArenaExpectation` | `src/arena.ts` |  |
| `ArenaResult` | `src/arena.ts` |  |
| `ArenaScenario` | `src/arena.ts` |  |
| `ArenaTrialResult` | `src/arena.ts` |  |
| `Armour` | `src/equipment.ts` |  |
| `CarryRules` | `src/equipment.ts` |  |
| `CombatLogEntry` | `src/arena.ts` |  |
| `CoverageByRegion` | `src/equipment.ts` |  |
| `DamageType` | `src/sim/injury.ts` |  |
| `EncumbrancePenalties` | `src/equipment.ts` |  |
| `EncumbranceTotals` | `src/equipment.ts` |  |
| `Exoskeleton` | `src/equipment.ts` | Phase 11: powered exoskeleton — boosts speed and strike force at a continuous energy cost. |
| `ExtendedSensesResult` | `src/extended-senses.ts` | Result of a `stepExtendedSenses` call. |
| `Faction` | `src/faction.ts` | A named group of entities with defined relationships to other factions. |
| `FactionRegistry` | `src/faction.ts` | Persistent faction state for a scenario or campaign. `globalStanding`     — faction-to-faction base standing (initialised from rival/ally sets). `entityReputations`  — entity-level standing within factions; updated by `applyWitnessEvent`. |
| `Gear` | `src/equipment.ts` |  |
| `Handedness` | `src/equipment.ts` |  |
| `HitResolution` | `src/sim/combat.ts` |  |
| `InjuryState` | `src/sim/injury.ts` |  |
| `InjurySummary` | `src/arena.ts` |  |
| `Item` | `src/equipment.ts` |  |
| `ItemBase` | `src/equipment.ts` |  |
| `ItemId` | `src/equipment.ts` |  |
| `Loadout` | `src/equipment.ts` |  |
| `MedicalAction` | `src/sim/medical.ts` | Available treatment actions. tourniquet       — zeroes bleedingRate in one region immediately; requires ≥ bandage tier bandage          — reduces bleedingRate per tick; requires ≥ bandage tier surgery          — reduces structuralDamage per tick; clears fracture when healed; requires ≥ surgicalKit fluidReplacement — restores fluidLoss per tick; requires ≥ autodoc |
| `MedicalTier` | `src/sim/medical.ts` | Capability tier of the equipment used during treatment. Passed on TreatCommand; the kernel scales effectiveness accordingly. |
| `Party` | `src/party.ts` | A named adventuring party with a leader and members. |
| `PartyRegistry` | `src/party.ts` | Registry of all parties and their relationships. |
| `PartyStanding` | `src/party.ts` | Party-to-party standing (similar to faction standing). |
| `ProtectionProfile` | `src/equipment.ts` |  |
| `RangedWeapon` | `src/equipment.ts` |  |
| `RecoveryOutcome` | `src/arena.ts` |  |
| `RegionInjury` | `src/sim/injury.ts` |  |
| `SenseModality` | `src/extended-senses.ts` | Sensory modality used for a detection. |
| `Sensor` | `src/equipment.ts` | Phase 11C: electronic sensor suite — boosts vision and hearing range while worn. |
| `SensoryDetection` | `src/extended-senses.ts` | A single detected entity and the sense used to detect it. Multiple detections for the same `entityId` are possible (e.g. a close target may be detected by both olfaction and echolocation).  Callers should take the maximum `quality_Q` per entity for targeting decisions. |
| `Shield` | `src/equipment.ts` |  |
| `TraumaState` | `src/sim/wound-aging.ts` | PTSD-like trauma state accumulating from severe shock events. Stored on `entity.traumaState`. Reduces effective fear threshold via `deriveFearThresholdMul`. |
| `Weapon` | `src/equipment.ts` |  |
| `WeaponDamageProfile` | `src/equipment.ts` |  |
| `WitnessEvent` | `src/faction.ts` | A reputation-relevant event witnessed by a faction member. |
| `WoundAgingResult` | `src/sim/wound-aging.ts` | Outcome summary returned by `stepWoundAging`. |

## Functions (89)

| Name | Source | Notes |
|------|--------|-------|
| `addPartyMember` | `src/party.ts` | Add an entity to a party (also sets entity.party if entity is mutable). |
| `adjustedDispersionQ` | `src/sim/ranged.ts` | Adjusted dispersion (angular error in Q) accounting for shooter skill, fatigue, and aiming intensity. controlMod: [1.0, 1.5] — poor aim widens spread fatigueMod: [1.0, 1.5] — fatigue widens spread intensityMod: [1.0, 1.9] — low intensity (snap shot) widens spread |
| `applyFactionStanding` | `src/faction.ts` | Adjust the global faction-to-faction standing of `factionAId` toward `factionBId` by `delta`, clamped to [0, SCALE.Q]. Used by the Polity diplomacy system (Phase 61) to apply `standingDelta` from `resolveDiplomacy`.  The relation is one-directional; call twice with swapped arguments for a symmetric update. |
| `applyWitnessEvent` | `src/faction.ts` | Apply a witness event: adjust the actor's standing within the specified faction. Deltas are clamped to [0, SCALE.Q].  A kill of a faction member reduces the actor's standing with that faction; aiding a member increases it. |
| `areEntitiesFriendlyByParty` | `src/party.ts` | Check if two entities are friendly based on party standing. |
| `areEntitiesHostileByParty` | `src/party.ts` | Check if two entities are hostile based on party standing. |
| `arePartiesFriendly` | `src/party.ts` | Determine if two parties are friendly (won't attack). |
| `arePartiesHostile` | `src/party.ts` | Determine if two parties are hostile based on standing threshold. |
| `canDetectByThermalVision` | `src/extended-senses.ts` | Whether observer can detect subject via thermal (infrared) vision. - Requires `observer.extendedSenses.thermalVisionRange_m > 0`. - Dead entities have no thermal signature and are not detected. - Effective range: `thermalVisionRange_m × signature_Q / SCALE.Q`, further reduced by precipitation (`THERMAL_PRECIP_PENALTY`). - Unaffected by ambient light or noise. @param dist_m          Distance from observer to subject [SCALE.m]. @param precipIntensity Precipitation intensity [Q 0..SCALE.Q] from AtmosphericState. |
| `canDetectExtendedAtmospheric` | `src/extended-senses.ts` | Full detection check using all four extended modalities, with `AtmosphericState` integration for olfaction and thermal. Returns best detection quality [Q] across all active senses: - q(1.0):       vision (Phase 4) - q(0.80):      electroreception - q(0.70):      echolocation - q(0.20–0.40): olfaction (atmospheric, wind/precip dependent) - q(0.35):      thermal (heat-signature dependent) - q(0):         undetected Use this as a drop-in replacement for `canDetectExtended` when an `AtmosphericState` is available. |
| `chooseArea` | `src/sim/combat.ts` |  |
| `computeCompanionLoyalty` | `src/party.ts` | Compute loyalty of a companion (entity) towards its party leader. Loyalty is derived from relationship affinity and trust (if relationship exists). Returns Q in [0, SCALE.Q] where 0 =背叛 (betrayal imminent), SCALE.Q = absolute loyalty. |
| `computeEncumbrance` | `src/equipment.ts` |  |
| `computeLoadoutTotals` | `src/equipment.ts` |  |
| `createFactionRegistry` | `src/faction.ts` | Create a FactionRegistry pre-populated with rival/ally default standings. Only direct relations need to be specified; symmetric standings are NOT applied automatically (enemy of A is not necessarily enemy of B). |
| `createParty` | `src/party.ts` | Create a new party and add it to the registry. |
| `createPartyRegistry` | `src/party.ts` | Create an empty party registry. |
| `decideCommandsForEntity` | `src/sim/ai/decide.ts` |  |
| `deriveArmourProfile` | `src/equipment.ts` |  |
| `deriveCarryCapacityMass_kg` | `src/equipment.ts` |  |
| `deriveFearThresholdMul` | `src/sim/wound-aging.ts` | Derive the effective fear-threshold multiplier from accumulated trauma. Returns Q in [TRAUMA_FEAR_MUL_FLOOR, SCALE.Q]: q(1.0) → no trauma — fear threshold unchanged. q(0.50) → maximum trauma — entity triggers fear at half normal threshold. Usage (combat / morale layer): `effectiveFearThreshold_Q = Math.round(baseFearThreshold_Q × mul / SCALE.Q)` |
| `deriveSepsisRisk` | `src/sim/wound-aging.ts` | Compute aggregate sepsis risk (Q 0..SCALE.Q) from all infected regions. Risk increases with both the number of infected regions and their internal damage level. Returns q(0) if no infected regions. Usage: AI / medical layer reads this to prioritise treatment. |
| `deriveWeaponHandling` | `src/equipment.ts` |  |
| `deserialiseFactionRegistry` | `src/faction.ts` | Deserialise a FactionRegistry from a JSON string produced by `serialiseFactionRegistry`. |
| `deserializePartyRegistry` | `src/party.ts` | Deserialize party registry from JSON string. |
| `dominantSense` | `src/extended-senses.ts` | Returns the entity's dominant non-visual sense. Priority: electroreception > echolocation > thermal > olfaction > vision. Use this to steer AI targeting logic: - `"echolocation"` → entity can hunt in total darkness. - `"electroreception"` → entity detects living creatures at close range regardless of light, noise, or scent. - `"thermal"` → entity detects warm-bodied prey by heat signature. - `"olfaction"` → entity tracks prey by scent trail (wind-dependent). - `"vision"` → standard visual detection (default). |
| `effectiveStanding` | `src/faction.ts` | Compute effective standing of entity `a` toward entity `b`. Priority (highest first): 1. Same faction → STANDING_EXALTED 2. Entity-level reputation (`registry.entityReputations.get(a.id)?.get(b.faction)`) combined with faction default — max of the two is used. 3. Global faction-to-faction standing 4. Rival / ally default from faction definition 5. STANDING_NEUTRAL (q(0.50)) for all unknown combinations |
| `energyAtRange_J` | `src/sim/ranged.ts` | Energy remaining after ballistic drag over a given range. Linear approximation: energyFrac = max(0, 1 - range_m × dragCoeff_perM) dragCoeff_perM is a Q value: q(0.007) means 0.7% loss per metre. |
| `ensurePartySharedInventory` | `src/party.ts` |  |
| `expectMeanDuration` | `src/arena.ts` |  |
| `expectRecovery` | `src/arena.ts` |  |
| `expectResourceCost` | `src/arena.ts` |  |
| `expectSurvivalRate` | `src/arena.ts` |  |
| `expectWinRate` | `src/arena.ts` |  |
| `extractWitnessEvents` | `src/faction.ts` | Scan a TraceEvent stream and produce WitnessEvents for reputation-relevant actions (kills, assaults, aid). Only events where at least one bystander entity (not the actor or target) can detect the actor (`detectionQ ≥ WITNESS_DETECTION_THRESHOLD`) are included. Deduplication: at most one event per (actorId, eventType) per tick. @param factions  Map of entityId → factionId for the current scenario. |
| `fearDecayPerTick` | `src/sim/morale.ts` | Fear decay rate per tick. Scales with distressTolerance (stoic entities recover faster) and with nearby living ally count (cohesion effect). Returns a Q value to subtract from fearQ each tick. |
| `findExoskeleton` | `src/equipment.ts` |  |
| `findRangedWeapon` | `src/equipment.ts` |  |
| `findSensor` | `src/equipment.ts` | Phase 11C: return the first Sensor in the loadout, or null. |
| `findShield` | `src/equipment.ts` |  |
| `findWeapon` | `src/equipment.ts` |  |
| `formatArenaReport` | `src/arena.ts` | Human-readable statistical report. |
| `getPartyForEntity` | `src/party.ts` | Get party for an entity, if any. |
| `getPartyIdForEntity` | `src/party.ts` | Get party ID for an entity, if any. |
| `getPartySharedInventory` | `src/party.ts` |  |
| `getPartyStanding` | `src/party.ts` | Get standing between two parties (default NEUTRAL). |
| `getPartyStandingBetweenEntities` | `src/party.ts` | Get standing between two entities based on party membership. |
| `grappleContestScore` | `src/sim/grapple.ts` | Compute an entity's grapple contest score in Q [0.05, 0.95]. Combines: 50% peak force (normalised to human baseline) 30% technique  (controlQuality × stability) 20% body mass  (normalised to human baseline) The result is modulated by the entity's current functional state (injury, fatigue) via manipulationMul. A healthy average human scores ≈ q(0.47). |
| `groupingRadius_m` | `src/sim/ranged.ts` | Grouping radius (m in SCALE.m) at given range. groupingRadius_m = dispersionQ × range_m / SCALE.Q |
| `hasEcholocation` | `src/extended-senses.ts` | Returns `true` if the entity has echolocation capability. |
| `hasElectroreception` | `src/extended-senses.ts` | Returns `true` if the entity has electroreception capability. |
| `hasOlfaction` | `src/extended-senses.ts` | Returns `true` if the entity has olfaction (scent) capability. |
| `hasThermalVision` | `src/extended-senses.ts` | Returns `true` if the entity has thermal (infrared) vision. |
| `isRouting` | `src/sim/morale.ts` | Whether an entity is currently routing. |
| `moraleThreshold` | `src/sim/morale.ts` | Routing threshold — minimum fear to trigger retreat behaviour. Higher distressTolerance → bolder → threshold is higher. Range: q(0.50) at tolerance=0 → q(0.80) at tolerance=1. |
| `narrateRepresentativeTrial` | `src/arena.ts` | Full narrative of the median-duration trial (representative fight). Falls back to first trial if no narrative was collected. |
| `painBlocksAction` | `src/sim/morale.ts` | Deterministic pain suppression check. Returns true if pain prevents the entity from initiating an attack this tick. @param seed      - Caller supplies eventSeed(..., 0xPA15); value drives the roll. @param shock     - Entity's current shock level. @param distressTolerance - Entity's pain tolerance. |
| `painLevel` | `src/sim/morale.ts` | Effective pain level from shock (0..1), reduced by distress tolerance. painLevel = shock × (1 − distressTolerance) Returns a Q value representing probability that pain blocks voluntary action. |
| `parryLeverageQ` | `src/sim/combat.ts` |  |
| `recordTraumaEvent` | `src/sim/wound-aging.ts` | Record a traumatic shock event, accumulating PTSD-like severity. Only events at or above TRAUMA_TRIGGER_THRESHOLD (q(0.20)) register. A q(1.0) shock event contributes q(0.30) to `traumaState.severity_Q`. Mutates: entity.traumaState (created if absent). @param shockIncrement_Q  The shock delta from the triggering event (Q). |
| `recycleTicks` | `src/sim/ranged.ts` | Number of simulation ticks before the next shot can be fired. recycleTime_s is in SCALE.s units. |
| `regionKOFactor` | `src/sim/injury.ts` | Compute KO risk from CNS-critical region damage. For humanoid and any plan that uses "head"/"torso" segment ids. For other body plans, falls back gracefully to q(0) for absent segments. |
| `releaseGrapple` | `src/sim/grapple.ts` | Release a grapple link, updating both the holder and (optionally) the target. Safe to call with a null target (e.g. when target entity was already removed). |
| `removePartyMember` | `src/party.ts` | Remove an entity from a party. |
| `resolveBreakGrapple` | `src/sim/grapple.ts` | Attempt to break free from all current holders. Pair-based: each holder gets an independent contest (lower id owns the seed). On success: releaseGrapple() called for that holder. Energy drained per holder attempt regardless of outcome. |
| `resolveGrappleAttempt` | `src/sim/grapple.ts` | Attempt to initiate a grapple on the target. Contest: scoreA × intensity vs scoreB. Success probability centred at 0.50 with ±40% swing per unit score difference (mirrors melee hit formula). On success: - Attacker's grapple.holdingTargetId and gripQ are set - Target's grapple.heldByIds is updated (sorted, deduplicated) - Overwhelming leverage differential causes immediate trip (prone + small impact) On failure: grappleCooldownTicks set, energy still drained. |
| `resolveGrappleChoke` | `src/sim/grapple.ts` | Apply a choke hold: accumulates suffocation on the target. Requires position !== "standing" in tactical/sim (must be on the ground). Sufficient grip quality (> 0.60) transitions the position to "pinned" and sets target.condition.pinned. |
| `resolveGrappleJointLock` | `src/sim/grapple.ts` | Apply a joint-lock: structural damage to a target limb. Requires position !== "standing" in tactical/sim. Target limb selected deterministically (stable across seeds). Impact energy = peakForce × 0.05 m effective displacement × grip × intensity. |
| `resolveGrappleThrow` | `src/sim/grapple.ts` | Attempt to throw or trip the grappled target. Requires: attacker already holds the target (holdingTargetId === target.id). Success probability based on signed leverage differential. On success: target goes prone, kinetic impact queued, grapple released. On failure: cooldown set, energy still drained. Impact energy ∝ target mass × leverage advantage × intensity (see formula in code). |
| `resolveHit` | `src/sim/combat.ts` |  |
| `runArena` | `src/arena.ts` |  |
| `serialiseFactionRegistry` | `src/faction.ts` | Serialise a FactionRegistry to a JSON string. Handles all nested Map and Set fields (rivals, allies, globalStanding, entityReputations). |
| `serializePartyRegistry` | `src/party.ts` | Serialize party registry to JSON string. |
| `setMutualPartyStanding` | `src/party.ts` | Set mutual standing between two parties (same both ways). |
| `setPartyLeader` | `src/party.ts` | Change party leader. |
| `setPartyStanding` | `src/party.ts` | Set standing between two parties (clamped). |
| `shieldCovers` | `src/sim/combat.ts` | Returns true if `shield` covers `area`. Accepts the shield item so that future item variants (buckler, kite, tower) can override coverage by checking item tags rather than hard-coding areas here. |
| `shootCost_J` | `src/sim/ranged.ts` | Energy cost (J) of firing a shot at the given intensity. Modelled as ~50 ms draw/snap at 8% peak power for bows/throws; negligible for firearms but still costs something (aim/recoil recovery). For weapons where launchEnergy derives from the shooter (thrown), we use a larger fraction (10%) since the throw itself burns energy. |
| `stepExtendedSenses` | `src/extended-senses.ts` | Accumulate all extended-sense detections for one observer entity. Iterates all entities in `world`, skips the observer itself, and for each other entity checks all four extended modalities.  Multiple detections per target are possible and are all returned (callers take the max quality). Visual and hearing detection is **not** included — use `canDetect` (Phase 4) or `canDetectExtendedAtmospheric` for full detection checks. @param observer    The sensing entity. @param world       Current world state (iterated for targets). @param atmospheric Atmospheric state from `deriveAtmosphericState` (PA-6). @param env         Sensory environment for echolocation noise level. @returns           All detections this tick (may be empty). @example ```ts const atmo = deriveAtmosphericState(ctx.weather, ctx.biome); const result = stepExtendedSenses(bat, world, atmo, ctx.sensoryEnv ?? DEFAULT_SENSORY_ENV); for (const det of result.detections) { // det.entityId, det.modality, det.quality_Q, det.dist_Sm } ``` |
| `stepGrappleTick` | `src/sim/grapple.ts` | Per-tick maintenance for active grapples. Call once per entity per tick (regardless of whether a grapple command was issued). - Drains stamina from the holder - Decays gripQ by GRIP_DECAY_PER_TICK - Releases grapple when grip reaches 0 or target is dead/missing |
| `stepWoundAging` | `src/sim/wound-aging.ts` | Advance long-term wound state by `elapsedSeconds`. Intended for downtime / long-rest simulation (hours to weeks of elapsed time). At sub-minute resolution this function does nothing observable. Mutates: entity.injury.byRegion  (surface/internal damage healed or worsened) entity.injury.shock     (phantom pain) entity.energy.fatigue   (chronic fatigue drain) entity.traumaState      (natural severity decay) @param elapsedSeconds  Wall-clock seconds elapsed (use 86400 per game-day). @returns WoundAgingResult summary (healed, worsened, newSepsis). |
| `summariseArena` | `src/arena.ts` | Machine-readable summary (JSON-safe — no Maps or Functions). |
| `thermalSignature` | `src/extended-senses.ts` | Compute the thermal signature of an entity [Q 0..SCALE.Q]. Dead entities return q(0) — no remaining metabolic heat. Living entities radiate at least `THERMAL_BASE_SIGNATURE_Q`. Active bleeding and fever raise the signature further. |
| `thrownLaunchEnergy_J` | `src/sim/ranged.ts` | Launch energy (J) for thrown weapons derived from thrower's peak power. Models a ~100ms burst at 10% peak power. Calibration: 1200 W × 0.10 = 120 J for average human. |
| `totalBleedingRate` | `src/sim/injury.ts` |  |
| `totalInternalDamage` | `src/sim/injury.ts` |  |
| `totalStructuralDamage` | `src/sim/injury.ts` |  |
| `totalSurfaceDamage` | `src/sim/injury.ts` |  |
| `validateLoadout` | `src/equipment.ts` | Phase 11: check that every item in a loadout is usable in the given TechContext. Returns an array of error messages; empty array means the loadout is valid. |

## Constants (88)

| Name | Source | Notes |
|------|--------|-------|
| `ACTION_MIN_TIER` | `src/sim/medical.ts` | Minimum tier required for each action. |
| `AI_PRESETS` | `src/sim/ai/presets.ts` |  |
| `ALL_HISTORICAL_MELEE` | `src/weapons.ts` |  |
| `ALL_HISTORICAL_RANGED` | `src/weapons.ts` |  |
| `ALLY_COHESION` | `src/sim/morale.ts` | Additional fear decay per nearby living ally (cohesion effect). |
| `AURA_RADIUS_m` | `src/sim/morale.ts` | Radius within which leader/banner auras apply (SCALE.m units). |
| `BANNER_AURA_FEAR_REDUCTION` | `src/sim/morale.ts` | Additional fear decay per standard-bearer within AURA_RADIUS_m. |
| `BASE_DECAY` | `src/sim/morale.ts` | Base fear decay per tick, multiplied by distressTolerance. |
| `CALIBRATION_ARMED_VS_UNARMED` | `src/arena.ts` | Armed trained human vs. unarmed untrained human. Source: criminal assault literature, self-defence training studies. |
| `CALIBRATION_FIRST_AID_SAVES_LIVES` | `src/arena.ts` | Same severe knife wound, first_aid applied within onset delay = 0. Source: TCCC tourniquet outcome data. |
| `CALIBRATION_FRACTURE_RECOVERY` | `src/arena.ts` | Fresh long-bone fracture, field_medicine care, extended downtime. Source: orthopaedic rehabilitation literature. |
| `CALIBRATION_INFECTION_UNTREATED` | `src/arena.ts` | Moderate internal wound with active infection, no antibiotics, 24h downtime. Source: pre-antibiotic era wound infection mortality (Ogston, Lister era data). |
| `CALIBRATION_PLATE_ARMOUR` | `src/arena.ts` | Armoured knight vs. unarmoured swordsman, matched skill and archetype. Source: HEMA literature on plate armour effectiveness. |
| `CALIBRATION_UNTREATED_KNIFE_WOUND` | `src/arena.ts` | Post-combat entity with severe knife wound, no treatment, 60 min downtime. Source: Sperry (2013) untreated penetrating abdominal trauma mortality. |
| `CHRONIC_FATIGUE_Q_PER_DAY` | `src/sim/wound-aging.ts` | Chronic fatigue per-day rate [Q/day] applied when total permanent damage across all regions exceeds CHRONIC_FATIGUE_REGION_THRESHOLD. |
| `CHRONIC_FATIGUE_THRESHOLD` | `src/sim/wound-aging.ts` | Minimum total permanent damage (summed across all regions, relative to SCALE.Q × regionCount) to activate chronic fatigue. Approximately q(0.10) average per region. |
| `CLASSICAL_MELEE` | `src/weapons.ts` |  |
| `CLASSICAL_RANGED` | `src/weapons.ts` |  |
| `CONTEMPORARY_MELEE` | `src/weapons.ts` |  |
| `CONTEMPORARY_RANGED` | `src/weapons.ts` |  |
| `DEFAULT_CARRY_RULES` | `src/equipment.ts` |  |
| `defaultInjury` | `src/sim/injury.ts` | Create a default InjuryState for the given segment ids. When omitted, defaults to the standard humanoid six regions. |
| `defaultRegionInjury` | `src/sim/injury.ts` |  |
| `DETECT_OLFACTION_ATMO_MAX` | `src/extended-senses.ts` | Maximum olfaction detection quality. |
| `DETECT_OLFACTION_ATMO_MIN` | `src/extended-senses.ts` | Minimum olfaction detection quality when atmospheric scentStrength_Q is q(1.0). |
| `DETECT_THERMAL` | `src/extended-senses.ts` | Detection quality returned for thermal detections. |
| `EARLY_MODERN_MELEE` | `src/weapons.ts` |  |
| `EARLY_MODERN_RANGED` | `src/weapons.ts` |  |
| `FEAR_FOR_ALLY_DEATH` | `src/sim/morale.ts` | Fear added when a nearby ally is killed in the same tick. |
| `FEAR_INJURY_MUL` | `src/sim/morale.ts` | Multiplier: fear added per tick = shock × this. |
| `FEAR_OUTNUMBERED` | `src/sim/morale.ts` | Fear added per tick when enemies outnumber allies in awareness radius. |
| `FEAR_PER_SUPPRESSION_TICK` | `src/sim/morale.ts` | Fear added per tick of active suppression (incoming near-miss fire). |
| `FEAR_ROUTING_CASCADE` | `src/sim/morale.ts` | Fear added per tick when >50% of own team is already routing. |
| `FEAR_SURPRISE` | `src/sim/morale.ts` | Fear added to a defender per surprise attack (attacker undetected). |
| `FORMATION_COHESION` | `src/sim/morale.ts` | Additional fear decay per ally in a tight formation (Phase 32E). |
| `FRACTURE_THRESHOLD` | `src/sim/injury.ts` | Structural damage fraction at which a fracture is recorded. Once set, `fractured` persists until surgically cleared. |
| `GRAPPLE_JOINTLOCK_WPN` | `src/sim/grapple.ts` |  |
| `GRAPPLE_THROW_WPN` | `src/sim/grapple.ts` |  |
| `GRIP_DECAY_PER_TICK` | `src/sim/grapple.ts` |  |
| `INFECTION_WORSEN_Q_PER_DAY` | `src/sim/wound-aging.ts` | Infection worsening rate [Q/day] applied to internalDamage while infected. 3× the internal heal rate — untreated infection outpaces natural recovery. |
| `INTERNAL_HEAL_Q_PER_DAY` | `src/sim/wound-aging.ts` | Internal-damage healing rate [Q/day]. Half the surface rate — internal injuries heal more slowly. |
| `LEADER_AURA_FEAR_REDUCTION` | `src/sim/morale.ts` | Additional fear decay per leader within AURA_RADIUS_m. |
| `MEDIEVAL_MELEE` | `src/weapons.ts` |  |
| `MEDIEVAL_RANGED` | `src/weapons.ts` |  |
| `PARTY_FRIENDLY_THRESHOLD` | `src/party.ts` | Standing above this → parties will not initiate combat. |
| `PARTY_HOSTILE_THRESHOLD` | `src/party.ts` | Standing below this → parties treat each other as hostile. |
| `PARTY_STANDING_ALLIED` | `src/party.ts` |  |
| `PARTY_STANDING_ALLY` | `src/party.ts` |  |
| `PARTY_STANDING_HOSTILE` | `src/party.ts` |  |
| `PARTY_STANDING_NEUTRAL` | `src/party.ts` |  |
| `PARTY_STANDING_RIVAL` | `src/party.ts` |  |
| `PHANTOM_PAIN_Q_PER_DAY` | `src/sim/wound-aging.ts` | Phantom pain shock injection per day per qualifying fractured region [Q/day]. Scaled by the region's (permanentDamage / SCALE.Q) ratio. |
| `PHANTOM_PAIN_THRESHOLD` | `src/sim/wound-aging.ts` | Permanent-damage threshold (per region) above which a fractured region causes phantom pain during rest. |
| `PREHISTORIC_MELEE` | `src/weapons.ts` |  |
| `PREHISTORIC_RANGED` | `src/weapons.ts` |  |
| `RALLY_COOLDOWN_TICKS` | `src/sim/morale.ts` | Ticks of attack suppression after recovering from routing. |
| `RENAISSANCE_MELEE` | `src/weapons.ts` |  |
| `RENAISSANCE_RANGED` | `src/weapons.ts` |  |
| `SECONDS_PER_DAY` | `src/sim/wound-aging.ts` | Seconds per day — base unit for all per-day rates. |
| `SEPSIS_THRESHOLD` | `src/sim/wound-aging.ts` | Internal-damage threshold (Q) above which an infected region is considered to pose a sepsis risk (systemically threatening). |
| `STANDING_ALLY` | `src/faction.ts` |  |
| `STANDING_EXALTED` | `src/faction.ts` |  |
| `STANDING_FRIENDLY_THRESHOLD` | `src/faction.ts` | Standing above this → AI will not initiate combat. |
| `STANDING_HOSTILE_THRESHOLD` | `src/faction.ts` | Standing below this → AI treats target as hostile. |
| `STANDING_KOS` | `src/faction.ts` |  |
| `STANDING_NEUTRAL` | `src/faction.ts` |  |
| `STANDING_RIVAL` | `src/faction.ts` |  |
| `STARTER_AMMO` | `src/equipment.ts` |  |
| `STARTER_ARMOUR` | `src/equipment.ts` |  |
| `STARTER_ARMOUR_11C` | `src/equipment.ts` | Reflective/ablative armour items for energy and kinetic threats. |
| `STARTER_EXOSKELETONS` | `src/equipment.ts` |  |
| `STARTER_RANGED_WEAPONS` | `src/equipment.ts` |  |
| `STARTER_SENSORS` | `src/equipment.ts` | Phase 11C: sensor suites that boost vision and hearing range. |
| `STARTER_SHIELDS` | `src/equipment.ts` |  |
| `STARTER_WEAPONS` | `src/equipment.ts` |  |
| `SURFACE_HEAL_Q_PER_DAY` | `src/sim/wound-aging.ts` | Surface-damage healing rate [Q/day]. At q(0.01)/day, a fully surface-damaged region takes ~100 days to heal. |
| `THERMAL_BASE_SIGNATURE_Q` | `src/extended-senses.ts` | Thermal signature of a living entity at rest [Q]. |
| `THERMAL_BLEED_BONUS_Q` | `src/extended-senses.ts` | Additional thermal signature per bleeding body region [Q]. Warm blood on the surface raises infrared contrast. |
| `THERMAL_PRECIP_PENALTY` | `src/extended-senses.ts` | Precipitation reduces effective thermal range. At precipIntensity_Q = SCALE.Q: range × (1 - THERMAL_PRECIP_PENALTY). |
| `THERMAL_SHOCK_BONUS_Q` | `src/extended-senses.ts` | Additional thermal signature when entity shock exceeds `THERMAL_SHOCK_THRESHOLD`. Fever and inflammation elevate core temperature. |
| `THERMAL_SHOCK_THRESHOLD` | `src/extended-senses.ts` | Shock level [Q] above which a fever/inflammatory bonus applies. |
| `TICK_HZ_RANGED` | `src/sim/ranged.ts` |  |
| `TIER_MUL` | `src/sim/medical.ts` | Effectiveness multiplier per tier. Applied as: reduction = BASE_RATE × TIER_MUL × (medSkill.treatmentRateMul / SCALE.Q) |
| `TIER_RANK` | `src/sim/medical.ts` | Ordinal rank used for minimum-tier comparisons. Higher = more capable. |
| `TIER_TECH_REQ` | `src/sim/medical.ts` | Phase 11: TechCapability that must be available in TechContext to use equipment at this tier. When ctx.techCtx is provided and the capability is absent, treatment is blocked. Tiers not listed here have no technology requirement (they work in any era). |
| `TRAUMA_DECAY_Q_PER_DAY` | `src/sim/wound-aging.ts` | Trauma decay per day [Q/day] — natural recovery rate of traumaState.severity_Q. Slow: severe trauma takes months to fully resolve. |
| `TRAUMA_TRIGGER_THRESHOLD` | `src/sim/wound-aging.ts` | Minimum shock increment that registers as a traumatic event. Events below this threshold are too minor to compound PTSD-like symptoms. |
| `WITNESS_DETECTION_THRESHOLD` | `src/faction.ts` | Minimum detection quality for an entity to witness an event. |

