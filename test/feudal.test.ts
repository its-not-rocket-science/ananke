// test/feudal.test.ts — Phase 79: Feudal Bonds & Vassal Tribute

import { describe, it, expect } from "vitest";
import { q, SCALE, type Q } from "../src/units.js";
import {
  REBELLION_THRESHOLD,
  LOYALTY_DECAY_PER_DAY,
  LOYALTY_BASE_STRENGTH,
  OATH_BREAK_INFAMY_Q,
  TRIBUTE_DAYS_PER_YEAR,
  createFeudalRegistry,
  createVassalBond,
  getBond,
  getVassals,
  getLiege,
  computeDailyTribute,
  applyDailyTribute,
  computeLevyStrength,
  stepBondStrength,
  reinforceBond,
  isRebellionRisk,
  breakVassalBond,
} from "../src/feudal.js";
import { createPolity } from "../src/polity.js";
import { createRenownRegistry, getRenownRecord } from "../src/renown.js";

// ── createFeudalRegistry ───────────────────────────────────────────────────────

describe("createFeudalRegistry", () => {
  it("creates empty bonds map", () => {
    const r = createFeudalRegistry();
    expect(r.bonds.size).toBe(0);
  });
});

// ── createVassalBond ───────────────────────────────────────────────────────────

describe("createVassalBond", () => {
  it("creates bond with default rates", () => {
    const r = createFeudalRegistry();
    const bond = createVassalBond(r, "v1", "l1", "oath_sworn");
    expect(bond.vassalPolityId).toBe("v1");
    expect(bond.liegePolityId).toBe("l1");
    expect(bond.loyaltyType).toBe("oath_sworn");
    expect(bond.tributeRate_Q).toBe(q(0.10));
    expect(bond.levyRate_Q).toBe(q(0.20));
    expect(bond.strength_Q).toBe(LOYALTY_BASE_STRENGTH["oath_sworn"]);
    expect(bond.establishedTick).toBe(0);
  });

  it("creates bond with custom rates", () => {
    const r = createFeudalRegistry();
    const bond = createVassalBond(r, "v1", "l1", "conquered", q(0.30), q(0.40), 10);
    expect(bond.tributeRate_Q).toBe(q(0.30));
    expect(bond.levyRate_Q).toBe(q(0.40));
    expect(bond.establishedTick).toBe(10);
  });

  it("sets base strength by loyalty type", () => {
    const r = createFeudalRegistry();
    expect(createVassalBond(r, "v1", "l1", "kin_bound").strength_Q).toBe(LOYALTY_BASE_STRENGTH["kin_bound"]);
    expect(createVassalBond(r, "v2", "l1", "oath_sworn").strength_Q).toBe(LOYALTY_BASE_STRENGTH["oath_sworn"]);
    expect(createVassalBond(r, "v3", "l1", "voluntary").strength_Q).toBe(LOYALTY_BASE_STRENGTH["voluntary"]);
    expect(createVassalBond(r, "v4", "l1", "conquered").strength_Q).toBe(LOYALTY_BASE_STRENGTH["conquered"]);
  });

  it("kin_bound has highest base strength, conquered lowest", () => {
    expect(LOYALTY_BASE_STRENGTH["kin_bound"]).toBeGreaterThan(LOYALTY_BASE_STRENGTH["oath_sworn"]);
    expect(LOYALTY_BASE_STRENGTH["oath_sworn"]).toBeGreaterThan(LOYALTY_BASE_STRENGTH["voluntary"]);
    expect(LOYALTY_BASE_STRENGTH["voluntary"]).toBeGreaterThan(LOYALTY_BASE_STRENGTH["conquered"]);
  });

  it("stores bond in registry", () => {
    const r = createFeudalRegistry();
    createVassalBond(r, "v1", "l1", "oath_sworn");
    expect(r.bonds.size).toBe(1);
  });

  it("overwrites existing bond for same pair", () => {
    const r = createFeudalRegistry();
    createVassalBond(r, "v1", "l1", "conquered");
    createVassalBond(r, "v1", "l1", "oath_sworn");
    expect(r.bonds.size).toBe(1);
    expect(getBond(r, "v1", "l1")?.loyaltyType).toBe("oath_sworn");
  });
});

