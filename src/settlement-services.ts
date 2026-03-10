// src/settlement-services.ts — Phase 44: Settlement Services Integration
//
// Service availability, pricing, and quest generation for settlements.
// Integrates with economy (Phase 25), quests (Phase 41), and competence (Phase 40).

import type { Q } from "./units.js";
import { q, SCALE, qMul } from "./units.js";
import type { Settlement, AvailableServices, FacilityLevel } from "./settlement.js";
import { getAvailableServices, SETTLEMENT_TIER_NAMES } from "./settlement.js";
import type { QuestTemplate } from "./quest-generators.js";

// ── Service Pricing ────────────────────────────────────────────────────────────

export interface ServicePricing {
  baseCost: number;
  currency: string;
  settlementMultiplier: number; // Based on market level
  availability: boolean;
}

/** Get repair service pricing for a settlement. */
export function getRepairPricing(
  settlement: Settlement,
  itemValue: number,
  damageLevel: Q, // 0-1 scale
): { cost: number; canRepair: boolean; qualityBonus_Q: Q } {
  const services = getAvailableServices(settlement);

  if (!services.repair) {
    return { cost: 0, canRepair: false, qualityBonus_Q: q(0) };
  }

  // Base cost scales with item value and damage
  const baseCost = Math.round(itemValue * 0.1 * (damageLevel / SCALE.Q));

  // Apply market discount
  const discountMul = SCALE.Q - services.marketDiscount_Q;
  const cost = Math.round((baseCost * discountMul) / SCALE.Q);

  return {
    cost: Math.max(1, cost),
    canRepair: true,
    qualityBonus_Q: services.repairQualityBonus_Q,
  };
}

/** Get medical service pricing. */
export function getMedicalPricing(
  settlement: Settlement,
  careLevel: "treatment" | "surgery" | "recovery",
): { cost: number; available: boolean; careQuality: number } {
  const services = getAvailableServices(settlement);

  if (services.medicalCare === "none") {
    return { cost: 0, available: false, careQuality: 0 };
  }

  const careQualityMap: Record<string, number> = {
    none: 0,
    basic: 1,
    skilled: 2,
    expert: 3,
    master: 4,
  };

  const baseCosts = {
    treatment: 50,
    surgery: 200,
    recovery: 20,
  };

  const careQuality = careQualityMap[services.medicalCare] ?? 0;
  const costMultiplier = careLevel === "surgery" ? careQuality * 0.5 + 1 : 1;

  return {
    cost: Math.round(baseCosts[careLevel] * costMultiplier),
    available: true,
    careQuality: careQuality as number,
  };
}

/** Get training service pricing. */
export function getTrainingPricing(
  settlement: Settlement,
  hours: number,
): { cost: number; available: boolean; xpBonus_Q: Q } {
  const services = getAvailableServices(settlement);

  if (!services.training) {
    return { cost: 0, available: false, xpBonus_Q: q(0) };
  }

  const hourlyRate = 10; // Currency per hour
  const discountMul = SCALE.Q - services.marketDiscount_Q;
  const cost = Math.round((hourlyRate * hours * discountMul) / SCALE.Q);

  return {
    cost: Math.max(1, cost),
    available: true,
    xpBonus_Q: services.trainingBonus_Q,
  };
}

// ── Quest Generation ───────────────────────────────────────────────────────────

export interface SettlementQuestNeed {
  type: string;
  priority: number; // 1-10
  description: string;
  suggestedReward: number;
}

/** Generate settlement needs that can become quests. */
export function generateSettlementNeeds(settlement: Settlement): SettlementQuestNeed[] {
  const needs: SettlementQuestNeed[] = [];

  // Check for low facilities that need upgrading
  const facilities = settlement.facilities;
  const facilityNames: (keyof typeof facilities)[] = ["forge", "medical", "market", "barracks", "temple"];

  for (const facility of facilityNames) {
    const level = facilities[facility];
    if (level < 2 && settlement.tier >= 2) {
      needs.push({
        type: "construction",
        priority: 5 + (2 - level) * 2,
        description: `Upgrade ${facility} to support growing population`,
        suggestedReward: 100 * (level + 1),
      });
    }
  }

  // Food shortage
  if (settlement.foodSurplus_Q < q(0.3)) {
    needs.push({
      type: "supply",
      priority: 9,
      description: "Food shortage threatening population",
      suggestedReward: 200,
    });
  }

  // Recent raid → defense need
  if (settlement.safetyStatus.ticksSinceLastRaid < 100) {
    needs.push({
      type: "defense",
      priority: 8,
      description: "Recent raid requires improved defenses",
      suggestedReward: 300,
    });
  }

  // Medical need if high population, low medical facility
  if (settlement.population > 100 && facilities.medical < 2) {
    needs.push({
      type: "medical",
      priority: 6,
      description: "Population needs better medical facilities",
      suggestedReward: 150,
    });
  }

  // Generic settlement needs based on tier
  if (settlement.tier >= 1) {
    needs.push({
      type: "patrol",
      priority: 4,
      description: `Patrol roads near ${settlement.name}`,
      suggestedReward: 100,
    });

    needs.push({
      type: "delivery",
      priority: 3,
      description: "Deliver goods to nearby settlement",
      suggestedReward: 75,
    });
  }

  return needs.sort((a, b) => b.priority - a.priority);
}

