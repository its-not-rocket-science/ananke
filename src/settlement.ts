// src/settlement.ts — Phase 44: Settlement & Base Building
//
// Persistent locations that can be constructed, upgraded, and populated.
// Settlements provide services, storage, and serve as quest hubs.

import type { Q } from "./units.js";
import { q, clampQ, SCALE, mulDiv } from "./units.js";
import type { Inventory } from "./inventory.js";
import { createInventory } from "./inventory.js";
import type { Quest } from "./quest.js";

// ── Core Types ────────────────────────────────────────────────────────────────

/** Facility tier levels. */
export type FacilityLevel = 0 | 1 | 2 | 3 | 4;

/** Settlement tiers from smallest to largest. */
export type SettlementTier = 0 | 1 | 2 | 3 | 4;

export const SETTLEMENT_TIER_NAMES: Record<SettlementTier, string> = {
  0: "Camp",
  1: "Hamlet",
  2: "Village",
  3: "Town",
  4: "City",
};

/** Settlement definition. */
export interface Settlement {
  settlementId: string;
  name: string;
  position: { x: number; y: number };
  tier: SettlementTier;

  /** Facilities determine available services. */
  facilities: {
    forge: FacilityLevel;
    medical: FacilityLevel;
    market: FacilityLevel;
    barracks: FacilityLevel;
    temple: FacilityLevel;
  };

  population: number;
  populationCap: number;
  factionId?: number | undefined;

  /** Shared storage for guild/faction. */
  sharedStorage?: Inventory | undefined;

  /** Active construction projects. */
  activeProjects: ConstructionProject[];

  /** Settlement history for chronicle generation. */
  history: SettlementEvent[];

  /** Safety status (affects population growth). */
  safetyStatus: SafetyStatus;

  /** Food surplus metric (affects population growth). */
  foodSurplus_Q: Q;

  /** Tick when settlement was founded. */
  foundedAtTick: number;

  /** Last time settlement was updated. */
  lastUpdateTick: number;
}

/** Safety status affecting population growth. */
export interface SafetyStatus {
  /** Number of ticks since last raid/attack. */
  ticksSinceLastRaid: number;
  /** Whether settlement has defensive structures. */
  hasDefenses: boolean;
  /** Recent casualties from raids. */
  recentCasualties: number;
}

/** Construction project for upgrading facilities. */
export interface ConstructionProject {
  projectId: string;
  targetFacility: keyof Settlement["facilities"];
  targetLevel: FacilityLevel;
  requiredResources: Record<string, number>;
  progress_Q: Q;
  contributors: number[]; // Entity IDs
  startedAtTick: number;
  estimatedCompletionTick?: number | undefined;
}

/** Settlement event for history/chronicle. */
export interface SettlementEvent {
  tick: number;
  type: SettlementEventType;
  description: string;
  entityIds?: number[] | undefined;
  data?: Record<string, unknown> | undefined;
}

export type SettlementEventType =
  | "founded"
  | "tier_upgraded"
  | "facility_upgraded"
  | "project_started"
  | "project_completed"
  | "population_changed"
  | "raid"
  | "siege_started"
  | "siege_ended"
  | "faction_changed"
  | "quest_generated";

/** Settlement registry for world management. */
export interface SettlementRegistry {
  settlements: Map<string, Settlement>;
  byPosition: Map<string, string>; // "x,y" -> settlementId
  byFaction: Map<number, Set<string>>; // factionId -> settlementIds
}

// ── Settlement Creation ───────────────────────────────────────────────────────

/** Create a new settlement. */
export function createSettlement(
  settlementId: string,
  name: string,
  position: { x: number; y: number },
  tick: number,
  tier: SettlementTier = 0,
  factionId?: number,
): Settlement {
  const settlement: Settlement = {
    settlementId,
    name,
    position,
    tier,
    facilities: {
      forge: 0,
      medical: tier >= 1 ? 1 : 0,
      market: tier >= 1 ? 1 : 0,
      barracks: 0,
      temple: 0,
    },
    population: tier === 0 ? 5 : tier * 50,
    populationCap: calculatePopulationCap(tier, { forge: 0, medical: 0, market: 0, barracks: 0, temple: 0 }),
    factionId,
    sharedStorage: undefined,
    activeProjects: [],
    history: [{
      tick,
      type: "founded",
      description: `${name} was founded as a ${SETTLEMENT_TIER_NAMES[tier]}`,
    }],
    safetyStatus: {
      ticksSinceLastRaid: 1000,
      hasDefenses: false,
      recentCasualties: 0,
    },
    foodSurplus_Q: q(0.5),
    foundedAtTick: tick,
    lastUpdateTick: tick,
  };

  // Add shared storage for villages and above
  if (tier >= 2) {
    settlement.sharedStorage = createInventory(-1); // -1 indicates shared/npc inventory
  }

  return settlement;
}