// ── getBond ────────────────────────────────────────────────────────────────────

describe("getBond", () => {
  it("returns the bond for a known pair", () => {
    const r = createFeudalRegistry();
    createVassalBond(r, "v1", "l1", "voluntary");
    expect(getBond(r, "v1", "l1")).toBeDefined();
  });

  it("returns undefined for unknown pair", () => {
    const r = createFeudalRegistry();
    expect(getBond(r, "v1", "l1")).toBeUndefined();
  });

  it("is directional — v1→l1 ≠ l1→v1", () => {
    const r = createFeudalRegistry();
    createVassalBond(r, "v1", "l1", "voluntary");
    expect(getBond(r, "l1", "v1")).toBeUndefined();
  });
});

// ── getVassals ─────────────────────────────────────────────────────────────────

describe("getVassals", () => {
  it("returns all bonds where liegeId matches", () => {
    const r = createFeudalRegistry();
    createVassalBond(r, "v1", "l1", "oath_sworn");
    createVassalBond(r, "v2", "l1", "conquered");
    createVassalBond(r, "v3", "l2", "voluntary");
    const vassals = getVassals(r, "l1");
    expect(vassals).toHaveLength(2);
    expect(vassals.map(b => b.vassalPolityId).sort()).toEqual(["v1", "v2"]);
  });

  it("returns empty array if no vassals", () => {
    const r = createFeudalRegistry();
    expect(getVassals(r, "l1")).toHaveLength(0);
  });
});

// ── getLiege ───────────────────────────────────────────────────────────────────

describe("getLiege", () => {
  it("returns the bond where vassalId matches", () => {
    const r = createFeudalRegistry();
    createVassalBond(r, "v1", "l1", "oath_sworn");
    const bond = getLiege(r, "v1");
    expect(bond?.liegePolityId).toBe("l1");
  });

  it("returns undefined if not a vassal", () => {
    const r = createFeudalRegistry();
    expect(getLiege(r, "v1")).toBeUndefined();
  });
});

// ── computeDailyTribute ────────────────────────────────────────────────────────

describe("computeDailyTribute", () => {
  // population=1000, treasury_cu=365_000 → daily = floor(365_000 * 1000 / 10000 / 365) = 100
  const vassal = createPolity("v1", "Vassal", "f1", [], 1000, 365_000, "Medieval");
  const bond = {
    vassalPolityId: "v1", liegePolityId: "l1",
    loyaltyType: "oath_sworn" as const,
    tributeRate_Q: q(0.10),
    levyRate_Q: q(0.20),
    strength_Q: q(0.70),
    establishedTick: 0,
  };

  it("returns daily tribute ≈ annual × rate / 365", () => {
    // 365_000 * 0.10 / 365 = 100
    const tribute = computeDailyTribute(vassal, bond);
    expect(tribute).toBe(100);
  });

  it("returns 0 if treasury is empty", () => {
    const broke = createPolity("v0", "Broke", "f1", [], 0, 0, "Medieval");
    expect(computeDailyTribute(broke, bond)).toBe(0);
  });

  it("floors the result", () => {
    const small = createPolity("v2", "Small", "f1", [], 1, 500, "Medieval");
    const tribute = computeDailyTribute(small, bond);
    expect(Number.isInteger(tribute)).toBe(true);
  });

  it("scales with tribute rate", () => {
    const highRate = { ...bond, tributeRate_Q: q(0.20) };
    const low = computeDailyTribute(vassal, bond);
    const high = computeDailyTribute(vassal, highRate);
    expect(high).toBeGreaterThan(low);
  });

  it("returns 0 for small treasury where floor rounds to 0", () => {
    const tiny = createPolity("vt", "T", "f1", [], 1000, 1, "Medieval");
    expect(computeDailyTribute(tiny, bond)).toBe(0);
  });
});

// ── applyDailyTribute ──────────────────────────────────────────────────────────

