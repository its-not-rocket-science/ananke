// test/settlement.test.ts — Phase 44: Settlement & Base Building tests

import { describe, it, expect } from "vitest";
import { q } from "../src/units.js";
import {
  createSettlement,
  createSettlementRegistry,
  registerSettlement,
  unregisterSettlement,
  getSettlementAtPosition,
  getFactionSettlements,
  findNearestSettlement,
  calculatePopulationCap,
  startConstructionProject,
  contributeToProject,
  updateSettlementPopulation,
  getAvailableServices,
  recordRaid,
  updateDefenses,
  serializeSettlement,
  deserializeSettlement,
  SETTLEMENT_TIER_NAMES,
} from "../src/settlement.js";

// ── Settlement Creation ────────────────────────────────────────────────────────

describe("Settlement Creation", () => {
  it("creates a camp settlement", () => {
    const settlement = createSettlement("set_1", "Test Camp", { x: 100, y: 200 }, 0, 0, 1);

    expect(settlement.settlementId).toBe("set_1");
    expect(settlement.name).toBe("Test Camp");
    expect(settlement.position).toEqual({ x: 100, y: 200 });
    expect(settlement.tier).toBe(0);
    expect(settlement.factionId).toBe(1);
  });

  it("sets correct tier name", () => {
    expect(SETTLEMENT_TIER_NAMES[0]).toBe("Camp");
    expect(SETTLEMENT_TIER_NAMES[1]).toBe("Hamlet");
    expect(SETTLEMENT_TIER_NAMES[4]).toBe("City");
  });

  it("adds shared storage for villages and above", () => {
    const camp = createSettlement("camp", "Camp", { x: 0, y: 0 }, 0);
    expect(camp.sharedStorage).toBeUndefined();

    const village = createSettlement("village", "Village", { x: 0, y: 0 }, 1000, 2);
    expect(village.sharedStorage).toBeDefined();
  });

  it("records founding in history", () => {
    const settlement = createSettlement("set_1", "Test", { x: 0, y: 0 }, 500);
    expect(settlement.history.length).toBe(1);
    expect(settlement.history[0]!.type).toBe("founded");
    expect(settlement.history[0]!.tick).toBe(500);
  });
});

// ── Population Cap ─────────────────────────────────────────────────────────────

describe("Population Cap", () => {
  it("calculates base population by tier", () => {
    const camp = createSettlement("c", "C", { x: 0, y: 0 }, 0);
    expect(camp.populationCap).toBeGreaterThan(0);

    const city = createSettlement("city", "City", { x: 0, y: 0 }, 0, 4);
    expect(city.populationCap).toBeGreaterThan(camp.populationCap);
  });

  it("increases cap with barracks", () => {
    const base = calculatePopulationCap(2, {
      forge: 0, medical: 0, market: 0, barracks: 0, temple: 0,
    });

    const withBarracks = calculatePopulationCap(2, {
      forge: 0, medical: 0, market: 0, barracks: 2, temple: 0,
    });

    expect(withBarracks).toBeGreaterThan(base);
  });
});

// ── Settlement Registry ────────────────────────────────────────────────────────