/** Calculate population cap based on tier and facilities. */
export function calculatePopulationCap(
  tier: SettlementTier,
  facilities: Settlement["facilities"],
): number {
  // Base capacity by tier
  const baseCap: Record<SettlementTier, number> = {
    0: 10,   // Camp
    1: 50,   // Hamlet
    2: 200,  // Village
    3: 1000, // Town
    4: 5000, // City
  };

  let cap = baseCap[tier];

  // Barracks increases cap (housing)
  cap += facilities.barracks * 50;

  // Medical facility allows healthier population density
  cap += facilities.medical * 25;

  return cap;
}

// ── Settlement Registry ───────────────────────────────────────────────────────

/** Create a new settlement registry. */
export function createSettlementRegistry(): SettlementRegistry {
  return {
    settlements: new Map(),
    byPosition: new Map(),
    byFaction: new Map(),
  };
}

/** Register a settlement in the registry. */
export function registerSettlement(
  registry: SettlementRegistry,
  settlement: Settlement,
): void {
  registry.settlements.set(settlement.settlementId, settlement);

  const posKey = `${settlement.position.x},${settlement.position.y}`;
  registry.byPosition.set(posKey, settlement.settlementId);

  if (settlement.factionId !== undefined) {
    let factionSet = registry.byFaction.get(settlement.factionId);
    if (!factionSet) {
      factionSet = new Set();
      registry.byFaction.set(settlement.factionId, factionSet);
    }
    factionSet.add(settlement.settlementId);
  }
}

/** Remove a settlement from the registry. */
export function unregisterSettlement(
  registry: SettlementRegistry,
  settlementId: string,
): boolean {
  const settlement = registry.settlements.get(settlementId);
  if (!settlement) return false;

  registry.settlements.delete(settlementId);

  const posKey = `${settlement.position.x},${settlement.position.y}`;
  registry.byPosition.delete(posKey);

  if (settlement.factionId !== undefined) {
    const factionSet = registry.byFaction.get(settlement.factionId);
    if (factionSet) {
      factionSet.delete(settlementId);
    }
  }

  return true;
}

/** Get settlement by position. */
export function getSettlementAtPosition(
  registry: SettlementRegistry,
  x: number,
  y: number,
): Settlement | undefined {
  const posKey = `${x},${y}`;
  const settlementId = registry.byPosition.get(posKey);
  if (settlementId) {
    return registry.settlements.get(settlementId);
  }
  return undefined;
}

/** Get all settlements for a faction. */
export function getFactionSettlements(
  registry: SettlementRegistry,
  factionId: number,
): Settlement[] {
  const settlementIds = registry.byFaction.get(factionId);
  if (!settlementIds) return [];

  return Array.from(settlementIds)
    .map((id) => registry.settlements.get(id))
    .filter((s): s is Settlement => s !== undefined);
}

/** Find nearest settlement to a position. */
export function findNearestSettlement(
  registry: SettlementRegistry,
  x: number,
  y: number,
): { settlement: Settlement; distance: number } | undefined {
  let nearest: Settlement | undefined;
  let nearestDist = Infinity;

  for (const settlement of registry.settlements.values()) {
    const dx = settlement.position.x - x;
    const dy = settlement.position.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < nearestDist) {
      nearest = settlement;
      nearestDist = dist;
    }
  }

  if (!nearest) return undefined;
  return { settlement: nearest, distance: nearestDist };
}

// ── Construction Projects ──────────────────────────────────────────────────────

/** Facility upgrade costs and requirements. */
export const FACILITY_UPGRADE_COSTS: Record<
  keyof Settlement["facilities"],
  Record<FacilityLevel, { materials: Record<string, number>; laborHours: number }>
