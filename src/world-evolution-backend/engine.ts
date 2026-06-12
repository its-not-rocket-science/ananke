import {
  aggregateClimateEffects,
  generateClimateEvent,
  isClimateEventExpired,
  stepClimateEvent,
  type ActiveClimateEvent,
} from "../climate.js";
import {
  isTreatyExpired,
  stepTreatyStrength,
  type Treaty,
} from "../diplomacy.js";
import {
  computeEpidemicDeathPressure,
  deriveHealthCapacity,
  stepEpidemic,
  type PolityEpidemicState,
} from "../epidemic.js";
import {
  computeGovernanceModifiers,
  stepGovernanceCooldown,
  stepGovernanceStability,
  type GovernanceState,
  type LawCode,
} from "../governance.js";
import {
  applyMigrationFlows,
  resolveMigration,
  type MigrationFlow,
} from "../migration.js";
import {
  createPolityRegistry,
  stepPolityDay,
  type Polity,
  type PolityPair,
  type PolityRegistry,
  type PolityWarResult,
} from "../polity.js";
import {
  applyDailyTrade,
  isRouteViable,
  routeKey,
  stepRouteEfficiency,
  type TradeRoute,
} from "../trade-routes.js";
import { hashString } from "../sim/seeds.js";
import { SCALE, clampQ } from "../units.js";
import { listWorldEvolutionProfiles, mergeWorldEvolutionProfileWithOverrides } from "./profiles.js";
import {
  WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
  type WorldEvolutionCheckpoint,
  type WorldEvolutionDelta,
  type WorldEvolutionMetrics,
  type WorldEvolutionRunRequest,
  type WorldEvolutionRunResult,
  type WorldEvolutionRulesetProfile,
  type WorldEvolutionSnapshot,
  type WorldEvolutionStepEvent,
} from "./types.js";

interface RuntimeState {
  profile: WorldEvolutionRulesetProfile;
  snapshot: WorldEvolutionSnapshot;
  polityRegistry: PolityRegistry;
  lawRegistry: Map<string, LawCode>;
  governanceByPolity: Map<string, GovernanceState>;
  treaties: Map<string, Treaty>;
  routes: Map<string, TradeRoute>;
  epidemicsByPolity: Map<string, PolityEpidemicState[]>;
  diseasesById: Map<string, WorldEvolutionSnapshot["diseases"][number]>;
  climateByPolity: Map<string, ActiveClimateEvent[]>;
}

export function runWorldEvolution(request: WorldEvolutionRunRequest): WorldEvolutionRunResult {
  const steps = Math.max(0, Math.floor(request.steps));
  const initialSnapshot = normalizeSnapshot(request.snapshot);
  const runtime = createRuntimeState(initialSnapshot, request);

  const timeline: WorldEvolutionStepEvent[] = [];
  const deltas: WorldEvolutionDelta[] = [];
  const checkpoints: WorldEvolutionCheckpoint[] = [];

  for (let step = 1; step <= steps; step++) {
    const before = snapshotPolityStats(runtime.snapshot.polities);
    const event = evolveSingleStep(runtime, step);
    timeline.push(event);

    if (request.includeDeltas) {
      deltas.push(buildDelta(step, runtime.snapshot.tick, before, runtime.snapshot.polities));
    }
    if (request.checkpointInterval != null && request.checkpointInterval > 0 && step % request.checkpointInterval === 0) {
      checkpoints.push({
        step,
        tick: runtime.snapshot.tick,
        snapshot: exportSnapshot(runtime),
      });
    }
  }

  const finalSnapshot = exportSnapshot(runtime);
  const result: WorldEvolutionRunResult = {
    initialSnapshot,
    finalSnapshot,
    profile: runtime.profile,
    timeline,
    metrics: computeWorldMetrics(runtime, [], 0),
  };

  if (request.includeDeltas) result.deltas = deltas;
  if (request.checkpointInterval != null && request.checkpointInterval > 0) result.checkpoints = checkpoints;
  return result;
}

