// test/polity.test.ts — Phase 61: Polity & World-State System
import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import { TechEra } from "../src/sim/tech.js";
import type { DiseaseProfile } from "../src/sim/disease.js";
import {
  createPolity,
  createPolityRegistry,
  deriveMilitaryStrength,
  computeTradeIncome,
  resolveWarOutcome,
  resolveDiplomacy,
  canAdvanceTech,
  advanceTechEra,
  computePolityDiseaseSpread,
  stepPolityDay,
  declareWar,
  makePeace,
  areAtWar,
  polityFactionStanding,
  POLITY_POP_SCALE,
  TECH_FORCE_MUL,
  TECH_ADVANCE_COST,
  DIPLOMACY_MAX_DELTA,
} from "../src/polity.js";
import {
  createFactionRegistry,
  applyFactionStanding,
  STANDING_NEUTRAL,
  STANDING_RIVAL,
} from "../src/faction.js";
import { createCampaign, addPolity, getPolity } from "../src/campaign.js";
import { mkKnight } from "../src/presets.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function mkMedievalPolity(id: string, factionId: string, pop = 50_000, treasury = 100_000) {
  return createPolity(id, `Polity ${id}`, factionId, [`loc_${id}_a`], pop, treasury, TechEra.Medieval);
}

const AIRBORNE_PROFILE: DiseaseProfile = {
  id:                     "test_plague",
  name:                   "Test Plague",
  transmissionRoute:      "airborne",
  baseTransmissionRate_Q: q(0.40),
  incubationPeriod_s:     86400,
  symptomaticDuration_s:  604800,
  mortalityRate_Q:        q(0.10),
  symptomSeverity_Q:      q(0.50),
  airborneRange_Sm:       50000,
  immunityDuration_s:     -1,
};

const CONTACT_PROFILE: DiseaseProfile = {
  ...AIRBORNE_PROFILE,
  id:                "test_contact",
  transmissionRoute: "contact",
};

// ── createPolity ──────────────────────────────────────────────────────────────

describe("createPolity", () => {
  it("sets all fields correctly", () => {
    const p = createPolity("alpha", "Alpha", "faction_a", ["loc1"], 100_000, 50_000, TechEra.Medieval);
    expect(p.id).toBe("alpha");
    expect(p.population).toBe(100_000);
    expect(p.treasury_cu).toBe(50_000);
    expect(p.techEra).toBe(TechEra.Medieval);
    expect(p.locationIds).toEqual(["loc1"]);
  });

  it("derives militaryStrength_Q on creation", () => {
    const p = createPolity("a", "A", "f", [], 100_000, 0, TechEra.Medieval);
    expect(p.militaryStrength_Q).toBeGreaterThan(0);
  });

  it("uses default stability q(0.70) and morale q(0.65)", () => {
    const p = createPolity("a", "A", "f", [], 1000, 0, TechEra.Medieval);
    expect(p.stabilityQ).toBe(q(0.70));
    expect(p.moraleQ).toBe(q(0.65));
  });

  it("accepts custom stability and morale", () => {
    const p = createPolity("a", "A", "f", [], 1000, 0, TechEra.Medieval, q(0.20), q(0.10));
    expect(p.stabilityQ).toBe(q(0.20));
    expect(p.moraleQ).toBe(q(0.10));
  });

  it("zero population → militaryStrength_Q = 0", () => {
    const p = createPolity("a", "A", "f", [], 0, 0, TechEra.Medieval);
    expect(p.militaryStrength_Q).toBe(0);
  });
});

// ── createPolityRegistry ──────────────────────────────────────────────────────

describe("createPolityRegistry", () => {
  it("indexes polities by id", () => {
    const a = mkMedievalPolity("a", "fa");
    const b = mkMedievalPolity("b", "fb");
    const reg = createPolityRegistry([a, b]);
    expect(reg.polities.get("a")).toBe(a);
    expect(reg.polities.get("b")).toBe(b);
  });

  it("starts with no wars or alliances", () => {
    const reg = createPolityRegistry([mkMedievalPolity("a", "fa")]);
    expect(reg.activeWars.size).toBe(0);
    expect(reg.alliances.size).toBe(0);
  });
});

// ── deriveMilitaryStrength ────────────────────────────────────────────────────

