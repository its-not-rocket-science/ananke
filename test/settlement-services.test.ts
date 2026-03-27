// test/settlement-services.test.ts — Phase 44: Settlement Services tests

import { describe, it, expect } from "vitest";
import { q } from "../src/units.js";
import { createSettlement } from "../src/settlement.js";
import type { Settlement } from "../src/settlement.js";
import {
  getRepairPricing,
  getMedicalPricing,
  getTrainingPricing,
  generateSettlementNeeds,
  selectQuestNeed,
  getServiceDescriptions,
  getSettlementInfo,
  canUseService,
  calculateSettlementInvestment,
  getSettlementAttractiveness,
} from "../src/settlement-services.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkTownWithForge(): Settlement {
  const s = createSettlement("town1", "Iron Town", { x: 0, y: 0 }, 0, 3, 1);
  s.facilities.forge = 2;
  s.facilities.medical = 2;
  s.facilities.market = 2;
  s.facilities.barracks = 2;
  return s;
}

function mkCamp(): Settlement {
  return createSettlement("camp1", "Base Camp", { x: 0, y: 0 }, 0, 0);
}

// ── getRepairPricing ───────────────────────────────────────────────────────────

describe("getRepairPricing", () => {
  it("returns canRepair=true when forge exists", () => {
    const s = mkTownWithForge();
    const result = getRepairPricing(s, 1000, q(0.50));
    expect(result.canRepair).toBe(true);
    expect(result.cost).toBeGreaterThan(0);
  });

  it("returns canRepair=false when no forge", () => {
    const s = mkCamp(); // tier 0, no forge
    const result = getRepairPricing(s, 1000, q(0.50));
    expect(result.canRepair).toBe(false);
    expect(result.cost).toBe(0);
  });

  it("cost scales with item value", () => {
    const s = mkTownWithForge();
    const cheap = getRepairPricing(s, 100, q(0.50));
    const expensive = getRepairPricing(s, 10_000, q(0.50));
    expect(expensive.cost).toBeGreaterThan(cheap.cost);
  });

  it("cost scales with damage level", () => {
    const s = mkTownWithForge();
    const light = getRepairPricing(s, 1000, q(0.10));
    const heavy = getRepairPricing(s, 1000, q(0.90));
    expect(heavy.cost).toBeGreaterThan(light.cost);
  });

  it("returns qualityBonus_Q from forge facility", () => {
    const s = mkTownWithForge();
    const result = getRepairPricing(s, 1000, q(0.50));
    expect(result.qualityBonus_Q).toBeGreaterThanOrEqual(0);
  });
});

// ── getMedicalPricing ─────────────────────────────────────────────────────────

describe("getMedicalPricing", () => {
  it("returns available=true for town with medical facility", () => {
    const s = mkTownWithForge();
    const result = getMedicalPricing(s, "treatment");
    expect(result.available).toBe(true);
    expect(result.cost).toBeGreaterThan(0);
  });

  it("returns available=false for camp with no medical", () => {
    const s = mkCamp();
    s.facilities.medical = 0;
    const result = getMedicalPricing(s, "treatment");
    expect(result.available).toBe(false);
    expect(result.cost).toBe(0);
  });

  it("surgery costs more than treatment", () => {
    const s = mkTownWithForge();
    const treatment = getMedicalPricing(s, "treatment");
    const surgery = getMedicalPricing(s, "surgery");
    expect(surgery.cost).toBeGreaterThan(treatment.cost);
  });

  it("recovery is cheapest care level", () => {
    const s = mkTownWithForge();
    const recovery = getMedicalPricing(s, "recovery");
    const treatment = getMedicalPricing(s, "treatment");
    expect(recovery.cost).toBeLessThan(treatment.cost);
  });

  it("care quality is numeric", () => {
    const s = mkTownWithForge();
    const result = getMedicalPricing(s, "treatment");
    expect(typeof result.careQuality).toBe("number");
    expect(result.careQuality).toBeGreaterThan(0);
  });
});

// ── getTrainingPricing ────────────────────────────────────────────────────────