export function createWorldEvolutionSnapshot(snapshot: WorldEvolutionSnapshot): WorldEvolutionSnapshot {
  return normalizeSnapshot(snapshot);
}

export function listAvailableWorldEvolutionProfiles(): WorldEvolutionRulesetProfile[] {
  return listWorldEvolutionProfiles();
}

function createRuntimeState(snapshot: WorldEvolutionSnapshot, request: WorldEvolutionRunRequest): RuntimeState {
  const profile = mergeWorldEvolutionProfileWithOverrides(request.profileId, request.profile);

  const polityRegistry = createPolityRegistry(snapshot.polities.map(clonePolity));
  for (const [a, b] of snapshot.activeWars) {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    polityRegistry.activeWars.add(key);
  }

  const treaties = new Map(snapshot.treaties.map((t) => [t.treatyId, { ...t }]));
  const routes = new Map(snapshot.tradeRoutes.map((r) => [r.routeId, { ...r }]));
  const governanceByPolity = new Map(snapshot.governanceStates.map((g) => [g.polityId, { ...g, activeLawIds: [...g.activeLawIds] }]));
  const lawRegistry = new Map(snapshot.governanceLawRegistry.map((law) => [law.lawId, { ...law }]));

  const epidemicsByPolity = new Map<string, PolityEpidemicState[]>();
  for (const e of snapshot.epidemics) {
    const list = epidemicsByPolity.get(e.polityId) ?? [];
    list.push({ ...e });
    epidemicsByPolity.set(e.polityId, list);
  }

  const diseasesById = new Map(snapshot.diseases.map((d) => [d.id, { ...d }]));
  const climateByPolity = new Map(
    snapshot.climateByPolity.map((entry) => [entry.polityId, entry.active.map(cloneClimateEvent)]),
  );

  return {
    profile,
    snapshot: normalizeSnapshot({
      ...snapshot,
      polities: [...polityRegistry.polities.values()],
      activeWars: [...snapshot.activeWars],
      treaties: [...treaties.values()],
      tradeRoutes: [...routes.values()],
      governanceStates: [...governanceByPolity.values()],
      governanceLawRegistry: [...lawRegistry.values()],
      epidemics: [...snapshot.epidemics],
      diseases: [...diseasesById.values()],
      climateByPolity: [...climateByPolity.entries()].map(([polityId, active]) => ({ polityId, active })),
    }),
    polityRegistry,
    lawRegistry,
    governanceByPolity,
    treaties,
    routes,
    epidemicsByPolity,
    diseasesById,
    climateByPolity,
  };
}