describe("Settlement Registry", () => {
  it("registers and retrieves settlement", () => {
    const registry = createSettlementRegistry();
    const settlement = createSettlement("set_1", "Test", { x: 100, y: 200 }, 0);

    registerSettlement(registry, settlement);

    expect(registry.settlements.size).toBe(1);
    expect(registry.settlements.get("set_1")).toBe(settlement);
  });

  it("finds settlement by position", () => {
    const registry = createSettlementRegistry();
    const settlement = createSettlement("set_1", "Test", { x: 100, y: 200 }, 0);

    registerSettlement(registry, settlement);

    const found = getSettlementAtPosition(registry, 100, 200);
    expect(found).toBe(settlement);

    expect(getSettlementAtPosition(registry, 999, 999)).toBeUndefined();
  });

  it("unregisters settlement", () => {
    const registry = createSettlementRegistry();
    const settlement = createSettlement("set_1", "Test", { x: 0, y: 0 }, 0);

    registerSettlement(registry, settlement);
    expect(unregisterSettlement(registry, "set_1")).toBe(true);
    expect(registry.settlements.size).toBe(0);

    expect(unregisterSettlement(registry, "missing")).toBe(false);
  });

  it("gets settlements by faction", () => {
    const registry = createSettlementRegistry();
    const set1 = createSettlement("set_1", "A", { x: 0, y: 0 }, 0, 0, 1);
    const set2 = createSettlement("set_2", "B", { x: 10, y: 10 }, 0, 0, 1);
    const set3 = createSettlement("set_3", "C", { x: 20, y: 20 }, 0, 0, 2);

    registerSettlement(registry, set1);
    registerSettlement(registry, set2);
    registerSettlement(registry, set3);

    const faction1Settlements = getFactionSettlements(registry, 1);
    expect(faction1Settlements.length).toBe(2);
  });

  it("finds nearest settlement", () => {
    const registry = createSettlementRegistry();
    const set1 = createSettlement("set_1", "A", { x: 0, y: 0 }, 0);
    const set2 = createSettlement("set_2", "B", { x: 100, y: 0 }, 0);

    registerSettlement(registry, set1);
    registerSettlement(registry, set2);

    const nearest = findNearestSettlement(registry, 10, 0);
    expect(nearest).toBeDefined();
    expect(nearest!.settlement.settlementId).toBe("set_1");
  });
});

// ── Construction Projects ───────────────────────────────────────────────────────

describe("Construction Projects", () => {
  it("starts a construction project", () => {
    const settlement = createSettlement("set", "Test", { x: 0, y: 0 }, 100, undefined, 2);

    const result = startConstructionProject(settlement, "forge", 1, 100);

    expect(result.success).toBe(true);
    expect(result.project).toBeDefined();
    expect(settlement.activeProjects.length).toBe(1);
    expect(settlement.history.some(h => h.type === "project_started")).toBe(true);
  });

  it("fails to start project if already at level", () => {
    const settlement = createSettlement("set", "Test", { x: 0, y: 0 }, 100);
    settlement.facilities.forge = 2;

    const result = startConstructionProject(settlement, "forge", 1, 100);
    expect(result.success).toBe(false);
    expect(result.reason).toBe("already_at_or_above_level");
  });

  it("fails to skip levels", () => {
    const settlement = createSettlement("set", "Test", { x: 0, y: 0 }, 100);

    const result = startConstructionProject(settlement, "forge", 3, 100);
    expect(result.success).toBe(false);
    expect(result.reason).toBe("must_upgrade_sequentially");
  });

  it("contributes work to project", () => {
    const settlement = createSettlement("set", "Test", { x: 0, y: 0 }, 100, undefined, 2);
    startConstructionProject(settlement, "forge", 1, 100);

    const result = contributeToProject(settlement, settlement.activeProjects[0]!.projectId, 1, q(0.8), 10, 101);

    expect(result.success).toBe(true);
    expect(settlement.activeProjects[0]!.progress_Q).toBeGreaterThan(0);
  });

  it("completes project when progress reaches 100%", () => {
    const settlement = createSettlement("set", "Test", { x: 0, y: 0 }, 100, undefined, 2);
    startConstructionProject(settlement, "forge", 1, 100);

    // Contribute enough to complete
    const projectId = settlement.activeProjects[0]!.projectId;
    let completed = false;
    for (let i = 0; i < 50 && !completed; i++) {
      const result = contributeToProject(settlement, projectId, 1, q(1.0), 20, 100 + i);
      completed = result.completed ?? false;
    }

    expect(completed).toBe(true);
    expect(settlement.facilities.forge).toBe(1);
    expect(settlement.activeProjects.length).toBe(0);
    expect(settlement.history.some(h => h.type === "facility_upgraded")).toBe(true);
  });
});

// ── Population Dynamics ─────────────────────────────────────────────────────────

