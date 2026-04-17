import type { TreatyType } from "../diplomacy.js";
import { SCALE } from "../units.js";
import {
  toAnankeEvolutionState,
  type AnankeEvolutionAdapterState,
  type HostRelationship,
  type HostResourceNode,
  type HostWorldEntity,
  type WorldEvolutionInput,
} from "./host-schema.js";

export const OPEN_WORLD_HOST_ADAPTER_SCHEMA_VERSION = "ananke.open-world-host-adapter.v1" as const;

export interface MetadataBuckets {
  simulation?: Record<string, unknown>;
  descriptive?: Record<string, unknown>;
  opaque?: Record<string, unknown>;
}

export interface OpenWorldRegion {
  id: string;
  name: string;
  tileCount?: number;
  climateTag?: string;
  polityId?: string;
  population?: number;
  metadata?: MetadataBuckets;
}

export interface OpenWorldSettlement {
  id: string;
  name: string;
  regionId: string;
  polityId?: string;
  population?: number;
  metadata?: MetadataBuckets;
}

export interface OpenWorldFaction {
  id: string;
  name: string;
  polityId?: string;
  treasury_cu?: number;
  population?: number;
  stabilityQ?: number;
  moraleQ?: number;
  metadata?: MetadataBuckets;
}

export interface OpenWorldResource {
  id: string;
  resourceType: string;
  regionId?: string;
  settlementId?: string;
  factionId?: string;
  stock?: number;
  metadata?: MetadataBuckets;
}

export interface OpenWorldTradeLink {
  id: string;
  sourceFactionId: string;
  targetFactionId: string;
  baseVolume_cu?: number;
  routeQualityQ?: number;
  sharedBorderCount?: number;
  treatyType?: TreatyType;
  treatyStrength_Q?: number;
  war?: boolean;
  metadata?: MetadataBuckets;
}

export interface OpenWorldEnvironment {
  climateByRegionId?: Record<string, string>;
  climateByPolity?: NonNullable<WorldEvolutionInput["simulationState"]>["climateByPolity"];
  metadata?: MetadataBuckets;
}

export interface OpenWorldLoreMetadata {
  summary?: string;
  tags?: string[];
  metadata?: MetadataBuckets;
}

export interface OpenWorldHostInput {
  schemaVersion?: string;
  worldSeed: number;
  tick?: number;
  regions: OpenWorldRegion[];
  settlements: OpenWorldSettlement[];
  factions: OpenWorldFaction[];
  resources?: OpenWorldResource[];
  tradeLinks?: OpenWorldTradeLink[];
  environment?: OpenWorldEnvironment;
  lore?: OpenWorldLoreMetadata;
  metadata?: MetadataBuckets;
}

export interface OpenWorldHostAdapterOptions {
  entityMetadataTransform?: (metadata: MetadataBuckets | undefined) => Record<string, unknown> | undefined;
  relationshipMetadataTransform?: (metadata: MetadataBuckets | undefined) => Record<string, unknown> | undefined;
  topLevelOpaqueMerge?: Record<string, unknown>;
}

export interface OpenWorldAdapterContext {
  schemaVersion: typeof OPEN_WORLD_HOST_ADAPTER_SCHEMA_VERSION;
  metadataPassthrough: Record<string, unknown>;
  factionByPolityId: Record<string, string>;
}

export interface OpenWorldMappedState {
  input: WorldEvolutionInput;
  context: OpenWorldAdapterContext;
}