function evolveSingleStep(runtime: RuntimeState, step: number): WorldEvolutionStepEvent {
  const { snapshot, polityRegistry, profile } = runtime;
  const tick = snapshot.tick;

  const polityDayResult = profile.polityDayEnabled
    ? stepPolityDay(polityRegistry, snapshot.pairs, snapshot.worldSeed, tick)
    : { trade: [], moraleDeltas: new Map(), stabilityDeltas: new Map() };

  const wars = applyWarEffectsForMetrics(polityRegistry, snapshot.worldSeed, tick);

  if (profile.governanceEnabled) {
    for (const polity of sortedPolities(polityRegistry)) {
      const state = runtime.governanceByPolity.get(polity.id);
      if (!state) continue;
      stepGovernanceCooldown(state, 1);
      stepGovernanceStability(polity, state, profile.governanceStabilityDaysPerStep, runtime.lawRegistry);
      const modifiers = computeGovernanceModifiers(state, runtime.lawRegistry);
      const taxDaily = Math.floor(polity.population * modifiers.taxEfficiencyMul_Q / SCALE.Q / 1000);
      polity.treasury_cu += Math.max(0, taxDaily);
    }
  }

  if (profile.diplomacyEnabled) {
    for (const treaty of [...runtime.treaties.values()].sort((a, b) => a.treatyId.localeCompare(b.treatyId))) {
      stepTreatyStrength(treaty, profile.treatyStrengthBoost_Q);
      if (isTreatyExpired(treaty, tick) || treaty.strength_Q <= 0) {
        runtime.treaties.delete(treaty.treatyId);
      }
    }
  }

  if (profile.tradeEnabled) {
    for (const route of [...runtime.routes.values()].sort((a, b) => a.routeId.localeCompare(b.routeId))) {
      stepRouteEfficiency(route, profile.routeEfficiencyBoost_Q);
      const polityA = polityRegistry.polities.get(route.polityAId);
      const polityB = polityRegistry.polities.get(route.polityBId);
      if (!polityA || !polityB) continue;
      const hasTradePact = hasTreaty(runtime.treaties, route.polityAId, route.polityBId, "trade_pact");
      applyDailyTrade(polityA, polityB, route, hasTradePact);
    }
  }

  const migrations = profile.migrationEnabled
    ? resolveMigration([...polityRegistry.polities.values()], buildMigrationContext(polityRegistry))
    : [];
  if (profile.migrationEnabled) {
    applyMigrationFlows(polityRegistry, migrations);
  }

  let epidemicPopulationDelta = 0;
  const climateEventIds: string[] = [];

  if (profile.climateEnabled || profile.epidemicEnabled) {
    for (const polity of sortedPolities(polityRegistry)) {
      const climateEvents = runtime.climateByPolity.get(polity.id) ?? [];

      if (profile.climateEnabled) {
        const generated = generateClimateEvent(hashString(polity.id), snapshot.worldSeed, tick);
        if (generated) {
          climateEvents.push({ event: generated, remainingDays: generated.durationDays, elapsedDays: 0 });
          climateEventIds.push(generated.eventId);
        }
      }

      const climateEffects = aggregateClimateEffects(climateEvents);
      polity.stabilityQ = clampQ(polity.stabilityQ - climateEffects.unrestPressure_Q, 0, SCALE.Q);

      if (profile.epidemicEnabled) {
        const states = runtime.epidemicsByPolity.get(polity.id) ?? [];
        const health = clampQ(deriveHealthCapacity(polity) + profile.epidemicHealthBuffer_Q - climateEffects.epidemicGrowthBonus_Q, 0, SCALE.Q);

        for (const state of states) {
          const disease = runtime.diseasesById.get(state.diseaseId);
          if (!disease) continue;
          stepEpidemic(state, disease, 1, health);
          const deathPressure_Q = computeEpidemicDeathPressure(state, disease);
          const deathFromEpidemic = Math.floor(polity.population * deathPressure_Q / SCALE.Q);
          const deathFromClimate = Math.floor(polity.population * climateEffects.deathPressure_Q / SCALE.Q / 100);
          const totalDeaths = Math.max(0, deathFromEpidemic + deathFromClimate);
          polity.population = Math.max(0, polity.population - totalDeaths);
          epidemicPopulationDelta -= totalDeaths;
        }
      }

      if (profile.climateEnabled) {
        for (const active of climateEvents) {
          stepClimateEvent(active, 1);
        }
        runtime.climateByPolity.set(polity.id, climateEvents.filter((a) => !isClimateEventExpired(a)));
      }
    }
  }

  snapshot.tick += 1;
  syncRuntimeSnapshot(runtime);

  return {
    step,
    tick: snapshot.tick,
    trade: polityDayResult.trade,
    wars,
    migrations,
    climateEventIds,
    epidemicPopulationDelta,
    metrics: computeWorldMetrics(runtime, migrations, epidemicPopulationDelta),
  };
}

function applyWarEffectsForMetrics(
  registry: PolityRegistry,
  worldSeed: number,
  tick: number,
): PolityWarResult[] {
  // Wars are already stepped inside stepPolityDay; this returns a deterministic log representation.
  const wars: PolityWarResult[] = [];
  for (const pair of [...registry.activeWars].sort()) {
    const [aId, bId] = pair.split(":");
    if (!aId || !bId) continue;
    const attacker = registry.polities.get(aId);
    const defender = registry.polities.get(bId);
    if (!attacker || !defender) continue;
    wars.push({
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerWins: attacker.militaryStrength_Q >= defender.militaryStrength_Q,
      stabilityDeltaAttacker: 0,
      stabilityDeltaDefender: 0,
      territoryGained: [],
    });
    // worldSeed and tick remain part of signature to preserve deterministic call-site identity.
    void worldSeed;
    void tick;
  }
  return wars;
}