describe("applyDailyTribute", () => {
  it("transfers tribute from vassal to liege", () => {
    // population=1000, treasury_cu=365_000 → daily tribute = 100
    const vassal = createPolity("v1", "Vassal", "f1", [], 1000, 365_000, "Medieval");
    const liege  = createPolity("l1", "Liege",  "f2", [], 1000, 100_000, "Medieval");
    const bond = {
      vassalPolityId: "v1", liegePolityId: "l1",
      loyaltyType: "oath_sworn" as const,
      tributeRate_Q: q(0.10),
      levyRate_Q: q(0.20),
      strength_Q: q(0.70),
      establishedTick: 0,
    };
    const tribute = applyDailyTribute(vassal, liege, bond);
    expect(tribute).toBe(100);
    expect(vassal.treasury_cu).toBe(365_000 - 100);
    expect(liege.treasury_cu).toBe(100_000 + 100);
  });

  it("returns 0 and does not mutate if vassal treasury empty", () => {
    const vassal = createPolity("v1", "Vassal", "f1", [], 1000, 0, "Medieval");
    const liege  = createPolity("l1", "Liege",  "f2", [], 1000, 50_000, "Medieval");
    const bond = {
      vassalPolityId: "v1", liegePolityId: "l1",
      loyaltyType: "conquered" as const,
      tributeRate_Q: q(0.10),
      levyRate_Q: q(0.20),
      strength_Q: q(0.40),
      establishedTick: 0,
    };
    expect(applyDailyTribute(vassal, liege, bond)).toBe(0);
    expect(liege.treasury_cu).toBe(50_000);
  });

  it("vassal treasury cannot go below 0", () => {
    const vassal = createPolity("v1", "V", "f1", [], 1000, 365_000, "Medieval");
    const liege  = createPolity("l1", "L", "f2", [], 1000, 0, "Medieval");
    const bond = {
      vassalPolityId: "v1", liegePolityId: "l1",
      loyaltyType: "conquered" as const,
      tributeRate_Q: q(0.99),
      levyRate_Q: q(0.20),
      strength_Q: q(0.40),
      establishedTick: 0,
    };
    applyDailyTribute(vassal, liege, bond);
    expect(vassal.treasury_cu).toBeGreaterThanOrEqual(0);
  });
});

// ── computeLevyStrength ────────────────────────────────────────────────────────

describe("computeLevyStrength", () => {
  const vassal = createPolity("v1", "V", "f1", [], 0, 0, "Medieval");

  it("levy at full strength = militaryStrength × levyRate", () => {
    vassal.militaryStrength_Q = q(1.0) as Q;
    const bond = {
      vassalPolityId: "v1", liegePolityId: "l1",
      loyaltyType: "oath_sworn" as const,
      tributeRate_Q: q(0.10),
      levyRate_Q: q(0.20),
      strength_Q: q(1.0),
      establishedTick: 0,
    };
    const levy = computeLevyStrength(vassal, bond);
    expect(levy).toBe(q(0.20));
  });

  it("levy is reduced by weakened bond strength", () => {
    vassal.militaryStrength_Q = q(1.0) as Q;
    const full = {
      vassalPolityId: "v1", liegePolityId: "l1",
      loyaltyType: "oath_sworn" as const,
      tributeRate_Q: q(0.10),
      levyRate_Q: q(0.20),
      strength_Q: q(1.0),
      establishedTick: 0,
    };
    const weak = { ...full, strength_Q: q(0.50) };
    expect(computeLevyStrength(vassal, weak)).toBeLessThan(computeLevyStrength(vassal, full));
  });

  it("returns 0 when strength is 0", () => {
    vassal.militaryStrength_Q = q(1.0) as Q;
    const bond = {
      vassalPolityId: "v1", liegePolityId: "l1",
      loyaltyType: "conquered" as const,
      tributeRate_Q: q(0.10),
      levyRate_Q: q(0.20),
      strength_Q: 0,
      establishedTick: 0,
    };
    expect(computeLevyStrength(vassal, bond)).toBe(0);
  });

  it("result is clamped to [0, SCALE.Q]", () => {
    vassal.militaryStrength_Q = SCALE.Q as Q;
    const bond = {
      vassalPolityId: "v1", liegePolityId: "l1",
      loyaltyType: "kin_bound" as const,
      tributeRate_Q: q(0.10),
      levyRate_Q: SCALE.Q,
      strength_Q: SCALE.Q,
      establishedTick: 0,
    };
    const levy = computeLevyStrength(vassal, bond);
    expect(levy).toBeGreaterThanOrEqual(0);
    expect(levy).toBeLessThanOrEqual(SCALE.Q);
  });
});

