// test/mercenaries.test.ts — Phase 99: Mercenaries & Hired Forces

import { describe, it, expect } from "vitest";
import {
  DESERT_LOYALTY_THRESHOLD_Q,
  LOYALTY_DECAY_PER_DAY_UNPAID,
  LOYALTY_GROWTH_PER_DAY_PAID,
  LOYALTY_VICTORY_BONUS_Q,
  MAX_MERC_STRENGTH_BONUS_Q,
  DESERT_ROLL_MAX,
  BAND_LIGHT_CAVALRY,
  BAND_HEAVY_INFANTRY,
  BAND_SIEGE_ENGINEERS,
  createMercenaryBand,
  hireMercenaries,
  computeMercenaryWage,
  computeMercenaryStrengthContribution,
  applyVictoryLoyaltyBonus,
  stepMercenaryContract,
  isMercenaryReliable,
  hasMercenaryArrears,
} from "../src/mercenaries.js";
import { q, SCALE } from "../src/units.js";
import type { Q } from "../src/units.js";
import type { Polity } from "../src/polity.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePolity(treasury_cu = 100_000): Polity {
  return {
    id: "p1", name: "Test",
    factionId: "f1", locationIds: [],
    population: 50_000, treasury_cu,
    techEra: 2 as any,
    militaryStrength_Q: q(0.60) as Q,
    stabilityQ: q(0.70) as Q,
    moraleQ: q(0.60) as Q,
  } as Polity;
}

function makeContract(loyalty_Q: Q = q(0.70) as Q) {
  return hireMercenaries("c1", "p1", BAND_HEAVY_INFANTRY, loyalty_Q);
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("DESERT_LOYALTY_THRESHOLD_Q is positive and below q(0.50)", () => {
    expect(DESERT_LOYALTY_THRESHOLD_Q).toBeGreaterThan(0);
    expect(DESERT_LOYALTY_THRESHOLD_Q).toBeLessThan(q(0.50));
  });

  it("loyalty decays faster unpaid than it grows when paid", () => {
    expect(LOYALTY_DECAY_PER_DAY_UNPAID).toBeGreaterThan(LOYALTY_GROWTH_PER_DAY_PAID);
  });

  it("DESERT_ROLL_MAX is positive and below SCALE.Q", () => {
    expect(DESERT_ROLL_MAX).toBeGreaterThan(0);
    expect(DESERT_ROLL_MAX).toBeLessThan(SCALE.Q);
  });

  it("MAX_MERC_STRENGTH_BONUS_Q is a meaningful fraction", () => {
    expect(MAX_MERC_STRENGTH_BONUS_Q).toBeGreaterThan(q(0.10));
    expect(MAX_MERC_STRENGTH_BONUS_Q).toBeLessThanOrEqual(q(0.50));
  });
});

// ── Sample bands ──────────────────────────────────────────────────────────────

describe("sample bands", () => {
  it("BAND_HEAVY_INFANTRY has higher quality than BAND_LIGHT_CAVALRY", () => {
    expect(BAND_HEAVY_INFANTRY.quality_Q).toBeGreaterThan(BAND_LIGHT_CAVALRY.quality_Q);
  });

  it("BAND_SIEGE_ENGINEERS has highest daily wage", () => {
    const max = Math.max(
      BAND_LIGHT_CAVALRY.dailyWagePerSoldier_cu,
      BAND_HEAVY_INFANTRY.dailyWagePerSoldier_cu,
      BAND_SIEGE_ENGINEERS.dailyWagePerSoldier_cu,
    );
    expect(BAND_SIEGE_ENGINEERS.dailyWagePerSoldier_cu).toBe(max);
  });

  it("all bands have positive size and quality", () => {
    for (const band of [BAND_LIGHT_CAVALRY, BAND_HEAVY_INFANTRY, BAND_SIEGE_ENGINEERS]) {
      expect(band.size).toBeGreaterThan(0);
      expect(band.quality_Q).toBeGreaterThan(0);
    }
  });
});

// ── createMercenaryBand ───────────────────────────────────────────────────────

describe("createMercenaryBand", () => {
  it("stores all fields", () => {
    const b = createMercenaryBand("b1", "Test", 300, q(0.70) as Q, 4);
    expect(b.bandId).toBe("b1");
    expect(b.name).toBe("Test");
    expect(b.size).toBe(300);
    expect(b.quality_Q).toBe(q(0.70));
    expect(b.dailyWagePerSoldier_cu).toBe(4);
  });

  it("clamps quality to [0, SCALE.Q]", () => {
    const hi = createMercenaryBand("b", "x", 100, 99999 as Q, 1);
    expect(hi.quality_Q).toBeLessThanOrEqual(SCALE.Q);
    const lo = createMercenaryBand("b", "x", 100, -1 as Q, 1);
    expect(lo.quality_Q).toBeGreaterThanOrEqual(0);
  });

  it("minimum size is 1", () => {
    const b = createMercenaryBand("b", "x", 0, q(0.50) as Q, 2);
    expect(b.size).toBe(1);
  });
});