function buildMigrationContext(registry: PolityRegistry): Map<string, { polityId: string; isAtWar: boolean }> {
  const atWar = new Set<string>();
  for (const pair of registry.activeWars) {
    const [a, b] = pair.split(":");
    if (!a || !b) continue;
    atWar.add(a);
    atWar.add(b);
  }

  const out = new Map<string, { polityId: string; isAtWar: boolean }>();
  for (const polity of registry.polities.values()) {
    out.set(polity.id, { polityId: polity.id, isAtWar: atWar.has(polity.id) });
  }
  return out;
}

function hasTreaty(
  treaties: Map<string, Treaty>,
  polityAId: string,
  polityBId: string,
  type: Treaty["type"],
): boolean {
  const lo = polityAId < polityBId ? polityAId : polityBId;
  const hi = polityAId < polityBId ? polityBId : polityAId;
  const expected = `${lo}:${hi}:${type}`;
  return treaties.has(expected);
}

function computeWorldMetrics(
  runtime: RuntimeState,
  migrations: MigrationFlow[],
  migrationsTotalPopulation: number,
): WorldEvolutionMetrics {
  const polities = [...runtime.polityRegistry.polities.values()];
  const totalPopulation = polities.reduce((sum, p) => sum + p.population, 0);
  const totalTreasury_cu = polities.reduce((sum, p) => sum + p.treasury_cu, 0);
  const avgStability_Q = polities.length > 0
    ? Math.floor(polities.reduce((sum, p) => sum + p.stabilityQ, 0) / polities.length)
    : 0;
  const avgMorale_Q = polities.length > 0
    ? Math.floor(polities.reduce((sum, p) => sum + p.moraleQ, 0) / polities.length)
    : 0;

  return {
    totalPopulation,
    totalTreasury_cu,
    avgStability_Q,
    avgMorale_Q,
    activeWars: runtime.polityRegistry.activeWars.size,
    activeTreaties: runtime.treaties.size,
    viableTradeRoutes: [...runtime.routes.values()].filter(isRouteViable).length,
    activeEpidemics: [...runtime.epidemicsByPolity.values()].reduce((sum, list) => sum + list.length, 0),
    activeClimateEvents: [...runtime.climateByPolity.values()].reduce((sum, list) => sum + list.length, 0),
    migrationsThisStep: migrations.length,
    migrationsTotalPopulation,
  };
}

function syncRuntimeSnapshot(runtime: RuntimeState): void {
  runtime.snapshot.polities = sortedPolities(runtime.polityRegistry).map(clonePolity);
  runtime.snapshot.activeWars = [...runtime.polityRegistry.activeWars]
    .sort()
    .map((pair) => pair.split(":") as [string, string]);
  runtime.snapshot.treaties = [...runtime.treaties.values()].sort((a, b) => a.treatyId.localeCompare(b.treatyId)).map((t) => ({ ...t }));
  runtime.snapshot.tradeRoutes = [...runtime.routes.values()].sort((a, b) => a.routeId.localeCompare(b.routeId)).map((r) => ({ ...r }));
  runtime.snapshot.governanceStates = [...runtime.governanceByPolity.values()]
    .sort((a, b) => a.polityId.localeCompare(b.polityId))
    .map((g) => ({ ...g, activeLawIds: [...g.activeLawIds] }));
  runtime.snapshot.epidemics = [...runtime.epidemicsByPolity.values()].flat().map((e) => ({ ...e }));
  runtime.snapshot.climateByPolity = [...runtime.climateByPolity.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([polityId, active]) => ({ polityId, active: active.map(cloneClimateEvent) }));
}

