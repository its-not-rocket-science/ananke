import type { ActiveClimateEvent } from "../climate.js";
import type { Treaty } from "../diplomacy.js";
import type { PolityEpidemicState } from "../epidemic.js";
import type { GovernanceState, LawCode } from "../governance.js";
import type { MigrationFlow } from "../migration.js";
import type { Polity, PolityPair, PolityTradeResult, PolityWarResult } from "../polity.js";
import type { TradeRoute } from "../trade-routes.js";
import type { DiseaseProfile } from "../sim/disease.js";
import type { Q } from "../units.js";

export const WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION = "ananke.world-evolution-backend.v1" as const;

export type WorldEvolutionRulesetId =
  | "minimal_world_history"
  | "polity_dynamics"
  | "conflict_heavy"
  | "climate_and_migration"
  | "full_world_evolution"
  // legacy aliases kept for backward compatibility
  | "balanced"
  | "resilience"
  | "expansion";

export interface EvolutionRulesetProfile {
  id: WorldEvolutionRulesetId;
  name: string;
  description: string;
  /**
   * Explicit deterministic execution order for active subsystems.
   * Hosts can inspect this to verify reproducible orchestration order.
   */
  pipelineOrder: readonly [
    "polity",
    "governance",
    "diplomacy",
    "trade",
    "migration",
    "climate",
    "epidemic",
  ];
  polityDayEnabled: boolean;
  governanceEnabled: boolean;
  diplomacyEnabled: boolean;
  tradeEnabled: boolean;
  migrationEnabled: boolean;
  epidemicEnabled: boolean;
  climateEnabled: boolean;
  governanceStabilityDaysPerStep: number;
  treatyStrengthBoost_Q: Q;
  routeEfficiencyBoost_Q: Q;
  epidemicHealthBuffer_Q: Q;
}

export type WorldEvolutionRulesetProfile = EvolutionRulesetProfile;

export interface WorldEvolutionSnapshot {
  schemaVersion: typeof WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION;
  worldSeed: number;
  tick: number;
  polities: Polity[];
  pairs: PolityPair[];
  activeWars: Array<[string, string]>;
  treaties: Treaty[];
  tradeRoutes: TradeRoute[];
  governanceStates: GovernanceState[];
  governanceLawRegistry: LawCode[];
  epidemics: PolityEpidemicState[];
  diseases: DiseaseProfile[];
  climateByPolity: Array<{
    polityId: string;
    active: ActiveClimateEvent[];
  }>;
}

export interface WorldEvolutionRunRequest {
  snapshot: WorldEvolutionSnapshot;
  steps: number;
  profileId?: WorldEvolutionRulesetId;
  profile?: WorldEvolutionRulesetProfile;
  includeDeltas?: boolean;
  checkpointInterval?: number;
}

export interface WorldEvolutionMetrics {
  totalPopulation: number;
  totalTreasury_cu: number;
  avgStability_Q: Q;
  avgMorale_Q: Q;
  activeWars: number;
  activeTreaties: number;
  viableTradeRoutes: number;
  activeEpidemics: number;
  activeClimateEvents: number;
  migrationsThisStep: number;
  migrationsTotalPopulation: number;
}

export interface WorldEvolutionStepEvent {
  step: number;
  tick: number;
  trade: PolityTradeResult[];
  wars: PolityWarResult[];
  migrations: MigrationFlow[];
  climateEventIds: string[];
  epidemicPopulationDelta: number;
  metrics: WorldEvolutionMetrics;
}

export interface WorldEvolutionDelta {
  step: number;
  tick: number;
  polityDeltas: Array<{
    polityId: string;
    populationDelta: number;
    treasuryDelta_cu: number;
    stabilityDelta_Q: number;
    moraleDelta_Q: number;
  }>;
}

export interface WorldEvolutionCheckpoint {
  step: number;
  tick: number;
  snapshot: WorldEvolutionSnapshot;
}

export interface WorldEvolutionRunResult {
  initialSnapshot: WorldEvolutionSnapshot;
  finalSnapshot: WorldEvolutionSnapshot;
  profile: WorldEvolutionRulesetProfile;
  timeline: WorldEvolutionStepEvent[];
  metrics: WorldEvolutionMetrics;
  deltas?: WorldEvolutionDelta[];
  checkpoints?: WorldEvolutionCheckpoint[];
}