> = {
  forge: {
    0: { materials: {}, laborHours: 0 },
    1: { materials: { stone: 50, wood: 100 }, laborHours: 100 },
    2: { materials: { stone: 150, iron: 50, wood: 200 }, laborHours: 300 },
    3: { materials: { stone: 400, iron: 150, steel: 50 }, laborHours: 800 },
    4: { materials: { stone: 1000, steel: 200, mithril: 20 }, laborHours: 2000 },
  },
  medical: {
    0: { materials: {}, laborHours: 0 },
    1: { materials: { wood: 50, cloth: 30 }, laborHours: 80 },
    2: { materials: { wood: 150, stone: 100, cloth: 100 }, laborHours: 250 },
    3: { materials: { stone: 300, glass: 100, iron: 50 }, laborHours: 600 },
    4: { materials: { stone: 800, glass: 300, steel: 100 }, laborHours: 1500 },
  },
  market: {
    0: { materials: {}, laborHours: 0 },
    1: { materials: { wood: 80 }, laborHours: 60 },
    2: { materials: { wood: 200, stone: 100 }, laborHours: 200 },
    3: { materials: { stone: 400, wood: 300, iron: 30 }, laborHours: 500 },
    4: { materials: { stone: 1200, marble: 200, steel: 50 }, laborHours: 1200 },
  },
  barracks: {
    0: { materials: {}, laborHours: 0 },
    1: { materials: { wood: 100 }, laborHours: 80 },
    2: { materials: { wood: 300, stone: 100 }, laborHours: 250 },
    3: { materials: { stone: 500, wood: 200, iron: 50 }, laborHours: 600 },
    4: { materials: { stone: 1500, steel: 200 }, laborHours: 1500 },
  },
  temple: {
    0: { materials: {}, laborHours: 0 },
    1: { materials: { wood: 60, cloth: 20 }, laborHours: 100 },
    2: { materials: { stone: 200, wood: 100, cloth: 50 }, laborHours: 300 },
    3: { materials: { stone: 600, glass: 100, gold: 10 }, laborHours: 800 },
    4: { materials: { stone: 2000, marble: 500, gold: 100, crystal: 50 }, laborHours: 2500 },
  },
};

/** Start a construction project. */
export function startConstructionProject(
  settlement: Settlement,
  facility: keyof Settlement["facilities"],
  targetLevel: FacilityLevel,
  tick: number,
): { success: boolean; reason?: string; project?: ConstructionProject } {
  const currentLevel = settlement.facilities[facility];

  if (targetLevel <= currentLevel) {
    return { success: false, reason: "already_at_or_above_level" };
  }

  if (targetLevel > currentLevel + 1) {
    return { success: false, reason: "must_upgrade_sequentially" };
  }

  // Check if project already exists for this facility
  const existing = settlement.activeProjects.find((p) => p.targetFacility === facility);
  if (existing) {
    return { success: false, reason: "project_already_active" };
  }

  const costs = FACILITY_UPGRADE_COSTS[facility][targetLevel];
  if (!costs) {
    return { success: false, reason: "invalid_target_level" };
  }

  const project: ConstructionProject = {
    projectId: `${settlement.settlementId}_${facility}_${targetLevel}_${tick}`,
    targetFacility: facility,
    targetLevel,
    requiredResources: { ...costs.materials },
    progress_Q: q(0),
    contributors: [],
    startedAtTick: tick,
  };

  settlement.activeProjects.push(project);
  settlement.history.push({
    tick,
    type: "project_started",
    description: `Started construction of ${facility} level ${targetLevel}`,
    data: { facility, targetLevel, projectId: project.projectId },
  });

  return { success: true, project };
}

/** Contribute work to a construction project. */
export function contributeToProject(
  settlement: Settlement,
  projectId: string,
  entityId: number,
  competenceQuality_Q: Q, // From Phase 40 competence system
  hoursWorked: number,
  tick: number,
): { success: boolean; reason?: string; completed?: boolean } {
  const project = settlement.activeProjects.find((p) => p.projectId === projectId);
  if (!project) {
    return { success: false, reason: "project_not_found" };
  }

  // Add contributor
  if (!project.contributors.includes(entityId)) {
    project.contributors.push(entityId);
  }

  // Calculate progress contribution
  // Total required = laborHours from costs
  const costs = FACILITY_UPGRADE_COSTS[project.targetFacility][project.targetLevel];
  const totalLaborRequired = costs.laborHours * SCALE.Q;

  // Progress = competenceQuality * hoursWorked / totalRequired
  const contribution = mulDiv(competenceQuality_Q, Math.round(hoursWorked * SCALE.Q), totalLaborRequired);
  project.progress_Q = clampQ((project.progress_Q + contribution) as Q, q(0), SCALE.Q);

  // Check completion
  if (project.progress_Q >= SCALE.Q) {
    completeConstructionProject(settlement, project, tick);
    return { success: true, completed: true };
  }

  return { success: true, completed: false };
}