describe("deriveMilitaryStrength", () => {
  it("100 000 pop, q(1.0) morale, Medieval → matches TECH_FORCE_MUL[Medieval]", () => {
    const p = createPolity("a", "f", "f", [], 100_000, 0, TechEra.Medieval, q(0.70), q(1.0));
    const strength = deriveMilitaryStrength(p);
    // popFrac = q(1.0), morale = q(1.0), techMul = TECH_FORCE_MUL[2]
    expect(strength).toBe(TECH_FORCE_MUL[TechEra.Medieval]);
  });

  it("higher tech era → higher strength at same population", () => {
    const ancient  = createPolity("a", "f", "f", [], 50_000, 0, TechEra.Ancient);
    const modern   = createPolity("b", "f", "f", [], 50_000, 0, TechEra.Modern);
    expect(deriveMilitaryStrength(modern)).toBeGreaterThan(deriveMilitaryStrength(ancient));
  });

  it("higher morale → higher strength", () => {
    const low  = createPolity("a", "f", "f", [], 50_000, 0, TechEra.Medieval, q(0.70), q(0.30));
    const high = createPolity("b", "f", "f", [], 50_000, 0, TechEra.Medieval, q(0.70), q(0.90));
    expect(deriveMilitaryStrength(high)).toBeGreaterThan(deriveMilitaryStrength(low));
  });

  it("writes result back to polity.militaryStrength_Q", () => {
    const p = mkMedievalPolity("a", "fa");
    p.militaryStrength_Q = q(0);
    deriveMilitaryStrength(p);
    expect(p.militaryStrength_Q).toBeGreaterThan(0);
  });

  it("population above POLITY_POP_SCALE is clamped at q(1.0) popFrac", () => {
    const big   = createPolity("b", "f", "f", [], 500_000, 0, TechEra.Medieval);
    const exact = createPolity("e", "f", "f", [], POLITY_POP_SCALE, 0, TechEra.Medieval);
    // Both should give same militaryStrength (clamped at q(1.0) pop fraction)
    expect(deriveMilitaryStrength(big)).toBe(deriveMilitaryStrength(exact));
  });

  it("result is always in [0, SCALE.Q]", () => {
    for (const pop of [0, 1000, 50_000, 1_000_000]) {
      const p = createPolity("a", "f", "f", [], pop, 0, TechEra.DeepSpace);
      const s = deriveMilitaryStrength(p);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(SCALE.Q);
    }
  });
});

// ── computeTradeIncome ────────────────────────────────────────────────────────

describe("computeTradeIncome", () => {
  it("returns 0 when sharedLocations = 0", () => {
    const a = mkMedievalPolity("a", "fa");
    const b = mkMedievalPolity("b", "fb");
    expect(computeTradeIncome(a, b, 0, q(0.75))).toBe(0);
  });

  it("returns 0 when either treasury is empty", () => {
    const rich  = mkMedievalPolity("a", "fa", 50_000, 100_000);
    const broke = mkMedievalPolity("b", "fb", 50_000, 0);
    expect(computeTradeIncome(rich, broke, 1, q(0.75))).toBe(0);
  });

  it("positive income for two solvent polities with shared location", () => {
    const a = mkMedievalPolity("a", "fa");
    const b = mkMedievalPolity("b", "fb");
    expect(computeTradeIncome(a, b, 1, q(0.75))).toBeGreaterThan(0);
  });

  it("higher route quality → more income", () => {
    const a = mkMedievalPolity("a", "fa");
    const b = mkMedievalPolity("b", "fb");
    const low  = computeTradeIncome(a, b, 1, q(0.30));
    const high = computeTradeIncome(a, b, 1, q(0.90));
    expect(high).toBeGreaterThan(low);
  });

  it("higher tech era → more trade income", () => {
    const ancient = createPolity("a", "A", "fa", ["l"], 50_000, 100_000, TechEra.Ancient);
    const modern  = createPolity("b", "B", "fb", ["l"], 50_000, 100_000, TechEra.Modern);
    const ancientPair = createPolity("a2", "A2", "fa", ["l"], 50_000, 100_000, TechEra.Ancient);
    const modernPair  = createPolity("b2", "B2", "fb", ["l"], 50_000, 100_000, TechEra.Modern);
    const ancientIncome = computeTradeIncome(ancient, ancientPair, 1, q(0.75));
    const modernIncome  = computeTradeIncome(modern,  modernPair,  1, q(0.75));
    expect(modernIncome).toBeGreaterThan(ancientIncome);
  });

  it("more shared locations → more income", () => {
    const a = mkMedievalPolity("a", "fa");
    const b = mkMedievalPolity("b", "fb");
    const one  = computeTradeIncome(a, b, 1, q(0.75));
    const four = computeTradeIncome(a, b, 4, q(0.75));
    expect(four).toBeGreaterThan(one);
  });

  it("income is symmetric (same regardless of argument order)", () => {
    const a = mkMedievalPolity("a", "fa");
    const b = mkMedievalPolity("b", "fb");
    expect(computeTradeIncome(a, b, 2, q(0.80))).toBe(computeTradeIncome(b, a, 2, q(0.80)));
  });
});