/** Select the highest priority need and convert to quest template. */
export function selectQuestNeed(
  settlement: Settlement,
  needs?: SettlementQuestNeed[],
): SettlementQuestNeed | undefined {
  const settlementNeeds = needs ?? generateSettlementNeeds(settlement);
  if (settlementNeeds.length === 0) return undefined;

  // Return highest priority need
  return settlementNeeds[0];
}

// ── Service Descriptions ───────────────────────────────────────────────────────

export interface ServiceDescription {
  name: string;
  description: string;
  available: boolean;
  quality: string;
  costEstimate: string;
}

/** Get descriptions of all available services for UI/display. */
export function getServiceDescriptions(settlement: Settlement): ServiceDescription[] {
  const services = getAvailableServices(settlement);
  const descriptions: ServiceDescription[] = [];

  // Repair
  if (services.repair) {
    descriptions.push({
      name: "Repair Services",
      description: "Weapon and armour repair",
      available: true,
      quality: getQualityLabel(services.repairQualityBonus_Q),
      costEstimate: "10% of item value",
    });
  }

  // Medical
  if (services.medicalCare !== "none") {
    descriptions.push({
      name: "Medical Care",
      description: "Wound treatment and surgery",
      available: true,
      quality: services.medicalCare,
      costEstimate: services.medicalCare === "basic" ? "50-200" : "100-500",
    });
  }

  // Training
  if (services.training) {
    descriptions.push({
      name: "Training Grounds",
      description: "Combat skill training",
      available: true,
      quality: getQualityLabel(services.trainingBonus_Q),
      costEstimate: "10 per hour",
    });
  }

  // Market
  if (services.market) {
    const discount = Math.round((services.marketDiscount_Q / SCALE.Q) * 100);
    descriptions.push({
      name: "Market",
      description: "Buy and sell goods",
      available: true,
      quality: `${discount}% discount`,
      costEstimate: "Variable",
    });
  }

  return descriptions;
}

function getQualityLabel(bonus_Q: Q): string {
  const percent = Math.round((bonus_Q / SCALE.Q) * 100);
  if (percent >= 15) return "Excellent (+" + percent + "%)";
  if (percent >= 10) return "Good (+" + percent + "%)";
  if (percent >= 5) return "Fair (+" + percent + "%)";
  return "Basic";
}

// ── Settlement Info ────────────────────────────────────────────────────────────

export interface SettlementInfo {
  id: string;
  name: string;
  tier: string;
  population: number;
  populationCap: number;
  faction?: string | undefined;
  services: string[];
  activeProjects: number;
  hasQuests: boolean;
}

/** Get summary info for settlement listing. */
export function getSettlementInfo(settlement: Settlement): SettlementInfo {
  const services = getAvailableServices(settlement);
  const availableServices: string[] = [];

  if (services.repair) availableServices.push("Repair");
  if (services.medicalCare !== "none") availableServices.push("Medical");
  if (services.training) availableServices.push("Training");
  if (services.market) availableServices.push("Market");

  return {
    id: settlement.settlementId,
    name: settlement.name,
    tier: SETTLEMENT_TIER_NAMES[settlement.tier],
    population: settlement.population,
    populationCap: settlement.populationCap,
    faction: settlement.factionId?.toString(),
    services: availableServices,
    activeProjects: settlement.activeProjects.length,
    hasQuests: services.questGeneration,
  };
}

// ── Integration Helpers ────────────────────────────────────────────────────────

/** Check if entity can use a service at a settlement. */
export function canUseService(
  settlement: Settlement,
  entityId: number,
  serviceType: "repair" | "medical" | "training" | "market",
): { allowed: boolean; reason?: string } {
  // Check if service exists
  const services = getAvailableServices(settlement);

  switch (serviceType) {
    case "repair":
      if (!services.repair) return { allowed: false, reason: "no_forge" };
      break;
    case "medical":
      if (services.medicalCare === "none") return { allowed: false, reason: "no_medical" };
      break;
    case "training":
      if (!services.training) return { allowed: false, reason: "no_barracks" };
      break;
    case "market":
      if (!services.market) return { allowed: false, reason: "no_market" };
      break;
  }

  // Entity can use service
  return { allowed: true };
}

/** Calculate total investment in a settlement (sum of all facility levels). */
export function calculateSettlementInvestment(settlement: Settlement): number {
  return Object.values(settlement.facilities).reduce((sum: number, level) => sum + level, 0);
}

/** Get settlement attractiveness score for immigration. */
export function getSettlementAttractiveness(settlement: Settlement): number {
  let score = settlement.tier * 10;

  // Facilities add attractiveness
  score += calculateSettlementInvestment(settlement) * 2;

  // Safety penalty
  if (settlement.safetyStatus.ticksSinceLastRaid < 500) {
    score -= 10;
  }

  // Food bonus
  if (settlement.foodSurplus_Q > q(0.5)) {
    score += 5;
  }

  // Population pressure (less attractive if overcrowded)
  const occupancy = settlement.population / settlement.populationCap;
  if (occupancy > 0.9) {
    score -= 15;
  } else if (occupancy < 0.5) {
    score += 5; // Room to grow
  }

  return Math.max(0, score);
}
