import type { TreatyType } from "../diplomacy.js";
import type { GovernanceType } from "../governance.js";
import { PRESET_LAW_CODES } from "../governance.js";
import type { TransmissionRoute } from "../sim/disease.js";
import { TechEra as TechEraCode, type TechEra } from "../sim/tech.js";
import { SCALE } from "../units.js";
import {
  WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
  type WorldEvolutionRunRequest,
  type WorldEvolutionRunResult,
  type WorldEvolutionRulesetProfile,
  type WorldEvolutionSnapshot,
} from "./types.js";

export const HOST_WORLD_EVOLUTION_SCHEMA_VERSION = "ananke.host-world-evolution-input.v1" as const;

export interface HostRuleOverrides {
  polityDayEnabled?: boolean;
  governanceEnabled?: boolean;
  diplomacyEnabled?: boolean;
  tradeEnabled?: boolean;
  migrationEnabled?: boolean;
  epidemicEnabled?: boolean;
  climateEnabled?: boolean;
  governanceStabilityDaysPerStep?: number;
  treatyStrengthBoost_Q?: number;
  routeEfficiencyBoost_Q?: number;
  epidemicHealthBuffer_Q?: number;
}

export interface HostPolity {
  kind: "polity";
  id: string;
  name: string;
  factionId?: string;
  controlledRegionIds?: string[];
  controlledSettlementIds?: string[];
  population?: number;
  treasury_cu?: number;
  stabilityQ?: number;
  moraleQ?: number;
  techEra?: TechEra;
  governanceType?: GovernanceType;
  activeLawIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface HostSettlement {
  kind: "settlement";
  id: string;
  name: string;
  regionId?: string;
  polityId?: string;
  population?: number;
  metadata?: Record<string, unknown>;
}

export interface HostRegion {
  kind: "region";
  id: string;
  name: string;
  biome?: string;
  polityId?: string;
  population?: number;
  metadata?: Record<string, unknown>;
}

export type HostWorldEntity = HostPolity | HostSettlement | HostRegion;

export interface HostRelationship {
  id: string;
  kind: "border" | "trade_route" | "treaty" | "war";
  sourceId: string;
  targetId: string;
  sharedBorderCount?: number;
  routeQualityQ?: number;
  baseVolume_cu?: number;
  treatyType?: TreatyType;
  treatyStrength_Q?: number;
  signedTick?: number;
  expiryTick?: number;
  metadata?: Record<string, unknown>;
}

export interface HostResourceNode {
  id: string;
  polityId?: string;
  regionId?: string;
  settlementId?: string;
  resourceType: string;
  stock?: number;
  metadata?: Record<string, unknown>;
}

export interface HostDiseaseProfile {
  id: string;
  name: string;
  transmissionRoute: TransmissionRoute;
  baseTransmissionRate_Q: number;
  incubationPeriod_s: number;
  symptomaticDuration_s: number;
  mortalityRate_Q: number;
  symptomSeverity_Q: number;
  airborneRange_Sm: number;
  immunityDuration_s: number;
}

export interface HostEpidemicState {
  polityId: string;
  diseaseId: string;
  prevalence_Q: number;
}

export interface WorldEvolutionInput {
  schemaVersion?: string;
  worldSeed: number;
  tick?: number;
  entities: HostWorldEntity[];
  relationships?: HostRelationship[];
  resources?: HostResourceNode[];
  diseases?: HostDiseaseProfile[];
  epidemics?: HostEpidemicState[];
  ruleOverrides?: HostRuleOverrides;
  hostMetadata?: Record<string, unknown>;
  simulationState?: {
    climateByPolity?: WorldEvolutionSnapshot["climateByPolity"];
    governanceLawRegistry?: WorldEvolutionSnapshot["governanceLawRegistry"];
  };
}

export interface ValidationError {
  code: string;
  path: string;
  message: string;
}

export interface NormalizedWorldEvolutionInput extends WorldEvolutionInput {
  schemaVersion: typeof HOST_WORLD_EVOLUTION_SCHEMA_VERSION;
  tick: number;
  relationships: HostRelationship[];
  resources: HostResourceNode[];
  diseases: HostDiseaseProfile[];
  epidemics: HostEpidemicState[];
  entities: HostWorldEntity[];
}

export interface HostAdapterContext {
  hostMetadata?: Record<string, unknown>;
  resourceNodes: HostResourceNode[];
  relationships: HostRelationship[];
  passthrough: {
    polityMetadataById: Record<string, Record<string, unknown>>;
    regionMetadataById: Record<string, Record<string, unknown>>;
    settlementMetadataById: Record<string, Record<string, unknown>>;
  };
}

export interface AnankeEvolutionAdapterState {
  snapshot: WorldEvolutionSnapshot;
  context: HostAdapterContext;
}

export function validateWorldEvolutionInput(input: WorldEvolutionInput): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!Number.isInteger(input.worldSeed)) {
    errors.push({
      code: "invalid_world_seed",
      path: "$.worldSeed",
      message: "worldSeed must be an integer",
    });
  }

  if (input.tick != null && (!Number.isInteger(input.tick) || input.tick < 0)) {
    errors.push({
      code: "invalid_tick",
      path: "$.tick",
      message: "tick must be an integer >= 0",
    });
  }

  if (!Array.isArray(input.entities) || input.entities.length === 0) {
    errors.push({
      code: "missing_entities",
      path: "$.entities",
      message: "entities must be a non-empty array",
    });
  }

  const entityIds = new Set<string>();
  (input.entities ?? []).forEach((entity, index) => {
    const basePath = `$.entities[${index}]`;
    if (!entity.id || entity.id.trim().length === 0) {
      errors.push({ code: "missing_entity_id", path: `${basePath}.id`, message: "entity id is required" });
      return;
    }
    if (entityIds.has(entity.id)) {
      errors.push({ code: "duplicate_entity_id", path: `${basePath}.id`, message: `duplicate entity id '${entity.id}'` });
    }
    entityIds.add(entity.id);

    if (entity.kind === "polity") {
      if (!entity.name) errors.push({ code: "missing_polity_name", path: `${basePath}.name`, message: "polity name is required" });
      if (entity.population != null && entity.population < 0) {
        errors.push({ code: "invalid_polity_population", path: `${basePath}.population`, message: "population must be >= 0" });
      }
    }

    if (entity.kind === "settlement" || entity.kind === "region") {
      if (!entity.name) errors.push({ code: "missing_entity_name", path: `${basePath}.name`, message: "name is required" });
      if (entity.population != null && entity.population < 0) {
        errors.push({ code: "invalid_entity_population", path: `${basePath}.population`, message: "population must be >= 0" });
      }
    }
  });

  (input.relationships ?? []).forEach((rel, index) => {
    const basePath = `$.relationships[${index}]`;
    if (!rel.id) errors.push({ code: "missing_relationship_id", path: `${basePath}.id`, message: "relationship id is required" });
    if (!entityIds.has(rel.sourceId)) {
      errors.push({ code: "unknown_relationship_source", path: `${basePath}.sourceId`, message: `unknown entity '${rel.sourceId}'` });
    }
    if (!entityIds.has(rel.targetId)) {
      errors.push({ code: "unknown_relationship_target", path: `${basePath}.targetId`, message: `unknown entity '${rel.targetId}'` });
    }
    if (rel.kind === "border") {
      if (rel.sharedBorderCount != null && rel.sharedBorderCount < 0) {
        errors.push({ code: "invalid_shared_border", path: `${basePath}.sharedBorderCount`, message: "sharedBorderCount must be >= 0" });
      }
    }
    if (rel.kind === "trade_route") {
      if (rel.baseVolume_cu == null || rel.baseVolume_cu < 0) {
        errors.push({ code: "invalid_trade_base_volume", path: `${basePath}.baseVolume_cu`, message: "trade_route requires baseVolume_cu >= 0" });
      }
    }
    if (rel.kind === "treaty" && rel.treatyType == null) {
      errors.push({ code: "missing_treaty_type", path: `${basePath}.treatyType`, message: "treaty relationship requires treatyType" });
    }
  });

  (input.resources ?? []).forEach((resource, index) => {
    const basePath = `$.resources[${index}]`;
    if (!resource.id) errors.push({ code: "missing_resource_id", path: `${basePath}.id`, message: "resource id is required" });
    if (!resource.resourceType) errors.push({ code: "missing_resource_type", path: `${basePath}.resourceType`, message: "resourceType is required" });
    if (resource.stock != null && resource.stock < 0) {
      errors.push({ code: "invalid_resource_stock", path: `${basePath}.stock`, message: "stock must be >= 0" });
    }
    if (resource.polityId != null && !entityIds.has(resource.polityId)) {
      errors.push({ code: "unknown_resource_polity", path: `${basePath}.polityId`, message: `unknown entity '${resource.polityId}'` });
    }
  });

  const diseaseIds = new Set((input.diseases ?? []).map((d) => d.id));
  (input.epidemics ?? []).forEach((epidemic, index) => {
    const basePath = `$.epidemics[${index}]`;
    if (!entityIds.has(epidemic.polityId)) {
      errors.push({ code: "unknown_epidemic_polity", path: `${basePath}.polityId`, message: `unknown entity '${epidemic.polityId}'` });
    }
    if (!diseaseIds.has(epidemic.diseaseId)) {
      errors.push({ code: "unknown_epidemic_disease", path: `${basePath}.diseaseId`, message: `unknown disease '${epidemic.diseaseId}'` });
    }
    if (epidemic.prevalence_Q < 0) {
      errors.push({ code: "invalid_epidemic_prevalence", path: `${basePath}.prevalence_Q`, message: "prevalence_Q must be >= 0" });
    }
  });

  return errors.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
}