// ── hireMercenaries ───────────────────────────────────────────────────────────

describe("hireMercenaries", () => {
  it("creates contract with given polityId and bandId", () => {
    const c = hireMercenaries("c1", "polity_a", BAND_LIGHT_CAVALRY);
    expect(c.contractId).toBe("c1");
    expect(c.polityId).toBe("polity_a");
    expect(c.bandId).toBe(BAND_LIGHT_CAVALRY.bandId);
  });

  it("starts with zero daysActive and zero arrears", () => {
    const c = makeContract();
    expect(c.daysActive).toBe(0);
    expect(c.arrears_cu).toBe(0);
  });

  it("uses default initial loyalty q(0.70) when unspecified", () => {
    const c = hireMercenaries("c1", "p", BAND_LIGHT_CAVALRY);
    expect(c.loyalty_Q).toBe(q(0.70));
  });

  it("accepts custom initial loyalty", () => {
    const c = hireMercenaries("c1", "p", BAND_LIGHT_CAVALRY, q(0.90) as Q);
    expect(c.loyalty_Q).toBe(q(0.90));
  });
});

// ── computeMercenaryWage ──────────────────────────────────────────────────────

describe("computeMercenaryWage", () => {
  it("wage = size × dailyWage × days", () => {
    const b = createMercenaryBand("b", "x", 500, q(0.70) as Q, 4);
    expect(computeMercenaryWage(b, 1)).toBe(2000);
    expect(computeMercenaryWage(b, 7)).toBe(14_000);
  });

  it("scales linearly with days", () => {
    expect(computeMercenaryWage(BAND_HEAVY_INFANTRY, 30))
      .toBe(computeMercenaryWage(BAND_HEAVY_INFANTRY, 1) * 30);
  });

  it("BAND_HEAVY_INFANTRY costs more per day than BAND_LIGHT_CAVALRY", () => {
    expect(computeMercenaryWage(BAND_HEAVY_INFANTRY, 1))
      .toBeGreaterThan(computeMercenaryWage(BAND_LIGHT_CAVALRY, 1));
  });
});

// ── computeMercenaryStrengthContribution ──────────────────────────────────────

describe("computeMercenaryStrengthContribution", () => {
  it("returns 0 at zero loyalty", () => {
    const c = makeContract(0 as Q);
    expect(computeMercenaryStrengthContribution(BAND_HEAVY_INFANTRY, c)).toBe(0);
  });

  it("higher loyalty = higher contribution", () => {
    const lo = makeContract(q(0.30) as Q);
    const hi = makeContract(q(0.90) as Q);
    expect(computeMercenaryStrengthContribution(BAND_HEAVY_INFANTRY, hi))
      .toBeGreaterThan(computeMercenaryStrengthContribution(BAND_HEAVY_INFANTRY, lo));
  });

  it("capped at MAX_MERC_STRENGTH_BONUS_Q", () => {
    const bigBand = createMercenaryBand("big", "x", 100_000, SCALE.Q as Q, 1);
    const c = hireMercenaries("c", "p", bigBand, SCALE.Q as Q);
    expect(computeMercenaryStrengthContribution(bigBand, c))
      .toBeLessThanOrEqual(MAX_MERC_STRENGTH_BONUS_Q);
  });

  it("BAND_HEAVY_INFANTRY contributes more than BAND_LIGHT_CAVALRY at same loyalty", () => {
    const loyalty = q(0.80) as Q;
    const cHeavy = hireMercenaries("c1", "p", BAND_HEAVY_INFANTRY, loyalty);
    const cLight = hireMercenaries("c2", "p", BAND_LIGHT_CAVALRY, loyalty);
    expect(computeMercenaryStrengthContribution(BAND_HEAVY_INFANTRY, cHeavy))
      .toBeGreaterThan(computeMercenaryStrengthContribution(BAND_LIGHT_CAVALRY, cLight));
  });

  it("result is always in [0, MAX_MERC_STRENGTH_BONUS_Q]", () => {
    const c = makeContract(q(0.80) as Q);
    const r = computeMercenaryStrengthContribution(BAND_HEAVY_INFANTRY, c);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(MAX_MERC_STRENGTH_BONUS_Q);
  });
});