export function canonicalizeOpenWorldInput(input: OpenWorldHostInput): OpenWorldHostInput {
  const environment = input.environment == null ? undefined : {
    ...(input.environment.climateByRegionId != null ? { climateByRegionId: canonicalizeStringRecord(input.environment.climateByRegionId) } : {}),
    ...(input.environment.climateByPolity != null ? {
      climateByPolity: [...input.environment.climateByPolity]
        .map((entry) => ({ polityId: entry.polityId, active: [...entry.active] }))
        .sort((a, b) => a.polityId.localeCompare(b.polityId)),
    } : {}),
    ...withOptional("metadata", canonicalizeMetadataBuckets(input.environment.metadata)),
  };

  const lore = input.lore == null ? undefined : {
    ...withOptional("summary", input.lore.summary),
    ...(input.lore.tags != null ? { tags: [...input.lore.tags].sort((a, b) => a.localeCompare(b)) } : {}),
    ...withOptional("metadata", canonicalizeMetadataBuckets(input.lore.metadata)),
  };

  return {
    schemaVersion: OPEN_WORLD_HOST_ADAPTER_SCHEMA_VERSION,
    worldSeed: Math.floor(input.worldSeed),
    tick: Math.max(0, Math.floor(input.tick ?? 0)),
    regions: [...input.regions]
      .map((region) => ({ ...region, ...withOptional("metadata", canonicalizeMetadataBuckets(region.metadata)) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    settlements: [...input.settlements]
      .map((settlement) => ({ ...settlement, ...withOptional("metadata", canonicalizeMetadataBuckets(settlement.metadata)) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    factions: [...input.factions]
      .map((faction) => ({ ...faction, ...withOptional("metadata", canonicalizeMetadataBuckets(faction.metadata)) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    ...(input.resources != null ? {
      resources: [...input.resources]
        .map((resource) => ({ ...resource, ...withOptional("metadata", canonicalizeMetadataBuckets(resource.metadata)) }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    } : {}),
    ...(input.tradeLinks != null ? {
      tradeLinks: [...input.tradeLinks]
        .map((tradeLink) => ({ ...tradeLink, ...withOptional("metadata", canonicalizeMetadataBuckets(tradeLink.metadata)) }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    } : {}),
    ...withOptional("environment", environment),
    ...withOptional("lore", lore),
    ...withOptional("metadata", canonicalizeMetadataBuckets(input.metadata)),
  };
}

export function mapOpenWorldHostToEvolutionInput(input: OpenWorldHostInput, options: OpenWorldHostAdapterOptions = {}): OpenWorldMappedState {
  const canonical = canonicalizeOpenWorldInput(input);
  const mapEntityMetadata = options.entityMetadataTransform ?? metadataToPassthrough;
  const mapRelationshipMetadata = options.relationshipMetadataTransform ?? metadataToPassthrough;

  const factionByPolityId: Record<string, string> = {};

  const entities: HostWorldEntity[] = [
    ...canonical.factions.map((faction) => {
      const polityId = faction.polityId ?? `p.${faction.id}`;
      factionByPolityId[polityId] = faction.id;
      return {
        kind: "polity" as const,
        id: polityId,
        name: faction.name,
        factionId: faction.id,
        ...withOptional("population", faction.population),
        ...withOptional("treasury_cu", faction.treasury_cu),
        ...withOptional("stabilityQ", faction.stabilityQ),
        ...withOptional("moraleQ", faction.moraleQ),
        ...withOptional("metadata", mapEntityMetadata(faction.metadata)),
      };
    }),
    ...canonical.regions.map((region) => ({
      kind: "region" as const,
      id: region.id,
      name: region.name,
      ...withOptional("polityId", region.polityId),
      ...withOptional("population", region.population),
      ...withOptional("biome", region.climateTag),
      ...withOptional("metadata", mapEntityMetadata(region.metadata)),
    })),
    ...canonical.settlements.map((settlement) => ({
      kind: "settlement" as const,
      id: settlement.id,
      name: settlement.name,
      ...withOptional("polityId", settlement.polityId),
      regionId: settlement.regionId,
      ...withOptional("population", settlement.population),
      ...withOptional("metadata", mapEntityMetadata(settlement.metadata)),
    })),
  ];

  const relationships: HostRelationship[] = [];
  for (const link of canonical.tradeLinks ?? []) {
    const sourceId = resolvePolityId(canonical.factions, link.sourceFactionId);
    const targetId = resolvePolityId(canonical.factions, link.targetFactionId);
    const routeQualityQ = clampQ(link.routeQualityQ ?? SCALE.Q);
    const metadata = mapRelationshipMetadata(link.metadata);

    if (link.sharedBorderCount != null) {
      relationships.push({
        id: `${link.id}:border`, kind: "border", sourceId, targetId,
        sharedBorderCount: Math.max(0, Math.floor(link.sharedBorderCount)),
        routeQualityQ,
        ...withOptional("metadata", metadata),
      });
    }
    if (link.baseVolume_cu != null) {
      relationships.push({
        id: `${link.id}:trade`, kind: "trade_route", sourceId, targetId,
        baseVolume_cu: Math.max(0, Math.floor(link.baseVolume_cu)),
        routeQualityQ,
        ...withOptional("metadata", metadata),
      });
    }
    if (link.treatyType != null) {
      relationships.push({
        id: `${link.id}:treaty`, kind: "treaty", sourceId, targetId,
        treatyType: link.treatyType,
        treatyStrength_Q: clampQ(link.treatyStrength_Q ?? SCALE.Q),
        ...withOptional("metadata", metadata),
      });
    }
    if (link.war === true) {
      relationships.push({ id: `${link.id}:war`, kind: "war", sourceId, targetId, ...withOptional("metadata", metadata) });
    }
  }

  const resources: HostResourceNode[] = (canonical.resources ?? []).map((resource) => ({
    id: resource.id,
    resourceType: resource.resourceType,
    ...withOptional("stock", resource.stock),
    ...withOptional("regionId", resource.regionId),
    ...withOptional("settlementId", resource.settlementId),
    ...withOptional("polityId", resource.factionId == null ? undefined : resolvePolityId(canonical.factions, resource.factionId)),
    ...withOptional("metadata", metadataToPassthrough(resource.metadata)),
  }));

  const hostMetadata = canonicalizeRecord({
    openWorld: {
      environment: canonical.environment,
      lore: canonical.lore,
      topLevelMetadata: canonical.metadata,
      ...(options.topLevelOpaqueMerge ?? {}),
    },
  }) ?? {};

  return {
    input: {
      schemaVersion: OPEN_WORLD_HOST_ADAPTER_SCHEMA_VERSION,
      worldSeed: canonical.worldSeed,
      tick: canonical.tick ?? 0,
      entities,
      relationships,
      resources,
      hostMetadata,
      ...(canonical.environment?.climateByPolity != null ? { simulationState: { climateByPolity: canonical.environment.climateByPolity } } : {}),
    },
    context: {
      schemaVersion: OPEN_WORLD_HOST_ADAPTER_SCHEMA_VERSION,
      metadataPassthrough: hostMetadata,
      factionByPolityId,
    },
  };
}

export function toAnankeEvolutionStateFromOpenWorld(input: OpenWorldHostInput, options: OpenWorldHostAdapterOptions = {}): AnankeEvolutionAdapterState {
  return toAnankeEvolutionState(mapOpenWorldHostToEvolutionInput(input, options).input);
}

function resolvePolityId(factions: OpenWorldFaction[], factionId: string): string {
  const faction = factions.find((candidate) => candidate.id === factionId);
  return faction?.polityId ?? `p.${factionId}`;
}

function clampQ(value: number): number {
  return Math.max(0, Math.min(SCALE.Q, Math.floor(value)));
}

function metadataToPassthrough(metadata: MetadataBuckets | undefined): Record<string, unknown> | undefined {
  if (metadata == null) return undefined;
  return canonicalizeRecord({
    ...withOptional("simulation", canonicalizeRecord(metadata.simulation)),
    ...withOptional("descriptive", canonicalizeRecord(metadata.descriptive)),
    ...withOptional("opaque", canonicalizeRecord(metadata.opaque)),
  });
}

function canonicalizeMetadataBuckets(metadata: MetadataBuckets | undefined): MetadataBuckets | undefined {
  if (metadata == null) return undefined;
  return {
    ...withOptional("simulation", canonicalizeRecord(metadata.simulation)),
    ...withOptional("descriptive", canonicalizeRecord(metadata.descriptive)),
    ...withOptional("opaque", canonicalizeRecord(metadata.opaque)),
  };
}

function canonicalizeStringRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

function canonicalizeRecord(record: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (record == null) return undefined;
  return Object.fromEntries(
    Object.entries(record)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, canonicalizeUnknown(value)]),
  );
}

function canonicalizeUnknown(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalizeUnknown(entry));
  if (value != null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalizeUnknown(entry)]),
    );
  }
  return value;
}

function withOptional<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  if (value === undefined) return {};
  return { [key]: value } as Partial<Record<K, V>>;
}