export function normalizeHostWorldInput(input: WorldEvolutionInput): NormalizedWorldEvolutionInput {
  const errors = validateWorldEvolutionInput(input);
  if (errors.length > 0) {
    const detail = errors.map((e) => `${e.path} [${e.code}] ${e.message}`).join("; ");
    throw new Error(`Invalid WorldEvolutionInput: ${detail}`);
  }

  return {
    ...input,
    schemaVersion: HOST_WORLD_EVOLUTION_SCHEMA_VERSION,
    tick: input.tick ?? 0,
    relationships: [...(input.relationships ?? [])]
      .map((r) => ({ ...r }))
      .sort((a, b) => `${a.kind}:${a.sourceId}:${a.targetId}:${a.id}`.localeCompare(`${b.kind}:${b.sourceId}:${b.targetId}:${b.id}`)),
    resources: [...(input.resources ?? [])]
      .map((r) => ({ ...r }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    diseases: [...(input.diseases ?? [])]
      .map((d) => ({ ...d }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    epidemics: [...(input.epidemics ?? [])]
      .map((e) => ({ ...e }))
      .sort((a, b) => `${a.polityId}:${a.diseaseId}`.localeCompare(`${b.polityId}:${b.diseaseId}`)),
    entities: [...input.entities]
      .map((entity) => ({
        ...entity,
        ...(entity.kind === "polity" ? {
          controlledRegionIds: [...(entity.controlledRegionIds ?? [])].sort(),
          controlledSettlementIds: [...(entity.controlledSettlementIds ?? [])].sort(),
          activeLawIds: [...(entity.activeLawIds ?? [])].sort(),
        } : {}),
      }))
      .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
  };
}

export function toAnankeEvolutionState(input: WorldEvolutionInput): AnankeEvolutionAdapterState {
  const normalized = normalizeHostWorldInput(input);

  const polityEntities = normalized.entities.filter((e): e is HostPolity => e.kind === "polity");
  const polityIds = new Set(polityEntities.map((p) => p.id));

  const derivedPopulationByPolity = new Map<string, number>();
  for (const entity of normalized.entities) {
    if (entity.kind !== "settlement" && entity.kind !== "region") continue;
    if (entity.polityId == null || !polityIds.has(entity.polityId)) continue;
    derivedPopulationByPolity.set(entity.polityId, (derivedPopulationByPolity.get(entity.polityId) ?? 0) + (entity.population ?? 0));
  }

  const pairs = normalized.relationships
    .filter((r) => r.kind === "border" && polityIds.has(r.sourceId) && polityIds.has(r.targetId))
    .map((r) => ({
      polityAId: r.sourceId,
      polityBId: r.targetId,
      sharedLocations: r.sharedBorderCount ?? 1,
      routeQuality_Q: clampQField(r.routeQualityQ ?? SCALE.Q),
    }));

  const activeWars = normalized.relationships
    .filter((r) => r.kind === "war" && polityIds.has(r.sourceId) && polityIds.has(r.targetId))
    .map((r) => [r.sourceId, r.targetId] as [string, string]);

  const treaties = normalized.relationships
    .filter((r) => r.kind === "treaty" && polityIds.has(r.sourceId) && polityIds.has(r.targetId) && r.treatyType != null)
    .map((r) => ({
      treatyId: r.id,
      polityAId: r.sourceId,
      polityBId: r.targetId,
      type: r.treatyType!,
      strength_Q: clampQField(r.treatyStrength_Q ?? SCALE.Q),
      signedTick: r.signedTick ?? normalized.tick,
      expiryTick: r.expiryTick ?? -1,
      tributeFromA_Q: 0,
      tributeFromB_Q: 0,
    }));

  const tradeRoutes = normalized.relationships
    .filter((r) => r.kind === "trade_route" && polityIds.has(r.sourceId) && polityIds.has(r.targetId) && r.baseVolume_cu != null)
    .map((r) => ({
      routeId: r.id,
      polityAId: r.sourceId,
      polityBId: r.targetId,
      baseVolume_cu: r.baseVolume_cu!,
      efficiency_Q: clampQField(r.routeQualityQ ?? SCALE.Q),
      establishedTick: normalized.tick,
    }));

  const governanceLawRegistry = normalized.simulationState?.governanceLawRegistry ?? PRESET_LAW_CODES;

  const snapshot: WorldEvolutionSnapshot = {
    schemaVersion: WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
    worldSeed: normalized.worldSeed,
    tick: normalized.tick,
    polities: polityEntities.map((p) => ({
      id: p.id,
      name: p.name,
      factionId: p.factionId ?? `f.${p.id}`,
      locationIds: [...(p.controlledRegionIds ?? []), ...(p.controlledSettlementIds ?? [])],
      population: p.population ?? Math.max(0, derivedPopulationByPolity.get(p.id) ?? 0),
      treasury_cu: p.treasury_cu ?? 0,
      techEra: p.techEra ?? TechEraCode.Medieval,
      militaryStrength_Q: 0,
      stabilityQ: clampQField(p.stabilityQ ?? Math.floor(SCALE.Q * 0.70)),
      moraleQ: clampQField(p.moraleQ ?? Math.floor(SCALE.Q * 0.65)),
    })),
    pairs,
    activeWars,
    treaties,
    tradeRoutes,
    governanceStates: polityEntities.map((p) => ({
      polityId: p.id,
      governanceType: p.governanceType ?? "monarchy",
      activeLawIds: [...(p.activeLawIds ?? [])],
      changeCooldown: 0,
    })),
    governanceLawRegistry: governanceLawRegistry.map((law) => ({ ...law })),
    epidemics: normalized.epidemics.map((e) => ({ ...e })),
    diseases: normalized.diseases.map((d) => ({ ...d })),
    climateByPolity: normalized.simulationState?.climateByPolity?.map((entry) => ({
      polityId: entry.polityId,
      active: entry.active.map((active) => ({
        event: { ...active.event },
        remainingDays: active.remainingDays,
        elapsedDays: active.elapsedDays,
      })),
    })) ?? [],
  };

  const context: HostAdapterContext = {
    resourceNodes: normalized.resources,
    relationships: normalized.relationships,
    passthrough: {
      polityMetadataById: Object.fromEntries(
        normalized.entities
          .filter((e): e is HostPolity => e.kind === "polity" && e.metadata != null)
          .map((p) => [p.id, p.metadata!]),
      ),
      regionMetadataById: Object.fromEntries(
        normalized.entities
          .filter((e): e is HostRegion => e.kind === "region" && e.metadata != null)
          .map((r) => [r.id, r.metadata!]),
      ),
      settlementMetadataById: Object.fromEntries(
        normalized.entities
          .filter((e): e is HostSettlement => e.kind === "settlement" && e.metadata != null)
          .map((s) => [s.id, s.metadata!]),
      ),
    },
  };
  if (normalized.hostMetadata != null) {
    context.hostMetadata = normalized.hostMetadata;
  }

  return { snapshot, context };
}

export function fromAnankeEvolutionState(
  snapshot: WorldEvolutionSnapshot,
  context?: HostAdapterContext,
): WorldEvolutionInput {
  const entities: HostWorldEntity[] = snapshot.polities.map((p) => {
    const governance = snapshot.governanceStates.find((g) => g.polityId === p.id);
    const polity: HostPolity = {
      kind: "polity",
      id: p.id,
      name: p.name,
      factionId: p.factionId,
      population: p.population,
      treasury_cu: p.treasury_cu,
      techEra: p.techEra,
      stabilityQ: p.stabilityQ,
      moraleQ: p.moraleQ,
      controlledRegionIds: [...p.locationIds],
      activeLawIds: [...(governance?.activeLawIds ?? [])],
    };
    if (governance != null) polity.governanceType = governance.governanceType;
    const metadata = context?.passthrough.polityMetadataById[p.id];
    if (metadata != null) polity.metadata = metadata;
    return polity;
  });

  const relationships: HostRelationship[] = [
    ...snapshot.pairs.map((pair, idx) => ({
      id: `border:${idx}:${pair.polityAId}:${pair.polityBId}`,
      kind: "border" as const,
      sourceId: pair.polityAId,
      targetId: pair.polityBId,
      sharedBorderCount: pair.sharedLocations,
      routeQualityQ: pair.routeQuality_Q,
    })),
    ...snapshot.tradeRoutes.map((route) => ({
      id: route.routeId,
      kind: "trade_route" as const,
      sourceId: route.polityAId,
      targetId: route.polityBId,
      baseVolume_cu: route.baseVolume_cu,
      routeQualityQ: route.efficiency_Q,
    })),
    ...snapshot.treaties.map((treaty) => ({
      id: treaty.treatyId,
      kind: "treaty" as const,
      sourceId: treaty.polityAId,
      targetId: treaty.polityBId,
      treatyType: treaty.type,
      treatyStrength_Q: treaty.strength_Q,
      signedTick: treaty.signedTick,
      expiryTick: treaty.expiryTick,
    })),
    ...snapshot.activeWars.map((pair, idx) => ({
      id: `war:${idx}:${pair[0]}:${pair[1]}`,
      kind: "war" as const,
      sourceId: pair[0],
      targetId: pair[1],
    })),
  ];

  return normalizeHostWorldInput({
    schemaVersion: HOST_WORLD_EVOLUTION_SCHEMA_VERSION,
    worldSeed: snapshot.worldSeed,
    tick: snapshot.tick,
    entities,
    relationships,
    resources: context?.resourceNodes ?? [],
    diseases: snapshot.diseases.map((disease) => ({ ...disease })),
    epidemics: snapshot.epidemics.map((epidemic) => ({ ...epidemic })),
    simulationState: {
      climateByPolity: snapshot.climateByPolity.map((entry) => ({
        polityId: entry.polityId,
        active: entry.active.map((active) => ({
          event: { ...active.event },
          remainingDays: active.remainingDays,
          elapsedDays: active.elapsedDays,
        })),
      })),
      governanceLawRegistry: snapshot.governanceLawRegistry.map((law) => ({ ...law })),
    },
    ...(context?.hostMetadata != null ? { hostMetadata: context.hostMetadata } : {}),
  });
}

export function toWorldEvolutionRunRequest(
  input: WorldEvolutionInput,
  steps: number,
  options: Pick<WorldEvolutionRunRequest, "includeDeltas" | "checkpointInterval"> = {},
): WorldEvolutionRunRequest {
  const adapterState = toAnankeEvolutionState(input);
  const request: WorldEvolutionRunRequest = {
    snapshot: adapterState.snapshot,
    steps,
    ...options,
  };

  if (input.ruleOverrides != null) {
    request.profile = toInlineRuleset(input.ruleOverrides);
  }

  return request;
}

export function fromWorldEvolutionRunResult(
  result: WorldEvolutionRunResult,
  context?: HostAdapterContext,
): WorldEvolutionInput {
  return fromAnankeEvolutionState(result.finalSnapshot, context);
}

function toInlineRuleset(overrides: HostRuleOverrides): WorldEvolutionRulesetProfile {
  return {
    id: "balanced",
    name: "host-overrides",
    description: "Inline host-provided overrides",
    polityDayEnabled: overrides.polityDayEnabled ?? true,
    governanceEnabled: overrides.governanceEnabled ?? true,
    diplomacyEnabled: overrides.diplomacyEnabled ?? true,
    tradeEnabled: overrides.tradeEnabled ?? true,
    migrationEnabled: overrides.migrationEnabled ?? true,
    epidemicEnabled: overrides.epidemicEnabled ?? true,
    climateEnabled: overrides.climateEnabled ?? true,
    governanceStabilityDaysPerStep: overrides.governanceStabilityDaysPerStep ?? 1,
    treatyStrengthBoost_Q: clampQField(overrides.treatyStrengthBoost_Q ?? 0),
    routeEfficiencyBoost_Q: clampQField(overrides.routeEfficiencyBoost_Q ?? 0),
    epidemicHealthBuffer_Q: clampQField(overrides.epidemicHealthBuffer_Q ?? 0),
  };
}

function clampQField(value: number): number {
  return Math.max(0, Math.min(SCALE.Q, Math.floor(value)));
}