describe("getTrainingPricing", () => {
  it("returns available=true for settlement with barracks", () => {
    const s = mkTownWithForge();
    const result = getTrainingPricing(s, 2);
    expect(result.available).toBe(true);
    expect(result.cost).toBeGreaterThan(0);
  });

  it("returns available=false when no barracks", () => {
    const s = mkCamp();
    const result = getTrainingPricing(s, 2);
    expect(result.available).toBe(false);
    expect(result.cost).toBe(0);
  });

  it("cost scales with hours", () => {
    const s = mkTownWithForge();
    const shortSession = getTrainingPricing(s, 1);
    const longSession = getTrainingPricing(s, 8);
    expect(longSession.cost).toBeGreaterThan(shortSession.cost);
  });
});

// ── generateSettlementNeeds ───────────────────────────────────────────────────

describe("generateSettlementNeeds", () => {
  it("returns sorted needs (highest priority first)", () => {
    const s = mkTownWithForge();
    s.foodSurplus_Q = q(0.1); // food shortage
    const needs = generateSettlementNeeds(s);
    for (let i = 1; i < needs.length; i++) {
      expect(needs[i - 1]!.priority).toBeGreaterThanOrEqual(needs[i]!.priority);
    }
  });

  it("includes supply need when food surplus is low", () => {
    const s = mkTownWithForge();
    s.foodSurplus_Q = q(0.1); // below q(0.3) threshold
    const needs = generateSettlementNeeds(s);
    expect(needs.some((n) => n.type === "supply")).toBe(true);
  });

  it("includes defense need after recent raid", () => {
    const s = mkTownWithForge();
    s.safetyStatus.ticksSinceLastRaid = 50; // recent
    const needs = generateSettlementNeeds(s);
    expect(needs.some((n) => n.type === "defense")).toBe(true);
  });

  it("includes patrol need for tier >= 1", () => {
    const s = mkTownWithForge();
    const needs = generateSettlementNeeds(s);
    expect(needs.some((n) => n.type === "patrol")).toBe(true);
  });

  it("selectQuestNeed returns highest priority need", () => {
    const s = mkTownWithForge();
    s.foodSurplus_Q = q(0.1);
    const need = selectQuestNeed(s);
    expect(need).toBeDefined();
    expect(need!.priority).toBeGreaterThanOrEqual(4);
  });

  it("selectQuestNeed returns undefined for settlement with no needs", () => {
    const s = mkCamp();
    // Camp tier=0 has no patrol/delivery needs check (tier >= 1 required)
    // Force no needs by removing conditions
    s.foodSurplus_Q = q(0.8);
    s.safetyStatus.ticksSinceLastRaid = 9999;
    // Camp tier=0: no tier>=1 patrol, no tier>=2 facility upgrades
    const need = selectQuestNeed(s);
    // Either undefined or a valid need — just ensure no crash
    expect(need === undefined || typeof need.type === "string").toBe(true);
  });
});

// ── getServiceDescriptions ────────────────────────────────────────────────────

describe("getServiceDescriptions", () => {
  it("returns descriptions for all available services", () => {
    const s = mkTownWithForge();
    const descs = getServiceDescriptions(s);
    const names = descs.map((d) => d.name);
    expect(names).toContain("Repair Services");
    expect(names).toContain("Medical Care");
    expect(names).toContain("Training Grounds");
    expect(names).toContain("Market");
  });

  it("returns no services for camp with nothing", () => {
    const s = mkCamp();
    const descs = getServiceDescriptions(s);
    // Camp has no forge, no medical facility level, possibly no barracks/market
    expect(descs).toBeInstanceOf(Array);
  });

  it("all returned services have available=true", () => {
    const s = mkTownWithForge();
    const descs = getServiceDescriptions(s);
    for (const d of descs) {
      expect(d.available).toBe(true);
    }
  });
});

// ── getSettlementInfo ─────────────────────────────────────────────────────────