function exportSnapshot(runtime: RuntimeState): WorldEvolutionSnapshot {
  syncRuntimeSnapshot(runtime);
  return normalizeSnapshot(runtime.snapshot);
}

function normalizeSnapshot(snapshot: WorldEvolutionSnapshot): WorldEvolutionSnapshot {
  return {
    schemaVersion: WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
    worldSeed: snapshot.worldSeed,
    tick: snapshot.tick,
    polities: [...snapshot.polities].map(clonePolity).sort((a, b) => a.id.localeCompare(b.id)),
    pairs: [...snapshot.pairs].map((p) => ({ ...p })).sort((a, b) => routeKey(a.polityAId, a.polityBId).localeCompare(routeKey(b.polityAId, b.polityBId))),
    activeWars: [...snapshot.activeWars].map((pair) => sortWarPair(pair)).sort((a, b) => `${a[0]}:${a[1]}`.localeCompare(`${b[0]}:${b[1]}`)),
    treaties: [...snapshot.treaties].map((t) => ({ ...t })).sort((a, b) => a.treatyId.localeCompare(b.treatyId)),
    tradeRoutes: [...snapshot.tradeRoutes].map((r) => ({ ...r })).sort((a, b) => a.routeId.localeCompare(b.routeId)),
    governanceStates: [...snapshot.governanceStates].map((g) => ({ ...g, activeLawIds: [...g.activeLawIds] })).sort((a, b) => a.polityId.localeCompare(b.polityId)),
    governanceLawRegistry: [...snapshot.governanceLawRegistry].map((law) => ({ ...law })).sort((a, b) => a.lawId.localeCompare(b.lawId)),
    epidemics: [...snapshot.epidemics].map((e) => ({ ...e })).sort((a, b) => `${a.polityId}:${a.diseaseId}`.localeCompare(`${b.polityId}:${b.diseaseId}`)),
    diseases: [...snapshot.diseases].map((d) => ({ ...d })).sort((a, b) => a.id.localeCompare(b.id)),
    climateByPolity: [...snapshot.climateByPolity]
      .map((entry) => ({ polityId: entry.polityId, active: entry.active.map(cloneClimateEvent) }))
      .sort((a, b) => a.polityId.localeCompare(b.polityId)),
  };
}

function sortWarPair([a, b]: [string, string]): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function sortedPolities(registry: PolityRegistry): Polity[] {
  return [...registry.polities.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function clonePolity(polity: Polity): Polity {
  return {
    ...polity,
    locationIds: [...polity.locationIds],
  };
}

function cloneClimateEvent(active: ActiveClimateEvent): ActiveClimateEvent {
  return {
    event: {
      ...active.event,
    },
    remainingDays: active.remainingDays,
    elapsedDays: active.elapsedDays,
  };
}

function snapshotPolityStats(polities: Polity[]): Map<string, { population: number; treasury: number; stability: number; morale: number }> {
  const map = new Map<string, { population: number; treasury: number; stability: number; morale: number }>();
  for (const polity of polities) {
    map.set(polity.id, {
      population: polity.population,
      treasury: polity.treasury_cu,
      stability: polity.stabilityQ,
      morale: polity.moraleQ,
    });
  }
  return map;
}

function buildDelta(
  step: number,
  tick: number,
  before: Map<string, { population: number; treasury: number; stability: number; morale: number }>,
  afterPolities: Polity[],
): WorldEvolutionDelta {
  const polityDeltas = [...afterPolities]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => {
      const prev = before.get(p.id);
      return {
        polityId: p.id,
        populationDelta: p.population - (prev?.population ?? 0),
        treasuryDelta_cu: p.treasury_cu - (prev?.treasury ?? 0),
        stabilityDelta_Q: p.stabilityQ - (prev?.stability ?? 0),
        moraleDelta_Q: p.moraleQ - (prev?.morale ?? 0),
      };
    });

  return { step, tick, polityDeltas };
}
