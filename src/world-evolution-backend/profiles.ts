import { q } from "../units.js";
import type { WorldEvolutionRulesetId, WorldEvolutionRulesetProfile } from "./types.js";

const DEFAULT_PIPELINE_ORDER = [
  "polity",
  "governance",
  "diplomacy",
  "trade",
  "migration",
  "climate",
  "epidemic",
] as const;

const PROFILES_BY_CANONICAL_ID: Record<
  "minimal_world_history" | "polity_dynamics" | "conflict_heavy" | "climate_and_migration" | "full_world_evolution",
  WorldEvolutionRulesetProfile
> = {
  minimal_world_history: {
    id: "minimal_world_history",
    name: "Minimal World History",
    description: "Low-cost long-horizon baseline: polity core only, all other subsystems disabled.",
    pipelineOrder: DEFAULT_PIPELINE_ORDER,
    polityDayEnabled: true,
    governanceEnabled: false,
    diplomacyEnabled: false,
    tradeEnabled: false,
    migrationEnabled: false,
    epidemicEnabled: false,
    climateEnabled: false,
    governanceStabilityDaysPerStep: 0,
    treatyStrengthBoost_Q: 0,
    routeEfficiencyBoost_Q: 0,
    epidemicHealthBuffer_Q: 0,
  },
  polity_dynamics: {
    id: "polity_dynamics",
    name: "Polity Dynamics",
    description: "Political-economy focus: governance, diplomacy, and trade enabled without climate or epidemic load.",
    pipelineOrder: DEFAULT_PIPELINE_ORDER,
    polityDayEnabled: true,
    governanceEnabled: true,
    diplomacyEnabled: true,
    tradeEnabled: true,
    migrationEnabled: false,
    epidemicEnabled: false,
    climateEnabled: false,
    governanceStabilityDaysPerStep: 1,
    treatyStrengthBoost_Q: 0,
    routeEfficiencyBoost_Q: q(0.0005),
    epidemicHealthBuffer_Q: 0,
  },
  conflict_heavy: {
    id: "conflict_heavy",
    name: "Conflict Heavy",
    description: "Conflict-forward settings with weaker diplomatic/trade stabilization and no climate/epidemic overhead.",
    pipelineOrder: DEFAULT_PIPELINE_ORDER,
    polityDayEnabled: true,
    governanceEnabled: true,
    diplomacyEnabled: true,
    tradeEnabled: true,
    migrationEnabled: true,
    epidemicEnabled: false,
    climateEnabled: false,
    governanceStabilityDaysPerStep: 1,
    treatyStrengthBoost_Q: 0,
    routeEfficiencyBoost_Q: 0,
    epidemicHealthBuffer_Q: 0,
  },
  climate_and_migration: {
    id: "climate_and_migration",
    name: "Climate + Migration",
    description: "Environment and movement focus: climate + migration + epidemic pressure with lighter diplomatic/economic mechanics.",
    pipelineOrder: DEFAULT_PIPELINE_ORDER,
    polityDayEnabled: true,
    governanceEnabled: false,
    diplomacyEnabled: false,
    tradeEnabled: false,
    migrationEnabled: true,
    epidemicEnabled: true,
    climateEnabled: true,
    governanceStabilityDaysPerStep: 0,
    treatyStrengthBoost_Q: 0,
    routeEfficiencyBoost_Q: 0,
    epidemicHealthBuffer_Q: q(0.02),
  },
  full_world_evolution: {
    id: "full_world_evolution",
    name: "Full World Evolution",
    description: "Maximal backend composition: all currently integrated world-scale subsystems enabled.",
    pipelineOrder: DEFAULT_PIPELINE_ORDER,
    polityDayEnabled: true,
    governanceEnabled: true,
    diplomacyEnabled: true,
    tradeEnabled: true,
    migrationEnabled: true,
    epidemicEnabled: true,
    climateEnabled: true,
    governanceStabilityDaysPerStep: 1,
    treatyStrengthBoost_Q: 0,
    routeEfficiencyBoost_Q: 0,
    epidemicHealthBuffer_Q: 0,
  },
};

const LEGACY_ALIAS_TO_CANONICAL: Record<"balanced" | "resilience" | "expansion", keyof typeof PROFILES_BY_CANONICAL_ID> = {
  balanced: "full_world_evolution",
  resilience: "full_world_evolution",
  expansion: "full_world_evolution",
};

export function listWorldEvolutionProfiles(): WorldEvolutionRulesetProfile[] {
  return [
    PROFILES_BY_CANONICAL_ID.minimal_world_history,
    PROFILES_BY_CANONICAL_ID.polity_dynamics,
    PROFILES_BY_CANONICAL_ID.conflict_heavy,
    PROFILES_BY_CANONICAL_ID.climate_and_migration,
    PROFILES_BY_CANONICAL_ID.full_world_evolution,
  ].map(cloneProfile);
}

export function resolveWorldEvolutionProfile(
  id: WorldEvolutionRulesetId = "full_world_evolution",
): WorldEvolutionRulesetProfile {
  const canonicalId = (id in LEGACY_ALIAS_TO_CANONICAL)
    ? LEGACY_ALIAS_TO_CANONICAL[id as keyof typeof LEGACY_ALIAS_TO_CANONICAL]
    : id as keyof typeof PROFILES_BY_CANONICAL_ID;
  return cloneProfile(PROFILES_BY_CANONICAL_ID[canonicalId]);
}

export function mergeWorldEvolutionProfileWithOverrides(
  profileId: WorldEvolutionRulesetId | undefined,
  overrides: Partial<WorldEvolutionRulesetProfile> | undefined,
): WorldEvolutionRulesetProfile {
  const base = resolveWorldEvolutionProfile(profileId ?? "full_world_evolution");
  if (!overrides) return base;
  return cloneProfile({
    ...base,
    ...overrides,
    id: base.id,
    name: overrides.name ?? `${base.name} (host override)`,
    description: overrides.description ?? `${base.description} Host overrides applied deterministically.`,
    pipelineOrder: DEFAULT_PIPELINE_ORDER,
  });
}

function cloneProfile(profile: WorldEvolutionRulesetProfile): WorldEvolutionRulesetProfile {
  return {
    ...profile,
    pipelineOrder: [...profile.pipelineOrder] as WorldEvolutionRulesetProfile["pipelineOrder"],
  };
}