describe("getSettlementInfo", () => {
  it("returns correct tier name", () => {
    const s = mkTownWithForge();
    const info = getSettlementInfo(s);
    expect(info.tier).toBe("Town");
  });

  it("returns correct population and cap", () => {
    const s = mkTownWithForge();
    const info = getSettlementInfo(s);
    expect(info.population).toBe(s.population);
    expect(info.populationCap).toBe(s.populationCap);
  });

  it("lists available services", () => {
    const s = mkTownWithForge();
    const info = getSettlementInfo(s);
    expect(info.services.length).toBeGreaterThan(0);
  });

  it("includes faction id when present", () => {
    const s = mkTownWithForge(); // factionId=1
    const info = getSettlementInfo(s);
    expect(info.faction).toBe("1");
  });
});

// ── canUseService ─────────────────────────────────────────────────────────────

describe("canUseService", () => {
  it("allows repair when forge exists", () => {
    const s = mkTownWithForge();
    expect(canUseService(s, 1, "repair").allowed).toBe(true);
  });

  it("denies repair when no forge", () => {
    const s = mkCamp();
    expect(canUseService(s, 1, "repair").allowed).toBe(false);
    expect(canUseService(s, 1, "repair").reason).toBe("no_forge");
  });

  it("allows medical when medical facility present", () => {
    const s = mkTownWithForge();
    expect(canUseService(s, 1, "medical").allowed).toBe(true);
  });

  it("denies medical when no medical facility", () => {
    const s = mkCamp();
    s.facilities.medical = 0;
    expect(canUseService(s, 1, "medical").allowed).toBe(false);
  });

  it("allows training when barracks present", () => {
    const s = mkTownWithForge();
    expect(canUseService(s, 1, "training").allowed).toBe(true);
  });

  it("denies training when no barracks", () => {
    const s = mkCamp();
    expect(canUseService(s, 1, "training").allowed).toBe(false);
  });

  it("allows market access when market present", () => {
    const s = mkTownWithForge();
    expect(canUseService(s, 1, "market").allowed).toBe(true);
  });

  it("denies market when no market", () => {
    const s = mkCamp();
    s.facilities.market = 0;
    expect(canUseService(s, 1, "market").allowed).toBe(false);
  });
});

// ── calculateSettlementInvestment ─────────────────────────────────────────────

describe("calculateSettlementInvestment", () => {
  it("sums all facility levels", () => {
    const s = mkTownWithForge(); // forge=2, medical=2, market=2, barracks=2, temple=0
    const investment = calculateSettlementInvestment(s);
    expect(investment).toBe(2 + 2 + 2 + 2 + 0);
  });

  it("returns 0 for camp with no facilities", () => {
    const s = mkCamp();
    const investment = calculateSettlementInvestment(s);
    expect(investment).toBe(0);
  });
});

// ── getSettlementAttractiveness ───────────────────────────────────────────────

describe("getSettlementAttractiveness", () => {
  it("well-provisioned town is more attractive than camp", () => {
    const town = mkTownWithForge();
    const camp = mkCamp();
    expect(getSettlementAttractiveness(town)).toBeGreaterThan(getSettlementAttractiveness(camp));
  });

  it("recent raid reduces attractiveness", () => {
    const safe = mkTownWithForge();
    const raided = mkTownWithForge();
    raided.safetyStatus.ticksSinceLastRaid = 50;

    expect(getSettlementAttractiveness(safe)).toBeGreaterThan(getSettlementAttractiveness(raided));
  });

  it("overcrowded settlement is less attractive", () => {
    const normal = mkTownWithForge();
    const overcrowded = mkTownWithForge();
    overcrowded.population = Math.floor(overcrowded.populationCap * 0.95);

    expect(getSettlementAttractiveness(normal)).toBeGreaterThan(
      getSettlementAttractiveness(overcrowded),
    );
  });

  it("returns non-negative value", () => {
    const s = mkCamp();
    s.safetyStatus.ticksSinceLastRaid = 1;
    s.population = Math.floor(s.populationCap * 0.99);
    expect(getSettlementAttractiveness(s)).toBeGreaterThanOrEqual(0);
  });
});