// ── applyVictoryLoyaltyBonus ──────────────────────────────────────────────────

describe("applyVictoryLoyaltyBonus", () => {
  it("increases loyalty", () => {
    const c = makeContract(q(0.60) as Q);
    const before = c.loyalty_Q;
    applyVictoryLoyaltyBonus(c);
    expect(c.loyalty_Q).toBeGreaterThan(before);
  });

  it("loyalty never exceeds SCALE.Q", () => {
    const c = makeContract(SCALE.Q as Q);
    applyVictoryLoyaltyBonus(c);
    expect(c.loyalty_Q).toBeLessThanOrEqual(SCALE.Q);
  });

  it("applies LOYALTY_VICTORY_BONUS_Q at sub-max loyalty", () => {
    const c = makeContract(q(0.60) as Q);
    applyVictoryLoyaltyBonus(c);
    expect(c.loyalty_Q).toBe(q(0.60) + LOYALTY_VICTORY_BONUS_Q);
  });
});

// ── stepMercenaryContract ─────────────────────────────────────────────────────

describe("stepMercenaryContract — payment", () => {
  it("pays wages and deducts from treasury", () => {
    const polity   = makePolity(50_000);
    const contract = makeContract();
    const result   = stepMercenaryContract(contract, BAND_HEAVY_INFANTRY, polity, 1, 1, 1);
    const expected = computeMercenaryWage(BAND_HEAVY_INFANTRY, 1);
    expect(result.wagePaid_cu).toBe(expected);
    expect(polity.treasury_cu).toBe(50_000 - expected);
  });

  it("increments daysActive", () => {
    const polity   = makePolity();
    const contract = makeContract();
    stepMercenaryContract(contract, BAND_HEAVY_INFANTRY, polity, 7, 1, 1);
    expect(contract.daysActive).toBe(7);
  });

  it("when fully paid, loyalty grows", () => {
    const polity   = makePolity(1_000_000);
    const contract = makeContract(q(0.70) as Q);
    const before   = contract.loyalty_Q;
    stepMercenaryContract(contract, BAND_HEAVY_INFANTRY, polity, 1, 1, 1);
    expect(contract.loyalty_Q).toBeGreaterThanOrEqual(before);
  });

  it("when fully paid, no arrears added", () => {
    const polity   = makePolity(1_000_000);
    const contract = makeContract();
    const result   = stepMercenaryContract(contract, BAND_HEAVY_INFANTRY, polity, 1, 1, 1);
    expect(result.arrearsAdded_cu).toBe(0);
    expect(contract.arrears_cu).toBe(0);
  });
});

describe("stepMercenaryContract — arrears", () => {
  it("adds arrears when treasury is empty", () => {
    const polity   = makePolity(0);
    const contract = makeContract();
    const result   = stepMercenaryContract(contract, BAND_HEAVY_INFANTRY, polity, 1, 1, 1);
    const wageDue  = computeMercenaryWage(BAND_HEAVY_INFANTRY, 1);
    expect(result.arrearsAdded_cu).toBe(wageDue);
    expect(contract.arrears_cu).toBe(wageDue);
  });

  it("loyalty decays when in arrears", () => {
    const polity   = makePolity(0);
    const contract = makeContract(q(0.80) as Q);
    const before   = contract.loyalty_Q;
    stepMercenaryContract(contract, BAND_HEAVY_INFANTRY, polity, 1, 1, 1);
    expect(contract.loyalty_Q).toBeLessThan(before);
  });

  it("clears arrears when treasury recovers", () => {
    const polity   = makePolity(0);
    const contract = makeContract();
    stepMercenaryContract(contract, BAND_HEAVY_INFANTRY, polity, 1, 1, 1);
    expect(contract.arrears_cu).toBeGreaterThan(0);

    // Refill treasury
    const owed = contract.arrears_cu + computeMercenaryWage(BAND_HEAVY_INFANTRY, 1);
    polity.treasury_cu = owed + 1_000;
    stepMercenaryContract(contract, BAND_HEAVY_INFANTRY, polity, 1, 2, 2);
    expect(contract.arrears_cu).toBe(0);
  });

  it("loyalty clamped to 0 — never negative", () => {
    const polity   = makePolity(0);
    const contract = makeContract(5 as Q);   // very low loyalty
    for (let i = 0; i < 100; i++) {
      stepMercenaryContract(contract, BAND_HEAVY_INFANTRY, polity, 1, 1, i);
    }
    expect(contract.loyalty_Q).toBeGreaterThanOrEqual(0);
  });
});