// ── stepBondStrength ───────────────────────────────────────────────────────────

describe("stepBondStrength", () => {
  it("decays strength by loyaltyType rate", () => {
    const bond = {
      vassalPolityId: "v1", liegePolityId: "l1",
      loyaltyType: "conquered" as const,
      tributeRate_Q: q(0.10),
      levyRate_Q: q(0.20),
      strength_Q: q(0.40),
      establishedTick: 0,
    };
    const before = bond.strength_Q;
    stepBondStrength(bond);
    expect(bond.strength_Q).toBe(before - LOYALTY_DECAY_PER_DAY["conquered"]);
  });

  it("kin_bound decays slower than conquered", () => {
    expect(LOYALTY_DECAY_PER_DAY["kin_bound"]).toBeLessThan(LOYALTY_DECAY_PER_DAY["conquered"]);
  });

  it("positive boost slows decay", () => {
    const bond1 = {
      vassalPolityId: "v1", liegePolityId: "l1",
      loyaltyType: "voluntary" as const,
      tributeRate_Q: q(0.10),
      levyRate_Q: q(0.20),
      strength_Q: q(0.65),
      establishedTick: 0,
    };
    const bond2 = { ...bond1, strength_Q: q(0.65) };
    stepBondStrength(bond1, 0);
    stepBondStrength(bond2, q(0.01));
    expect(bond2.strength_Q).toBeGreaterThan(bond1.strength_Q);
  });

  it("strength cannot go below 0", () => {
    const bond = {
      vassalPolityId: "v1", liegePolityId: "l1",
      loyaltyType: "conquered" as const,
      tributeRate_Q: q(0.10),
      levyRate_Q: q(0.20),
      strength_Q: 0,
      establishedTick: 0,
    };
    stepBondStrength(bond);
    expect(bond.strength_Q).toBe(0);
  });

  it("strength cannot exceed SCALE.Q", () => {
    const bond = {
      vassalPolityId: "v1", liegePolityId: "l1",
      loyaltyType: "kin_bound" as const,
      tributeRate_Q: q(0.10),
      levyRate_Q: q(0.20),
      strength_Q: q(0.99),
      establishedTick: 0,
    };
    stepBondStrength(bond, q(0.10));
    expect(bond.strength_Q).toBeLessThanOrEqual(SCALE.Q);
  });

  it("mutates bond directly", () => {
    const bond = {
      vassalPolityId: "v1", liegePolityId: "l1",
      loyaltyType: "oath_sworn" as const,
      tributeRate_Q: q(0.10),
      levyRate_Q: q(0.20),
      strength_Q: q(0.70),
      establishedTick: 0,
    };
    const ref = bond;
    stepBondStrength(bond);
    expect(ref.strength_Q).toBe(bond.strength_Q);
  });
});

// ── reinforceBond ──────────────────────────────────────────────────────────────

describe("reinforceBond", () => {
  it("increases bond strength", () => {
    const bond = {
      vassalPolityId: "v1", liegePolityId: "l1",
      loyaltyType: "conquered" as const,
      tributeRate_Q: q(0.10),
      levyRate_Q: q(0.20),
      strength_Q: q(0.40),
      establishedTick: 0,
    };
    reinforceBond(bond, q(0.10));
    expect(bond.strength_Q).toBe(q(0.50));
  });

  it("clamps to SCALE.Q maximum", () => {
    const bond = {
      vassalPolityId: "v1", liegePolityId: "l1",
      loyaltyType: "kin_bound" as const,
      tributeRate_Q: q(0.10),
      levyRate_Q: q(0.20),
      strength_Q: q(0.95),
      establishedTick: 0,
    };
    reinforceBond(bond, q(0.20));
    expect(bond.strength_Q).toBe(SCALE.Q);
  });

  it("does not go below 0 with negative delta", () => {
    const bond = {
      vassalPolityId: "v1", liegePolityId: "l1",
      loyaltyType: "conquered" as const,
      tributeRate_Q: q(0.10),
      levyRate_Q: q(0.20),
      strength_Q: q(0.05),
      establishedTick: 0,
    };
    reinforceBond(bond, -q(0.20));
    expect(bond.strength_Q).toBe(0);
  });
});

