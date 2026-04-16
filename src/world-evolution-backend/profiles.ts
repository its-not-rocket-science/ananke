import { q } from "../units.js";
import type { WorldEvolutionRulesetId, WorldEvolutionRulesetProfile } from "./types.js";

const PROFILES: Record<WorldEvolutionRulesetId, WorldEvolutionRulesetProfile> = {
  balanced: {
    id: "balanced",
    name: "Balanced World Evolution",
    description: "Keeps all subsystems active with conservative nudges and baseline equilibrium.",
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
  resilience: {
    id: "resilience",
    name: "Resilience-biased Evolution",
    description: "Biases toward social resilience with stronger governance and diplomatic maintenance.",
    polityDayEnabled: true,
    governanceEnabled: true,
    diplomacyEnabled: true,
    tradeEnabled: true,
    migrationEnabled: true,
    epidemicEnabled: true,
    climateEnabled: true,
    governanceStabilityDaysPerStep: 2,
    treatyStrengthBoost_Q: q(0.001),
    routeEfficiencyBoost_Q: q(0.001),
    epidemicHealthBuffer_Q: q(0.10),
  },
  expansion: {
    id: "expansion",
    name: "Expansion-biased Evolution",
    description: "Biases toward mobility and commerce; conflict side-effects may intensify.",
    polityDayEnabled: true,
    governanceEnabled: true,
    diplomacyEnabled: true,
    tradeEnabled: true,
    migrationEnabled: true,
    epidemicEnabled: true,
    climateEnabled: true,
    governanceStabilityDaysPerStep: 1,
    treatyStrengthBoost_Q: 0,
    routeEfficiencyBoost_Q: q(0.002),
    epidemicHealthBuffer_Q: q(0.05),
  },
};

export function listWorldEvolutionProfiles(): WorldEvolutionRulesetProfile[] {
  return Object.values(PROFILES).map(cloneProfile);
}

export function resolveWorldEvolutionProfile(
  id: WorldEvolutionRulesetId = "balanced",
): WorldEvolutionRulesetProfile {
  return cloneProfile(PROFILES[id]);
}

function cloneProfile(profile: WorldEvolutionRulesetProfile): WorldEvolutionRulesetProfile {
  return { ...profile };
}