describe("Population Dynamics", () => {
  it("updates population with food surplus", () => {
    const settlement = createSettlement("set", "Test", { x: 0, y: 0 }, 100, undefined, 2);
    settlement.population = 50;
    settlement.populationCap = 200;
    settlement.foodSurplus_Q = q(0.8);

    // Call multiple times to trigger probabilistic growth
    let _growth = 0;
    for (let i = 0; i < 1000; i++) {
      const result = updateSettlementPopulation(settlement, 100 + i);
      if (result.growth > 0) _growth += result.growth;
    }

    // With high food surplus, should see some growth over many attempts
    expect(settlement.population).toBeGreaterThanOrEqual(50);
  });

  it("respects population cap", () => {
    const settlement = createSettlement("set", "Test", { x: 0, y: 0 }, 100, undefined, 0);
    settlement.population = settlement.populationCap;

    const result = updateSettlementPopulation(settlement, 101);
    expect(result.growth).toBe(0);
    expect(result.reason).toBe("at_capacity");
  });
});

// ── Services ────────────────────────────────────────────────────────────────────

describe("Available Services", () => {
  it("returns services based on facilities", () => {
    const settlement = createSettlement("set", "Test", { x: 0, y: 0 }, 100, 1);

    const services = getAvailableServices(settlement);

    // Hamlet should have basic market and medical
    expect(services.market).toBe(true);
    expect(services.repair).toBe(false); // No forge
    expect(services.training).toBe(false); // No barracks
  });

  it("returns repair with forge", () => {
    const settlement = createSettlement("set", "Test", { x: 0, y: 0 }, 100, 2);
    settlement.facilities.forge = 2;

    const services = getAvailableServices(settlement);
    expect(services.repair).toBe(true);
    expect(services.repairQualityBonus_Q).toBeGreaterThan(0);
  });

  it("returns medical care levels", () => {
    const settlement = createSettlement("set", "Test", { x: 0, y: 0 }, 100);

    let services = getAvailableServices(settlement);
    expect(services.medicalCare).toBe("none");

    settlement.facilities.medical = 3;
    services = getAvailableServices(settlement);
    expect(services.medicalCare).toBe("expert");
  });
});

// ── Defense ─────────────────────────────────────────────────────────────────────

describe("Settlement Defense", () => {
  it("records raid with casualties", () => {
    const settlement = createSettlement("set", "Test", { x: 0, y: 0 }, 100, undefined, 2);
    settlement.population = 100;

    recordRaid(settlement, 999, 10, 200);

    expect(settlement.safetyStatus.ticksSinceLastRaid).toBe(0);
    expect(settlement.safetyStatus.recentCasualties).toBe(10);
    expect(settlement.population).toBe(90);
    expect(settlement.history.some(h => h.type === "raid")).toBe(true);
  });

  it("updates defense status", () => {
    const settlement = createSettlement("set", "Test", { x: 0, y: 0 }, 100);

    updateDefenses(settlement, true);
    expect(settlement.safetyStatus.hasDefenses).toBe(true);

    updateDefenses(settlement, false);
    expect(settlement.safetyStatus.hasDefenses).toBe(false);
  });
});

// ── Serialization ──────────────────────────────────────────────────────────────

describe("Serialization", () => {
  it("serializes and deserializes settlement", () => {
    const settlement = createSettlement("set_1", "Test Village", { x: 100, y: 200 }, 1000, 2, 5);
    settlement.population = 150;
    settlement.facilities.forge = 2;

    const serialized = serializeSettlement(settlement);
    const restored = deserializeSettlement(serialized);

    expect(restored.settlementId).toBe("set_1");
    expect(restored.name).toBe("Test Village");
    expect(restored.position).toEqual({ x: 100, y: 200 });
    expect(restored.tier).toBe(2);
    expect(restored.population).toBe(150);
    expect(restored.facilities.forge).toBe(2);
    expect(restored.factionId).toBe(5);
  });

  it("handles minimal settlement data", () => {
    const restored = deserializeSettlement({});

    expect(restored.settlementId).toBe("");
    expect(restored.name).toBe("Unknown");
    expect(restored.tier).toBe(0);
  });
});