// ── isRebellionRisk ────────────────────────────────────────────────────────────

describe("isRebellionRisk", () => {
  const makeBond = (strength: number) => ({
    vassalPolityId: "v1", liegePolityId: "l1",
    loyaltyType: "conquered" as const,
    tributeRate_Q: q(0.10),
    levyRate_Q: q(0.20),
    strength_Q: strength,
    establishedTick: 0,
  });

  it("returns true below REBELLION_THRESHOLD", () => {
    expect(isRebellionRisk(makeBond(REBELLION_THRESHOLD - 1))).toBe(true);
  });

  it("returns false at REBELLION_THRESHOLD", () => {
    expect(isRebellionRisk(makeBond(REBELLION_THRESHOLD))).toBe(false);
  });

  it("returns false above REBELLION_THRESHOLD", () => {
    expect(isRebellionRisk(makeBond(q(0.60)))).toBe(false);
  });

  it("newly conquered bond is not at rebellion risk", () => {
    const r = createFeudalRegistry();
    const bond = createVassalBond(r, "v1", "l1", "conquered");
    // conquered base = q(0.40) > q(0.25) threshold
    expect(isRebellionRisk(bond)).toBe(false);
  });

  it("bond at zero strength is at rebellion risk", () => {
    expect(isRebellionRisk(makeBond(0))).toBe(true);
  });
});

// ── breakVassalBond ────────────────────────────────────────────────────────────

describe("breakVassalBond", () => {
  it("removes bond from registry", () => {
    const r = createFeudalRegistry();
    createVassalBond(r, "v1", "l1", "oath_sworn");
    const removed = breakVassalBond(r, "v1", "l1");
    expect(removed).toBe(true);
    expect(r.bonds.size).toBe(0);
  });

  it("returns false if bond does not exist", () => {
    const r = createFeudalRegistry();
    expect(breakVassalBond(r, "v1", "l1")).toBe(false);
  });

  it("adds oath infamy to vassal ruler for oath_sworn bonds", () => {
    const r = createFeudalRegistry();
    const renownR = createRenownRegistry();
    createVassalBond(r, "v1", "l1", "oath_sworn");
    breakVassalBond(r, "v1", "l1", 42, renownR);
    const record = getRenownRecord(renownR, 42);
    expect(record.infamy_Q).toBe(OATH_BREAK_INFAMY_Q);
  });

  it("does NOT add oath infamy for conquered bonds", () => {
    const r = createFeudalRegistry();
    const renownR = createRenownRegistry();
    createVassalBond(r, "v1", "l1", "conquered");
    breakVassalBond(r, "v1", "l1", 42, renownR);
    const record = getRenownRecord(renownR, 42);
    expect(record.infamy_Q).toBe(0);
  });

  it("does NOT add oath infamy for kin_bound bonds", () => {
    const r = createFeudalRegistry();
    const renownR = createRenownRegistry();
    createVassalBond(r, "v1", "l1", "kin_bound");
    breakVassalBond(r, "v1", "l1", 99, renownR);
    const record = getRenownRecord(renownR, 99);
    expect(record.infamy_Q).toBe(0);
  });

  it("does NOT add oath infamy for voluntary bonds", () => {
    const r = createFeudalRegistry();
    const renownR = createRenownRegistry();
    createVassalBond(r, "v1", "l1", "voluntary");
    breakVassalBond(r, "v1", "l1", 7, renownR);
    const record = getRenownRecord(renownR, 7);
    expect(record.infamy_Q).toBe(0);
  });

  it("applies no infamy if vassalRulerId not provided", () => {
    const r = createFeudalRegistry();
    const renownR = createRenownRegistry();
    createVassalBond(r, "v1", "l1", "oath_sworn");
    breakVassalBond(r, "v1", "l1", undefined, renownR);
    expect(renownR.records.size).toBe(0);
  });

  it("applies no infamy if renownRegistry not provided", () => {
    const r = createFeudalRegistry();
    createVassalBond(r, "v1", "l1", "oath_sworn");
    // should not throw
    expect(() => breakVassalBond(r, "v1", "l1", 42)).not.toThrow();
  });

  it("bond is removed even if no renown registry", () => {
    const r = createFeudalRegistry();
    createVassalBond(r, "v1", "l1", "oath_sworn");
    breakVassalBond(r, "v1", "l1", 42);
    expect(getBond(r, "v1", "l1")).toBeUndefined();
  });
});