/** Complete a construction project. */
function completeConstructionProject(
  settlement: Settlement,
  project: ConstructionProject,
  tick: number,
): void {
  // Upgrade the facility
  settlement.facilities[project.targetFacility] = project.targetLevel;

  // Recalculate population cap
  settlement.populationCap = calculatePopulationCap(settlement.tier, settlement.facilities);

  // Remove from active projects
  const idx = settlement.activeProjects.indexOf(project);
  if (idx >= 0) {
    settlement.activeProjects.splice(idx, 1);
  }

  // Record history
  settlement.history.push({
    tick,
    type: "facility_upgraded",
    description: `Completed ${project.targetFacility} level ${project.targetLevel}`,
    entityIds: project.contributors,
    data: { facility: project.targetFacility, level: project.targetLevel },
  });

  // Check for tier upgrade
  checkTierUpgrade(settlement, tick);
}

/** Check if settlement qualifies for tier upgrade. */
function checkTierUpgrade(settlement: Settlement, tick: number): void {
  const facilitySum = Object.values(settlement.facilities).reduce((a: number, b) => a + b, 0);
  const requiredFacilities = (settlement.tier + 1) * 2;

  if (facilitySum >= requiredFacilities && settlement.population >= settlement.populationCap * 0.8) {
    const oldTier = settlement.tier;
    settlement.tier = Math.min(4, (settlement.tier + 1) as SettlementTier) as SettlementTier;

    if (settlement.tier > oldTier) {
      settlement.populationCap = calculatePopulationCap(settlement.tier, settlement.facilities);
      settlement.history.push({
        tick,
        type: "tier_upgraded",
        description: `${settlement.name} has grown from ${SETTLEMENT_TIER_NAMES[oldTier]} to ${SETTLEMENT_TIER_NAMES[settlement.tier]}`,
        data: { oldTier, newTier: settlement.tier },
      });

      // Add shared storage if newly qualified
      if (settlement.tier >= 2 && !settlement.sharedStorage) {
        settlement.sharedStorage = createInventory(-1);
      }
    }
  }
}

// ── Population Dynamics ───────────────────────────────────────────────────────

/** Update settlement population based on conditions. */
export function updateSettlementPopulation(
  settlement: Settlement,
  tick: number,
): { growth: number; reason: string } {
  if (settlement.population >= settlement.populationCap) {
    return { growth: 0, reason: "at_capacity" };
  }

  // Base growth rate
  let growthChance = 0.001; // 0.1% per update

  // Modifiers
  if (settlement.foodSurplus_Q > q(0.5)) {
    growthChance *= 1.5; // Food surplus bonus
  } else if (settlement.foodSurplus_Q < q(0.2)) {
    growthChance *= 0.5; // Food shortage penalty
  }

  if (settlement.facilities.medical >= 2) {
    growthChance *= 1.3; // Good medical facilities
  }

  if (settlement.safetyStatus.ticksSinceLastRaid < 100) {
    growthChance *= 0.3; // Recent raid penalty
  }

  if (settlement.safetyStatus.hasDefenses) {
    growthChance *= 1.2; // Defenses provide security
  }

  // Apply growth
  const growthRoll = Math.random(); // In real system, use seeded RNG
  if (growthRoll < growthChance) {
    const growth = Math.max(1, Math.floor(settlement.population * 0.01));
    const actualGrowth = Math.min(growth, settlement.populationCap - settlement.population);

    if (actualGrowth > 0) {
      settlement.population += actualGrowth;
      settlement.history.push({
        tick,
        type: "population_changed",
        description: `Population grew by ${actualGrowth} to ${settlement.population}`,
        data: { change: actualGrowth, newPopulation: settlement.population },
      });
      return { growth: actualGrowth, reason: "natural_growth" };
    }
  }

  return { growth: 0, reason: "no_growth" };
}

// ── Service Availability ───────────────────────────────────────────────────────