// ── resolveWarOutcome ─────────────────────────────────────────────────────────

describe("resolveWarOutcome", () => {
  it("is deterministic: same seed+tick → same result", () => {
    const a = mkMedievalPolity("a", "fa", 100_000, 0);
    const b = mkMedievalPolity("b", "fb", 50_000,  0);
    const r1 = resolveWarOutcome(a, b, 42, 100);
    const r2 = resolveWarOutcome(a, b, 42, 100);
    expect(r1.attackerWins).toBe(r2.attackerWins);
  });

  it("different ticks can produce different outcomes", () => {
    const a = mkMedievalPolity("a", "fa", 60_000, 0);
    const b = mkMedievalPolity("b", "fb", 60_000, 0);
    const outcomes = new Set<boolean>();
    for (let t = 0; t < 50; t++) {
      outcomes.add(resolveWarOutcome(a, b, 1, t).attackerWins);
    }
    // With equal strength and ±20% uncertainty, should see both outcomes
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it("much stronger attacker wins more often than loses", () => {
    const a = createPolity("a", "A", "fa", ["l"], 500_000, 0, TechEra.Modern);
    const b = createPolity("b", "B", "fb", ["l"], 10_000,  0, TechEra.Medieval);
    let wins = 0;
    for (let t = 0; t < 30; t++) {
      if (resolveWarOutcome(a, b, 99, t).attackerWins) wins++;
    }
    expect(wins).toBeGreaterThan(20);
  });

  it("attacker with zero strength loses every time", () => {
    const a = createPolity("a", "A", "fa", [], 0, 0, TechEra.Medieval);
    const b = mkMedievalPolity("b", "fb", 50_000, 0);
    for (let t = 0; t < 10; t++) {
      expect(resolveWarOutcome(a, b, 1, t).attackerWins).toBe(false);
    }
  });

  it("loser receives negative stabilityDelta", () => {
    const strong = createPolity("s", "S", "fs", ["l"], 500_000, 0, TechEra.Modern);
    const weak   = mkMedievalPolity("w", "fw", 1_000,  0);
    const result = resolveWarOutcome(strong, weak, 1, 1);
    expect(result.attackerWins).toBe(true);
    expect(result.stabilityDeltaAttacker).toBeGreaterThan(0);
    expect(result.stabilityDeltaDefender).toBeLessThan(0);
  });

  it("winner receives positive stabilityDelta", () => {
    const weak   = mkMedievalPolity("w", "fw", 1_000,  0);
    const strong = createPolity("s", "S", "fs", ["l"], 500_000, 0, TechEra.Modern);
    const result = resolveWarOutcome(weak, strong, 1, 1);
    // strong is defender; attacker (weak) loses
    expect(result.attackerWins).toBe(false);
    expect(result.stabilityDeltaDefender).toBeGreaterThan(0);
    expect(result.stabilityDeltaAttacker).toBeLessThan(0);
  });

  it("territory transferred on attacker victory", () => {
    const strong = createPolity("s", "S", "fs", ["l"], 500_000, 0, TechEra.Modern);
    const weak   = createPolity("w", "W", "fw", ["loc_w"], 1_000, 0, TechEra.Medieval);
    const result = resolveWarOutcome(strong, weak, 1, 1);
    if (result.attackerWins) {
      expect(result.territoryGained).toEqual(["loc_w"]);
    } else {
      expect(result.territoryGained).toHaveLength(0);
    }
  });

  it("defender with no locations: no territory transferred even on attacker win", () => {
    const strong = createPolity("s", "S", "fs", ["l"], 500_000, 0, TechEra.Modern);
    const weak   = createPolity("w", "W", "fw", [], 1_000, 0, TechEra.Medieval);
    const result = resolveWarOutcome(strong, weak, 1, 1);
    expect(result.territoryGained).toHaveLength(0);
  });
});

// ── resolveDiplomacy ──────────────────────────────────────────────────────────

describe("resolveDiplomacy", () => {
  it("returns positive standingDelta when below ALLY threshold", () => {
    const a = mkMedievalPolity("a", "fa");
    const b = mkMedievalPolity("b", "fb");
    const result = resolveDiplomacy(a, b, q(0.80), q(0.40));
    expect(result.standingDelta).toBeGreaterThan(0);
  });

  it("higher linguisticIntelligence → larger delta", () => {
    const a = mkMedievalPolity("a", "fa");
    const b = mkMedievalPolity("b", "fb");
    const weak   = resolveDiplomacy(a, b, q(0.20), q(0.40));
    const strong = resolveDiplomacy(a, b, q(0.90), q(0.40));
    expect(strong.standingDelta).toBeGreaterThan(weak.standingDelta);
  });

  it("already at ALLY standing (q(0.70)) → zero delta", () => {
    const a = mkMedievalPolity("a", "fa");
    const b = mkMedievalPolity("b", "fb");
    const result = resolveDiplomacy(a, b, q(0.90), q(0.70));
    expect(result.standingDelta).toBe(0);
  });

  it("above ALLY standing → zero delta (no penalty)", () => {
    const a = mkMedievalPolity("a", "fa");
    const b = mkMedievalPolity("b", "fb");
    const result = resolveDiplomacy(a, b, q(0.90), q(0.90));
    expect(result.standingDelta).toBe(0);
  });

  it("delta is capped at DIPLOMACY_MAX_DELTA", () => {
    const a = mkMedievalPolity("a", "fa");
    const b = mkMedievalPolity("b", "fb");
    const result = resolveDiplomacy(a, b, q(1.0), q(0.0));
    expect(result.standingDelta).toBeLessThanOrEqual(DIPLOMACY_MAX_DELTA);
  });

  it("returns correct polity ids", () => {
    const a = mkMedievalPolity("alpha", "fa");
    const b = mkMedievalPolity("beta",  "fb");
    const result = resolveDiplomacy(a, b, q(0.70), q(0.40));
    expect(result.polityAId).toBe("alpha");
    expect(result.polityBId).toBe("beta");
  });
});

// ── canAdvanceTech / advanceTechEra ───────────────────────────────────────────

describe("canAdvanceTech", () => {
  it("returns false when project not completed", () => {
    const p = mkMedievalPolity("a", "fa", 50_000, 1_000_000);
    expect(canAdvanceTech(p, false)).toBe(false);
  });

  it("returns false when treasury insufficient", () => {
    const p = mkMedievalPolity("a", "fa", 50_000, 0);
    expect(canAdvanceTech(p, true)).toBe(false);
  });

  it("returns true when project done and treasury sufficient", () => {
    const cost = TECH_ADVANCE_COST[TechEra.Medieval]!;
    const p = mkMedievalPolity("a", "fa", 50_000, cost);
    expect(canAdvanceTech(p, true)).toBe(true);
  });

  it("returns false at maximum era (DeepSpace)", () => {
    const cost = TECH_ADVANCE_COST[TechEra.Medieval]!;
    const p = createPolity("a", "A", "f", [], 50_000, cost * 100, TechEra.DeepSpace);
    expect(canAdvanceTech(p, true)).toBe(false);
  });
});

describe("advanceTechEra", () => {
  it("advances techEra by 1 and deducts cost", () => {
    const cost = TECH_ADVANCE_COST[TechEra.Medieval]!;
    const p = mkMedievalPolity("a", "fa", 50_000, cost + 5_000);
    const advanced = advanceTechEra(p, true);
    expect(advanced).toBe(true);
    expect(p.techEra).toBe(TechEra.EarlyModern);
    expect(p.treasury_cu).toBe(5_000);
  });

  it("returns false and does not mutate when conditions not met", () => {
    const p = mkMedievalPolity("a", "fa", 50_000, 0);
    const before = { techEra: p.techEra, treasury: p.treasury_cu };
    expect(advanceTechEra(p, true)).toBe(false);
    expect(p.techEra).toBe(before.techEra);
    expect(p.treasury_cu).toBe(before.treasury);
  });

  it("refreshes militaryStrength_Q after advancement", () => {
    const cost = TECH_ADVANCE_COST[TechEra.Medieval]!;
    const p = mkMedievalPolity("a", "fa", 50_000, cost);
    const beforeStr = p.militaryStrength_Q;
    advanceTechEra(p, true);
    // EarlyModern has higher force multiplier than Medieval
    expect(p.militaryStrength_Q).toBeGreaterThan(beforeStr);
  });
});

// ── computePolityDiseaseSpread ────────────────────────────────────────────────

describe("computePolityDiseaseSpread", () => {
  it("non-airborne disease → no polity-level spread", () => {
    const p = createPolity("a", "A", "f", ["l"], 1_000_000, 0, TechEra.Medieval);
    const result = computePolityDiseaseSpread(p, CONTACT_PROFILE, 1, 1);
    expect(result.newExposures).toBe(0);
    expect(result.populationDelta).toBe(0);
  });

  it("low density → no spread (below threshold)", () => {
    // 1 000 people in 1 location = 1 000 density < 5 000 threshold
    const p = createPolity("a", "A", "f", ["l"], 1_000, 0, TechEra.Medieval);
    const result = computePolityDiseaseSpread(p, AIRBORNE_PROFILE, 1, 1);
    expect(result.newExposures).toBe(0);
    expect(result.populationDelta).toBe(0);
  });

  it("high density → spread occurs", () => {
    // 500 000 people in 1 location = 500 000 density >> 5 000 threshold
    const p = createPolity("a", "A", "f", ["l"], 500_000, 0, TechEra.Medieval);
    const result = computePolityDiseaseSpread(p, AIRBORNE_PROFILE, 42, 1);
    expect(result.newExposures).toBeGreaterThan(0);
  });

  it("population decreases when disease is lethal and spread occurs", () => {
    const p = createPolity("a", "A", "f", ["l"], 500_000, 0, TechEra.Medieval);
    const before = p.population;
    computePolityDiseaseSpread(p, AIRBORNE_PROFILE, 42, 1);
    // With plague_pneumonic-level severity the population should drop
    expect(p.population).toBeLessThanOrEqual(before);
  });

  it("population never goes negative", () => {
    const lethalProfile: DiseaseProfile = {
      ...AIRBORNE_PROFILE,
      mortalityRate_Q: q(1.0),
      symptomSeverity_Q: q(1.0),
      baseTransmissionRate_Q: q(1.0),
    };
    const p = createPolity("a", "A", "f", ["l"], 50_000, 0, TechEra.Medieval);
    computePolityDiseaseSpread(p, lethalProfile, 1, 1);
    expect(p.population).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic: same seed+tick → same result", () => {
    const p1 = createPolity("a", "A", "f", ["l"], 500_000, 0, TechEra.Medieval);
    const p2 = createPolity("a", "A", "f", ["l"], 500_000, 0, TechEra.Medieval);
    const r1 = computePolityDiseaseSpread(p1, AIRBORNE_PROFILE, 7, 5);
    const r2 = computePolityDiseaseSpread(p2, AIRBORNE_PROFILE, 7, 5);
    expect(r1.newExposures).toBe(r2.newExposures);
    expect(r1.populationDelta).toBe(r2.populationDelta);
  });

  it("more locations lowers density and can suppress spread", () => {
    // 30 000 people across 10 locations = 3 000 density < 5 000 threshold
    const p = createPolity("a", "A", "f", ["l1","l2","l3","l4","l5","l6","l7","l8","l9","l10"], 30_000, 0, TechEra.Medieval);
    const result = computePolityDiseaseSpread(p, AIRBORNE_PROFILE, 1, 1);
    expect(result.newExposures).toBe(0);
  });
});

// ── stepPolityDay ─────────────────────────────────────────────────────────────

describe("stepPolityDay", () => {
  it("credits trade income to both polities", () => {
    const a = mkMedievalPolity("a", "fa");
    const b = mkMedievalPolity("b", "fb");
    const reg = createPolityRegistry([a, b]);
    const treasuryBefore = a.treasury_cu;
    const result = stepPolityDay(reg, [{ polityAId: "a", polityBId: "b", sharedLocations: 1, routeQuality_Q: q(0.75) }], 1, 1);
    expect(result.trade).toHaveLength(1);
    expect(a.treasury_cu).toBeGreaterThan(treasuryBefore);
    expect(b.treasury_cu).toBeGreaterThan(100_000);
  });

  it("no trade when polities are at war", () => {
    const a = mkMedievalPolity("a", "fa");
    const b = mkMedievalPolity("b", "fb");
    const reg = createPolityRegistry([a, b]);
    declareWar(reg, "a", "b");
    const treasuryBefore = a.treasury_cu;
    const result = stepPolityDay(reg, [{ polityAId: "a", polityBId: "b", sharedLocations: 2, routeQuality_Q: q(0.80) }], 1, 1);
    expect(result.trade).toHaveLength(0);
    // treasury unchanged by trade (war may have affected stability but not treasury here)
    expect(a.treasury_cu).toBe(treasuryBefore);
  });

  it("stability improves when morale > q(0.50)", () => {
    const p = createPolity("a", "A", "fa", [], 50_000, 0, TechEra.Medieval, q(0.50), q(0.80));
    const reg = createPolityRegistry([p]);
    const before = p.stabilityQ;
    stepPolityDay(reg, [], 1, 1);
    // Recovery (q(0.004)) > Decay (q(0.002)) → net positive
    expect(p.stabilityQ).toBeGreaterThan(before);
  });

  it("stability declines when morale ≤ q(0.50)", () => {
    const p = createPolity("a", "A", "fa", [], 50_000, 0, TechEra.Medieval, q(0.50), q(0.40));
    const reg = createPolityRegistry([p]);
    const before = p.stabilityQ;
    stepPolityDay(reg, [], 1, 1);
    expect(p.stabilityQ).toBeLessThan(before);
  });

  it("morale drains when stability < UNREST_THRESHOLD", () => {
    const p = createPolity("a", "A", "fa", [], 50_000, 0, TechEra.Medieval, q(0.20), q(0.60));
    const reg = createPolityRegistry([p]);
    const before = p.moraleQ;
    stepPolityDay(reg, [], 1, 1);
    expect(p.moraleQ).toBeLessThan(before);
  });

  it("morale recovers when stability ≥ UNREST_THRESHOLD", () => {
    const p = createPolity("a", "A", "fa", [], 50_000, 0, TechEra.Medieval, q(0.60), q(0.40));
    const reg = createPolityRegistry([p]);
    const before = p.moraleQ;
    stepPolityDay(reg, [], 1, 1);
    expect(p.moraleQ).toBeGreaterThan(before);
  });

  it("stabilityQ and moraleQ are always clamped to [0, SCALE.Q]", () => {
    const p = createPolity("a", "A", "fa", [], 0, 0, TechEra.Medieval, q(0.0), q(0.0));
    const reg = createPolityRegistry([p]);
    for (let t = 0; t < 10; t++) stepPolityDay(reg, [], 1, t);
    expect(p.stabilityQ).toBeGreaterThanOrEqual(0);
    expect(p.moraleQ).toBeGreaterThanOrEqual(0);
  });

  it("militaryStrength_Q is refreshed each step", () => {
    const p = mkMedievalPolity("a", "fa");
    const reg = createPolityRegistry([p]);
    p.militaryStrength_Q = q(0);
    stepPolityDay(reg, [], 1, 1);
    expect(p.militaryStrength_Q).toBeGreaterThan(0);
  });

  it("returns moraleDeltas and stabilityDeltas maps keyed by polityId", () => {
    const p = mkMedievalPolity("a", "fa");
    const reg = createPolityRegistry([p]);
    const result = stepPolityDay(reg, [], 1, 1);
    expect(result.moraleDeltas.has("a")).toBe(true);
    expect(result.stabilityDeltas.has("a")).toBe(true);
  });

  it("active war applies stability consequences to both sides", () => {
    const strong = createPolity("s", "S", "fs", ["l"], 500_000, 0, TechEra.Modern);
    const weak   = createPolity("w", "W", "fw", ["lw"], 1_000,  0, TechEra.Medieval);
    const reg = createPolityRegistry([strong, weak]);
    declareWar(reg, "s", "w");  // "s" < "w" alphabetically
    const weakStabilityBefore = weak.stabilityQ;
    stepPolityDay(reg, [], 1, 1);
    // Strong attacker should win, weak defender loses stability
    expect(weak.stabilityQ).toBeLessThan(weakStabilityBefore);
  });
});

// ── War registry helpers ──────────────────────────────────────────────────────

describe("war registry", () => {
  it("declareWar registers a war", () => {
    const reg = createPolityRegistry([]);
    declareWar(reg, "alpha", "beta");
    expect(areAtWar(reg, "alpha", "beta")).toBe(true);
  });

  it("areAtWar is order-independent", () => {
    const reg = createPolityRegistry([]);
    declareWar(reg, "a", "b");
    expect(areAtWar(reg, "b", "a")).toBe(true);
    expect(areAtWar(reg, "a", "b")).toBe(true);
  });

  it("makePeace removes the war", () => {
    const reg = createPolityRegistry([]);
    declareWar(reg, "a", "b");
    makePeace(reg, "a", "b");
    expect(areAtWar(reg, "a", "b")).toBe(false);
  });

  it("declareWar is idempotent", () => {
    const reg = createPolityRegistry([]);
    declareWar(reg, "a", "b");
    declareWar(reg, "a", "b");
    expect(reg.activeWars.size).toBe(1);
  });
});

// ── polityFactionStanding ─────────────────────────────────────────────────────

describe("polityFactionStanding", () => {
  it("returns STANDING_NEUTRAL for unknown faction pair", () => {
    const fReg = createFactionRegistry([]);
    const a = mkMedievalPolity("a", "fa");
    const b = mkMedievalPolity("b", "fb");
    expect(polityFactionStanding(fReg, a, b)).toBe(STANDING_NEUTRAL);
  });

  it("returns registered standing for known faction pair", () => {
    const fReg = createFactionRegistry([
      { id: "fa", name: "A", rivals: new Set(["fb"]), allies: new Set() },
      { id: "fb", name: "B", rivals: new Set(), allies: new Set() },
    ]);
    const a = mkMedievalPolity("a", "fa");
    const b = mkMedievalPolity("b", "fb");
    expect(polityFactionStanding(fReg, a, b)).toBe(STANDING_RIVAL);
  });
});

// ── applyFactionStanding (Phase 24 revision) ──────────────────────────────────

describe("applyFactionStanding", () => {
  it("increases global standing by delta", () => {
    const fReg = createFactionRegistry([
      { id: "fa", name: "A", rivals: new Set(["fb"]), allies: new Set() },
      { id: "fb", name: "B", rivals: new Set(), allies: new Set() },
    ]);
    const before = fReg.globalStanding.get("fa")?.get("fb") ?? STANDING_NEUTRAL;
    applyFactionStanding(fReg, "fa", "fb", q(0.10));
    const after = fReg.globalStanding.get("fa")!.get("fb")!;
    expect(after).toBe(before + q(0.10));
  });

  it("creates inner map when source faction has no relations", () => {
    const fReg = createFactionRegistry([]);
    applyFactionStanding(fReg, "new_faction", "other", q(0.05));
    expect(fReg.globalStanding.get("new_faction")?.get("other")).toBe(STANDING_NEUTRAL + q(0.05));
  });

  it("clamps to [0, SCALE.Q]", () => {
    const fReg = createFactionRegistry([]);
    applyFactionStanding(fReg, "a", "b", q(0.80));
    applyFactionStanding(fReg, "a", "b", q(0.80));  // would overshoot without clamp
    expect(fReg.globalStanding.get("a")?.get("b")).toBeLessThanOrEqual(SCALE.Q);
  });
});

// ── Campaign integration (Phase 22 revision) ──────────────────────────────────

describe("campaign polity integration", () => {
  it("addPolity registers polity in campaign", () => {
    const campaign = createCampaign("c1", [mkKnight(1, 1, 0, 0)]);
    const p = mkMedievalPolity("realm", "fa");
    addPolity(campaign, p);
    expect(campaign.polities?.get("realm")).toBe(p);
  });

  it("getPolity retrieves by id", () => {
    const campaign = createCampaign("c1", [mkKnight(1, 1, 0, 0)]);
    const p = mkMedievalPolity("realm", "fa");
    addPolity(campaign, p);
    expect(getPolity(campaign, "realm")).toBe(p);
    expect(getPolity(campaign, "unknown")).toBeUndefined();
  });

  it("polities field absent until first addPolity call", () => {
    const campaign = createCampaign("c1", [mkKnight(1, 1, 0, 0)]);
    expect(campaign.polities).toBeUndefined();
  });

  it("multiple polities can be registered", () => {
    const campaign = createCampaign("c1", [mkKnight(1, 1, 0, 0)]);
    addPolity(campaign, mkMedievalPolity("a", "fa"));
    addPolity(campaign, mkMedievalPolity("b", "fb"));
    expect(campaign.polities?.size).toBe(2);
  });
});