// ── constants sanity ───────────────────────────────────────────────────────────

describe("constants", () => {
  it("REBELLION_THRESHOLD is q(0.25)", () => {
    expect(REBELLION_THRESHOLD).toBe(q(0.25));
  });

  it("OATH_BREAK_INFAMY_Q is q(0.15)", () => {
    expect(OATH_BREAK_INFAMY_Q).toBe(q(0.15));
  });

  it("TRIBUTE_DAYS_PER_YEAR is 365", () => {
    expect(TRIBUTE_DAYS_PER_YEAR).toBe(365);
  });

  it("conquered decays fastest", () => {
    const decays = Object.values(LOYALTY_DECAY_PER_DAY);
    expect(LOYALTY_DECAY_PER_DAY["conquered"]).toBe(Math.max(...decays));
  });

  it("kin_bound decays slowest", () => {
    const decays = Object.values(LOYALTY_DECAY_PER_DAY);
    expect(LOYALTY_DECAY_PER_DAY["kin_bound"]).toBe(Math.min(...decays));
  });
});

// ── integration: tribute over time ────────────────────────────────────────────

describe("tribute accumulation", () => {
  it("365 days of tribute transfers meaningful value from vassal to liege", () => {
    // treasury_cu = 36_500_000, rate = 10%, SCALE.Q = 10000, 365 days
    // daily = floor(36_500_000 * 1000 / 10000 / 365) = floor(10_000) = 10_000
    const vassal = createPolity("v1", "V", "f1", [], 1000, 36_500_000, "Medieval");
    const liege  = createPolity("l1", "L", "f2", [], 1000, 0, "Medieval");
    const r = createFeudalRegistry();
    const bond = createVassalBond(r, "v1", "l1", "oath_sworn", q(0.10), q(0.20), 0);
    let total = 0;
    for (let day = 0; day < 365; day++) {
      total += applyDailyTribute(vassal, liege, bond);
    }
    expect(total).toBeGreaterThan(0);
    expect(liege.treasury_cu).toBe(total);
    // should be roughly 10% of initial treasury
    expect(total).toBeGreaterThan(36_500_000 * 0.08);
    expect(total).toBeLessThan(36_500_000 * 0.12);
  });
});

// ── integration: bond decay to rebellion ──────────────────────────────────────

describe("bond decay to rebellion", () => {
  it("conquered bond decays to rebellion risk after sufficient days", () => {
    const r = createFeudalRegistry();
    const bond = createVassalBond(r, "v1", "l1", "conquered");
    // conquered starts at q(0.40), threshold q(0.25), decay q(0.005)/day
    // days to reach < threshold: (0.40 - 0.25) / 0.005 = 30 days exactly at threshold; 31 = below
    for (let i = 0; i < 31; i++) stepBondStrength(bond);
    expect(isRebellionRisk(bond)).toBe(true);
  });

  it("kin_bound bond stays safe much longer", () => {
    const r = createFeudalRegistry();
    const bond = createVassalBond(r, "v1", "l1", "kin_bound");
    // kin_bound: q(0.90) - q(0.25) = q(0.65), at q(0.001)/day → 650 days
    for (let i = 0; i < 200; i++) stepBondStrength(bond);
    expect(isRebellionRisk(bond)).toBe(false);
  });

  it("reinforcement can prevent rebellion risk", () => {
    const r = createFeudalRegistry();
    const bond = createVassalBond(r, "v1", "l1", "conquered");
    for (let day = 0; day < 30; day++) {
      stepBondStrength(bond);
      if (day % 5 === 0) reinforceBond(bond, q(0.02));
    }
    expect(isRebellionRisk(bond)).toBe(false);
  });
});