/** Services available based on facility levels. */
export interface AvailableServices {
  repair: boolean;
  repairQualityBonus_Q: Q;
  medicalCare: "none" | "basic" | "skilled" | "expert" | "master";
  training: boolean;
  trainingBonus_Q: Q;
  market: boolean;
  marketDiscount_Q: Q;
  questGeneration: boolean;
}

/** Get available services for a settlement. */
export function getAvailableServices(settlement: Settlement): AvailableServices {
  return {
    repair: settlement.facilities.forge >= 1,
    repairQualityBonus_Q: (settlement.facilities.forge * 500) as Q, // +5% per level
    medicalCare: getMedicalCareLevel(settlement.facilities.medical),
    training: settlement.facilities.barracks >= 1,
    trainingBonus_Q: (settlement.facilities.barracks * 500) as Q,
    market: settlement.facilities.market >= 1,
    marketDiscount_Q: (settlement.facilities.market * 300) as Q, // -3% per level
    questGeneration: settlement.tier >= 1,
  };
}

function getMedicalCareLevel(level: FacilityLevel): AvailableServices["medicalCare"] {
  switch (level) {
    case 0: return "none";
    case 1: return "basic";
    case 2: return "skilled";
    case 3: return "expert";
    case 4: return "master";
    default: return "none";
  }
}

// ── Settlement Defense ─────────────────────────────────────────────────────────

/** Record a raid/siege on a settlement. */
export function recordRaid(
  settlement: Settlement,
  attackerFactionId: number,
  casualties: number,
  tick: number,
): void {
  settlement.safetyStatus.ticksSinceLastRaid = 0;
  settlement.safetyStatus.recentCasualties = casualties;

  settlement.history.push({
    tick,
    type: "raid",
    description: `Raid by faction ${attackerFactionId}, ${casualties} casualties`,
    data: { attackerFactionId, casualties },
  });

  // Population loss from casualties
  if (casualties > 0) {
    settlement.population = Math.max(0, settlement.population - casualties);
  }
}

/** Update settlement defenses. */
export function updateDefenses(
  settlement: Settlement,
  hasDefenses: boolean,
): void {
  settlement.safetyStatus.hasDefenses = hasDefenses;
}

// ── Serialization ─────────────────────────────────────────────────────────────

/** Serialize settlement to JSON-friendly format. */
export function serializeSettlement(settlement: Settlement): unknown {
  return {
    settlementId: settlement.settlementId,
    name: settlement.name,
    position: settlement.position,
    tier: settlement.tier,
    facilities: settlement.facilities,
    population: settlement.population,
    populationCap: settlement.populationCap,
    factionId: settlement.factionId,
    sharedStorage: settlement.sharedStorage ? undefined : undefined, // Simplified
    activeProjects: settlement.activeProjects,
    history: settlement.history,
    safetyStatus: settlement.safetyStatus,
    foodSurplus_Q: settlement.foodSurplus_Q,
    foundedAtTick: settlement.foundedAtTick,
    lastUpdateTick: settlement.lastUpdateTick,
  };
}

/** Deserialize settlement. */
export function deserializeSettlement(data: unknown): Settlement {
  const d = data as Record<string, unknown>;

  return {
    settlementId: (d.settlementId as string) ?? "",
    name: (d.name as string) ?? "Unknown",
    position: (d.position as { x: number; y: number }) ?? { x: 0, y: 0 },
    tier: (d.tier as SettlementTier) ?? 0,
    facilities: (d.facilities as Settlement["facilities"]) ?? {
      forge: 0, medical: 0, market: 0, barracks: 0, temple: 0,
    },
    population: (d.population as number) ?? 0,
    populationCap: (d.populationCap as number) ?? 0,
    factionId: d.factionId as number | undefined,
    sharedStorage: undefined,
    activeProjects: Array.isArray(d.activeProjects) ? d.activeProjects as ConstructionProject[] : [],
    history: Array.isArray(d.history) ? d.history as SettlementEvent[] : [],
    safetyStatus: (d.safetyStatus as SafetyStatus) ?? {
      ticksSinceLastRaid: 1000, hasDefenses: false, recentCasualties: 0,
    },
    foodSurplus_Q: (d.foodSurplus_Q as Q) ?? q(0.5),
    foundedAtTick: (d.foundedAtTick as number) ?? 0,
    lastUpdateTick: (d.lastUpdateTick as number) ?? 0,
  };
}