describe("stepMercenaryContract — desertion", () => {
  it("does not desert when loyalty is above threshold", () => {
    const polity   = makePolity(1_000_000);
    const contract = makeContract(SCALE.Q as Q);
    for (let tick = 0; tick < 100; tick++) {
      const r = stepMercenaryContract(contract, BAND_HEAVY_INFANTRY, polity, 1, 42, tick);
      expect(r.deserted).toBe(false);
    }
  });

  it("eventually deserts when treasury runs out and loyalty collapses", () => {
    const polity   = makePolity(0);
    const contract = makeContract(q(0.60) as Q);
    let deserted   = false;
    for (let tick = 0; tick < 500 && !deserted; tick++) {
      const r = stepMercenaryContract(contract, BAND_HEAVY_INFANTRY, polity, 1, 1, tick);
      if (r.deserted) deserted = true;
    }
    expect(deserted).toBe(true);
  });

  it("sets loyalty to 0 on desertion", () => {
    const polity   = makePolity(0);
    const contract = makeContract(1 as Q);   // loyalty just 1/10000 — near zero
    let deserted   = false;
    for (let tick = 0; tick < 500 && !deserted; tick++) {
      const r = stepMercenaryContract(contract, BAND_HEAVY_INFANTRY, polity, 1, 42, tick);
      if (r.deserted) {
        deserted = true;
        expect(contract.loyalty_Q).toBe(0);
      }
    }
    expect(deserted).toBe(true);
  });

  it("is deterministic — same inputs produce same desertion outcome", () => {
    function runScenario() {
      const polity   = makePolity(0);
      const contract = makeContract(q(0.10) as Q);
      for (let tick = 0; tick < 50; tick++) {
        const r = stepMercenaryContract(contract, BAND_HEAVY_INFANTRY, polity, 1, 99, tick);
        if (r.deserted) return tick;
      }
      return -1;
    }
    expect(runScenario()).toBe(runScenario());
  });
});

// ── isMercenaryReliable / hasMercenaryArrears ──────────────────────────────────

describe("isMercenaryReliable", () => {
  it("true when loyalty is above threshold", () => {
    expect(isMercenaryReliable(makeContract(q(0.80) as Q))).toBe(true);
  });

  it("false when loyalty is below threshold", () => {
    expect(isMercenaryReliable(makeContract((DESERT_LOYALTY_THRESHOLD_Q - 1) as Q))).toBe(false);
    expect(isMercenaryReliable(makeContract(0 as Q))).toBe(false);
  });
});

describe("hasMercenaryArrears", () => {
  it("false when no arrears", () => {
    const c = makeContract();
    expect(hasMercenaryArrears(c)).toBe(false);
  });

  it("true when arrears > 0", () => {
    const c = makeContract();
    c.arrears_cu = 500;
    expect(hasMercenaryArrears(c)).toBe(true);
  });
});

// ── Integration ───────────────────────────────────────────────────────────────

describe("integration", () => {
  it("fully paid band retains loyalty and contributes strength over 30 days", () => {
    const polity   = makePolity(1_000_000);
    const contract = makeContract(q(0.70) as Q);
    for (let tick = 0; tick < 30; tick++) {
      const r = stepMercenaryContract(contract, BAND_HEAVY_INFANTRY, polity, 1, 1, tick);
      expect(r.deserted).toBe(false);
    }
    expect(isMercenaryReliable(contract)).toBe(true);
    expect(computeMercenaryStrengthContribution(BAND_HEAVY_INFANTRY, contract))
      .toBeGreaterThan(0);
  });

  it("victory bonus offsets some loyalty decay from partial payment", () => {
    const polity        = makePolity(10);   // barely enough to pay
    const contract      = makeContract(q(0.60) as Q);
    stepMercenaryContract(contract, BAND_HEAVY_INFANTRY, polity, 7, 1, 1);
    const afterDecay    = contract.loyalty_Q;

    applyVictoryLoyaltyBonus(contract);
    expect(contract.loyalty_Q).toBeGreaterThan(afterDecay);
  });

  it("unpaid band loses strength contribution over time", () => {
    const polity   = makePolity(0);
    const contract = makeContract(q(0.90) as Q);
    const initial  = computeMercenaryStrengthContribution(BAND_HEAVY_INFANTRY, contract);

    for (let tick = 0; tick < 30; tick++) {
      stepMercenaryContract(contract, BAND_HEAVY_INFANTRY, polity, 1, 1, tick);
      if (contract.loyalty_Q === 0) break;
    }
    const later = computeMercenaryStrengthContribution(BAND_HEAVY_INFANTRY, contract);
    expect(later).toBeLessThan(initial);
  });
});
